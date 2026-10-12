import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle } from "lucide-react";
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
  const [busy, setBusy] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const alive = useRef(true);
  const started = useRef(false);
  const missing = preparation?.available === false;

  useEffect(() => {
    alive.current = true;

    async function start() {
      try {
        const prepared = await repositoryApi.prepareThread(snapshot.commonDir, action.branch);
        if (!alive.current) return;
        setPreparation(prepared);
        if (!prepared.available) return;
        if (!prepared.head) throw new Error("The selected branch no longer has a commit.");
        setAttempted(true);
        const result = await repositoryApi.startThread(
          snapshot.commonDir,
          action.branch,
          prepared.head,
          prepared.worktree,
        );
        if (!alive.current) return;
        if (result.openError) {
          setReference(result.reference);
          setError(result.openError);
        } else {
          close();
        }
        // Refreshing the graph must not delay the handoff or report a creation failure.
        void changed().catch(() => undefined);
      } catch (error) {
        if (alive.current) setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    }

    // Effect replay in StrictMode must not create a second thread.
    if (!demo && !started.current) {
      started.current = true;
      void start();
    }
    return () => {
      alive.current = false;
    };
  }, [snapshot.commonDir, action.branch, demo]);

  async function instructions() {
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
            {busy
              ? "Creating T3 Code thread"
              : missing
                ? "T3 Code unavailable"
                : reference
                  ? "Could not open T3 Code"
                  : demo
                    ? "T3 Code thread"
                    : "Could not create thread"}
          </DialogTitle>
          <DialogDescription>
            {missing ? (
              "Open T3 Code and add this repository as a project, then try again. No additional CLI is needed."
            ) : reference ? (
              "The thread was created. Open T3 Code to continue."
            ) : (
              <span className="font-mono wrap-anywhere">{action.branch}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        {demo ? (
          <Alert>
            <AlertTitle>Demo preview</AlertTitle>
            <AlertDescription>Open a local repository to create a T3 Code thread.</AlertDescription>
          </Alert>
        ) : busy ? (
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            <LoaderCircle className="motion-safe:animate-spin size-4" aria-hidden="true" />
            {attempted ? "Creating thread…" : "Connecting to T3 Code…"}
          </p>
        ) : missing ? (
          <Alert>
            <AlertTitle>Could not connect</AlertTitle>
            <AlertDescription>{preparation.message}</AlertDescription>
          </Alert>
        ) : null}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>
              {reference ? "Open T3 Code manually" : "Could not create thread"}
            </AlertTitle>
            <AlertDescription>
              {error}
              {reference && <code className="wrap-anywhere">{reference}</code>}
              {attempted && !reference && (
                <p>Check T3 Code before trying again; a thread may already have been created.</p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {!busy && (
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
            {missing && (
              <Button onClick={() => void instructions()}>
                <ExternalLink data-icon="inline-start" />
                T3 Code on GitHub
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
