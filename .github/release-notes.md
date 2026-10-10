Gitler 0.2.2 keeps automatic repository refreshes quiet and preserves the loaded diff.

## Changes

- Automatic scans no longer animate the refresh button, show a refreshing message, or put history controls into a loading state.
- Keep the loaded file list and diff visible while rechecking them in the background. Updated file contents still appear even when Git statuses have not changed.
- Manual refreshes from the toolbar or keyboard shortcut continue to show progress. Switching files or diff modes retains the appropriate loading state, and refresh errors remain visible.

## Downloads

| Platform | Architecture                       | Formats            |
| -------- | ---------------------------------- | ------------------ |
| macOS    | Apple Silicon (ARM64), Intel (x64) | DMG, app archive   |
| Windows  | x64                                | EXE installer, MSI |
| Windows  | ARM64                              | EXE installer      |
| Linux    | x64, ARM64                         | AppImage, DEB, RPM |

Choose the asset matching your operating system and processor. `SHA256SUMS.txt` contains checksums for every download.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The macOS builds use ad-hoc signing and are not notarized; Windows builds do not have a commercial code-signing certificate.
