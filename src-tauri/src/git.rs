use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use wait_timeout::ChildExt;

const OUTPUT_LIMIT: usize = 16 * 1024 * 1024;
const DIFF_LIMIT: usize = 512 * 1024;

#[derive(Clone, Copy)]
enum OutputPolicy {
    Complete,
    Truncate(usize),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: Option<String>,
    pub prunable: Option<String>,
    pub files: Vec<FileChange>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub oid: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub name: String,
    pub full_name: String,
    pub kind: String,
    pub oid: String,
    pub upstream: Option<String>,
    pub ahead: u64,
    pub behind: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Stash {
    pub selector: String,
    pub oid: String,
    pub subject: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Remote {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub name: String,
    pub common_dir: String,
    pub path: String,
    pub worktrees: Vec<Worktree>,
    pub commits: Vec<Commit>,
    pub refs: Vec<Reference>,
    pub stashes: Vec<Stash>,
    pub remotes: Vec<Remote>,
    pub has_more: bool,
    pub scanned_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub oid: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub message: String,
    pub parents: Vec<String>,
    pub files: Vec<FileChange>,
    pub base: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRequest {
    pub common_dir: String,
    pub path: String,
    #[serde(default)]
    pub old_path: Option<String>,
    pub oid: Option<String>,
    pub base: Option<String>,
    pub worktree: Option<String>,
    pub mode: String,
    #[serde(default)]
    pub reverse: bool,
}

#[derive(Debug, Serialize)]
pub struct DiffResult {
    pub text: String,
    pub truncated: bool,
}

fn git_command() -> Command {
    let mut command = Command::new("git");
    command
        .args([
            "--no-pager",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "color.ui=false",
        ])
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LITERAL_PATHSPECS", "1");
    command
}

fn execute(command: Command) -> Result<Vec<u8>, String> {
    execute_with_diff_status(command, false)
}

fn execute_with_diff_status(command: Command, allow_difference: bool) -> Result<Vec<u8>, String> {
    execute_with_output_policy(command, allow_difference, OutputPolicy::Complete)
}

fn execute_with_output_policy(
    mut command: Command,
    allow_difference: bool,
    policy: OutputPolicy,
) -> Result<Vec<u8>, String> {
    let limit = match policy {
        OutputPolicy::Complete => OUTPUT_LIMIT,
        OutputPolicy::Truncate(limit) => limit,
    };
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!("Could not start Git. Install Git and ensure it is on PATH. {error}")
        })?;
    let stdout = child.stdout.take().ok_or("Git stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("Git stderr unavailable")?;
    // Drain both pipes concurrently so a large history cannot deadlock Git.
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut reader = stdout;
        let mut buffer = [0; 8192];
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 {
                break;
            }
            if bytes.len() < limit + 1 {
                let remaining = limit + 1 - bytes.len();
                bytes.extend_from_slice(&buffer[..count.min(remaining)]);
            }
        }
        bytes
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.take(64 * 1024).read_to_end(&mut bytes);
        bytes
    });
    let status = child
        .wait_timeout(Duration::from_secs(30))
        .map_err(|error| error.to_string())?;
    if status.is_none() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let bytes = out.join().map_err(|_| "Git reader failed")?;
    let errors = err.join().map_err(|_| "Git error reader failed")?;
    let Some(status) = status else {
        return Err(
            "Git scan took longer than 30 seconds. Try a smaller repository or refresh.".into(),
        );
    };
    if !status.success() && !(allow_difference && status.code() == Some(1)) {
        return Err(String::from_utf8_lossy(&errors).trim().to_string());
    }
    if matches!(policy, OutputPolicy::Complete) && bytes.len() > limit {
        return Err(
            "Git output exceeds 16 MiB. Narrow the history or choose a smaller file.".into(),
        );
    }
    Ok(bytes)
}

fn in_worktree(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = git_command();
    command.arg("-C").arg(path).args(args);
    execute(command)
}

fn in_repo(common: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = git_command();
    command.arg("--git-dir").arg(common).args(args);
    execute(command)
}

fn in_repo_truncated(common: &Path, args: &[&str], limit: usize) -> Result<Vec<u8>, String> {
    let mut command = git_command();
    command.arg("--git-dir").arg(common).args(args);
    // Retain one extra byte to detect truncation, but drain all output and check Git's exit status.
    execute_with_output_policy(command, false, OutputPolicy::Truncate(limit))
}

