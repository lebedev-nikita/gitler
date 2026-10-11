Gitler 0.4.5-rc.1 is a release candidate with a clearer base-folder copy action and shared toolbar tooltips.

## Changes

- Use a FolderCopy icon for copying the full base repository folder path beside the repository name.
- Show a checkmark after copying; keep path details and clipboard errors in the shared tooltip.
- Include the shared tooltip improvements from main, with a consistent 500 ms delay.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
