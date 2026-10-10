use std::io;
use std::process::{Command, Stdio};

const BACKGROUND_PROCESS: &str = "GITLER_BACKGROUND_PROCESS";

/// Return true in the short-lived launcher, false in the GUI process.
pub fn detach(enabled: bool) -> io::Result<bool> {
    if std::env::var_os(BACKGROUND_PROCESS).is_some() {
        // Called before Tauri starts any threads. Do not pass this marker to Git.
        std::env::remove_var(BACKGROUND_PROCESS);
        return Ok(false);
    }
    if !enabled {
        return Ok(false);
    }

    let mut command = Command::new(std::env::current_exe()?);
    command
        .args(std::env::args_os().skip(1))
        .env(BACKGROUND_PROCESS, "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: setsid is async-signal-safe; the hook does not allocate or lock.
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    command.spawn()?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::time::{Duration, Instant};
    use wait_timeout::ChildExt;

    fn wait_for(path: &Path) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !path.exists() {
            assert!(Instant::now() < deadline, "Timed out waiting for {path:?}");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn launcher_exits_while_gui_keeps_running() {
        let directory = tempfile::tempdir().unwrap();
        let args = [
            "--ignored",
            "--exact",
            "launcher::tests::background_fixture",
        ];
        let mut launcher = Command::new(std::env::current_exe().unwrap())
            .args(args)
            .current_dir(directory.path())
            .env("GITLER_LAUNCH_TEST", directory.path())
            .env_remove(BACKGROUND_PROCESS)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let status = launcher.wait_timeout(Duration::from_secs(3)).unwrap();
        if status.is_none() {
            launcher.kill().unwrap();
            std::fs::write(directory.path().join("stop"), "").unwrap();
            launcher.wait().unwrap();
            panic!("Launcher waited for the GUI process");
        }
        assert!(status.unwrap().success());
        wait_for(&directory.path().join("ready"));
        let observed: serde_json::Value =
            serde_json::from_slice(&std::fs::read(directory.path().join("ready")).unwrap())
                .unwrap();
        // Bound pipe reads separately from process exit to detect inherited pipes.
        let (send, receive) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = send.send(launcher.wait_with_output());
        });
        let output = receive.recv_timeout(Duration::from_secs(3));
        // Stop the child before assertions so failures also clean it up.
        std::fs::write(directory.path().join("stop"), "").unwrap();
        wait_for(&directory.path().join("done"));
        assert!(output
            .expect("GUI inherited the launcher's output pipes")
            .unwrap()
            .status
            .success());
        assert_eq!(observed["args"], serde_json::json!(args));
        assert_eq!(
            std::fs::canonicalize(observed["cwd"].as_str().unwrap()).unwrap(),
            std::fs::canonicalize(directory.path()).unwrap()
        );
        assert_eq!(observed["marker_removed"], true);
        #[cfg(unix)]
        assert_eq!(observed["session"], observed["pid"]);
    }

    #[test]
    #[ignore = "subprocess fixture for launcher_exits_while_gui_keeps_running"]
    fn background_fixture() {
        let Some(directory) = std::env::var_os("GITLER_LAUNCH_TEST") else {
            return;
        };
        if detach(true).unwrap() {
            return;
        }
        let directory = Path::new(&directory);
        let mut observed = serde_json::json!({
            "args": std::env::args().skip(1).collect::<Vec<_>>(),
            "cwd": std::env::current_dir().unwrap(),
            "marker_removed": std::env::var_os(BACKGROUND_PROCESS).is_none(),
            "pid": std::process::id(),
        });
        #[cfg(unix)]
        {
            // SAFETY: getsid only reads the session ID of this process.
            observed["session"] = unsafe { libc::getsid(0) }.into();
        }
        let pending = directory.join("pending");
        std::fs::write(&pending, serde_json::to_vec(&observed).unwrap()).unwrap();
        std::fs::rename(pending, directory.join("ready")).unwrap();
        wait_for(&directory.join("stop"));
        std::fs::write(directory.join("done"), "").unwrap();
    }
}
