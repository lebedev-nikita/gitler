import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  Database,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
  GitFork,
  Info,
  LoaderCircle,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CopyButton, ErrorMessage, Loading, shortHash, shortPath } from "@/components/common";
import { DEMO_PATH } from "@/lib/demo";
import { desktop, isDemo, repositoryApi } from "@/lib/repository";
import { selectionId } from "@/lib/models";
import type { Commit, Comparison, GraphAction, Selection } from "@/lib/models";
import { mergeCommitHistory } from "@/lib/graph";

function savedPath() {
  try {
    return localStorage.getItem("gitler.repository");
  } catch {
    return null;
  }
}

export default function App() {
  const queryClient = useQueryClient();
  const [path, setPath] = useState<string | null>(desktop ? null : DEMO_PATH);
  const [limit, setLimit] = useState(400);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [graphAction, setGraphAction] = useState<GraphAction | null>(null);
  const [infoDialog, setInfoDialog] = useState(false);
  const [shortcutsDialog, setShortcutsDialog] = useState(false);
  const [inputPath, setInputPath] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<unknown>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
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
    refetchInterval: autoRefresh ? 15000 : false,
  });
  const snapshot = useMemo(() => {
    const data = repository.data;
    if (!data || resolved?.commonDir !== data.commonDir) return data;
    return { ...data, commits: mergeCommitHistory(data.commits, resolved.commits) };
  }, [repository.data, resolved]);
  const refreshBusy = repository.isLoading || refreshing;
  const refreshRepository = useCallback(async () => {
    if (!path) return;
    setRefreshing(true);
    try {
      await repository.refetch({ cancelRefetch: false });
    } finally {
      setRefreshing(false);
    }
  }, [path, repository.refetch]);
  const demo = !!snapshot && isDemo(snapshot.commonDir);
  const dirty = snapshot?.worktrees.filter((tree) => tree.files.length > 0 && !tree.error) ?? [];
  const unavailable = snapshot?.worktrees.filter((tree) => tree.error) ?? [];
  const branchesWithChanges = new Set(dirty.map((tree) => tree.branch ?? tree.path)).size;

  const select = useCallback((selection: Selection) => {
    setSelected(selection);
    setComparison(null);
    setInspectorOpen(true);
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
          queryFn: () => repositoryApi.snapshot(target, 400),
          staleTime: 0,
        });
        if (sequence !== requestSequence.current) return;
        loadedPath.current = target;
        setGraphAction(null);
        setPath(target);
        setLimit(400);
        setComparison(null);
        setOpenDialog(false);
        const initialTree = result.worktrees.find((tree) => tree.files.length > 0 && !tree.error);
        setSelected(
          initialTree
            ? { kind: "worktree", path: initialTree.path }
            : result.commits[0]
              ? { kind: "commit", oid: result.commits[0].oid }
              : null,
        );
        setInspectorOpen(true);
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
    const firstDirty = snapshot.worktrees.find((tree) => tree.files.length > 0 && !tree.error);
    if (firstDirty) select({ kind: "worktree", path: firstDirty.path });
    else if (snapshot.commits[0]) select({ kind: "commit", oid: snapshot.commits[0].oid });
  }, [snapshot, select]);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const unsubscribe = getCurrentWebviewWindow().listen<string>("repository-open", (event) => {
      if (!disposed) void openRepository(event.payload);
    });
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
      if (!editing && event.key === "?" && !openDialog && !infoDialog) setShortcutsDialog(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [refreshRepository, openDialog, infoDialog]);

  const compare = (other: Selection) => {
    if (
      !selected ||
      selectionId(selected) === selectionId(other) ||
      (selected.kind === "worktree" && other.kind === "worktree")
    )
      return;
    setComparison({ from: selected, to: other });
    setInspectorOpen(true);
  };

  return (
    <main className="app-shell">
      <header className="app-toolbar">
        <div className="brand-mark">
          <GitFork />
        </div>
        <strong className="app-name">Gitler</strong>
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => snapshot && setInfoDialog(true)}
          disabled={!snapshot}
        >
          <GitBranch data-icon="inline-start" />
          {snapshot?.name ?? "No repository"}
          <ChevronRight data-icon="inline-end" />
        </Button>
        {demo && <Badge variant="outline">Demo</Badge>}
        <div className="toolbar-spacer" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setInputPath("");
            setOpenError(null);
            setOpenDialog(true);
          }}
        >
          <FolderOpen data-icon="inline-start" />
          <span>Open repository</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh repository"
          title="Refresh (⌘/Ctrl R)"
          disabled={!path || refreshBusy}
          onClick={() => {
            void refreshRepository();
          }}
        >
          <RefreshCw className={refreshBusy ? "spin" : undefined} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShortcutsDialog(true)}
        >
          <Info />
        </Button>
      </header>
      {!path ? (
        <div className="welcome">
          <div className="welcome-graph">
            <GitFork />
          </div>
          <h1>Every branch. Nothing left behind.</h1>
          <p>
            See your repository's history and find uncommitted work across every branch, without
            switching your working copy.
          </p>
          <Button onClick={() => setOpenDialog(true)}>
            <FolderOpen data-icon="inline-start" />
            Open a repository
          </Button>
          <button
            className="demo-link"
            onClick={() => {
              void openRepository(DEMO_PATH);
            }}
          >
            Explore the demo repository
            <ChevronRight />
          </button>
          <div className="welcome-cli">
            <Terminal />
            <code>gitler /path/to/repository</code>
          </div>
        </div>
      ) : !snapshot ? (
        <div className="repository-loading">
          {repository.isError ? (
            <ErrorMessage
              title="Could not open repository"
              error={repository.error}
              retry={() => {
                void repository.refetch();
              }}
            />
          ) : (
            <Loading text="Scanning repository and working copies…" />
          )}
        </div>
      ) : (
        <>
          <div className="repository-status">
            <div>
              {dirty.length > 0 ? (
                <>
                  <span className="status-dot dirty" />
                  <strong>
                    {branchesWithChanges}{" "}
                    {branchesWithChanges === 1 ? "branch has" : "branches have"} uncommitted changes
                  </strong>
                  <span>
                    {dirty.reduce((sum, tree) => sum + tree.files.length, 0)} files across working
                    copies
                  </span>
                </>
              ) : (
                <>
                  <Check />
                  <strong>All working copies are clean</strong>
                </>
              )}
              {unavailable.length > 0 && (
                <button className="unavailable-link" onClick={() => setInfoDialog(true)}>
                  <AlertTriangle />
                  {unavailable.length} unavailable
                </button>
              )}
            </div>
            <span>
              {snapshot.refs.filter((ref) => ref.kind === "branch").length} branches
              <span className="status-separator">·</span>
              {demo ? "Illustrative data" : "Entire repository"}
            </span>
          </div>
          <div className={`workspace ${inspectorOpen && selected ? "with-inspector" : ""}`}>
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
                    commits: [...(current?.commonDir === commonDir ? current.commits : []), commit],
                  }));
                }
                if (sequence !== requestSequence.current) return;
                select({ kind: "commit", oid });
              }}
            />
            {inspectorOpen && selected && (
              <Inspector
                key={`${snapshot.commonDir}:${selectionId(selected)}:${comparison ? selectionId(comparison.to) : ""}`}
                snapshot={snapshot}
                selected={selected}
                comparison={comparison}
                close={() => setInspectorOpen(false)}
                clearComparison={() => setComparison(null)}
                select={select}
              />
            )}
          </div>
        </>
      )}
      {snapshot && graphAction && (
        <GraphActions
          key={snapshot.commonDir + JSON.stringify(graphAction)}
          action={graphAction}
          snapshot={snapshot}
          close={() => setGraphAction(null)}
          changed={async () => {
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
      <footer className="app-statusbar">
        <span>
          <span className={`status-dot ${repository.isError ? "unavailable" : "connected"}`} />
          {refreshBusy
            ? "Refreshing repository…"
            : repository.isError
              ? "Refresh failed — showing the last available scan"
              : snapshot
                ? `Scanned ${new Date(snapshot.scannedAt * 1000).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`
                : "Ready to open a repository"}
        </span>
        <div>
          {snapshot && (
            <span className="statusbar-path" title={snapshot.commonDir}>
              {shortPath(snapshot.path)}
            </span>
          )}
          <button
            onClick={() => setAutoRefresh((value) => !value)}
            disabled={!path}
            aria-pressed={autoRefresh}
          >
            {autoRefresh ? "Auto-refresh · 15s" : "Auto-refresh paused"}
          </button>
        </div>
      </footer>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open repository</DialogTitle>
            <DialogDescription>
              Choose a repository or any of its working copies. Each repository opens in its own
              window. Already open repositories are brought to the front.
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
                  {desktop
                    ? "A folder anywhere inside a Git repository."
                    : "Local folders require the Gitler desktop application."}
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
              <Button type="submit" disabled={opening || !inputPath.trim() || !desktop}>
                {opening && <LoaderCircle className="spin" data-icon="inline-start" />}Open
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

      <Dialog open={infoDialog} onOpenChange={setInfoDialog}>
        <DialogContent className="repository-info">
          <DialogHeader>
            <DialogTitle>{snapshot?.name ?? "Repository"}</DialogTitle>
            <DialogDescription>
              Repository-wide information. Working copies are listed under their branches.
            </DialogDescription>
          </DialogHeader>
          {snapshot && (
            <div className="repository-info-scroll">
              <div className="info-path">
                <Database />
                <code>{snapshot.commonDir}</code>
                <CopyButton value={snapshot.commonDir} label="Copy common Git directory" />
              </div>
              <h3>Branches & working copies</h3>
              {snapshot.worktrees.map((tree) => (
                <div className="info-branch" key={tree.path}>
                  <div>
                    <GitBranch />
                    <strong>
                      {tree.branch ??
                        (tree.bare ? "Bare repository" : `Detached ${shortHash(tree.head)}`)}
                    </strong>
                    <Badge
                      variant={tree.error ? "destructive" : tree.files.length ? "dirty" : "quiet"}
                    >
                      {tree.error
                        ? "Unavailable"
                        : tree.files.length
                          ? `${tree.files.length} changes`
                          : "Clean"}
                    </Badge>
                  </div>
                  <p>{shortPath(tree.path)}</p>
                  {tree.error && <p className="info-error">{tree.error}</p>}
                  {tree.locked !== null && <p>Locked{tree.locked && `: ${tree.locked}`}</p>}
                </div>
              ))}
              <h3>Remotes</h3>
              {snapshot.remotes.length ? (
                snapshot.remotes.map((remote) => (
                  <div className="info-remote" key={remote.name}>
                    <strong>{remote.name}</strong>
                    <code>{remote.url}</code>
                  </div>
                ))
              ) : (
                <p>No remotes configured.</p>
              )}
              <h3>Stashes</h3>
              {snapshot.stashes.length ? (
                snapshot.stashes.map((stash) => (
                  <button
                    className="info-stash"
                    key={stash.selector}
                    onClick={() => {
                      select({ kind: "commit", oid: stash.oid });
                      setInfoDialog(false);
                    }}
                  >
                    <Archive />
                    <div>
                      <strong>{stash.selector}</strong>
                      <span>{stash.subject}</span>
                    </div>
                    <ChevronRight />
                  </button>
                ))
              ) : (
                <p>No stashes.</p>
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
              Inspect history, rename local branches with Codex, and discard selected working
              changes from the graph’s context menu.
            </DialogDescription>
          </DialogHeader>
          <div className="shortcut-list">
            <div>
              <span>Open repository</span>
              <kbd>⌘ / Ctrl O</kbd>
            </div>
            <div>
              <span>Search loaded history</span>
              <kbd>⌘ / Ctrl F</kbd>
            </div>
            <div>
              <span>Refresh</span>
              <kbd>⌘ / Ctrl R</kbd>
            </div>
            <div>
              <span>Previous / next node (graph focus)</span>
              <kbd>↑ / ↓</kbd>
            </div>
            <div>
              <span>Compare with selected</span>
              <kbd>Right-click → Diff</kbd>
            </div>
            <div>
              <span>Quick compare</span>
              <kbd>⌘ / Ctrl click</kbd>
            </div>
            <div>
              <span>Show this help</span>
              <kbd>?</kbd>
            </div>
          </div>
          <div className="shortcut-tip">
            <GitCompareArrows />
            <p>
              Select a commit or an amber working changes node. Right-click another node and choose{" "}
              <strong>Diff with selected</strong>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
