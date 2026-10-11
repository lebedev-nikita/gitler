Gitler 0.4.2 opens repository history before scanning working copies.

## Changes

- Show the commit graph immediately after reading history and branches, then load working copy statuses in the background.
- Keep history usable if a working copy scan fails, and allow retrying with Refresh. Pending statuses are shown explicitly and block worktree deletion until checked.
- Detect merged branches through commit ancestry. Automatic matching of squash merges and GitHub rebase-and-merge commits has been removed.
- Show progress while opening repositories from the command line.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
