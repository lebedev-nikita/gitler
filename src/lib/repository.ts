import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { DEMO_PATH, demoDetail, demoDiff, demoSnapshot } from "./demo";
import { browserConnection, browserInvoke } from "./browser";
import {
  BranchSuggestionSchema,
  DeleteBranchPlanSchema,
  DiscardPlanSchema,
  DetailSchema,
  DiffSchema,
  MediaSchema,
  SnapshotSchema,
} from "./models";
import type {
  Comparison,
  DeleteBranchPlan,
  Detail,
  DiffMode,
  DiffRequest,
  DiffResult,
  FileChange,
  MediaResult,
  Selection,
  Snapshot,
} from "./models";

export class RepositoryError extends Schema.TaggedError<RepositoryError>()("RepositoryError", {
  message: Schema.String,
}) {}

class GitTransport extends Context.Service<
  GitTransport,
  {
    call(command: string, args: Record<string, unknown>): Effect.Effect<unknown, RepositoryError>;
  }
>()("gitler/GitTransport") {
  static layer = Layer.succeed(GitTransport, {
    call: (command, args) =>
      Effect.tryPromise({
        try: () => (isTauri() ? invoke<unknown>(command, args) : browserInvoke(command, args)),
        catch: (error) => new RepositoryError({ message: String(error) }),
      }),
  });
}

const runtime = ManagedRuntime.make(GitTransport.layer);
export const desktop = isTauri();
export const localRepository = desktop || browserConnection !== null;
export const isDemo = (commonDir: string) => commonDir === "demo";

const loadSnapshot = Effect.fn("loadSnapshot")(function* (path: string, limit: number) {
  if (path === DEMO_PATH) return demoSnapshot();
  if (!localRepository)
    return yield* new RepositoryError({
      message: "Start just dev or open the desktop application to inspect a local repository.",
    });
  const transport = yield* GitTransport;
  const payload = yield* transport.call("repository_snapshot", { path, limit });
  return yield* Schema.decodeUnknownEffect(SnapshotSchema)(payload).pipe(
    Effect.mapError(
      (error) => new RepositoryError({ message: `Invalid repository response: ${error.message}` }),
    ),
  );
});

const loadDetail = Effect.fn("loadDetail")(function* (
  commonDir: string,
  selection: Selection,
  comparison: Comparison | null,
) {
  const target = comparison?.to ?? selection;
  const working =
    target.kind === "worktree"
      ? target
      : comparison?.from.kind === "worktree"
        ? comparison.from
        : null;
  const commit =
    target.kind === "commit"
      ? target.oid
      : comparison?.from.kind === "commit"
        ? comparison.from.oid
        : null;
  const base = comparison
    ? working
      ? commit
      : comparison.from.kind === "commit"
        ? comparison.from.oid
        : null
    : null;
  if (isDemo(commonDir)) return demoDetail(commit ?? "", base, working?.path ?? null);
  const transport = yield* GitTransport;
  const payload = yield* transport.call(
    working ? "worktree_detail" : "commit_detail",
    working ? { commonDir, worktree: working.path, base } : { commonDir, oid: commit, base },
  );
  return yield* Schema.decodeUnknownEffect(DetailSchema)(payload).pipe(
    Effect.mapError((error) => new RepositoryError({ message: error.message })),
  );
});

export function makeDiffRequest(
  commonDir: string,
  selection: Selection,
  comparison: Comparison | null,
  file: FileChange,
  mode: DiffMode,
): DiffRequest {
  const target = comparison?.to ?? selection;
  const working =
    target.kind === "worktree"
      ? target
      : comparison?.from.kind === "worktree"
        ? comparison.from
        : null;
  const commit =
    target.kind === "commit"
      ? target.oid
      : comparison?.from.kind === "commit"
        ? comparison.from.oid
        : null;
  const base = comparison
    ? working
      ? commit
      : comparison.from.kind === "commit"
        ? comparison.from.oid
        : null
    : null;
  return {
    commonDir,
    path: file.path,
    oldPath: file.oldPath,
    oid: working ? null : commit,
    base,
    worktree: working?.path ?? null,
    mode: file.indexStatus === "?" ? "untracked" : working ? mode : "commit",
    reverse: !!comparison && comparison.from.kind === "worktree",
  };
}

const loadDiff = Effect.fn("loadDiff")(function* (request: DiffRequest) {
  if (isDemo(request.commonDir)) return demoDiff(request);
  const transport = yield* GitTransport;
  const payload = yield* transport.call("file_diff", { request });
  return yield* Schema.decodeUnknownEffect(DiffSchema)(payload).pipe(
    Effect.mapError((error) => new RepositoryError({ message: error.message })),
  );
});

