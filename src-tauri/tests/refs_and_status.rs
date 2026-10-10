use gitler_lib::git;
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

#[test]
fn reads_tags_remotes_stashes_and_staged_renames() {
    let temp = TempDir::new().unwrap();
    let path = temp.path();
    git(path, &["init", "-b", "main"]);
    git(path, &["config", "user.name", "Test Author"]);
    git(path, &["config", "user.email", "test@example.com"]);
    fs::write(path.join("original.txt"), "initial\n").unwrap();
    git(path, &["add", "."]);
    git(path, &["commit", "-m", "Initial"]);
    let initial = git(path, &["rev-parse", "HEAD"]);
    git(path, &["tag", "-a", "v1.0", "-m", "Release"]);
    git(
        path,
        &["remote", "add", "origin", "https://example.com/repo.git"],
    );
    fs::write(path.join("original.txt"), "stashed\n").unwrap();
    git(path, &["stash", "push", "-m", "Saved work"]);
    git(path, &["mv", "original.txt", "renamed ü.txt"]);
    let snapshot = git::snapshot(path.to_str().unwrap(), 100).unwrap();
    assert_eq!(
        snapshot
            .refs
            .iter()
            .find(|reference| reference.name == "v1.0")
            .unwrap()
            .oid,
        initial
    );
    assert_eq!(snapshot.remotes[0].name, "origin");
    assert_eq!(snapshot.stashes.len(), 1);
    assert!(snapshot.stashes[0].subject.contains("Saved work"));
    let renamed = &snapshot.worktrees[0].files[0];
    assert_eq!(renamed.index_status, "R");
    assert_eq!(renamed.old_path.as_deref(), Some("original.txt"));
    assert_eq!(renamed.path, "renamed ü.txt");
}
