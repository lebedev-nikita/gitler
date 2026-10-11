import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { AppTooltip } from "@/components/AppTooltip";
import { isDemo, repositoryApi } from "@/lib/repository";
import type { DeleteBranchPlan, DiscardPlan, GraphAction, Snapshot } from "@/lib/models";
import { shortPath } from "./common";
import { ThreadActions } from "./ThreadActions";

function savedCodexPath() {
  try {
    return localStorage.getItem("gitler.codexPath") ?? "";
  } catch {
    return "";
  }
}

type GraphActionsProps = {
  action: GraphAction;
  snapshot: Snapshot;
  close: () => void;
  changed: () => Promise<void>;
};

export function GraphActions(props: GraphActionsProps) {
  if (props.action.kind === "thread") return <ThreadActions {...props} action={props.action} />;
  return <BranchActions {...props} action={props.action} />;
}

function BranchActions({
  action,
  snapshot,
  close,
  changed,
}: {
  action: Exclude<GraphAction, { kind: "thread" }>;
  snapshot: Snapshot;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(action.kind !== "rename");
  const [error, setError] = useState<string | null>(null);
  const [expectedHead, setExpectedHead] = useState(() =>
    action.kind === "rename"
      ? snapshot.refs.find((ref) => ref.kind === "branch" && ref.name === action.branch)?.oid
      : undefined,
  );
  const [name, setName] = useState(action.kind === "rename" ? action.branch : "");
  const nameInput = useRef<HTMLInputElement>(null);
  const [codexPath, setCodexPath] = useState(savedCodexPath);
  const [plan, setPlan] = useState<DiscardPlan | null>(null);
  const [deletePlan, setDeletePlan] = useState<DeleteBranchPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const request = useRef<string | null>(null);
  const alive = useRef(true);
  const demo = isDemo(snapshot.commonDir);
  const tree = snapshot.worktrees.find((tree) => tree.path === action.worktree);
  const label = action.kind !== "discard" ? action.branch : (tree?.branch ?? "Detached HEAD");

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    if (action.kind === "discard") {
      const preview = demo
        ? Promise.resolve({
            head: tree?.head ?? "",
            files: (tree?.files ?? []).map((file) => ({
              ...file,
              token: "demo",
              unavailable: null,
            })),
          })
        : repositoryApi.prepareDiscard(snapshot.commonDir, action.worktree);
      void preview
        .then((plan) => {
          if (disposed) return;
          setPlan(plan);
          setSelected(
            new Set(plan.files.filter((file) => !file.unavailable).map((file) => file.path)),
          );
        })
        .catch((error: unknown) => {
          if (!disposed) setError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }
    if (action.kind === "delete") {
      const reference = snapshot.refs.find(
        (ref) => ref.kind === "branch" && ref.name === action.branch,
      );
      const preview = demo
        ? Promise.resolve({
            head: reference?.oid ?? "",
            mergedInto: reference?.mergedInto ?? "main",
            baseHead: snapshot.refs.find((ref) => ref.name === reference?.mergedInto)?.oid ?? "",
            worktrees: snapshot.worktrees
              .filter((tree) => tree.branch === action.branch)
              .map((tree) => tree.path),
          })
        : repositoryApi.prepareDeleteBranch(snapshot.commonDir, action.branch);
      void preview
        .then((plan) => {
          if (!disposed) setDeletePlan(plan);
        })
        .catch((error: unknown) => {
          if (!disposed) setError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }
    return () => {
      disposed = true;
      alive.current = false;
      if (request.current)
        void repositoryApi
          .cancelCodegen(snapshot.commonDir, request.current)
          .catch(() => undefined);
    };
  }, [action, snapshot.commonDir, demo]);

  async function generate() {
    if (action.kind !== "rename" || loading || busy || demo) return;
    const id = crypto.randomUUID();
    request.current = id;
    setLoading(true);
    setError(null);
    try {
      try {
        localStorage.setItem("gitler.codexPath", codexPath);
      } catch {
        /* Storage may be disabled. */
      }
      const result = await repositoryApi.generateBranchName(
        snapshot.commonDir,
        action.branch,
        action.worktree,
        id,
        codexPath,
      );
      if (!alive.current || request.current !== id) return;
      setExpectedHead(result.head);
      setName(result.branchName);
      requestAnimationFrame(() => {
        if (alive.current) {
          nameInput.current?.focus();
          nameInput.current?.select();
        }
      });
    } catch (error) {
      if (alive.current && request.current === id)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current && request.current === id) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === "rename" && expectedHead) {
        await repositoryApi.renameBranch(
          snapshot.commonDir,
          action.branch,
          name.trim(),
          expectedHead,
        );
      } else if (action.kind === "discard" && plan) {
        await repositoryApi.discardChanges(
          snapshot.commonDir,
          action.worktree,
          plan.head,
          plan.files
            .filter((file) => selected.has(file.path))
            .map(({ path, token }) => ({ path, token })),
        );
      } else if (action.kind === "delete" && deletePlan) {
        await repositoryApi.deleteBranch(snapshot.commonDir, action.branch, deletePlan);
      } else {
        return;
      }
      await changed();
      close();
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh_-_32px)] overflow-y-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>
            {action.kind === "rename"
              ? "Rename branch"
              : action.kind === "delete"
                ? "Delete merged branch"
                : "Discard uncommitted changes"}
          </DialogTitle>
          <DialogDescription>
            {action.kind === "rename"
              ? "Enter a new name, or generate one with AI from this branch’s commits and working changes."
              : action.kind === "delete"
                ? "Delete this local branch and its worktrees after verifying it is merged. Worktree directories will be removed permanently."
                : "Restore selected files to HEAD, including staged and unstaged edits. Selected untracked and newly added files will be deleted permanently."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-[4px] min-w-0 wrap-anywhere">
          <strong>{label}</strong>
          {action.worktree && action.kind !== "delete" && (
            <AppTooltip content={action.worktree}>
              <span className="text-muted-foreground text-[11px]">
                {shortPath(action.worktree)}
              </span>
            </AppTooltip>
          )}
        </div>
        {demo && (
          <Alert>
            <AlertTitle>Demo preview</AlertTitle>
            <AlertDescription>
              Open a local repository to modify branches or working files.
            </AlertDescription>
          </Alert>
        )}
        {action.kind === "delete" ? (
          loading ? (
            <p className="flex items-center gap-[8px] text-muted-foreground" role="status">
              <LoaderCircle className="animate-spin size-[16px]" /> Checking merge and worktrees…
            </p>
          ) : (
            deletePlan && (
              <div className="flex flex-col gap-3 min-w-0 wrap-anywhere">
                <p>
                  Merged into <strong>{deletePlan.mergedInto}</strong>. No uncommitted changes will
                  be discarded.
                </p>
                {deletePlan.worktrees.length > 0 ? (
                  <ul
                    className="flex flex-col gap-2 max-h-[280px] overflow-y-auto"
                    aria-label="Worktrees to delete"
                  >
                    {deletePlan.worktrees.map((path) => (
                      <li key={path} className="font-mono text-[11px]">
                        {path}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>This branch has no worktree. Only the local branch will be deleted.</p>
                )}
              </div>
            )
          )
        ) : action.kind === "rename" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="branch-name">New branch name</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  ref={nameInput}
                  id="branch-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={demo || loading || busy}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  onFocus={(event) => event.target.select()}
                />
                <InputGroupAddon align="inline-end">
                  <AppTooltip content="Generate with AI">
                    <InputGroupButton
                      size="icon-sm"
                      aria-label="Generate with AI"
                      disabled={demo || loading || busy}
                      onClick={() => void generate()}
                    >
                      {loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                    </InputGroupButton>
                  </AppTooltip>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Only the local branch is renamed. Its upstream remains configured.
              </FieldDescription>
            </Field>
            <details>
              <summary className="cursor-pointer text-muted-foreground mb-[12px]">
                Codex executable
              </summary>
              <Field>
                <FieldLabel htmlFor="codex-path">Executable path (optional)</FieldLabel>
                <Input
                  id="codex-path"
                  value={codexPath}
                  onChange={(event) => setCodexPath(event.target.value)}
                  disabled={loading || busy}
                  placeholder="Automatically detected"
                  spellCheck={false}
                />
                <FieldDescription>
                  Uses your Codex login. The diff is sent to the model configured by Codex’s
                  defaults.
                </FieldDescription>
              </Field>
            </details>
          </FieldGroup>
        ) : loading ? (
          <p className="flex items-center gap-[8px] text-muted-foreground" role="status">
            <LoaderCircle className="animate-spin size-[16px]" /> Reading changed files…
          </p>
        ) : (
          plan && (
            <FieldSet className="min-w-0 gap-[12px]">
              <FieldLegend variant="label">Files to discard · {selected.size} selected</FieldLegend>
              <Field orientation="horizontal">
                <Checkbox
                  id="discard-all"
                  disabled={busy || !plan.files.some((file) => !file.unavailable)}
                  checked={
                    selected.size > 0 &&
                    selected.size === plan.files.filter((file) => !file.unavailable).length
                  }
                  onCheckedChange={(checked) =>
                    setSelected(
                      new Set(
                        checked
                          ? plan.files.filter((file) => !file.unavailable).map((file) => file.path)
                          : [],
                      ),
                    )
                  }
                />
                <FieldLabel htmlFor="discard-all">Select all available files</FieldLabel>
              </Field>
              <FieldGroup className="max-h-[280px] overflow-y-auto p-[4px] gap-[16px]">
                {plan.files.map((file, index) => (
                  <Field
                    key={file.path}
                    orientation="horizontal"
                    data-disabled={!!file.unavailable || busy}
                  >
                    <Checkbox
                      id={`discard-file-${index}`}
                      checked={selected.has(file.path)}
                      disabled={!!file.unavailable || busy}
                      onCheckedChange={(checked) =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          if (checked) next.add(file.path);
                          else next.delete(file.path);
                          return next;
                        })
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`discard-file-${index}`} className="wrap-anywhere">
                        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                      </FieldLabel>
                      <FieldDescription>
                        {file.unavailable ??
                          (file.indexStatus === "?"
                            ? "Untracked · delete file"
                            : file.indexStatus === "A"
                              ? "Newly added · delete file"
                              : "Restore staged and working changes")}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
                {plan.files.length === 0 && (
                  <p>No uncommitted changes remain in this working copy.</p>
                )}
              </FieldGroup>
            </FieldSet>
          )
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>
              {action.kind === "rename"
                ? "Could not rename branch"
                : action.kind === "delete"
                  ? "Could not delete branch"
                  : "Could not discard changes"}
            </AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && action.kind === "rename" && (
          <p className="flex items-center gap-[8px] text-muted-foreground" role="status">
            <LoaderCircle className="animate-spin size-[16px]" /> Generating a branch name…
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {loading && action.kind === "rename" ? "Cancel generation" : "Cancel"}
          </Button>
          <Button
            variant={action.kind === "rename" ? "default" : "destructive"}
            disabled={
              demo ||
              loading ||
              busy ||
              (action.kind === "rename"
                ? !expectedHead || !name.trim() || name.trim() === action.branch
                : action.kind === "delete"
                  ? !deletePlan || !!error
                  : !plan || selected.size === 0)
            }
            onClick={() => void apply()}
          >
            {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
            {busy
              ? "Applying…"
              : action.kind === "rename"
                ? "Rename branch"
                : action.kind === "delete"
                  ? deletePlan?.worktrees.length
                    ? "Delete branch and worktree"
                    : "Delete branch"
                  : `Discard ${selected.size} ${selected.size === 1 ? "file" : "files"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
