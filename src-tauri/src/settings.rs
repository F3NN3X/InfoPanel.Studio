// App settings (settings.json): defaults that match the plain server, validation, and loading
// that survives older or hand-edited files.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::net::IpAddr;
use std::path::{Path, PathBuf};

/// Current settings file layout; bump with a migration in `load_from_str`.
pub const SETTINGS_VERSION: u32 = 2;

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const LAN_HOST: &str = "0.0.0.0";
pub const DEFAULT_PORT: u16 = 3922;
pub const MIN_PORT: u16 = 1024;
/// The app zoom steps, in percent.
pub const ZOOMS: &[u16] = &[80, 90, 100, 110, 125, 150];
pub const DEFAULT_ZOOM: u16 = 100;

/// Who can reach the server: this computer only (127.0.0.1) or the local network (0.0.0.0).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Listen {
    #[default]
    Local,
    Lan,
}

impl Listen {
    /// The address the server binds.
    pub fn host(self) -> &'static str {
        match self {
            Listen::Local => DEFAULT_HOST,
            Listen::Lan => LAN_HOST,
        }
    }

    /// The v1 `host` this replaces: loopback stays local, any other address is the network. A
    /// host that is no address at all (v1 reset those to 127.0.0.1) stays local.
    pub fn from_host(host: &str) -> Self {
        match host.parse::<IpAddr>() {
            Ok(ip) if !ip.is_loopback() => Listen::Lan,
            _ => Listen::Local,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    #[default]
    Stable,
    Beta,
}

/// When the Studio page reloads itself to give back memory a long session holds.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StudioRefresh {
    /// After 30 minutes without focus.
    #[default]
    Idle,
    /// Once a day, from 04:00, while the window isn't focused.
    Daily,
    Off,
}

/// How long the hidden Studio window may sit in the tray before its page is closed.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseHiddenStudio {
    After1m,
    #[default]
    After10m,
    After60m,
    Never,
}

/// Where the studio opens (`studio_target.rs`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpenStudioIn {
    #[default]
    AppWindow,
    /// Microsoft Edge with `--app=<url>`: a window without browser chrome, on Chromium like the app.
    EdgeApp,
    DefaultBrowser,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub listen: Listen,
    pub port: u16,
    #[serde(deserialize_with = "list_or_csv")]
    pub allowed_hosts: Vec<String>,
    /// Let other devices on the network change the studio's data; off keeps writes to this computer.
    pub allow_remote_edit: bool,
    /// Restart the server after a crash (3 tries a minute).
    pub auto_restart: bool,
    pub start_at_login: bool,
    pub open_studio_on_launch: bool,
    /// Start the server when the app starts; off launches with it stopped.
    pub start_server: bool,
    pub close_to_tray: bool,
    /// Restore and save the studio window's size and position.
    pub remember_bounds: bool,
    /// App zoom in percent, one of `ZOOMS`.
    pub zoom: u16,
    /// Reload the Studio page now and then while the window isn't focused.
    pub studio_refresh: StudioRefresh,
    /// Close the hidden Studio's page after a while in the tray, to give back its memory.
    pub release_hidden_studio: ReleaseHiddenStudio,
    /// Slow the studio's canvas and pause its ambient effects a minute after the window loses focus.
    pub reduce_unfocused_animation: bool,
    /// Open the studio in the app's window, Edge in app mode or the default browser.
    pub open_studio_in: OpenStudioIn,
    /// Look for a new version shortly after the app starts.
    pub check_for_updates: bool,
    pub update_channel: Channel,
    /// Download an update as soon as a check finds it.
    pub auto_download: bool,
    pub agents: AgentSettings,
    pub debug: bool,
    /// The one-time "closing stops the kiosk" warning was shown (close to tray off).
    pub close_warning_shown: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentSettings {
    pub enabled: bool,
    /// What the hooks were last written for; a mismatch triggers a re-install.
    pub installed: Option<AgentInstall>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentInstall {
    pub version: String,
    pub url: String,
    pub node: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            listen: Listen::Local,
            port: DEFAULT_PORT,
            allowed_hosts: Vec::new(),
            allow_remote_edit: false,
            auto_restart: true,
            start_at_login: true,
            open_studio_on_launch: true,
            start_server: true,
            close_to_tray: true,
            remember_bounds: true,
            zoom: DEFAULT_ZOOM,
            studio_refresh: StudioRefresh::Idle,
            release_hidden_studio: ReleaseHiddenStudio::After10m,
            reduce_unfocused_animation: true,
            open_studio_in: OpenStudioIn::AppWindow,
            check_for_updates: true,
            update_channel: Channel::Stable,
            auto_download: false,
            agents: AgentSettings::default(),
            debug: false,
            close_warning_shown: false,
        }
    }
}

