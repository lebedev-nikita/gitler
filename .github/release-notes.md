Gitler 0.5.2-rc.4 adds **Pull** to the local branch context menu.

## Changes

- Right-click a local branch label, its tip commit, or its uncommitted node and choose **Pull**.
- Fetch the configured upstream and fast-forward the selected branch and its registered worktree. Branches without a worktree update without checking them out.
- Show progress and actionable errors, then refresh the graph.
- Require a clean working copy and reject stale HEADs, changed worktrees, and diverged history. Preserve ignored files, tags, and other branches and worktrees.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
