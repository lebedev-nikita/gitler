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
import { isDemo, repositoryApi } from "@/lib/repository";
import type { BranchSuggestion, DiscardPlan, GraphAction, Snapshot } from "@/lib/models";
import { shortPath } from "./common";

function savedCodexPath() {
  try {
    return localStorage.getItem("gitler.codexPath") ?? "";
  } catch {
    return "";
  }
}

export function GraphActions({
  action,
  snapshot,
  close,
  changed,
}: {
  action: GraphAction;
  snapshot: Snapshot;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(action.kind === "discard");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<BranchSuggestion | null>(null);
  const [name, setName] = useState("");
  const [codexPath, setCodexPath] = useState(savedCodexPath);
  const [plan, setPlan] = useState<DiscardPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const request = useRef<string | null>(null);
  const alive = useRef(true);
  const demo = isDemo(snapshot.commonDir);
  const tree = snapshot.worktrees.find((tree) => tree.path === action.worktree);
  const label = action.kind === "rename" ? action.branch : (tree?.branch ?? "Detached HEAD");

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed && action.kind === "rename" && !demo) void generate();
    });
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
    if (action.kind !== "rename") return;
    const id = crypto.randomUUID();
    request.current = id;
    setLoading(true);
    setSuggestion(null);
    setName("");
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
      setSuggestion(result);
      setName(result.branchName);
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
      if (action.kind === "rename" && suggestion) {
        await repositoryApi.renameBranch(
          snapshot.commonDir,
          action.branch,
          name.trim(),
          suggestion.head,
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
            {action.kind === "rename" ? "Rename branch with Codex" : "Discard uncommitted changes"}
          </DialogTitle>
          <DialogDescription>
            {action.kind === "rename"
              ? "Generate a name from this branch’s commits and working changes, then review it before renaming locally."
              : "Restore selected files to HEAD, including staged and unstaged edits. Selected untracked and newly added files will be deleted permanently."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-[4px] min-w-0 wrap-anywhere">
          <strong>{label}</strong>
          {action.worktree && (
            <span className="text-muted-foreground text-[11px]" title={action.worktree}>
              {shortPath(action.worktree)}
            </span>
          )}
        </div>
        {demo && (
          <Alert>
            <AlertTitle>Demo preview</AlertTitle>
            <AlertDescription>
              Open a local repository in the desktop app to generate names or discard files.
            </AlertDescription>
          </Alert>
        )}
        {action.kind === "rename" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="branch-name">New branch name</FieldLabel>
              <Input
                id="branch-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Generate a suggestion first"
                disabled={!suggestion || loading || busy}
                autoComplete="off"
                spellCheck={false}
              />
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
              {action.kind === "rename" ? "Could not rename branch" : "Could not discard changes"}
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
          {action.kind === "rename" && (
            <Button
              variant="outline"
              disabled={demo || loading || busy}
              onClick={() => void generate()}
            >
              <Sparkles data-icon="inline-start" />
              {suggestion ? "Regenerate" : "Generate name"}
            </Button>
          )}
          <Button
            variant={action.kind === "discard" ? "destructive" : "default"}
            disabled={
              demo ||
              loading ||
              busy ||
              (action.kind === "rename"
                ? !suggestion || !name.trim() || name.trim() === action.branch
                : !plan || selected.size === 0)
            }
            onClick={() => void apply()}
          >
            {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
            {busy
              ? "Applying…"
              : action.kind === "rename"
                ? "Rename branch"
                : `Discard ${selected.size} ${selected.size === 1 ? "file" : "files"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
