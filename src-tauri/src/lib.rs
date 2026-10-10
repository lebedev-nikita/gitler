pub mod git;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Default)]
struct LaunchPath(Mutex<Option<String>>);

/// Parse paths relative to the invoking terminal, including subsequent launches.
pub fn cli_path(args: &[String], cwd: &Path) -> Result<Option<String>, String> {
    let mut values = args.iter().skip(1).filter(|arg| arg.as_str() != "--");
    let Some(first) = values.next() else {
        return Ok(None);
    };
    let path = if first == "open" {
        values.next().map(String::as_str).unwrap_or(".")
    } else if first == "--help" || first == "-h" {
        return Err(
            "Usage: gitler [open] [PATH]\nOpen any folder in a Git repository or worktree.".into(),
        );
    } else {
        first.as_str()
    };
    if values.next().is_some() || path.starts_with('-') {
        return Err("Usage: gitler [open] [PATH]".into());
    }
    let path = PathBuf::from(path);
    let resolved = if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    };
    Ok(Some(resolved.to_string_lossy().into_owned()))
}

#[tauri::command]
fn launch_path(state: tauri::State<LaunchPath>) -> Option<String> {
    state.0.lock().ok().and_then(|mut value| value.take())
}

#[tauri::command]
async fn repository_snapshot(path: String, limit: usize) -> Result<git::Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git::snapshot(&path, limit))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn commit_detail(
    common_dir: String,
    oid: String,
    base: Option<String>,
) -> Result<git::Detail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::commit_detail(&common_dir, &oid, base.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn file_diff(request: git::DiffRequest) -> Result<git::DiffResult, String> {
    tauri::async_runtime::spawn_blocking(move || git::file_diff(&request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn worktree_detail(
    common_dir: String,
    worktree: String,
    base: Option<String>,
) -> Result<git::Detail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::worktree_detail(&common_dir, &worktree, base.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn resolve_commit(common_dir: String, revision: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git::resolve_commit(&common_dir, &revision))
        .await
        .map_err(|error| error.to_string())?
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    let initial = match cli_path(&args, &cwd) {
        Ok(value) => value,
        Err(message) => {
            println!("{message}");
            return;
        }
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Ok(Some(path)) = cli_path(&args, Path::new(&cwd)) {
                if let Ok(mut pending) = app.state::<LaunchPath>().0.lock() {
                    *pending = Some(path.clone());
                }
                let _ = app.emit("repository-open", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchPath(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![
            launch_path,
            repository_snapshot,
            commit_detail,
            worktree_detail,
            resolve_commit,
            file_diff
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gitler");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_cli_relative_to_invoking_terminal() {
        assert_eq!(
            cli_path(
                &["gitler".into(), "open".into(), "worktree".into()],
                Path::new("/tmp")
            )
            .unwrap(),
            Some(
                Path::new("/tmp")
                    .join("worktree")
                    .to_string_lossy()
                    .into_owned()
            )
        );
        assert_eq!(
            cli_path(&["gitler".into()], Path::new("/tmp")).unwrap(),
            None
        );
        assert!(cli_path(&["gitler".into(), "--oops".into()], Path::new("/tmp")).is_err());
    }
}
