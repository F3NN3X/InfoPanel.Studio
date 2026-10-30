// Where the studio opens (the openStudioIn setting): the app's own window, Microsoft Edge in app mode, or the
// default browser. Every path that opens the studio asks `studio_target` first; the browser targets start no WebView.
// Edge is found from the registry (App Paths), never a hard-coded path. The default browser's engine is read from
// its UserChoice ProgId, for the settings page's "may look different" hint.

use crate::settings::{OpenStudioIn, Settings};
use crate::state::{AppState, Phase, Status};
use crate::{control, debug, http, settings, windows};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StudioTarget {
    Window,
    EdgeApp(String),
    Browser(String),
}

impl StudioTarget {
    /// The name the log line uses: `studio opened in <name>: <url>`.
    pub fn name(&self) -> &'static str {
        match self {
            StudioTarget::Window => "app window",
            StudioTarget::EdgeApp(_) => "edge app",
            StudioTarget::Browser(_) => "default browser",
        }
    }
}

/// The studio's address for a browser: always loopback, whatever the server listens on (the LAN host would send a
/// local edit through the network and its request guard).
pub fn studio_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/?studio=1")
}

/// Where the studio opens with these settings, on a server at `port`.
pub fn studio_target(s: &Settings, port: u16) -> StudioTarget {
    match s.open_studio_in {
        OpenStudioIn::AppWindow => StudioTarget::Window,
        OpenStudioIn::EdgeApp => StudioTarget::EdgeApp(studio_url(port)),
        OpenStudioIn::DefaultBrowser => StudioTarget::Browser(studio_url(port)),
    }
}

/// What an Open studio does when a browser studio may already be open: browsers can't be told from outside to
/// focus an existing tab, so a second open asks first (a tray notice with an "Open another" action).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenDecision {
    Open,
    AlreadyOpen,
}

/// `studio_clients`: studio pages on this machine connected to the server now; `another`: the user asked for
/// another one anyway.
pub fn open_decision(target: &StudioTarget, studio_clients: usize, another: bool) -> OpenDecision {
    match target {
        StudioTarget::Window => OpenDecision::Open,
        _ if another || studio_clients == 0 => OpenDecision::Open,
        _ => OpenDecision::AlreadyOpen,
    }
}

/// msedge.exe from an App Paths default value (`"C:\...\msedge.exe"`, quoted or not); None for anything else.
pub fn edge_path_from(raw: &str) -> Option<std::path::PathBuf> {
    let path = raw.trim().trim_matches('"').trim();
    let file = std::path::Path::new(path).file_name()?.to_str()?;
    (file.eq_ignore_ascii_case("msedge.exe") && std::path::Path::new(path).is_absolute())
        .then(|| path.into())
}

/// The default browser's engine, from its ProgId.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserKind {
    Chromium,
    Other,
    /// Not read, or a ProgId we don't know: the settings page shows no hint rather than a wrong one.
    Unknown,
}

/// Chromium-based browsers' http ProgIds (prefix match: Chrome's channels add letters, e.g. ChromeBHTML).
const CHROMIUM_PROGIDS: &[&str] = &[
    "MSEdgeHTM",
    "MSEdgeBHTML",
    "MSEdgeDHTML",
    "MSEdgeCHTML",
    "ChromeHTML",
    "ChromeBHTML",
    "ChromeDHTML",
    "ChromeSSHTM",
    "ChromiumHTM",
    "BraveHTML",
    "BraveBHTML",
    "VivaldiHTM",
    "OperaStable",
    "OperaGXStable",
    "YandexHTML",
    "ArcHTML",
];
/// Other engines (Gecko, Trident) we can name with certainty.
const OTHER_PROGIDS: &[&str] = &[
    "FirefoxURL",
    "FirefoxHTML",
    "WaterfoxURL",
    "LibreWolfHTM",
    "IE.HTTP",
];

pub fn browser_kind(prog_id: Option<&str>) -> BrowserKind {
    let Some(id) = prog_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return BrowserKind::Unknown;
    };
    let starts = |list: &[&str]| {
        list.iter()
            .any(|p| id.len() >= p.len() && id[..p.len()].eq_ignore_ascii_case(p))
    };
    if starts(CHROMIUM_PROGIDS) {
        BrowserKind::Chromium
    } else if starts(OTHER_PROGIDS) {
        BrowserKind::Other
    } else {
        BrowserKind::Unknown
    }
}

