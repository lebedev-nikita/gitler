use gitler_lib::git::{self, DiscardSelection};
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run(path: &Path, args: &[&str]) -> String {
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
    let directory = TempDir::new().unwrap();
    run(directory.path(), &["init", "-b", "main"]);
    run(directory.path(), &["config", "core.autocrlf", "false"]);
    run(directory.path(), &["config", "user.name", "Test"]);
    run(
        directory.path(),
        &["config", "user.email", "test@example.com"],
    );
    fs::write(directory.path().join("first.txt"), "first\n").unwrap();
    fs::write(directory.path().join("keep.txt"), "keep\n").unwrap();
    run(directory.path(), &["add", "."]);
    run(directory.path(), &["commit", "-m", "Initial"]);
    directory
}

fn discard(common: &str, root: &str, paths: &[&str]) -> Result<(), String> {
    let plan = git::prepare_discard(common, root)?;
    let selections: Vec<_> = paths
        .iter()
        .map(|path| {
            let file = plan
                .files
                .iter()
                .find(|file| file.file.path == *path)
                .unwrap();
            DiscardSelection {
                path: (*path).into(),
                token: file.token.clone(),
            }
        })
        .collect();
    git::discard_changes(common, root, &plan.head, &selections)
}

#[test]
fn discards_only_selected_files_in_the_selected_worktree() {
    let directory = repo();
    let holder = TempDir::new().unwrap();
    let working = holder.path().join("linked tree");
    run(
        directory.path(),
        &[
            "worktree",
            "add",
            "-b",
            "agent/work",
            working.to_str().unwrap(),
        ],
    );
    let common = git::resolve_common(working.to_str().unwrap()).unwrap();
    let common = common.to_str().unwrap();
    fs::write(directory.path().join("first.txt"), "other worktree\n").unwrap();
    fs::write(working.join("first.txt"), "staged\n").unwrap();
    run(&working, &["add", "first.txt"]);
    fs::write(working.join("first.txt"), "unstaged\n").unwrap();
    fs::write(working.join("keep.txt"), "keep this edit\n").unwrap();
    run(&working, &["add", "keep.txt"]);
    fs::write(working.join("new ü file.txt"), "new\n").unwrap();
    discard(
        common,
        working.to_str().unwrap(),
        &["first.txt", "new ü file.txt"],
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(working.join("first.txt")).unwrap(),
        "first\n"
    );
    assert!(!working.join("new ü file.txt").exists());
    assert_eq!(
        fs::read_to_string(working.join("keep.txt")).unwrap(),
        "keep this edit\n"
    );
    assert_eq!(
        run(&working, &["diff", "--cached", "--name-only"]),
        "keep.txt"
    );
    assert_eq!(
        fs::read_to_string(directory.path().join("first.txt")).unwrap(),
        "other worktree\n"
    );
}

#[test]
fn discards_staged_additions_deletions_and_renames() {
    let directory = repo();
    let root = directory.path().to_str().unwrap();
    run(directory.path(), &["mv", "first.txt", "renamed ü.txt"]);
    run(directory.path(), &["rm", "keep.txt"]);
    fs::write(directory.path().join("added.txt"), "new\n").unwrap();
    run(directory.path(), &["add", "added.txt"]);
    discard(root, root, &["renamed ü.txt", "keep.txt", "added.txt"]).unwrap();
    assert_eq!(
        fs::read_to_string(directory.path().join("first.txt")).unwrap(),
        "first\n"
    );
    assert!(!directory.path().join("renamed ü.txt").exists());
    assert!(!directory.path().join("added.txt").exists());
    assert!(run(directory.path(), &["status", "--porcelain"]).is_empty());
}

#[test]
fn stale_content_or_index_aborts_the_entire_selection() {
    let directory = repo();
    let root = directory.path().to_str().unwrap();
    fs::write(directory.path().join("first.txt"), "changed\n").unwrap();
    fs::write(directory.path().join("keep.txt"), "changed too\n").unwrap();
    for change_index in [false, true] {
        let plan = git::prepare_discard(root, root).unwrap();
        let files: Vec<_> = plan
            .files
            .iter()
            .map(|file| DiscardSelection {
                path: file.file.path.clone(),
                token: file.token.clone(),
            })
            .collect();
        if change_index {
            run(directory.path(), &["add", "first.txt"]);
        } else {
            fs::write(directory.path().join("first.txt"), "newer edit\n").unwrap();
        }
        assert!(git::discard_changes(root, root, &plan.head, &files).is_err());
        assert_eq!(
            fs::read_to_string(directory.path().join("keep.txt")).unwrap(),
            "changed too\n"
        );
    }
}

#[test]
fn rejects_changed_head_wrong_repository_traversal_and_empty_selection() {
    let directory = repo();
    let other = repo();
    let root = directory.path().to_str().unwrap();
    fs::write(directory.path().join("first.txt"), "changed\n").unwrap();
    let plan = git::prepare_discard(root, root).unwrap();
    let file = DiscardSelection {
        path: "first.txt".into(),
        token: plan.files[0].token.clone(),
    };
    assert!(git::prepare_discard(root, other.path().to_str().unwrap()).is_err());
    assert!(git::discard_changes(root, root, &plan.head, &[]).is_err());
    assert!(git::discard_changes(
        root,
        root,
        &plan.head,
        &[DiscardSelection {
            path: "../outside".into(),
            token: "x".into()
        }]
    )
    .is_err());
    run(
        directory.path(),
        &["commit", "--allow-empty", "-m", "Head moved"],
    );
    assert!(git::discard_changes(root, root, &plan.head, &[file]).is_err());
    assert_eq!(
        fs::read_to_string(directory.path().join("first.txt")).unwrap(),
        "changed\n"
    );
}

