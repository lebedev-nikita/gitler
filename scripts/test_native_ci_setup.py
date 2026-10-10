import contextlib
import io
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from native_ci_setup import start, state_dir, wait


class NativeSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        mock = self.root / "rustup"
        mock.write_text('''#!/bin/sh
echo prerequisite-log
touch "$RUNNER_TEMP/started"
while [ ! -f "$RUNNER_TEMP/continue" ]; do sleep 0.01; done
exit "$(cat "$RUNNER_TEMP/result")"
''')
        mock.chmod(0o755)
        environment = patch.dict(os.environ, {
            "RUNNER_TEMP": str(self.root),
            "PATH": str(self.root) + os.pathsep + os.environ["PATH"],
        })
        environment.start()
        self.addCleanup(environment.stop)

    def begin(self, code):
        (self.root / "result").write_text(str(code))
        process = start("rust", ["test-target"])
        self.addCleanup(lambda: (self.root / "continue").touch())
        deadline = time.monotonic() + 5
        while not (self.root / "started").is_file():
            if time.monotonic() >= deadline:
                process.kill()
                process.wait()
                self.fail("Background prerequisite did not start")
            time.sleep(0.01)
        return process

    def test_setup_runs_independently_and_wait_requires_completion(self):
        process = self.begin(0)
        self.assertIsNone(process.poll())
        self.assertFalse((state_dir() / "rust.exit").exists())
        (self.root / "continue").touch()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(wait("rust"), 0)
        self.assertEqual(process.wait(timeout=5), 0)
        self.assertIn("prerequisite-log", output.getvalue())

    def test_failed_setup_retains_logs_and_blocks_the_build(self):
        process = self.begin(7)
        (self.root / "continue").touch()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(wait("rust"), 7)
        self.assertEqual(process.wait(timeout=5), 7)
        self.assertIn("prerequisite-log", output.getvalue())


if __name__ == "__main__":
    unittest.main()
