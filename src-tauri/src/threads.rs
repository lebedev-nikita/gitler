use crate::git;
use reqwest::{blocking::Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Read;
use std::net::{IpAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tungstenite::Message;
use wait_timeout::ChildExt;

const INSTRUCTIONS: &str = "https://github.com/pingdotgg/t3code#installation";
const LIMIT: u64 = 8 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preparation {
    available: bool,
    head: Option<String>,
    worktree: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Launch {
    reference: String,
    worktree: String,
    open_error: Option<String>,
}

#[derive(Deserialize)]
struct Runtime {
    origin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Descriptor {
    server_version: String,
    environment_id: String,
    orchestration_protocol_version: Option<u32>,
}

struct NativeCli {
    binary: PathBuf,
    script: Option<PathBuf>,
}

impl NativeCli {
    fn command(&self) -> Command {
        let mut command = Command::new(&self.binary);
        if let Some(script) = &self.script {
            command.env("ELECTRON_RUN_AS_NODE", "1").arg(script);
        }
        command
    }
}

fn native_cli(home: &Path, version: &str) -> Result<NativeCli, String> {
    if version.is_empty()
        || !version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._+-".contains(&b))
    {
        return Err("T3 Code returned an invalid version.".into());
    }
    let mut candidates = vec![NativeCli {
        binary: home.join("runtime/versions").join(version).join("t3"),
        script: None,
    }];
    let mut apps = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        apps.push(PathBuf::from(home).join("Applications"));
    }
    for apps in apps {
        for name in ["T3 Code (Alpha)", "T3 Code", "T3 Code (Nightly)"] {
            let contents = apps.join(format!("{name}.app/Contents"));
            candidates.push(NativeCli {
                binary: contents.join("MacOS").join(name),
                script: Some(contents.join("Resources/app.asar/apps/server/dist/bin.mjs")),
            });
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&paths).map(|path| NativeCli {
            binary: path.join("t3"),
            script: None,
        }));
    }
    for candidate in candidates {
        if !candidate.binary.is_file() {
            continue;
        }
        let mut command = candidate.command();
        command.arg("--version");
        if let Ok(output) = run(command) {
            if String::from_utf8_lossy(&output)
                .trim()
                .trim_start_matches("t3 ")
                .trim_start_matches('v')
                == version
            {
                return Ok(candidate);
            }
        }
    }
    Err("Could not find the component bundled with the running T3 Code version. Open the matching T3 Code app and try again.".into())
}

fn origin(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid local T3 Code address")?;
    let local = url
        .host_str()
        .and_then(|h| h.trim_matches(['[', ']']).parse::<IpAddr>().ok())
        .is_some_and(|ip| ip.is_loopback());
    if url.scheme() != "http"
        || !local
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("T3 Code must expose a local HTTP server on a loopback address.".into());
    }
    Ok(url)
}

fn response(response: reqwest::blocking::Response) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(format!(
            "T3 Code returned HTTP {}. Check the app and try again.",
            response.status().as_u16()
        ));
    }
    let mut bytes = Vec::new();
    response
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read the T3 Code response")?;
    if bytes.len() as u64 > LIMIT {
        return Err("T3 Code response exceeds 8 MiB.".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "T3 Code returned an invalid response.".into())
}

