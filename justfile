default:
    @just --list

install:
    bun install --frozen-lockfile

dev:
    bun run tauri dev

web:
    bun run dev

build:
    bun run tauri build

typecheck:
    bunx tsc --noEmit

lint:
    bunx oxlint src scripts

format:
    bunx oxfmt .
    cargo fmt --manifest-path src-tauri/Cargo.toml

format-check:
    bunx oxfmt --check .
    cargo fmt --manifest-path src-tauri/Cargo.toml --check

test:
    bun run test
    cargo test --manifest-path src-tauri/Cargo.toml

test-ui:
    bunx playwright test

check: typecheck lint format-check test
