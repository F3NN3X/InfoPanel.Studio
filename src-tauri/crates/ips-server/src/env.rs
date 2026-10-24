// The environment server.mjs and server/env.mjs read, with their defaults and parsing.

use std::path::{Path, PathBuf};

use crate::js;

/// The package.json beside server.mjs, whose version GET /api/health reports.
const PACKAGE_JSON: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../package.json"));

/// The `version` of a package.json's text, or "0.0.0" when it has none.
pub fn read_version(package_json: &str) -> String {
    crate::json::parse(package_json)
        .and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from))
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "0.0.0".into())
}

/// The app's version (package.json's).
pub fn version() -> String {
    read_version(PACKAGE_JSON)
}

/// An env var, `None` when unset or empty (JavaScript's falsy `process.env.X`).
pub fn non_empty(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

/// `path.resolve(value)`.
pub fn resolve(value: &str) -> PathBuf {
    std::path::absolute(value).unwrap_or_else(|_| PathBuf::from(value))
}

/// PORT: 3922 when unset or empty, else `Number(value)`, which must be a port (0 picks a free one).
pub fn parse_port(value: Option<&str>) -> Result<u16, String> {
    let Some(value) = value.filter(|v| !v.is_empty()) else {
        return Ok(3922);
    };
    let n = js::string_to_number(value);
    if n.fract() == 0.0 && (0.0..65536.0).contains(&n) {
        return Ok(n as u16);
    }
    Err(format!(
        "RangeError [ERR_SOCKET_BAD_PORT]: options.port should be >= 0 and < 65536. Received type number ({}).",
        js::number_to_string(n)
    ))
}

/// The default data folder: `<LOCALAPPDATA or $HOME/.local/share>/InfoPanel/Dashboard`.
pub fn default_data_dir() -> PathBuf {
    let local = non_empty("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(&non_empty("HOME").unwrap_or_else(|| ".".into())).join(".local").join("share"));
    local.join("InfoPanel").join("Dashboard")
}

/// INFOPANEL_DATA_DIR as it is, else `<LOCALAPPDATA>/InfoPanel` (relative when LOCALAPPDATA is unset).
pub fn infopanel_dir() -> PathBuf {
    non_empty("INFOPANEL_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(&non_empty("LOCALAPPDATA").unwrap_or_default()).join("InfoPanel"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_port_as_node_does() {
        assert_eq!(parse_port(None), Ok(3922));
        assert_eq!(parse_port(Some("")), Ok(3922));
        assert_eq!(parse_port(Some("0")), Ok(0));
        assert_eq!(parse_port(Some(" 0x10 ")), Ok(16));
        assert!(parse_port(Some("abc")).unwrap_err().contains("Received type number (NaN)"));
        assert!(parse_port(Some("65536")).is_err());
        assert!(parse_port(Some("1.5")).is_err());
    }

    #[test]
    fn reads_the_version_or_falls_back() {
        assert_eq!(read_version(r#"{"version":"1.2.3"}"#), "1.2.3");
        assert_eq!(read_version(r#"{"version":""}"#), "0.0.0");
        assert_eq!(read_version("nope"), "0.0.0");
        assert!(!version().is_empty());
    }
}
