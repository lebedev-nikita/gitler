Gitler 0.2.4 adds resizable panels and controls for hiding details and the diff preview.

## Changes

- Resize the graph and details panels by dragging their boundary. Resize the changed-file list and diff preview independently.
- Hide or reopen the details panel from the toolbar, and toggle the diff preview beside the changed-file heading.
- Panel sizes and visibility are remembered. Hiding details preserves the selected file and changes view; selecting another graph node respects hidden panels.
- Remove the auto-refresh toggle from the status bar. Background refresh continues every 15 seconds without showing a loading spinner.
- Publish the updated Homebrew cask automatically after the release downloads are verified.
- Support and publish only macOS builds for Apple Silicon.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The app uses ad-hoc signing and is not notarized.
