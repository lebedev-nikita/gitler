Gitler 0.3.1 keeps the main branch at the left edge of the commit graph.

## Changes

- Pin `main` or `master` and its first-parent history to the leftmost graph lane, even when other branches have newer commits.
- Keep mainline working changes on the same lane and preserve the position when searching or filtering history.
- Preserve connections to older mainline commits when drawing branches and merges.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The app uses ad-hoc signing and is not notarized.
