Gitler 0.3.3 adds safe cleanup of merged branches and their linked worktrees.

## Changes

- Delete a merged local branch and its linked worktrees from the context menu, after reviewing the branch, merge target, and worktree paths.
- Verify merge safety against the local default branch using the full Git history, and recheck the confirmation before deletion.
- Protect main branches, the main worktree, and worktrees containing changed, untracked, or ignored files. Locked, missing, or foreign worktrees cannot be removed.
- Refresh the graph and reset the branch filter after deletion.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
