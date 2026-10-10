Gitler 0.3.2 makes branches whose changes reached main through squash or rebase clearly identifiable.

## Changes

- Show **Changes in main** when all committed changes match the main branch after squash, rebase, or cherry-pick.
- Show **Merged into main** for branches already contained in the main branch's commit history.
- Preserve the real commit connections and keep uncommitted work visible separately.
- Detect multi-commit squash merges and matching commits outside the loaded graph page without accessing GitHub or changing repository files.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The app uses ad-hoc signing and is not notarized.
