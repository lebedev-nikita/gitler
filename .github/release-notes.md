Gitler 0.5.2 hides T3 service checkpoints from repository history and includes the improvements from the 0.5.2 release candidates.

## Changes

- Exclude all `refs/t3/*` service refs from the commit graph and commit-hash search, regardless of checkpoint format. Keep the stored checkpoints available to T3 Code.
- Preserve real history and detached worktree commits when service checkpoints exceed the history page size.
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
