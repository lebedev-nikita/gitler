Gitler 0.5.3 supports creating threads in both T3 Code Alpha and Nightly.

## Changes

- Support orchestration protocols 1 and 2, including Nightly's WebSocket API for thread creation.
- Respect built-in provider defaults and project-specific provider enablement when choosing the thread model.
- Open the matching T3 Code application after creating a thread.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
