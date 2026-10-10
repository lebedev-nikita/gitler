import contextlib
import io
import os
from pathlib import Path
from subprocess import CompletedProcess
import tempfile
import unittest
from unittest.mock import patch

import release


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


if __name__ == "__main__":
    unittest.main()
