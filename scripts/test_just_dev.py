import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BUN = shutil.which("bun")
JUST = shutil.which("just")


@unittest.skipUnless(BUN and JUST and (ROOT / "node_modules/@tauri-apps/cli").exists(),
                     "Requires Just and installed Bun dependencies")
class JustDesktopDevTests(unittest.TestCase):
    def application_arguments(self, *arguments):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            capture = directory / "arguments.json"
            runner = directory / "runner"
            runner.write_text(f'''#!{sys.executable}
import json, os, sys
from pathlib import Path
Path(os.environ["GITLER_TEST_CAPTURE"]).write_text(json.dumps(sys.argv[1:]))
''')
            runner.chmod(0o755)
            bun = directory / "bun"
            # Keep the real Tauri argument parser; replace only its Cargo runner.
            bun.write_text('''#!/bin/sh
set -eu
shift 3
exec "$GITLER_TEST_BUN" run tauri dev --runner "$GITLER_TEST_RUNNER" \
    --no-watch --no-dev-server-wait \
    --config '{"build":{"beforeDevCommand":""}}' "$@"
''')
            bun.chmod(0o755)
            environment = dict(os.environ,
                               PATH=str(directory) + os.pathsep + os.environ["PATH"],
                               GITLER_TEST_BUN=BUN,
                               GITLER_TEST_RUNNER=str(runner),
                               GITLER_TEST_CAPTURE=str(capture))
            result = subprocess.run([JUST, "desktop-dev", *arguments], cwd=ROOT,
                                    env=environment, text=True, capture_output=True,
                                    timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            values = json.loads(capture.read_text())
            return values[values.index("--") + 1:]

    def test_without_path_preserves_default_launch(self):
        self.assertEqual(self.application_arguments(), [])

    def test_relative_path_is_passed_only_to_the_application(self):
        self.assertEqual(self.application_arguments("."), [str(ROOT.resolve())])

    def test_path_with_spaces_and_shell_characters_stays_one_argument(self):
        with tempfile.TemporaryDirectory(prefix="gitler 'repo' $(literal) ") as path:
            self.assertEqual(self.application_arguments(path), [str(Path(path).resolve())])


@unittest.skipUnless(JUST, "Requires Just")
class JustBrowserDevTests(unittest.TestCase):
    def browser_launch(self, *arguments):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            bun = directory / "bun"
            bun.write_text(f'''#!{sys.executable}
import json, os, sys
print(json.dumps({{"args": sys.argv[1:], "path": os.environ.get("GITLER_BROWSER_REPOSITORY")}}))
''')
            bun.chmod(0o755)
            environment = dict(os.environ, PATH=str(directory) + os.pathsep + os.environ["PATH"])
            return subprocess.run([JUST, "dev", *arguments], cwd=ROOT,
                                  env=environment, text=True, capture_output=True, timeout=10)

    def test_browser_mode_is_default_and_never_launches_tauri(self):
        for arguments in ([], ["."]):
            result = self.browser_launch(*arguments)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {
                "args": ["run", "dev:browser"], "path": str(ROOT.resolve())
            })

    def test_browser_preserves_special_characters_in_paths(self):
        with tempfile.TemporaryDirectory(prefix="gitler 'repo' $(literal) ") as path:
            result = self.browser_launch(path)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["path"], str(Path(path).resolve()))

    def test_invalid_directory_stops_before_starting_the_browser(self):
        result = self.browser_launch("/nonexistent/gitler-repository")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