impl Settings {
    /// The address the server binds for `listen`.
    pub fn host(&self) -> &'static str {
        self.listen.host()
    }
}

/// `allowedHosts` as a list, or as the comma-separated string `ALLOWED_HOSTS` uses.
fn list_or_csv<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        List(Vec<String>),
        Csv(String),
    }
    let raw = Option::<Raw>::deserialize(d)?;
    let items = match raw {
        Some(Raw::List(list)) => list,
        Some(Raw::Csv(s)) => s.split(',').map(str::to_owned).collect(),
        None => Vec::new(),
    };
    Ok(items
        .into_iter()
        .map(|h| h.trim().to_owned())
        .filter(|h| !h.is_empty())
        .collect())
}

pub fn validate_port(port: u16) -> Result<(), String> {
    if port < MIN_PORT {
        return Err(format!("Use a number from {MIN_PORT} to 65535."));
    }
    Ok(())
}

pub fn validate_zoom(zoom: u16) -> Result<(), String> {
    if ZOOMS.contains(&zoom) {
        Ok(())
    } else {
        Err(format!("Zoom is one of {ZOOMS:?} percent."))
    }
}

/// A host name or address request-guard can match: letters, digits, `.`, `-`, `:`, `[`, `]`.
pub fn validate_allowed_host(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 253
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '[' | ']'));
    if ok {
        Ok(())
    } else {
        Err(format!("\"{name}\" is not a host name."))
    }
}

/// `s` with `key` (a `Settings` field other than agents, version and closeWarningShown) set
/// to `value`, validated; the error is the text to show.
pub fn with_setting(s: &Settings, key: &str, value: Value) -> Result<Settings, String> {
    fn parse<T: serde::de::DeserializeOwned>(key: &str, value: Value) -> Result<T, String> {
        serde_json::from_value(value).map_err(|_| format!("\"{key}\" has the wrong type."))
    }
    let mut next = s.clone();
    match key {
        "listen" => next.listen = parse(key, value)?,
        "port" => {
            let port: u64 = parse(key, value)?;
            next.port = u16::try_from(port)
                .ok()
                .filter(|p| validate_port(*p).is_ok())
                .ok_or_else(|| format!("Use a number from {MIN_PORT} to 65535."))?;
        }
        "allowedHosts" => {
            let raw: Vec<String> = parse(key, value)?;
            let hosts: Vec<String> = raw
                .iter()
                .map(|h| h.trim().to_owned())
                .filter(|h| !h.is_empty())
                .collect();
            if let Some(message) = hosts.iter().find_map(|h| validate_allowed_host(h).err()) {
                return Err(message);
            }
            next.allowed_hosts = hosts;
        }
        "allowRemoteEdit" => next.allow_remote_edit = parse(key, value)?,
        "autoRestart" => next.auto_restart = parse(key, value)?,
        "startAtLogin" => next.start_at_login = parse(key, value)?,
        "openStudioOnLaunch" => next.open_studio_on_launch = parse(key, value)?,
        "startServer" => next.start_server = parse(key, value)?,
        "closeToTray" => next.close_to_tray = parse(key, value)?,
        "rememberBounds" => next.remember_bounds = parse(key, value)?,
        "zoom" => {
            let zoom: u64 = parse(key, value)?;
            next.zoom = u16::try_from(zoom).unwrap_or(0);
            validate_zoom(next.zoom)?;
        }
        "studioRefresh" => next.studio_refresh = parse(key, value)?,
        "releaseHiddenStudio" => next.release_hidden_studio = parse(key, value)?,
        "reduceUnfocusedAnimation" => next.reduce_unfocused_animation = parse(key, value)?,
        "openStudioIn" => next.open_studio_in = parse(key, value)?,
        "checkForUpdates" => next.check_for_updates = parse(key, value)?,
        "updateChannel" => next.update_channel = parse(key, value)?,
        "autoDownload" => next.auto_download = parse(key, value)?,
        "debug" => next.debug = parse(key, value)?,
        _ => return Err(format!("\"{key}\" is not a setting.")),
    }
    Ok(next)
}

