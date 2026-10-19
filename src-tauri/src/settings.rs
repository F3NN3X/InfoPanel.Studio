// App settings (settings.json): defaults that match the plain server, validation, and loading
// that survives older or hand-edited files.

use serde::{Deserialize, Deserializer, Serialize};
use std::net::IpAddr;
use std::path::{Path, PathBuf};

/// Current settings file layout; bump with a migration in `load_from_str`.
pub const SETTINGS_VERSION: u32 = 1;

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 3922;
pub const MIN_PORT: u16 = 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub host: String,
    pub port: u16,
    #[serde(deserialize_with = "list_or_csv")]
    pub allowed_hosts: Vec<String>,
    pub start_at_login: bool,
    pub open_studio_on_launch: bool,
    pub close_to_tray: bool,
    /// Look for a new version shortly after the app starts.
    pub check_for_updates: bool,
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
            host: DEFAULT_HOST.into(),
            port: DEFAULT_PORT,
            allowed_hosts: Vec::new(),
            start_at_login: true,
            open_studio_on_launch: true,
            close_to_tray: true,
            check_for_updates: true,
            agents: AgentSettings::default(),
            debug: false,
            close_warning_shown: false,
        }
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

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FieldError {
    pub field: &'static str,
    pub message: String,
}

pub fn validate_port(port: u16) -> Result<(), String> {
    if port < MIN_PORT {
        return Err(format!("Use a port from {MIN_PORT} to 65535."));
    }
    Ok(())
}

pub fn validate_host(host: &str) -> Result<(), String> {
    host.parse::<IpAddr>()
        .map(|_| ())
        .map_err(|_| "Pick 127.0.0.1, 0.0.0.0 or one of this computer's addresses.".into())
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

pub fn validate(s: &Settings) -> Vec<FieldError> {
    let mut errors = Vec::new();
    if let Err(message) = validate_host(&s.host) {
        errors.push(FieldError {
            field: "host",
            message,
        });
    }
    if let Err(message) = validate_port(s.port) {
        errors.push(FieldError {
            field: "port",
            message,
        });
    }
    if let Some(message) = s
        .allowed_hosts
        .iter()
        .find_map(|h| validate_allowed_host(h).err())
    {
        errors.push(FieldError {
            field: "allowedHosts",
            message,
        });
    }
    errors
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
pub fn server_origin(s: &Settings) -> String {
    format!("http://{}:{}", connect_host(&s.host), s.port)
}

/// Settings from file text: unknown keys dropped, missing ones defaulted, invalid values reset.
pub fn load_from_str(text: &str) -> Result<Settings, serde_json::Error> {
    let mut s: Settings = serde_json::from_str(text)?;
    // Version 0 (no `version` key) had the same fields; nothing to move yet.
    s.version = SETTINGS_VERSION;
    if validate_host(&s.host).is_err() {
        s.host = DEFAULT_HOST.into();
    }
    if validate_port(s.port).is_err() {
        s.port = DEFAULT_PORT;
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

    #[test]
    fn defaults_match_the_plain_server() {
        let s = Settings::default();
        assert_eq!(s.host, "127.0.0.1");
        assert_eq!(s.port, 3922);
        assert!(s.allowed_hosts.is_empty());
        assert!(s.start_at_login);
        assert!(s.open_studio_on_launch);
        assert!(s.close_to_tray);
        assert!(s.check_for_updates);
        assert!(!s.agents.enabled);
        assert!(!s.debug);
    }

    #[test]
    fn serializes_camel_case() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(v["startAtLogin"], true);
        assert_eq!(v["allowedHosts"], serde_json::json!([]));
        assert_eq!(v["agents"]["enabled"], false);
    }

    #[test]
    fn missing_keys_take_defaults() {
        let s = load_from_str(r#"{ "port": 3942 }"#).unwrap();
        assert_eq!(s.port, 3942);
        assert_eq!(s.host, "127.0.0.1");
        assert!(s.start_at_login);
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
            r#"{ "host": "nope", "port": 80, "allowedHosts": ["ok.lan", "bad host"] }"#,
        )
        .unwrap();
        assert_eq!(s.host, DEFAULT_HOST);
        assert_eq!(s.port, DEFAULT_PORT);
        assert_eq!(s.allowed_hosts, vec!["ok.lan"]);
    }

    #[test]
    fn broken_json_is_an_error() {
        assert!(load_from_str("{ port: ").is_err());
    }

    #[test]
    fn port_validation() {
        assert!(validate_port(1023).is_err());
        assert!(validate_port(1024).is_ok());
        assert!(validate_port(65535).is_ok());
    }

    #[test]
    fn validate_reports_each_field() {
        let s = Settings {
            host: "x".into(),
            port: 10,
            allowed_hosts: vec!["a b".into()],
            ..Settings::default()
        };
        let fields: Vec<_> = validate(&s).iter().map(|e| e.field).collect();
        assert_eq!(fields, vec!["host", "port", "allowedHosts"]);
        assert!(validate(&Settings::default()).is_empty());
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
            start_at_login: false,
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
