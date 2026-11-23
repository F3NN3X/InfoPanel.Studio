// The program in front (pinned layer P4, decision 7): on Windows the foreground window's process, as a file name only,
// read once a second while a profile has auto-switch rules, and sent to the control store on a change
// (control_auto.rs). This process's own windows (the desktop app's kiosk and studio) never count, so touching the panel
// does not switch it. Elsewhere nothing is read.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio::time::{interval, MissedTickBehavior};

use crate::control_store::Control;
use crate::supervisor;

const POLL: Duration = Duration::from_secs(1);

/// The file name of a process image path (`C:\…\Code.exe` → `Code.exe`), or `None` for an empty one.
pub fn exe_name(path: &str) -> Option<String> {
    let name = path.trim().rsplit(['\\', '/']).next()?.trim();
    (!name.is_empty()).then(|| name.to_string())
}

/// The program whose window is in front, or `None` (no window, this process's own, or one it may not query).
#[cfg(windows)]
pub fn foreground_exe() -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    // SAFETY: plain Win32 calls; the buffer outlives the call that fills it, and the handle is this function's to close.
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(window, &mut pid);
        if pid == 0 || pid == std::process::id() {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(handle);
        if !ok {
            return None;
        }
        exe_name(&String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(not(windows))]
pub fn foreground_exe() -> Option<String> {
    None
}

/// Reads the program in front once a second while the config has rules, and tells the control store when it changes.
pub fn start(control: Arc<Control>, shutdown: watch::Receiver<bool>) -> JoinHandle<()> {
    supervisor::spawn("foreground", shutdown, move || {
        let control = Arc::clone(&control);
        async move {
            let mut ticks = interval(POLL);
            ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
            let mut last: Option<String> = None;
            loop {
                ticks.tick().await;
                if !control.wants_front() {
                    last = None;
                    continue;
                }
                let Some(exe) = foreground_exe() else { continue };
                if last.as_deref() != Some(exe.as_str()) {
                    let _ = control.dispatch(&json!({ "type": "front", "exe": exe }));
                    last = Some(exe);
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_process_path_gives_its_file_name() {
        assert_eq!(exe_name("C:\\Program Files\\Microsoft VS Code\\Code.exe").as_deref(), Some("Code.exe"));
        assert_eq!(exe_name("/usr/bin/zed").as_deref(), Some("zed"));
        assert_eq!(exe_name("obs64.exe").as_deref(), Some("obs64.exe"));
        assert_eq!(exe_name("C:\\dir\\"), None);
        assert_eq!(exe_name(""), None);
    }

    #[test]
    fn the_program_in_front_is_a_file_name_and_never_this_process() {
        // A test runner may have any window in front, or none (a service session): only the shape is checked.
        if let Some(exe) = foreground_exe() {
            assert!(!exe.is_empty() && !exe.contains(['\\', '/']), "{exe}");
            let own = std::env::current_exe().ok().and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()));
            assert_ne!(Some(exe), own);
        }
    }
}