/// The address the app itself uses to reach the server: 127.0.0.1 for loopback and the
/// wildcard, the chosen IP otherwise.
pub fn connect_host(host: &str) -> String {
    match host.parse::<IpAddr>() {
        Ok(ip) if ip.is_loopback() || ip.is_unspecified() => DEFAULT_HOST.into(),
        Ok(IpAddr::V6(ip)) => format!("[{ip}]"),
        Ok(ip) => ip.to_string(),
        Err(_) => DEFAULT_HOST.into(),
    }
}

/// `http://<connect host>:<port>`, the origin the window loads the studio from.
pub fn origin(host: &str, port: u16) -> String {
    format!("http://{}:{}", connect_host(host), port)
}

pub fn server_origin(s: &Settings) -> String {
    origin(s.host(), s.port)
}

/// Version 1 kept the bind address as `host`; it becomes `listen`.
fn migrate(raw: &mut Value) {
    let Some(map) = raw.as_object_mut() else {
        return;
    };
    let version = map.get("version").and_then(Value::as_u64).unwrap_or(0);
    if version < 2 {
        if let Some(host) = map.remove("host") {
            if !map.contains_key("listen") {
                let listen = Listen::from_host(host.as_str().unwrap_or_default().trim());
                map.insert(
                    "listen".into(),
                    serde_json::to_value(listen).unwrap_or_default(),
                );
            }
        }
    }
}

/// A key that does not parse as its type takes the default instead of failing the whole file.
fn drop_bad_keys(raw: &mut Value) {
    let Some(map) = raw.as_object_mut() else {
        return;
    };
    let keys: Vec<String> = map.keys().cloned().collect();
    for key in keys {
        let probe = Value::Object([(key.clone(), map[&key].clone())].into_iter().collect());
        if serde_json::from_value::<Settings>(probe).is_err() {
            map.remove(&key);
        }
    }
}

/// Settings from file text: older layouts migrated, unknown keys dropped, missing ones defaulted,
/// invalid values reset.
pub fn load_from_str(text: &str) -> Result<Settings, serde_json::Error> {
    let mut raw: Value = serde_json::from_str(text)?;
    migrate(&mut raw);
    drop_bad_keys(&mut raw);
    let mut s: Settings = serde_json::from_value(raw)?;
    s.version = SETTINGS_VERSION;
    if validate_port(s.port).is_err() {
        s.port = DEFAULT_PORT;
    }
    if validate_zoom(s.zoom).is_err() {
        s.zoom = DEFAULT_ZOOM;
    }
    s.allowed_hosts.retain(|h| validate_allowed_host(h).is_ok());
    Ok(s)
}

pub fn settings_file(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}

/// Reads settings.json, creating it with defaults on first run. A file that does not parse is
/// kept as settings.invalid.json and replaced by defaults.
pub fn load(config_dir: &Path) -> Settings {
    let file = settings_file(config_dir);
    let loaded = match std::fs::read_to_string(&file) {
        Ok(text) => match load_from_str(&text) {
            Ok(s) => Some(s),
            Err(err) => {
                log::warn!("settings.json does not parse ({err}); using defaults");
                let _ = std::fs::rename(&file, config_dir.join("settings.invalid.json"));
                None
            }
        },
        Err(_) => None,
    };
    let s = loaded.unwrap_or_default();
    if let Err(err) = save(config_dir, &s) {
        log::warn!("could not write settings.json: {err}");
    }
    s
}

