Gitler 0.5.2-rc.2 reopens the file preview when you click a changed file.

## Changes

- Close the lower diff or media preview with the **×** button at the top right of its header.
- Keep commit details, the changed-file list, and the selected file when closing the preview.
- Click any changed file to reopen its preview, including the file already selected.
- You can also reopen the preview with **Show diff preview** beside **Changed files**. The hidden state persists across graph selections and app restarts until you open a file preview.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
