from pathlib import Path
import tempfile
import unittest

from trim_native_ci_cache import trim


class TrimCacheTests(unittest.TestCase):
    def test_keeps_active_libraries_and_tests_and_all_dependency_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tests = root / "src-tauri/tests"
            tests.mkdir(parents=True)
            (tests / "repositories.rs").touch()
            for target in ["release", "test-target/release"]:
                profile = root / "src-tauri/target" / target
                (profile / ".fingerprint/gitler-aaaaaaaaaaaaaaaa").mkdir(parents=True)
                deps = profile / "deps"
                deps.mkdir()
                keep = ["libgitler_lib-aaaaaaaaaaaaaaaa.rlib", "repositories-aaaaaaaaaaaaaaaa.exe",
                        "libtauri-bbbbbbbbbbbbbbbb.rlib", "gitler_metadata.json"]
                remove = ["libgitler_lib.lib", "libgitler_lib.dylib",
                          "libgitler_lib-bbbbbbbbbbbbbbbb.rlib", "repositories-bbbbbbbbbbbbbbbb.exe"]
                for name in keep + remove:
                    (deps / name).write_text("cached")
                (profile / "libgitler_lib.a").write_text("cached")
                trim(root)
                for name in keep:
                    self.assertTrue((deps / name).is_file(), name)
                for name in remove:
                    self.assertFalse((deps / name).exists(), name)
                self.assertFalse((profile / "libgitler_lib.a").exists())


if __name__ == "__main__":
    unittest.main()