fn string(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

pub fn resolve_common(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    let directory = if path.is_file() {
        path.parent().unwrap_or(path)
    } else {
        path
    };
    let result = in_worktree(
        directory,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?;
    std::fs::canonicalize(string(&result).trim()).map_err(|error| error.to_string())
}

fn validate_common(path: &str) -> Result<PathBuf, String> {
    let common = resolve_common(path)?;
    Ok(common)
}

fn parse_worktrees(bytes: &[u8]) -> Vec<Worktree> {
    let mut worktrees = Vec::new();
    let mut tree = Worktree::default();
    for token in bytes.split(|byte| *byte == 0) {
        let text = string(token);
        if text.is_empty() {
            if !tree.path.is_empty() {
                worktrees.push(std::mem::take(&mut tree));
            }
            continue;
        }
        let (key, value) = text.split_once(' ').unwrap_or((&text, ""));
        match key {
            "worktree" => tree.path = value.to_string(),
            "HEAD" => tree.head = value.to_string(),
            "branch" => {
                tree.branch = Some(
                    value
                        .strip_prefix("refs/heads/")
                        .unwrap_or(value)
                        .to_string(),
                )
            }
            "bare" => tree.bare = true,
            "detached" => tree.detached = true,
            "locked" => tree.locked = Some(value.to_string()),
            "prunable" => tree.prunable = Some(value.to_string()),
            _ => {}
        }
    }
    if !tree.path.is_empty() {
        worktrees.push(tree);
    }
    worktrees
}

fn parse_status(bytes: &[u8]) -> Vec<FileChange> {
    let mut records = bytes
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    let mut files = Vec::new();
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let index = record[0] as char;
        let worktree = record[1] as char;
        let renamed = index == 'R' || index == 'C' || worktree == 'R' || worktree == 'C';
        let old_path = if renamed {
            records.next().map(string)
        } else {
            None
        };
        files.push(FileChange {
            path: string(&record[3..]),
            old_path,
            index_status: index.to_string(),
            worktree_status: worktree.to_string(),
            additions: None,
            deletions: None,
        });
    }
    files
}

fn valid_oid(oid: &str) -> Result<(), String> {
    if (oid.len() == 40 || oid.len() == 64) && oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err("Invalid commit hash".into())
}

pub fn resolve_commit(common_dir: &str, revision: &str) -> Result<String, String> {
    if revision.len() < 4
        || revision.len() > 64
        || !revision.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Enter a commit hash (at least four hexadecimal characters)".into());
    }
    let common = validate_common(common_dir)?;
    let expression = format!("{revision}^{{commit}}");
    let output = in_repo(&common, &["rev-parse", "--verify", &expression])?;
    let oid = string(&output).trim().to_string();
    valid_oid(&oid)?;
    let checkpoints = in_repo(
        &common,
        &[
            "for-each-ref",
            "--format=%(refname)",
            "--points-at",
            &oid,
            "refs/t3/checkpoints",
        ],
    )?;
    if !checkpoints.is_empty() {
        return Err("T3 checkpoints are hidden from the repository history".into());
    }
    Ok(oid)
}

fn log_commits(common: &Path, worktrees: &[Worktree], limit: usize) -> Result<Vec<Commit>, String> {
    let count = (limit + 1).to_string();
    let mut command = git_command();
    command.arg("--git-dir").arg(common).args([
        "log",
        // Exclude service snapshots before pagination; keep real worktree heads below.
        "--exclude=refs/t3/checkpoints/*",
        "--all",
        "--topo-order",
        "-z",
        "--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%s",
        "-n",
        &count,
    ]);
    // --all omits detached worktree heads; include every valid registered tip.
    for tree in worktrees {
        if valid_oid(&tree.head).is_ok() && tree.head.bytes().any(|byte| byte != b'0') {
            command.arg(&tree.head);
        }
    }
    command.arg("--");
    let bytes = execute(command)?;
    let fields: Vec<_> = bytes.split(|byte| *byte == 0).collect();
    Ok(fields
        .chunks(6)
        .filter_map(|row| {
            if row.len() < 6 || row[0].is_empty() {
                return None;
            }
            Some(Commit {
                oid: string(row[0]),
                parents: string(row[1])
                    .split_whitespace()
                    .map(str::to_string)
                    .collect(),
                author: string(row[2]),
                email: string(row[3]),
                timestamp: string(row[4]).parse().unwrap_or(0),
                subject: string(row[5]),
            })
        })
        .collect())
}

