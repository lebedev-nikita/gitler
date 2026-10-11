use gitler_lib::git;
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn git(path: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(["-c", "merge.ff=true"])
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
    let repo = TempDir::new().unwrap();
    git(repo.path(), &["init", "-b", "main"]);
    git(repo.path(), &["config", "user.name", "Test Author"]);
    git(repo.path(), &["config", "user.email", "test@example.com"]);
    commit(repo.path(), "base.txt", "base\n");
    repo
}

fn commit(path: &Path, name: &str, content: &str) -> String {
    fs::write(path.join(name), content).unwrap();
    git(path, &["add", "."]);
    git(path, &["commit", "-m", name]);
    git(path, &["rev-parse", "HEAD"])
}

fn integration(path: &Path, branch: &str) -> Option<git::BranchIntegration> {
    git::snapshot(path.to_str().unwrap(), 50)
        .unwrap()
        .refs
        .into_iter()
        .find(|reference| reference.name == branch)
        .unwrap()
        .integration
}

#[test]
fn recognizes_merged_branch_outside_the_graph_page_without_touching_worktrees() {
    let repo = repo();
    let holder = TempDir::new().unwrap();
    let tree = holder.path().join("agent");
    git(
        repo.path(),
        &["worktree", "add", "-b", "feature", tree.to_str().unwrap()],
    );
    commit(&tree, "first.txt", "first\n");
    commit(&tree, "second.txt", "second\n");
    git(
        repo.path(),
        &["merge", "--no-ff", "feature", "-m", "Merge feature"],
    );
    git(
        repo.path(),
        &[
            "update-ref",
            "refs/remotes/origin/feature",
            &git(&tree, &["rev-parse", "HEAD"]),
        ],
    );
    // The corresponding main commit need not be in the loaded graph page.
    for index in 0..55 {
        commit(repo.path(), "later.txt", &format!("{index}\n"));
    }
    fs::write(tree.join("first.txt"), "staged\n").unwrap();
    git(&tree, &["add", "."]);
    fs::write(tree.join("first.txt"), "unstaged\n").unwrap();
    let common = git(repo.path(), &["rev-parse", "--git-common-dir"]);
    let index_path = tree.join(git(&tree, &["rev-parse", "--git-path", "index"]));
    let index = fs::read(&index_path).unwrap();
    let refs = git(repo.path(), &["show-ref"]);
    let expected = integration(&tree, "feature").unwrap();
    assert_eq!(expected.target, "main");
    assert_eq!(integration(&tree, "origin/feature").unwrap().target, "main");
    assert_eq!(fs::read(index_path).unwrap(), index);
    assert_eq!(
        fs::read_to_string(tree.join("first.txt")).unwrap(),
        "unstaged\n"
    );
    assert_eq!(git(repo.path(), &["show-ref"]), refs);
    assert_eq!(git(repo.path(), &["rev-parse", "--git-common-dir"]), common);
    commit(&tree, "new-work.txt", "not merged\n");
    assert!(integration(&tree, "feature").is_none());
}

#[test]
fn does_not_recognize_rewritten_commits_as_merged() {
    let repo = repo();
    git(repo.path(), &["checkout", "-b", "feature"]);
    let first = commit(repo.path(), "first.txt", "first\n");
    let second = commit(repo.path(), "second.txt", "second\n");
    git(repo.path(), &["checkout", "main"]);
    commit(repo.path(), "unrelated.txt", "main moved\n");
    git(repo.path(), &["cherry-pick", &first]);
    assert!(integration(repo.path(), "feature").is_none());
    git(repo.path(), &["cherry-pick", &second]);
    assert!(integration(repo.path(), "feature").is_none());
}

#[test]
fn does_not_recognize_squashed_changes_as_merged() {
    let repo = repo();
    git(repo.path(), &["checkout", "-b", "feature"]);
    commit(repo.path(), "first.txt", "first\n");
    let tip = commit(repo.path(), "second.txt", "second\n");
    git(
        repo.path(),
        &["update-ref", "refs/remotes/origin/feature", &tip],
    );
    git(repo.path(), &["checkout", "main"]);
    git(repo.path(), &["merge", "--squash", "feature"]);
    git(repo.path(), &["commit", "-m", "Squash feature"]);
    assert!(git(repo.path(), &["diff", "main", "feature"]).is_empty());
    assert!(integration(repo.path(), "feature").is_none());
    assert!(integration(repo.path(), "origin/feature").is_none());
}

#[test]
fn does_not_match_a_subset_of_a_main_commit() {
    let repo = repo();
    git(repo.path(), &["checkout", "-b", "feature"]);
    commit(repo.path(), "feature.txt", "feature\n");
    git(repo.path(), &["checkout", "main"]);
    fs::write(repo.path().join("feature.txt"), "feature\n").unwrap();
    commit(repo.path(), "extra.txt", "additional main changes\n");
    assert!(integration(repo.path(), "feature").is_none());
}

