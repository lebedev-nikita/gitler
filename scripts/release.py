"""Create and publish a complete multi-platform GitHub release."""

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


def prepare(tag):
    version(tag)
    # The tag must already exist; never create a release from an implicit branch head.
    gh("api", f"repos/{os.environ['GITHUB_REPOSITORY']}/git/ref/tags/{tag}")
    existing = subprocess.run(["gh", "release", "view", tag], capture_output=True)
    if existing.returncode:
        gh("release", "create", tag, "--verify-tag", "--draft", "--title", f"Gitler {tag[1:]}", "--notes-file", ".github/release-notes.md")
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
    expected = {
        "macos-arm64": [".dmg", ".app.tar.gz"],
        "macos-x64": [".dmg", ".app.tar.gz"],
        "windows-x64": [".exe", ".msi"],
        "windows-arm64": [".exe"],
        "linux-x64": [".AppImage", ".deb", ".rpm"],
        "linux-arm64": [".AppImage", ".deb", ".rpm"],
    }
    names = {asset["name"] for asset in data["assets"] if asset["size"] > 0}
    required = {f"Gitler_{app_version}_{platform}{suffix}" for platform, suffixes in expected.items() for suffix in suffixes}
    missing = required - names
    if missing:
        raise SystemExit(f"Missing platform downloads: {', '.join(sorted(missing))}")
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
    gh("release", "edit", tag, "--draft=false", "--latest")
    print(release(tag)["url"])


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in {"prepare", "publish"}:
        raise SystemExit("Usage: release.py prepare|publish VERSION_TAG")
    {"prepare": prepare, "publish": publish}[sys.argv[1]](sys.argv[2])
