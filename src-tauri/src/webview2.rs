// WebView2 calls Tauri has no API for: suspending the studio's webview while its window is hidden
// or minimized, a low memory target while it is unfocused, reloading after a renderer crash, the
// runtime-updated notice, and the WebView2 task manager. A hidden window keeps rendering (animations and
// transitions run at full rate in a host nobody sees), and `visibilitychange` does not fire on
// minimize, so the shell tells WebView2 itself. Windows only; elsewhere these do nothing.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::WebviewWindow;

/// Counts resume requests when they are made (not when the main thread gets to them), so a suspend
/// asked for before a show never lands after it.
#[cfg_attr(not(windows), allow(dead_code))]
static SHOWS: AtomicU64 = AtomicU64::new(0);

// The state below changes only inside the main-thread closure of `apply` (and the completion handler,
// which runs there too), so suspends and resumes serialize in the order they were asked for.

/// The main webview is suspended (or on its way to it).
#[cfg_attr(not(windows), allow(dead_code))]
static SUSPENDED: AtomicBool = AtomicBool::new(false);

/// Counts resumes, so a suspend that finishes late can tell the window was shown meanwhile.
#[cfg(windows)]
static RESUMES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// The memory target is Low (suspending did not work, or the window is unfocused); resume and
/// focus put it back.
#[cfg(windows)]
static MEMORY_LOWERED: AtomicBool = AtomicBool::new(false);

/// A window nobody can see: minimized or hidden. A visible, unminimized window (the studio, or
/// Kiosk view in the same window) is never suspended.
pub fn wants_suspend(minimized: bool, visible: bool) -> bool {
    minimized || !visible
}

/// Whether the main webview is suspended (or on its way to it).
pub fn is_suspended() -> bool {
    SUSPENDED.load(Ordering::SeqCst)
}

/// Sets `flag` to `to`; true when that changed it.
#[cfg_attr(not(windows), allow(dead_code))]
fn flip(flag: &AtomicBool, to: bool) -> bool {
    flag.swap(to, Ordering::SeqCst) != to
}

/// Suspends the webview of the (just hidden or minimized) window, unless it is visible again by the
/// time the main thread gets to it.
pub fn suspend(window: &WebviewWindow) {
    apply(window, true, SHOWS.load(Ordering::SeqCst));
}

/// Resumes the webview; call before the window is shown. Also cancels a suspend still on its way.
pub fn resume(window: &WebviewWindow) {
    let shows = SHOWS.fetch_add(1, Ordering::SeqCst) + 1;
    apply(window, false, shows);
}

/// A suspend asked for when `asked` resumes had been requested is stale once another came since.
#[cfg_attr(not(windows), allow(dead_code))]
fn stale(asked: u64) -> bool {
    SHOWS.load(Ordering::SeqCst) != asked
}

/// Event sent to the main window when WebView2 has a newer runtime installed; the payload is
/// `{ "version": "<new version or empty>" }`.
pub const RUNTIME_UPDATED_EVENT: &str = "webview-runtime-updated";

#[cfg(not(windows))]
fn apply(_window: &WebviewWindow, _suspend: bool, _shows: u64) {}

#[cfg(not(windows))]
pub fn set_unfocused(_window: &WebviewWindow, _unfocused: bool) {}

#[cfg(not(windows))]
pub fn watch(_window: &WebviewWindow) {}

#[cfg(not(windows))]
pub fn open_task_manager(_window: &WebviewWindow) -> Result<(), String> {
    Err("The WebView2 task manager is only in the Windows app.".into())
}

#[cfg(windows)]
use windows_impl::apply;

#[cfg(windows)]
pub use windows_impl::{open_task_manager, set_unfocused, watch};