pub fn snapshot(path: &str, limit: usize) -> Result<Snapshot, String> {
    let common = resolve_common(path)?;
    let limit = limit.clamp(50, 20000);
    let mut worktrees = parse_worktrees(&in_repo(
        &common,
        &["worktree", "list", "--porcelain", "-z"],
    )?);
    for batch in worktrees.chunks_mut(8) {
        std::thread::scope(|scope| {
            for tree in batch {
                scope.spawn(move || {
                    if tree.bare {
                        return;
                    }
                    match in_worktree(
                        Path::new(&tree.path),
                        &[
                            "status",
                            "--porcelain=v1",
                            "-z",
                            "--untracked-files=all",
                            "--ignore-submodules=none",
                        ],
                    ) {
                        Ok(bytes) => tree.files = parse_status(&bytes),
                        Err(error) => tree.error = Some(error),
                    }
                });
            }
        });
    }
    let mut commits = log_commits(&common, &worktrees, limit)?;
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    let raw_refs = in_repo(&common, &["for-each-ref", "--format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(upstream:track)", "refs/heads", "refs/remotes", "refs/tags"])?;
    let mut refs = Vec::new();
    for line in raw_refs
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
    {
        let fields: Vec<_> = line.split(|byte| *byte == 0).collect();
        if fields.len() < 5 {
            continue;
        }
        let full_name = string(fields[0]);
        let (kind, prefix) = if full_name.starts_with("refs/heads/") {
            ("branch", "refs/heads/")
        } else if full_name.starts_with("refs/remotes/") {
            ("remote", "refs/remotes/")
        } else {
            ("tag", "refs/tags/")
        };
        let name = full_name.trim_start_matches(prefix).to_string();
        let oid = if fields[2].is_empty() {
            string(fields[1])
        } else {
            string(fields[2])
        };
        let upstream = string(fields[3]);
        let track = string(fields[4]);
        let words: Vec<_> = track
            .trim_matches(['[', ']'])
            .split([' ', ','])
            .filter(|v| !v.is_empty())
            .collect();
        let amount = |key| {
            words
                .windows(2)
                .find(|pair| pair[0] == key)
                .and_then(|pair| pair[1].parse::<u64>().ok())
                .unwrap_or(0)
        };
        refs.push(Reference {
            name,
            full_name,
            kind: kind.into(),
            oid,
            upstream: if upstream.is_empty() {
                None
            } else {
                Some(upstream)
            },
            ahead: amount("ahead"),
            behind: amount("behind"),
        });
    }
    let raw_stashes = if let Some(tree) = worktrees
        .iter()
        .find(|tree| !tree.bare && tree.error.is_none())
    {
        in_worktree(
            Path::new(&tree.path),
            &["stash", "list", "-z", "--format=%gd%x00%H%x00%gs%x00%at"],
        )?
    } else {
        Vec::new()
    };
    let stash_fields: Vec<_> = raw_stashes.split(|byte| *byte == 0).collect();
    let stashes = stash_fields
        .chunks(4)
        .filter_map(|fields| {
            if fields.len() < 4 || fields[0].is_empty() {
                return None;
            }
            Some(Stash {
                selector: string(fields[0]),
                oid: string(fields[1]),
                subject: string(fields[2]),
                timestamp: string(fields[3]).parse().unwrap_or(0),
            })
        })
        .collect();
    let names = string(&in_repo(&common, &["remote"])?);
    let remotes = names
        .lines()
        .filter_map(|name| {
            in_repo(&common, &["remote", "get-url", name])
                .ok()
                .map(|url| Remote {
                    name: name.into(),
                    url: string(&url).trim().into(),
                })
        })
        .collect();
    let root = worktrees
        .first()
        .map(|tree| tree.path.clone())
        .unwrap_or_else(|| common.to_string_lossy().into_owned());
    let name = Path::new(&root)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(Snapshot {
        name,
        common_dir: common.to_string_lossy().into_owned(),
        path: root,
        worktrees,
        commits,
        refs,
        stashes,
        remotes,
        has_more,
        scanned_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    })
}

fn diff_files(common: &Path, oid: &str, base: Option<&str>) -> Result<Vec<FileChange>, String> {
    let name_args = if let Some(base) = base {
        vec![
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--name-status",
            "-z",
            "-M",
            base,
            oid,
            "--",
        ]
    } else {
        vec![
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--no-ext-diff",
            "--no-textconv",
            "--name-status",
            "-z",
            "-r",
            "-M",
            oid,
            "--",
        ]
    };
    let raw = in_repo(common, &name_args)?;
    let mut fields = raw
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut files = Vec::new();
    while let Some(status) = fields.next() {
        let Some(first) = fields.next() else { break };
        let rename = status[0] == b'R' || status[0] == b'C';
        let (old_path, path) = if rename {
            (
                Some(string(first)),
                fields.next().map(string).unwrap_or_default(),
            )
        } else {
            (None, string(first))
        };
        files.push(FileChange {
            path,
            old_path,
            index_status: (status[0] as char).to_string(),
            worktree_status: " ".into(),
            additions: None,
            deletions: None,
        });
    }
    let stat_args = if let Some(base) = base {
        vec![
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--numstat",
            "-z",
            "-M",
            base,
            oid,
            "--",
        ]
    } else {
        vec![
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--no-ext-diff",
            "--no-textconv",
            "--numstat",
            "-z",
            "-r",
            "-M",
            oid,
            "--",
        ]
    };
    let raw = in_repo(common, &stat_args)?;
    let mut records = raw
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    while let Some(record) = records.next() {
        let pieces: Vec<_> = record.splitn(3, |byte| *byte == b'\t').collect();
        if pieces.len() != 3 {
            continue;
        }
        let path = if pieces[2].is_empty() {
            let _ = records.next();
            records.next().map(string).unwrap_or_default()
        } else {
            string(pieces[2])
        };
        if let Some(file) = files.iter_mut().find(|file| file.path == path) {
            file.additions = string(pieces[0]).parse().ok();
            file.deletions = string(pieces[1]).parse().ok();
        }
    }
    Ok(files)
}

