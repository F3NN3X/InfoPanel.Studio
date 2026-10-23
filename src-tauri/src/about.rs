// The settings page's About and Changelog: versions, the OS, file locations and the bundled
// CHANGELOG.md.

use crate::paths::{self, Paths};
use crate::settings::Channel;
use serde::Serialize;
use std::sync::OnceLock;

/// The day the app was built (build.rs), YYYY-MM-DD.
pub const BUILD_DATE: &str = env!("BUILD_DATE");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub settings_file: String,
    pub data_dir: String,
    pub logs_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub channel: Channel,
    pub build_date: &'static str,
    /// The bundled node's version, e.g. `v24.1.0`.
    pub node: Option<String>,
    /// The WebView2 runtime's version.
    pub webview: Option<String>,
    pub os: String,
    pub paths: AppPaths,
}

/// `node --version` of the bundled node, asked once per run.
fn node_version(paths: &Paths) -> Option<String> {
    static VERSION: OnceLock<Option<String>> = OnceLock::new();
    VERSION
        .get_or_init(|| {
            let out = crate::sidecar::hidden_command(paths::display(&paths.node_exe()))
                .arg("--version")
                .output()
                .ok()?;
            let text = String::from_utf8_lossy(&out.stdout).trim().to_owned();
            (out.status.success() && !text.is_empty()).then_some(text)
        })
        .clone()
}

/// `Windows 11 Pro (build 26300)`: the long OS name and the kernel build.
pub fn os_text(long: Option<String>, kernel: Option<String>) -> String {
    match (long, kernel) {
        (Some(l), Some(k)) => format!("{l} (build {k})"),
        (Some(l), None) => l,
        (None, Some(k)) => format!("build {k}"),
        (None, None) => std::env::consts::OS.to_owned(),
    }
}

pub fn info(paths: &Paths, version: &str, channel: Channel) -> AppInfo {
    AppInfo {
        version: version.into(),
        channel,
        build_date: BUILD_DATE,
        node: node_version(paths),
        webview: tauri::webview_version().ok(),
        os: os_text(
            sysinfo::System::long_os_version(),
            sysinfo::System::kernel_version(),
        ),
        paths: AppPaths {
            settings_file: paths::display(&crate::settings::settings_file(&paths.config_dir)),
            data_dir: paths::display(&paths.server_data_dir()),
            logs_dir: paths::display(&paths.log_dir),
        },
    }
}

/// The bundled CHANGELOG.md; a dev build without the bundle reads the repo's.
pub fn changelog(paths: &Paths) -> std::io::Result<String> {
    let bundled = std::fs::read_to_string(paths.changelog());
    #[cfg(debug_assertions)]
    if bundled.is_err() {
        let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../CHANGELOG.md");
        return std::fs::read_to_string(repo);
    }
    bundled
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_text_joins_name_and_build() {
        assert_eq!(
            os_text(Some("Windows 11 Pro".into()), Some("26300".into())),
            "Windows 11 Pro (build 26300)"
        );
        assert_eq!(os_text(Some("Windows 11".into()), None), "Windows 11");
        assert_eq!(os_text(None, Some("1".into())), "build 1");
    }

    #[test]
    fn build_date_is_a_day() {
        let parts: Vec<&str> = BUILD_DATE.split('-').collect();
        assert_eq!(parts.len(), 3, "{BUILD_DATE}");
        assert_eq!(parts[0].len(), 4);
        assert!(parts.iter().all(|p| p.parse::<u32>().is_ok()));
    }

    // A release build reads the bundled resource only, so this holds in debug builds.
    #[cfg(debug_assertions)]
    #[test]
    fn dev_builds_read_the_repo_changelog() {
        let paths = Paths {
            config_dir: "c".into(),
            log_dir: "l".into(),
            resource_dir: "does-not-exist".into(),
            data_dir: None,
        };
        let text = changelog(&paths).unwrap();
        assert!(text.contains("## ["));
    }
}
