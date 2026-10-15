<img src="assets/icons/base.png" width="48" height="48" alt="Gitler">

# Gitler

A desktop Git graph for developers working with many agents and worktrees.
Inspect history, branches, tags, stashes, and uncommitted changes across every
registered worktree without switching branches. Supports macOS with Apple Silicon.

## Installation

### Homebrew

Install [Homebrew](https://brew.sh) if needed, then run:

```sh
brew install --cask jeff-business/tap/gitler
```

The [tap](https://github.com/jeff-business/homebrew-tap) installs `Gitler.app` in
`/Applications`, the `gitler` command, and Git. Open the app from Applications or
pass a repository or worktree path:

```sh
gitler /path/to/repository
```

To update:

```sh
brew update
brew upgrade --cask jeff-business/tap/gitler
```

The tap tracks the newest published version, including release candidates.

### Direct download

Download the DMG or app archive from
[GitHub Releases](https://github.com/lebedev-nikita/gitler/releases/latest).
Git must be installed and available on PATH. Downloads include `SHA256SUMS.txt`.
The app uses ad-hoc signing and is not notarized.

## Using Gitler

Open any folder inside a repository with **Open repository** or the CLI. All of its
worktrees share one window; different repositories open in separate windows.
Amber nodes show uncommitted work. T3 service refs under `refs/t3/*` are hidden.

Select a node to inspect its files and diff. To compare, select one node,
right-click another, and choose **Diff with selected**. Use search and **Filters**
to narrow the graph; enter a commit hash and press Enter to inspect a commit outside
the loaded history. The graph and diff panels can be resized or hidden, and their
layout is remembered.

**Merged into main** labels reflect commit ancestry. Squash merges and rewritten
commits are not recognized as merged automatically.

Remote branches update when you open a repository and every minute afterward.
**Refresh** updates them immediately; the footer shows update status and retry
options. Gitler uses your existing Git credentials, so authenticate outside the app
for private remotes. Fetching preserves local branches, tags, indexes, and working
files. Offline use keeps the last fetched history available.

### Branch actions

Right-click a local branch label or its graph node:

- **Pull** fast-forwards from the configured upstream. The working copy must be
  clean; diverged history requires a manual merge or rebase. Branches without
  worktrees update without being checked out. Ignored files and other worktrees
  are preserved.
- **Rename branch…** changes the local name. Remote branch names stay unchanged.
- **Discard uncommitted changes…** lets you select files and confirm. It restores
  tracked files to HEAD in the index and working copy, and permanently deletes
  selected untracked or newly added files. Handle submodules and nested repositories
  separately.
- **Delete branch…** or **Delete branch and worktree…** requires confirmation and a
  merge into the local default branch. Linked worktrees must have no changed,
  untracked, or ignored files. Main branches and the main worktree are protected;
  selected worktree directories are removed permanently.

### Optional integrations

**AI branch names:** **Generate with AI** in the rename dialog requires
[Codex CLI](https://developers.openai.com/codex/cli) and `codex login`. The selected
branch's commits and working diffs are sent to Codex; review the suggestion before
renaming. Manual renaming works without Codex.

**T3 Code threads:** **Create T3 Code thread** starts an empty thread using the
project's model and permissions. [T3 Code](https://github.com/pingdotgg/t3code#installation)
must be running with the repository added as a project and support orchestration
protocol 1. No additional CLI is needed. Gitler reuses the branch's registered
worktree or creates one on that existing branch. Created worktrees remain if the
request fails; check T3 Code before retrying. If opening T3 Code fails after
creation, the dialog retains the thread reference for recovery.

## Development

Built with Tauri, React, TypeScript, shadcn/ui, and Effect. Install
[Bun](https://bun.sh), [Rust](https://rustup.rs), [Just](https://just.systems), Git,
and the [Tauri macOS prerequisites](https://v2.tauri.app/start/prerequisites/#macos).

```sh
just install
just desktop-dev /path/to/repository
```

For browser development against a real repository, use `just dev /path/to/repository`.
`just web` opens the demo-data preview. See [justfile](justfile) for all commands.

Before submitting changes, run `just check`; run `just test-ui` for interface changes.
`just build` packages the desktop app. `just local-check /path/to/repository`
installs dependencies, checks, builds, and opens the local macOS app.

Git inspection lives in [src-tauri/src/git.rs](src-tauri/src/git.rs), and the React
interface is in [src](src). See [PRODUCT.md](PRODUCT.md) for product scope,
[DESIGN.md](DESIGN.md) for interface design, and [AGENTS.md](AGENTS.md) for contributor
constraints.

## Releases

Version tags such as `v0.5.2` trigger the [release workflow](.github/workflows/release.yml).
Keep the tag and versions in `package.json`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` aligned, and update
[release notes](.github/release-notes.md) before tagging. Pushes to `main` and pull
requests run checks and package the app without publishing.

Releases publish a DMG, app archive, and checksums, then update the Homebrew tap.
The `HOMEBREW_TAP_TOKEN` Actions secret needs `Contents: Read and write` access to
`jeff-business/homebrew-tap`. If the tap update fails after publication, retry it
with [scripts/release.py](scripts/release.py) using an account with tap access:

```sh
python3 scripts/release.py update-tap VERSION_TAG /path/to/homebrew-tap
```

Run that command from a checkout of the released version. The workflow also checks
a three-minute pipeline budget; to measure a warmed build without publishing, run:

```sh
gh workflow run release.yml --ref main -f check_budget=true
```