#[cfg(windows)]
mod windows_impl {
    use super::{flip, stale, wants_suspend, MEMORY_LOWERED, RESUMES, RUNTIME_UPDATED_EVENT, SUSPENDED};
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::{Emitter, WebviewWindow};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Controller, ICoreWebView2_19, ICoreWebView2_2, ICoreWebView2_3,
        ICoreWebView2_6, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    };
    use webview2_com::{
        take_pwstr, NewBrowserVersionAvailableEventHandler, ProcessFailedEventHandler,
        TrySuspendCompletedHandler,
    };
    use windows_core::Interface;

    fn set_memory_level(
        webview: &ICoreWebView2,
        level: COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL,
    ) -> windows_core::Result<()> {
        unsafe { webview.cast::<ICoreWebView2_19>()?.SetMemoryUsageTargetLevel(level) }
    }

    /// Hides the webview, then suspends it; WebView2 lowers its memory target with it. When it
    /// refuses, the memory target is lowered on its own.
    fn suspend(controller: &ICoreWebView2Controller) -> windows_core::Result<()> {
        unsafe {
            controller.SetIsVisible(false)?;
            let webview = controller.CoreWebView2()?;
            let fallback = webview.clone();
            let resumes = RESUMES.load(Ordering::SeqCst);
            let done = TrySuspendCompletedHandler::create(Box::new(move |result, suspended| {
                log::debug!("webview suspend: {result:?}, suspended={}", suspended);
                // A resume since then cancelled this suspend: the window is shown, leave its memory target be.
                let current = SUSPENDED.load(Ordering::SeqCst) && RESUMES.load(Ordering::SeqCst) == resumes;
                if current && (result.is_err() || !suspended) {
                    match set_memory_level(&fallback, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW) {
                        Ok(()) => MEMORY_LOWERED.store(true, Ordering::SeqCst),
                        Err(e) => log::warn!("could not lower the webview's memory use: {e}"),
                    }
                }
                Ok(())
            }));
            if let Err(e) = webview.cast::<ICoreWebView2_3>()?.TrySuspend(&done) {
                log::debug!("webview suspend not started: {e}");
                set_memory_level(&webview, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW)?;
                MEMORY_LOWERED.store(true, Ordering::SeqCst);
            }
        }
        Ok(())
    }

    /// Shows the webview again whatever the earlier steps did: a hidden controller is a black window.
    fn resume(controller: &ICoreWebView2Controller) -> windows_core::Result<()> {
        RESUMES.fetch_add(1, Ordering::SeqCst);
        unsafe {
            match controller.CoreWebView2() {
                Ok(webview) => {
                    // Not suspended (the fallback ran, or suspending never took): nothing to resume.
                    if let Ok(w) = webview.cast::<ICoreWebView2_3>() {
                        if let Err(e) = w.Resume() {
                            log::debug!("webview resume: {e}");
                        }
                    }
                    if MEMORY_LOWERED.swap(false, Ordering::SeqCst) {
                        if let Err(e) = set_memory_level(&webview, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL) {
                            log::warn!("could not restore the webview's memory use: {e}");
                        }
                    }
                }
                Err(e) => log::warn!("webview resume: {e}"),
            }
            controller.SetIsVisible(true)
        }
    }

    /// Runs on the UI thread, where WebView2 wants its calls, and where the state is read and changed.
    pub fn apply(window: &WebviewWindow, suspending: bool, shows: u64) {
        let label = window.label().to_owned();
        let target = window.clone();
        let sent = window.with_webview(move |webview| {
            // Shown again (or about to be) since the suspend was asked for: leave it running.
            if suspending
                && (stale(shows) || !wants_suspend(target.is_minimized().unwrap_or(false), target.is_visible().unwrap_or(true)))
            {
                return;
            }
            if !flip(&SUSPENDED, suspending) {
                return;
            }
            log::debug!("{} the {label} webview", if suspending { "suspending" } else { "resuming" });
            let controller = webview.controller();
            let result = if suspending { suspend(&controller) } else { resume(&controller) };
            if let Err(e) = result {
                log::warn!("could not {} the {label} webview: {e}", if suspending { "suspend" } else { "resume" });
            }
        });
        if let Err(e) = sent {
            log::warn!("could not reach the webview: {e}");
        }
    }

    /// The runtime-updated handler is registered once per run, whichever window asks first.
    static RUNTIME_WATCHED: AtomicBool = AtomicBool::new(false);

    /// Lowers the memory target while the window is unfocused and restores it on focus. A suspended
    /// webview is left alone: suspending (or its fallback) owns the target then.
    pub fn set_unfocused(window: &WebviewWindow, unfocused: bool) {
        let sent = window.with_webview(move |webview| {
            if SUSPENDED.load(Ordering::SeqCst) {
                return;
            }
            let level = if unfocused {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
            } else if MEMORY_LOWERED.load(Ordering::SeqCst) {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
            } else {
                return;
            };
            let set = unsafe { webview.controller().CoreWebView2() }
                .and_then(|w| set_memory_level(&w, level));
            match set {
                Ok(()) => MEMORY_LOWERED.store(unfocused, Ordering::SeqCst),
                Err(e) => log::warn!("could not change the webview's memory use: {e}"),
            }
        });
        if let Err(e) = sent {
            log::warn!("could not reach the webview: {e}");
        }
    }

    /// The last reload after a failure, so a page that keeps crashing doesn't reload in a loop.
    static LAST_FAILURE_RELOAD: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

    /// Reloads a page whose renderer crashed or hung (at most once a minute); other process failures are only logged.
    fn reload_after_failure(webview: &ICoreWebView2, kind: COREWEBVIEW2_PROCESS_FAILED_KIND) {
        let renderer = kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
            || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE;
        let allowed = renderer && {
            let mut last = crate::state::lock(&LAST_FAILURE_RELOAD);
            let ok = last.is_none_or(|t| t.elapsed() >= std::time::Duration::from_secs(60));
            if ok {
                *last = Some(std::time::Instant::now());
            }
            ok
        };
        if allowed {
            log::warn!("webview renderer failed (kind {}); reloading", kind.0);
            if let Err(e) = unsafe { webview.Reload() } {
                log::warn!("could not reload the webview: {e}");
            }
        } else {
            log::warn!("webview process failed (kind {})", kind.0);
        }
    }

    fn watch_failures(webview: &ICoreWebView2) -> windows_core::Result<()> {
        let handler = ProcessFailedEventHandler::create(Box::new(|sender, args| {
            if let (Some(sender), Some(args)) = (sender, args) {
                let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                unsafe { args.ProcessFailedKind(&mut kind)? };
                reload_after_failure(&sender, kind);
            }
            Ok(())
        }));
        let mut token = 0;
        unsafe { webview.add_ProcessFailed(&handler, &mut token) }
    }

    fn watch_runtime(webview: &ICoreWebView2, window: WebviewWindow) -> windows_core::Result<()> {
        let environment = unsafe { webview.cast::<ICoreWebView2_2>()?.Environment()? };
        let handler = NewBrowserVersionAvailableEventHandler::create(Box::new(move |env, _| {
            let mut raw = windows_core::PWSTR::null();
            let version = match env {
                Some(env) if unsafe { env.BrowserVersionString(&mut raw) }.is_ok() => take_pwstr(raw),
                _ => String::new(),
            };
            log::info!("a newer WebView2 runtime is installed ({version:?})");
            let payload = serde_json::json!({ "version": version });
            let _ = window.emit_to(window.label(), RUNTIME_UPDATED_EVENT, payload);
            Ok(())
        }));
        let mut token = 0;
        unsafe { environment.add_NewBrowserVersionAvailable(&handler, &mut token) }
    }

    /// Registers the renderer-crash reload on this window's webview, and (once per run) the notice
    /// that a newer WebView2 runtime is installed.
    pub fn watch(window: &WebviewWindow) {
        let target = window.clone();
        let sent = window.with_webview(move |webview| {
            let Ok(core) = (unsafe { webview.controller().CoreWebView2() }) else {
                return;
            };
            if let Err(e) = watch_failures(&core) {
                log::warn!("could not watch the webview for crashes: {e}");
            }
            if !RUNTIME_WATCHED.swap(true, Ordering::SeqCst) {
                if let Err(e) = watch_runtime(&core, target) {
                    RUNTIME_WATCHED.store(false, Ordering::SeqCst);
                    log::warn!("could not watch for a WebView2 runtime update: {e}");
                }
            }
        });
        if let Err(e) = sent {
            log::warn!("could not reach the webview: {e}");
        }
    }

    pub fn open_task_manager(window: &WebviewWindow) -> Result<(), String> {
        window
            .with_webview(|webview| {
                let opened = unsafe {
                    webview
                        .controller()
                        .CoreWebView2()
                        .and_then(|w| w.cast::<ICoreWebView2_6>())
                        .and_then(|w| w.OpenTaskManagerWindow())
                };
                if let Err(e) = opened {
                    log::warn!("could not open the WebView2 task manager: {e}");
                }
            })
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_window_nobody_sees_is_suspended() {
        assert!(!wants_suspend(false, true));
        assert!(wants_suspend(true, true));
        assert!(wants_suspend(false, false));
        assert!(wants_suspend(true, false));
    }

    #[test]
    fn a_suspend_asked_before_a_show_is_stale() {
        let asked = SHOWS.load(Ordering::SeqCst);
        assert!(!stale(asked));
        SHOWS.fetch_add(1, Ordering::SeqCst);
        assert!(stale(asked));
    }

    #[test]
    fn a_state_change_is_reported_once() {
        let flag = AtomicBool::new(false);
        assert!(!flip(&flag, false));
        assert!(flip(&flag, true));
        assert!(!flip(&flag, true));
        assert!(flip(&flag, false));
    }
}