#[test]
fn directories_nested_repositories_and_submodules_are_unavailable() {
    let directory = repo();
    let nested = directory.path().join("nested");
    fs::create_dir(&nested).unwrap();
    run(&nested, &["init"]);
    fs::write(nested.join("private.txt"), "keep\n").unwrap();
    let root = directory.path().to_str().unwrap();
    let plan = git::prepare_discard(root, root).unwrap();
    assert!(plan
        .files
        .iter()
        .find(|file| file.file.path.starts_with("nested"))
        .unwrap()
        .unavailable
        .is_some());
    assert!(discard(root, root, &["nested/"]).is_err());
    let oid = run(directory.path(), &["rev-parse", "HEAD"]);
    run(
        directory.path(),
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("160000,{oid},module"),
        ],
    );
    let plan = git::prepare_discard(root, root).unwrap();
    assert!(plan
        .files
        .iter()
        .find(|file| file.file.path == "module")
        .unwrap()
        .unavailable
        .is_some());
    assert_eq!(
        fs::read_to_string(nested.join("private.txt")).unwrap(),
        "keep\n"
    );
}

#[cfg(unix)]
#[test]
fn literal_paths_and_symlinks_do_not_touch_external_files() {
    use std::os::unix::fs::symlink;
    let directory = repo();
    let outside = TempDir::new().unwrap();
    let external = outside.path().join("external.txt");
    fs::write(&external, "keep\n").unwrap();
    symlink(&external, directory.path().join("link")).unwrap();
    let weird = "odd\n* [x].txt";
    fs::write(directory.path().join(weird), "weird\n").unwrap();
    run(directory.path(), &["add", "--", weird]);
    let root = directory.path().to_str().unwrap();
    discard(root, root, &["link", weird]).unwrap();
    assert!(!directory.path().join("link").symlink_metadata().is_ok());
    assert!(!directory.path().join(weird).exists());
    assert_eq!(fs::read_to_string(external).unwrap(), "keep\n");
}

#[test]
fn renaming_a_linked_worktree_branch_preserves_head_edits_and_upstream() {
    let directory = repo();
    let holder = TempDir::new().unwrap();
    let working = holder.path().join("agent");
    run(
        directory.path(),
        &[
            "worktree",
            "add",
            "-b",
            "agent/work",
            working.to_str().unwrap(),
        ],
    );
    run(
        directory.path(),
        &["config", "branch.agent/work.remote", "origin"],
    );
    run(
        directory.path(),
        &["config", "branch.agent/work.merge", "refs/heads/agent/work"],
    );
    let head = run(&working, &["rev-parse", "HEAD"]);
    fs::write(working.join("first.txt"), "edit\n").unwrap();
    git::rename_branch(
        directory.path().to_str().unwrap(),
        "agent/work",
        "feat/better-name",
        &head,
    )
    .unwrap();
    assert_eq!(
        run(&working, &["branch", "--show-current"]),
        "feat/better-name"
    );
    assert_eq!(run(&working, &["rev-parse", "HEAD"]), head);
    assert_eq!(
        fs::read_to_string(working.join("first.txt")).unwrap(),
        "edit\n"
    );
    assert_eq!(
        run(&working, &["config", "branch.feat/better-name.merge"]),
        "refs/heads/agent/work"
    );
    assert!(git::rename_branch(
        directory.path().to_str().unwrap(),
        "feat/better-name",
        "main",
        &head
    )
    .is_err());
    assert!(git::rename_branch(
        directory.path().to_str().unwrap(),
        "feat/better-name",
        "-bad",
        &head
    )
    .is_err());
    assert!(git::rename_branch(
        directory.path().to_str().unwrap(),
        "feat/better-name",
        "good",
        &"0".repeat(40)
    )
    .is_err());
}

#[test]
fn branch_context_contains_branch_commits_and_only_its_working_changes() {
    let directory = repo();
    let root = directory.path().to_str().unwrap();
    run(directory.path(), &["switch", "-c", "agent/work"]);
    fs::write(directory.path().join("first.txt"), "feature committed\n").unwrap();
    run(directory.path(), &["commit", "-am", "Implement feature"]);
    fs::write(directory.path().join("first.txt"), "feature working\n").unwrap();
    fs::write(directory.path().join("untracked.txt"), "new feature file\n").unwrap();
    let before = run(directory.path(), &["status", "--porcelain"]);
    let index = fs::read(directory.path().join(".git/index")).unwrap();
    let context = git::branch_context(root, "agent/work", Some(root)).unwrap();
    assert!(context.text.contains("Implement feature"));
    assert!(context.text.contains("feature committed"));
    assert!(context.text.contains("feature working"));
    assert!(context.text.contains("new feature file"));
    assert_eq!(run(directory.path(), &["status", "--porcelain"]), before);
    assert_eq!(
        fs::read(directory.path().join(".git/index")).unwrap(),
        index
    );
    assert!(git::branch_context(root, "main", Some(root)).is_err());
}

#[test]
fn restoring_a_rename_requires_selecting_separate_changes_at_its_source() {
    let directory = repo();
    let root = directory.path().to_str().unwrap();
    run(directory.path(), &["mv", "first.txt", "renamed.txt"]);
    fs::write(directory.path().join("first.txt"), "new untracked source\n").unwrap();
    assert!(discard(root, root, &["renamed.txt"]).is_err());
    assert_eq!(
        fs::read_to_string(directory.path().join("first.txt")).unwrap(),
        "new untracked source\n"
    );
    discard(root, root, &["renamed.txt", "first.txt"]).unwrap();
    assert_eq!(
        fs::read_to_string(directory.path().join("first.txt")).unwrap(),
        "first\n"
    );
    assert!(!directory.path().join("renamed.txt").exists());
}
