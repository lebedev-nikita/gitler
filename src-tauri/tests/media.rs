use base64::{engine::general_purpose::STANDARD, Engine};
use gitler_lib::git::{self, DiffRequest, MediaVersion};
use std::{fs, path::Path, process::Command};
use tempfile::TempDir;

fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().into()
}

fn repo() -> TempDir {
    let repo = TempDir::new().unwrap();
    git(repo.path(), &["init", "-b", "main"]);
    git(repo.path(), &["config", "user.name", "Test"]);
    git(repo.path(), &["config", "user.email", "test@example.com"]);
    repo
}

fn commit(root: &Path) -> String {
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "Media"]);
    git(root, &["rev-parse", "HEAD"])
}

fn request(root: &Path, path: &str) -> DiffRequest {
    DiffRequest {
        common_dir: git::resolve_common(root.to_str().unwrap())
            .unwrap()
            .to_string_lossy()
            .into(),
        path: path.into(),
        old_path: None,
        oid: None,
        base: None,
        worktree: Some(fs::canonicalize(root).unwrap().to_string_lossy().into()),
        mode: "combined".into(),
        reverse: false,
    }
}

fn bytes(version: Option<MediaVersion>) -> Vec<u8> {
    let version = version.unwrap();
    assert!(version.error.is_none(), "{:?}", version.error);
    let url = version.data_url.unwrap();
    let bytes = STANDARD.decode(url.split_once(',').unwrap().1).unwrap();
    assert_eq!(version.size, Some(bytes.len()));
    bytes
}

#[test]
fn reads_commit_index_and_working_versions_without_changing_repository() {
    let repo = repo();
    fs::write(repo.path().join("image.png"), b"head\0image").unwrap();
    let head = commit(repo.path());
    fs::write(repo.path().join("image.png"), b"index\0image").unwrap();
    git(repo.path(), &["add", "."]);
    fs::write(repo.path().join("image.png"), b"working\0image").unwrap();
    let index = fs::read(repo.path().join(".git/index")).unwrap();
    let refs = git(repo.path(), &["show-ref"]);
    let mut request = request(repo.path(), "image.png");
    let media = git::file_media(&request).unwrap();
    assert_eq!(bytes(media.before), b"head\0image");
    assert_eq!(bytes(media.after), b"working\0image");
    request.mode = "staged".into();
    let media = git::file_media(&request).unwrap();
    assert_eq!(bytes(media.before), b"head\0image");
    assert_eq!(bytes(media.after), b"index\0image");
    request.mode = "unstaged".into();
    let media = git::file_media(&request).unwrap();
    assert_eq!(bytes(media.before), b"index\0image");
    assert_eq!(bytes(media.after), b"working\0image");
    request.mode = "staged".into();
    request.base = Some(head);
    request.reverse = true;
    let media = git::file_media(&request).unwrap();
    assert_eq!(bytes(media.before), b"working\0image");
    assert_eq!(bytes(media.after), b"head\0image");
    assert_eq!(fs::read(repo.path().join(".git/index")).unwrap(), index);
    assert_eq!(git(repo.path(), &["show-ref"]), refs);
    assert_eq!(
        fs::read(repo.path().join("image.png")).unwrap(),
        b"working\0image"
    );
}

