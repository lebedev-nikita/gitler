Gitler 0.5.2-rc.1 adds a close button to the file preview panel.

## Changes

- Close the lower diff or media preview with the **×** button at the top right of its header.
- Keep commit details, the changed-file list, and the selected file when closing the preview.
- Reopen the preview with **Show diff preview** beside **Changed files**. The hidden state persists across selections and app restarts.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