pub fn commit_detail(common_dir: &str, oid: &str, base: Option<&str>) -> Result<Detail, String> {
    valid_oid(oid)?;
    if let Some(base) = base {
        valid_oid(base)?;
    }
    let common = validate_common(common_dir)?;
    let raw = in_repo(
        &common,
        &[
            "show",
            "-s",
            "--format=%H%x00%an%x00%ae%x00%at%x00%P%x00%B",
            oid,
            "--",
        ],
    )?;
    let fields: Vec<_> = raw.splitn(6, |byte| *byte == 0).collect();
    if fields.len() < 6 {
        return Err("Could not read commit metadata".into());
    }
    let parents: Vec<String> = string(fields[4])
        .split_whitespace()
        .map(str::to_string)
        .collect();
    // Inspect merge commits against their first parent; root commits use --root.
    let effective_base = base.or_else(|| parents.first().map(String::as_str));
    let files = diff_files(&common, oid, effective_base)?;
    Ok(Detail {
        oid: string(fields[0]),
        author: string(fields[1]),
        email: string(fields[2]),
        timestamp: string(fields[3]).parse().unwrap_or(0),
        message: string(fields[5]).trim_end().into(),
        parents,
        files,
        base: base.map(str::to_string),
    })
}

fn validate_file_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || Path::new(path)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Select a repository-relative file path".into());
    }
    Ok(())
}

fn historical_file(common: &Path, base: &str, path: &str) -> Result<Option<Vec<u8>>, String> {
    valid_oid(base)?;
    let entry = in_repo(common, &["ls-tree", "-z", base, "--", path])?;
    if entry.is_empty() {
        return Ok(None);
    }
    let header = entry
        .split(|byte| *byte == b'\t')
        .next()
        .unwrap_or_default();
    let fields = string(header);
    let mut fields = fields.split_whitespace();
    fields.next();
    if fields.next() != Some("blob") {
        return Err("This entry is not a file".into());
    }
    let oid = fields.next().ok_or("File object is unavailable")?;
    in_repo(common, &["cat-file", "blob", oid]).map(Some)
}

