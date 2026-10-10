Gitler 0.2.1 adds branch naming with Codex and selective cleanup of working changes.

## Changes

- Right-click a local branch label, its tip commit, or a working-change node to generate a branch name from committed and uncommitted changes using your installed Codex CLI. Review or edit the suggestion before applying the local rename. Upstream configuration is preserved.
- Discard selected uncommitted files from the graph's context menu. Restore staged and unstaged changes to HEAD, and delete selected untracked or newly added files after confirmation. Other files and worktrees are preserved.
- Reject stale discard previews and branch tips. Keep nested repositories and submodules out of destructive cleanup.
- Cancel an in-progress Codex generation when its dialog closes. Detect common Codex installation paths, with an optional executable override.

## Downloads

| Platform | Architecture                       | Formats            |
| -------- | ---------------------------------- | ------------------ |
| macOS    | Apple Silicon (ARM64), Intel (x64) | DMG, app archive   |
| Windows  | x64                                | EXE installer, MSI |
| Windows  | ARM64                              | EXE installer      |
| Linux    | x64, ARM64                         | AppImage, DEB, RPM |

Choose the asset matching your operating system and processor. `SHA256SUMS.txt` contains checksums for every download.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The macOS builds use ad-hoc signing and are not notarized; Windows builds do not have a commercial code-signing certificate.
