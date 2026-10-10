# Gitler

Git operations live in `src-tauri/src/git.rs`. Resolve repositories by their common
Git directory, including every registered worktree. Inspection stays read-only;
mutations are limited to explicit local branch renames and confirmed, selected-file
discards. Validate repository ownership and stale previews before changing files.

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
