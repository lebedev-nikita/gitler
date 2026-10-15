# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

A local web interface inside a Tauri desktop app for macOS on Apple Silicon.

## Stack

Tauri, React, TypeScript, shadcn/ui, Bun, and Effect.

## Users

Developers working with agents that create Git worktrees.

## Product Purpose

Find uncommitted work across worktrees while inspecting the repository's history.

## Operating Context

Agents work on branches in separate worktrees while changes are merged into main.
Opening any repository or worktree path identifies the same repository.

## Capabilities and Constraints

- Repository-wide history and working changes are visible without switching branches.
- Worktrees appear as branch metadata, with detached work discoverable in the graph.
- The workspace centers on the graph and optional diff inspector; filters open on demand.
- Remote branches update automatically, with status and retry actions available.
- Explicit actions support fast-forward pulls, local branch renames, T3 Code thread
  creation, selected-file discards, and deletion of merged local branches and clean worktrees.
- T3 Code thread creation inherits project settings and reuses or creates a worktree
  on the selected local branch. Created worktrees remain if the request fails.
- Inspection is read-only; mutation and repository-safety requirements are defined in
  [AGENTS.md](AGENTS.md). T3 service refs are hidden from history.
- The interface language is English. Git Graph is the functional reference;
  broader mutation scope and full feature parity remain open decisions.

## Brand Commitments

Name: Gitler. App icon and palette: [assets/icons/base.png](assets/icons/base.png).
The text-free mark in [assets/icons/mark.png](assets/icons/mark.png) is used by T3
Code and browser favicons. See [icon provenance](assets/icons/PROVENANCE.md).

## Product Principles

- Make uncommitted work visible across every worktree.
- Opening any worktree should identify the same repository.
- Inspect branches without switching the checked-out branch.
- Keep frequent actions direct and preserve orientation during refresh.
