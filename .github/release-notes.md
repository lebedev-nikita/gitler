Gitler 0.5.1 removes extra confirmations when creating a T3 Code thread.

## Changes

- Choose **Create T3 Code thread** in a local branch context menu to start immediately.
- Show a compact progress dialog while connecting and creating the thread. On success, open T3 Code and close the dialog automatically, without a success confirmation.
- Keep errors and installation guidance visible. If opening T3 Code fails after creation, show the created thread’s reference for manual recovery.
- Prevent duplicate creation during React effect replay and close progress without waiting for the graph to refresh.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
