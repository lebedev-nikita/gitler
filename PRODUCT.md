# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The web interface runs locally inside a Tauri desktop application.

## Stack

User-selected: Tauri, React, TypeScript, shadcn/ui. Bun and Effect follow the user's stack preferences.

## Users

Developers working with many agents that create Git worktrees.

## Product Purpose

Find uncommitted work left across worktrees while inspecting the repository's full history.

## Operating Context

Changes are merged into main while agents work on different branches in separate worktrees.
The application opens from the GUI or CLI using any path inside the repository.

## Capabilities and Constraints

Repository-wide navigation independent of the currently checked-out branch. Git Graph is the functional reference.
The initial version minimizes mutations and focuses on inspection. The interface language is English.
Worktrees are part of branches, never a separate top-level concept. The user requested a
minimal interface with no left branch panel and filters exposed only as needed.
Open decisions: later mutation scope and full Git Graph feature parity.

## Brand Commitments

Repository name: Gitler. Existing icon: assets/icon.svg.

## Product Principles

- Make uncommitted work visible across every worktree.
- Opening any worktree should identify the same repository.
- Inspect branches without switching the checked-out branch.
- Keep frequent actions direct and preserve orientation during refresh.