pub fn save(config_dir: &Path, s: &Settings) -> std::io::Result<()> {
    std::fs::create_dir_all(config_dir)?;
    let text = serde_json::to_string_pretty(s).map_err(std::io::Error::other)?;
    let file = settings_file(config_dir);
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(tmp, file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_match_the_plain_server() {
        let s = Settings::default();
        assert_eq!(s.listen, Listen::Local);
        assert_eq!(s.host(), "127.0.0.1");
        assert_eq!(s.port, 3922);
        assert!(s.allowed_hosts.is_empty());
        assert!(!s.allow_remote_edit);
        assert!(s.auto_restart);
        assert!(s.start_at_login);
        assert!(s.open_studio_on_launch);
        assert!(s.start_server);
        assert!(s.close_to_tray);
        assert!(s.remember_bounds);
        assert_eq!(s.zoom, 100);
        assert!(s.check_for_updates);
        assert_eq!(s.update_channel, Channel::Stable);
        assert!(!s.auto_download);
        assert!(!s.agents.enabled);
        assert!(!s.debug);
    }

    #[test]
    fn serializes_camel_case() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(v["startAtLogin"], true);
        assert_eq!(v["listen"], "local");
        assert_eq!(v["updateChannel"], "stable");
        assert_eq!(v["rememberBounds"], true);
        assert_eq!(v["allowedHosts"], json!([]));
        assert_eq!(v["allowRemoteEdit"], false);
        assert_eq!(v["agents"]["enabled"], false);
        assert_eq!(v["version"], 2);
        assert!(v.get("host").is_none());
    }

    #[test]
    fn missing_keys_take_defaults() {
        let s = load_from_str(r#"{ "port": 3942 }"#).unwrap();
        assert_eq!(s.port, 3942);
        assert_eq!(s.listen, Listen::Local);
        assert!(s.start_at_login);
        assert!(s.start_server);
        assert_eq!(s.version, SETTINGS_VERSION);
    }

    #[test]
    fn update_check_defaults_on_for_older_files() {
        let older = load_from_str(r#"{ "port": 3942 }"#).unwrap();
        assert!(older.check_for_updates);
        let off = load_from_str(r#"{ "checkForUpdates": false }"#).unwrap();
        assert!(!off.check_for_updates);
    }

    #[test]
    fn studio_refresh_defaults_to_idle_for_older_files() {
        assert_eq!(load_from_str(r#"{ "port": 3942 }"#).unwrap().studio_refresh, StudioRefresh::Idle);
        assert_eq!(load_from_str(r#"{ "studioRefresh": "daily" }"#).unwrap().studio_refresh, StudioRefresh::Daily);
        assert_eq!(load_from_str(r#"{ "studioRefresh": "hourly" }"#).unwrap().studio_refresh, StudioRefresh::Idle);
    }

    #[test]
    fn studio_refresh_takes_its_three_values_only() {
        let s = Settings::default();
        assert_eq!(with_setting(&s, "studioRefresh", json!("off")).unwrap().studio_refresh, StudioRefresh::Off);
        assert_eq!(with_setting(&s, "studioRefresh", json!("daily")).unwrap().studio_refresh, StudioRefresh::Daily);
        assert!(with_setting(&s, "studioRefresh", json!("hourly")).is_err());
        assert!(with_setting(&s, "studioRefresh", json!(true)).is_err());
    }

    #[test]
    fn release_hidden_studio_defaults_to_ten_minutes_for_older_files() {
        assert_eq!(load_from_str(r#"{ "port": 3942 }"#).unwrap().release_hidden_studio, ReleaseHiddenStudio::After10m);
        assert_eq!(load_from_str(r#"{ "releaseHiddenStudio": "never" }"#).unwrap().release_hidden_studio, ReleaseHiddenStudio::Never);
        assert_eq!(load_from_str(r#"{ "releaseHiddenStudio": "after1m" }"#).unwrap().release_hidden_studio, ReleaseHiddenStudio::After1m);
        assert_eq!(load_from_str(r#"{ "releaseHiddenStudio": "soon" }"#).unwrap().release_hidden_studio, ReleaseHiddenStudio::After10m);
    }

    #[test]
    fn release_hidden_studio_takes_its_four_values_only() {
        let s = Settings::default();
        let set = |v| with_setting(&s, "releaseHiddenStudio", v).map(|n| n.release_hidden_studio);
        assert_eq!(set(json!("after1m")), Ok(ReleaseHiddenStudio::After1m));
        assert_eq!(set(json!("after10m")), Ok(ReleaseHiddenStudio::After10m));
        assert_eq!(set(json!("after60m")), Ok(ReleaseHiddenStudio::After60m));
        assert_eq!(set(json!("never")), Ok(ReleaseHiddenStudio::Never));
        assert!(set(json!("soon")).is_err());
        assert!(set(json!(true)).is_err());
    }

    #[test]
    fn reduce_unfocused_animation_defaults_on_and_takes_a_boolean() {
        assert!(load_from_str(r#"{ "port": 3942 }"#).unwrap().reduce_unfocused_animation);
        assert!(!load_from_str(r#"{ "reduceUnfocusedAnimation": false }"#).unwrap().reduce_unfocused_animation);
        let s = Settings::default();
        assert_eq!(with_setting(&s, "reduceUnfocusedAnimation", json!(false)).map(|n| n.reduce_unfocused_animation), Ok(false));
        assert!(with_setting(&s, "reduceUnfocusedAnimation", json!("off")).is_err());
    }

    #[test]
    fn open_studio_in_defaults_to_the_app_window_and_takes_its_three_values_only() {
        assert_eq!(load_from_str(r#"{ "port": 3942 }"#).unwrap().open_studio_in, OpenStudioIn::AppWindow);
        assert_eq!(load_from_str(r#"{ "openStudioIn": "edgeApp" }"#).unwrap().open_studio_in, OpenStudioIn::EdgeApp);
        assert_eq!(load_from_str(r#"{ "openStudioIn": "netscape" }"#).unwrap().open_studio_in, OpenStudioIn::AppWindow);
        let s = Settings::default();
        let set = |v| with_setting(&s, "openStudioIn", v).map(|n| n.open_studio_in);
        assert_eq!(set(json!("appWindow")), Ok(OpenStudioIn::AppWindow));
        assert_eq!(set(json!("edgeApp")), Ok(OpenStudioIn::EdgeApp));
        assert_eq!(set(json!("defaultBrowser")), Ok(OpenStudioIn::DefaultBrowser));
        assert!(set(json!("netscape")).is_err());
    }

    #[test]
    fn unknown_keys_are_ignored() {
        let s = load_from_str(r#"{ "port": 3942, "theme": "dark" }"#).unwrap();
        assert_eq!(s.port, 3942);
    }

    #[test]
    fn allowed_hosts_accepts_a_comma_string() {
        let s = load_from_str(r#"{ "allowedHosts": "panel.lan, kiosk ,," }"#).unwrap();
        assert_eq!(s.allowed_hosts, vec!["panel.lan", "kiosk"]);
    }

    #[test]
    fn invalid_values_reset_on_load() {
        let s = load_from_str(
            r#"{ "listen": "everywhere", "port": 80, "zoom": 333, "allowedHosts": ["ok.lan", "bad host"] }"#,
        )
        .unwrap();
        assert_eq!(s.listen, Listen::Local);
        assert_eq!(s.port, DEFAULT_PORT);
        assert_eq!(s.zoom, DEFAULT_ZOOM);
        assert_eq!(s.allowed_hosts, vec!["ok.lan"]);
    }

    #[test]
    fn a_wrongly_typed_key_keeps_the_rest() {
        let s = load_from_str(r#"{ "port": "x", "closeToTray": false }"#).unwrap();
        assert_eq!(s.port, DEFAULT_PORT);
        assert!(!s.close_to_tray);
    }

    #[test]
    fn broken_json_is_an_error() {
        assert!(load_from_str("{ port: ").is_err());
    }

    #[test]
    fn v1_host_migrates_to_listen() {
        for (host, listen) in [
            ("127.0.0.1", Listen::Local),
            ("::1", Listen::Local),
            ("localhost", Listen::Local),
            ("0.0.0.0", Listen::Lan),
            ("192.168.1.20", Listen::Lan),
            ("nope", Listen::Local),
        ] {
            let text = format!(r#"{{ "version": 1, "host": "{host}", "port": 3942 }}"#);
            let s = load_from_str(&text).unwrap();
            assert_eq!(s.listen, listen, "{host}");
            assert_eq!(s.port, 3942);
            assert_eq!(s.version, 2);
        }
        // Version 0 had no version key at all.
        assert_eq!(
            load_from_str(r#"{ "host": "0.0.0.0" }"#).unwrap().listen,
            Listen::Lan
        );
        let saved =
            serde_json::to_value(load_from_str(r#"{ "host": "0.0.0.0" }"#).unwrap()).unwrap();
        assert!(saved.get("host").is_none());
        assert_eq!(saved["listen"], "lan");
    }

    #[test]
    fn v2_ignores_a_stray_host() {
        let s = load_from_str(r#"{ "version": 2, "host": "0.0.0.0", "listen": "local" }"#).unwrap();
        assert_eq!(s.listen, Listen::Local);
    }

    #[test]
    fn listen_binds_loopback_or_everything() {
        assert_eq!(Listen::Local.host(), "127.0.0.1");
        assert_eq!(Listen::Lan.host(), "0.0.0.0");
    }

    #[test]
    fn port_validation() {
        assert!(validate_port(1023).is_err());
        assert!(validate_port(1024).is_ok());
        assert!(validate_port(65535).is_ok());
    }

    #[test]
    fn with_setting_sets_and_validates_each_key() {
        let s = Settings::default();
        assert_eq!(
            with_setting(&s, "listen", json!("lan")).unwrap().listen,
            Listen::Lan
        );
        assert_eq!(with_setting(&s, "port", json!(3943)).unwrap().port, 3943);
        assert_eq!(with_setting(&s, "zoom", json!(125)).unwrap().zoom, 125);
        assert_eq!(
            with_setting(&s, "updateChannel", json!("beta"))
                .unwrap()
                .update_channel,
            Channel::Beta
        );
        assert_eq!(
            with_setting(&s, "allowedHosts", json!([" panel.lan ", ""]))
                .unwrap()
                .allowed_hosts,
            vec!["panel.lan"]
        );
        for key in [
            "allowRemoteEdit",
            "autoRestart",
            "startAtLogin",
            "openStudioOnLaunch",
            "startServer",
            "closeToTray",
            "rememberBounds",
            "checkForUpdates",
            "autoDownload",
            "debug",
        ] {
            let flipped = !serde_json::to_value(&s).unwrap()[key].as_bool().unwrap();
            let next = with_setting(&s, key, json!(flipped)).unwrap();
            assert_eq!(serde_json::to_value(&next).unwrap()[key], flipped, "{key}");
        }
        for (key, value) in [
            ("port", json!(80)),
            ("port", json!(70000)),
            ("port", json!("3922")),
            ("zoom", json!(95)),
            ("listen", json!("wan")),
            ("allowedHosts", json!(["bad host"])),
            ("allowRemoteEdit", json!("yes")),
            ("debug", json!("yes")),
            ("agents", json!({})),
            ("version", json!(3)),
            ("closeWarningShown", json!(true)),
        ] {
            assert!(
                with_setting(&s, key, value.clone()).is_err(),
                "{key} = {value}"
            );
        }
    }

    /// The keys `set_setting` changes; the rest is the app's bookkeeping.
    const SETTABLE_KEYS: &[&str] = &[
        "listen",
        "port",
        "allowedHosts",
        "allowRemoteEdit",
        "autoRestart",
        "startAtLogin",
        "openStudioOnLaunch",
        "startServer",
        "closeToTray",
        "rememberBounds",
        "zoom",
        "studioRefresh",
        "releaseHiddenStudio",
        "reduceUnfocusedAnimation",
        "openStudioIn",
        "checkForUpdates",
        "updateChannel",
        "autoDownload",
        "debug",
    ];

    #[test]
    fn every_settable_key_is_accepted() {
        let s = Settings::default();
        let v = serde_json::to_value(&s).unwrap();
        for key in SETTABLE_KEYS {
            assert!(with_setting(&s, key, v[key].clone()).is_ok(), "{key}");
        }
    }

    #[test]
    fn connect_host_maps_wildcard_and_loopback() {
        assert_eq!(connect_host("127.0.0.1"), "127.0.0.1");
        assert_eq!(connect_host("0.0.0.0"), "127.0.0.1");
        assert_eq!(connect_host("::"), "127.0.0.1");
        assert_eq!(connect_host("192.168.1.20"), "192.168.1.20");
        assert_eq!(connect_host("fe80::1"), "[fe80::1]");
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = std::env::temp_dir().join(format!("ips-settings-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let s = Settings {
            port: 3942,
            listen: Listen::Lan,
            start_at_login: false,
            zoom: 125,
            ..Settings::default()
        };
        save(&dir, &s).unwrap();
        assert_eq!(load(&dir), s);
        std::fs::write(settings_file(&dir), "not json").unwrap();
        assert_eq!(load(&dir), Settings::default());
        assert!(dir.join("settings.invalid.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