fn discover() -> Result<(PathBuf, Url, Descriptor, Client), String> {
    let home = std::env::var_os("T3CODE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".t3")))
        .ok_or("Could not locate T3 Code’s data folder")?;
    let runtime: Runtime = serde_json::from_slice(
        &std::fs::read(home.join("userdata/server-runtime.json"))
            .map_err(|_| "Open T3 Code before starting a thread.")?,
    )
    .map_err(|_| "T3 Code’s runtime information is invalid. Restart T3 Code.")?;
    let origin = origin(&runtime.origin)?;
    let client = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Could not initialize the T3 Code connection")?;
    let descriptor = response(
        client
            .get(
                origin
                    .join(".well-known/t3/environment")
                    .map_err(|_| "Invalid T3 Code address")?,
            )
            .send()
            .map_err(|_| "T3 Code is not reachable. Open or restart the app.")?,
    )?;
    let descriptor: Descriptor = serde_json::from_value(descriptor)
        .map_err(|_| "T3 Code returned invalid server information")?;
    if descriptor.orchestration_protocol_version != Some(1) {
        return Err("This Gitler integration supports T3 Code orchestration protocol 1 (including v0.0.45). This T3 Code version uses a different protocol.".into());
    }
    Ok((home, origin, descriptor, client))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Credential {
    session_id: String,
    token: String,
}

struct Session {
    home: PathBuf,
    origin: Url,
    descriptor: Descriptor,
    client: Client,
    cli: NativeCli,
    credential: Credential,
}

impl Drop for Session {
    fn drop(&mut self) {
        let mut command = self.cli.command();
        command
            .args([
                "auth",
                "session",
                "revoke",
                &self.credential.session_id,
                "--base-dir",
            ])
            .arg(&self.home);
        if run(command).is_err() {
            eprintln!(
                "Could not revoke the temporary Gitler session; it expires within ten minutes."
            );
        }
    }
}

impl Session {
    fn connect() -> Result<Self, String> {
        let (home, origin, descriptor, client) = discover()?;
        let cli = native_cli(&home, &descriptor.server_version)?;
        let mut command = cli.command();
        command
            .args([
                "auth",
                "session",
                "issue",
                "--json",
                "--ttl",
                "10m",
                "--label",
                "Gitler",
                "--subject",
                "gitler",
                "--base-dir",
            ])
            .arg(&home);
        let credential: Credential = serde_json::from_slice(&run(command)?)
            .map_err(|_| "T3 Code did not issue a valid temporary session")?;
        if credential.session_id.is_empty() || credential.token.is_empty() {
            return Err("T3 Code issued an empty temporary session.".into());
        }
        Ok(Self {
            home,
            origin,
            descriptor,
            client,
            cli,
            credential,
        })
    }

    fn request(&self, path: &str, body: Option<&Value>) -> Result<Value, String> {
        let url = self
            .origin
            .join(path)
            .map_err(|_| "Invalid T3 Code request")?;
        let request = if let Some(body) = body {
            self.client.post(url).json(body)
        } else {
            self.client.get(url)
        };
        response(
            request
                .bearer_auth(&self.credential.token)
                .send()
                .map_err(|_| "The T3 Code request failed. Check the app before trying again.")?,
        )
    }

    fn settings(&self) -> Result<Value, String> {
        let ticket = self.request("api/auth/websocket-ticket", Some(&json!({})))?;
        let ticket = ticket
            .get("ticket")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
            .ok_or("T3 Code did not issue a WebSocket ticket")?;
        let mut url = self
            .origin
            .join("ws")
            .map_err(|_| "Invalid T3 Code socket address")?;
        url.set_scheme("ws")
            .map_err(|_| "Invalid T3 Code socket scheme")?;
        url.query_pairs_mut().append_pair("wsTicket", ticket);
        let address = self
            .origin
            .socket_addrs(|| Some(80))
            .map_err(|_| "Invalid T3 Code address")?
            .into_iter()
            .next()
            .ok_or("Invalid T3 Code address")?;
        let stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
            .map_err(|_| "Could not connect to T3 Code")?;
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .map_err(|_| "Could not set T3 Code timeout")?;
        stream
            .set_write_timeout(Some(Duration::from_secs(5)))
            .map_err(|_| "Could not set T3 Code timeout")?;
        let config = tungstenite::protocol::WebSocketConfig::default()
            .max_message_size(Some(LIMIT as usize))
            .max_frame_size(Some(LIMIT as usize));
        let (mut socket, _) =
            tungstenite::client::client_with_config(url.as_str(), stream, Some(config))
                .map_err(|_| "T3 Code rejected the authenticated connection")?;
        let id = uuid::Uuid::new_v4().to_string();
        socket.send(Message::Text(json!({ "_tag": "Request", "id": id, "tag": "server.getSettings", "payload": {}, "headers": [] }).to_string().into())).map_err(|_| "Could not request T3 Code settings")?;
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            let message = socket
                .read()
                .map_err(|_| "T3 Code did not return its settings")?;
            let Message::Text(text) = message else {
                continue;
            };
            let payload: Value =
                serde_json::from_str(&text).map_err(|_| "T3 Code returned an invalid RPC frame")?;
            let frames = payload.as_array().cloned().unwrap_or_else(|| vec![payload]);
            for frame in frames {
                if frame["_tag"] == "Ping" {
                    socket
                        .send(Message::Text(json!({"_tag":"Pong"}).to_string().into()))
                        .map_err(|_| "T3 Code connection ended")?;
                }
                if frame["_tag"] == "Exit" && frame["requestId"] == id {
                    let _ = socket.close(None);
                    if frame["exit"]["_tag"] != "Success" {
                        return Err("T3 Code denied access to its settings.".into());
                    }
                    return Ok(frame["exit"]["value"].clone());
                }
            }
        }
        Err("T3 Code settings request timed out.".into())
    }

    fn project(&self, common_dir: &str, root: &Path) -> Result<Value, String> {
        let snapshot = self.request("api/orchestration/shell", None)?;
        let projects = snapshot["projects"]
            .as_array()
            .ok_or("T3 Code returned an invalid project list")?;
        let common = git::resolve_common(common_dir)?;
        let matching: Vec<_> = projects
            .iter()
            .filter(|p| p["deletedAt"].is_null())
            .filter(|p| {
                p["workspaceRoot"].as_str().is_some_and(|path| {
                    git::resolve_common(path).is_ok_and(|found| found == common)
                })
            })
            .collect();
        if let Some(project) = matching.iter().find(|p| {
            p["workspaceRoot"]
                .as_str()
                .is_some_and(|path| std::fs::canonicalize(path).is_ok_and(|path| path == root))
        }) {
            return Ok((*project).clone());
        }
        if matching.len() == 1 {
            return Ok(matching[0].clone());
        }
        if matching.is_empty() {
            return Err("Add this repository as a project in T3 Code, then try again.".into());
        }
        Err("Several T3 Code projects use this repository. Add its main worktree as a project in T3 Code.".into())
    }
}

fn selections(project: &Value, settings: &Value) -> Result<(Value, String), String> {
    let id = project["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or("T3 Code project has no ID")?;
    let overrides = &settings["projectSettingsOverrides"][id];
    let mode = overrides
        .get("defaultRuntimeMode")
        .unwrap_or(&settings["defaultRuntimeMode"])
        .as_str()
        .filter(|mode| {
            [
                "approval-required",
                "auto-accept-edits",
                "auto",
                "full-access",
            ]
            .contains(mode)
        })
        .ok_or("Set a default permission mode in T3 Code")?
        .to_string();
    let project_model = overrides.get("defaultModelSelection").or_else(|| {
        (settings["projectSettingsFolded"] != true && !project["defaultModelSelection"].is_null())
            .then_some(&project["defaultModelSelection"])
    });
    let enabled = |model: &Value| -> bool {
        let Some(id) = model["instanceId"].as_str() else {
            return false;
        };
        let provider = &settings["providerInstances"][id];
        if provider.is_null() {
            return settings["providers"][id]["enabled"] == true;
        }
        if provider["enabled"] == false || provider["config"]["enabled"] == false {
            return false;
        }
        provider["enabled"]
            .as_bool()
            .or_else(|| provider["config"]["enabled"].as_bool())
            .unwrap_or(
                !["cursor", "grok", "opencode", "antigravity"]
                    .contains(&provider["driver"].as_str().unwrap_or("")),
            )
    };
    if project_model.is_some_and(Value::is_null) {
        return Err("Choose a default model for this project in T3 Code.".into());
    }
    let model = project_model
        .filter(|model| enabled(model))
        .unwrap_or(&settings["defaultModelSelection"]);
    if !enabled(model)
        || model["model"]
            .as_str()
            .is_none_or(|model| model.trim().is_empty())
    {
        return Err("Choose an enabled default model in T3 Code.".into());
    }
    Ok((model.clone(), mode))
}

pub fn prepare(common_dir: &str, branch: &str) -> Result<Preparation, String> {
    let target = git::thread_target(common_dir, branch)?;
    let session = match Session::connect() {
        Ok(session) => session,
        Err(message) => {
            return Ok(Preparation {
                available: false,
                head: None,
                worktree: None,
                message: Some(message),
            })
        }
    };
    let project = session.project(common_dir, &target.project_path)?;
    selections(&project, &session.settings()?)?;
    Ok(Preparation {
        available: true,
        head: Some(target.head),
        worktree: target
            .worktree
            .map(|path| path.to_string_lossy().into_owned()),
        message: None,
    })
}

pub fn start(
    common_dir: &str,
    branch: &str,
    expected_head: &str,
    expected_worktree: Option<&str>,
) -> Result<Launch, String> {
    let session = Session::connect()?;
    let target = git::thread_target(common_dir, branch)?;
    let project = session.project(common_dir, &target.project_path)?;
    let (model, mode) = selections(&project, &session.settings()?)?;
    let worktree = git::thread_worktree(
        common_dir,
        branch,
        expected_head,
        expected_worktree,
        &session.home.join("worktrees/gitler"),
    )?;
    let thread_id = uuid::Uuid::new_v4().to_string();
    let reference = format!("{}:{thread_id}", session.descriptor.environment_id);
    let command = json!({
        "type": "thread.create", "commandId": uuid::Uuid::new_v4().to_string(),
        "threadId": thread_id, "projectId": project["id"], "title": branch,
        "modelSelection": model, "runtimeMode": mode, "interactionMode": "default",
        "branch": branch, "worktreePath": worktree, "createdAt": chrono::Utc::now().to_rfc3339(),
    });
    let receipt = session
        .request("api/orchestration/dispatch", Some(&command))
        .map_err(|error| {
            format!(
                "{error} Worktree: {}. Thread ID: {thread_id}. Check T3 Code before trying again.",
                worktree.display()
            )
        })?;
    if !receipt["sequence"].is_number() {
        return Err(format!("T3 Code did not confirm creation. Thread ID: {thread_id}. Worktree: {}. Check T3 Code before trying again.", worktree.display()));
    }
    let open_error = Command::new("open")
        .arg("t3code://app/")
        .status()
        .ok()
        .filter(|s| s.success())
        .is_none()
        .then(|| "Thread created. Open T3 Code to continue.".to_string());
    Ok(Launch {
        reference,
        worktree: worktree.to_string_lossy().into_owned(),
        open_error,
    })
}

fn drain(mut stream: impl Read) -> Vec<u8> {
    let mut result = Vec::new();
    let mut buffer = [0; 8192];
    while let Ok(count) = stream.read(&mut buffer) {
        if count == 0 {
            break;
        }
        let keep = count.min((64 * 1024usize).saturating_sub(result.len()));
        result.extend_from_slice(&buffer[..keep]);
    }
    result
}

fn run(mut command: Command) -> Result<Vec<u8>, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not run the component bundled with T3 Code")?;
    let stdout = child.stdout.take().ok_or("T3 Code output unavailable")?;
    let stderr = child.stderr.take().ok_or("T3 Code errors unavailable")?;
    let output = std::thread::spawn(move || drain(stdout));
    let errors = std::thread::spawn(move || drain(stderr));
    let status = child.wait_timeout(Duration::from_secs(10));
    if !matches!(status, Ok(Some(_))) {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
        let _ = child.kill();
        let _ = child.wait();
    }
    let output = output.join().map_err(|_| "Could not read T3 Code output")?;
    let _ = errors.join();
    let status = status
        .map_err(|_| "T3 Code authentication failed")?
        .ok_or("T3 Code authentication timed out")?;
    if !status.success() {
        return Err(
            "T3 Code authentication failed. Open the matching T3 Code app and try again.".into(),
        );
    }
    Ok(output)
}

pub fn open_instructions() -> Result<(), String> {
    let status = Command::new("open")
        .arg(INSTRUCTIONS)
        .status()
        .map_err(|_| "Could not open GitHub")?;
    if !status.success() {
        return Err("Could not open the default browser.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_accepts_loopback_origins_without_redirect_or_credentials() {
        assert!(origin("http://127.0.0.1:3773").is_ok());
        assert!(origin("http://[::1]:3773").is_ok());
        for value in [
            "https://127.0.0.1:3773",
            "http://example.com",
            "http://127.0.0.1.evil.test",
            "http://user:secret@127.0.0.1",
            "http://127.0.0.1/path",
            "http://127.0.0.1/?token=secret",
        ] {
            assert!(origin(value).is_err(), "{value}");
        }
    }

    #[test]
    fn inherits_project_model_options_and_permissions_and_honors_resets() {
        let project = json!({"id":"project", "defaultModelSelection":{"instanceId":"codex", "model":"legacy"}});
        let mut settings = json!({
            "defaultModelSelection":{"instanceId":"codex", "model":"global"},
            "defaultRuntimeMode":"approval-required", "projectSettingsFolded":true,
            "providerInstances":{"codex":{"driver":"codex"}, "disabled":{"driver":"codex", "enabled":false}},
            "projectSettingsOverrides":{"project":{"defaultModelSelection":{"instanceId":"codex", "model":"project", "options":[{"id":"effort", "value":"high"}]}, "defaultRuntimeMode":"auto"}}
        });
        let (model, mode) = selections(&project, &settings).unwrap();
        assert_eq!(model["model"], "project");
        assert_eq!(model["options"][0]["value"], "high");
        assert_eq!(mode, "auto");
        settings["projectSettingsOverrides"]["project"]["defaultModelSelection"] =
            json!({"instanceId":"disabled", "model":"other"});
        assert_eq!(
            selections(&project, &settings).unwrap().0["model"],
            "global"
        );
        settings["projectSettingsOverrides"]["project"] = json!({});
        assert_eq!(
            selections(&project, &settings).unwrap(),
            (
                settings["defaultModelSelection"].clone(),
                "approval-required".into()
            )
        );
        settings["projectSettingsOverrides"]["project"]["defaultModelSelection"] = Value::Null;
        assert!(selections(&project, &settings).is_err());
    }

    #[test]
    #[ignore = "requires the locally running T3 Code app; creates only a temporary auth session"]
    fn installed_t3_supports_native_connection_and_settings() {
        let session = Session::connect().unwrap();
        let snapshot = session.request("api/orchestration/shell", None).unwrap();
        assert!(snapshot["projects"].is_array());
        let settings = session.settings().unwrap();
        assert!(settings["defaultRuntimeMode"].is_string());
        let cwd = std::env::current_dir().unwrap();
        let common = git::resolve_common(cwd.to_str().unwrap()).unwrap();
        let target = git::thread_target(common.to_str().unwrap(), "main").unwrap();
        let project = session
            .project(common.to_str().unwrap(), &target.project_path)
            .unwrap();
        let (model, _) = selections(&project, &settings).unwrap();
        assert!(model["instanceId"].is_string());
    }
}
