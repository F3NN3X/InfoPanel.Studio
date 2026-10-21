// The studio window (start page until the server answers) and the settings and help windows, their
// navigation guard, close-to-tray and quit.

use crate::nav;
use crate::state::{lock, AppState, Phase, FLUSH_TIMEOUT};
use std::sync::atomic::Ordering;
use std::time::Instant;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

pub const MAIN: &str = "main";
pub const SETTINGS: &str = "settings";
pub const HELP: &str = "help";
pub const FLUSH_EVENT: &str = "studio://flush";
/// Sent to the main window when the shell leaves Kiosk view on its own (a close from it).
pub const KIOSK_LEFT_EVENT: &str = "kiosk-left";

/// WebView2's own default flags (wry's), plus `--remote-debugging-port=<n>` when debug mode is on
/// and `INFOPANEL_STUDIO_CDP_PORT` is set, so a test or debugging session can attach over CDP.
/// Decided once per run: every webview must get the same arguments, since they share one WebView2
/// environment.
fn browser_args(debug: bool) -> &'static str {
    static ARGS: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    ARGS.get_or_init(|| {
        let base = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
        let port = std::env::var("INFOPANEL_STUDIO_CDP_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .filter(|_| debug);
        match port {
            Some(port) => format!("{base} --remote-debugging-port={port}"),
            None => base.to_string(),
        }
    })
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
    let window = WebviewWindowBuilder::new(app, MAIN, url)
        .title("InfoPanel Studio")
        // The studio's top bar (and the start page's) is the title bar, with its own controls.
        .decorations(false)
        // Tauri's own drag-drop handler takes file drops from the page; the studio's Import door
        // and its drop overlay read them as HTML5 events.
        .disable_drag_drop_handler()
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 600.0)
        .additional_browser_args(browser_args(app.state::<AppState>().debug()))
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
        .on_page_load(zoom_on_load)
        .build()?;
    let _ = window.set_zoom(zoom_factor(app));
    let handle = app.clone();
    window.on_window_event(move |event| {
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

/// Shows (creating if needed) and focuses the studio window.
pub fn show_main(app: &AppHandle) {
    let window = match app.get_webview_window(MAIN) {
        Some(w) => w,
        None => match create_main(app) {
            Ok(w) => w,
            Err(e) => return log::error!("could not open the studio window: {e}"),
        },
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
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

/// Event telling an open Settings window to show a section (the payload is its id).
pub const SETTINGS_EVENT: &str = "settings-section";
/// Event telling the studio page to open Settings › App (the payload is a section id, or null).
pub const OPEN_SETTINGS_EVENT: &str = "studio://open-settings";
/// Event telling an open Help window to show an article (the payload is a `HelpTarget`).
pub const HELP_EVENT: &str = "help-open";

/// The sections Settings has (`SectionId` in src/settings/model/search.ts).
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

/// The section if Settings has it: the page and the event only ever carry known ids.
fn settings_section(section: Option<&str>) -> Option<&str> {
    section.filter(|s| SETTINGS_SECTIONS.contains(s))
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

    /// The page to load, with the deep-link hash (`#kiosk` or `#kiosk/the-kiosk-url`).
    fn page(&self) -> String {
        match (&self.article, &self.heading) {
            (Some(a), Some(h)) => format!("app/help.html#{a}/{h}"),
            (Some(a), None) => format!("app/help.html#{a}"),
            _ => "app/help.html".to_owned(),
        }
    }
}

/// The settings page to load, at a section when it is a known one.
fn settings_page(section: Option<&str>) -> String {
    match settings_section(section) {
        Some(s) => format!("app/settings.html#{s}"),
        None => "app/settings.html".to_owned(),
    }
}

/// Focuses the app page window with this label, or builds it at `page` (a path under the local
/// pages). Returns whether it was already open.
fn show_page(app: &AppHandle, label: &str, title: &str, page: &str) -> bool {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return true;
    }
    let nav_app = app.clone();
    let popup_app = app.clone();
    let built = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title(title)
        .decorations(false)
        .inner_size(1000.0, 720.0)
        .min_inner_size(760.0, 520.0)
        .additional_browser_args(browser_args(app.state::<AppState>().debug()))
        .on_navigation(move |url| {
            let allowed = nav::is_local_page(url);
            if !allowed {
                open_external(&nav_app, url);
            }
            allowed
        })
        .on_new_window(move |url, _| {
            open_external(&popup_app, &url);
            NewWindowResponse::Deny
        })
        .on_page_load(zoom_on_load)
        .build();
    match built {
        Ok(w) => {
            let _ = w.set_zoom(zoom_factor(app));
        }
        Err(e) => log::error!("could not open the {label} window: {e}"),
    }
    false
}

/// Shows the settings window, at a section when given one.
pub fn show_settings(app: &AppHandle, section: Option<&str>) {
    if show_page(app, SETTINGS, "InfoPanel Studio settings", &settings_page(section)) {
        if let Some(s) = settings_section(section) {
            let _ = app.emit_to(SETTINGS, SETTINGS_EVENT, s);
        }
    }
}

/// The tray's Settings: the studio window, which opens Settings › App (at a section when given one). A
/// window that is open gets the event; one that is built by this call, or is still loading, finds the request
/// waiting when its page mounts (`take_pending_settings`). While the window shows the start page, its own
/// rescue buttons are what the user gets.
pub fn show_settings_in_studio(app: &AppHandle, section: Option<&str>) {
    let st = app.state::<AppState>();
    let existed = app.get_webview_window(MAIN).is_some();
    let section = settings_section(section);
    st.pending_settings.set(section, Instant::now());
    show_main(app);
    if !st.studio_page.load(Ordering::SeqCst) {
        st.pending_settings.clear();
    } else if existed {
        let _ = app.emit_to(MAIN, OPEN_SETTINGS_EVENT, section);
    }
}

/// Shows the help window, at an article and heading when given.
pub fn show_help(app: &AppHandle, target: &HelpTarget) {
    if show_page(app, HELP, "InfoPanel Studio help", &target.page()) {
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
    st.flush.arm();
    if window.emit_to(MAIN, FLUSH_EVENT, ()).is_err() {
        st.flush.release();
        return;
    }
    let answered = st.flush.wait(FLUSH_TIMEOUT);
    log::debug!("flush: answered={answered}");
}

fn close_main(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    if s.close_to_tray {
        flush_studio(app);
        if let Some(w) = app.get_webview_window(MAIN) {
            let _ = w.hide();
        }
        log::debug!("window hidden to the tray");
        return;
    }
    if !s.close_warning_shown {
        let go_on = app
            .dialog()
            .message(
                "Closing InfoPanel Studio stops its dashboard server, so the kiosk page stops \
                 updating until you start the app again.\n\nTo keep the server running with the \
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
