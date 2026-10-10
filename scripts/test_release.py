import contextlib
import io
import os
from pathlib import Path
from subprocess import CompletedProcess
import tempfile
import unittest
from unittest.mock import patch

import release


CASK = '''cask "gitler" do
  arch arm: "arm64", intel: "x64"

  version "0.2.1"
  sha256 arm:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
         intel: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

  url "https://github.com/lebedev-nikita/gitler/releases/download/v#{version}/Gitler_#{version}_macos-#{arch}.app.tar.gz"
  app "Gitler.app"
  binary "#{appdir}/Gitler.app/Contents/MacOS/gitler"
end
'''


def macos_checksums(app_version):
    return (
        f'{"1" * 64}  Gitler_{app_version}_macos-arm64.app.tar.gz\n'
        f'{"2" * 64}  Gitler_{app_version}_macos-x64.app.tar.gz\n'
        f'{"3" * 64}  Gitler_{app_version}_macos-arm64.dmg\n'
    )


class ReleaseTests(unittest.TestCase):
    def test_drafts_use_the_correct_release_channel_and_numeric_id(self):
        for app_version, prerelease, latest in [
            ("0.2.0-rc.1", "true", "false"),
            ("0.2.0", "false", "true"),
            ("0.2.0+build-1", "false", "true"),
        ]:
            with self.subTest(version=app_version), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "output"
                with patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo", "GITHUB_OUTPUT": str(output)}), \
                        patch.object(release, "version", return_value=app_version), \
                        patch.object(release.subprocess, "run", return_value=CompletedProcess([], 1)), \
                        patch.object(release, "release", return_value={"isDraft": True, "apiUrl": "https://api.github.com/repos/owner/repo/releases/123"}), \
                        patch.object(release, "gh") as gh:
                    tag = f"v{app_version}"
                    release.prepare(tag)
                create = next(call.args for call in gh.call_args_list if call.args[:2] == ("release", "create"))
                self.assertIn("--draft", create)
                self.assertIn("--verify-tag", create)
                self.assertIn(f"--prerelease={prerelease}", create)
                self.assertIn(f"--latest={latest}", create)
                self.assertEqual(output.read_text(), f"id=123\ntag={tag}\n")

    def test_complete_downloads_get_checksums_and_publish_to_the_correct_channel(self):
        for app_version, prerelease, latest in [("0.2.0-rc.1", "true", "false"), ("0.2.0", "false", "true")]:
            with self.subTest(version=app_version):
                suffixes = {
                    "macos-arm64": [".dmg", ".app.tar.gz"],
                    "macos-x64": [".dmg", ".app.tar.gz"],
                    "windows-x64": [".exe", ".msi"],
                    "windows-arm64": [".exe"],
                    "linux-x64": [".AppImage", ".deb", ".rpm"],
                    "linux-arm64": [".AppImage", ".deb", ".rpm"],
                }
                names = [f"Gitler_{app_version}_{platform}{suffix}" for platform, formats in suffixes.items() for suffix in formats]
                data = {"isDraft": True, "url": "https://github.com/owner/repo/releases/test", "assets": [{"name": name, "size": 1} for name in names]}
                checksums = []

                def gh(*args):
                    if args[:2] == ("release", "download"):
                        for name in names:
                            (Path(args[args.index("--dir") + 1]) / name).write_bytes(b"x")
                    elif args[:2] == ("release", "upload"):
                        checksums.extend(Path(args[3]).read_text().splitlines())
                    return ""

                with patch.object(release, "version", return_value=app_version), \
                        patch.object(release, "release", return_value=data), \
                        patch.object(release, "gh", side_effect=gh) as calls, \
                        contextlib.redirect_stdout(io.StringIO()):
                    release.publish(f"v{app_version}")
                self.assertEqual(len(checksums), 13)
                self.assertEqual({line.split("  ")[1] for line in checksums}, set(names))
                self.assertTrue(all(line.startswith("2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881  ") for line in checksums))
                calls.assert_called_with("release", "edit", f"v{app_version}", "--draft=false", f"--prerelease={prerelease}", f"--latest={latest}")

    def test_incomplete_downloads_cannot_be_published(self):
        with patch.object(release, "version", return_value="0.2.0-rc.1"), \
                patch.object(release, "release", return_value={"isDraft": True, "assets": []}), \
                patch.object(release, "gh") as gh:
            with self.assertRaisesRegex(SystemExit, "Missing platform downloads"):
                release.publish("v0.2.0-rc.1")
            gh.assert_not_called()


