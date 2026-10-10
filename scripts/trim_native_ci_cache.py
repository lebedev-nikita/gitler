"""Remove obsolete Gitler outputs without discarding compiled dependencies."""

from pathlib import Path
import re


def trim(root: Path):
    names = {"libgitler_lib", "gitler_lib", "gitler"}
    names.update(path.stem.replace("-", "_") for path in (root / "src-tauri/tests").glob("*.rs"))
    own_output = re.compile(
        "^(?:" + "|".join(re.escape(name) for name in sorted(names))
        + r")(?:-([0-9a-f]{16}))?(?:\..*)?$"
    )
    target = root / "src-tauri/target"
    removed = 0
    for profile in [target / "release", *target.glob("*/release")]:
        active = {path.name.removeprefix("gitler-")
                  for path in (profile / ".fingerprint").glob("gitler-*")}
        candidates = list((profile / "deps").glob("*"))
        candidates.extend(profile.glob("libgitler_lib.*"))
        candidates.extend(profile.glob("gitler_lib.*"))
        for path in candidates:
            if not path.is_file() or not (match := own_output.fullmatch(path.name)):
                continue
            if match.group(1) in active:
                continue
            removed += path.stat().st_size
            path.unlink()
    return removed


if __name__ == "__main__":
    print(f"Removed {trim(Path.cwd()) / 1024 / 1024:.1f} MiB of obsolete native outputs")
