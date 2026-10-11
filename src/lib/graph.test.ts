import { describe, expect, it } from "vitest";
import { demoSnapshot, oid } from "./demo";
import {
  ancestorIds,
  DIRTY_COLOR,
  LANE_COLORS,
  layoutGraph,
  mainlineIds,
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

  it.each(["main", "master"])(
    "pins %s and its first-parent history behind newer branches",
    (name) => {
      const demo = demoSnapshot();
      const snapshot = {
        ...demo,
        refs: [{ ...demo.refs[0], name, fullName: `refs/heads/${name}`, oid: "tip" }],
      };
      const nodes = [
        { id: "feature", subject: "newer feature", parents: ["root"] },
        { id: "tip", subject: "mainline merge", parents: ["parent", "side"] },
        { id: "side", subject: "merged feature", parents: ["root"] },
        { id: "parent", subject: "mainline parent", parents: ["root"] },
        { id: "root", subject: "shared root", parents: [] },
      ];
      const mainline = mainlineIds(snapshot, nodes);
      expect([...mainline]).toEqual(["tip", "parent", "root"]);
      const graph = layoutGraph(nodes, mainline);
      expect(
        graph.rows.filter((row) => mainline.has(row.node.id)).every((row) => row.lane === 0),
      ).toBe(true);
      expect(
        graph.rows.filter((row) => !mainline.has(row.node.id)).every((row) => row.lane > 0),
      ).toBe(true);
      expect(graph.rows[0].segments).toEqual([
        expect.objectContaining({ from: 1, to: 1, half: "bottom" }),
      ]);
      expect(graph.rows[4].segments).toContainEqual(
        expect.objectContaining({ from: 1, to: 0, half: "top" }),
      );
      // Every edge crosses the row boundary at the same lane on both sides.
      for (let index = 1; index < graph.rows.length; index++) {
        const bottom = graph.rows[index - 1].segments
          .filter((segment) => segment.half === "bottom")
          .map((segment) => segment.to)
          .sort();
        const top = graph.rows[index].segments
          .filter((segment) => segment.half === "top")
          .map((segment) => segment.from)
          .sort();
        expect(new Set(top)).toEqual(new Set(bottom));
      }
    },
  );

  it("keeps a merged side line's color until it reaches its mainline ancestor", () => {
    const nodes = [
      { id: "merge", subject: "merge", parents: ["main-a", "side"] },
      { id: "side", subject: "side", parents: ["root"] },
      { id: "main-a", subject: "main-a", parents: ["main-b"] },
      { id: "main-b", subject: "main-b", parents: ["root"] },
      { id: "root", subject: "root", parents: [] },
    ];
    const mainline = new Set(["merge", "main-a", "main-b", "root"]);
    const graph = layoutGraph(nodes, mainline);
    const side = graph.rows[1];
    expect(side.color).not.toBe(LANE_COLORS[0]);
    expect(
      side.segments
        .filter((segment) => segment.from === side.lane)
        .every((segment) => segment.color === side.color),
    ).toBe(true);
    for (const row of graph.rows.slice(2, 4)) {
      expect(row.color).toBe(LANE_COLORS[0]);
      expect(row.segments).toContainEqual({
        from: side.lane,
        to: side.lane,
        half: "top",
        color: side.color,
      });
      expect(row.segments).toContainEqual({
        from: side.lane,
        to: side.lane,
        half: "bottom",
        color: side.color,
      });
      expect(row.segments).toContainEqual(
        expect.objectContaining({
          from: 0,
          half: "bottom",
          color: LANE_COLORS[0],
        }),
      );
    }
    expect(graph.rows[4].color).toBe(LANE_COLORS[0]);
    expect(graph.rows[4].segments).toContainEqual({
      from: side.lane,
      to: 0,
      half: "top",
      color: side.color,
    });
  });

  it("keeps the source color when a side line joins an already pending mainline parent", () => {
    const nodes = [
      { id: "merge", subject: "merge", parents: ["main", "side"] },
      { id: "main", subject: "main", parents: ["root"] },
      { id: "side", subject: "side", parents: ["root"] },
      { id: "root", subject: "root", parents: [] },
    ];
    const graph = layoutGraph(nodes, new Set(["merge", "main", "root"]));
    const side = graph.rows[2];
    expect(side.color).not.toBe(LANE_COLORS[0]);
    expect(side.segments).toContainEqual({
      from: side.lane,
      to: 0,
      half: "bottom",
      color: side.color,
      dashed: false,
    });
    expect(graph.rows[3].color).toBe(LANE_COLORS[0]);
  });

  it("pins mainline working changes and keeps the lane when the tip is filtered out", () => {
    const demo = demoSnapshot();
    const snapshot = {
      ...demo,
      worktrees: [
        { ...demo.worktrees[0], files: demo.worktrees[1].files },
        ...demo.worktrees.slice(1),
      ],
    };
    const nodes = repositoryNodes(snapshot);
    const mainline = mainlineIds(snapshot, nodes);
    expect(mainline.has(`working:${snapshot.worktrees[0].path}`)).toBe(true);
    const filtered = nodes.filter((node) => node.id !== oid(1));
    const graph = layoutGraph(filtered, mainline);
    expect(
      graph.rows.filter((row) => mainline.has(row.node.id)).every((row) => row.lane === 0),
    ).toBe(true);
    const onlyFeature = nodes.filter((node) => node.id === oid(2));
    expect(layoutGraph(onlyFeature, mainline).rows[0].lane).toBe(0);
  });

  it("falls back to remote mainlines and leaves repositories without one compact", () => {
    const demo = demoSnapshot();
    const snapshot = {
      ...demo,
      refs: demo.refs.filter((reference) => reference.kind === "remote"),
    };
    const nodes = repositoryNodes(snapshot);
    expect(mainlineIds(snapshot, nodes).has(oid(1))).toBe(true);
    snapshot.refs = [
      {
        ...snapshot.refs[0],
        name: "origin/HEAD",
        fullName: "refs/remotes/origin/HEAD",
        oid: oid(2),
      },
    ];
    expect(mainlineIds(snapshot, nodes).has(oid(2))).toBe(true);
    const withoutMainline = { ...snapshot, refs: [] };
    expect(mainlineIds(withoutMainline, nodes).size).toBe(0);
    expect(layoutGraph(nodes, mainlineIds(withoutMainline, nodes))).toEqual(layoutGraph(nodes));
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
