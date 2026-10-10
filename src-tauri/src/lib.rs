mod codex;
pub mod git;
mod launcher;
mod windows;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use windows::RepositoryWindows;

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
            "Usage: gitler [PATH]\nOpen any folder in a Git repository or worktree.".into(),
        );
    } else {
        first.as_str()
    };
    if values.next().is_some() || path.starts_with('-') {
        return Err("Usage: gitler [PATH]".into());
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
fn launch_path(
    window: tauri::WebviewWindow,
    repositories: tauri::State<RepositoryWindows>,
    state: tauri::State<LaunchPath>,
) -> Option<String> {
    if let Some(path) = repositories.path(window.label()) {
        return Some(path);
    }
    if window.label() != "main" {
        return None;
    }
    state.0.lock().ok().and_then(|mut value| value.take())
}

#[tauri::command]
async fn open_repository(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    path: String,
) -> Result<Option<String>, String> {
    windows::open(app, path, Some(window.label().to_string())).await
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

#[tauri::command]
async fn generate_branch_name(
    jobs: tauri::State<'_, codex::Jobs>,
    request_id: String,
    common_dir: String,
    branch: String,
    worktree: Option<String>,
    codex_path: Option<String>,
) -> Result<codex::BranchSuggestion, String> {
    let cancelled = jobs.start(&request_id)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        codex::generate(
            &common_dir,
            &branch,
            worktree.as_deref(),
            codex_path.as_deref(),
            cancelled,
        )
    })
    .await
    .map_err(|error| error.to_string());
    jobs.finish(&request_id);
    result?
}

#[tauri::command]
fn cancel_codegen(jobs: tauri::State<codex::Jobs>, request_id: String) {
    jobs.cancel(&request_id);
}

#[tauri::command]
async fn rename_branch(
    common_dir: String,
    branch: String,
    new_name: String,
    expected_head: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::rename_branch(&common_dir, &branch, &new_name, &expected_head)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn prepare_discard(common_dir: String, worktree: String) -> Result<git::DiscardPlan, String> {
    tauri::async_runtime::spawn_blocking(move || git::prepare_discard(&common_dir, &worktree))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn discard_changes(
    common_dir: String,
    worktree: String,
    expected_head: String,
    files: Vec<git::DiscardSelection>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::discard_changes(&common_dir, &worktree, &expected_head, &files)
    })
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
    match launcher::detach(!cfg!(debug_assertions)) {
        Ok(true) => return,
        Ok(false) => {}
        Err(error) => {
            eprintln!("Could not launch Gitler: {error}");
            std::process::exit(1);
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Ok(Some(path)) = cli_path(&args, Path::new(&cwd)) {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = windows::open(app.clone(), path.clone(), None).await {
                        eprintln!("Could not open repository: {error}");
                        if let Some(window) = windows::active_window(&app) {
                            let _ = window.emit("repository-open", path);
                            let _ = windows::focus(&window);
                        }
                    }
                });
                return;
            }
            if let Some(window) = windows::active_window(app) {
                let _ = windows::focus(&window);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchPath(Mutex::new(initial.clone())))
        .manage(RepositoryWindows::default())
        .manage(codex::Jobs::default())
        .setup(move |app| {
            if let Some(path) = &initial {
                // Invalid paths are reported by the window's normal open dialog.
                let _ = windows::initialize(app.handle(), path);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<RepositoryWindows>().closed(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            launch_path,
            open_repository,
            repository_snapshot,
            commit_detail,
            worktree_detail,
            resolve_commit,
            file_diff,
            generate_branch_name,
            cancel_codegen,
            rename_branch,
            prepare_discard,
            discard_changes
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
            cli_path(&["gitler".into(), "worktree".into()], Path::new("/tmp")).unwrap(),
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
