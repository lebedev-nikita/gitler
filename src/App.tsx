import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronRight,
  FolderOpen,
  ExternalLink,
  CloudDownload,
  GitBranch,
  GitCompareArrows,
  GitFork,
  Info,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CommitGraph } from "@/components/CommitGraph";
import { GraphActions } from "@/components/GraphActions";
import { Inspector } from "@/components/Inspector";
import type { InspectorView } from "@/components/Inspector";
import { ResizableSplit } from "@/components/ResizableSplit";
import { useNarrowLayout, useStoredBoolean } from "@/hooks/use-layout";
import { CopyButton, ErrorMessage, Loading, shortPath } from "@/components/common";
import { AppTooltip } from "@/components/AppTooltip";
import { FolderCopy } from "@/components/FolderCopy";
import { DEMO_PATH } from "@/lib/demo";
import { desktop, localRepository, isDemo, repositoryApi } from "@/lib/repository";
import { selectionId } from "@/lib/models";
import type { Commit, Comparison, GraphAction, Selection } from "@/lib/models";
import { cn } from "@/lib/utils";
import { mergeCommitHistory } from "@/lib/graph";
import appIcon from "../assets/icons/favicon.png";

const initialInspectorView: InspectorView = { filePath: null, mode: "combined", metadata: false };

function savedPath() {
  try {
    return localStorage.getItem("gitler.repository");
  } catch {
    return null;
  }
}

