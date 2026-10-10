import { describe, expect, it } from "vitest";
import { demoSnapshot, oid } from "./demo";
import {
  ancestorIds,
  DIRTY_COLOR,
  layoutGraph,
  mergeCommitHistory,
  repositoryNodes,
} from "./graph";
import { makeDiffRequest } from "./repository";
import { selectionId } from "./models";

describe("repository graph", () => {
  it("retains individually resolved commits once, before their parents, in either resolution order", () => {
    const commit = demoSnapshot().commits[0];
    const root = { ...commit, oid: "root", parents: [] };
    const parent = { ...commit, oid: "parent", parents: ["root"] };
    const child = { ...commit, oid: "child", parents: ["parent"] };
    for (const resolved of [
      [parent, child, child],
      [child, parent, parent],
    ]) {
      expect(mergeCommitHistory([root], resolved).map((commit) => commit.oid)).toEqual([
        "child",
        "parent",
        "root",
      ]);
    }
  });

  it("preserves loaded topological history when resolved commits are already present", () => {
    const commits = demoSnapshot().commits;
    expect(mergeCommitHistory(commits, [commits[4], commits[7]])).toEqual(commits);
  });

  it("attaches a separate amber node to each dirty worktree, ahead of its HEAD", () => {
    const snapshot = demoSnapshot();
    const nodes = repositoryNodes(snapshot);
    const dirty = nodes.filter((node) => node.worktree);
    expect(dirty).toHaveLength(3);
    for (const node of dirty) {
      expect(node.parents).toEqual([node.worktree!.head]);
      expect(nodes.findIndex((item) => item.id === node.id)).toBeLessThan(
        nodes.findIndex((item) => item.id === node.worktree!.head),
      );
    }
    const graph = layoutGraph(nodes);
    expect(
      graph.rows.filter((row) => row.node.worktree).every((row) => row.color === DIRTY_COLOR),
    ).toBe(true);
  });

  it("retains both sides of a merge while filtering by ancestry", () => {
    const nodes = repositoryNodes(demoSnapshot());
    const ids = ancestorIds(nodes, [oid(8)]);
    expect(ids.has(oid(10))).toBe(true);
    expect(ids.has(oid(12))).toBe(true);
    expect(ids.has(oid(2))).toBe(false);
  });

  it("keeps parent edges in lanes at merges and disconnected roots", () => {
    const nodes = [
      { id: "merge", subject: "merge", parents: ["left", "right"] },
      { id: "left", subject: "left", parents: ["root"] },
      { id: "right", subject: "right", parents: ["root"] },
      { id: "root", subject: "root", parents: [] },
      { id: "other", subject: "other", parents: [] },
    ];
    const graph = layoutGraph(nodes);
    expect(graph.rows[0].segments.filter((segment) => segment.half === "bottom")).toHaveLength(2);
    expect(graph.rows[1].lane).not.toEqual(graph.rows[2].lane);
    expect(graph.rows[3].segments.filter((segment) => segment.half === "top")).toHaveLength(1);
    expect(graph.rows[4].lane).toEqual(0);
  });

  it("shows unborn worktree changes even with no commits", () => {
    const snapshot = demoSnapshot();
    const empty = {
      ...snapshot,
      commits: [],
      worktrees: [{ ...snapshot.worktrees[1], head: "0".repeat(40) }],
    };
    const nodes = repositoryNodes(empty);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].parents).toEqual([]);
  });

  it("keeps search results compact when their ancestors are outside the filtered graph", () => {
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `node-${index}`,
      subject: "match",
      parents: [`outside-${index}`],
    }));
    const graph = layoutGraph(nodes);
    expect(graph.width).toBe(76);
    expect(graph.rows.every((row) => row.lane === 0)).toBe(true);
  });
});

describe("comparison requests", () => {
  const file = demoSnapshot().worktrees[1].files[0];

  it("compares two selected commits in selection order", () => {
    const from = { kind: "commit" as const, oid: oid(18) };
    const to = { kind: "commit" as const, oid: oid(1) };
    expect(makeDiffRequest("repo", from, { from, to }, file, "combined")).toMatchObject({
      base: from.oid,
      oid: to.oid,
      worktree: null,
      reverse: false,
    });
  });

  it("uses the chosen commit rather than HEAD for worktree comparisons", () => {
    const from = { kind: "commit" as const, oid: oid(18) };
    const to = { kind: "worktree" as const, path: "/repo/agent" };
    expect(makeDiffRequest("repo", from, { from, to }, file, "combined")).toMatchObject({
      base: from.oid,
      oid: null,
      worktree: to.path,
    });
    expect(makeDiffRequest("repo", to, { from: to, to: from }, file, "combined")).toMatchObject({
      base: from.oid,
      reverse: true,
    });
  });

  it("keeps untracked paths attached to their particular worktree", () => {
    const selection = { kind: "worktree" as const, path: "/repo/agent" };
    const untracked = { ...file, indexStatus: "?" };
    expect(makeDiffRequest("repo", selection, null, untracked, "combined")).toMatchObject({
      worktree: selection.path,
      mode: "untracked",
    });
    expect(selectionId(selection)).toBe("working:/repo/agent");
  });
});