fn read_working_file(root: &Path, path: &str) -> Result<Vec<u8>, String> {
    let path = root.join(path);
    let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Ok(std::fs::read_link(path)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .as_bytes()
            .to_vec());
    }
    let canonical = std::fs::canonicalize(&path).map_err(|error| error.to_string())?;
    let canonical_root = std::fs::canonicalize(root).map_err(|error| error.to_string())?;
    if !canonical.starts_with(canonical_root) {
        return Err("File resolves outside this worktree".into());
    }
    if !metadata.is_file() {
        return Err("This entry is not a regular file".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take((OUTPUT_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > OUTPUT_LIMIT {
        return Err("File exceeds the 16 MiB inspection limit".into());
    }
    Ok(bytes)
}

fn compare_file_contents(
    request: &DiffRequest,
    before: &[u8],
    after: &[u8],
) -> Result<DiffResult, String> {
    let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
    let left = temporary.path().join("before");
    let right = temporary.path().join("after");
    std::fs::write(&left, before).map_err(|error| error.to_string())?;
    std::fs::write(&right, after).map_err(|error| error.to_string())?;
    let mut command = git_command();
    command.args([
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
    ]);
    if request.reverse {
        command.arg("-R");
    }
    command.arg("--").arg(left).arg(right);
    let raw = execute_with_diff_status(command, true)?;
    let mut in_hunk = false;
    let text = string(&raw)
        .lines()
        .map(|line| {
            if line.starts_with("@@") {
                in_hunk = true;
            }
            if !in_hunk && line.starts_with("diff --git ") {
                format!("diff --git a/{0} b/{0}", request.path)
            } else if !in_hunk && line.starts_with("--- ") {
                format!("--- a/{}", request.path)
            } else if !in_hunk && line.starts_with("+++ ") {
                format!("+++ b/{}", request.path)
            } else if !in_hunk && line.starts_with("Binary files ") {
                format!("Binary files a/{0} and b/{0} differ", request.path)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok(DiffResult {
        truncated: text.len() > DIFF_LIMIT,
        text: string(&text.as_bytes()[..text.len().min(DIFF_LIMIT)]),
    })
}

pub fn worktree_detail(
    common_dir: &str,
    worktree: &str,
    base: Option<&str>,
) -> Result<Detail, String> {
    let common = validate_common(common_dir)?;
    let trees = parse_worktrees(&in_repo(
        &common,
        &["worktree", "list", "--porcelain", "-z"],
    )?);
    let tree = trees
        .iter()
        .find(|tree| tree.path == worktree)
        .ok_or("Worktree is not registered in this repository")?;
    if resolve_common(worktree)? != common {
        return Err("Worktree belongs to another repository".into());
    }
    let path = Path::new(worktree);
    let status = parse_status(&in_worktree(
        path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?);
    let files = if let Some(base) = base {
        valid_oid(base)?;
        let raw = in_worktree(
            path,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--name-status",
                "-z",
                "-M",
                base,
                "--",
            ],
        )?;
        let mut fields = raw
            .split(|byte| *byte == 0)
            .filter(|token| !token.is_empty());
        let mut files = Vec::new();
        while let Some(state) = fields.next() {
            let Some(first) = fields.next() else { break };
            let rename = state[0] == b'R' || state[0] == b'C';
            let (old_path, path) = if rename {
                (
                    Some(string(first)),
                    fields.next().map(string).unwrap_or_default(),
                )
            } else {
                (None, string(first))
            };
            files.push(FileChange {
                path,
                old_path,
                index_status: " ".into(),
                worktree_status: (state[0] as char).to_string(),
                additions: None,
                deletions: None,
            });
        }
        for file in status.into_iter().filter(|file| file.index_status == "?") {
            // A file can be untracked now but still exist in an older comparison base.
            // Replace Git's index-based deletion with the actual current contents.
            files.retain(|existing| existing.path != file.path);
            if let Some(before) = historical_file(&common, base, &file.path)? {
                if before == read_working_file(path, &file.path)? {
                    continue;
                }
            }
            files.push(file);
        }
        files
    } else {
        status
    };
    Ok(Detail {
        oid: tree.head.clone(),
        author: String::new(),
        email: String::new(),
        timestamp: 0,
        message: "Uncommitted changes".into(),
        parents: vec![tree.head.clone()],
        files,
        base: base.map(str::to_string),
    })
}

pub fn file_diff(request: &DiffRequest) -> Result<DiffResult, String> {
    validate_file_path(&request.path)?;
    if let Some(old_path) = request.old_path.as_deref() {
        validate_file_path(old_path)?;
    }
    let common = validate_common(&request.common_dir)?;
    let raw = if let Some(worktree) = &request.worktree {
        let trees = parse_worktrees(&in_repo(
            &common,
            &["worktree", "list", "--porcelain", "-z"],
        )?);
        let tree = trees
            .iter()
            .find(|tree| tree.path == *worktree)
            .ok_or("Worktree is not registered in this repository")?;
        let tree_path = Path::new(&tree.path);
        // A removed or replaced worktree must not quietly point at another repository.
        if resolve_common(worktree)? != common {
            return Err("Worktree belongs to another repository".into());
        }
        if request.mode == "untracked" {
            let statuses = parse_status(&in_worktree(
                tree_path,
                &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            )?);
            if !statuses
                .iter()
                .any(|file| file.path == request.path && file.index_status == "?")
            {
                return Err("File is no longer untracked. Refresh to inspect it.".into());
            }
            if let Some(base) = request.base.as_deref() {
                if let Some(before) = historical_file(&common, base, &request.path)? {
                    return compare_file_contents(
                        request,
                        &before,
                        &read_working_file(tree_path, &request.path)?,
                    );
                }
            }
            let path = tree_path.join(&request.path);
            let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
            if metadata.file_type().is_symlink() {
                return Ok(DiffResult {
                    text: format!(
                        "Symbolic link → {}",
                        std::fs::read_link(path)
                            .map_err(|error| error.to_string())?
                            .display()
                    ),
                    truncated: false,
                });
            }
            let canonical = std::fs::canonicalize(&path).map_err(|error| error.to_string())?;
            let canonical_root =
                std::fs::canonicalize(tree_path).map_err(|error| error.to_string())?;
            if !canonical.starts_with(&canonical_root) {
                return Err("File resolves outside this worktree".into());
            }
            if !metadata.is_file() {
                return Err("This entry is not a regular file".into());
            }
            let mut bytes = Vec::new();
            std::fs::File::open(path)
                .map_err(|error| error.to_string())?
                .take((DIFF_LIMIT + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|error| error.to_string())?;
            if bytes.contains(&0) {
                return Ok(DiffResult {
                    text: "Binary file (untracked)".into(),
                    truncated: false,
                });
            }
            let truncated = bytes.len() > DIFF_LIMIT;
            bytes.truncate(DIFF_LIMIT);
            let marker = if request.reverse { '-' } else { '+' };
            let content = string(&bytes)
                .lines()
                .map(|line| format!("{marker}{line}"))
                .collect::<Vec<_>>()
                .join("\n");
            return Ok(DiffResult {
                text: format!(
                    "diff --git a/{0} b/{0}\n{1}\n{2}\n{3}\n{content}",
                    request.path,
                    if request.reverse {
                        "deleted file mode 100644"
                    } else {
                        "new file mode 100644"
                    },
                    if request.reverse {
                        format!("--- a/{}\n+++ /dev/null", request.path)
                    } else {
                        format!("--- /dev/null\n+++ b/{}", request.path)
                    },
                    if request.reverse {
                        format!("@@ -1,{} +0,0 @@", content.lines().count())
                    } else {
                        format!("@@ -0,0 +1,{} @@", content.lines().count())
                    }
                ),
                truncated,
            });
        }
        let mut args = vec!["diff", "--no-ext-diff", "--no-textconv", "--no-color", "-M"];
        if request.reverse {
            args.push("-R");
        }
        if let Some(base) = request.base.as_deref() {
            valid_oid(base)?;
            args.push(base);
            args.extend(["--", &request.path]);
            if let Some(old_path) = request.old_path.as_deref() {
                args.push(old_path);
            }
            let raw = in_worktree(tree_path, &args)?;
            return Ok(DiffResult {
                truncated: raw.len() > DIFF_LIMIT,
                text: string(&raw[..raw.len().min(DIFF_LIMIT)]),
            });
        }
        match request.mode.as_str() {
            "staged" => args.push("--cached"),
            "unstaged" => {}
            "combined" => {
                // HEAD is absent in a newly initialized repository.
                if in_worktree(tree_path, &["rev-parse", "--verify", "HEAD"]).is_ok() {
                    args.push("HEAD");
                } else {
                    args.push("--cached");
                }
            }
            _ => return Err("Unknown diff mode".into()),
        }
        args.extend(["--", &request.path]);
        if let Some(old_path) = request.old_path.as_deref() {
            args.push(old_path);
        }
        in_worktree(tree_path, &args)?
    } else {
        let oid = request.oid.as_deref().ok_or("Select a commit")?;
        valid_oid(oid)?;
        if let Some(base) = request.base.as_deref() {
            valid_oid(base)?;
        }
        let detail = commit_detail(&request.common_dir, oid, request.base.as_deref())?;
        let base = request
            .base
            .as_deref()
            .or_else(|| detail.parents.first().map(String::as_str));
        let mut args = if let Some(base) = base {
            vec![
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "-M",
                base,
                oid,
                "--",
                &request.path,
            ]
        } else {
            vec![
                "show",
                "--format=",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "-M",
                oid,
                "--",
                &request.path,
            ]
        };
        if let Some(old_path) = request.old_path.as_deref() {
            args.push(old_path);
        }
        in_repo(&common, &args)?
    };
    let truncated = raw.len() > DIFF_LIMIT;
    Ok(DiffResult {
        text: string(&raw[..raw.len().min(DIFF_LIMIT)]),
        truncated,
    })
}

// Serialize the app's mutations; scans continue to use optional-lock-free reads.
static MUTATIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchContext {
    pub head: String,
    pub text: String,
}

pub(crate) fn validate_branch(branch: &str) -> Result<(), String> {
    if branch.is_empty() || branch.starts_with('-') || branch == "HEAD" {
        return Err("Enter a valid local branch name".into());
    }
    let mut command = git_command();
    command.args(["check-ref-format", &format!("refs/heads/{branch}")]);
    execute(command)
        .map(|_| ())
        .map_err(|_| "Enter a valid local branch name".into())
}

fn branch_head(common: &Path, branch: &str) -> Result<String, String> {
    validate_branch(branch)?;
    let output = in_repo(
        common,
        &["rev-parse", "--verify", &format!("refs/heads/{branch}")],
    )?;
    let head = string(&output).trim().to_string();
    valid_oid(&head)?;
    Ok(head)
}

fn registered_worktree(common: &Path, worktree: &str) -> Result<Worktree, String> {
    let root = std::fs::canonicalize(worktree).map_err(|error| error.to_string())?;
    let trees = parse_worktrees(&in_repo(
        common,
        &["worktree", "list", "--porcelain", "-z"],
    )?);
    let tree = trees
        .into_iter()
        .find(|tree| std::fs::canonicalize(&tree.path).is_ok_and(|path| path == root))
        .ok_or("Worktree is not registered in this repository")?;
    if tree.bare || resolve_common(worktree)? != common {
        return Err("Select a working copy belonging to this repository".into());
    }
    Ok(tree)
}

pub fn branch_context(
    common_dir: &str,
    branch: &str,
    worktree: Option<&str>,
) -> Result<BranchContext, String> {
    let common = validate_common(common_dir)?;
    let head = branch_head(&common, branch)?;
    let reference = format!("refs/heads/{branch}");
    let default = in_repo(&common, &["symbolic-ref", "refs/remotes/origin/HEAD"])
        .ok()
        .map(|bytes| string(&bytes).trim().to_string());
    let candidates = default.into_iter().chain([
        "refs/heads/main".into(),
        "refs/heads/master".into(),
        "refs/remotes/origin/main".into(),
        "refs/remotes/origin/master".into(),
    ]);
    let base = candidates
        .filter(|candidate| candidate != &reference)
        .find_map(|candidate| {
            let target = in_repo(&common, &["rev-parse", "--verify", &candidate]).ok()?;
            if string(&target).trim() == head {
                return None;
            }
            in_repo(&common, &["merge-base", &head, &candidate])
                .ok()
                .map(|bytes| string(&bytes).trim().to_string())
        });
    // With no distinct mainline, describe the tip commit rather than all shared history.
    let base = base.or_else(|| {
        in_repo(&common, &["rev-parse", "--verify", &format!("{head}^")])
            .ok()
            .map(|bytes| string(&bytes).trim().to_string())
    });
    let range = base
        .as_ref()
        .map(|base| format!("{base}..{head}"))
        .unwrap_or_else(|| head.clone());
    let commits = in_repo_truncated(
        &common,
        &["log", "-80", "--format=%s%n%b", &range, "--"],
        64 * 1024,
    )?;
    let mut text = format!(
        "Current branch: {branch}\nHEAD: {head}\nCommits:\n{}",
        string(&commits[..commits.len().min(64 * 1024)])
    );
    if commits.len() > 64 * 1024 {
        text.push_str("\n[Commit messages truncated]\n");
    }
    text.push_str("\nCommitted patch:\n");
    let patch = if let Some(base) = base.as_deref() {
        in_repo_truncated(
            &common,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                base,
                &head,
                "--",
            ],
            192 * 1024,
        )?
    } else {
        in_repo_truncated(
            &common,
            &[
                "show",
                "--format=",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                &head,
                "--",
            ],
            192 * 1024,
        )?
    };
    text.push_str(&string(&patch[..patch.len().min(192 * 1024)]));
    if patch.len() > 192 * 1024 {
        text.push_str("\n[Committed patch truncated]\n");
    }
    let trees = parse_worktrees(&in_repo(
        &common,
        &["worktree", "list", "--porcelain", "-z"],
    )?);
    let working = if let Some(path) = worktree {
        let tree = registered_worktree(&common, path)?;
        if tree.branch.as_deref() != Some(branch) || tree.head != head {
            return Err("The worktree's branch changed. Refresh and try again.".into());
        }
        Some(tree)
    } else {
        trees
            .into_iter()
            .find(|tree| tree.branch.as_deref() == Some(branch) && !tree.bare)
    };
    if let Some(tree) = working {
        let detail = worktree_detail(common_dir, &tree.path, None)?;
        text.push_str("\nUncommitted files (index + working copy):\n");
        for file in &detail.files {
            text.push_str(&format!(
                "{}{} {}\n",
                file.index_status, file.worktree_status, file.path
            ));
        }
        for file in &detail.files {
            if text.len() >= 320 * 1024 {
                text.push_str("\n[Remaining working patches omitted]\n");
                break;
            }
            let request = DiffRequest {
                common_dir: common_dir.into(),
                path: file.path.clone(),
                old_path: file.old_path.clone(),
                oid: None,
                base: None,
                worktree: Some(tree.path.clone()),
                mode: if file.index_status == "?" {
                    "untracked"
                } else {
                    "combined"
                }
                .into(),
                reverse: false,
            };
            match file_diff(&request) {
                Ok(patch) => {
                    text.push_str(&string(
                        &patch.text.as_bytes()[..patch.text.len().min(32 * 1024)],
                    ));
                    if patch.truncated || patch.text.len() > 32 * 1024 {
                        text.push_str("\n[File patch truncated]\n");
                    }
                }
                Err(_) => text.push_str("[File contents unavailable]\n"),
            }
        }
    }
    Ok(BranchContext { head, text })
}

pub fn rename_branch(
    common_dir: &str,
    branch: &str,
    new_name: &str,
    expected_head: &str,
) -> Result<(), String> {
    let _guard = MUTATIONS
        .lock()
        .map_err(|_| "Git mutation lock unavailable")?;
    let common = validate_common(common_dir)?;
    validate_branch(new_name)?;
    if branch_head(&common, branch)? != expected_head {
        return Err("The branch moved since the name was generated. Generate a new name.".into());
    }
    if branch == new_name {
        return Err("Choose a different branch name".into());
    }
    // -m refuses collisions and preserves reflogs, upstream settings and worktree HEADs.
    in_repo(&common, &["branch", "-m", "--", branch, new_name]).map(|_| ())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardFile {
    #[serde(flatten)]
    pub file: FileChange,
    pub token: String,
    pub unavailable: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardPlan {
    pub head: String,
    pub files: Vec<DiscardFile>,
}

#[derive(Debug, Deserialize)]
pub struct DiscardSelection {
    pub path: String,
    pub token: String,
}

fn safe_mutation_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    validate_file_path(path)?;
    let relative = Path::new(path);
    if relative.components().any(|part| {
        part.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
    }) {
        return Err("Git metadata cannot be discarded".into());
    }
    let mut parent = root.to_path_buf();
    for part in relative.parent().unwrap_or(Path::new("")).components() {
        parent.push(part.as_os_str());
        match std::fs::symlink_metadata(&parent) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Ok(_) => return Err("A parent path is not a regular directory".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(root.join(relative))
}

fn discard_token(
    common: &Path,
    root: &Path,
    head: &str,
    file: &FileChange,
) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut digest = Sha256::new();
    digest.update(head);
    digest.update(serde_json::to_vec(file).map_err(|error| error.to_string())?);
    for path in std::iter::once(file.path.as_str()).chain(file.old_path.as_deref()) {
        let absolute = safe_mutation_path(root, path)?;
        let index = in_worktree(root, &["ls-files", "--stage", "-z", "--", path])?;
        let historical = in_repo(common, &["ls-tree", "-z", head, "--", path])?;
        if index
            .split(|byte| *byte == 0)
            .chain(historical.split(|byte| *byte == 0))
            .any(|entry| entry.starts_with(b"160000 "))
        {
            return Err("Open the submodule separately to discard its changes".into());
        }
        digest.update(index);
        digest.update(historical);
        match std::fs::symlink_metadata(&absolute) {
            Ok(metadata) => {
                if !metadata.is_file() && !metadata.file_type().is_symlink() {
                    return Err(
                        "Directories and nested repositories cannot be discarded here".into(),
                    );
                }
                digest.update(format!(
                    "{:?}:{}:{}",
                    metadata.file_type(),
                    metadata.len(),
                    metadata.permissions().readonly()
                ));
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    digest.update(metadata.permissions().mode().to_le_bytes());
                }
                digest.update(read_working_file(root, path)?);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                digest.update(b"missing");
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(format!("{:x}", digest.finalize()))
}

pub fn prepare_discard(common_dir: &str, worktree: &str) -> Result<DiscardPlan, String> {
    let common = validate_common(common_dir)?;
    let tree = registered_worktree(&common, worktree)?;
    valid_oid(&tree.head)?;
    if tree.head.bytes().all(|byte| byte == b'0') {
        return Err("Create an initial commit before discarding changes".into());
    }
    let detail = worktree_detail(common_dir, &tree.path, None)?;
    let files = detail
        .files
        .into_iter()
        .map(|file| {
            let token = discard_token(&common, Path::new(&tree.path), &tree.head, &file);
            let (token, unavailable) = match token {
                Ok(token) => (token, None),
                Err(error) => (String::new(), Some(error)),
            };
            DiscardFile {
                file,
                token,
                unavailable,
            }
        })
        .collect();
    Ok(DiscardPlan {
        head: tree.head,
        files,
    })
}

pub fn discard_changes(
    common_dir: &str,
    worktree: &str,
    expected_head: &str,
    files: &[DiscardSelection],
) -> Result<(), String> {
    let _guard = MUTATIONS
        .lock()
        .map_err(|_| "Git mutation lock unavailable")?;
    if files.is_empty() {
        return Err("Select at least one changed file".into());
    }
    let common = validate_common(common_dir)?;
    let tree = registered_worktree(&common, worktree)?;
    let plan = prepare_discard(common_dir, &tree.path)?;
    if plan.head != expected_head {
        return Err("HEAD changed. Reopen the discard dialog to review the current files.".into());
    }
    let mut selected = std::collections::BTreeSet::new();
    let mut tracked = std::collections::BTreeSet::new();
    let mut untracked = Vec::new();
    for selection in files {
        if !selected.insert(selection.path.clone()) {
            return Err("A file was selected twice".into());
        }
        let current = plan
            .files
            .iter()
            .find(|file| file.file.path == selection.path)
            .ok_or(
                "A selected file changed. Reopen the discard dialog to review the current files.",
            )?;
        if current.unavailable.is_some()
            || current.token.is_empty()
            || current.token != selection.token
        {
            return Err(format!(
                "{} changed or cannot be discarded. Reopen the dialog to review it.",
                selection.path
            ));
        }
        if current.file.index_status == "?" {
            untracked.push((
                selection.path.clone(),
                safe_mutation_path(Path::new(&tree.path), &selection.path)?,
            ));
        } else {
            tracked.insert(selection.path.clone());
            if current.file.index_status == "R" || current.file.worktree_status == "R" {
                if let Some(old) = &current.file.old_path {
                    tracked.insert(old.clone());
                }
            }
        }
    }
    for path in &tracked {
        if plan.files.iter().any(|file| file.file.path == *path) && !selected.contains(path) {
            return Err(format!("{path} has separate changes at the rename source. Select both files to discard the rename."));
        }
    }
    if !tracked.is_empty() {
        let mut pathspecs = tempfile::NamedTempFile::new().map_err(|error| error.to_string())?;
        use std::io::Write;
        for path in &tracked {
            pathspecs
                .write_all(path.as_bytes())
                .and_then(|_| pathspecs.write_all(&[0]))
                .map_err(|error| error.to_string())?;
        }
        pathspecs.flush().map_err(|error| error.to_string())?;
        let mut command = git_command();
        command
            .arg("-C")
            .arg(&tree.path)
            .args([
                "restore",
                "--staged",
                "--worktree",
                "--no-recurse-submodules",
            ])
            .arg(format!("--source={expected_head}"))
            .arg(format!(
                "--pathspec-from-file={}",
                pathspecs.path().to_string_lossy()
            ))
            .arg("--pathspec-file-nul");
        execute(command)?;
    }
    for (relative, path) in untracked {
        if tracked.contains(&relative) {
            continue;
        }
        // Never recursively delete a directory (including nested repositories).
        std::fs::remove_file(&path).map_err(|error| {
            format!(
                "Could not remove {}: {error}. Refresh to inspect the remaining changes.",
                path.display()
            )
        })?;
    }
    Ok(())
}
