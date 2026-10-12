import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
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
import type { GraphAction, Snapshot } from "@/lib/models";

export function PullActions({
  action,
  snapshot,
  close,
  changed,
}: {
  action: Extract<GraphAction, { kind: "pull" }>;
  snapshot: Snapshot;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const demo = isDemo(snapshot.commonDir);
  const [busy, setBusy] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const started = useRef(false);

  useEffect(() => {
    alive.current = true;
    async function pull() {
      try {
        await repositoryApi.pullBranch(
          snapshot.commonDir,
          action.branch,
          action.expectedHead,
          action.worktree,
        );
        if (alive.current) close();
      } catch (error) {
        if (alive.current) setError(error instanceof Error ? error.message : String(error));
      } finally {
        // A failed fast-forward may still have fetched new remote commits.
        void changed().catch(() => undefined);
        if (alive.current) setBusy(false);
      }
    }
    if (!demo && !started.current) {
      started.current = true;
      void pull();
    }
    return () => {
      alive.current = false;
    };
  }, [snapshot.commonDir, action.branch, action.expectedHead, action.worktree, demo]);

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
            {busy ? "Pulling branch" : demo ? "Pull branch" : "Could not pull branch"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono wrap-anywhere">{action.branch}</span>
            {action.worktree && <span className="block wrap-anywhere">{action.worktree}</span>}
          </DialogDescription>
        </DialogHeader>
        {busy && (
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            <LoaderCircle className="motion-safe:animate-spin size-4" aria-hidden="true" />
            Fetching upstream and fast-forwarding…
          </p>
        )}
        {demo && (
          <Alert>
            <AlertTitle>Demo preview</AlertTitle>
            <AlertDescription>Open a local repository to pull a branch.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Pull failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!busy && (
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
