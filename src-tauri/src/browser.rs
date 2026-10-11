//! Development-only JSON-lines transport. Git operations stay in `git`.
use crate::{codex, git, threads};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};

#[derive(Deserialize)]
struct Request {
    id: u64,
    #[serde(flatten)]
    command: Command,
}

#[derive(Deserialize)]
#[serde(
    tag = "command",
    content = "args",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Command {
    PrepareT3Thread {
        common_dir: String,
        branch: String,
    },
    StartT3Thread {
        common_dir: String,
        branch: String,
        expected_head: String,
        expected_worktree: Option<String>,
    },
    OpenT3Instructions {
        common_dir: String,
    },
    OpenRepository {
        path: String,
    },
    RepositorySnapshot {
        path: String,
        limit: usize,
        include_worktree_status: Option<bool>,
    },
    FetchRemotes {
        common_dir: String,
    },
    OpenRemote {
        common_dir: String,
        name: String,
    },
    CommitDetail {
        common_dir: String,
        oid: String,
        base: Option<String>,
    },
    WorktreeDetail {
        common_dir: String,
        worktree: String,
        base: Option<String>,
    },
    FileDiff {
        request: git::DiffRequest,
    },
    FileMedia {
        request: git::DiffRequest,
    },
    ResolveCommit {
        common_dir: String,
        revision: String,
    },
    GenerateBranchName {
        request_id: String,
        common_dir: String,
        branch: String,
        worktree: Option<String>,
        codex_path: Option<String>,
    },
    CancelCodegen {
        request_id: String,
    },
    RenameBranch {
        common_dir: String,
        branch: String,
        new_name: String,
        expected_head: String,
    },
    PrepareDeleteBranch {
        common_dir: String,
        branch: String,
    },
    DeleteBranch {
        common_dir: String,
        branch: String,
        expected: git::DeleteBranchPlan,
    },
    PrepareDiscard {
        common_dir: String,
        worktree: String,
    },
    DiscardChanges {
        common_dir: String,
        worktree: String,
        expected_head: String,
        files: Vec<git::DiscardSelection>,
    },
}

fn value(result: Result<impl serde::Serialize, String>) -> Result<Value, String> {
    serde_json::to_value(result?).map_err(|error| error.to_string())
}

fn dispatch(command: Command, jobs: &codex::Jobs) -> Result<Value, String> {
    match command {
        Command::PrepareT3Thread { common_dir, branch } => {
            value(threads::prepare(&common_dir, &branch))
        }
        Command::StartT3Thread {
            common_dir,
            branch,
            expected_head,
            expected_worktree,
        } => value(threads::start(
            &common_dir,
            &branch,
            &expected_head,
            expected_worktree.as_deref(),
        )),
        Command::OpenT3Instructions { common_dir } => {
            git::resolve_common(&common_dir)?;
            value(threads::open_instructions())
        }
        Command::OpenRepository { path } => {
            git::resolve_common(&path)?;
            let path = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
            Ok(json!(path.to_string_lossy()))
        }
        Command::RepositorySnapshot {
            path,
            limit,
            include_worktree_status,
        } => value(git::snapshot_with_status(
            &path,
            limit,
            include_worktree_status.unwrap_or(true),
        )),
        Command::FetchRemotes { common_dir } => value(git::fetch_remotes(&common_dir)),
        Command::OpenRemote { common_dir, name } => {
            let url = git::remote_url(&common_dir, &name)?;
            let status = std::process::Command::new("open")
                .arg(url)
                .status()
                .map_err(|error| error.to_string())?;
            if !status.success() {
                return Err("Could not open the default browser".into());
            }
            Ok(Value::Null)
        }
        Command::CommitDetail {
            common_dir,
            oid,
            base,
        } => value(git::commit_detail(&common_dir, &oid, base.as_deref())),
        Command::WorktreeDetail {
            common_dir,
            worktree,
            base,
        } => value(git::worktree_detail(
            &common_dir,
            &worktree,
            base.as_deref(),
        )),
        Command::FileDiff { request } => value(git::file_diff(&request)),
        Command::FileMedia { request } => value(git::file_media(&request)),
        Command::ResolveCommit {
            common_dir,
            revision,
        } => value(git::resolve_commit(&common_dir, &revision)),
        Command::GenerateBranchName {
            request_id,
            common_dir,
            branch,
            worktree,
            codex_path,
        } => {
            let cancelled = jobs.start(&request_id)?;
            let result = codex::generate(
                &common_dir,
                &branch,
                worktree.as_deref(),
                codex_path.as_deref(),
                cancelled,
            );
            jobs.finish(&request_id);
            value(result)
        }
        Command::CancelCodegen { request_id } => {
            jobs.cancel(&request_id);
            Ok(Value::Null)
        }
        Command::RenameBranch {
            common_dir,
            branch,
            new_name,
            expected_head,
        } => value(git::rename_branch(
            &common_dir,
            &branch,
            &new_name,
            &expected_head,
        )),
        Command::PrepareDeleteBranch { common_dir, branch } => {
            value(git::prepare_delete_branch(&common_dir, &branch))
        }
        Command::DeleteBranch {
            common_dir,
            branch,
            expected,
        } => value(git::delete_branch(&common_dir, &branch, &expected)),
        Command::PrepareDiscard {
            common_dir,
            worktree,
        } => value(git::prepare_discard(&common_dir, &worktree)),
        Command::DiscardChanges {
            common_dir,
            worktree,
            expected_head,
            files,
        } => value(git::discard_changes(
            &common_dir,
            &worktree,
            &expected_head,
            &files,
        )),
    }
}

