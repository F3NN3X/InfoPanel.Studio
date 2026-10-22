// WebView2 calls Tauri has no API for: suspending the studio's webview while its window is hidden
// or minimized, and the WebView2 task manager. A hidden window keeps rendering (animations and
// transitions run at full rate in a host nobody sees), and `visibilitychange` does not fire on
// minimize, so the shell tells WebView2 itself. Windows only; elsewhere these do nothing.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::WebviewWindow;

// The state below changes only inside the main-thread closure of `apply` (and the completion handler,
// which runs there too), so suspends and resumes serialize in the order they were asked for.

/// The main webview is suspended (or on its way to it).
#[cfg_attr(not(windows), allow(dead_code))]
static SUSPENDED: AtomicBool = AtomicBool::new(false);

/// Counts resumes, so a suspend that finishes late can tell the window was shown meanwhile.
#[cfg(windows)]
static RESUMES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Suspending did not work, so the memory target was lowered instead; resume puts it back.
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
    apply(window, true);
}

/// Resumes the webview; call before the window is shown.
pub fn resume(window: &WebviewWindow) {
    apply(window, false);
}

#[cfg(not(windows))]
fn apply(_window: &WebviewWindow, _suspend: bool) {}

#[cfg(not(windows))]
pub fn open_task_manager(_window: &WebviewWindow) -> Result<(), String> {
    Err("The WebView2 task manager is only in the Windows app.".into())
}

#[cfg(windows)]
use windows_impl::apply;

#[cfg(windows)]
pub use windows_impl::open_task_manager;

#[cfg(windows)]
mod windows_impl {
    use super::{flip, wants_suspend, MEMORY_LOWERED, RESUMES, SUSPENDED};
    use std::sync::atomic::Ordering;
    use tauri::WebviewWindow;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Controller, ICoreWebView2_19, ICoreWebView2_3, ICoreWebView2_6,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use webview2_com::TrySuspendCompletedHandler;
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
    pub fn apply(window: &WebviewWindow, suspending: bool) {
        let label = window.label().to_owned();
        let target = window.clone();
        let sent = window.with_webview(move |webview| {
            // Shown again since the suspend was asked for: leave it running.
            if suspending && !wants_suspend(target.is_minimized().unwrap_or(false), target.is_visible().unwrap_or(true)) {
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
    fn a_state_change_is_reported_once() {
        let flag = AtomicBool::new(false);
        assert!(!flip(&flag, false));
        assert!(flip(&flag, true));
        assert!(!flip(&flag, true));
        assert!(flip(&flag, false));
    }
}
