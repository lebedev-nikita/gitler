Gitler 0.3.4 combines manual branch renaming and AI suggestions in one dialog.

## Changes

- Choose **Rename branch…** from a local branch's context menu and edit its current name immediately, without requiring Codex.
- Use the **Generate with AI** sparkle icon beside the name field to suggest a name from the selected branch's commits and working changes. Review or edit the suggestion before applying it.
- Keep typed names when generation fails, cancel pending Codex requests when closing the dialog, and reject renames if the branch has moved.
- Preserve merged-branch cleanup, selected-file discards, upstream settings, and remote branch names.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
