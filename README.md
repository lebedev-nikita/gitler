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
- Suggests local branch names with your installed Codex CLI, then lets you review and apply the rename.
- Discards selected staged, unstaged, and untracked files in a chosen working copy after confirmation.
- Filters and searches loaded history; loads older commits on demand.
- Opens different repositories in separate windows, with at most one window per
  repository, including all of its worktrees.

The interface keeps the graph and a right-hand diff panel. Branches live in graph
labels; filters appear only when you open **Filters**. To inspect or compare a
commit outside the loaded history, enter its hash in search and press Enter. It
stays in the graph for selection and right-click comparisons.

Right-click a local branch label, its tip commit, or an uncommitted node to rename
the branch with Codex or discard its working changes. Renaming requires a current
[Codex CLI](https://developers.openai.com/codex/cli) installation and `codex login`;
Gitler detects common installation paths and accepts an explicit executable path.
The selected branch's commits and working diffs are sent to Codex for generation.
The suggested name is editable before applying a local rename; remote names are unchanged.

Discarding restores selected files to HEAD in both the index and working copy.
Selected untracked and newly added files are deleted permanently. Gitler verifies
that the reviewed files and HEAD have not changed; submodules and nested repositories
must be handled separately. Other Git mutations remain outside the application's scope.

## Download

Install on macOS (Intel or Apple Silicon) with Homebrew:

```sh
brew install --cask jeff-business/tap/gitler
gitler /path/to/repository
```

The [Homebrew tap](https://github.com/jeff-business/homebrew-tap) installs the app,
the `gitler` command, and Git. It tracks the newest published version, including
release candidates. Upgrade with `brew update && brew upgrade --cask gitler`.

Download other installers from [GitHub Releases](https://github.com/jeff-business/gitler/releases/latest).
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
accepts `gitler /path/to/repository` or `gitler /path/to/worktree`. Each repository
opens in its own window, and the command returns immediately while the app keeps
running. Development launches stay attached to the terminal for logs and Ctrl+C.
Opening an already open repository or any of its worktrees brings that window to
the front and preserves your selection.

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

Pushes to `main` and pull requests test and package every platform without
publishing. To measure the full build with a warmed cache, run
`gh workflow run release.yml --ref main -f check_budget=true`; it fails if packaging
takes more than three minutes. Releases check this limit automatically, including
publication. Leave `publish` disabled for manual build checks.
