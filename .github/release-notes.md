Gitler 0.2.3 fixes branch-name generation when a branch contains large changes.

## Changes

- Branch-name generation no longer fails with “Git output exceeds 16 MiB” for large committed patches or commit messages. Oversized context is shortened before being sent to Codex.
- Git failures still appear as errors, and generating a name leaves repository files and the index unchanged.

## Downloads

| Platform | Architecture                       | Formats            |
| -------- | ---------------------------------- | ------------------ |
| macOS    | Apple Silicon (ARM64), Intel (x64) | DMG, app archive   |
| Windows  | x64                                | EXE installer, MSI |
| Windows  | ARM64                              | EXE installer      |
| Linux    | x64, ARM64                         | AppImage, DEB, RPM |

Choose the asset matching your operating system and processor. `SHA256SUMS.txt` contains checksums for every download.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Discarding selected untracked and newly added files deletes them permanently. The macOS builds use ad-hoc signing and are not notarized; Windows builds do not have a commercial code-signing certificate.
