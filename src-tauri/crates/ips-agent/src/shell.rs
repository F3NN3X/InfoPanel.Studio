// The wrapped statusline command, run the way Node's `spawn(command, { shell: true })` runs it.

use std::io::Write;
use std::process::{Command, Stdio};

#[cfg(windows)]
fn shell(command: &str) -> Command {
    use std::os::windows::process::CommandExt;
    let comspec = std::env::var("COMSPEC")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "cmd.exe".into());
    let mut cmd = Command::new(comspec);
    cmd.raw_arg(format!("/d /s /c \"{command}\""));
    cmd
}

#[cfg(not(windows))]
fn shell(command: &str) -> Command {
    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(command);
    cmd
}

/// Runs `command` with `input` on its stdin and its stdout and stderr passed straight through;
/// waits for it (no timeout) and ignores its exit code and every failure.
pub fn run_wrapped(command: &str, input: &str) {
    let Ok(mut child) = shell(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
    else {
        return;
    };
    let stdin = child.stdin.take();
    let data = input.as_bytes().to_vec();
    // On its own thread: a child that never reads its stdin must not block the wait.
    let writer = std::thread::spawn(move || {
        if let Some(mut stdin) = stdin {
            let _ = stdin.write_all(&data);
        }
    });
    let _ = child.wait();
    let _ = writer.join();
}
