import { Schema } from "effect";

export const FileChangeSchema = Schema.Struct({
  path: Schema.String,
  oldPath: Schema.NullOr(Schema.String),
  indexStatus: Schema.String,
  worktreeStatus: Schema.String,
  additions: Schema.NullOr(Schema.Number),
  deletions: Schema.NullOr(Schema.Number),
});
export type FileChange = typeof FileChangeSchema.Type;

export const WorktreeSchema = Schema.Struct({
  path: Schema.String,
  head: Schema.String,
  branch: Schema.NullOr(Schema.String),
  bare: Schema.Boolean,
  detached: Schema.Boolean,
  locked: Schema.NullOr(Schema.String),
  prunable: Schema.NullOr(Schema.String),
  files: Schema.Array(FileChangeSchema),
  error: Schema.NullOr(Schema.String),
});
export type Worktree = typeof WorktreeSchema.Type;

export const CommitSchema = Schema.Struct({
  oid: Schema.String,
  parents: Schema.Array(Schema.String),
  author: Schema.String,
  email: Schema.String,
  timestamp: Schema.Number,
  subject: Schema.String,
});
export type Commit = typeof CommitSchema.Type;

export const BranchIntegrationSchema = Schema.Struct({
  target: Schema.String,
  kind: Schema.Literals(["ancestry", "patch"]),
  commit: Schema.NullOr(Schema.String),
});
export type BranchIntegration = typeof BranchIntegrationSchema.Type;

export const ReferenceSchema = Schema.Struct({
  name: Schema.String,
  fullName: Schema.String,
  kind: Schema.Literals(["branch", "remote", "tag"]),
  oid: Schema.String,
  upstream: Schema.NullOr(Schema.String),
  ahead: Schema.Number,
  behind: Schema.Number,
  integration: Schema.NullOr(BranchIntegrationSchema),
});
export type Reference = typeof ReferenceSchema.Type;

export const SnapshotSchema = Schema.Struct({
  name: Schema.String,
  commonDir: Schema.String,
  path: Schema.String,
  worktrees: Schema.Array(WorktreeSchema),
  commits: Schema.Array(CommitSchema),
  refs: Schema.Array(ReferenceSchema),
  stashes: Schema.Array(
    Schema.Struct({
      selector: Schema.String,
      oid: Schema.String,
      subject: Schema.String,
      timestamp: Schema.Number,
    }),
  ),
  remotes: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      url: Schema.String,
      webUrl: Schema.NullOr(Schema.String),
    }),
  ),
  hasMore: Schema.Boolean,
  scannedAt: Schema.Number,
});
export type Snapshot = typeof SnapshotSchema.Type;

export const DetailSchema = Schema.Struct({
  oid: Schema.String,
  author: Schema.String,
  email: Schema.String,
  timestamp: Schema.Number,
  message: Schema.String,
  parents: Schema.Array(Schema.String),
  files: Schema.Array(FileChangeSchema),
  base: Schema.NullOr(Schema.String),
});
export type Detail = typeof DetailSchema.Type;

export const DiffSchema = Schema.Struct({ text: Schema.String, truncated: Schema.Boolean });
export type DiffResult = typeof DiffSchema.Type;

export type Selection = { kind: "commit"; oid: string } | { kind: "worktree"; path: string };
export type Comparison = { from: Selection; to: Selection };
export type DiffMode = "combined" | "staged" | "unstaged";
export type DiffRequest = {
  commonDir: string;
  path: string;
  oldPath?: string | null;
  oid: string | null;
  base: string | null;
  worktree: string | null;
  mode: string;
  reverse: boolean;
};

export function selectionId(selection: Selection): string {
  return selection.kind === "commit" ? selection.oid : `working:${selection.path}`;
}

export function fileStatus(file: FileChange): string {
  if (file.indexStatus === "?") return "?";
  if (
    file.indexStatus === "U" ||
    file.worktreeStatus === "U" ||
    ["AA", "DD"].includes(file.indexStatus + file.worktreeStatus)
  )
    return "U";
  return file.worktreeStatus.trim() || file.indexStatus.trim() || "M";
}

export function worktreeCounts(tree: Worktree) {
  return {
    staged: tree.files.filter((file) => file.indexStatus !== " " && file.indexStatus !== "?")
      .length,
    unstaged: tree.files.filter(
      (file) => file.worktreeStatus !== " " && file.worktreeStatus !== "?",
    ).length,
    untracked: tree.files.filter((file) => file.indexStatus === "?").length,
  };
}

export const BranchSuggestionSchema = Schema.Struct({
  branchName: Schema.String,
  head: Schema.String,
});
export type BranchSuggestion = typeof BranchSuggestionSchema.Type;

export const DiscardFileSchema = Schema.Struct({
  ...FileChangeSchema.fields,
  token: Schema.String,
  unavailable: Schema.NullOr(Schema.String),
});
export const DiscardPlanSchema = Schema.Struct({
  head: Schema.String,
  files: Schema.Array(DiscardFileSchema),
});
export type DiscardPlan = typeof DiscardPlanSchema.Type;
export type GraphAction =
  | { kind: "rename"; branch: string; worktree: string | null }
  | { kind: "discard"; worktree: string };
