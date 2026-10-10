Gitler 0.3.0 tracks remote branches automatically and opens remote repositories from the app.

## Changes

- Fetch remote branches when a repository opens and every minute in the background. New commits and branches appear in the graph without changing local branches, tags, indexes, or working files.
- Open the primary remote from the toolbar, and open any supported remote from repository information. GitHub HTTPS and SSH addresses resolve to browser links.
- Show remote update progress, the last successful update, and network or authentication failures in the status bar. Retry from repository information or use Refresh.
- Preserve the last fetched history when offline. Git authentication remains managed by your existing Git setup.
- Support and publish only macOS builds for Apple Silicon.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The app uses ad-hoc signing and is not notarized.