#[test]
fn previews_root_renamed_deleted_and_untracked_files() {
    let repo = repo();
    fs::write(repo.path().join("old name.SVG"), "<svg/>").unwrap();
    let first = commit(repo.path());
    let mut historical = request(repo.path(), "old name.SVG");
    historical.worktree = None;
    historical.oid = Some(first.clone());
    let root = git::file_media(&historical).unwrap();
    assert!(root.before.is_none());
    assert_eq!(root.after.as_ref().unwrap().mime, "image/svg+xml");
    assert_eq!(bytes(root.after), b"<svg/>");
    git(repo.path(), &["mv", "old name.SVG", "new name.svg"]);
    let mut renamed = request(repo.path(), "new name.svg");
    renamed.old_path = Some("old name.SVG".into());
    fs::write(repo.path().join("new name.svg"), "working").unwrap();
    renamed.mode = "unstaged".into();
    assert_eq!(bytes(git::file_media(&renamed).unwrap().before), b"<svg/>");
    let second = commit(repo.path());
    renamed.worktree = None;
    renamed.oid = Some(second.clone());
    renamed.base = Some(first);
    let media = git::file_media(&renamed).unwrap();
    assert_eq!(bytes(media.before), b"<svg/>");
    assert_eq!(bytes(media.after), b"working");
    git(repo.path(), &["rm", "new name.svg"]);
    let third = commit(repo.path());
    historical.path = "new name.svg".into();
    historical.oid = Some(third);
    let media = git::file_media(&historical).unwrap();
    assert_eq!(bytes(media.before), b"working");
    assert!(media.after.is_none());
    fs::write(repo.path().join("new name.svg"), "restored").unwrap();
    let mut restored = request(repo.path(), "new name.svg");
    restored.mode = "untracked".into();
    restored.base = Some(second);
    let media = git::file_media(&restored).unwrap();
    assert_eq!(bytes(media.before), b"working");
    assert_eq!(bytes(media.after), b"restored");
    git(repo.path(), &["add", "."]);
    assert!(git::file_media(&restored).is_err());
}

#[test]
fn supports_unborn_linked_worktrees_and_rejects_unowned_paths() {
    let repo = repo();
    fs::write(repo.path().join("clip.webm"), "video").unwrap();
    let mut req = request(repo.path(), "clip.webm");
    req.mode = "untracked".into();
    let media = git::file_media(&req).unwrap();
    assert!(media.before.is_none());
    assert_eq!(media.after.unwrap().mime, "video/webm");
    git(repo.path(), &["add", "."]);
    req.mode = "staged".into();
    assert_eq!(bytes(git::file_media(&req).unwrap().after), b"video");
    commit(repo.path());
    let holder = TempDir::new().unwrap();
    let linked = holder.path().join("linked");
    git(
        repo.path(),
        &["worktree", "add", "-b", "media", linked.to_str().unwrap()],
    );
    fs::write(linked.join("clip.webm"), "linked video").unwrap();
    req.worktree = Some(fs::canonicalize(&linked).unwrap().to_string_lossy().into());
    req.mode = "combined".into();
    assert_eq!(bytes(git::file_media(&req).unwrap().after), b"linked video");
    let other = TempDir::new().unwrap();
    req.worktree = Some(other.path().to_string_lossy().into());
    assert!(git::file_media(&req).is_err());
    req.worktree = None;
    req.path = "../secret.png".into();
    assert!(git::file_media(&req).is_err());
}

#[test]
fn reports_size_limits_and_does_not_follow_symbolic_links() {
    let repo = repo();
    fs::write(repo.path().join("large.mp3"), "small").unwrap();
    commit(repo.path());
    let large = fs::File::create(repo.path().join("large.mp3")).unwrap();
    large.set_len(16 * 1024 * 1024 + 1).unwrap();
    let req = request(repo.path(), "large.mp3");
    let media = git::file_media(&req).unwrap();
    assert_eq!(bytes(media.before), b"small");
    assert!(media.after.unwrap().error.unwrap().contains("16 MiB"));
    let head = commit(repo.path());
    let mut historical = request(repo.path(), "large.mp3");
    historical.worktree = None;
    historical.oid = Some(head);
    assert!(git::file_media(&historical)
        .unwrap()
        .after
        .unwrap()
        .error
        .unwrap()
        .contains("16 MiB"));
    #[cfg(unix)]
    {
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("secret.png"), "secret").unwrap();
        std::os::unix::fs::symlink(outside.path(), repo.path().join("outside")).unwrap();
        let req = request(repo.path(), "outside/secret.png");
        assert!(git::file_media(&req)
            .unwrap()
            .after
            .unwrap()
            .data_url
            .is_none());
        std::os::unix::fs::symlink(
            outside.path().join("secret.png"),
            repo.path().join("link.png"),
        )
        .unwrap();
        let req = request(repo.path(), "link.png");
        assert!(git::file_media(&req)
            .unwrap()
            .after
            .unwrap()
            .data_url
            .is_none());
    }
}