export default function App() {
  const queryClient = useQueryClient();
  const [path, setPath] = useState<string | null>(localRepository ? null : DEMO_PATH);
  const [limit, setLimit] = useState(400);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [inspectorView, setInspectorView] = useState(initialInspectorView);
  const [inspectorOpen, setInspectorOpen] = useStoredBoolean("gitler.inspector-open", true);
  const [previewOpen, setPreviewOpen] = useStoredBoolean("gitler.diff-preview-open", true);
  const narrow = useNarrowLayout();
  const [openDialog, setOpenDialog] = useState(false);
  const [graphAction, setGraphAction] = useState<GraphAction | null>(null);
  const [remotesDialog, setRemotesDialog] = useState(false);
  const [shortcutsDialog, setShortcutsDialog] = useState(false);
  const [inputPath, setInputPath] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [resolved, setResolved] = useState<{ commonDir: string; commits: Commit[] } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastRepository = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const loadedPath = useRef<string | null>(null);
  const repository = useQuery({
    queryKey: ["repository", path, limit],
    queryFn: () => repositoryApi.snapshot(path!, limit),
    enabled: !!path,
    refetchInterval: 15000,
  });
  const snapshot = useMemo(() => {
    const data = repository.data;
    if (!data || resolved?.commonDir !== data.commonDir) return data;
    return { ...data, commits: mergeCommitHistory(data.commits, resolved.commits) };
  }, [repository.data, resolved]);
  const remoteSync = useQuery({
    queryKey: ["remote-sync", snapshot?.commonDir],
    enabled:
      localRepository && !!snapshot && !isDemo(snapshot.commonDir) && snapshot.remotes.length > 0,
    queryFn: async () => {
      try {
        await repositoryApi.fetchRemotes(snapshot!.commonDir);
        return null;
      } finally {
        await queryClient.invalidateQueries(
          { queryKey: ["repository", path] },
          { cancelRefetch: false },
        );
      }
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60000,
  });
  const [remoteOpenError, setRemoteOpenError] = useState<unknown>(null);
  const githubRemotes = snapshot?.remotes.filter(
    (remote) => remote.webUrl && new URL(remote.webUrl).hostname === "github.com",
  );
  const primaryRemote =
    githubRemotes?.find((remote) => remote.name === "origin") ??
    githubRemotes?.[0] ??
    snapshot?.remotes.find((remote) => remote.name === "origin" && remote.webUrl) ??
    snapshot?.remotes.find((remote) => remote.webUrl) ??
    snapshot?.remotes.find((remote) => remote.name === "origin") ??
    snapshot?.remotes[0];
  const remoteLabel =
    primaryRemote?.webUrl && new URL(primaryRemote.webUrl).hostname === "github.com"
      ? "GitHub"
      : "Remote";
  const openRemote = async (name: string) => {
    if (!snapshot) return;
    setRemoteOpenError(null);
    try {
      await repositoryApi.openRemote(snapshot.commonDir, name);
    } catch (error) {
      setRemoteOpenError(error);
      setRemotesDialog(true);
    }
  };
  const refreshBusy = repository.isLoading || refreshing;
  const refreshRepository = useCallback(async () => {
    if (!path) return;
    setRefreshing(true);
    try {
      if (
        localRepository &&
        repository.data &&
        !isDemo(repository.data.commonDir) &&
        repository.data.remotes.length
      )
        await remoteSync.refetch({ cancelRefetch: false });
      else await repository.refetch({ cancelRefetch: false });
    } finally {
      setRefreshing(false);
    }
  }, [path, repository.data, repository.refetch, remoteSync.refetch]);
  const demo = !!snapshot && isDemo(snapshot.commonDir);

  const select = useCallback((selection: Selection) => {
    setSelected(selection);
    setComparison(null);
    setInspectorView(initialInspectorView);
  }, []);
  const openRepository = useCallback(
    async (requested: string) => {
      if (!requested.trim()) return;
      const sequence = ++requestSequence.current;
      setOpening(true);
      setOpenError(null);
      try {
        const target = await repositoryApi.open(requested);
        if (sequence !== requestSequence.current) return;
        if (target === null || target === loadedPath.current) {
          setOpenDialog(false);
          return;
        }
        const result = await queryClient.fetchQuery({
          queryKey: ["repository", target, 400],
          queryFn: () => repositoryApi.snapshot(target, 400, false),
          staleTime: 0,
        });
        if (sequence !== requestSequence.current) return;
        loadedPath.current = target;
        setGraphAction(null);
        setPath(target);
        setLimit(400);
        setComparison(null);
        setInspectorView(initialInspectorView);
        setOpenDialog(false);
        const initialTree = result.worktrees.find((tree) => tree.files.length > 0 && !tree.error);
        setSelected(
          initialTree
            ? { kind: "worktree", path: initialTree.path }
            : result.commits[0]
              ? { kind: "commit", oid: result.commits[0].oid }
              : null,
        );
        if (!isDemo(result.commonDir)) {
          try {
            localStorage.setItem("gitler.repository", result.commonDir);
          } catch {
            /* Storage may be disabled. */
          }
        }
      } catch (error) {
        if (sequence === requestSequence.current) {
          setOpenError(error);
          setInputPath(requested);
          setOpenDialog(true);
        }
      } finally {
        if (sequence === requestSequence.current) setOpening(false);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!snapshot || lastRepository.current === snapshot.commonDir) return;
    lastRepository.current = snapshot.commonDir;
    setRemoteOpenError(null);
    const firstDirty = snapshot.worktrees.find((tree) => tree.files.length > 0 && !tree.error);
    if (firstDirty) select({ kind: "worktree", path: firstDirty.path });
    else if (snapshot.commits[0]) select({ kind: "commit", oid: snapshot.commits[0].oid });
  }, [snapshot, select]);

  useEffect(() => {
    if (!localRepository) return;
    let disposed = false;
    const unsubscribe = desktop
      ? getCurrentWebviewWindow().listen<string>("repository-open", (event) => {
          if (!disposed) void openRepository(event.payload);
        })
      : Promise.resolve(() => {});
    void unsubscribe
      .then(async () => {
        if (disposed) return;
        const initial = (await repositoryApi.launchPath()) ?? savedPath();
        if (!disposed && initial) void openRepository(initial);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setOpenError(error);
          setOpenDialog(true);
        }
      });
    return () => {
      disposed = true;
      void unsubscribe.then(
        (unlisten) => unlisten(),
        () => undefined,
      );
    };
  }, [openRepository]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setOpenDialog(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refreshRepository();
      }
      if (
        event.metaKey &&
        event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        event.code === "KeyB" &&
        snapshot &&
        selected
      ) {
        event.preventDefault();
        if (!event.repeat) setInspectorOpen((value) => !value);
      }
      if (!editing && event.key === "?" && !openDialog && !remotesDialog) setShortcutsDialog(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [refreshRepository, openDialog, remotesDialog, snapshot, selected, setInspectorOpen]);

  const compare = (other: Selection) => {
    if (
      !selected ||
      selectionId(selected) === selectionId(other) ||
      (selected.kind === "worktree" && other.kind === "worktree")
    )
      return;
    setComparison({ from: selected, to: other });
    setInspectorView(initialInspectorView);
    setInspectorOpen(true);
    setPreviewOpen(true);
  };

  return (
    <main className="h-dvh flex flex-col overflow-hidden">
      <header className="flex-none flex items-center gap-[10px] h-[54px] py-0 px-[18px] bg-card border-b border-border compact:py-0 compact:px-[10px] compact:gap-[5px]">
        <img src={appIcon} alt="" width={28} height={28} className="size-[28px] flex-none" />
        <strong className="text-[16px] font-[650] tracking-[-0.025em]">Gitler</strong>
        <span className="h-[17px] w-[1px] my-0 mx-[3px] bg-border" />
        <div className="flex items-center gap-[3px] min-w-0">
          {primaryRemote?.webUrl ? (
            <AppTooltip
              content={
                demo
                  ? "Demo remote — open a local repository to use this action"
                  : primaryRemote.webUrl
              }
            >
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-w-0 shrink")}
                href={primaryRemote.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${snapshot!.name} on ${remoteLabel}`}
                aria-disabled={demo || undefined}
                onClick={(event) => {
                  event.preventDefault();
                  if (!demo) void openRemote(primaryRemote.name);
                }}
              >
                <GitBranch data-icon="inline-start" />
                <span className="truncate">{snapshot!.name}</span>
                <span className="compact:hidden">{remoteLabel}</span>
                <ExternalLink data-icon="inline-end" />
              </a>
            </AppTooltip>
          ) : (
            <span className="flex items-center gap-[5px] min-w-0 text-[12px]">
              <GitBranch className="size-[13px] flex-none" />
              <span className="truncate">{snapshot?.name ?? "No repository"}</span>
            </span>
          )}
          {primaryRemote && !primaryRemote.webUrl && (
            <CopyButton value={primaryRemote.url} label={`Copy ${primaryRemote.name} remote URL`} />
          )}
          {snapshot && (
            <CopyButton
              key={snapshot.path}
              value={snapshot.path}
              label="Copy repository path"
              title={`Copy repository path: ${snapshot.path}`}
              size="icon-sm"
              icon={FolderCopy}
            />
          )}
        </div>
        {demo && (
          <Badge className="compact:hidden" variant="outline">
            Demo
          </Badge>
        )}
        <div className="flex-1" />
        <AppTooltip content="Open repository (⌘ / Ctrl O)">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Open repository"
            aria-keyshortcuts="Meta+O Control+O"
            onClick={() => {
              setInputPath("");
              setOpenError(null);
              setOpenDialog(true);
            }}
          >
            <FolderOpen />
          </Button>
        </AppTooltip>
        <AppTooltip content="Refresh (⌘/Ctrl R)">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh repository"
            disabled={!path || refreshBusy}
            onClick={() => {
              void refreshRepository();
            }}
          >
            <RefreshCw className={refreshBusy ? "animate-spin" : undefined} />
          </Button>
        </AppTooltip>
        <AppTooltip
          content={inspectorOpen ? "Hide details panel (⌘⌥B)" : "Show details panel (⌘⌥B)"}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={inspectorOpen ? "Hide details panel" : "Show details panel"}
            aria-keyshortcuts="Meta+Alt+B"
            aria-expanded={inspectorOpen && !!selected}
            disabled={!snapshot || !selected}
            onClick={() => setInspectorOpen((value) => !value)}
          >
            {inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </AppTooltip>
        <AppTooltip content="Keyboard shortcuts (?)">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsDialog(true)}
          >
            <Info />
          </Button>
        </AppTooltip>
      </header>
      {!path && opening ? (
        <div className="flex-1 grid place-items-center p-[30px]">
          <Loading text="Reading repository history…" />
        </div>
      ) : !path ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-[24px] py-[40px] px-[24px]">
          <div className="size-[64px] grid place-items-center text-primary bg-card border border-border rounded-[12px]">
            <GitFork className="size-[34px] [stroke-width:1.3]" />
          </div>
          <h1 className="text-[28px] font-[550] tracking-[-0.03em] mt-[8px] mx-0 mb-[-12px] text-center compact:text-[24px]">
            Every branch. Nothing left behind.
          </h1>
          <p className="text-muted-foreground text-[14px] leading-[1.8] max-w-[475px] text-center m-0">
            See your repository's history and find uncommitted work across every branch, without
            switching your working copy.
          </p>
          <Button onClick={() => setOpenDialog(true)}>
            <FolderOpen data-icon="inline-start" />
            Open a repository
          </Button>
          <button
            className="flex items-center gap-[4px] text-muted-foreground text-[12px] mt-[-9px] hover:text-primary"
            onClick={() => {
              void openRepository(DEMO_PATH);
            }}
          >
            Explore the demo repository
            <ChevronRight className="size-[13px]" />
          </button>
          <div className="flex items-center gap-[9px] py-[14px] px-[20px] mt-[12px] border-t border-border text-muted-foreground text-[11px]">
            <Terminal className="size-[14px]" />
            <code>gitler /path/to/repository</code>
          </div>
        </div>
      ) : !snapshot ? (
        <div className="flex-1 grid place-items-center p-[30px] [&>_[data-slot='alert']]:max-w-[560px]">
          {repository.isError ? (
            <ErrorMessage
              title="Could not open repository"
              error={repository.error}
              retry={() => {
                void repository.refetch();
              }}
            />
          ) : (
            <Loading text="Reading repository history…" />
          )}
        </div>
      ) : (
        <>
          <ResizableSplit
            id={narrow ? "workspace-stacked" : "workspace-horizontal"}
            orientation={narrow ? "vertical" : "horizontal"}
            className="flex-1 min-h-0 min-w-0"
            primarySize={narrow ? "32%" : undefined}
            secondarySize={narrow ? "68%" : 460}
            primaryMin={narrow ? 160 : 280}
            secondaryMin={320}
            label="Resize graph and details panels"
            primary={
              <CommitGraph
                key={snapshot.commonDir}
                snapshot={snapshot}
                selected={selected}
                select={select}
                compare={compare}
                comparison={comparison}
                act={setGraphAction}
                busy={repository.isLoading}
                loadMore={() => setLimit((value) => Math.min(value + 1000, 20000))}
                searchRef={searchRef}
                jump={async (hash) => {
                  const commonDir = snapshot.commonDir;
                  const sequence = requestSequence.current;
                  const oid = await repositoryApi.resolveCommit(commonDir, hash);
                  if (!snapshot.commits.some((commit) => commit.oid === oid)) {
                    const detail = await repositoryApi.detail(
                      commonDir,
                      { kind: "commit", oid },
                      null,
                    );
                    if (sequence !== requestSequence.current) return;
                    const commit: Commit = {
                      oid: detail.oid,
                      parents: detail.parents,
                      author: detail.author,
                      email: detail.email,
                      timestamp: detail.timestamp,
                      subject: detail.message.split("\n")[0],
                    };
                    setResolved((current) => ({
                      commonDir,
                      commits: [
                        ...(current?.commonDir === commonDir ? current.commits : []),
                        commit,
                      ],
                    }));
                  }
                  if (sequence !== requestSequence.current) return;
                  select({ kind: "commit", oid });
                }}
              />
            }
            secondary={
              inspectorOpen && selected ? (
                <Inspector
                  key={`${snapshot.commonDir}:${selectionId(selected)}:${comparison ? selectionId(comparison.to) : ""}`}
                  snapshot={snapshot}
                  selected={selected}
                  comparison={comparison}
                  close={() => setInspectorOpen(false)}
                  clearComparison={() => setComparison(null)}
                  select={select}
                  narrow={narrow}
                  previewOpen={previewOpen}
                  togglePreview={() => setPreviewOpen((value) => !value)}
                  view={inspectorView}
                  changeView={(patch) => setInspectorView((current) => ({ ...current, ...patch }))}
                />
              ) : undefined
            }
          />
        </>
      )}
      {snapshot && graphAction && (
        <GraphActions
          key={snapshot.commonDir + JSON.stringify(graphAction)}
          action={graphAction}
          snapshot={snapshot}
          close={() => setGraphAction(null)}
          changed={async () => {
            if (graphAction.kind === "delete") {
              setComparison(null);
              if (
                selected?.kind === "worktree" &&
                snapshot.worktrees.some(
                  (tree) => tree.path === selected.path && tree.branch === graphAction.branch,
                )
              ) {
                const branch = snapshot.refs.find(
                  (ref) => ref.kind === "branch" && ref.name === graphAction.branch,
                );
                setSelected(branch ? { kind: "commit", oid: branch.oid } : null);
              }
            }
            await queryClient.invalidateQueries({ queryKey: ["repository"] });
            await queryClient.invalidateQueries({ queryKey: ["detail"] });
            await queryClient.invalidateQueries({ queryKey: ["diff"] });
            if (
              graphAction.kind === "discard" &&
              selected?.kind === "worktree" &&
              selected.path === graphAction.worktree
            ) {
              const fresh = await repository.refetch();
              const tree = fresh.data?.worktrees.find((tree) => tree.path === graphAction.worktree);
              if (tree && tree.files.length === 0 && !/^0+$/.test(tree.head))
                select({ kind: "commit", oid: tree.head });
            }
          }}
        />
      )}
      <footer className="h-[30px] flex-none border-t border-border flex items-center justify-between gap-[16px] py-0 px-[20px] text-muted-foreground text-[10px] compact:py-0 compact:px-[10px]">
        <span className="flex items-center gap-[10px] min-w-0">
          <span
            className={cn(
              "inline-block size-[5px] flex-none rounded-full",
              repository.isError ? "bg-destructive" : "bg-primary",
            )}
          />
          <span role={snapshot?.worktreeStatusPending ? "status" : undefined}>
            {refreshBusy
              ? "Refreshing repository…"
              : repository.isError
                ? snapshot?.worktreeStatusPending
                  ? "Could not check working copies — retry Refresh"
                  : "Refresh failed — showing the last available scan"
                : snapshot?.worktreeStatusPending
                  ? "Checking working copies…"
                  : snapshot
                    ? `Scanned ${new Date(snapshot.scannedAt * 1000).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`
                    : "Ready to open a repository"}
          </span>
        </span>
        <div className="flex items-center gap-[10px] min-w-0">
          {snapshot && !demo && snapshot.remotes.length > 0 && (
            <AppTooltip content="Remote updates">
              <button
                className={cn(
                  "inline-flex items-center gap-[5px] flex-none",
                  remoteSync.isError && "text-destructive",
                )}
                onClick={() => setRemotesDialog(true)}
              >
                <CloudDownload className="size-[12px]" />
                {remoteSync.isFetching
                  ? "Updating remotes…"
                  : remoteSync.isError
                    ? "Remote update failed"
                    : remoteSync.dataUpdatedAt
                      ? `Remotes updated ${new Date(remoteSync.dataUpdatedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`
                      : "Remote update pending"}
              </button>
            </AppTooltip>
          )}
          {snapshot && (
            <AppTooltip content={snapshot.commonDir}>
              <span className="font-mono truncate compact:hidden">{shortPath(snapshot.path)}</span>
            </AppTooltip>
          )}
        </div>
      </footer>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open repository</DialogTitle>
            <DialogDescription>
              {desktop
                ? "Choose a repository or any of its working copies. Each repository opens in its own window. Already open repositories are brought to the front."
                : "Enter the path to a repository or any of its working copies to open it in this tab."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void openRepository(inputPath);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="repository-path">Repository path</FieldLabel>
                <Input
                  id="repository-path"
                  value={inputPath}
                  onChange={(event) => setInputPath(event.target.value)}
                  placeholder="/path/to/repository or worktree"
                  autoFocus
                  aria-invalid={!!openError}
                />
                <FieldDescription>
                  {localRepository
                    ? "A folder anywhere inside a Git repository."
                    : "Start just dev or use the desktop app to open local folders."}
                </FieldDescription>
              </Field>
              {!!openError && <ErrorMessage title="Could not open this path" error={openError} />}
            </FieldGroup>
            <DialogFooter className="mt-6">
              {desktop && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const folder = await open({
                        directory: true,
                        multiple: false,
                        title: "Open Git repository",
                      });
                      if (typeof folder === "string") {
                        setInputPath(folder);
                        void openRepository(folder);
                      }
                    } catch (error) {
                      setOpenError(error);
                    }
                  }}
                >
                  <FolderOpen data-icon="inline-start" />
                  Browse folders
                </Button>
              )}
              <Button type="submit" disabled={opening || !inputPath.trim() || !localRepository}>
                {opening && <LoaderCircle className="animate-spin" data-icon="inline-start" />}Open
                repository
              </Button>
            </DialogFooter>
          </form>
          <Separator />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void openRepository(DEMO_PATH);
            }}
          >
            Explore demo repository
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={remotesDialog} onOpenChange={setRemotesDialog}>
        <DialogContent className="max-h-[85dvh]">
          <DialogHeader>
            <DialogTitle>Remotes</DialogTitle>
            <DialogDescription>Remote repositories and background updates.</DialogDescription>
          </DialogHeader>
          {snapshot && (
            <div className="overflow-y-auto min-h-0 max-h-[60dvh] pr-[7px]">
              {!!remoteOpenError && (
                <ErrorMessage title="Could not open remote" error={remoteOpenError} />
              )}
              {!demo && snapshot.remotes.length > 0 && (
                <p className="text-muted-foreground text-[11px] mb-[10px]">
                  Remote branches update automatically every minute. Working files and local
                  branches stay unchanged.
                </p>
              )}
              {remoteSync.isError && (
                <ErrorMessage
                  title="Could not update remotes"
                  error={remoteSync.error}
                  retry={() => {
                    void remoteSync.refetch({ cancelRefetch: false });
                  }}
                />
              )}
              {snapshot.remotes.length ? (
                snapshot.remotes.map((remote) => (
                  <div
                    className="flex flex-col gap-[6px] text-[11px] py-[10px] border-b border-border"
                    key={remote.name}
                  >
                    <div className="flex items-center justify-between gap-[8px]">
                      <strong>{remote.name}</strong>
                      {remote.webUrl && (
                        <AppTooltip content={remote.webUrl}>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={demo}
                            aria-label={`Open ${remote.name} repository in browser`}
                            onClick={() => {
                              void openRemote(remote.name);
                            }}
                          >
                            <ExternalLink data-icon="inline-start" />
                            Open in browser
                          </Button>
                        </AppTooltip>
                      )}
                    </div>
                    <code className="text-muted-foreground text-[10px] wrap-anywhere">
                      {remote.url}
                    </code>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-[12px]">No remotes configured.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={shortcutsDialog} onOpenChange={setShortcutsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move through your repository</DialogTitle>
            <DialogDescription>
              Inspect history, rename local branches, and discard selected working changes from the
              graph’s context menu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-[14px] text-[12px]">
            <div className="flex items-center justify-between gap-[12px]">
              <span>Open repository</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ⌘ / Ctrl O
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Search loaded history</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ⌘ / Ctrl F
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Refresh</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ⌘ / Ctrl R
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Toggle details panel</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ⌘⌥B
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Previous / next node (graph focus)</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ↑ / ↓
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Compare with selected</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                Right-click → Diff
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Quick compare</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ⌘ / Ctrl click
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <span>Show this help</span>
              <kbd className="text-muted-foreground text-[10px] bg-secondary py-[4px] px-[6px] rounded-[4px]">
                ?
              </kbd>
            </div>
          </div>
          <div className="flex gap-[12px] p-[13px] bg-secondary rounded-[6px]">
            <GitCompareArrows className="size-[20px] text-primary flex-none" />
            <p className="m-0 text-[12px] leading-[1.6] text-muted-foreground">
              Select a commit or an amber working changes node. Right-click another node and choose{" "}
              <strong>Diff with selected</strong>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
