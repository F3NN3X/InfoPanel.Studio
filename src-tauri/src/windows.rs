// The studio window (start page until the server answers) and the settings window, their
// navigation guard, close-to-tray and quit.

use crate::nav;
use crate::state::{lock, AppState, Phase, FLUSH_TIMEOUT};
use std::sync::atomic::Ordering;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

pub const MAIN: &str = "main";
pub const SETTINGS: &str = "settings";
pub const FLUSH_EVENT: &str = "studio://flush";

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
fn zoom_factor(app: &AppHandle) -> f64 {
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
            std::thread::spawn(move || close_main(&app));
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

pub fn show_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    let nav_app = app.clone();
    let popup_app = app.clone();
    let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("app/settings.html".into()))
        .title("InfoPanel Studio settings")
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
        Err(e) => log::error!("could not open settings: {e}"),
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
    flush_studio(app);
    crate::control::stop_owned(app);
    app.exit(0);
}
