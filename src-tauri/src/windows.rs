// The studio window (start page until the server answers) and the settings and help windows, their
// navigation guard, close-to-tray and quit. The settings window loads from the studio's server while it
// runs (its Dashboard and Studio pages need that origin), else the rescue page among the local pages.

use crate::nav;
use crate::state::{lock, AppState, Phase, FLUSH_TIMEOUT};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

pub const MAIN: &str = "main";
pub const SETTINGS: &str = "settings";
pub const HELP: &str = "help";
/// The settings and help pages' window colour (`--color-s-win`), painted before the page loads.
const PAGE_BACKGROUND: tauri::window::Color = tauri::window::Color(0x0c, 0x0c, 0x0e, 0xff);
pub const FLUSH_EVENT: &str = "studio://flush";
/// Sent to the main window when the shell leaves Kiosk view on its own (a close from it).
pub const KIOSK_LEFT_EVENT: &str = "kiosk-left";
/// Sent to the main window when it gains or loses focus; the studio slows its animation a while after losing it
/// (src/lib/studio-focus.ts), unless `reduce` (the reduceUnfocusedAnimation setting) is off.
pub const STUDIO_FOCUS_EVENT: &str = "studio-focus";

#[derive(Clone, Serialize)]
struct StudioFocus {
    focused: bool,
    reduce: bool,
}

/// WebView2's own default flags (wry's), plus `--remote-debugging-port=<n>` in debug builds only, when
/// `INFOPANEL_STUDIO_CDP_PORT` is set, so a test or debugging session can attach over CDP. A release
/// build never opens the port. Decided once per run: every webview must get the same arguments, since
/// they share one WebView2 environment.
fn browser_args() -> &'static str {
    static ARGS: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    ARGS.get_or_init(|| {
        let port = std::env::var("INFOPANEL_STUDIO_CDP_PORT").ok();
        browser_args_for(cfg!(debug_assertions), port.as_deref())
    })
}

fn browser_args_for(debug_build: bool, port: Option<&str>) -> String {
    let base = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
    match port.and_then(|p| p.parse::<u16>().ok()).filter(|_| debug_build) {
        Some(port) => format!("{base} --remote-debugging-port={port}"),
        None => base.to_string(),
    }
}

/// Every webview shares one WebView2 environment, so they all take the same data folder: a test run's own
/// (paths::webview_data_dir), else WebView2's default.
fn with_webview_data_dir<'a, R: tauri::Runtime, M: Manager<R>>(builder: WebviewWindowBuilder<'a, R, M>) -> WebviewWindowBuilder<'a, R, M> {
    match crate::paths::webview_data_dir() {
        Some(dir) => builder.data_directory(dir),
        None => builder,
    }
}

/// At most one external open per second, so a page can't flood the browser with tabs.
fn external_allowed() -> bool {
    use std::time::{Duration, Instant};
    static LAST: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if last.is_some_and(|t| now.duration_since(t) < Duration::from_secs(1)) {
        return false;
    }
    *last = Some(now);
    true
}

fn open_external(app: &AppHandle, url: &Url) {
    if nav::opens_externally(url) && external_allowed() {
        log::debug!("opening externally: {url}");
        if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
            log::warn!("could not open {url}: {e}");
        }
    }
}

/// The saved app zoom as WebView2's factor.
pub fn zoom_factor(app: &AppHandle) -> f64 {
    f64::from(app.state::<AppState>().settings().zoom) / 100.0
}

/// Applies the app zoom (percent) to every app window. The kiosk runs in a browser, so it never
/// gets it.
pub fn apply_zoom(app: &AppHandle, zoom: u16) {
    for window in app.webview_windows().values() {
        if let Err(e) = window.set_zoom(f64::from(zoom) / 100.0) {
            log::warn!("could not zoom {}: {e}", window.label());
        }
    }
}

/// Zooms each page as it loads, so the zoom holds across navigation (start page to studio)
/// whatever WebView2 keeps on its own.
fn zoom_on_load(window: WebviewWindow, payload: tauri::webview::PageLoadPayload<'_>) {
    if payload.event() == PageLoadEvent::Finished {
        let _ = window.set_zoom(zoom_factor(window.app_handle()));
    }
}

fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let st = app.state::<AppState>();
    let status = st.status();
    let url = match status.state {
        Phase::Running => match Url::parse(&status.studio_url) {
            Ok(u) => WebviewUrl::External(u),
            Err(_) => WebviewUrl::App("start.html".into()),
        },
        _ => WebviewUrl::App("start.html".into()),
    };
    st.studio_page
        .store(matches!(url, WebviewUrl::External(_)), Ordering::SeqCst);
    let origin = st.origin.clone();
    let nav_app = app.clone();
    let popup_app = app.clone();
    let started = std::time::Instant::now();
    let rebuilding = crate::release::take_rebuilding();
    // Built hidden on the pages' dark background and shown once the first page has loaded, like the
    // settings and help windows, so launching the app never flashes a white, empty window.
    let shown = Arc::new(AtomicBool::new(false));
    let builder = WebviewWindowBuilder::new(app, MAIN, url)
        .title("InfoPanel Studio")
        .visible(false)
        .background_color(PAGE_BACKGROUND)
        // The studio's top bar (and the start page's) is the title bar, with its own controls.
        .decorations(false)
        // Tauri's own drag-drop handler takes file drops from the page; the studio's Import door
        // and its drop overlay read them as HTML5 events.
        .disable_drag_drop_handler()
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 600.0)
        .additional_browser_args(browser_args())
        .on_navigation(move |url| {
            let allowed = origin
                .read()
                .map(|o| nav::is_allowed_nav(url, &o))
                .unwrap_or(false);
            if !allowed {
                open_external(&nav_app, url);
            }
            allowed
        })
        .on_new_window(move |url, _| {
            open_external(&popup_app, &url);
            NewWindowResponse::Deny
        })
        .on_page_load(move |window, payload| {
            let finished = payload.event() == PageLoadEvent::Finished;
            zoom_on_load(window.clone(), payload);
            if finished && !shown.swap(true, Ordering::SeqCst) {
                if rebuilding {
                    log::info!("studio rebuilt ({} ms)", started.elapsed().as_millis());
                }
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        });
    let window = with_webview_data_dir(builder).build()?;
    let _ = window.set_zoom(zoom_factor(app));
    crate::webview2::watch(&window);
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(focused) = event {
            crate::refresh::focus_changed(*focused);
            if let Some(w) = handle.get_webview_window(MAIN) {
                crate::webview2::set_unfocused(&w, !*focused);
            }
            let reduce = handle.state::<AppState>().settings().reduce_unfocused_animation;
            let _ = handle.emit_to(MAIN, STUDIO_FOCUS_EVENT, StudioFocus { focused: *focused, reduce });
        }
        // Minimizing and restoring arrive as resizes; a minimized studio suspends like a hidden one.
        if let tauri::WindowEvent::Resized(_) = event {
            if let Some(w) = handle.get_webview_window(MAIN) {
                follow_window(&handle, w);
            }
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let st = handle.state::<AppState>();
            if st.is_quitting() {
                return;
            }
            api.prevent_close();
            let app = handle.clone();
            std::thread::spawn(move || {
                // Closed from Kiosk view: the studio's geometry goes back first, so the window
                // state saved at exit (and the window shown from the tray) is the studio's, and
                // the page is told to follow (a cancelled close warning keeps the window open).
                if let Err(e) = crate::kiosk::leave(&app) {
                    log::warn!("could not leave Kiosk view: {e}");
                }
                let _ = app.emit_to(MAIN, KIOSK_LEFT_EVENT, ());
                close_main(&app);
            });
        }
    });
    Ok(window)
}

/// Follows the studio window's state after a resize, which is also what minimizing and restoring are.
/// A minimized window flushes before it suspends; that waits, so it runs off the event thread.
fn follow_window(app: &AppHandle, window: tauri::WebviewWindow) {
    let minimized = window.is_minimized().unwrap_or(false);
    let visible = window.is_visible().unwrap_or(true);
    if !crate::webview2::wants_suspend(minimized, visible) {
        crate::webview2::resume(&window);
    } else if !crate::webview2::is_suspended() && !MINIMIZE_FLUSH.swap(true, Ordering::SeqCst) {
        // One flush at a time: a minimized window still gets resize events.
        let app = app.clone();
        std::thread::spawn(move || {
            flush_studio(&app);
            crate::webview2::suspend(&window);
            MINIMIZE_FLUSH.store(false, Ordering::SeqCst);
        });
    }
}

