"""Install independent native prerequisites while restoring the build cache."""

import os
from pathlib import Path
import subprocess
import sys
import time
import traceback


def state_dir():
    path = Path(os.environ["RUNNER_TEMP"]) / "gitler-native-setup"
    path.mkdir(parents=True, exist_ok=True)
    return path


def start(name, arguments):
    state = state_dir()
    (state / f"{name}.exit").unlink(missing_ok=True)
    options = (
        {"creationflags": subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
        if os.name == "nt" else {"start_new_session": True}
    )
    with (state / f"{name}.log").open("wb") as log:
        return subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "worker", name, *arguments],
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, **options,
        )


def wait(name):
    state = state_dir()
    result = state / f"{name}.exit"
    deadline = time.monotonic() + 600
    while not result.is_file():
        if time.monotonic() >= deadline:
            print((state / f"{name}.log").read_text(errors="replace"))
            raise TimeoutError(f"Native prerequisite setup did not finish: {name}")
        time.sleep(0.2)
    print((state / f"{name}.log").read_text(errors="replace"))
    return int(result.read_text())


def worker(name, arguments):
    code = 1
    try:
        if name == "rust":
            commands = [[
                "rustup", "toolchain", "install", "1.99.0", "--profile", "minimal",
                "--no-self-update", "--target", arguments[0],
            ]]
        elif name == "linux":
            archives = Path(os.environ["RUNNER_TEMP"]) / "gitler-apt-archives"
            archives.mkdir(parents=True, exist_ok=True)
            commands = [
                ["sudo", "apt-get", "update"],
                ["sudo", "apt-get", "-o", f"Dir::Cache::archives={archives}",
                 "-o", "APT::Keep-Downloaded-Packages=true", "install", "-y", "--no-install-recommends",
                 "libwebkit2gtk-4.1-dev", "build-essential", "libssl-dev", "libgtk-3-dev",
                 "libayatana-appindicator3-dev", "librsvg2-dev", "patchelf", "libfuse2", "rpm"],
            ]
        else:
            raise ValueError(f"Unknown prerequisite: {name}")
        for command in commands:
            print("Running: " + " ".join(command), flush=True)
            subprocess.run(command, check=True)
        code = 0
    except subprocess.CalledProcessError as error:
        code = error.returncode or 1
    except Exception:
        traceback.print_exc()
    finally:
        state = state_dir()
        temporary = state / f"{name}.exit.tmp"
        temporary.write_text(str(code))
        temporary.replace(state / f"{name}.exit")
    return code


if __name__ == "__main__":
    if sys.argv[1] == "worker":
        raise SystemExit(worker(sys.argv[2], sys.argv[3:]))
    if sys.argv[1] == "start":
        start("rust", [sys.argv[2]])
        if sys.platform == "linux":
            start("linux", [])
        print("Native prerequisites started; cache restoration can run concurrently")
    elif sys.argv[1] == "wait":
        for name in (["rust", "linux"] if sys.platform == "linux" else ["rust"]):
            if code := wait(name):
                raise SystemExit(code)
    else:
        raise SystemExit("Expected start or wait")
