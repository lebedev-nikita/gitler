import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from native_ci_cache import prepare, source_key, SOURCE_MTIME


class NativeCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.source = self.write('src-tauri/src/lib.rs', 'pub fn value() -> u8 { 1 }')
        self.frontend = self.write('dist/index.html', 'first frontend')
        subprocess.run(['git', '-C', str(self.root), 'add', 'src-tauri'], check=True)
        self.own = self.write('src-tauri/target/release/.fingerprint/gitler-test/state', 'cached')
        self.dependency = self.write('src-tauri/target/release/.fingerprint/tauri-test/state', 'cached')

    def write(self, path, text):
        path = self.root / path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def test_first_prepare_invalidates_only_the_workspace_package(self):
        prepare(self.root)
        self.assertFalse(self.own.exists())
        self.assertEqual(self.dependency.read_text(), 'cached')
        self.assertEqual(self.source.stat().st_mtime, SOURCE_MTIME)
        self.assertEqual(self.frontend.stat().st_mtime, SOURCE_MTIME)
        self.assertEqual(self.frontend.parent.stat().st_mtime, SOURCE_MTIME)

    def test_identical_content_reuses_the_compiled_package_after_checkout(self):
        prepare(self.root)
        self.write('src-tauri/target/release/.fingerprint/gitler-test/state', 'compiled')
        os.utime(self.source, None)
        os.utime(self.frontend, None)
        prepare(self.root)
        self.assertEqual(self.own.read_text(), 'compiled')
        self.assertEqual(self.source.stat().st_mtime, SOURCE_MTIME)

    def test_source_changes_invalidate_even_with_an_old_timestamp(self):
        prepare(self.root)
        self.write('src-tauri/target/release/.fingerprint/gitler-test/state', 'compiled')
        self.source.write_text('pub fn value() -> u8 { 2 }')
        os.utime(self.source, (SOURCE_MTIME, SOURCE_MTIME))
        prepare(self.root)
        self.assertFalse(self.own.exists())
        self.assertTrue(self.dependency.exists())

    def test_frontend_additions_changes_and_deletions_change_the_key(self):
        first = source_key(self.root)
        asset = self.write('dist/assets/app.js', 'first asset')
        second = source_key(self.root)
        self.assertNotEqual(first, second)
        prepare(self.root)
        self.write('src-tauri/target/release/.fingerprint/gitler-test/state', 'compiled')
        asset.write_text('changed asset')
        prepare(self.root)
        self.assertFalse(self.own.exists())
        asset.unlink()
        self.assertEqual(source_key(self.root), first)

    def test_missing_frontend_cannot_reuse_a_native_cache(self):
        self.frontend.unlink()
        with self.assertRaises(FileNotFoundError):
            prepare(self.root)
        self.assertTrue(self.own.exists())


if __name__ == '__main__':
    unittest.main()