class TapTests(unittest.TestCase):
    def test_updates_only_version_and_architecture_archive_hashes(self):
        for app_version in ("0.2.2", "0.3.0-rc.1", "0.3.0+build-1"):
            with self.subTest(version=app_version):
                expected = CASK.replace('version "0.2.1"', f'version "{app_version}"')
                expected = expected.replace("a" * 64, "1" * 64).replace("b" * 64, "2" * 64)
                self.assertEqual(release.tap_cask(CASK, app_version, macos_checksums(app_version)), expected)

    def test_missing_duplicate_or_invalid_checksums_are_rejected(self):
        valid = macos_checksums("0.2.2")
        for checksums in (
            "", valid.splitlines()[0], valid + valid.splitlines()[0] + "\n",
            valid.replace("1" * 64, "not-a-sha256"), macos_checksums("0.2.1"),
        ):
            with self.subTest(checksums=checksums), self.assertRaisesRegex(SystemExit, "Expected one SHA-256"):
                release.tap_cask(CASK, "0.2.2", checksums)

    def test_unexpected_cask_layout_is_rejected(self):
        for source in (CASK.replace('  version "0.2.1"\n', ""), CASK + CASK, CASK.replace("intel:", "x64:")):
            with self.subTest(source=source), self.assertRaisesRegex(SystemExit, "Unexpected version or architecture"):
                release.tap_cask(source, "0.2.2", macos_checksums("0.2.2"))

    def test_draft_release_cannot_update_tap(self):
        with patch.object(release, "version", return_value="0.2.2"), \
                patch.object(release, "release", return_value={"isDraft": True}), \
                patch.object(release, "gh") as gh, \
                patch.object(release.subprocess, "run") as run:
            with self.assertRaisesRegex(SystemExit, "Publish the release"):
                release.update_tap("v0.2.2", "unused")
            gh.assert_not_called()
            run.assert_not_called()

    def test_commits_only_cask_pushes_and_can_retry_a_failed_push(self):
        def git(*args):
            return release.subprocess.check_output(["git", *map(str, args)], text=True, stderr=release.subprocess.STDOUT).strip()

        with tempfile.TemporaryDirectory() as directory:
            remote = Path(directory) / "remote.git"
            tap = Path(directory) / "tap"
            git("init", "--bare", "--initial-branch=main", remote)
            git("clone", remote, tap)
            git("-C", tap, "config", "user.name", "Test")
            git("-C", tap, "config", "user.email", "test@example.com")
            (tap / "Casks").mkdir()
            cask = tap / "Casks/gitler.rb"
            cask.write_text(CASK)
            git("-C", tap, "add", "Casks/gitler.rb")
            git("-C", tap, "commit", "-m", "Initial cask")
            git("-C", tap, "push", "origin", "HEAD:main")
            (tap / "unrelated.txt").write_text("Keep this staged\n")
            git("-C", tap, "add", "unrelated.txt")

            def download(*args):
                self.assertEqual(args[:3], ("release", "download", "v0.2.2"))
                self.assertEqual(args[-2:], ("--pattern", "SHA256SUMS.txt"))
                (Path(args[args.index("--dir") + 1]) / "SHA256SUMS.txt").write_text(macos_checksums("0.2.2"))

            run = release.subprocess.run

            def fail_push(args, **kwargs):
                if "push" in args:
                    raise release.subprocess.CalledProcessError(1, args)
                return run(args, **kwargs, capture_output=True)

            with patch.object(release, "version", return_value="0.2.2"), \
                    patch.object(release, "release", return_value={"isDraft": False}), \
                    patch.object(release, "gh", side_effect=download):
                with patch.object(release.subprocess, "run", side_effect=fail_push):
                    with self.assertRaises(release.subprocess.CalledProcessError):
                        release.update_tap("v0.2.2", tap)
                committed = git("-C", tap, "rev-parse", "HEAD")
                self.assertNotEqual(git("--git-dir", remote, "rev-parse", "main"), committed)
                release.update_tap("v0.2.2", tap)
                release.update_tap("v0.2.2", tap)

            self.assertEqual(git("--git-dir", remote, "rev-parse", "main"), committed)
            self.assertEqual(git("-C", tap, "rev-list", "--count", "HEAD"), "2")
            self.assertEqual(git("-C", tap, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), "Casks/gitler.rb")
            self.assertEqual(git("-C", tap, "diff", "--cached", "--name-only"), "unrelated.txt")
            self.assertEqual(git("--git-dir", remote, "show", "main:Casks/gitler.rb"), release.tap_cask(CASK, "0.2.2", macos_checksums("0.2.2")).strip())


if __name__ == "__main__":
    unittest.main()
