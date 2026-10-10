import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  LockKeyhole,
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

const statusLabels: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  U: "Conflict",
  "?": "Untracked",
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
}: {
  snapshot: Snapshot;
  selected: Selection;
  comparison: Comparison | null;
  close: () => void;
  clearComparison: () => void;
  select: (selection: Selection) => void;
}) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [mode, setMode] = useState<DiffMode>("combined");
  const [metadata, setMetadata] = useState(false);
  const detailKey = [
    snapshot.commonDir,
    selectionId(selected),
    comparison ? `${selectionId(comparison.from)}:${selectionId(comparison.to)}` : "",
    snapshot.scannedAt,
  ];
  const detail = useQuery({
    queryKey: ["detail", ...detailKey],
    queryFn: () => repositoryApi.detail(snapshot.commonDir, selected, comparison),
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
  const file = files.find((file) => file.path === filePath) ?? files[0];
  const diff = useQuery({
    queryKey: ["diff", ...detailKey, file?.path, mode],
    enabled: !!file,
    queryFn: () =>
      repositoryApi.diff(makeDiffRequest(snapshot.commonDir, selected, comparison, file!, mode)),
  });
  const title = comparison
    ? "Compare changes"
    : tree
      ? (tree.branch ?? "Detached HEAD")
      : "Commit details";
  const summary = detail.data?.message.split("\n")[0];

  return (
    <aside className="inspector" aria-label={comparison ? "Comparison diff" : "Selection details"}>
      <div className="inspector-heading">
        {comparison ? <GitCompareArrows /> : tree ? <GitBranch /> : <GitCommitHorizontal />}
        <h2>{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close details">
          <X />
        </Button>
      </div>
      <div className="inspector-summary">
        {comparison ? (
          <>
            <div className="comparison-direction">
              <Badge variant={comparison.from.kind === "worktree" ? "dirty" : "branch"}>
                {selectionLabel(comparison.from, snapshot)}
              </Badge>
              <ArrowRight />
              <Badge variant={comparison.to.kind === "worktree" ? "dirty" : "branch"}>
                {selectionLabel(comparison.to, snapshot)}
              </Badge>
            </div>
            <Button size="xs" variant="ghost" onClick={clearComparison}>
              Back to selection
            </Button>
          </>
        ) : tree ? (
          <>
            <div className="working-summary">
              <span className="status-dot dirty" />
              <strong>
                {tree.files.length} uncommitted {tree.files.length === 1 ? "file" : "files"}
              </strong>
              <Badge variant="dirty">Working copy</Badge>
            </div>
            <div className="working-location">
              <span title={tree.path}>{shortPath(tree.path)}</span>
              <CopyButton value={tree.path} label="Copy working copy path" />
            </div>
            {tree.locked !== null && (
              <div className="working-lock">
                <LockKeyhole />
                Locked{tree.locked && `: ${tree.locked}`}
              </div>
            )}
            {counts && (
              <div className="working-counts">
                <span>{counts.staged} staged</span>
                <span>{counts.unstaged} modified</span>
                <span>{counts.untracked} untracked</span>
              </div>
            )}
          </>
        ) : (
          <>
            <h3>{summary ?? "Loading commit…"}</h3>
            <div className="commit-author">
              {detail.data?.author}
              <span>{detail.data && fullDate(detail.data.timestamp)}</span>
            </div>
            <div className="commit-hash">
              <code>{target.kind === "commit" ? target.oid : ""}</code>
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
            onClick={() => setMetadata((value) => !value)}
            aria-expanded={metadata}
          >
            <ChevronRight className={cn(metadata && "rotate-90")} data-icon="inline-start" />
            {metadata ? "Hide metadata" : "Show metadata"}
          </Button>
        )}
        {metadata && detail.data && (
          <div className="commit-metadata">
            {tree && (
              <p>
                HEAD <code>{shortHash(tree.head)}</code>
              </p>
            )}
            {!tree && <p>{detail.data.email}</p>}
            {detail.data.parents
              .filter((oid) => !/^0+$/.test(oid))
              .map((oid) => (
                <div key={oid}>
                  <span>Parent</span>
                  <Button variant="link" size="xs" onClick={() => select({ kind: "commit", oid })}>
                    {shortHash(oid)}
                  </Button>
                </div>
              ))}
            {!tree && detail.data.message.includes("\n") && (
              <p className="commit-body">
                {detail.data.message.slice(detail.data.message.indexOf("\n") + 1).trim()}
              </p>
            )}
          </div>
        )}
      </div>
      <Separator />
      {tree && !comparison && (
        <div className="diff-mode">
          <ToggleGroup
            size="sm"
            value={[mode]}
            onValueChange={(values) => {
              if (values[0]) setMode(values[0] as DiffMode);
            }}
            spacing={0}
            aria-label="Working changes view"
          >
            <ToggleGroupItem value="combined">All changes</ToggleGroupItem>
            <ToggleGroupItem value="staged">Staged</ToggleGroupItem>
            <ToggleGroupItem value="unstaged">Unstaged</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {detail.isPending ? (
        <Loading text="Reading changed files…" />
      ) : detail.isError ? (
        <div className="inspector-error">
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
          <div className="files-heading">
            <strong>Changed files</strong>
            <span>{files.length}</span>
            <span className="files-heading-status">Status</span>
          </div>
          <div className="changed-files" aria-label="Changed files">
            {files.map((file: FileChange) => {
              const status = fileStatus(file);
              return (
                <button
                  key={file.path}
                  className={cn(
                    "changed-file",
                    file.path === (filePath ?? files[0]?.path) && "active",
                  )}
                  aria-pressed={file.path === (filePath ?? files[0]?.path)}
                  onClick={() => setFilePath(file.path)}
                  title={`${file.oldPath ? `${file.oldPath} → ` : ""}${file.path} · ${statusLabels[status] ?? status}`}
                >
                  <span
                    className={cn(
                      "file-status",
                      status === "?" && "untracked",
                      status === "D" && "deleted",
                      status === "U" && "conflict",
                    )}
                  >
                    {status}
                  </span>
                  <span className="changed-file-path">{file.path}</span>
                  {file.additions !== null && <span className="added">+{file.additions}</span>}
                  {file.deletions !== null && <span className="removed">−{file.deletions}</span>}
                </button>
              );
            })}
          </div>
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
          ) : diff.isPending ? (
            <Loading text="Reading diff…" />
          ) : diff.isError ? (
            <div className="inspector-error">
              <ErrorMessage
                title="Could not read diff"
                error={diff.error}
                retry={() => {
                  void diff.refetch();
                }}
              />
            </div>
          ) : diff.data && file ? (
            <DiffView diff={diff.data} file={file.path} />
          ) : null}
        </>
      )}
    </aside>
  );
}
