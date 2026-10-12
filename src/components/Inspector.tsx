import { AppTooltip } from "@/components/AppTooltip";
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  LockKeyhole,
  PanelBottomClose,
  PanelBottomOpen,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { repositoryApi, makeDiffRequest } from "@/lib/repository";
import { fileStatus, selectionId, worktreeCounts } from "@/lib/models";
import type { Comparison, DiffMode, FileChange, Selection, Snapshot } from "@/lib/models";
import { cn } from "@/lib/utils";
import { mediaKind } from "@/lib/media";
import {
  CopyButton,
  EmptyMessage,
  ErrorMessage,
  fullDate,
  Loading,
  shortHash,
  shortPath,
} from "./common";
import { DiffView } from "./DiffView";
import { MediaView } from "./MediaView";
import { ResizableSplit } from "./ResizableSplit";

const statusLabels: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  U: "Conflict",
  "?": "Untracked",
};

export type InspectorView = {
  filePath: string | null;
  mode: DiffMode;
  metadata: boolean;
};

export function selectionLabel(selection: Selection, snapshot: Snapshot): string {
  if (selection.kind === "commit") return shortHash(selection.oid);
  return `${snapshot.worktrees.find((tree) => tree.path === selection.path)?.branch ?? "Detached HEAD"} · working`;
}

