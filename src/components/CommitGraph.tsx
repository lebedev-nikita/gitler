import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Copy,
  GitCompareArrows,
  GitFork,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  ancestorIds,
  layoutGraph,
  LANE_WIDTH,
  mainlineIds,
  repositoryNodes,
  ROW_HEIGHT,
} from "@/lib/graph";
import type { GraphRow } from "@/lib/graph";
import type { Comparison, GraphAction, Selection, Snapshot } from "@/lib/models";
import { selectionId } from "@/lib/models";
import { cn } from "@/lib/utils";
import { dateLabel, EmptyMessage, shortHash } from "./common";

export const nodeSelection = (row: GraphRow): Selection =>
  row.node.worktree
    ? { kind: "worktree", path: row.node.worktree.path }
    : { kind: "commit", oid: row.node.id };

function GraphVertex({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => 20 + lane * LANE_WIDTH;
  const half = ROW_HEIGHT / 2;
  return (
    <svg className="overflow-visible block" width={width} height={ROW_HEIGHT} aria-hidden="true">
      {row.segments.map((segment, index) => {
        const top = segment.half === "top";
        const fromX = x(segment.from);
        const toX = x(segment.to);
        const fromY = top ? 0 : half;
        const toY = top ? half : ROW_HEIGHT;
        return (
          <path
            key={index}
            d={
              fromX === toX
                ? `M ${fromX} ${fromY} L ${toX} ${toY}`
                : `M ${fromX} ${fromY} C ${fromX} ${fromY + 11} ${toX} ${toY - 11} ${toX} ${toY}`
            }
            stroke={segment.color}
            strokeWidth={1.7}
            fill="none"
            strokeDasharray={segment.dashed ? "3 3" : undefined}
          />
        );
      })}
      <circle
        cx={x(row.lane)}
        cy={half}
        r={row.node.worktree ? 5.4 : row.node.parents.length > 1 ? 5.5 : 4.4}
        fill={row.node.worktree ? "var(--background)" : row.color}
        stroke={row.color}
        strokeWidth={row.node.worktree ? 2.5 : 1.5}
      />
      {row.node.worktree && <circle cx={x(row.lane)} cy={half} r={2.3} fill={row.color} />}
    </svg>
  );
}

export function CommitGraph({
  snapshot,
  selected,
  select,
  compare,
  comparison,
  loadMore,
  busy,
  searchRef,
  jump,
  act,
}: {
  snapshot: Snapshot;
  selected: Selection | null;
  select: (selection: Selection) => void;
  compare: (other: Selection) => void;
  comparison: Comparison | null;
  loadMore: () => void;
  busy: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  jump: (hash: string) => Promise<void>;
  act: (action: GraphAction) => void;
}) {
  const [menuBranch, setMenuBranch] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("all");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [jumpError, setJumpError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const scroll = useRef<HTMLDivElement>(null);
  const lastPosition = useRef<{ id: string; index: number } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const nodes = useMemo(() => repositoryNodes(snapshot), [snapshot]);
  const mainline = useMemo(() => mainlineIds(snapshot, nodes), [snapshot, nodes]);
  useEffect(() => {
    if (branch !== "all" && !snapshot.refs.some((ref) => ref.fullName === branch)) {
      setBranch("all");
    }
  }, [branch, snapshot.refs]);
  const filtered = useMemo(() => {
    const reference = snapshot.refs.find((reference) => reference.fullName === branch);
    const reachable = reference ? ancestorIds(nodes, [reference.oid]) : null;
    const needle = deferredSearch.trim().toLocaleLowerCase();
    return nodes.filter((node) => {
      if (onlyChanges && !node.worktree) return false;
      if (
        reachable &&
        !reachable.has(node.id) &&
        !(node.worktree && reachable.has(node.worktree.head))
      )
        return false;
      const references = snapshot.refs
        .filter((reference) => reference.oid === node.id)
        .map((reference) => reference.name)
        .join(" ");
      return (
        !needle ||
        [
          node.subject,
          node.id,
          node.commit?.author,
          node.commit?.email,
          node.worktree?.branch,
          references,
          node.worktree?.path,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle)
      );
    });
  }, [nodes, snapshot.refs, branch, deferredSearch, onlyChanges]);
  const graph = useMemo(() => layoutGraph(filtered, mainline), [filtered, mainline]);
  useEffect(() => {
    const viewport = scroll.current;
    if (!viewport || !selected) return;
    const id = selectionId(selected);
    const index = graph.rows.findIndex((row) => row.node.id === id);
    if (lastPosition.current?.id === id && lastPosition.current.index === index) return;
    lastPosition.current = { id, index };
    if (index < 0) return;
    const top = index * ROW_HEIGHT;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = top + ROW_HEIGHT - viewport.clientHeight;
    setScrollTop(viewport.scrollTop);
  }, [selected, graph]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 12);
  const end = Math.min(graph.rows.length, start + 70);
  const virtual = graph.rows.slice(start, end);
  const refsFor = (id: string) => snapshot.refs.filter((reference) => reference.oid === id);
  const canCompare = (other: Selection) =>
    selected &&
    selectionId(selected) !== selectionId(other) &&
    !(selected.kind === "worktree" && other.kind === "worktree");

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col" aria-label="Commit graph">
      <div className="flex items-center justify-between h-[54px] flex-none py-0 px-[23px] compact:h-[42px] compact:py-0 compact:px-[14px]">
        <div className="flex gap-[10px] items-center">
          <GitFork className="size-[17px] text-muted-foreground" />
          <h1 className="text-[14px] font-semibold m-0">Commit graph</h1>
          <span className="text-muted-foreground text-[11px] compact:hidden">
            {snapshot.commits.length.toLocaleString()} loaded
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Toggle graph filters"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal
            className="size-[17px] text-muted-foreground"
            data-icon="inline-start"
          />
          Filters
          {(branch !== "all" || onlyChanges) && (
            <span className="size-[5px] rounded-full bg-primary text-muted-foreground text-[11px]" />
          )}
        </Button>
      </div>
      <div className="flex-none flex gap-[12px] mt-0 mx-[23px] mb-[16px] compact:mt-0 compact:mx-[14px] compact:mb-[10px]">
        <InputGroup className="max-w-[560px]">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              scroll.current?.scrollTo(0, 0);
            }}
            onKeyDown={async (event) => {
              if (event.key !== "Enter" || !/^[a-f0-9]{4,64}$/i.test(search.trim())) return;
              try {
                await jump(search.trim());
                setSearch("");
                setJumpError(null);
              } catch (error) {
                setJumpError(error instanceof Error ? error.message : String(error));
              }
            }}
            title="Search loaded history. Enter a commit hash and press Enter to inspect any commit."
            placeholder="Search commits, branches, authors…"
            aria-label="Search loaded commits"
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X />
              </Button>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>
      {jumpError && (
        <div className="text-destructive pt-0 px-[23px] pb-[12px] text-[12px]" role="alert">
          {jumpError}
        </div>
      )}
      {showFilters && (
        <div className="flex items-center gap-[16px] pt-0 px-[23px] pb-[16px] flex-none compact:pt-0 compact:px-[14px] compact:pb-[10px] compact:flex-wrap compact:gap-[8px]">
          <NativeSelect
            aria-label="Filter history by branch"
            value={branch}
            onChange={(event) => {
              setBranch(event.target.value);
              scroll.current?.scrollTo(0, 0);
            }}
          >
            <NativeSelectOption value="all">All branches</NativeSelectOption>
            {snapshot.refs
              .filter((ref) => ref.kind !== "tag")
              .map((ref) => (
                <NativeSelectOption key={ref.fullName} value={ref.fullName}>
                  {ref.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <label className="flex items-center gap-[6px] text-muted-foreground text-[12px]">
            <input
              className="accent-primary"
              type="checkbox"
              checked={onlyChanges}
              onChange={(event) => {
                setOnlyChanges(event.target.checked);
                scroll.current?.scrollTo(0, 0);
              }}
            />
            Uncommitted only
          </label>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setBranch("all");
              setOnlyChanges(false);
            }}
          >
            Reset
          </Button>
        </div>
      )}
      <div
        className="grid grid-cols-[var(--graph-width)_minmax(0,1fr)_110px_68px] flex-none h-[32px] items-center py-0 px-[23px] border-t border-border border-b text-muted-foreground text-[11px] narrow:grid-cols-[var(--graph-width)_minmax(0,1fr)_65px] compact:py-0 compact:px-[14px]"
        style={{ "--graph-width": `${graph.width}px` } as React.CSSProperties}
      >
        <span className="pl-[12px]">Graph</span>
        <span>Commit message</span>
        <span className="narrow:hidden">Author</span>
        <span>Date</span>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] pt-0 pr-[15px] pb-0 pl-[23px] compact:pl-[14px] compact:pr-[8px]"
        ref={scroll}
        tabIndex={0}
        aria-label="Navigate history nodes"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const target = event.target as HTMLElement;
          const focusedRow = target.closest<HTMLElement>("[data-node-id]");
          if (target !== event.currentTarget && !focusedRow) return;
          const currentId = focusedRow?.dataset.nodeId ?? (selected && selectionId(selected));
          const current = graph.rows.findIndex((row) => row.node.id === currentId);
          const nextIndex = current < 0 ? 0 : current + (event.key === "ArrowDown" ? 1 : -1);
          const next = graph.rows[nextIndex];
          if (!next) return;
          event.preventDefault();
          select(nodeSelection(next));
          const viewport = event.currentTarget;
          const top = nextIndex * ROW_HEIGHT;
          if (top < viewport.scrollTop) viewport.scrollTop = top;
          else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight)
            viewport.scrollTop = top + ROW_HEIGHT - viewport.clientHeight;
          setScrollTop(viewport.scrollTop);
          requestAnimationFrame(() => {
            Array.from(viewport.querySelectorAll<HTMLButtonElement>("[data-node-id]"))
              .find((button) => button.dataset.nodeId === next.node.id)
              ?.focus({ preventScroll: true });
          });
        }}
      >
        {graph.rows.length === 0 ? (
          <EmptyMessage
            icon={Search}
            title={nodes.length ? "No matching commits" : "No commits yet"}
            description={
              nodes.length
                ? "Try a different search or branch filter."
                : "Uncommitted work appears here as soon as files change."
            }
          />
        ) : (
          <div
            className="relative min-w-0"
            style={
              {
                height: graph.rows.length * ROW_HEIGHT,
                "--graph-width": `${graph.width}px`,
              } as React.CSSProperties
            }
            role="list"
            aria-label="History nodes"
          >
            {virtual.map((row, offset) => {
              const selection = nodeSelection(row);
              const isSelected = selected && selectionId(selected) === row.node.id;
              const inComparison =
                comparison &&
                [selectionId(comparison.from), selectionId(comparison.to)].includes(row.node.id);
              const localBranches = row.node.worktree
                ? row.node.worktree.branch
                  ? [row.node.worktree.branch]
                  : []
                : refsFor(row.node.id)
                    .filter((ref) => ref.kind === "branch")
                    .map((ref) => ref.name);
              const branches = menuBranch
                ? localBranches.filter((name) => name === menuBranch)
                : localBranches;
              const workingCopies = row.node.worktree
                ? [row.node.worktree]
                : snapshot.worktrees.filter(
                    (tree) =>
                      tree.head === row.node.id && (!menuBranch || tree.branch === menuBranch),
                  );
              const dirtyCopies = workingCopies.filter(
                (tree) => tree.files.length > 0 && !tree.error && !tree.bare,
              );
              return (
                <div
                  className="absolute left-0 right-0 h-[42px]"
                  key={row.node.id}
                  style={{ top: (start + offset) * ROW_HEIGHT }}
                  role="listitem"
                >
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={<button type="button" />}
                      className={cn(
                        "grid grid-cols-[var(--graph-width)_minmax(0,1fr)_110px_68px] items-center w-full h-[42px] text-left border-b border-border/45 transition-colors duration-100 ease-linear bg-transparent p-0 hover:bg-graph-hover narrow:grid-cols-[var(--graph-width)_minmax(0,1fr)_65px]",
                        row.node.worktree
                          ? isSelected || inComparison
                            ? "bg-dirty/12 hover:bg-dirty/12"
                            : "bg-dirty/4 hover:bg-dirty/9"
                          : (isSelected || inComparison) &&
                              "bg-graph-selected hover:bg-graph-selected",
                      )}
                      aria-label={
                        row.node.worktree
                          ? `Uncommitted changes on ${row.node.worktree.branch ?? "detached HEAD"}`
                          : row.node.subject
                      }
                      aria-pressed={!!isSelected}
                      data-node-id={row.node.id}
                      tabIndex={isSelected ? 0 : -1}
                      onContextMenu={(event) => {
                        const target = event.target as HTMLElement;
                        setMenuBranch(
                          target.closest<HTMLElement>("[data-local-branch]")?.dataset.localBranch ??
                            null,
                        );
                      }}
                      onClick={(event) => {
                        if ((event.metaKey || event.ctrlKey) && canCompare(selection)) {
                          compare(selection);
                          return;
                        }
                        select(selection);
                      }}
                    >
                      <GraphVertex row={row} width={graph.width} />
                      <span className="flex items-center gap-[12px] min-w-0 pr-[16px] narrow:flex-col narrow:items-start narrow:gap-[2px] narrow:pr-[8px]">
                        <span
                          className={cn(
                            "min-w-0 truncate text-[12px] compact:text-[11px] compact:max-w-full",
                            row.node.worktree && "text-dirty font-medium",
                          )}
                        >
                          {row.node.subject}
                        </span>
                        <span className="flex items-center flex-none gap-[5px] max-w-[48%] overflow-hidden narrow:max-w-full narrow:empty:hidden">
                          {row.node.worktree ? (
                            <>
                              <Badge
                                className="h-[18px] py-0 px-[5px] rounded-[4px] text-[10px] leading-[1.333333]"
                                variant="dirty"
                                data-local-branch={row.node.worktree.branch ?? undefined}
                              >
                                {row.node.worktree.branch ?? "Detached HEAD"}
                              </Badge>
                              <span className="text-[10px] text-dirty whitespace-nowrap">
                                {row.node.worktree.files.length} files
                              </span>
                            </>
                          ) : (
                            refsFor(row.node.id)
                              .slice(0, 3)
                              .map((ref) => (
                                <Badge
                                  className="h-[18px] py-0 px-[5px] rounded-[4px] text-[10px] leading-[1.333333]"
                                  key={ref.fullName}
                                  data-local-branch={ref.kind === "branch" ? ref.name : undefined}
                                  style={{ "--ref-color": row.color } as React.CSSProperties}
                                  variant={
                                    ref.kind === "tag"
                                      ? "tag"
                                      : ref.kind === "remote"
                                        ? "outline"
                                        : "branch"
                                  }
                                >
                                  {ref.name}
                                </Badge>
                              ))
                          )}
                        </span>
                      </span>
                      <span className="truncate text-muted-foreground text-[11px] pr-[10px] narrow:hidden">
                        {row.node.commit?.author ?? "Working copy"}
                      </span>
                      <span className="truncate text-muted-foreground text-[11px] pr-0 tabular-nums compact:text-[10px]">
                        {row.node.commit ? dateLabel(row.node.commit.timestamp) : "Uncommitted"}
                      </span>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuGroup>
                        <ContextMenuLabel>
                          {row.node.worktree ? "Working changes" : shortHash(row.node.id)}
                        </ContextMenuLabel>
                        <ContextMenuItem
                          disabled={!canCompare(selection)}
                          onClick={() => compare(selection)}
                        >
                          <GitCompareArrows />
                          Diff with selected
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => select(selection)}>
                          Inspect {row.node.worktree ? "changes" : "commit"}
                        </ContextMenuItem>
                      </ContextMenuGroup>
                      {(branches.length > 0 || dirtyCopies.length > 0) && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuGroup>
                            {branches.map((branch) => (
                              <ContextMenuItem
                                key={branch}
                                onClick={() =>
                                  act({
                                    kind: "rename",
                                    branch,
                                    worktree:
                                      workingCopies.find((tree) => tree.branch === branch)?.path ??
                                      null,
                                  })
                                }
                              >
                                <Sparkles />
                                {branches.length === 1
                                  ? "Regenerate branch name with Codex…"
                                  : `Regenerate ${branch} with Codex…`}
                              </ContextMenuItem>
                            ))}
                            {dirtyCopies.map((tree) => (
                              <ContextMenuItem
                                key={tree.path}
                                variant="destructive"
                                onClick={() => act({ kind: "discard", worktree: tree.path })}
                              >
                                <Trash2 />
                                {dirtyCopies.length === 1
                                  ? "Discard uncommitted changes…"
                                  : `Discard changes on ${tree.branch ?? tree.path}…`}
                              </ContextMenuItem>
                            ))}
                            {branches
                              .filter((branch) =>
                                snapshot.refs.some(
                                  (ref) =>
                                    ref.kind === "branch" && ref.name === branch && ref.mergedInto,
                                ),
                              )
                              .map((branch) => {
                                const trees = snapshot.worktrees.filter(
                                  (tree) => tree.branch === branch,
                                );
                                return (
                                  <ContextMenuItem
                                    key={`delete:${branch}`}
                                    variant="destructive"
                                    disabled={trees.some(
                                      (tree) =>
                                        tree.path === snapshot.path ||
                                        tree.bare ||
                                        tree.locked !== null ||
                                        tree.prunable !== null ||
                                        tree.error !== null ||
                                        tree.files.length > 0,
                                    )}
                                    onClick={() =>
                                      act({
                                        kind: "delete",
                                        branch,
                                        worktree: trees[0]?.path ?? null,
                                      })
                                    }
                                  >
                                    <Trash2 />
                                    {branches.length === 1
                                      ? trees.length > 0
                                        ? "Delete branch and worktree…"
                                        : "Delete branch…"
                                      : `Delete ${branch}${trees.length > 0 ? " and worktree" : ""}…`}
                                  </ContextMenuItem>
                                );
                              })}
                          </ContextMenuGroup>
                        </>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuGroup>
                        <ContextMenuItem
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              row.node.worktree?.path ?? row.node.id,
                            );
                          }}
                        >
                          <Copy />
                          Copy {row.node.worktree ? "working copy path" : "commit hash"}
                        </ContextMenuItem>
                      </ContextMenuGroup>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </div>
        )}
        {snapshot.hasMore && (
          <div className="p-[20px] flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || snapshot.commits.length >= 20000}
              onClick={loadMore}
            >
              <ArrowDown data-icon="inline-start" />
              {busy
                ? "Loading history…"
                : snapshot.commits.length >= 20000
                  ? "20,000 commit limit reached"
                  : "Load older commits"}
            </Button>
          </div>
        )}
      </div>
      <div className="h-[34px] flex justify-between gap-[12px] items-center border-t border-border py-0 px-[23px] flex-none text-muted-foreground text-[10px] compact:h-[28px] compact:py-0 compact:px-[14px]">
        <div className="flex gap-[16px]">
          <span className="flex gap-[6px] items-center">
            <i className="size-[6px] rounded-full bg-commit-node" />
            Committed
          </span>
          <span className="flex gap-[6px] items-center">
            <i className="size-[6px] rounded-full border border-dirty" />
            Uncommitted
          </span>
        </div>
        <span className="narrow:hidden">Select a node, then right-click another to diff</span>
      </div>
    </section>
  );
}
