Gitler 0.5.4 fixes an extra scrollbar appearing while quickly scrolling changed files.

## Changes

- Keep file tooltips from expanding the page when their rows scroll out of view.
- Hide tooltips when their anchor is outside the visible list.
- Add regression coverage for long file lists in wide and narrow windows, with and without the diff preview.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
