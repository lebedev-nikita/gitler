Gitler 0.4.4 makes repository links and the base folder path available directly in the toolbar.

## Changes

- Click the repository name to open GitHub or another supported Git remote.
- Copy the full base repository folder path beside the name, even when opening a linked worktree.
- Preserve the native link context menu, including Copy Link in the macOS app.
- Replace the Open repository text button with a compact folder icon and keyboard-shortcut tooltip.
- Remove the repository-wide information dialog; remote addresses and update errors remain available from the footer.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
