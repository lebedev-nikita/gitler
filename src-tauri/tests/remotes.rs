use gitler_lib::git;
use std::{fs, path::Path, process::Command};
use tempfile::TempDir;

fn run(path: &Path, args: &[&str]) -> String {
    let result = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    String::from_utf8_lossy(&result.stdout).trim().into()
}

fn repo() -> TempDir {
    let directory = TempDir::new().unwrap();
    run(directory.path(), &["init", "-b", "main"]);
    run(directory.path(), &["config", "user.name", "Test"]);
    run(
        directory.path(),
        &["config", "user.email", "test@example.com"],
    );
    fs::write(directory.path().join("file.txt"), "initial\n").unwrap();
    run(directory.path(), &["add", "."]);
    run(directory.path(), &["commit", "-m", "Initial"]);
    directory
}

#[test]
fn converts_network_remotes_to_safe_browser_urls() {
    for (address, expected) in [
        (
            "git@github.com:owner/project.git",
            "https://github.com/owner/project",
        ),
        (
            "ssh://git@ssh.github.com:443/owner/project.git",
            "https://github.com/owner/project",
        ),
        (
            "ssh://git@gitlab.com:2222/group/subgroup/project.git",
            "https://gitlab.com/group/subgroup/project",
        ),
        (
            "git://github.com/owner/project.git",
            "https://github.com/owner/project",
        ),
        (
            "https://user:secret@github.com/owner/project.git?token=secret#branch",
            "https://github.com/owner/project",
        ),
        (
            "http://git.example.com:8080/owner/project.git/",
            "http://git.example.com:8080/owner/project",
        ),
        (
            "https://github.com/owner/a%20b.git",
            "https://github.com/owner/a%20b",
        ),
    ] {
        assert_eq!(
            git::remote_web_url(address).as_deref(),
            Some(expected),
            "{address}"
        );
    }
    for address in [
        "/tmp/repo.git",
        "../repo",
        "C:\\repo.git",
        "file:///tmp/repo",
        "javascript:alert(1)",
        "ext::command",
        "git@alias:repo.git",
        "https://github.com/",
        "https://github.com/owner/repo\n",
    ] {
        assert!(git::remote_web_url(address).is_none(), "{address}");
    }
}

#[test]
fn fetches_from_linked_worktrees_without_changing_local_branches_tags_or_files() {
    let server = repo();
    let local = repo();
    run(
        local.path(),
        &["remote", "add", "origin", server.path().to_str().unwrap()],
    );
    // User configuration must not redirect automatic fetch into local branches or tags.
    run(
        local.path(),
        &[
            "config",
            "remote.origin.fetch",
            "+refs/heads/*:refs/heads/*",
        ],
    );
    run(local.path(), &["config", "fetch.prune", "true"]);
    run(local.path(), &["config", "fetch.pruneTags", "true"]);
    run(local.path(), &["tag", "local-tag"]);
    run(
        local.path(),
        &["update-ref", "refs/remotes/origin/old", "HEAD"],
    );
    let holder = TempDir::new().unwrap();
    let linked = holder.path().join("linked");
    run(
        local.path(),
        &["worktree", "add", "-b", "agent", linked.to_str().unwrap()],
    );
    fs::write(linked.join("file.txt"), "local edits\n").unwrap();
    let index = fs::read(local.path().join(".git/index")).unwrap();
    let local_head = run(local.path(), &["rev-parse", "main"]);
    run(
        server.path(),
        &["commit", "--allow-empty", "-m", "Remote-only commit"],
    );
    run(server.path(), &["branch", "new-branch"]);
    run(server.path(), &["tag", "remote-tag"]);
    let remote_head = run(server.path(), &["rev-parse", "HEAD"]);
    let common = git::resolve_common(linked.to_str().unwrap()).unwrap();
    git::fetch_remotes(common.to_str().unwrap()).unwrap();
    let snapshot = git::snapshot(linked.to_str().unwrap(), 100).unwrap();
    assert!(snapshot
        .commits
        .iter()
        .any(|commit| commit.oid == remote_head));
    assert!(snapshot
        .refs
        .iter()
        .any(|reference| reference.name == "origin/new-branch"));
    assert_eq!(run(local.path(), &["rev-parse", "main"]), local_head);
    assert_eq!(run(&linked, &["rev-parse", "HEAD"]), local_head);
    assert_eq!(fs::read(local.path().join(".git/index")).unwrap(), index);
    assert_eq!(
        fs::read_to_string(linked.join("file.txt")).unwrap(),
        "local edits\n"
    );
    assert_eq!(run(local.path(), &["tag", "--list"]), "local-tag");
    assert!(!local.path().join(".git/FETCH_HEAD").exists());
    assert!(snapshot
        .refs
        .iter()
        .any(|reference| reference.name == "origin/old"));
    assert!(snapshot.remotes[0].web_url.is_none());
}

#[test]
fn resolves_current_remote_and_reports_partial_fetch_failures() {
    let server = repo();
    let local = repo();
    let common = git::resolve_common(local.path().to_str().unwrap()).unwrap();
    git::fetch_remotes(common.to_str().unwrap()).unwrap();
    run(
        local.path(),
        &["remote", "add", "origin", "git@github.com:owner/first.git"],
    );
    assert_eq!(
        git::remote_url(common.to_str().unwrap(), "origin").unwrap(),
        "https://github.com/owner/first"
    );
    run(
        local.path(),
        &[
            "remote",
            "set-url",
            "origin",
            "https://github.com/owner/second.git",
        ],
    );
    assert_eq!(
        git::remote_url(common.to_str().unwrap(), "origin").unwrap(),
        "https://github.com/owner/second"
    );
    run(local.path(), &["remote", "remove", "origin"]);
    assert!(git::remote_url(common.to_str().unwrap(), "origin").is_err());
    run(
        local.path(),
        &[
            "remote",
            "add",
            "broken",
            local.path().join("missing").to_str().unwrap(),
        ],
    );
    run(
        local.path(),
        &["remote", "add", "upstream", server.path().to_str().unwrap()],
    );
    assert!(git::fetch_remotes(common.to_str().unwrap())
        .unwrap_err()
        .contains("broken"));
    assert!(git::snapshot(local.path().to_str().unwrap(), 100)
        .unwrap()
        .refs
        .iter()
        .any(|reference| reference.name == "upstream/main"));
    assert!(git::fetch_remotes("/not/a/repository").is_err());
}
