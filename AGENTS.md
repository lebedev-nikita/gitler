# Gitler

Git operations live in `src-tauri/src/git.rs`. Resolve repositories by their common
Git directory, including every registered worktree. Snapshot inspection stays read-only. Background fetches may update only remote-tracking
branches; preserve local branches, tags, indexes, and working files regardless of
configured fetch refspecs. Other mutations are limited to explicit fast-forward pulls from a branch's configured upstream, explicit local branch
renames, explicit worktree creation for a T3 Code thread on an existing local branch, confirmed
selected-file discards, and confirmed deletion of merged local
branches with clean linked worktrees. Preserve main branches and the main worktree from deletion. Pulls validate the selected
branch HEAD and registered worktree before and after fetching, require a clean working
copy, and preserve ignored files and other worktrees. Branches without worktrees
may fast-forward without creating or switching a worktree.
Thread creation reuses registered worktrees; create one only when the selected
branch has none, preserving existing branches, indexes, and working files. Keep
created worktrees if the T3 Code request fails.
Validate repository ownership, merge safety, and stale previews before changing files.

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
