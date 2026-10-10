---
name: Gitler
description: A quiet circuit workspace for repository history and uncommitted work.
colors:
  primary: "#ff5b49"
  primary-hover: "#ff7768"
  primary-foreground: "#161515"
  background: "#161515"
  foreground: "#f6eada"
  card: "#1c1917"
  popover: "#221e1b"
  secondary: "#231f1b"
  muted: "#28231e"
  muted-foreground: "#b9ad9e"
  accent: "#2b1f1c"
  border: "#38312b"
  dirty: "#e8b96d"
  tag: "#d9c3a2"
  added: "#aec79a"
  removed: "#ff9384"
  destructive: "#ff9c8f"
  lane-red: "#ff6a56"
  lane-cream: "#e8d8c2"
  lane-mauve: "#c3a8b1"
  lane-olive: "#b5bf8b"
  lane-taupe: "#c9ad94"
  lane-terracotta: "#e29a80"
typography:
  title:
    {
      fontFamily: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: "14px",
      fontWeight: 600,
    }
  body:
    {
      fontFamily: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: "12px",
      fontWeight: 400,
    }
  label:
    {
      fontFamily: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: "11px",
      fontWeight: 400,
    }
  code:
    {
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: "10.5px",
      fontWeight: 400,
      lineHeight: "22px",
    }
rounded:
  sm: "3px"
  graph-ref: "4px"
  md: "5px"
  xl: "10px"
  badge: "16px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  inspector-gutter: "18px"
  graph-gutter: "23px"
  compact-gutter: "14px"
components:
  button-primary:
    {
      backgroundColor: "{colors.primary}",
      textColor: "{colors.primary-foreground}",
      rounded: "{rounded.md}",
      height: "2.25rem",
      padding: "0 0.625rem",
    }
  button-outline:
    {
      backgroundColor: "{colors.background}",
      textColor: "{colors.foreground}",
      rounded: "{rounded.md}",
      height: "2rem",
      padding: "0 0.625rem",
    }
  button-ghost:
    {
      backgroundColor: "transparent",
      textColor: "{colors.foreground}",
      rounded: "{rounded.md}",
      height: "2rem",
      padding: "0 0.625rem",
    }
  button-link:
    {
      textColor: "{colors.primary}",
      rounded: "{rounded.md}",
      height: "1.5rem",
      padding: "0 0.5rem",
    }
  search-field:
    {
      backgroundColor: "transparent",
      textColor: "{colors.foreground}",
      rounded: "{rounded.md}",
      height: "2.25rem",
    }
  badge-branch:
    {
      textColor: "{colors.primary}",
      rounded: "{rounded.graph-ref}",
      height: "18px",
      padding: "0 5px",
    }
  badge-dirty:
    {
      textColor: "{colors.dirty}",
      rounded: "{rounded.graph-ref}",
      height: "18px",
      padding: "0 5px",
    }
  graph-row: { textColor: "{colors.foreground}", height: "42px", padding: "0" }
  changed-file:
    {
      textColor: "{colors.foreground}",
      rounded: "{rounded.graph-ref}",
      height: "33px",
      padding: "0 8px",
    }
---

# Design System: Gitler

## Overview

**Creative North Star: "Circuit Schematic Workspace"**

Warm charcoal instrument panels make a dense repository readable without competing with its graph. Cream subjects, subdued metadata, fine separators, and small geometric nodes create a quiet engineering surface. Color communicates identity or state; generous marketing treatments do not define the working interface.

**Key Characteristics:**

- Compact rows with stable alignment and restrained controls.
- Vermilion actions, warm history lanes, and amber uncommitted work.
- Monospace technical evidence inside flat, independently scrolling panes.

## Colors

The palette follows `assets/icons/base.png`: warm charcoal surfaces, cream text, and vermilion accents. The red is slightly lighter than the icon for readable small labels. Supporting state colors remain distinct in the graph and diff.

### Primary

**Vermilion** (`primary`) identifies primary actions, focus, and connected status. **Charcoal Ink** supplies primary-button text; a lighter red hover fill preserves contrast.

### Secondary

**Working Amber** (`dirty`) identifies uncommitted nodes, their branch labels, and modified-file status. **Addition Sage** and **Removal Coral** distinguish change counts; **Error Coral** identifies unavailable or failed states.

### Tertiary

**Tag Sand** marks tags and untracked files. **Lane Red, Cream, Olive, Mauve, Taupe, and Terracotta** cycle through history lanes; red anchors the mainline, and branch badges inherit their lane color.

### Neutral

**Workspace Charcoal** (`background`) anchors the canvas; `card`, `secondary`, and `popover` distinguish toolbar, file headers, and transient surfaces. `foreground` carries content, `muted-foreground` carries metadata, `border` separates regions, and `muted`/`accent` carry control states.

**The State Color Rule.** Amber marks uncommitted work; branch identity colors follow their graph lanes. Do not reuse amber as arbitrary decoration.

## Typography

**Interface Font:** Inter Variable with the system sans fallbacks in frontmatter. **Technical Font:** SFMono-Regular with Consolas, Liberation Mono, and monospace fallbacks.

The working scale is deliberately narrow: titles (14px, 600), subjects and regular text (12px), metadata (11px), and compact badges or auxiliary labels (10px). The root size is 13px; rem-based shadcn controls follow it. Patch text uses the code token with two aligned, tabular line-number gutters. Long graph subjects and file paths truncate; patch lines preserve whitespace and scroll horizontally.

