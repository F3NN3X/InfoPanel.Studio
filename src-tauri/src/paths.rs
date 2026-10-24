// Where the app keeps its settings and logs, and where the installed resources live.

use std::path::{Path, PathBuf};

pub const IDENTIFIER: &str = "dev.f3nn3x.infopanel-studio";

#[derive(Debug, Clone)]
pub struct Paths {
    /// settings.json and the agents marker.
    pub config_dir: PathBuf,
    /// app.log, server.log, metrics.csv.
    pub log_dir: PathBuf,
    /// The installed resources: app/ (the built web app in dist/) and ips-agent.exe.
    pub resource_dir: PathBuf,
    /// The server's data folder for test runs (INFOPANEL_STUDIO_DATA_DIR); None = server default.
    pub data_dir: Option<PathBuf>,
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// The WebView2 user data folder for test runs: `EBWebView` under INFOPANEL_STUDIO_CONFIG_DIR when that is
/// set, so a test run never shares the installed app's profile (or its running browser process, which would
/// ignore this run's browser arguments). None = WebView2's default next to the app's local data.
pub fn webview_data_dir() -> Option<PathBuf> {
    env_path("INFOPANEL_STUDIO_CONFIG_DIR").map(|dir| dir.join("EBWebView"))
}

impl Paths {
    /// `%APPDATA%\<id>` for settings and `%LOCALAPPDATA%\<id>\logs` for logs, both under
    /// INFOPANEL_STUDIO_CONFIG_DIR when that is set.
    pub fn from_env(resource_dir: PathBuf) -> Self {
        let (config_dir, log_dir) = match env_path("INFOPANEL_STUDIO_CONFIG_DIR") {
            Some(dir) => (dir.clone(), dir.join("logs")),
            None => {
                let roaming = env_path("APPDATA").unwrap_or_else(std::env::temp_dir);
                let local = env_path("LOCALAPPDATA").unwrap_or_else(std::env::temp_dir);
                (
                    roaming.join(IDENTIFIER),
                    local.join(IDENTIFIER).join("logs"),
                )
            }
        };
        Self {
            config_dir,
            log_dir,
            resource_dir,
            data_dir: env_path("INFOPANEL_STUDIO_DATA_DIR"),
        }
    }

    pub fn app_dir(&self) -> PathBuf {
        self.resource_dir.join("app")
    }

    pub fn dist_dir(&self) -> PathBuf {
        self.app_dir().join("dist")
    }

    /// The hook and statusline forwarder the agents run.
    pub fn agent_exe(&self) -> PathBuf {
        self.resource_dir.join("ips-agent.exe")
    }

    /// Present while the agent hooks are installed; the uninstaller only removes hooks then.
    pub fn agents_marker(&self) -> PathBuf {
        self.config_dir.join("agents-installed")
    }

    pub fn changelog(&self) -> PathBuf {
        self.resource_dir.join("CHANGELOG.md")
    }

    /// The server's data folder (dashboards, themes, assets): DASHBOARD_DATA_DIR as the app passes
    /// it, else the default `%LOCALAPPDATA%\InfoPanel\Dashboard`.
    pub fn server_data_dir(&self) -> PathBuf {
        self.data_dir.clone().unwrap_or_else(|| {
            env_path("LOCALAPPDATA")
                .unwrap_or_else(std::env::temp_dir)
                .join("InfoPanel")
                .join("Dashboard")
        })
    }

    /// The folders (and the settings file) the settings page may show in Explorer.
    pub fn revealable_roots(&self) -> Vec<PathBuf> {
        vec![
            self.config_dir.clone(),
            self.log_dir.clone(),
            self.server_data_dir(),
        ]
    }
}

/// True when `path` exists inside one of `roots` (or is one), after resolving `..` and links.
pub fn is_inside(path: &Path, roots: &[PathBuf]) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    roots
        .iter()
        .filter_map(|r| r.canonicalize().ok())
        .any(|root| path.starts_with(root))
}

/// A path as Windows tools want it: without the `\\?\` prefix Tauri's resource dir can carry.
pub fn display(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_strips_the_verbatim_prefix() {
        assert_eq!(
            display(Path::new(r"\\?\C:\Apps\node.exe")),
            r"C:\Apps\node.exe"
        );
        assert_eq!(display(Path::new(r"C:\x")), r"C:\x");
    }

    #[test]
    fn only_paths_inside_the_roots_are_revealable() {
        let base = std::env::temp_dir().join(format!("ips-reveal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let root = base.join("logs");
        let other = base.join("other");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(root.join("app.log"), "").unwrap();
        std::fs::write(other.join("x.txt"), "").unwrap();
        let roots = vec![root.clone()];
        assert!(is_inside(&root.join("app.log"), &roots));
        assert!(is_inside(&root, &roots));
        assert!(!is_inside(&other.join("x.txt"), &roots));
        assert!(!is_inside(
            &root.join("..").join("other").join("x.txt"),
            &roots
        ));
        assert!(!is_inside(&root.join("missing.log"), &roots));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn resource_layout() {
        let p = Paths {
            config_dir: "c".into(),
            log_dir: "l".into(),
            resource_dir: PathBuf::from("r"),
            data_dir: None,
        };
        assert_eq!(p.dist_dir(), Path::new("r/app/dist"));
        assert_eq!(p.agent_exe(), Path::new("r/ips-agent.exe"));
        assert_eq!(p.changelog(), Path::new("r/CHANGELOG.md"));
        let test_run = Paths {
            data_dir: Some("d".into()),
            ..p
        };
        assert_eq!(test_run.server_data_dir(), Path::new("d"));
    }
}
