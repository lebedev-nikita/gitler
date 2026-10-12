use gitler_lib::git;
use std::{fs, path::Path, process::Command};
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
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

struct Fixture {
    holder: TempDir,
    remote: std::path::PathBuf,
    local: std::path::PathBuf,
    common: String,
    head: String,
}
impl Fixture {
    fn new() -> Self {
        let holder = TempDir::new().unwrap();
        let remote = holder.path().join("remote");
        let local = holder.path().join("local");
        fs::create_dir(&remote).unwrap();
        run(&remote, &["init", "-b", "main"]);
        run(&remote, &["config", "user.name", "Test"]);
        run(&remote, &["config", "user.email", "test@example.com"]);
        fs::write(remote.join("file"), "initial\n").unwrap();
        fs::write(remote.join(".gitignore"), "ignored\n").unwrap();
        run(&remote, &["add", "."]);
        run(&remote, &["commit", "-m", "Initial"]);
        run(
            holder.path(),
            &["clone", remote.to_str().unwrap(), local.to_str().unwrap()],
        );
        let common = git::resolve_common(local.to_str().unwrap())
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned();
        let head = run(&local, &["rev-parse", "HEAD"]);
        Self {
            holder,
            remote,
            local,
            common,
            head,
        }
    }
    fn advance(&self) -> String {
        fs::write(self.remote.join("file"), "upstream\n").unwrap();
        run(&self.remote, &["add", "."]);
        run(&self.remote, &["commit", "-m", "Upstream"]);
        run(&self.remote, &["rev-parse", "HEAD"])
    }
    fn pull(&self) -> Result<(), String> {
        git::pull_branch(
            &self.common,
            "main",
            &self.head,
            Some(self.local.to_str().unwrap()),
        )
    }
}

#[test]
fn pulls_main_without_honoring_dangerous_fetch_or_merge_configuration() {
    let f = Fixture::new();
    let target = f.advance();
    run(&f.local, &["branch", "keep"]);
    run(&f.local, &["tag", "keep"]);
    run(&f.remote, &["tag", "remote-tag"]);
    run(
        &f.local,
        &[
            "config",
            "remote.origin.fetch",
            "+refs/heads/*:refs/heads/*",
        ],
    );
    run(
        &f.local,
        &[
            "config",
            "--add",
            "remote.origin.fetch",
            "+refs/tags/*:refs/tags/*",
        ],
    );
    run(&f.local, &["config", "remote.origin.tagOpt", "--tags"]);
    run(&f.local, &["config", "fetch.prune", "true"]);
    run(&f.local, &["config", "fetch.pruneTags", "true"]);
    run(
        &f.local,
        &["config", "branch.main.mergeOptions", "--squash --no-ff"],
    );
    run(&f.local, &["config", "merge.autoStash", "true"]);
    run(&f.local, &["config", "pull.rebase", "true"]);
    fs::write(f.local.join("ignored"), "preserve\n").unwrap();
    f.pull().unwrap();
    assert_eq!(run(&f.local, &["rev-parse", "HEAD"]), target);
    assert_eq!(run(&f.local, &["rev-parse", "keep"]), f.head);
    assert_eq!(run(&f.local, &["tag", "--list"]), "keep");
    assert_eq!(
        fs::read_to_string(f.local.join("file")).unwrap(),
        "upstream\n"
    );
    assert_eq!(
        fs::read_to_string(f.local.join("ignored")).unwrap(),
        "preserve\n"
    );
    assert_eq!(run(&f.local, &["status", "--porcelain"]), "");
    git::pull_branch(&f.common, "main", &target, Some(f.local.to_str().unwrap())).unwrap();
}

#[test]
fn pulls_linked_worktree_and_unchecked_branch_preserving_dirty_main() {
    for checked_out in [false, true] {
        let f = Fixture::new();
        let target = f.advance();
        run(&f.local, &["branch", "selected"]);
        run(&f.local, &["config", "branch.selected.remote", "origin"]);
        run(
            &f.local,
            &["config", "branch.selected.merge", "refs/heads/main"],
        );
        let linked = f.holder.path().join("linked tree");
        if checked_out {
            run(
                &f.local,
                &["worktree", "add", linked.to_str().unwrap(), "selected"],
            );
        }
        fs::write(f.local.join("file"), "staged\n").unwrap();
        run(&f.local, &["add", "file"]);
        fs::write(f.local.join("file"), "working\n").unwrap();
        fs::write(f.local.join("untracked"), "keep\n").unwrap();
        let index = fs::read(f.local.join(".git/index")).unwrap();
        let trees = run(&f.local, &["worktree", "list", "--porcelain"]);
        git::pull_branch(
            &f.common,
            "selected",
            &f.head,
            if checked_out {
                Some(linked.to_str().unwrap())
            } else {
                None
            },
        )
        .unwrap();
        assert_eq!(run(&f.local, &["rev-parse", "selected"]), target);
        assert_eq!(run(&f.local, &["rev-parse", "main"]), f.head);
        assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read_to_string(f.local.join("file")).unwrap(),
            "working\n"
        );
        assert_eq!(
            fs::read_to_string(f.local.join("untracked")).unwrap(),
            "keep\n"
        );
        if checked_out {
            assert_eq!(
                fs::read_to_string(linked.join("file")).unwrap(),
                "upstream\n"
            );
        } else {
            assert_eq!(run(&f.local, &["worktree", "list", "--porcelain"]), trees);
        }
    }
}

