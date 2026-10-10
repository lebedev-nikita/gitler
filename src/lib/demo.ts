import type { Detail, DiffRequest, DiffResult, Snapshot } from "./models";

export const DEMO_PATH = "demo://gitler";
export const oid = (number: number) => number.toString(16).padStart(7, "0").padEnd(40, "0");
const subjects = [
  "Add repository-wide worktree discovery",
  "Handle renamed files in status parser",
  "Add keyboard navigation to the graph",
  "Refactor worktree status collection",
  "Improve Git parsing for linked worktrees",
  "Handle bare repositories gracefully",
  "Add worktree map to the interface",
  "Merge branch 'feature/worktree-map'",
  "Improve graph lane layout",
  "Add tag and branch labels to the graph",
  "Fix empty repository state",
  "Merge branch 'fix/empty-state'",
  "Improve repository error messages",
  "Remove obsolete dependencies",
  "Add repository settings panel",
  "Update documentation",
  "Initialize the application shell",
  "Initial commit",
];
const parents = [
  [8],
  [3],
  [4],
  [8],
  [6],
  [8],
  [8],
  [12, 10],
  [10],
  [12],
  [12],
  [16, 15],
  [16],
  [15],
  [16],
  [17],
  [18],
  [],
];
const file = (
  path: string,
  indexStatus = " ",
  worktreeStatus = "M",
  additions: number | null = null,
  deletions: number | null = null,
) => ({ path, oldPath: null, indexStatus, worktreeStatus, additions, deletions });

export function demoSnapshot(): Snapshot {
  const tips = [1, 2, 5, 7, 11, 14];
  const branches = [
    "main",
    "agent/auth-flow",
    "agent/git-parser",
    "feature/worktree-map",
    "fix/empty-state",
    "agent/cleanup",
  ];
  const changes = [
    [],
    [
      file("src/auth/session.ts"),
      file("src/auth/refresh.ts", "M", " "),
      file("tests/auth.test.ts", "?", "?"),
    ],
    [file("src-tauri/src/git.rs"), file("tests/status-parser.rs", "?", "?")],
    [],
    [],
    [file("package.json"), file("bun.lock", "M", " ")],
  ];
  return {
    name: "gitler",
    commonDir: "demo",
    path: "/Users/alex/Projects/gitler",
    worktrees: branches.map((branch, index) => ({
      path:
        index === 0
          ? "/Users/alex/Projects/gitler"
          : `/Users/alex/Projects/gitler-worktrees/${branch.split("/").pop()}`,
      head: oid(tips[index]),
      branch,
      files: changes[index],
      detached: false,
      bare: false,
      locked: null,
      prunable: null,
      error: null,
    })),
    commits: subjects.map((subject, index) => ({
      oid: oid(index + 1),
      parents: parents[index].map(oid),
      subject,
      author: ["Alex Chen", "Jamie Park", "Riley Kim"][index % 3],
      email: ["alex@example.com", "jamie@example.com", "riley@example.com"][index % 3],
      timestamp: 1791610200 - index * 7900,
    })),
    refs: [
      ...branches.map((name, index) => ({
        name,
        fullName: `refs/heads/${name}`,
        kind: "branch" as const,
        oid: oid(tips[index]),
        upstream: index === 0 ? "origin/main" : null,
        ahead: 0,
        behind: 0,
      })),
      {
        name: "origin/main",
        fullName: "refs/remotes/origin/main",
        kind: "remote",
        oid: oid(1),
        upstream: null,
        ahead: 0,
        behind: 0,
      },
      {
        name: "v0.1.0",
        fullName: "refs/tags/v0.1.0",
        kind: "tag",
        oid: oid(16),
        upstream: null,
        ahead: 0,
        behind: 0,
      },
    ],
    stashes: [
      {
        selector: "stash@{0}",
        oid: oid(14),
        subject: "WIP on agent/cleanup: dependency cleanup",
        timestamp: 1791540000,
      },
    ],
    remotes: [{ name: "origin", url: "git@github.com:example/gitler.git" }],
    hasMore: false,
    scannedAt: Math.floor(Date.now() / 1000),
  };
}

export function demoDetail(hash: string, base: string | null, worktree: string | null): Detail {
  const snapshot = demoSnapshot();
  const commit = snapshot.commits.find((commit) => commit.oid === hash) ?? snapshot.commits[0];
  const tree = snapshot.worktrees.find((tree) => tree.path === worktree);
  return {
    oid: tree?.head ?? commit.oid,
    author: tree ? "" : commit.author,
    email: tree ? "" : commit.email,
    timestamp: tree ? 0 : commit.timestamp,
    message: tree
      ? "Uncommitted changes"
      : `${commit.subject}\n\nDiscover linked worktrees through the common Git directory and keep their changes visible in one repository-wide view.`,
    parents: tree ? [tree.head] : commit.parents,
    base,
    files: tree
      ? tree.files
      : [
          file("src-tauri/src/git.rs", "M", " ", 24, 6),
          file("src/lib/graph.ts", "M", " ", 18, 4),
          file("tests/worktrees.rs", "A", " ", 32, 0),
        ],
  };
}

export function demoDiff(request: DiffRequest): DiffResult {
  const lines =
    request.mode === "untracked"
      ? [
          "new file mode 100644",
          "--- /dev/null",
          `+++ b/${request.path}`,
          "@@ -0,0 +1,6 @@",
          '+describe("worktree discovery", () => {',
          '+  it("finds changes in every worktree", () => {',
          "+    const trees = discoverWorktrees(repository);",
          "+    expect(trees).toHaveLength(6);",
          "+  });",
          "+});",
        ]
      : [
          `--- a/${request.path}`,
          `+++ b/${request.path}`,
          "@@ -42,9 +42,14 @@",
          " fn parse_status(output: &[u8]) -> Vec<FileChange> {",
          "     let mut files = Vec::new();",
          "-    for line in output.split(|byte| *byte == b'\\n') {",
          "-        let path = String::from_utf8_lossy(line);",
          "+    let mut records = output.split(|byte| *byte == 0);",
          "+    while let Some(record) = records.next() {",
          "+        if record.len() < 4 {",
          "+            continue;",
          "+        }",
          "         let status = record[0] as char;",
          "+        let path = &record[3..];",
          "         files.push(FileChange {",
          "             path: String::from_utf8_lossy(path).into(),",
          "             index_status: status.to_string(),",
          "         });",
          "     }",
          "     files",
          " }",
          "",
          "@@ -81,3 +86,6 @@",
          " fn discover_worktrees(common: &Path) -> Vec<Worktree> {",
          "+    // Every worktree belongs to the same repository.",
          '+    let output = git(common, &["worktree", "list", "--porcelain", "-z"]);',
          "+    parse_worktrees(&output)",
          " }",
        ];
  const text = [`diff --git a/${request.path} b/${request.path}`, ...lines].join("\n");
  return {
    text: request.reverse
      ? text
          .split("\n")
          .map((line) =>
            line.startsWith("+") && !line.startsWith("+++")
              ? `-${line.slice(1)}`
              : line.startsWith("-") && !line.startsWith("---")
                ? `+${line.slice(1)}`
                : line,
          )
          .join("\n")
      : text,
    truncated: false,
  };
}
