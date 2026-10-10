import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Copy,
  GitCompareArrows,
  GitFork,
  Search,
  SlidersHorizontal,
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
import { ancestorIds, layoutGraph, LANE_WIDTH, repositoryNodes, ROW_HEIGHT } from "@/lib/graph";
import type { GraphRow } from "@/lib/graph";
import type { Comparison, Selection, Snapshot } from "@/lib/models";
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
    <svg className="graph-vertex" width={width} height={ROW_HEIGHT} aria-hidden="true">
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
}) {
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
  const graph = useMemo(() => layoutGraph(filtered), [filtered]);
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
    <section className="history-pane" aria-label="Commit graph">
      <div className="history-heading">
        <div>
          <GitFork />
          <h1>Commit graph</h1>
          <span>{snapshot.commits.length.toLocaleString()} loaded</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Toggle graph filters"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal data-icon="inline-start" />
          Filters{(branch !== "all" || onlyChanges) && <span className="active-filter-dot" />}
        </Button>
      </div>
      <div className="graph-toolbar">
        <InputGroup>
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
        <div className="jump-error" role="alert">
          {jumpError}
        </div>
      )}
      {showFilters && (
        <div className="graph-filters">
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
          <label>
            <input
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
        className="graph-column-heading"
        style={{ "--graph-width": `${graph.width}px` } as React.CSSProperties}
      >
        <span>Graph</span>
        <span>Commit message</span>
        <span>Author</span>
        <span>Date</span>
      </div>
      <div
        className="history-scroll"
        ref={scroll}
        tabIndex={0}
        aria-label="Navigate history nodes"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const target = event.target as HTMLElement;
          const focusedRow = target.closest<HTMLElement>(".graph-row");
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
            Array.from(viewport.querySelectorAll<HTMLButtonElement>(".graph-row"))
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
            className="graph-table"
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
              return (
                <div
                  className="graph-row-position"
                  key={row.node.id}
                  style={{ top: (start + offset) * ROW_HEIGHT }}
                  role="listitem"
                >
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={<button type="button" />}
                      className={cn(
                        "graph-row",
                        isSelected && "selected",
                        inComparison && "compared",
                        row.node.worktree && "working-row",
                      )}
                      aria-label={
                        row.node.worktree
                          ? `Uncommitted changes on ${row.node.worktree.branch ?? "detached HEAD"}`
                          : row.node.subject
                      }
                      aria-pressed={!!isSelected}
                      data-node-id={row.node.id}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={(event) => {
                        if ((event.metaKey || event.ctrlKey) && canCompare(selection)) {
                          compare(selection);
                          return;
                        }
                        select(selection);
                      }}
                    >
                      <GraphVertex row={row} width={graph.width} />
                      <span className="graph-message">
                        <span className="graph-subject">{row.node.subject}</span>
                        <span className="graph-refs">
                          {row.node.worktree ? (
                            <>
                              <Badge variant="dirty">
                                {row.node.worktree.branch ?? "Detached HEAD"}
                              </Badge>
                              <span className="dirty-file-count">
                                {row.node.worktree.files.length} files
                              </span>
                            </>
                          ) : (
                            refsFor(row.node.id)
                              .slice(0, 3)
                              .map((ref) => (
                                <Badge
                                  key={ref.fullName}
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
                      <span className="graph-author">
                        {row.node.commit?.author ?? "Working copy"}
                      </span>
                      <span className="graph-date">
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
          <div className="load-more">
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
      <div className="graph-bottom">
        <div className="graph-legend">
          <span>
            <i className="legend-dot commit-dot" />
            Committed
          </span>
          <span>
            <i className="legend-dot dirty-dot" />
            Uncommitted
          </span>
        </div>
        <span>Select a node, then right-click another to diff</span>
      </div>
    </section>
  );
}
