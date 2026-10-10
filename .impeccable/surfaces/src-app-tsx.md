---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css"]
---

# Branch graph direction

## Direction contract

THESIS: A repository-wide branch graph keeps forgotten changes attached to the branch that owns them.

OWN-WORLD: Blue-gray instrument panels, off-white text, muted metadata, teal controls, colored history lanes, amber uncommitted nodes. Compact system sans and monospace code. Hairline separators and precise rows.

STORY: Scan branch labels and amber nodes, select a graph node, right-click another to compare, and inspect the patch on the right. Worktrees appear only as branch metadata; detached states remain discoverable. Filters are collapsed until needed.

FIRST VIEWPORT: A full-width graph with an optional 460px inspector at right, a 54px toolbar above, and 30px status bar below. Open repository sits in the toolbar. The user explicitly removed the left branch panel and delegated continuing with a minimal interface.

FORM: Circuit schematic workspace, grounded candidate 3, seed d052abda. Reference: .impeccable/mocks/three-pane.png, superseded structurally by the user's request for no sidebar. Preserve its quiet engineering palette and code inspector.

OVERRIDE: The user explicitly said branches on the left are unnecessary, asked for a minimal interface, and delegated continuing. The original mock remains a palette/material reference. Its geometric diff is retained as historical evidence, not a requirement to restore the removed sidebar. Narrow viewports give the patch most of the vertical space; keyboard arrows belong to filtered graph nodes only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