/// A minimize's flush-then-suspend is running.
static MINIMIZE_FLUSH: AtomicBool = AtomicBool::new(false);

/// A new studio window is being built.
static CREATING_MAIN: AtomicBool = AtomicBool::new(false);

/// Shows (creating if needed) and focuses the studio window. A new one shows itself once its first
/// page has loaded.
pub fn show_main(app: &AppHandle) {
    crate::release::shown();
    let window = match app.get_webview_window(MAIN) {
        Some(w) => w,
        None => {
            // Built off the caller's thread: the tray and single-instance callbacks run on the main
            // thread, where building a webview waits on the event loop it is blocking. One at a time.
            if !CREATING_MAIN.swap(true, Ordering::SeqCst) {
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = create_main(&app) {
                        log::error!("could not open the studio window: {e}");
                    }
                    CREATING_MAIN.store(false, Ordering::SeqCst);
                });
            }
            return;
        }
    };
    // Resumed before it shows, so the page is live when the window appears.
    crate::webview2::resume(&window);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Replaces the studio window after its WebView2 browser process exited: the old webview draws black
/// and refuses every call, and hiding or resuming it doesn't help. Its page died with it, so there is
/// nothing to flush. Shown again if it was shown; a hidden one waits for the tray, like a released one.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn rebuild_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let shown = window.is_visible().unwrap_or(true);
    crate::release::mark_rebuilding(true);
    if let Err(e) = window.destroy() {
        crate::release::mark_rebuilding(false);
        log::warn!("could not rebuild the studio window: {e}");
        return;
    }
    crate::webview2::forget();
    if !shown {
        return;
    }
    // The destroy lands on the event loop; wait for the old window to be gone before making the new one.
    for _ in 0..40 {
        if app.get_webview_window(MAIN).is_none() {
            return show_main(app);
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    log::warn!("the old studio window was not gone after 2 s; open it from the tray");
}

/// The start page, at the local pages' origin (`http://tauri.localhost` on Windows).
fn start_page_url() -> Url {
    let base = if cfg!(windows) {
        "http://tauri.localhost/start.html"
    } else {
        "tauri://localhost/start.html"
    };
    Url::parse(base).expect("a valid start page URL")
}

/// Points the studio window (if open, and last sent to the studio) at start.html, which follows
/// the server state.
pub fn load_start_page(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    if !app
        .state::<AppState>()
        .studio_page
        .swap(false, Ordering::SeqCst)
    {
        return;
    }
    log::debug!("loading the start page");
    let _ = window.navigate(start_page_url());
}

/// Points the studio window (if open) at the studio.
pub fn load_studio(app: &AppHandle, url: &str) {
    let (Some(window), Ok(url)) = (app.get_webview_window(MAIN), Url::parse(url)) else {
        return;
    };
    log::debug!("loading {url}");
    app.state::<AppState>()
        .studio_page
        .store(true, Ordering::SeqCst);
    let _ = window.navigate(url);
}

/// Event telling an open Settings window to show a page (the payload is a `settings_target`).
pub const SETTINGS_EVENT: &str = "settings-section";
/// Event telling an open Help window to show an article (the payload is a `HelpTarget`).
pub const HELP_EVENT: &str = "help-open";

/// The App sections, all the rescue page has (`SectionId` in src/settings/model/search.ts).
const SETTINGS_SECTIONS: [&str; 8] = [
    "general",
    "server",
    "agents",
    "updates",
    "diagnostics",
    "logs",
    "about",
    "changelog",
];

/// The pages only the Settings window on the studio's server has (`PageId`).
const PREFERENCE_PAGES: [&str; 2] = ["dashboard", "studio"];

/// The section if the rescue page has it: its URL only ever carries known ids.
fn settings_section(section: Option<&str>) -> Option<&str> {
    section.filter(|s| SETTINGS_SECTIONS.contains(s))
}

/// What the Settings window on the studio's server opens at: a page it has, or a page and a group of it
/// (`dashboard/performance`, a slug). Anything else is dropped.
fn settings_target(section: Option<&str>) -> Option<&str> {
    let section = section?;
    let (page, group) = match section.split_once('/') {
        Some((page, group)) => (page, Some(group)),
        None => (section, None),
    };
    let known = SETTINGS_SECTIONS.contains(&page) || PREFERENCE_PAGES.contains(&page);
    (known && group.is_none_or(is_slug)).then_some(section)
}

/// An article id or heading slug: lowercase letters, digits and dashes.
fn is_slug(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Where Help opens: an article, and a heading of it. Either is dropped unless it is a slug, and a
/// heading needs its article.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct HelpTarget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub article: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
}

impl HelpTarget {
    pub fn new(article: Option<&str>, heading: Option<&str>) -> Self {
        let article = article.filter(|a| is_slug(a));
        let heading = article.and(heading).filter(|h| is_slug(h));
        HelpTarget {
            article: article.map(str::to_owned),
            heading: heading.map(str::to_owned),
        }
    }

    /// The deep-link hash (`#kiosk` or `#kiosk/the-kiosk-url`), empty for Help's start.
    pub fn hash(&self) -> String {
        match (&self.article, &self.heading) {
            (Some(a), Some(h)) => format!("#{a}/{h}"),
            (Some(a), None) => format!("#{a}"),
            _ => String::new(),
        }
    }

    /// The page to load, with the deep-link hash.
    fn page(&self) -> String {
        format!("app/help.html{}", self.hash())
    }
}

/// The rescue settings page to load, at a section when it is a known one.
fn settings_page(section: Option<&str>) -> String {
    match settings_section(section) {
        Some(s) => format!("app/settings.html#{s}"),
        None => "app/settings.html".to_owned(),
    }
}

/// The Settings window on the studio's server (`origin`), at a target when it is a valid one.
fn server_settings_url(origin: &str, section: Option<&str>) -> String {
    match settings_target(section) {
        Some(s) => format!("{origin}/?settings#{s}"),
        None => format!("{origin}/?settings"),
    }
}

/// Where the settings window loads: the studio's server while it runs, else the rescue page.
fn settings_url(app: &AppHandle, section: Option<&str>) -> WebviewUrl {
    let status = app.state::<AppState>().status();
    let server = (status.state == Phase::Running)
        .then(|| Url::parse(&server_settings_url(&status.origin, section)).ok())
        .flatten();
    match server {
        Some(url) => WebviewUrl::External(url),
        None => WebviewUrl::App(settings_page(section).into()),
    }
}

/// Focuses the app window with this label, or builds it at `url`. The help window stays on the local
/// pages; the settings window may also load the studio's server (`server`). Returns whether it was
/// already open.
fn show_page(app: &AppHandle, label: &str, title: &str, url: WebviewUrl, server: bool) -> bool {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return true;
    }
    let nav_app = app.clone();
    let popup_app = app.clone();
    let origin = app.state::<AppState>().origin.clone();
    // Built hidden on the pages' own dark background and shown once the first page has loaded, so
    // opening it never flashes a white, empty window.
    let shown = Arc::new(AtomicBool::new(false));
    let builder = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .decorations(false)
        .visible(false)
        .background_color(PAGE_BACKGROUND)
        .inner_size(1000.0, 720.0)
        .min_inner_size(760.0, 520.0)
        .additional_browser_args(browser_args())
        .on_navigation(move |url| {
            let allowed = if server {
                origin.read().map(|o| nav::is_allowed_nav(url, &o)).unwrap_or(false)
            } else {
                nav::is_local_page(url)
            };
            if !allowed {
                open_external(&nav_app, url);
            }
            allowed
        })
        .on_new_window(move |url, _| {
            open_external(&popup_app, &url);
            NewWindowResponse::Deny
        })
        .on_page_load(move |window, payload| {
            let finished = payload.event() == PageLoadEvent::Finished;
            zoom_on_load(window.clone(), payload);
            if finished && !shown.swap(true, Ordering::SeqCst) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        });
    let built = with_webview_data_dir(builder).build();
    match built {
        Ok(w) => {
            let _ = w.set_zoom(zoom_factor(app));
        }
        Err(e) => log::error!("could not open the {label} window: {e}"),
    }
    false
}

