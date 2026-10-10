Gitler 0.3.0 tracks remote branches automatically and opens remote repositories from the app.

## Changes

- Fetch remote branches when a repository opens and every minute in the background. New commits and branches appear in the graph without changing local branches, tags, indexes, or working files.
- Open the primary remote from the toolbar, and open any supported remote from repository information. GitHub HTTPS and SSH addresses resolve to browser links.
- Show remote update progress, the last successful update, and network or authentication failures in the status bar. Retry from repository information or use Refresh.
- Preserve the last fetched history when offline. Git authentication remains managed by your existing Git setup.

## Downloads

| Platform | Architecture                       | Formats            |
| -------- | ---------------------------------- | ------------------ |
| macOS    | Apple Silicon (ARM64), Intel (x64) | DMG, app archive   |
| Windows  | x64                                | EXE installer, MSI |
| Windows  | ARM64                              | EXE installer      |
| Linux    | x64, ARM64                         | AppImage, DEB, RPM |

Choose the asset matching your operating system and processor. `SHA256SUMS.txt` contains checksums for every download.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The macOS builds use ad-hoc signing and are not notarized; Windows builds do not have a commercial code-signing certificate.
