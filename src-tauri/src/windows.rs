use crate::git;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

const DEMO_PATH: &str = "demo://gitler";

#[derive(Default)]
struct Registry {
    repositories: HashMap<String, String>,
    next_label: u64,
}

#[derive(Default)]
pub struct RepositoryWindows {
    opening: tauri::async_runtime::Mutex<()>,
    registry: Mutex<Registry>,
}

impl RepositoryWindows {
    pub fn path(&self, label: &str) -> Option<String> {
        self.registry.lock().ok()?.repositories.get(label).cloned()
    }

    pub fn closed(&self, label: &str) {
        if let Ok(mut registry) = self.registry.lock() {
            registry.repositories.remove(label);
        }
    }
}

pub fn focus<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub fn active_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .cloned()
        .or_else(|| windows.get("main").cloned())
        .or_else(|| windows.into_values().next())
}

/// Bind the initial CLI repository before subsequent launches can arrive.
pub fn initialize<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<(), String> {
    let common = git::resolve_common(path)?.to_string_lossy().into_owned();
    route(app, common, Some("main"))?;
    Ok(())
}

/// All GUI and CLI requests share a gate, including native window creation.
pub async fn open<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    source: Option<String>,
) -> Result<Option<String>, String> {
    let state = app.state::<RepositoryWindows>();
    let _opening = state.opening.lock().await;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let common = if path == DEMO_PATH {
            path
        } else {
            git::resolve_common(&path)?.to_string_lossy().into_owned()
        };
        route(&handle, common, source.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn route<R: Runtime>(
    app: &AppHandle<R>,
    common: String,
    source: Option<&str>,
) -> Result<Option<String>, String> {
    let state = app.state::<RepositoryWindows>();
    let windows = app.webview_windows();
    let (label, assigned, create) = {
        let mut registry = state.registry.lock().map_err(|error| error.to_string())?;
        registry
            .repositories
            .retain(|label, _| windows.contains_key(label));
        if let Some((label, _)) = registry
            .repositories
            .iter()
            .find(|(_, repository)| **repository == common)
        {
            (label.clone(), false, false)
        } else {
            let empty = source
                .and_then(|label| windows.get(label))
                .filter(|window| !registry.repositories.contains_key(window.label()))
                .or_else(|| {
                    windows
                        .values()
                        .find(|window| !registry.repositories.contains_key(window.label()))
                });
            let (label, create) = match empty {
                Some(window) => (window.label().to_string(), false),
                None => {
                    registry.next_label += 1;
                    (format!("repository-{}", registry.next_label), true)
                }
            };
            registry.repositories.insert(label.clone(), common.clone());
            (label, true, create)
        }
    };

    let window = if create {
        let mut config = app.config().app.windows[0].clone();
        config.label = label.clone();
        match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build()) {
            Ok(window) => window,
            Err(error) => {
                state.closed(&label);
                return Err(error.to_string());
            }
        }
    } else {
        windows
            .get(&label)
            .cloned()
            .ok_or_else(|| "Repository window was closed. Please try again.".to_string())?
    };

    if assigned {
        let name = if common == DEMO_PATH {
            "Demo repository".to_string()
        } else {
            let directory = std::path::Path::new(&common);
            let root = if directory.file_name().is_some_and(|name| name == ".git") {
                directory.parent().unwrap_or(directory)
            } else {
                directory
            };
            root.file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| common.clone())
        };
        let _ = window.set_title(&format!("{name} — Gitler"));
        if !create && source != Some(label.as_str()) {
            window
                .emit("repository-open", &common)
                .map_err(|error| error.to_string())?;
        }
    }
    // A newly loaded webview must not steal focus from a later open request.
    if assigned || source != Some(label.as_str()) {
        focus(&window)?;
    }
    Ok((source == Some(label.as_str())).then_some(common))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::Path, process::Command};
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tempfile::TempDir;

    fn git(path: &Path, args: &[&str]) {
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
    }

    fn repository() -> TempDir {
        let directory = TempDir::new().unwrap();
        git(directory.path(), &["init", "-b", "main"]);
        git(directory.path(), &["config", "user.name", "Test Author"]);
        git(
            directory.path(),
            &["config", "user.email", "test@example.com"],
        );
        git(
            directory.path(),
            &["commit", "--allow-empty", "-m", "Initial"],
        );
        directory
    }

    fn app() -> tauri::App<MockRuntime> {
        let mut context = mock_context(noop_assets());
        context.config_mut().app.windows.push(Default::default());
        let app = mock_builder()
            .manage(RepositoryWindows::default())
            .build(context)
            .unwrap();
        WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        app
    }

    fn request(app: &tauri::App<MockRuntime>, path: &Path, source: Option<&str>) -> Option<String> {
        tauri::async_runtime::block_on(open(
            app.handle().clone(),
            path.to_string_lossy().into_owned(),
            source.map(str::to_string),
        ))
        .unwrap()
    }

    #[test]
    fn subsequent_launch_does_not_replace_the_initial_cli_repository() {
        let app = app();
        let first = repository();
        let second = repository();
        initialize(app.handle(), first.path().to_str().unwrap()).unwrap();
        request(&app, second.path(), None);
        assert_eq!(app.webview_windows().len(), 2);
        assert_eq!(
            app.state::<RepositoryWindows>().path("main"),
            Some(
                git::resolve_common(first.path().to_str().unwrap())
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            )
        );
    }

    #[test]
    fn different_repositories_keep_separate_windows_and_reuse_existing_ones() {
        let app = app();
        let first = repository();
        let second = repository();
        let common = request(&app, first.path(), Some("main")).unwrap();
        assert_eq!(app.webview_windows().len(), 1);
        assert_eq!(request(&app, second.path(), Some("main")), None);
        assert_eq!(app.webview_windows().len(), 2);
        assert_eq!(
            app.state::<RepositoryWindows>().path("main"),
            Some(common.clone())
        );
        assert_eq!(request(&app, first.path(), Some("repository-1")), None);
        assert_eq!(request(&app, first.path(), Some("main")), Some(common));
        assert_eq!(app.webview_windows().len(), 2);
    }

    #[test]
    fn cli_and_worktree_paths_target_the_same_window() {
        let app = app();
        let repository = repository();
        let holder = TempDir::new().unwrap();
        let worktree = holder.path().join("linked tree");
        git(
            repository.path(),
            &[
                "worktree",
                "add",
                "-b",
                "linked",
                worktree.to_str().unwrap(),
            ],
        );
        fs::create_dir(worktree.join("nested")).unwrap();
        request(&app, repository.path(), None);
        request(&app, &worktree, None);
        request(&app, &worktree.join("nested"), Some("main"));
        request(&app, &repository.path().join(".git"), None);
        assert_eq!(app.webview_windows().len(), 1);
        assert_eq!(
            app.state::<RepositoryWindows>().path("main"),
            Some(
                git::resolve_common(worktree.to_str().unwrap())
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            )
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlink_paths_reuse_the_repository_window() {
        let app = app();
        let repository = repository();
        let holder = TempDir::new().unwrap();
        let alias = holder.path().join("alias");
        std::os::unix::fs::symlink(repository.path(), &alias).unwrap();
        request(&app, repository.path(), None);
        request(&app, &alias, None);
        assert_eq!(app.webview_windows().len(), 1);
    }

    #[test]
    fn concurrent_cli_requests_create_only_one_window_per_repository() {
        let app = app();
        let first = repository();
        let second = repository();
        request(&app, first.path(), Some("main"));
        let requests: Vec<_> = (0..8)
            .map(|_| {
                tauri::async_runtime::spawn(open(
                    app.handle().clone(),
                    second.path().to_string_lossy().into_owned(),
                    None,
                ))
            })
            .collect();
        for request in requests {
            assert_eq!(
                tauri::async_runtime::block_on(request).unwrap().unwrap(),
                None
            );
        }
        assert_eq!(app.webview_windows().len(), 2);
        assert_eq!(
            app.state::<RepositoryWindows>()
                .registry
                .lock()
                .unwrap()
                .repositories
                .len(),
            2
        );
    }

    #[test]
    fn invalid_paths_do_not_claim_or_create_a_window() {
        let app = app();
        let directory = TempDir::new().unwrap();
        let result = tauri::async_runtime::block_on(open(
            app.handle().clone(),
            directory.path().to_string_lossy().into_owned(),
            Some("main".into()),
        ));
        assert!(result.is_err());
        assert_eq!(app.webview_windows().len(), 1);
        assert_eq!(app.state::<RepositoryWindows>().path("main"), None);
        let repository = repository();
        assert!(request(&app, repository.path(), Some("main")).is_some());
    }
}
