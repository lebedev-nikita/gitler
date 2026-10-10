Gitler 0.4.0 adds media previews to the right-hand inspector.

## Changes

- Preview images, video, and audio directly in the inspector, with labeled Before and After versions.
- Inspect the selected commit, staged contents, or working copy, including renamed and deleted media files.
- See image dimensions and file sizes, and play video and audio with native controls.
- Keep playback stable during background repository scans. Files above 16 MiB and unsupported formats show an unavailable-preview message.
- Refresh the application icon and toolbar, and match the interface palette to the charcoal, cream, and red icon.
- Add local browser development and pre-release checks.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