#[cfg(windows)]
pub(crate) mod registry {
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// A REG_SZ value (`name` None: the key's default value).
    pub fn string(root: HKEY, key: &str, name: Option<&str>) -> Option<String> {
        let key = wide(key);
        let name = name.map(wide);
        let name_ptr = name.as_ref().map_or(std::ptr::null(), |n| n.as_ptr());
        let mut len: u32 = 0;
        // SAFETY: valid NUL-terminated strings; a null buffer asks for the size first.
        let rc = unsafe {
            RegGetValueW(
                root,
                key.as_ptr(),
                name_ptr,
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut len,
            )
        };
        if rc != 0 || len == 0 {
            return None;
        }
        let mut buf = vec![0u16; (len as usize).div_ceil(2)];
        // SAFETY: `buf` holds `len` bytes.
        let rc = unsafe {
            RegGetValueW(
                root,
                key.as_ptr(),
                name_ptr,
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                buf.as_mut_ptr().cast(),
                &mut len,
            )
        };
        if rc != 0 {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }

    pub const HKCU: HKEY = HKEY_CURRENT_USER;
    pub const HKLM: HKEY = HKEY_LOCAL_MACHINE;
}

const EDGE_APP_PATH: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe";
const HTTP_USER_CHOICE: &str =
    r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice";

/// Microsoft Edge's executable from App Paths (the user's, then the machine's), if it is there.
#[cfg(windows)]
pub fn find_edge() -> Option<std::path::PathBuf> {
    [registry::HKCU, registry::HKLM]
        .into_iter()
        .filter_map(|root| registry::string(root, EDGE_APP_PATH, None))
        .filter_map(|raw| edge_path_from(&raw))
        .find(|p| p.is_file())
}

#[cfg(not(windows))]
pub fn find_edge() -> Option<std::path::PathBuf> {
    None
}

/// The default browser's engine.
#[cfg(windows)]
pub fn default_browser_kind() -> BrowserKind {
    browser_kind(registry::string(registry::HKCU, HTTP_USER_CHOICE, Some("ProgId")).as_deref())
}

#[cfg(not(windows))]
pub fn default_browser_kind() -> BrowserKind {
    BrowserKind::Unknown
}

/// How long a browser studio waits for the server to come up before the app window shows the problem.
const SERVER_WAIT: Duration = Duration::from_secs(30);

/// Opens the studio where the setting says: every path that opens it (the tray, launch, a second launch, the
/// start page and Settings' links) comes here. A browser target starts the server first and asks before opening a
/// second studio.
pub fn open(app: &AppHandle) {
    if app.state::<AppState>().settings().open_studio_in == OpenStudioIn::AppWindow {
        windows::show_main(app);
        return;
    }
    // Off the caller's thread: the wait for the server and the "already open" question block.
    let app = app.clone();
    std::thread::spawn(move || open_in_browser(&app));
}

fn open_in_browser(app: &AppHandle) {
    let Some(status) = running_server(app) else {
        // The app window's start page names the problem and offers the fixes.
        log::warn!("the studio could not open in the browser: the server isn't running");
        windows::show_main(app);
        return;
    };
    let target = studio_target(&app.state::<AppState>().settings(), status.port);
    if open_decision(&target, studios_open(&status), false) == OpenDecision::AlreadyOpen
        && !ask_open_another(app)
    {
        log::info!("the studio is already open in a browser; not opening another");
        return;
    }
    let (StudioTarget::EdgeApp(url) | StudioTarget::Browser(url)) = &target else {
        windows::show_main(app);
        return;
    };
    if let Some(name) = open_url(app, &target, url) {
        log::info!("studio opened in {name}: {url}");
    }
}

/// The server's status once it runs, starting it when it is stopped or failed; None if it doesn't come up.
fn running_server(app: &AppHandle) -> Option<Status> {
    let st = app.state::<AppState>();
    let deadline = Instant::now() + SERVER_WAIT;
    let mut status = st.status();
    if matches!(status.state, Phase::Stopped | Phase::Failed) {
        status = control::start_blocking(app);
    }
    while matches!(status.state, Phase::Starting | Phase::Restarting) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(250));
        status = st.status();
    }
    (status.state == Phase::Running).then_some(status)
}

