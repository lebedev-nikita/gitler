"""Create and publish a macOS Apple Silicon GitHub release."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def gh(*args):
    return subprocess.check_output(["gh", *args], text=True).strip()


def version(tag):
    package = json.loads(Path("package.json").read_text())
    tauri = json.loads(Path("src-tauri/tauri.conf.json").read_text())
    cargo = re.search(r'^version = "([^"]+)"', Path("src-tauri/Cargo.toml").read_text(), re.M)
    expected = package["version"]
    if tag != f"v{expected}" or tauri["version"] != expected or not cargo or cargo[1] != expected:
        raise SystemExit("Release tag, package.json, Tauri, and Cargo versions must agree")
    return expected


def release(tag):
    return json.loads(gh("release", "view", tag, "--json", "apiUrl,isDraft,assets,targetCommitish,url"))


def channel_flags(app_version):
    prerelease = "-" in app_version.split("+", 1)[0]
    return (
        f"--prerelease={str(prerelease).lower()}",
        f"--latest={str(not prerelease).lower()}",
    )


def prepare(tag):
    app_version = version(tag)
    # The tag must already exist; never create a release from an implicit branch head.
    gh("api", f"repos/{os.environ['GITHUB_REPOSITORY']}/git/ref/tags/{tag}")
    existing = subprocess.run(["gh", "release", "view", tag], capture_output=True)
    if existing.returncode:
        gh("release", "create", tag, "--verify-tag", "--draft", "--title", f"Gitler {tag[1:]}", "--notes-file", ".github/release-notes.md", *channel_flags(app_version))
    data = release(tag)
    if not data["isDraft"]:
        raise SystemExit("This version is already published; create a new version instead")
    # Resolve the draft directly: GitHub's release list may lag behind creation.
    # tauri-action expects the numeric REST ID, not a GraphQL node ID.
    numeric_id = data["apiUrl"].rsplit("/", 1)[-1]
    if not numeric_id.isdigit():
        raise SystemExit("GitHub returned an invalid release ID")
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"id={numeric_id}\ntag={tag}\n")


def publish(tag):
    app_version = version(tag)
    data = release(tag)
    if not data["isDraft"]:
        raise SystemExit("Release is already published")
    required = {f"Gitler_{app_version}_macos-arm64{suffix}" for suffix in (".dmg", ".app.tar.gz")}
    names = {asset["name"] for asset in data["assets"] if asset["size"] > 0}
    missing = required - names
    if missing:
        raise SystemExit(f"Missing Apple Silicon downloads: {', '.join(sorted(missing))}")
    unexpected = {asset["name"] for asset in data["assets"]} - required - {"SHA256SUMS.txt"}
    if unexpected:
        raise SystemExit(f"Unexpected release downloads: {', '.join(sorted(unexpected))}")
    with tempfile.TemporaryDirectory(prefix="gitler-release-") as directory:
        gh("release", "download", tag, "--dir", directory, "--pattern", "Gitler_*")
        lines = []
        for path in sorted(Path(directory).iterdir()):
            digest = hashlib.sha256()
            with path.open("rb") as artifact:
                for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                    digest.update(chunk)
            lines.append(f"{digest.hexdigest()}  {path.name}\n")
        checksums = Path(directory) / "SHA256SUMS.txt"
        checksums.write_text("".join(lines))
        gh("release", "upload", tag, str(checksums), "--clobber")
    gh("release", "edit", tag, "--draft=false", *channel_flags(app_version))
    print(release(tag)["url"])


def tap_cask(source, app_version, checksums):
    name = f"Gitler_{app_version}_macos-arm64.app.tar.gz"
    matches = re.findall(rf"^([0-9a-f]{{64}})  {re.escape(name)}$", checksums, re.M)
    if len(matches) != 1:
        raise SystemExit(f"Expected one SHA-256 checksum for {name}")
    # Migrate the existing dual-architecture cask, then accept the ARM-only layout
    # on subsequent releases. Keep its livecheck, app, and CLI installation intact.
    source, architectures = re.subn(r'^  arch arm: "arm64", intel: "x64"\n\n', '', source, flags=re.M)
    source, versions = re.subn(r'^  version "[^"\n]+"$', f'  version "{app_version}"', source, flags=re.M)
    source, digests = re.subn(
        r'^  sha256 ' + (r'arm: +"[0-9a-f]{64}",\n +intel: "[0-9a-f]{64}"' if architectures else r'"[0-9a-f]{64}"') + '$',
        f'  sha256 "{matches[0]}"',
        source,
        flags=re.M,
    )
    source, urls = re.subn(
        r'^(  url "https://github.com/[^/]+/gitler/releases/download/v#\{version\}/Gitler_#\{version\}_macos-)' + (r'#\{arch\}' if architectures else 'arm64') + r'(\.app\.tar\.gz")$',
        r'\g<1>arm64\2', source, flags=re.M,
    )
    if architectures:
        source, constraints = re.subn(r'^  depends_on :macos$', '  depends_on arch: :arm64\n  depends_on :macos', source, flags=re.M)
    else:
        constraints = len(re.findall(r'^  depends_on arch: :arm64$', source, re.M))
    if architectures > 1 or versions != 1 or digests != 1 or urls != 1 or constraints != 1:
        raise SystemExit("Unexpected version or architecture layout in Casks/gitler.rb")
    return source


def update_tap(tag, directory):
    app_version = version(tag)
    if release(tag)["isDraft"]:
        raise SystemExit("Publish the release before updating the Homebrew tap")
    with tempfile.TemporaryDirectory(prefix="gitler-tap-") as downloads:
        gh("release", "download", tag, "--dir", downloads, "--pattern", "SHA256SUMS.txt")
        checksums = (Path(downloads) / "SHA256SUMS.txt").read_text()
    cask = Path(directory) / "Casks/gitler.rb"
    source = cask.read_text()
    updated = tap_cask(source, app_version, checksums)
    if updated != source:
        cask.write_text(updated)
        subprocess.run([
            "git", "-C", str(directory),
            "-c", "user.name=github-actions[bot]",
            "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit", "--only", "-m", f"Update Gitler to {app_version}", "--", "Casks/gitler.rb",
        ], check=True)
    # Also retry a push that failed after the cask commit was created.
    subprocess.run(["git", "-C", str(directory), "push", "origin", "HEAD:main"], check=True)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "update-tap":
        update_tap(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] in {"prepare", "publish"}:
        {"prepare": prepare, "publish": publish}[sys.argv[1]](sys.argv[2])
    else:
        raise SystemExit("Usage: release.py prepare|publish VERSION_TAG | update-tap VERSION_TAG TAP_DIRECTORY")
