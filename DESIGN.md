---
name: Gitler
description: A quiet circuit workspace for repository history and uncommitted work.
colors:
  primary: "#69c3b4"
  primary-foreground: "#122b28"
  background: "#18232d"
  foreground: "#e5edf4"
  card: "#1d2a36"
  popover: "#24323f"
  secondary: "#243340"
  muted: "#263746"
  muted-foreground: "#a0b1c1"
  accent: "#2a4054"
  border: "#334352"
  dirty: "#e9b566"
  tag: "#bfa5ef"
  added: "#a0dfb8"
  removed: "#edacb3"
  destructive: "#efa6ac"
  lane-blue: "#75b5f6"
  lane-violet: "#b693ec"
  lane-rose: "#e49bb9"
  lane-olive: "#a4bc77"
  lane-cyan: "#83c6df"
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

Blue-gray instrument panels make a dense repository readable without competing with its graph. Off-white subjects, subdued metadata, fine separators, and small geometric nodes create a quiet engineering surface. Color communicates identity or state; generous marketing treatments do not define the working interface.

**Key Characteristics:**

- Compact rows with stable alignment and restrained controls.
- Teal actions, colored history lanes, and amber uncommitted work.
- Monospace technical evidence inside flat, independently scrolling panes.

## Colors

The palette layers cool dark neutrals beneath a small set of functional accents; frontmatter preserves the source values.

### Primary

**Instrument Teal** (`primary`) identifies the brand mark, primary actions, focus, and connected status. **Deep Teal Ink** supplies primary-button text.

### Secondary

**Working Amber** (`dirty`) identifies uncommitted nodes, their branch labels, and modified-file status. **Addition Mint** and **Removal Rose** distinguish change counts; **Error Rose** identifies unavailable or failed states.

### Tertiary

**Tag Lavender** marks tags and untracked files. **Lane Blue, Violet, Rose, Olive, Cyan**, and Instrument Teal cycle through history lanes; branch badges inherit their lane color rather than a separate palette.

### Neutral

**Workspace Blue-gray** (`background`) anchors the canvas; `card`, `secondary`, and `popover` distinguish toolbar, file headers, and transient surfaces. `foreground` carries content, `muted-foreground` carries metadata, `border` separates regions, and `muted`/`accent` carry control states.

**The State Color Rule.** Amber marks uncommitted work; branch identity colors follow their graph lanes. Do not reuse amber as arbitrary decoration.

## Typography

**Interface Font:** Inter Variable with the system sans fallbacks in frontmatter. **Technical Font:** SFMono-Regular with Consolas, Liberation Mono, and monospace fallbacks.

The working scale is deliberately narrow: titles (14px, 600), subjects and regular text (12px), metadata (11px), and compact badges or auxiliary labels (10px). The root size is 13px; rem-based shadcn controls follow it. Patch text uses the code token with two aligned, tabular line-number gutters. Long graph subjects and file paths truncate; patch lines preserve whitespace and scroll horizontally.

**The Technical Text Rule.** Use monospace for paths, hashes, shortcuts, and patch text; keep controls and prose in Inter.

## Layout

The shell fills the viewport (100dvh): a fixed-height toolbar (54px), repository summary, flexible workspace, and status bar (30px). The graph owns the available width until an inspector opens at right (460px). There is no left navigation panel. Graph rows share a fixed rhythm (42px) and lane step (19px); graph gutters and inspector gutters use their named spacing tokens.

At widths up to 1150px, the inspector narrows (390px), author metadata disappears, and branch badges stack below subjects. At widths up to 760px, the inspector moves below the graph; the workspace allocates 0.65fr to history with a 200px minimum and 1.35fr to inspection. Compact gutters replace desktop gutters. Inspector summaries and file lists contract so the patch remains visible; paths and secondary toolbar/status metadata disappear. Preserve independent graph and patch scrolling with stable scrollbar gutters.

## Elevation & Depth

Persistent regions use tonal layering and hairline borders (1px). Outline buttons and fields carry the library's subtle small shadow; context menus carry its medium shadow. Dialogs use a fine translucent outline and softly blurred backdrop. Focus uses a teal border/ring and a visible inset outline (2px). Hover and popup transitions are brief (100–150ms); reduced-motion preferences collapse animation and transition duration.

**The Flat Workspace Rule.** Persistent panes rely on tonal layering and hairline borders; reserve shadows for compact controls and transient context menus.

## Shapes

Controls have modest corners (`md`); graph labels and file selections are tighter (`graph-ref`). Context-menu items use the smaller radius; dialogs use the larger radius. General badges have softly rounded ends, overridden to compact rectangles inside graph rows. Icons are fine SVG strokes. Committed nodes are solid circles, while uncommitted nodes combine an amber ring and central dot with a dashed link to their parent.

## Components

**Buttons.** Teal primary actions, bordered repository-opening controls, and ghost utilities share restrained sizing and medium weight. Small controls use 2rem height; auxiliary actions use 1.5rem. Hover changes fill; focus remains visible; disabled controls reduce opacity. Link buttons underline on hover.

**Fields and filters.** The history search is a bordered input group with an inline search icon, muted placeholder, and optional clear action. Its desktop width caps at 560px. Entering a commit hash resolves it into the graph for inspection and comparison. Optional filters stay collapsed behind one ghost control; an active-filter dot preserves state visibility. Branch choices use a native select, and working-change filtering uses a labeled checkbox.

**Badges and status.** Branch badges combine a faint lane-colored fill and stroke; dirty and tag badges use their semantic colors. Remote labels use a neutral outline, while quiet badges use a neutral filled surface. Dirty, connected, and unavailable states pair colored dots with text.

**History graph.** Aligned graph, message, author, and date columns form one selectable row. Hover adds a subtle blue-gray fill; selection and comparison use a stronger blue fill. Working rows retain an amber wash and attach their branch and file count beside the subject. Right-click comparison actions open the same inspector used for selection. Branch labels target their own local branch when several share a tip. Rename and discard actions open focused review dialogs.

**Inspector and patch.** The inset surface groups a compact summary, optional metadata, changed-file rows, and a patch. The active file has a blue selection fill. Working-copy modes form one joined toggle group with a muted selected segment. A neutral file header precedes green additions, rose deletions, and blue hunk rows; status letters, signs, and line numbers preserve meaning beyond color.

**Transient surfaces.** Context menus use the popover surface, compact rounded items, and visible focus fill. Dialogs use the same material with larger corners and short title/description text. Rename dialogs show an editable Codex suggestion, regeneration and cancellation, with executable options collapsed. Discard dialogs show the working-copy path and a scrollable file checklist, followed by a destructive action naming the selection count. Containers remain flat rather than introducing a separate card grid.

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
