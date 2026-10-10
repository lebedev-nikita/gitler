Gitler is a read-only desktop Git graph for repositories with many branches and working copies.

- See the entire repository from any worktree, without switching branches.
- Find unfinished work as amber **Uncommitted changes** nodes attached to branch HEADs.
- Inspect staged, unstaged, and untracked files.
- Select one node, right-click another, and choose **Diff with selected** to compare commits or current files.
- Resolve any commit by hash, including commits outside the loaded history.
- Open repositories from the GUI or with `gitler /path/to/repository`.

## Downloads

| Platform | Architecture                       | Formats            |
| -------- | ---------------------------------- | ------------------ |
| macOS    | Apple Silicon (ARM64), Intel (x64) | DMG, app archive   |
| Windows  | x64                                | EXE installer, MSI |
| Windows  | ARM64                              | EXE installer      |
| Linux    | x64, ARM64                         | AppImage, DEB, RPM |

Choose the asset matching your operating system and processor. `SHA256SUMS.txt` contains checksums for every download.

Git must be installed and available on PATH. Linux builds require a graphical desktop; DEB and RPM packages declare their runtime dependencies. The initial macOS builds use ad-hoc signing and are not notarized. Windows builds do not have a commercial code-signing certificate.