#[test]
fn recognizes_rebased_branch_after_fast_forward_or_merge_commit() {
    for method in ["--ff-only", "--no-ff"] {
        let repo = repo();
        git(repo.path(), &["checkout", "-b", "feature"]);
        commit(repo.path(), "first.txt", "first\n");
        let old_tip = commit(repo.path(), "second.txt", "second\n");
        git(repo.path(), &["branch", "before-rebase"]);
        git(repo.path(), &["checkout", "main"]);
        commit(repo.path(), "unrelated.txt", "main moved\n");
        git(repo.path(), &["checkout", "feature"]);
        git(repo.path(), &["rebase", "main"]);
        let new_tip = git(repo.path(), &["rev-parse", "HEAD"]);
        assert_ne!(old_tip, new_tip);
        git(
            repo.path(),
            &["update-ref", "refs/remotes/origin/feature", &new_tip],
        );
        assert!(integration(repo.path(), "feature").is_none());
        git(repo.path(), &["checkout", "main"]);
        git(
            repo.path(),
            &["merge", method, "feature", "-m", "Merge feature"],
        );
        assert_eq!(integration(repo.path(), "feature").unwrap().target, "main");
        assert_eq!(
            integration(repo.path(), "origin/feature").unwrap().target,
            "main"
        );
        assert!(integration(repo.path(), "before-rebase").is_none());
    }
}

#[test]
fn recognizes_ancestry_and_ignores_main_tags_empty_patches_and_unrelated_roots() {
    let repo = repo();
    git(repo.path(), &["branch", "merged"]);
    git(repo.path(), &["tag", "release"]);
    git(repo.path(), &["checkout", "-b", "empty"]);
    git(repo.path(), &["commit", "--allow-empty", "-m", "Empty"]);
    git(repo.path(), &["checkout", "--orphan", "unrelated"]);
    git(repo.path(), &["commit", "-m", "Other root"]);
    git(repo.path(), &["checkout", "main"]);
    assert_eq!(integration(repo.path(), "merged").unwrap().target, "main");
    for name in ["main", "release", "empty", "unrelated"] {
        assert!(integration(repo.path(), name).is_none(), "{name}");
    }
}

#[test]
fn does_not_treat_significant_whitespace_or_different_binary_content_as_equivalent() {
    let repo = repo();
    git(repo.path(), &["checkout", "-b", "feature"]);
    commit(repo.path(), "script.py", "if True:\n    run()\n");
    git(repo.path(), &["checkout", "main"]);
    commit(repo.path(), "script.py", "if True:\nrun()\n");
    assert!(integration(repo.path(), "feature").is_none());
    git(repo.path(), &["checkout", "-b", "binary"]);
    fs::write(repo.path().join("image.bin"), b"\0one").unwrap();
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-m", "Binary one"]);
    git(repo.path(), &["checkout", "main"]);
    fs::write(repo.path().join("image.bin"), b"\0two").unwrap();
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-m", "Binary two"]);
    assert!(integration(repo.path(), "binary").is_none());
}

#[test]
fn does_not_hide_unmerged_submodule_updates_when_git_config_ignores_them() {
    let repo = repo();
    let base = git(repo.path(), &["rev-parse", "HEAD"]);
    git(repo.path(), &["checkout", "-b", "feature"]);
    let pointer = commit(repo.path(), "feature.txt", "feature\n");
    git(
        repo.path(),
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("160000,{pointer},module"),
        ],
    );
    git(repo.path(), &["commit", "-m", "Update module"]);
    git(repo.path(), &["checkout", "main"]);
    commit(repo.path(), "feature.txt", "feature\n");
    git(
        repo.path(),
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("160000,{base},module"),
        ],
    );
    git(repo.path(), &["commit", "-m", "Other module version"]);
    git(repo.path(), &["config", "diff.ignoreSubmodules", "all"]);
    assert!(integration(repo.path(), "feature").is_none());
}

#[test]
fn uses_remote_main_when_local_main_is_behind_and_supports_master_and_repositories_without_main() {
    let repo = repo();
    git(repo.path(), &["checkout", "-b", "feature"]);
    let tip = commit(repo.path(), "feature.txt", "feature\n");
    git(
        repo.path(),
        &["update-ref", "refs/remotes/origin/main", &tip],
    );
    git(repo.path(), &["config", "branch.main.remote", "origin"]);
    git(
        repo.path(),
        &["config", "branch.main.merge", "refs/heads/main"],
    );
    git(
        repo.path(),
        &[
            "config",
            "remote.origin.url",
            "https://example.com/repo.git",
        ],
    );
    git(
        repo.path(),
        &[
            "config",
            "remote.origin.fetch",
            "+refs/heads/*:refs/remotes/origin/*",
        ],
    );
    let status = integration(repo.path(), "feature").unwrap();
    assert_eq!(status.target, "origin/main");
    git(
        repo.path(),
        &["update-ref", "-d", "refs/remotes/origin/main"],
    );
    git(repo.path(), &["branch", "-m", "main", "master"]);
    git(repo.path(), &["checkout", "master"]);
    git(repo.path(), &["merge", "feature"]);
    assert_eq!(
        integration(repo.path(), "feature").unwrap().target,
        "master"
    );
    git(repo.path(), &["branch", "-m", "master", "trunk"]);
    assert!(integration(repo.path(), "feature").is_none());
}
