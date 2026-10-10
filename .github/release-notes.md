Gitler is a read-only desktop Git graph for repositories with many branches and working copies.

This is the second release candidate for 0.2.0.

## Changes

- Hide T3 Code checkpoints from the commit graph and hash navigation. Checkpoints remain available to T3 Code for restoring files.
- Keep checkpoint snapshots out of history limits while preserving every registered worktree, including detached HEADs.
- Open different repositories in separate windows from the GUI or CLI, with at most one window per repository.
- Bring an already open repository to the front without resetting its selection or diff. Paths through worktrees, nested folders, and symlinks reuse the same window.
- Show the repository name in each window's title.
- Fix Windows MSI packaging for release candidates by using a numeric installer version.

## Downloads

| Platform | Architecture                       | Formats            |
| -------- | ---------------------------------- | ------------------ |
| macOS    | Apple Silicon (ARM64), Intel (x64) | DMG, app archive   |
| Windows  | x64                                | EXE installer, MSI |
| Windows  | ARM64                              | EXE installer      |
| Linux    | x64, ARM64                         | AppImage, DEB, RPM |

Choose the asset matching your operating system and processor. `SHA256SUMS.txt` contains checksums for every download.

Git must be installed and available on PATH. Linux builds require a graphical desktop; DEB and RPM packages declare their runtime dependencies. The initial macOS builds use ad-hoc signing and are not notarized. Windows builds do not have a commercial code-signing certificate.
