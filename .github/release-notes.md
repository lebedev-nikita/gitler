Gitler 0.4.3 keeps side branches visually distinct until they join the mainline.

## Changes

- Preserve a side line's color along its connection to a mainline ancestor instead of turning it coral immediately below the side commit.
- Keep first-parent connections in the source line's color when their parent is already present in another graph lane.
- Add regression coverage for both join orders while preserving coral mainline commits.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