/// Shows the settings window (the tray, the studio's rail, Help, the start page), at a page when given
/// one: an open window gets the event, a new one loads at it.
pub fn show_settings(app: &AppHandle, section: Option<&str>) {
    let url = settings_url(app, section);
    if show_page(app, SETTINGS, "InfoPanel Studio settings", url, true) {
        if let Some(s) = settings_target(section) {
            let _ = app.emit_to(SETTINGS, SETTINGS_EVENT, s);
        }
    }
}

/// The server answers at `origin`: an open settings window that shows the rescue page, or the
/// server's old address, moves to it (at the page its URL names). One already there stays as it is.
pub fn settings_follow_server(app: &AppHandle, origin: &str) {
    let Some(window) = app.get_webview_window(SETTINGS) else {
        return;
    };
    let Ok(current) = window.url() else {
        return;
    };
    if current.origin().ascii_serialization() == origin {
        return;
    }
    let target = current.fragment().map(str::to_owned);
    if let Ok(url) = Url::parse(&server_settings_url(origin, target.as_deref())) {
        log::debug!("settings window: loading {url}");
        let _ = window.navigate(url);
    }
}

/// Shows the help window, at an article and heading when given.
pub fn show_help(app: &AppHandle, target: &HelpTarget) {
    if show_page(app, HELP, "InfoPanel Studio help", WebviewUrl::App(target.page().into()), false) {
        let _ = app.emit_to(HELP, HELP_EVENT, target);
    }
}

