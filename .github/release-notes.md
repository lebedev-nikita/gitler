Gitler 0.5.0 adds native T3 Code thread creation from a selected local branch.

## Changes

- Choose **New T3 Code thread…** in a local branch context menu to create an empty thread named after the branch.
- Reuse the branch’s registered worktree, including local edits. If none exists, create a worktree for that same branch without changing existing branches, indexes, or working files.
- Connect directly to the running T3 Code server; no third-party CLI is required. Inherit the T3 project’s model and permission settings.
- Show connection and installation guidance when T3 Code is unavailable. Validate the branch and worktree again before creation, and retain a created worktree if the request fails.
- Include the base-folder copy action and shared tooltip improvements from 0.4.5-rc.1.

The integration supports T3 Code orchestration protocol 1, including T3 Code 0.0.45. After creating a thread, Gitler opens T3 Code; select the branch-named thread there.

## Downloads

| Platform | Architecture          | Formats          |
| -------- | --------------------- | ---------------- |
| macOS    | Apple Silicon (ARM64) | DMG, app archive |

Download the DMG or app archive for a Mac with Apple Silicon. `SHA256SUMS.txt` contains checksums for both downloads.

Git must be installed and available on PATH. Branch-name generation also requires a current Codex CLI installation signed in with `codex login`. Worktree deletion requires confirmation and permanently removes its directory. The app uses ad-hoc signing and is not notarized.
