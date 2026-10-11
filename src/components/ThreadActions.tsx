import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isDemo, repositoryApi } from "@/lib/repository";
import type { GraphAction, Snapshot, ThreadPreparation } from "@/lib/models";

export function ThreadActions({
  action,
  snapshot,
  close,
  changed,
}: {
  action: Extract<GraphAction, { kind: "thread" }>;
  snapshot: Snapshot;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const demo = isDemo(snapshot.commonDir);
  const [preparation, setPreparation] = useState<ThreadPreparation | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const alive = useRef(true);
  const missing = preparation?.available === false;

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    if (!demo) {
      void repositoryApi
        .prepareThread(snapshot.commonDir, action.branch)
        .then((result) => {
          if (!disposed) setPreparation(result);
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
    };
  }, [snapshot.commonDir, action.branch, demo]);

  async function start() {
    if (busy || attempted || !preparation?.head) return;
    setBusy(true);
    setAttempted(true);
    setError(null);
    try {
      const result = await repositoryApi.startThread(
        snapshot.commonDir,
        action.branch,
        preparation.head,
        preparation.worktree,
      );
      if (!alive.current) return;
      setReference(result.reference);
      setError(result.openError);
      await changed();
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function instructions() {
    setError(null);
    try {
      await repositoryApi.openThreadInstructions(snapshot.commonDir);
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : String(error));
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
            {missing ? "T3 Code unavailable" : reference ? "Thread created" : "New T3 Code thread"}
          </DialogTitle>
          <DialogDescription>
            {missing
              ? "Open T3 Code and add this repository as a project, then try again. No additional CLI is needed."
              : reference
                ? "Continue in T3 Code. The new thread is named after this branch."
                : "Create an empty T3 Code thread on this local branch."}
          </DialogDescription>
        </DialogHeader>
        <strong className="min-w-0 wrap-anywhere">{action.branch}</strong>
        {demo ? (
          <Alert>
            <AlertTitle>Demo preview</AlertTitle>
            <AlertDescription>Open a local repository to create a T3 Code thread.</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            <LoaderCircle className="animate-spin size-4" /> Connecting to T3 Code…
          </p>
        ) : missing ? (
          <Alert>
            <AlertTitle>Could not connect</AlertTitle>
            <AlertDescription>{preparation.message}</AlertDescription>
          </Alert>
        ) : reference ? (
          <Alert>
            <Check />
            <AlertTitle>Thread reference</AlertTitle>
            <AlertDescription>
              <code className="wrap-anywhere">{reference}</code>
            </AlertDescription>
          </Alert>
        ) : preparation?.available ? (
          <div className="flex flex-col gap-2 min-w-0 wrap-anywhere">
            {preparation.worktree ? (
              <>
                <p>Uses the existing worktree, including its working changes.</p>
                <code>{preparation.worktree}</code>
              </>
            ) : (
              <p>
                Creates a worktree for this branch from its current commit. Existing working copies
                are kept.
              </p>
            )}
            <p className="text-muted-foreground">
              Uses the model and permissions configured in T3 Code.
            </p>
          </div>
        ) : null}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>
              {reference ? "Thread created with a warning" : "Could not create thread"}
            </AlertTitle>
            <AlertDescription>
              {error}
              {attempted && !reference && (
                <p>Check T3 Code before trying again; a thread may already have been created.</p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {reference || missing || attempted ? "Close" : "Cancel"}
          </Button>
          {missing ? (
            <Button onClick={() => void instructions()}>
              <ExternalLink data-icon="inline-start" />
              T3 Code on GitHub
            </Button>
          ) : !reference && !demo ? (
            <Button
              disabled={loading || busy || attempted || !preparation?.head}
              onClick={() => void start()}
            >
              {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
              {busy ? "Creating thread…" : "Create thread"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