/// Asks the studio to push pending edits and waits for it (at most 1.5 s). Call off the main
/// thread.
pub fn flush_studio(app: &AppHandle) {
    let st = app.state::<AppState>();
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let on_studio = window
        .url()
        .is_ok_and(|u| u.origin().ascii_serialization() == st.origin());
    if !on_studio {
        return;
    }
    // A suspended page cannot answer: wake it for the flush (which also cancels a suspend still on
    // its way), then put it back if nobody can see it.
    crate::webview2::resume(&window);
    st.flush.arm();
    if window.emit_to(MAIN, FLUSH_EVENT, ()).is_err() {
        st.flush.release();
    } else {
        let answered = st.flush.wait(FLUSH_TIMEOUT);
        log::debug!("flush: answered={answered}");
    }
    let minimized = window.is_minimized().unwrap_or(false);
    let visible = window.is_visible().unwrap_or(true);
    if crate::webview2::wants_suspend(minimized, visible) {
        crate::webview2::suspend(&window);
    }
}

fn close_main(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    if s.close_to_tray {
        flush_studio(app);
        if let Some(w) = app.get_webview_window(MAIN) {
            let _ = w.hide();
            // After the flush, which needs the page awake; nobody sees it until the tray shows it.
            crate::webview2::suspend(&w);
            crate::release::hidden();
        }
        log::debug!("window hidden to the tray");
        return;
    }
    if !s.close_warning_shown {
        let go_on = app
            .dialog()
            .message(
                "Closing InfoPanel Studio stops its dashboard server, so the kiosk page stops \
                 updating until you start the app again.

To keep the server running with the \
                 window closed, turn on \"Close to tray\" in the settings.",
            )
            .title("Quit InfoPanel Studio?")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Quit".into(),
                "Cancel".into(),
            ))
            .blocking_show();
        {
            let mut current = lock(&st.settings);
            current.close_warning_shown = true;
            let _ = crate::settings::save(&st.paths.config_dir, &current);
        }
        if !go_on {
            return;
        }
    }
    quit(app);
}

