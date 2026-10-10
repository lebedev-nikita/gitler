use gitler_lib::git::{self, DiffRequest};
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn git(path: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn repo() -> TempDir {
    let temp = TempDir::new().unwrap();
    git(temp.path(), &["init", "-b", "main"]);
    git(temp.path(), &["config", "user.name", "Test Author"]);
    git(temp.path(), &["config", "user.email", "test@example.com"]);
    fs::write(temp.path().join("file.txt"), "first\n").unwrap();
    git(temp.path(), &["add", "."]);
    git(temp.path(), &["commit", "-m", "First commit"]);
    temp
}

fn request(
    common: &str,
    path: &str,
    oid: Option<String>,
    base: Option<String>,
    worktree: Option<String>,
    mode: &str,
) -> DiffRequest {
    DiffRequest {
        common_dir: common.into(),
        path: path.into(),
        old_path: None,
        oid,
        base,
        worktree,
        mode: mode.into(),
        reverse: false,
    }
}

#[test]
fn discovers_all_worktrees_from_any_path_and_preserves_git_state() {
    let repo = repo();
    let holder = TempDir::new().unwrap();
    let worktree = holder.path().join("agent tree");
    git(
        repo.path(),
        &[
            "worktree",
            "add",
            "-b",
            "agent/parser",
            worktree.to_str().unwrap(),
        ],
    );
    fs::write(worktree.join("file.txt"), "changed\n").unwrap();
    let new_file = if cfg!(windows) {
        "new ü file.txt"
    } else {
        "new\tfile\n.txt"
    };
    fs::write(worktree.join(new_file), "new\n").unwrap();
    let index = fs::read(repo.path().join(".git/index")).unwrap();
    let head = git(repo.path(), &["rev-parse", "HEAD"]);
    let a = git::snapshot(repo.path().to_str().unwrap(), 100).unwrap();
    let b = git::snapshot(worktree.to_str().unwrap(), 100).unwrap();
    assert_eq!(a.common_dir, b.common_dir);
    assert_eq!(a.path, b.path);
    assert_eq!(b.worktrees.len(), 2);
    let dirty = b
        .worktrees
        .iter()
        .find(|tree| tree.branch.as_deref() == Some("agent/parser"))
        .unwrap();
    assert_eq!(dirty.files.len(), 2);
    assert!(dirty.files.iter().any(|file| file.path == new_file));
    assert_eq!(fs::read(repo.path().join(".git/index")).unwrap(), index);
    assert_eq!(git(repo.path(), &["rev-parse", "HEAD"]), head);
}

#[test]
fn inspects_commit_root_rename_and_arbitrary_comparison() {
    let repo = repo();
    let first = git(repo.path(), &["rev-parse", "HEAD"]);
    let common = git::resolve_common(repo.path().to_str().unwrap()).unwrap();
    assert_eq!(
        git::resolve_commit(common.to_str().unwrap(), &first[..7]).unwrap(),
        first
    );
    assert!(git::resolve_commit(common.to_str().unwrap(), "--help").is_err());
    fs::rename(
        repo.path().join("file.txt"),
        repo.path().join("renamed file.txt"),
    )
    .unwrap();
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-m", "Rename"]);
    let second = git(repo.path(), &["rev-parse", "HEAD"]);
    let snapshot = git::snapshot(repo.path().to_str().unwrap(), 100).unwrap();
    let root = git::commit_detail(&snapshot.common_dir, &first, None).unwrap();
    assert_eq!(root.files[0].path, "file.txt");
    assert_eq!(root.files[0].additions, Some(1));
    let comparison = git::commit_detail(&snapshot.common_dir, &second, Some(&first)).unwrap();
    assert_eq!(comparison.files[0].old_path.as_deref(), Some("file.txt"));
    assert_eq!(comparison.files[0].path, "renamed file.txt");
    let mut diff_request = request(
        &snapshot.common_dir,
        "renamed file.txt",
        Some(second),
        Some(first),
        None,
        "commit",
    );
    diff_request.old_path = Some("file.txt".into());
    let patch = git::file_diff(&diff_request).unwrap();
    assert!(patch.text.contains("rename from file.txt"));
    assert!(patch.text.contains("rename to renamed file.txt"));
}

#[test]
fn compares_older_commit_to_index_working_files_and_untracked() {
    let repo = repo();
    let first = git(repo.path(), &["rev-parse", "HEAD"]);
    fs::write(repo.path().join("file.txt"), "second\n").unwrap();
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-m", "Second"]);
    fs::write(repo.path().join("file.txt"), "staged\n").unwrap();
    git(repo.path(), &["add", "."]);
    fs::write(repo.path().join("file.txt"), "working\n").unwrap();
    fs::write(repo.path().join("new.txt"), "untracked\n").unwrap();
    let snapshot = git::snapshot(repo.path().to_str().unwrap(), 100).unwrap();
    let worktree = snapshot.worktrees[0].path.clone();
    let detail = git::worktree_detail(&snapshot.common_dir, &worktree, Some(&first)).unwrap();
    assert_eq!(detail.files.len(), 2);
    let patch = git::file_diff(&request(
        &snapshot.common_dir,
        "file.txt",
        None,
        Some(first),
        Some(worktree.clone()),
        "combined",
    ))
    .unwrap();
    assert!(patch.text.contains("-first"));
    assert!(patch.text.contains("+working"));
    let staged = git::file_diff(&request(
        &snapshot.common_dir,
        "file.txt",
        None,
        None,
        Some(worktree.clone()),
        "staged",
    ))
    .unwrap();
    assert!(staged.text.contains("+staged"));
    let untracked = git::file_diff(&request(
        &snapshot.common_dir,
        "new.txt",
        None,
        None,
        Some(worktree),
        "untracked",
    ))
    .unwrap();
    assert!(untracked.text.contains("+untracked"));
}

#[test]
fn compares_restored_untracked_files_against_their_historical_contents_in_both_directions() {
    let repo = repo();
    let first = git(repo.path(), &["rev-parse", "HEAD"]);
    git(repo.path(), &["rm", "file.txt"]);
    git(repo.path(), &["commit", "-m", "Delete file"]);
    fs::write(repo.path().join("file.txt"), "restored\n").unwrap();
    let snapshot = git::snapshot(repo.path().to_str().unwrap(), 100).unwrap();
    let worktree = snapshot.worktrees[0].path.clone();
    let detail = git::worktree_detail(&snapshot.common_dir, &worktree, Some(&first)).unwrap();
    assert_eq!(detail.files.len(), 1);
    assert_eq!(detail.files[0].index_status, "?");
    let mut diff_request = request(
        &snapshot.common_dir,
        "file.txt",
        None,
        Some(first.clone()),
        Some(worktree.clone()),
        "untracked",
    );
    let patch = git::file_diff(&diff_request).unwrap();
    assert!(patch.text.contains("-first\n+restored"));
    assert!(!patch.text.contains("deleted file mode"));
    diff_request.reverse = true;
    let reverse = git::file_diff(&diff_request).unwrap();
    assert!(reverse.text.contains("-restored\n+first"));
    fs::write(repo.path().join("file.txt"), "first\n").unwrap();
    assert!(
        git::worktree_detail(&snapshot.common_dir, &worktree, Some(&first))
            .unwrap()
            .files
            .is_empty()
    );

    fs::write(repo.path().join("new.txt"), "one\ntwo\n").unwrap();
    let mut new_request = request(
        &snapshot.common_dir,
        "new.txt",
        None,
        Some(first),
        Some(worktree),
        "untracked",
    );
    new_request.reverse = true;
    let reverse = git::file_diff(&new_request).unwrap();
    assert!(reverse.text.contains("@@ -1,2 +0,0 @@"));
    assert!(reverse.text.contains("-one\n-two"));
}

#[test]
fn includes_detached_heads_and_reports_missing_worktrees() {
    let repo = repo();
    let holder = TempDir::new().unwrap();
    let worktree = holder.path().join("detached");
    git(
        repo.path(),
        &["worktree", "add", "--detach", worktree.to_str().unwrap()],
    );
    fs::write(worktree.join("detached.txt"), "detached\n").unwrap();
    git(&worktree, &["add", "."]);
    git(&worktree, &["commit", "-m", "Detached work"]);
    let detached = git(&worktree, &["rev-parse", "HEAD"]);
    let snapshot = git::snapshot(repo.path().to_str().unwrap(), 100).unwrap();
    assert!(snapshot.commits.iter().any(|commit| commit.oid == detached));
    fs::remove_dir_all(worktree).unwrap();
    let snapshot = git::snapshot(repo.path().to_str().unwrap(), 100).unwrap();
    assert!(snapshot.worktrees.iter().any(|tree| tree.error.is_some()));
}

#[test]
fn supports_unborn_and_bare_repositories_and_rejects_invalid_input() {
    let empty = TempDir::new().unwrap();
    git(empty.path(), &["init", "-b", "main"]);
    fs::write(empty.path().join("new.txt"), "new\n").unwrap();
    let snapshot = git::snapshot(empty.path().to_str().unwrap(), 100).unwrap();
    assert!(snapshot.commits.is_empty());
    assert_eq!(snapshot.worktrees[0].files.len(), 1);
    assert!(git::commit_detail(&snapshot.common_dir, "--help", None).is_err());
    let tree = snapshot.worktrees[0].path.clone();
    assert!(git::file_diff(&request(
        &snapshot.common_dir,
        "../secret",
        None,
        None,
        Some(tree),
        "untracked"
    ))
    .is_err());
    let bare = TempDir::new().unwrap();
    git(bare.path(), &["init", "--bare"]);
    assert!(
        git::snapshot(bare.path().to_str().unwrap(), 100)
            .unwrap()
            .worktrees[0]
            .bare
    );
}
