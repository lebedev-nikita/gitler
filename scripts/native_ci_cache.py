"""Reuse native CI outputs by content, rather than checkout timestamps."""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys


SOURCE_MTIME = 1234567890


def input_files(root: Path):
    if not (root / "dist/index.html").is_file():
        raise FileNotFoundError("Build or download the frontend before preparing the native cache")
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "src-tauri"], cwd=root
    )
    files = [root / path.decode("utf-8") for path in tracked.split(b"\0") if path]
    files.extend(path for path in (root / "dist").rglob("*") if path.is_file())
    helper = root / "scripts/native_ci_cache.py"
    if helper.exists():
        files.append(helper)
    return sorted(path for path in files if path.is_file())


def content_key(root: Path, files):
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def source_key(root: Path):
    return content_key(root, input_files(root))


def prepare(root: Path):
    files = input_files(root)
    key = content_key(root, files)
    marker = root / "src-tauri/target/release/ci-source-key"
    reused = marker.is_file() and marker.read_text().strip() == key
    if not reused:
        # Dependency caches may come from another source revision. Explicitly
        # invalidate our package before making source timestamps reproducible,
        # including when changed files have an older timestamp than the cache.
        for fingerprint in (root / "src-tauri/target").glob("**/.fingerprint/gitler-*"):
            shutil.rmtree(fingerprint)
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(key + "\n")

    directories = set()
    for path in files:
        if path == root / "scripts/native_ci_cache.py":
            continue
        os.utime(path, (SOURCE_MTIME, SOURCE_MTIME), follow_symlinks=False)
        parent = path.parent
        while parent != root:
            directories.add(parent)
            parent = parent.parent
    for directory in sorted(directories, key=lambda path: len(path.parts), reverse=True):
        os.utime(directory, (SOURCE_MTIME, SOURCE_MTIME), follow_symlinks=False)
    return reused


if __name__ == "__main__":
    root = Path.cwd()
    if sys.argv[1] == "key":
        output = f"key={source_key(root)}\n"
        print(output, end="")
        if path := os.environ.get("GITHUB_OUTPUT"):
            with Path(path).open("a") as file:
                file.write(output)
    elif sys.argv[1] == "prepare":
        print("Native source cache: " + ("unchanged" if prepare(root) else "rebuilding Gitler"))
    else:
        raise SystemExit("Expected key or prepare")