#[test]
fn rejects_dirty_working_copies_without_modifying_index_or_files() {
    for kind in ["staged", "unstaged", "untracked"] {
        let f = Fixture::new();
        f.advance();
        let name = if kind == "untracked" { "new" } else { "file" };
        fs::write(f.local.join(name), "keep\n").unwrap();
        if kind == "staged" {
            run(&f.local, &["add", "file"]);
        }
        let index = fs::read(f.local.join(".git/index")).unwrap();
        assert!(f.pull().unwrap_err().contains("Commit or stash"));
        assert_eq!(run(&f.local, &["rev-parse", "HEAD"]), f.head);
        assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
        assert_eq!(fs::read_to_string(f.local.join(name)).unwrap(), "keep\n");
    }
}

#[test]
fn rejects_stale_heads_changed_worktrees_and_foreign_repositories() {
    let f = Fixture::new();
    let target = f.advance();
    assert!(
        git::pull_branch(&f.common, "main", &target, Some(f.local.to_str().unwrap()))
            .unwrap_err()
            .contains("branch moved")
    );
    assert!(git::pull_branch(&f.common, "main", &f.head, None)
        .unwrap_err()
        .contains("worktree changed"));
    assert!(
        git::pull_branch(&f.common, "main", &f.head, Some(f.remote.to_str().unwrap())).is_err()
    );
    run(&f.local, &["branch", "selected"]);
    let linked = f.holder.path().join("linked");
    run(
        &f.local,
        &["worktree", "add", linked.to_str().unwrap(), "selected"],
    );
    assert!(git::pull_branch(&f.common, "selected", &f.head, None).is_err());
    assert_eq!(run(&f.local, &["rev-parse", "main"]), f.head);
}

#[test]
fn rejects_divergence_without_starting_a_merge_or_rebase() {
    let mut f = Fixture::new();
    let target = f.advance();
    run(&f.local, &["config", "user.name", "Test"]);
    run(&f.local, &["config", "user.email", "test@example.com"]);
    fs::write(f.local.join("local"), "local\n").unwrap();
    run(&f.local, &["add", "."]);
    run(&f.local, &["commit", "-m", "Local"]);
    f.head = run(&f.local, &["rev-parse", "HEAD"]);
    let index = fs::read(f.local.join(".git/index")).unwrap();
    assert!(f.pull().unwrap_err().contains("diverged"));
    assert_eq!(run(&f.local, &["rev-parse", "HEAD"]), f.head);
    assert_eq!(run(&f.local, &["rev-parse", "origin/main"]), target);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    assert!(!f.local.join(".git/MERGE_HEAD").exists());
    assert!(!f.local.join(".git/rebase-merge").exists());
}

#[test]
fn refuses_to_overwrite_ignored_files() {
    let f = Fixture::new();
    fs::write(f.local.join("ignored"), "precious\n").unwrap();
    fs::write(f.remote.join("ignored"), "upstream\n").unwrap();
    run(&f.remote, &["add", "-f", "ignored"]);
    run(&f.remote, &["commit", "-m", "Track ignored file"]);
    let index = fs::read(f.local.join(".git/index")).unwrap();
    assert!(f.pull().is_err());
    assert_eq!(
        fs::read_to_string(f.local.join("ignored")).unwrap(),
        "precious\n"
    );
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    assert_eq!(run(&f.local, &["rev-parse", "HEAD"]), f.head);
}

#[test]
fn rejects_missing_upstream_and_in_progress_operations() {
    let f = Fixture::new();
    f.advance();
    fs::write(f.local.join(".git/MERGE_HEAD"), &f.head).unwrap();
    assert!(f.pull().unwrap_err().contains("Finish the Git operation"));
    fs::remove_file(f.local.join(".git/MERGE_HEAD")).unwrap();
    run(&f.local, &["config", "--unset", "branch.main.remote"]);
    assert!(f.pull().unwrap_err().contains("upstream remote"));
    assert_eq!(run(&f.local, &["rev-parse", "HEAD"]), f.head);
}

#[test]
fn supports_local_upstream_and_preserves_ahead_branches() {
    let mut f = Fixture::new();
    let target = f.advance();
    run(&f.local, &["fetch", "origin"]);
    run(&f.local, &["branch", "upstream", &target]);
    run(&f.local, &["config", "branch.main.remote", "."]);
    run(
        &f.local,
        &["config", "branch.main.merge", "refs/heads/upstream"],
    );
    f.pull().unwrap();
    f.head = target;
    run(
        &f.local,
        &["config", "branch.main.merge", "refs/heads/upstream"],
    );
    run(
        &f.local,
        &[
            "update-ref",
            "refs/heads/upstream",
            &run(&f.local, &["rev-parse", "HEAD^"]),
        ],
    );
    f.pull().unwrap();
    assert_eq!(run(&f.local, &["rev-parse", "HEAD"]), f.head);
}
