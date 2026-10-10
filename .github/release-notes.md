Gitler 0.4.1 fixes the window title bar background.

## Changes

- Match the native title bar to the toolbar's charcoal background in every repository window.
- Check the native background against the toolbar's CSS color during tests and production builds, preventing palette changes from leaving the title bar behind.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