**The Technical Text Rule.** Use monospace for paths, hashes, shortcuts, and patch text; keep controls and prose in Inter.

## Layout

The shell fills the viewport (100dvh): a fixed-height toolbar (54px), repository summary, flexible workspace, and status bar (30px). A draggable boundary divides the graph and right-hand inspector; another divides the inspector's file list and diff preview. The toolbar can hide or restore the inspector, and the file-list heading can hide or restore only the preview. Remember the user's sizes and visibility, and preserve the selected file and diff mode when closing the inspector. Ordinary graph selection respects a hidden inspector; an explicit comparison opens its preview. There is no left navigation panel. Graph rows share a fixed rhythm (42px) and lane step (19px); graph gutters and inspector gutters use their named spacing tokens.

At widths up to 1150px, author metadata disappears and branch badges stack below subjects. At widths up to 760px, the inspector moves below the graph and their boundary resizes heights instead of widths. Remember separate layouts for stacked and side-by-side panels. Compact gutters replace desktop gutters; paths and secondary toolbar/status metadata disappear. Preserve independent graph, file-list, and patch scrolling with stable scrollbar gutters. Boundaries have visible grips, generous pointer targets, focus states, and keyboard resizing. Repository scans remain automatic and quiet; the status bar has no refresh toggle.

## Elevation & Depth

Persistent regions use tonal layering and hairline borders (1px). Outline buttons and fields carry the library's subtle small shadow; context menus carry its medium shadow. Dialogs use a fine translucent outline and softly blurred backdrop. Focus uses a vermilion border/ring and a visible inset outline (2px). Hover and popup transitions are brief (100–150ms); reduced-motion preferences collapse animation and transition duration.

**The Flat Workspace Rule.** Persistent panes rely on tonal layering and hairline borders; reserve shadows for compact controls and transient context menus.

## Shapes

Controls have modest corners (`md`); graph labels and file selections are tighter (`graph-ref`). Context-menu items use the smaller radius; dialogs use the larger radius. General badges have softly rounded ends, overridden to compact rectangles inside graph rows. Icons are fine SVG strokes. Committed nodes are solid circles, while uncommitted nodes combine an amber ring and central dot with a dashed link to their parent.

## Components

**Buttons.** Vermilion primary actions, bordered repository-opening controls, and ghost utilities share restrained sizing and medium weight. Small controls use 2rem height; auxiliary actions use 1.5rem. Hover changes fill; focus remains visible; disabled controls reduce opacity. Link buttons underline on hover.

**Fields and filters.** The history search is a bordered input group with an inline search icon, muted placeholder, and optional clear action. Its desktop width caps at 560px. Entering a commit hash resolves it into the graph for inspection and comparison. Optional filters stay collapsed behind one ghost control; an active-filter dot preserves state visibility. Branch choices use a native select, and working-change filtering uses a labeled checkbox.

**Badges and status.** Branch badges combine a faint lane-colored fill and stroke; dirty and tag badges use their semantic colors. Remote labels use a neutral outline, while quiet badges use a neutral filled surface. Dirty, connected, and unavailable states pair colored dots with text.

**Remote access and updates.** A compact ghost action beside the repository name opens its remote in the browser. Remote names and muted monospace URLs form flat, divided rows in repository information, with an opening action beside each name. Background-update status stays in the footer: muted progress or last-success text, and Error Coral for failures. Clicking this status opens the Remotes section directly, where the error and retry action appear together. Keep recovery reachable as the viewport narrows.

**History graph.** Aligned graph, message, author, and date columns form one selectable row. Keep `main` or `master` and its first-parent history on the leftmost lane, including its uncommitted node; newer side branches stay to the right. Preserve that lane when filtering visible mainline commits. Hover adds a subtle warm charcoal fill; selection and comparison use a dark vermilion tint. Working rows retain an amber wash and attach their branch and file count beside the subject. Right-click comparison actions open the same inspector used for selection. Branch labels target their own local branch when several share a tip. Rename, discard, and merged-branch deletion actions open focused review dialogs.

**Inspector and patch.** The inset surface groups a compact summary, optional metadata, changed-file rows, and a patch. The active file has the same dark vermilion selection tint as the graph. Working-copy modes form one joined toggle group with a muted selected segment. A neutral file header precedes sage additions, coral deletions, and sand hunk rows; status letters, signs, and line numbers preserve meaning beyond color. Inline media previews stack labeled Before and After versions: contained images show dimensions and file size, while video and audio use native playback controls. Keep media independently scrollable inside the preview pane and show a concise unavailable state when content cannot be displayed.

**Transient surfaces.** Context menus use the popover surface, compact rounded items, and visible focus fill. Dialogs use the same material with larger corners and short title/description text. Rename dialogs show an editable Codex suggestion, regeneration and cancellation, with executable options collapsed. Discard dialogs show the working-copy path and a scrollable file checklist, followed by a destructive action naming the selection count. Merged-branch deletion dialogs show the merge target and full paths of the clean linked worktrees to remove. Containers remain flat rather than introducing a separate card grid.

## Do's and Don'ts

### Do:

- **Do** keep labels short and in English.
- **Do** pair semantic color with text, node shape, or diff signs.
- **Do** keep technical metadata subdued and primary subjects readable.
- **Do** preserve row alignment and patch space as the viewport narrows.

### Don't:

- **Don't** use amber for decoration unrelated to uncommitted work.
- **Don't** introduce large display typography into dense inspection panes.
- **Don't** add elevated card treatments to the flat working workspace.
