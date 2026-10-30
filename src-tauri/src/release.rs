// The hidden Studio window's page is closed after a while in the tray, to give back the memory its
// WebView2 holds even suspended. The window is destroyed; the tray rebuilds it. The decision is a pure
// function; a thread checks it every few seconds.

use crate::settings::ReleaseHiddenStudio;
use crate::state::{lock, AppState};
use crate::windows::{flush_studio, MAIN};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const CHECK_EVERY: Duration = Duration::from_secs(10);

/// When the window was hidden to the tray; `None` while it is shown, or once it was released.
static HIDDEN_SINCE: Mutex<Option<Instant>> = Mutex::new(None);

/// The next main window replaces a released one.
static REBUILDING: AtomicBool = AtomicBool::new(false);

/// The main window was hidden to the tray.
pub fn hidden() {
    *lock(&HIDDEN_SINCE) = Some(Instant::now());
}

/// The main window is being shown (or created).
pub fn shown() {
    *lock(&HIDDEN_SINCE) = None;
}

/// The next main window replaces one destroyed on purpose (released, or rebuilt after a crash).
pub fn mark_rebuilding(on: bool) {
    REBUILDING.store(on, Ordering::SeqCst);
}

/// Whether the main window being created replaces a released one; clears the mark.
pub fn take_rebuilding() -> bool {
    REBUILDING.swap(false, Ordering::SeqCst)
}

fn after(mode: ReleaseHiddenStudio) -> Option<Duration> {
    match mode {
        ReleaseHiddenStudio::After1m => Some(Duration::from_secs(60)),
        ReleaseHiddenStudio::After10m => Some(Duration::from_secs(10 * 60)),
        ReleaseHiddenStudio::After60m => Some(Duration::from_secs(60 * 60)),
        ReleaseHiddenStudio::Never => None,
    }
}

/// Whether the hidden window's page should be released. `hidden_for`: `None` while it is shown.
pub fn due(mode: ReleaseHiddenStudio, hidden_for: Option<Duration>, quitting: bool) -> bool {
    match (after(mode), hidden_for) {
        (Some(limit), Some(hidden_for)) => !quitting && hidden_for >= limit,
        _ => false,
    }
}

/// Starts the check; call once.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(CHECK_EVERY);
        tick(&app);
    });
}

fn tick(app: &AppHandle) {
    let st = app.state::<AppState>();
    let hidden_for = lock(&HIDDEN_SINCE).map(|s| s.elapsed());
    if !due(
        st.settings().release_hidden_studio,
        hidden_for,
        st.is_quitting(),
    ) {
        return;
    }
    // Taken, so it fires once; a show in the meantime already cleared it.
    let Some(since) = lock(&HIDDEN_SINCE).take() else {
        return;
    };
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    if window.is_visible().unwrap_or(true) {
        return;
    }
    flush_studio(app);
    // Shown while the page saved: leave it be.
    if window.is_visible().unwrap_or(true) || lock(&HIDDEN_SINCE).is_some() {
        return;
    }
    // The window-state plugin keeps the geometry in memory as the window moves and resizes (and
    // writes it at exit), so destroying the window loses none of it.
    mark_rebuilding(true);
    if let Err(e) = window.destroy() {
        mark_rebuilding(false);
        log::warn!("could not release the studio: {e}");
        return;
    }
    crate::webview2::forget();
    log::info!(
        "studio released after {}m hidden",
        since.elapsed().as_secs() / 60
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEC: Duration = Duration::from_secs(1);
    const MIN: Duration = Duration::from_secs(60);

    #[test]
    fn a_window_hidden_long_enough_is_released() {
        assert!(due(ReleaseHiddenStudio::After10m, Some(30 * MIN), false));
    }

    #[test]
    fn a_shown_window_is_never_released() {
        assert!(!due(ReleaseHiddenStudio::After1m, None, false));
    }

    #[test]
    fn never_does_not_release() {
        assert!(!due(ReleaseHiddenStudio::Never, Some(999 * MIN), false));
    }

    #[test]
    fn quitting_does_not_release() {
        assert!(!due(ReleaseHiddenStudio::After1m, Some(5 * MIN), true));
    }

    #[test]
    fn each_mode_waits_for_its_own_duration() {
        let at = |mode, hidden_for| due(mode, Some(hidden_for), false);
        assert!(!at(ReleaseHiddenStudio::After1m, 59 * SEC));
        assert!(at(ReleaseHiddenStudio::After1m, 60 * SEC));
        assert!(!at(ReleaseHiddenStudio::After10m, 10 * MIN - SEC));
        assert!(at(ReleaseHiddenStudio::After10m, 10 * MIN));
        assert!(!at(ReleaseHiddenStudio::After60m, 60 * MIN - SEC));
        assert!(at(ReleaseHiddenStudio::After60m, 60 * MIN));
    }
}