/// Flushes the studio, stops the server if the app started it, and exits. Call off the main
/// thread.
pub fn quit(app: &AppHandle) {
    let st = app.state::<AppState>();
    if st.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    log::info!("quitting");
    // Quit from Kiosk view (the tray): window-state saves the studio's geometry, not the kiosk's.
    if let Err(e) = crate::kiosk::leave(app) {
        log::warn!("could not leave Kiosk view: {e}");
    }
    flush_studio(app);
    crate::control::stop_owned(app);
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_debugging_port_needs_a_debug_build_and_a_valid_port() {
        let base = browser_args_for(true, None);
        assert!(!base.contains("remote-debugging-port"));
        assert!(base.contains("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"));
        assert_eq!(browser_args_for(true, Some("9222")), format!("{base} --remote-debugging-port=9222"));
        assert_eq!(browser_args_for(true, Some("nope")), base);
        assert_eq!(browser_args_for(true, Some("70000")), base);
        assert_eq!(browser_args_for(false, Some("9222")), base);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn a_debug_build_opens_the_port() {
        assert!(browser_args_for(cfg!(debug_assertions), Some("9222")).contains("--remote-debugging-port=9222"));
    }

    #[cfg(not(debug_assertions))]
    #[test]
    fn a_release_build_never_opens_the_port() {
        assert!(!browser_args_for(cfg!(debug_assertions), Some("9222")).contains("remote-debugging-port"));
    }

    #[test]
    fn the_server_settings_page_opens_at_a_known_page_and_group_only() {
        let at = |s| server_settings_url("http://127.0.0.1:3922", s);
        assert_eq!(at(None), "http://127.0.0.1:3922/?settings");
        assert_eq!(at(Some("server")), "http://127.0.0.1:3922/?settings#server");
        assert_eq!(at(Some("dashboard")), "http://127.0.0.1:3922/?settings#dashboard");
        assert_eq!(at(Some("dashboard/performance")), "http://127.0.0.1:3922/?settings#dashboard/performance");
        for bad in ["nope", "dashboard/", "dashboard/a/b", "studio/Grid", "nope/clock", "server#x?y=1", ""] {
            assert_eq!(at(Some(bad)), "http://127.0.0.1:3922/?settings", "{bad}");
        }
        // The rescue page has the App sections only.
        assert_eq!(settings_page(Some("dashboard")), "app/settings.html");
    }

    #[test]
    fn settings_opens_at_a_known_section_only() {
        assert_eq!(settings_page(Some("server")), "app/settings.html#server");
        assert_eq!(settings_page(Some("changelog")), "app/settings.html#changelog");
        assert_eq!(settings_page(None), "app/settings.html");
        assert_eq!(settings_page(Some("nope")), "app/settings.html");
        assert_eq!(settings_page(Some("server#x?y=1")), "app/settings.html");
    }

    #[test]
    fn help_opens_at_an_article_and_a_heading() {
        let at = |a, h| HelpTarget::new(a, h).page();
        assert_eq!(at(None, None), "app/help.html");
        assert_eq!(at(Some("kiosk"), None), "app/help.html#kiosk");
        assert_eq!(
            at(Some("problems"), Some("the-server-wont-start-port-in-use")),
            "app/help.html#problems/the-server-wont-start-port-in-use"
        );
    }

    #[test]
    fn help_drops_what_is_not_a_slug() {
        let none = HelpTarget::new(None, None);
        assert_eq!(HelpTarget::new(Some("Kiosk"), None), none);
        assert_eq!(HelpTarget::new(Some("../x"), Some("a")), none);
        assert_eq!(HelpTarget::new(Some(""), None), none);
        assert_eq!(HelpTarget::new(Some(&"a".repeat(81)), None), none);
        // A bad heading keeps the article; a heading alone is nothing.
        assert_eq!(HelpTarget::new(Some("kiosk"), Some("a/b?c")).page(), "app/help.html#kiosk");
        assert_eq!(HelpTarget::new(None, Some("part")), none);
    }

    #[test]
    fn help_event_carries_only_what_is_set() {
        let json = |t: &HelpTarget| serde_json::to_string(t).unwrap();
        assert_eq!(json(&HelpTarget::new(None, None)), "{}");
        assert_eq!(json(&HelpTarget::new(Some("kiosk"), Some("ports"))), r#"{"article":"kiosk","heading":"ports"}"#);
    }
}
