default:
    @just --list

install:
    bun install --frozen-lockfile

# Open a real repository in the browser, without launching the desktop app.
dev $repository=".":
    #!/usr/bin/env sh
    set -eu
    local_repository_path=$(cd "$repository" && pwd -P)
    export GITLER_BROWSER_REPOSITORY="$local_repository_path"
    exec bun run dev:browser

# Run the desktop app, optionally opening a repository or worktree.
desktop-dev $repository="":
    #!/usr/bin/env sh
    set -eu
    if [ -n "$repository" ]; then
        local_repository_path=$(cd "$repository" && pwd -P)
        exec bun run tauri dev -- -- "$local_repository_path"
    fi
    exec bun run tauri dev

web:
    bun run dev

build:
    bun run tauri build

# Install dependencies, run checks, build, and open the local macOS app.
[macos]
local-check $repository=".": install check build
    #!/usr/bin/env sh
    set -eu
    local_repository_path=$(cd "$repository" && pwd -P)
    open -n src-tauri/target/release/bundle/macos/Gitler.app --args "$local_repository_path"

typecheck:
    bunx tsc --noEmit

lint:
    bunx oxlint src scripts
    bun run lint:css

format:
    bunx oxfmt .
    cargo fmt --manifest-path src-tauri/Cargo.toml

format-check:
    bunx oxfmt --check .
    cargo fmt --manifest-path src-tauri/Cargo.toml --check

test:
    bun run test
    cargo test --manifest-path src-tauri/Cargo.toml
    python3 -m unittest discover -s scripts -p 'test_*.py'

test-ui:
    bunx playwright test

check: typecheck lint format-check test
