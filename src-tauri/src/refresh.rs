// The Studio page reloads itself now and then while its window isn't focused, to give back the memory
// a long WebView2 session holds (Microsoft's advice for long-running pages). The decision is a pure
// function; a thread checks it once a minute.

use crate::settings::StudioRefresh;
use crate::state::{lock, AppState};
use crate::windows::{flush_studio, MAIN};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// How long the window must go unfocused before an idle refresh.
const IDLE_AFTER: Duration = Duration::from_secs(30 * 60);
/// The local time, in minutes after midnight, a daily refresh may start at (04:00).
const DAILY_FROM: u16 = 4 * 60;
const CHECK_EVERY: Duration = Duration::from_secs(60);

/// The local calendar day (`yyyymmdd`) and the minutes since local midnight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Clock {
    pub day: u32,
    pub minute: u16,
}

struct Track {
    /// When the window lost focus; `None` while it has it.
    unfocused_since: Option<Instant>,
    /// This unfocused stretch was already refreshed.
    stretch_done: bool,
    /// The local day of the last daily refresh.
    daily_day: Option<u32>,
}

static TRACK: Mutex<Track> = Mutex::new(Track {
    unfocused_since: None,
    stretch_done: false,
    daily_day: None,
});

/// The main window gained or lost focus.
pub fn focus_changed(focused: bool) {
    let mut t = lock(&TRACK);
    t.stretch_done = false;
    t.unfocused_since = if focused { None } else { Some(Instant::now()) };
}

/// Why a refresh is due, if one is. `awake`: the window is visible, not minimized and not suspended.
/// `unfocused_for`: `None` while it is focused. `stretch_done`: this unfocused stretch was refreshed.
/// `daily_day`: the local day of the last daily refresh.
pub fn due(
    mode: StudioRefresh,
    awake: bool,
    unfocused_for: Option<Duration>,
    stretch_done: bool,
    daily_day: Option<u32>,
    clock: Option<Clock>,
) -> Option<&'static str> {
    let unfocused_for = unfocused_for.filter(|_| awake)?;
    match mode {
        StudioRefresh::Off => None,
        StudioRefresh::Idle => {
            (unfocused_for >= IDLE_AFTER && !stretch_done).then_some("idle for 30 minutes")
        }
        StudioRefresh::Daily => clock
            .is_some_and(|c| c.minute >= DAILY_FROM && daily_day != Some(c.day))
            .then_some("daily at 04:00"),
    }
}

#[cfg(windows)]
fn local_clock() -> Option<Clock> {
    use windows_sys::Win32::Foundation::SYSTEMTIME;
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut t = SYSTEMTIME {
        wYear: 0,
        wMonth: 0,
        wDayOfWeek: 0,
        wDay: 0,
        wHour: 0,
        wMinute: 0,
        wSecond: 0,
        wMilliseconds: 0,
    };
    unsafe { GetLocalTime(&mut t) };
    Some(Clock {
        day: u32::from(t.wYear) * 10_000 + u32::from(t.wMonth) * 100 + u32::from(t.wDay),
        minute: t.wHour * 60 + t.wMinute,
    })
}

#[cfg(not(windows))]
fn local_clock() -> Option<Clock> {
    None
}

/// Starts the once-a-minute check; call once.
pub fn start(app: &AppHandle) {
    // An app started after 04:00 doesn't count that morning as missed.
    lock(&TRACK).daily_day = local_clock().map(|c| c.day);
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(CHECK_EVERY);
        tick(&app);
    });
}

fn tick(app: &AppHandle) {
    let st = app.state::<AppState>();
    if st.is_quitting() {
        return;
    }
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let awake = window.is_visible().unwrap_or(false)
        && !window.is_minimized().unwrap_or(true)
        && !crate::webview2::is_suspended();
    let clock = local_clock();
    let reason = {
        let mut t = lock(&TRACK);
        let reason = due(
            st.settings().studio_refresh,
            awake,
            t.unfocused_since.map(|s| s.elapsed()),
            t.stretch_done,
            t.daily_day,
            clock,
        );
        if reason.is_some() {
            t.stretch_done = true;
            t.daily_day = clock.map(|c| c.day);
        }
        reason
    };
    let Some(reason) = reason else {
        return;
    };
    let on_studio = window
        .url()
        .is_ok_and(|u| u.origin().ascii_serialization() == st.origin());
    if !on_studio {
        return;
    }
    log::info!("studio refresh: {reason}");
    flush_studio(app);
    // Focused while the page saved: leave it be.
    if lock(&TRACK).unfocused_since.is_none() {
        return;
    }
    if let Err(e) = window.eval("location.reload()") {
        log::warn!("could not reload the studio: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: Duration = Duration::from_secs(60);
    const NOON: Clock = Clock { day: 20261023, minute: 12 * 60 };

    fn idle(awake: bool, unfocused: Option<Duration>, done: bool) -> Option<&'static str> {
        due(StudioRefresh::Idle, awake, unfocused, done, None, None)
    }

    #[test]
    fn idle_waits_for_thirty_minutes_unfocused() {
        assert_eq!(idle(true, Some(29 * MIN), false), None);
        assert!(idle(true, Some(30 * MIN), false).is_some());
    }

    #[test]
    fn idle_refreshes_once_per_unfocused_stretch() {
        assert_eq!(idle(true, Some(90 * MIN), true), None);
    }

    #[test]
    fn a_focused_or_sleeping_window_is_never_refreshed() {
        assert_eq!(idle(true, None, false), None);
        assert_eq!(idle(false, Some(90 * MIN), false), None);
        let night = Clock { day: 20261023, minute: 5 * 60 };
        assert_eq!(due(StudioRefresh::Daily, true, None, false, None, Some(night)), None);
        assert_eq!(due(StudioRefresh::Daily, false, Some(MIN), false, None, Some(night)), None);
    }

    #[test]
    fn daily_runs_from_four_once_per_day() {
        let due_at = |minute, day_done| {
            let clock = Clock { day: 20261023, minute };
            due(StudioRefresh::Daily, true, Some(MIN), false, day_done, Some(clock))
        };
        assert_eq!(due_at(3 * 60 + 59, None), None);
        assert!(due_at(4 * 60, None).is_some());
        assert!(due_at(4 * 60, Some(20261022)).is_some());
        assert_eq!(due_at(NOON.minute, Some(20261023)), None);
    }

    #[test]
    fn daily_without_a_clock_never_runs() {
        assert_eq!(due(StudioRefresh::Daily, true, Some(MIN), false, None, None), None);
    }

    #[test]
    fn off_never_refreshes() {
        assert_eq!(due(StudioRefresh::Off, true, Some(999 * MIN), false, None, Some(NOON)), None);
    }

    #[test]
    fn each_mode_ignores_the_other_modes_trigger() {
        assert_eq!(due(StudioRefresh::Daily, true, Some(90 * MIN), true, Some(20261023), Some(NOON)), None);
        assert!(due(StudioRefresh::Idle, true, Some(30 * MIN), false, Some(20261023), Some(NOON)).is_some());
    }
}
