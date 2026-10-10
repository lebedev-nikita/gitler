import type { Commit, Snapshot, Worktree } from "./models";

export const LANE_COLORS = ["#ff6a56", "#e8d8c2", "#b5bf8b", "#c3a8b1", "#c9ad94", "#e29a80"];
export const DIRTY_COLOR = "#e8b96d";
export const ROW_HEIGHT = 42;
export const LANE_WIDTH = 19;

export function mergeCommitHistory(
  history: readonly Commit[],
  resolved: readonly Commit[],
): Commit[] {
  const byId = new Map(history.map((commit) => [commit.oid, commit]));
  for (const commit of resolved) {
    if (!byId.has(commit.oid)) byId.set(commit.oid, commit);
  }
  const visited = new Set<string>();
  const ordered: Commit[] = [];
  // Iterative postorder avoids recursion limits in large repositories. Reversing
  // it keeps children before their parents, even for individually resolved commits.
  for (const commit of Array.from(byId.values()).reverse()) {
    const pending: [Commit, boolean][] = [[commit, false]];
    while (pending.length) {
      const [current, complete] = pending.pop()!;
      if (complete) {
        ordered.push(current);
        continue;
      }
      if (visited.has(current.oid)) continue;
      visited.add(current.oid);
      pending.push([current, true]);
      for (const parent of current.parents) {
        const ancestor = byId.get(parent);
        if (ancestor) pending.push([ancestor, false]);
      }
    }
  }
  return ordered.reverse();
}

export type GraphNode = {
  id: string;
  parents: readonly string[];
  subject: string;
  commit?: Commit;
  worktree?: Worktree;
};

export type GraphSegment = {
  from: number;
  to: number;
  half: "top" | "bottom";
  color: string;
  dashed?: boolean;
};
export type GraphRow = {
  node: GraphNode;
  lane: number;
  color: string;
  segments: GraphSegment[];
};

export function repositoryNodes(snapshot: Snapshot): GraphNode[] {
  const dirty = snapshot.worktrees.filter((tree) => tree.files.length > 0 && !tree.error);
  const remaining = new Set(dirty);
  const nodes: GraphNode[] = [];
  for (const commit of snapshot.commits) {
    for (const tree of dirty) {
      if (tree.head !== commit.oid) continue;
      nodes.push({
        id: `working:${tree.path}`,
        parents: [tree.head],
        subject: "Uncommitted changes",
        worktree: tree,
      });
      remaining.delete(tree);
    }
    nodes.push({ id: commit.oid, parents: commit.parents, subject: commit.subject, commit });
  }
  return [
    ...Array.from(remaining, (tree) => ({
      id: `working:${tree.path}`,
      parents: tree.head && !/^0+$/.test(tree.head) ? [tree.head] : [],
      subject: "Uncommitted changes",
      worktree: tree,
    })),
    ...nodes,
  ];
}

export function ancestorIds(nodes: readonly GraphNode[], tips: readonly string[]): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  const pending = [...tips];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    pending.push(...(byId.get(id)?.parents ?? []));
  }
  return ids;
}

export function mainlineIds(snapshot: Snapshot, nodes: readonly GraphNode[]): Set<string> {
  const candidates = [
    "refs/heads/main",
    "refs/heads/master",
    "refs/remotes/origin/main",
    "refs/remotes/origin/master",
    "refs/remotes/origin/HEAD",
  ];
  const reference = candidates
    .map((name) => snapshot.refs.find((reference) => reference.fullName === name))
    .find((reference) => reference !== undefined);
  if (!reference) return new Set();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  let id: string | undefined = reference.oid;
  while (id && !ids.has(id)) {
    ids.add(id);
    id = byId.get(id)?.parents[0];
  }
  for (const node of nodes) {
    if (node.worktree?.branch === reference.name && node.worktree.head === reference.oid)
      ids.add(node.id);
  }
  return ids;
}

export function layoutGraph(
  nodes: readonly GraphNode[],
  mainline: ReadonlySet<string> = new Set(),
): { rows: GraphRow[]; width: number } {
  const lanes: (string | undefined)[] = [];
  const colors = new Map<string, string>();
  const availableIds = new Set(nodes.map((node) => node.id));
  const pinned = nodes.filter((node) => mainline.has(node.id));
  let pinnedIndex = 0;
  let colorIndex = pinned.length ? 1 : 0;
  let maximum = 1;
  const freeLane = () => {
    const first = pinned.length ? 1 : 0;
    for (let index = first; index < lanes.length; index++) {
      if (lanes[index] === undefined) return index;
    }
    return Math.max(first, lanes.length);
  };
  const rows = nodes.map((node) => {
    const incoming = lanes.indexOf(node.id);
    const isMainline = mainline.has(node.id);
    let lane = isMainline ? 0 : incoming;
    const hasTop = incoming >= 0;
    if (lane < 0) {
      lane = freeLane();
    }
    if (!hasTop) lanes[lane] = node.id;
    if (isMainline) pinnedIndex++;
    const color = isMainline
      ? LANE_COLORS[0]
      : (colors.get(node.id) ?? LANE_COLORS[colorIndex++ % LANE_COLORS.length]);
    const before = [...lanes];
    const segments: GraphSegment[] = [];
    for (let index = 0; index < before.length; index++) {
      if (!before[index] || (before[index] === node.id && !hasTop)) continue;
      segments.push({
        from: index,
        to: before[index] === node.id ? lane : index,
        half: "top",
        color: colors.get(before[index]!) ?? color,
      });
    }
    if (incoming >= 0) lanes[incoming] = undefined;
    lanes[lane] = undefined;
    node.parents.forEach((parent, index) => {
      if (!availableIds.has(parent)) {
        segments.push({ from: lane, to: lane, half: "bottom", color, dashed: true });
        return;
      }
      let destination = lanes.indexOf(parent);
      if (destination < 0) {
        // A side branch may reach an older mainline commit before the mainline
        // tip is drawn. Keep that edge on the right until its actual join row.
        destination =
          parent === pinned[pinnedIndex]?.id
            ? 0
            : index === 0 && (!pinned.length || lane > 0) && lanes[lane] === undefined
              ? lane
              : freeLane();
        lanes[destination] = parent;
        colors.set(
          parent,
          mainline.has(parent)
            ? LANE_COLORS[0]
            : index === 0
              ? color
              : LANE_COLORS[colorIndex++ % LANE_COLORS.length],
        );
      }
      segments.push({
        from: lane,
        to: destination,
        half: "bottom",
        color: colors.get(parent) ?? color,
        dashed: !availableIds.has(parent) || !!node.worktree,
      });
    });
    for (let index = 0; index < before.length; index++) {
      if (before[index] === node.id || !before[index]) continue;
      segments.push({
        from: index,
        to: index,
        half: "bottom",
        color: colors.get(before[index]!) ?? color,
      });
    }
    maximum = Math.max(maximum, lanes.length, before.length);
    while (lanes.length && lanes[lanes.length - 1] === undefined) lanes.pop();
    return { node, lane, color: node.worktree ? DIRTY_COLOR : color, segments };
  });
  return { rows, width: Math.max(76, maximum * LANE_WIDTH + 32) };
}