export function Inspector({
  snapshot,
  selected,
  comparison,
  close,
  clearComparison,
  select,
  narrow,
  previewOpen,
  togglePreview,
  view,
  changeView,
}: {
  snapshot: Snapshot;
  selected: Selection;
  comparison: Comparison | null;
  close: () => void;
  clearComparison: () => void;
  select: (selection: Selection) => void;
  narrow: boolean;
  previewOpen: boolean;
  togglePreview: () => void;
  view: InspectorView;
  changeView: (patch: Partial<InspectorView>) => void;
}) {
  const { filePath, mode, metadata } = view;
  const detailKey = [
    snapshot.commonDir,
    selectionId(selected),
    comparison ? `${selectionId(comparison.from)}:${selectionId(comparison.to)}` : "",
    snapshot.scannedAt,
  ];
  const detail = useQuery({
    queryKey: ["detail", ...detailKey],
    queryFn: () => repositoryApi.detail(snapshot.commonDir, selected, comparison),
    placeholderData: keepPreviousData,
  });
  const target = comparison?.to ?? selected;
  const worktreeSelection =
    target.kind === "worktree"
      ? target
      : comparison?.from.kind === "worktree"
        ? comparison.from
        : null;
  const tree = snapshot.worktrees.find((tree) => tree.path === worktreeSelection?.path);
  const counts = tree ? worktreeCounts(tree) : null;
  const files = useMemo(
    () =>
      (detail.data?.files ?? []).filter((file) => {
        if (!tree || comparison || mode === "combined") return true;
        if (mode === "staged") return file.indexStatus !== " " && file.indexStatus !== "?";
        return file.worktreeStatus !== " " || file.indexStatus === "?";
      }),
    [detail.data, tree, comparison, mode],
  );
  const selectedFile = files.find((file) => file.path === filePath) ?? files[0];
  const isMedia = !!selectedFile && mediaKind(selectedFile.path) !== null;
  const diff = useQuery({
    queryKey: ["diff", ...detailKey, selectedFile?.path, mode],
    enabled: !!selectedFile && previewOpen && !isMedia,
    queryFn: () =>
      repositoryApi.diff(
        makeDiffRequest(snapshot.commonDir, selected, comparison, selectedFile!, mode),
      ),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey.at(-2) === selectedFile?.path &&
      previousQuery?.queryKey.at(-1) === mode
        ? previousData
        : undefined,
  });
  const media = useQuery({
    queryKey: [
      "media",
      ...detailKey.slice(0, -1),
      selectedFile?.path,
      selectedFile?.oldPath,
      mode,
      snapshot.scannedAt,
    ],
    enabled: !!selectedFile && previewOpen && isMedia && !detail.isPlaceholderData,
    queryFn: () =>
      repositoryApi.media(
        makeDiffRequest(snapshot.commonDir, selected, comparison, selectedFile!, mode),
      ),
    gcTime: 0,
    placeholderData: (previousData, previousQuery) =>
      JSON.stringify(previousQuery?.queryKey.slice(0, -1)) ===
      JSON.stringify([
        "media",
        ...detailKey.slice(0, -1),
        selectedFile?.path,
        selectedFile?.oldPath,
        mode,
      ])
        ? previousData
        : undefined,
  });
  const preview = isMedia ? media : diff;
  const title = comparison
    ? "Compare changes"
    : tree
      ? (tree.branch ?? "Detached HEAD")
      : "Commit details";
  const summary = detail.data?.message.split("\n")[0];

  return (
    <aside
      className="flex-1 flex flex-col min-h-0 min-w-0 bg-inspector overflow-hidden"
      aria-label={comparison ? "Comparison diff" : "Selection details"}
    >
      <div className="flex items-center gap-[10px] py-0 px-[18px] h-[54px] flex-none compact:h-[40px]">
        {comparison ? (
          <GitCompareArrows className="size-[17px] text-primary flex-none" />
        ) : tree ? (
          <GitBranch className="size-[17px] text-primary flex-none" />
        ) : (
          <GitCommitHorizontal className="size-[17px] text-primary flex-none" />
        )}
        <h2 className="flex-1 min-w-0 truncate text-[14px] font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close details">
          <X />
        </Button>
      </div>
      <div className="pt-0 px-[18px] pb-[13px] flex-none max-h-[35%] overflow-y-auto compact:max-h-[28%] compact:pb-[8px]">
        {comparison ? (
          <>
            <div className="flex flex-wrap items-center gap-[7px] mb-[8px]">
              <Badge
                className="max-w-full text-[10px] leading-[1.333333]"
                variant={comparison.from.kind === "worktree" ? "dirty" : "branch"}
              >
                {selectionLabel(comparison.from, snapshot)}
              </Badge>
              <ArrowRight className="size-[13px] text-muted-foreground" />
              <Badge
                className="max-w-full text-[10px] leading-[1.333333]"
                variant={comparison.to.kind === "worktree" ? "dirty" : "branch"}
              >
                {selectionLabel(comparison.to, snapshot)}
              </Badge>
            </div>
            <Button size="xs" variant="ghost" onClick={clearComparison}>
              Back to selection
            </Button>
          </>
        ) : tree ? (
          <>
            <div className="flex items-center gap-[9px] mb-[8px]">
              <span className="inline-block size-[7px] flex-none rounded-full bg-dirty" />
              <strong className="text-[12px] font-medium text-dirty">
                {tree.files.length} uncommitted {tree.files.length === 1 ? "file" : "files"}
              </strong>
              <Badge
                className="ml-auto text-[10px] leading-[1.333333] compact:hidden"
                variant="dirty"
              >
                Working copy
              </Badge>
            </div>
            <div className="flex gap-[6px] items-center text-muted-foreground font-mono text-[10px]">
              <AppTooltip content={tree.path}>
                <span className="min-w-0 truncate">{shortPath(tree.path)}</span>
              </AppTooltip>
              <CopyButton value={tree.path} label="Copy working copy path" />
            </div>
            {tree.locked !== null && (
              <div className="flex items-center gap-[6px] text-muted-foreground text-[11px]">
                <LockKeyhole className="size-[12px]" />
                Locked{tree.locked && `: ${tree.locked}`}
              </div>
            )}
            {counts && (
              <div className="flex gap-[16px] mt-[10px] text-[11px] text-muted-foreground compact:hidden">
                <span>{counts.staged} staged</span>
                <span>{counts.unstaged} modified</span>
                <span>{counts.untracked} untracked</span>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="text-[14px] font-medium leading-[1.6] mt-0 mx-0 mb-[10px]">
              {summary ?? "Loading commit…"}
            </h3>
            <div className="flex justify-between gap-[12px] text-muted-foreground text-[11px]">
              {detail.data?.author}
              <span>{detail.data && fullDate(detail.data.timestamp)}</span>
            </div>
            <div className="flex items-center gap-[4px] mt-[9px] min-w-0 text-muted-foreground">
              <code className="overflow-hidden text-ellipsis text-[10px]">
                {target.kind === "commit" ? target.oid : ""}
              </code>
              {target.kind === "commit" && (
                <CopyButton value={target.oid} label="Copy commit hash" />
              )}
            </div>
          </>
        )}
        {!comparison && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => changeView({ metadata: !metadata })}
            aria-expanded={metadata}
          >
            <ChevronRight className={cn(metadata && "rotate-90")} data-icon="inline-start" />
            {metadata ? "Hide metadata" : "Show metadata"}
          </Button>
        )}
        {metadata && detail.data && (
          <div className="text-muted-foreground text-[11px] pt-[8px] px-0 pb-0">
            {tree && (
              <p>
                HEAD <code>{shortHash(tree.head)}</code>
              </p>
            )}
            {!tree && <p>{detail.data.email}</p>}
            {detail.data.parents
              .filter((oid) => !/^0+$/.test(oid))
              .map((oid) => (
                <div className="flex items-center gap-[8px]" key={oid}>
                  <span>Parent</span>
                  <Button variant="link" size="xs" onClick={() => select({ kind: "commit", oid })}>
                    {shortHash(oid)}
                  </Button>
                </div>
              ))}
            {!tree && detail.data.message.includes("\n") && (
              <p className="whitespace-pre-wrap leading-[1.65]">
                {detail.data.message.slice(detail.data.message.indexOf("\n") + 1).trim()}
              </p>
            )}
          </div>
        )}
      </div>
      <Separator />
      {tree && !comparison && (
        <div className="flex-none pt-[12px] px-[18px] pb-[4px] compact:pt-[6px]">
          <ToggleGroup
            className="w-full"
            size="sm"
            value={[mode]}
            onValueChange={(values) => {
              if (values[0]) changeView({ mode: values[0] as DiffMode });
            }}
            spacing={0}
            aria-label="Working changes view"
          >
            <ToggleGroupItem className="flex-1 text-[11px] leading-[1.428571]" value="combined">
              All changes
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1 text-[11px] leading-[1.428571]" value="staged">
              Staged
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1 text-[11px] leading-[1.428571]" value="unstaged">
              Unstaged
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {detail.isPending ? (
        <Loading text="Reading changed files…" />
      ) : detail.isError ? (
        <div className="py-[12px] px-[18px]">
          <ErrorMessage
            title="Could not read changes"
            error={detail.error}
            retry={() => {
              void detail.refetch();
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-[7px] pt-[14px] px-[18px] pb-[8px] text-muted-foreground text-[11px] flex-none compact:pt-[6px]">
            <strong className="text-foreground font-medium">Changed files</strong>
            <span>{files.length}</span>
            <span className="ml-auto">Status</span>
            <AppTooltip content={previewOpen ? "Hide diff preview" : "Show diff preview"}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={previewOpen ? "Hide diff preview" : "Show diff preview"}
                aria-expanded={previewOpen}
                onClick={togglePreview}
              >
                {previewOpen ? <PanelBottomClose /> : <PanelBottomOpen />}
              </Button>
            </AppTooltip>
          </div>
          <ResizableSplit
            id={narrow ? "inspector-stacked" : "inspector-horizontal"}
            orientation="vertical"
            className="flex-1 min-h-0 min-w-0"
            primarySize={narrow ? 64 : 120}
            primaryMin={48}
            secondaryMin={120}
            label="Resize file list and diff preview"
            primary={
              <div
                className="flex-1 min-h-0 overflow-y-auto pt-0 px-[10px] pb-[10px] [scrollbar-gutter:stable]"
                aria-label="Changed files"
              >
                {files.map((file: FileChange) => {
                  const status = fileStatus(file);
                  return (
                    <AppTooltip
                      content={`${file.oldPath ? `${file.oldPath} → ` : ""}${file.path} · ${statusLabels[status] ?? status}`}
                      key={file.path}
                    >
                      <button
                        className={cn(
                          "w-full flex items-center gap-[9px] py-0 px-[8px] h-[33px] text-left rounded-[4px] font-mono text-[11px] bg-transparent hover:bg-file-hover",
                          file.path === selectedFile?.path &&
                            "bg-file-selected hover:bg-file-selected",
                        )}
                        aria-pressed={file.path === selectedFile?.path}
                        onClick={() => changeView({ filePath: file.path })}
                      >
                        <span
                          className={cn(
                            "text-dirty text-[10px] font-bold flex-none w-[12px]",
                            status === "?" && "text-tag",
                            status === "D" && "text-removed",
                            status === "U" && "text-removed",
                          )}
                        >
                          {status}
                        </span>
                        <span className="flex-1 truncate">{file.path}</span>
                        {file.additions !== null && (
                          <span className="text-added">+{file.additions}</span>
                        )}
                        {file.deletions !== null && (
                          <span className="text-removed">−{file.deletions}</span>
                        )}
                      </button>
                    </AppTooltip>
                  );
                })}
              </div>
            }
            secondary={
              previewOpen ? (
                <div
                  className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden"
                  aria-label="Diff preview"
                >
                  {files.length === 0 ? (
                    <EmptyMessage
                      icon={FileCode2}
                      title="No changed files"
                      description={
                        comparison
                          ? "These versions have identical file contents."
                          : tree
                            ? "This view has no changes. Try another view or refresh the repository."
                            : "This commit has no file changes relative to its first parent."
                      }
                    />
                  ) : preview.isPending ? (
                    <Loading text={isMedia ? "Reading media…" : "Reading diff…"} />
                  ) : preview.isError ? (
                    <div className="py-[12px] px-[18px]">
                      <ErrorMessage
                        title={isMedia ? "Could not read media" : "Could not read diff"}
                        error={preview.error}
                        retry={() => {
                          void preview.refetch();
                        }}
                      />
                    </div>
                  ) : isMedia && media.data && selectedFile ? (
                    <MediaView media={media.data} file={selectedFile.path} close={togglePreview} />
                  ) : diff.data && selectedFile ? (
                    <DiffView diff={diff.data} file={selectedFile.path} close={togglePreview} />
                  ) : null}
                </div>
              ) : undefined
            }
          />
        </>
      )}
    </aside>
  );
}
