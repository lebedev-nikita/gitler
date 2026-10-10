import type { Commit, Snapshot, Worktree } from "./models";

export const LANE_COLORS = ["#75b5f6", "#b693ec", "#69c3b4", "#e49bb9", "#a4bc77", "#83c6df"];
export const DIRTY_COLOR = "#e9b566";
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

export function layoutGraph(nodes: readonly GraphNode[]): { rows: GraphRow[]; width: number } {
  const lanes: (string | undefined)[] = [];
  const colors = new Map<string, string>();
  const availableIds = new Set(nodes.map((node) => node.id));
  let colorIndex = 0;
  let maximum = 1;
  const freeLane = () => {
    const empty = lanes.findIndex((value) => value === undefined);
    return empty >= 0 ? empty : lanes.length;
  };
  const rows = nodes.map((node) => {
    let lane = lanes.indexOf(node.id);
    const hasTop = lane >= 0;
    if (lane < 0) {
      lane = freeLane();
      lanes[lane] = node.id;
    }
    const color = colors.get(node.id) ?? LANE_COLORS[colorIndex++ % LANE_COLORS.length];
    const before = [...lanes];
    const segments: GraphSegment[] = [];
    for (let index = 0; index < before.length; index++) {
      if (!before[index] || (index === lane && !hasTop)) continue;
      segments.push({
        from: index,
        to: index,
        half: "top",
        color: colors.get(before[index]!) ?? color,
      });
    }
    lanes[lane] = undefined;
    node.parents.forEach((parent, index) => {
      if (!availableIds.has(parent)) {
        segments.push({ from: lane, to: lane, half: "bottom", color, dashed: true });
        return;
      }
      let destination = lanes.indexOf(parent);
      if (destination < 0) {
        destination = index === 0 && lanes[lane] === undefined ? lane : freeLane();
        lanes[destination] = parent;
        colors.set(parent, index === 0 ? color : LANE_COLORS[colorIndex++ % LANE_COLORS.length]);
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
      if (index === lane || !before[index]) continue;
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