/// Studio pages on this machine connected to the server now (0 when it doesn't say).
fn studios_open(status: &Status) -> usize {
    http::get(
        &settings::connect_host(&status.host),
        status.port,
        "/api/server/stats",
        Duration::from_secs(2),
    )
    .ok()
    .filter(|r| r.status == 200)
    .and_then(|r| debug::parse_server_studios(&r.body))
    .unwrap_or(0) as usize
}

/// A browser can't be told to focus its studio tab, so a second open asks first.
fn ask_open_another(app: &AppHandle) -> bool {
    app.dialog()
        .message("The studio is already open in your browser. Switch to it there, or open another studio.")
        .title("InfoPanel Studio")
        .buttons(MessageDialogButtons::OkCancelCustom("Open another".into(), "Cancel".into()))
        .blocking_show()
}

/// The desktop specs' browser, in debug builds only, so a spec never opens the user's own: `INFOPANEL_STUDIO_BROWSER_
/// PROFILE` gives Edge a scratch profile, and `INFOPANEL_STUDIO_BROWSER_EXE` names a Chromium that stands in for the
/// default browser (with that profile). A release build reads neither.
#[derive(Debug, Default, PartialEq, Eq)]
struct SpecBrowser {
    exe: Option<String>,
    args: Vec<String>,
}

fn spec_browser_for(
    debug_build: bool,
    exe: Option<String>,
    profile: Option<String>,
) -> SpecBrowser {
    if !debug_build {
        return SpecBrowser::default();
    }
    let args = profile
        .filter(|p| !p.is_empty())
        .map(|p| {
            vec![
                format!("--user-data-dir={p}"),
                "--no-first-run".into(),
                "--no-default-browser-check".into(),
            ]
        })
        .unwrap_or_default();
    SpecBrowser {
        exe: exe.filter(|e| !e.is_empty()),
        args,
    }
}

fn spec_browser() -> SpecBrowser {
    let var = |name| std::env::var(name).ok();
    spec_browser_for(
        cfg!(debug_assertions),
        var("INFOPANEL_STUDIO_BROWSER_EXE"),
        var("INFOPANEL_STUDIO_BROWSER_PROFILE"),
    )
}

/// Opens `url` in Edge's app mode, or in the default browser when Edge is missing or won't start. Returns the name
/// of where it opened, None when nothing opened.
fn open_url(app: &AppHandle, target: &StudioTarget, url: &str) -> Option<&'static str> {
    let spec = spec_browser();
    if let StudioTarget::EdgeApp(_) = target {
        match find_edge().map(|edge| {
            std::process::Command::new(edge)
                .args(&spec.args)
                .arg(format!("--app={url}"))
                .spawn()
        }) {
            Some(Ok(_)) => return Some(target.name()),
            Some(Err(e)) => {
                log::warn!("Microsoft Edge didn't start ({e}); opening the default browser")
            }
            None => log::warn!("Microsoft Edge isn't installed; opening the default browser"),
        }
    }
    if let Some(exe) = &spec.exe {
        let opened = std::process::Command::new(exe)
            .args(&spec.args)
            .arg(url)
            .spawn();
        return opened
            .ok()
            .map(|_| StudioTarget::Browser(String::new()).name());
    }
    match app.opener().open_url(url, None::<&str>) {
        Ok(()) => Some(StudioTarget::Browser(String::new()).name()),
        Err(e) => {
            log::warn!("could not open {url} in the browser: {e}");
            None
        }
    }
}