fn respond(output: &Mutex<io::Stdout>, response: Value) -> io::Result<()> {
    let mut output = output
        .lock()
        .map_err(|_| io::Error::other("Output lock unavailable"))?;
    serde_json::to_writer(&mut *output, &response)?;
    writeln!(output)?;
    output.flush()
}

pub fn run() -> io::Result<()> {
    let jobs = Arc::new(codex::Jobs::default());
    let output = Arc::new(Mutex::new(io::stdout()));
    for line in io::stdin().lock().lines() {
        let line = line?;
        let request: Request = match serde_json::from_str(&line) {
            Ok(request) => request,
            Err(error) => {
                let id = serde_json::from_str::<Value>(&line)
                    .ok()
                    .and_then(|value| value.get("id").and_then(Value::as_u64));
                respond(&output, json!({"id": id, "error": error.to_string()}))?;
                continue;
            }
        };
        let jobs = jobs.clone();
        let output = output.clone();
        // Keep cancellation responsive while Codex or a remote fetch is running.
        std::thread::spawn(move || {
            let response = match dispatch(request.command, &jobs) {
                Ok(result) => json!({"id": request.id, "result": result}),
                Err(error) => json!({"id": request.id, "error": error}),
            };
            let _ = respond(&output, response);
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_commands_and_malformed_mutations() {
        for request in [
            json!({"id": 1, "command": "checkout", "args": {}}),
            json!({"id": 2, "command": "discard_changes", "args": {"commonDir": "/tmp"}}),
        ] {
            assert!(serde_json::from_value::<Request>(request).is_err());
        }
    }

    #[test]
    fn decodes_camel_case_fields_and_diff_request() {
        let request: Request = serde_json::from_value(json!({
            "id": 1, "command": "resolve_commit", "args": {"commonDir": "/tmp", "revision": "HEAD"}
        }))
        .unwrap();
        assert!(
            matches!(request.command, Command::ResolveCommit { common_dir, .. } if common_dir == "/tmp")
        );
        // The frontend wraps diff arguments in `request` for Tauri compatibility.
        assert!(serde_json::from_value::<Request>(json!({
            "id": 2, "command": "file_diff", "args": {"request": {
                "commonDir": "/tmp", "path": "a", "oid": "HEAD", "base": null,
                "worktree": null, "mode": "combined", "reverse": false
            }}
        }))
        .is_ok());
    }
}