const loadMedia = Effect.fn("loadMedia")(function* (request: DiffRequest) {
  const transport = yield* GitTransport;
  const payload = yield* transport.call("file_media", { request });
  return yield* Schema.decodeUnknownEffect(MediaSchema)(payload).pipe(
    Effect.mapError((error) => new RepositoryError({ message: error.message })),
  );
});

const action = Effect.fn("repositoryAction")(function* <A, I>(
  commonDir: string,
  command: string,
  args: Record<string, unknown>,
  schema: Schema.Codec<A, I>,
) {
  if (!localRepository || isDemo(commonDir))
    return yield* new RepositoryError({
      message: "Open a local repository to use this action.",
    });
  const transport = yield* GitTransport;
  const payload = yield* transport.call(command, { commonDir, ...args });
  return yield* Schema.decodeUnknownEffect(schema)(payload).pipe(
    Effect.mapError((error) => new RepositoryError({ message: error.message })),
  );
});

export const repositoryApi = {
  fetchRemotes: (commonDir: string) =>
    runtime.runPromise(action(commonDir, "fetch_remotes", {}, Schema.Null)),
  openRemote: (commonDir: string, name: string) =>
    runtime.runPromise(action(commonDir, "open_remote", { name }, Schema.Null)),
  generateBranchName: (
    commonDir: string,
    branch: string,
    worktree: string | null,
    requestId: string,
    codexPath: string,
  ) =>
    runtime.runPromise(
      action(
        commonDir,
        "generate_branch_name",
        { branch, worktree, requestId, codexPath: codexPath.trim() || null },
        BranchSuggestionSchema,
      ),
    ),
  cancelCodegen: (commonDir: string, requestId: string) =>
    runtime.runPromise(action(commonDir, "cancel_codegen", { requestId }, Schema.Null)),
  renameBranch: (commonDir: string, branch: string, newName: string, expectedHead: string) =>
    runtime.runPromise(
      action(commonDir, "rename_branch", { branch, newName, expectedHead }, Schema.Null),
    ),
  prepareDiscard: (commonDir: string, worktree: string) =>
    runtime.runPromise(action(commonDir, "prepare_discard", { worktree }, DiscardPlanSchema)),
  prepareDeleteBranch: (commonDir: string, branch: string) =>
    runtime.runPromise(
      action(commonDir, "prepare_delete_branch", { branch }, DeleteBranchPlanSchema),
    ),
  deleteBranch: (commonDir: string, branch: string, expected: DeleteBranchPlan) =>
    runtime.runPromise(action(commonDir, "delete_branch", { branch, expected }, Schema.Null)),
  discardChanges: (
    commonDir: string,
    worktree: string,
    expectedHead: string,
    files: ReadonlyArray<{ path: string; token: string }>,
  ) =>
    runtime.runPromise(
      action(commonDir, "discard_changes", { worktree, expectedHead, files }, Schema.Null),
    ),
  open: (path: string): Promise<string | null> => {
    if (!localRepository || path === DEMO_PATH) return Promise.resolve(path);
    return runtime.runPromise(
      GitTransport.use((transport) => transport.call("open_repository", { path })).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.NullOr(Schema.String))),
      ),
    );
  },
  launchPath: (): Promise<string | null> =>
    !desktop
      ? Promise.resolve(browserConnection?.path ?? null)
      : runtime.runPromise(
          GitTransport.use((transport) => transport.call("launch_path", {})).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.NullOr(Schema.String))),
          ),
        ),
  snapshot: (path: string, limit: number): Promise<Snapshot> =>
    runtime.runPromise(loadSnapshot(path, limit)),
  detail: (common: string, selection: Selection, comparison: Comparison | null): Promise<Detail> =>
    runtime.runPromise(loadDetail(common, selection, comparison)),
  diff: (request: DiffRequest): Promise<DiffResult> => runtime.runPromise(loadDiff(request)),
  media: (request: DiffRequest): Promise<MediaResult> => runtime.runPromise(loadMedia(request)),
  resolveCommit: (commonDir: string, revision: string): Promise<string> => {
    if (isDemo(commonDir)) {
      const commit = demoSnapshot().commits.find((commit) => commit.oid.startsWith(revision));
      return commit
        ? Promise.resolve(commit.oid)
        : Promise.reject(
            new RepositoryError({ message: "No commit matches this hash in the demo repository." }),
          );
    }
    return runtime.runPromise(
      GitTransport.use((transport) =>
        transport.call("resolve_commit", { commonDir, revision }),
      ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.String))),
    );
  },
};