/// Help follows the setting: with a browser target it opens the Help page the server hosts (its own Help window
/// while the server is down, since that one needs no server).
pub fn open_help(app: &AppHandle, help: &windows::HelpTarget) {
    let st = app.state::<AppState>();
    let status = st.status();
    let target = studio_target(&st.settings(), status.port);
    if target == StudioTarget::Window || status.state != Phase::Running {
        windows::show_help(app, help);
        return;
    }
    let url = format!("http://127.0.0.1:{}/help.html{}", status.port, help.hash());
    if let Some(name) = open_url(app, &target, &url) {
        log::info!("help opened in {name}: {url}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with(open: OpenStudioIn) -> Settings {
        Settings {
            open_studio_in: open,
            ..Settings::default()
        }
    }

    #[test]
    fn the_target_follows_the_setting_on_a_loopback_url() {
        assert_eq!(
            studio_target(&with(OpenStudioIn::AppWindow), 3922),
            StudioTarget::Window
        );
        assert_eq!(
            studio_target(&with(OpenStudioIn::EdgeApp), 3922),
            StudioTarget::EdgeApp("http://127.0.0.1:3922/?studio=1".into())
        );
        assert_eq!(
            studio_target(&with(OpenStudioIn::DefaultBrowser), 4000),
            StudioTarget::Browser("http://127.0.0.1:4000/?studio=1".into())
        );
    }

    #[test]
    fn the_url_stays_on_loopback_when_the_server_listens_on_the_network() {
        let mut s = with(OpenStudioIn::DefaultBrowser);
        s.listen = crate::settings::Listen::Lan;
        assert_eq!(
            studio_target(&s, 3922),
            StudioTarget::Browser("http://127.0.0.1:3922/?studio=1".into())
        );
    }

    #[test]
    fn a_browser_studio_already_open_asks_before_opening_another() {
        let browser = StudioTarget::Browser(studio_url(3922));
        assert_eq!(open_decision(&browser, 0, false), OpenDecision::Open);
        assert_eq!(open_decision(&browser, 1, false), OpenDecision::AlreadyOpen);
        assert_eq!(open_decision(&browser, 2, true), OpenDecision::Open);
        assert_eq!(
            open_decision(&StudioTarget::EdgeApp(studio_url(3922)), 1, false),
            OpenDecision::AlreadyOpen
        );
        // The app window focuses its own window; nothing to ask.
        assert_eq!(
            open_decision(&StudioTarget::Window, 3, false),
            OpenDecision::Open
        );
    }

    #[test]
    fn the_spec_browser_is_debug_only() {
        let exe = || Some(r"C:\chromium\chrome.exe".to_string());
        let profile = || Some(r"C:\tmp\edge".to_string());
        assert_eq!(
            spec_browser_for(false, exe(), profile()),
            SpecBrowser::default()
        );
        let spec = spec_browser_for(true, exe(), profile());
        assert_eq!(spec.exe.as_deref(), Some(r"C:\chromium\chrome.exe"));
        assert_eq!(spec.args[0], r"--user-data-dir=C:\tmp\edge");
        assert_eq!(
            spec_browser_for(true, Some(String::new()), Some(String::new())),
            SpecBrowser::default()
        );
    }

    #[test]
    fn edge_is_read_from_an_app_paths_value() {
        let expect = std::path::PathBuf::from(
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        );
        assert_eq!(
            edge_path_from(r#""C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe""#),
            Some(expect.clone())
        );
        assert_eq!(
            edge_path_from(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe "),
            Some(expect)
        );
        assert_eq!(
            edge_path_from(r"C:\Tools\MSEDGE.EXE"),
            Some(r"C:\Tools\MSEDGE.EXE".into())
        );
        assert_eq!(
            edge_path_from(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            None
        );
        assert_eq!(edge_path_from("msedge.exe"), None);
        assert_eq!(edge_path_from(""), None);
    }

    #[test]
    fn prog_ids_name_the_engine_and_unknown_ones_name_none() {
        for id in [
            "MSEdgeHTM",
            "ChromeHTML",
            "ChromeBHTML",
            "BraveHTML",
            "VivaldiHTM",
            "OperaStable",
            "chromehtml",
        ] {
            assert_eq!(browser_kind(Some(id)), BrowserKind::Chromium, "{id}");
        }
        for id in ["FirefoxURL-308046B0AF4A39CB", "LibreWolfHTM", "IE.HTTP"] {
            assert_eq!(browser_kind(Some(id)), BrowserKind::Other, "{id}");
        }
        assert_eq!(
            browser_kind(Some("AppXq0fevzme2pys62n3e0fbqa7peapykr8v")),
            BrowserKind::Unknown
        );
        assert_eq!(browser_kind(Some("  ")), BrowserKind::Unknown);
        assert_eq!(browser_kind(None), BrowserKind::Unknown);
    }
}
