<img src="assets/icon.svg" width="48" height="48" alt="Gitler">

# Gitler

A desktop Git graph for developers working with many agents and worktrees. Open any
folder in a repository and see its entire history, branches, tags, stashes, and
uncommitted work across every registered worktree. Built with Tauri, React,
TypeScript, and shadcn/ui.

## What it does

- Shows uncommitted changes as amber graph nodes attached to each worktree's HEAD.
- Surfaces detached, locked, and unavailable working copies in repository metadata.
- Inspects staged, unstaged, and untracked files without switching branches.
- Compares two commits or a commit and a worktree's current files: select one node,
  right-click another, and choose **Diff with selected**. The diff opens on the right.
- Filters and searches loaded history; loads older commits on demand.

The interface keeps the graph and a right-hand diff panel. Branches live in graph
labels; filters appear only when you open **Filters**. To inspect or compare a
commit outside the loaded history, enter its hash in search and press Enter. It
stays in the graph for selection and right-click comparisons.

This initial version is read-only. Git mutations such as checkout, commit, reset,
merge, push, and stash apply are intentionally outside its scope. Git Graph is the
functional reference; this is not a complete replacement for all of its actions.

## Download

Download installers from [GitHub Releases](https://github.com/lebedev-nikita/gitler/releases/latest).
macOS (Intel and Apple Silicon), Windows (x64 and ARM64), and Linux (x64 and ARM64)
are supported. Git must be installed and available on PATH. The initial releases
use ad-hoc signing on macOS and no commercial signing certificate on Windows.

## Run

Install [Bun](https://bun.sh), [Rust](https://rustup.rs), Git, and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
bun install --frozen-lockfile
bun run tauri dev
```

Choose **Open repository**, or pass a repository or worktree path from your terminal:

```sh
bun run tauri dev -- /path/to/any/worktree
```

Build the desktop application with `bun run tauri build`. The compiled executable
accepts `gitler /path/to/repository` or `gitler /path/to/worktree`. Launching it
again opens the requested repository in the existing window.

For a local release build, run `src-tauri/target/release/gitler .` from this
project, or put that executable on your PATH to use `gitler` from any folder.

`bun run dev` opens a browser preview with explicitly labeled demo data. Real local
repositories are available only in the desktop application.

## Development

Common commands are in `justfile`: `just dev`, `just build`, and `just check`.
Git inspection lives in `src-tauri/src/git.rs`; the React interface is in `src/`.

Version tags such as `v0.1.0` trigger the desktop release workflow. It tests and
builds all six platform variants, attaches installers and SHA-256 checksums to a
draft release, and publishes only after every platform succeeds.
