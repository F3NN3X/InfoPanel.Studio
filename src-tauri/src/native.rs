// ips-server inside the app: its config from the settings and paths, served on Tauri's runtime until a graceful stop.

use crate::paths::{self, Paths};
use crate::settings::Settings;
use crate::state::ErrorCode;
use ips_server::{env, request_guard, ServerConfig, StartError};
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::time::Duration;
use tokio::sync::oneshot;

/// How long a stop waits for open requests before the server is dropped.
pub const STOP_TIMEOUT: Duration = Duration::from_secs(5);

/// The settings as ips-server's config, with the app's version for GET /api/health.
pub fn server_config(s: &Settings, paths: &Paths, debug: bool, version: &str) -> ServerConfig {
    ServerConfig {
        host: s.host().into(),
        port: s.port,
        allowed_hosts: request_guard::parse_allowed_hosts(Some(&s.allowed_hosts.join(","))),
        // Uploads, Library and canvas saves have their own gate; "editing" means all of them.
        allow_remote_edit: s.allow_remote_edit,
        allow_remote_upload: s.allow_remote_edit,
        dist: env::resolve(&paths::display(&paths.dist_dir())),
        data_dir: paths
            .data_dir
            .as_ref()
            .map_or_else(env::default_data_dir, |dir| {
                env::resolve(&paths::display(dir))
            }),
        infopanel_dir: env::infopanel_dir(),
        debug,
        version: version.into(),
    }
}

/// The `ErrorCode` of a bind failure; None for anything that is not the port.
pub fn error_code(e: &StartError) -> Option<ErrorCode> {
    match e {
        StartError::AddrInUse(_) => Some(ErrorCode::AddrInUse),
        StartError::Access(_) => Some(ErrorCode::Access),
        StartError::Other(_) => None,
    }
}

/// The line the server logs once it listens, for server.log.
pub fn start_line(cfg: &ServerConfig, port: u16) -> String {
    format!(
        "InfoPanel Studio on http://{}:{port} (config: {})",
        cfg.host,
        cfg.config_file().display()
    )
}

/// A running ips-server. Dropping it stops the server too, without waiting.
pub struct Native {
    pub port: u16,
    stop: Option<oneshot::Sender<()>>,
    /// Sent when `serve` returns; dropped unsent when the task panicked.
    done: mpsc::Receiver<()>,
    task: tauri::async_runtime::JoinHandle<()>,
}

/// Binds on Tauri's runtime and serves until `Native::stop`. Blocks until the port is taken or the bind failed, so
/// call it off the runtime's threads. `home` is where the agents' files are read (None: the user's home).
pub fn start(cfg: ServerConfig, home: Option<PathBuf>) -> Result<Native, StartError> {
    let (bound_tx, bound_rx) = mpsc::channel();
    let (done_tx, done) = mpsc::channel();
    let (stop, stopped) = oneshot::channel::<()>();
    let task = tauri::async_runtime::spawn(async move {
        let bound = match home {
            Some(home) => ips_server::bind_with_home(cfg, home).await,
            None => ips_server::bind(cfg).await,
        };
        let bound = match bound {
            Ok(bound) => bound,
            Err(e) => {
                let _ = bound_tx.send(Err(e));
                return;
            }
        };
        let _ = bound_tx.send(Ok(bound.port()));
        bound
            .serve(async move {
                let _ = stopped.await;
            })
            .await;
        let _ = done_tx.send(());
    });
    let port = bound_rx
        .recv()
        .map_err(|_| StartError::Other("the server task ended while starting".into()))??;
    Ok(Native {
        port,
        stop: Some(stop),
        done,
        task,
    })
}

impl Native {
    /// The server ended without being asked to (it failed or panicked).
    pub fn ended(&self) -> bool {
        !matches!(self.done.try_recv(), Err(TryRecvError::Empty))
    }

    /// Stops gracefully: the event streams end and open requests finish, for up to `STOP_TIMEOUT`; after that the
    /// server is dropped. Either way the port is free when this returns. Blocks.
    pub fn stop(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if self.done.recv_timeout(STOP_TIMEOUT) == Err(RecvTimeoutError::Timeout) {
            log::warn!(
                "the server did not stop within {} s; dropping it",
                STOP_TIMEOUT.as_secs()
            );
            self.task.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Listen;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ips-native-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn paths(root: &std::path::Path) -> Paths {
        Paths {
            config_dir: root.join("config"),
            log_dir: root.join("logs"),
            resource_dir: root.join("resources"),
            data_dir: Some(root.join("data")),
        }
    }

    #[test]
    fn config_carries_the_settings() {
        let root = scratch("config");
        let s = Settings {
            listen: Listen::Lan,
            port: 3942,
            allowed_hosts: vec!["Panel.lan".into(), "kiosk".into()],
            allow_remote_edit: true,
            ..Settings::default()
        };
        let cfg = server_config(&s, &paths(&root), true, "9.9.9");
        assert_eq!(cfg.host, "0.0.0.0");
        assert_eq!(cfg.port, 3942);
        assert_eq!(
            cfg.allowed_hosts,
            request_guard::parse_allowed_hosts(Some("Panel.lan,kiosk"))
        );
        assert!(cfg.allow_remote_edit && cfg.allow_remote_upload && cfg.debug);
        assert_eq!(cfg.dist, root.join("resources").join("app").join("dist"));
        assert_eq!(cfg.data_dir, root.join("data"));
        assert_eq!(cfg.version, "9.9.9");
        let off = server_config(&Settings::default(), &paths(&root), false, "9.9.9");
        assert!(!off.allow_remote_edit && !off.allow_remote_upload && !off.debug);
        assert_eq!(off.host, "127.0.0.1");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn bind_failures_map_to_codes() {
        assert_eq!(
            error_code(&StartError::AddrInUse("127.0.0.1:3922".into())),
            Some(ErrorCode::AddrInUse)
        );
        assert_eq!(
            error_code(&StartError::Access("0.0.0.0:80".into())),
            Some(ErrorCode::Access)
        );
        assert_eq!(error_code(&StartError::Other("x".into())), None);
    }

    fn health(port: u16) -> serde_json::Value {
        let r = crate::http::get("127.0.0.1", port, "/api/health", Duration::from_secs(2))
            .expect("health answers");
        assert_eq!(r.status, 200);
        serde_json::from_str(&r.body).unwrap()
    }

    /// The app's start, port-in-use, restart on a new port and stop, against a scratch data folder.
    #[test]
    fn starts_restarts_and_stops_in_process() {
        let root = scratch("run");
        let home = root.join("home");
        let held = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let taken = held.local_addr().unwrap().port();
        let s = Settings {
            port: taken,
            ..Settings::default()
        };
        let cfg = server_config(&s, &paths(&root), false, "9.9.9");
        let Err(e) = start(cfg, Some(home.clone())) else {
            panic!("bound a port in use");
        };
        assert_eq!(error_code(&e), Some(ErrorCode::AddrInUse));
        assert!(e.to_string().contains("listen EADDRINUSE"), "{e}");
        drop(held);

        let first = crate::control::find_free_port("127.0.0.1", 20000).unwrap();
        let cfg = server_config(
            &Settings {
                port: first,
                ..s.clone()
            },
            &paths(&root),
            false,
            "9.9.9",
        );
        assert_eq!(
            start_line(&cfg, first),
            format!(
                "InfoPanel Studio on http://127.0.0.1:{first} (config: {})",
                root.join("data").join("config.json").display()
            )
        );
        let server = start(cfg, Some(home.clone())).expect("starts");
        assert_eq!(server.port, first);
        let body = health(first);
        assert_eq!(body["app"], crate::probe::DASHBOARD_APP);
        assert_eq!(body["version"], "9.9.9");
        assert!(!server.ended());

        // A restart with a new port, as a saved port change does.
        server.stop();
        assert!(
            crate::probe::is_port_free("127.0.0.1", first),
            "port {first} still held"
        );
        let second = crate::control::find_free_port("127.0.0.1", first + 1).unwrap();
        let cfg = server_config(
            &Settings { port: second, ..s },
            &paths(&root),
            false,
            "9.9.9",
        );
        let server = start(cfg, Some(home)).expect("restarts");
        assert_eq!(health(second)["app"], crate::probe::DASHBOARD_APP);
        server.stop();
        assert!(crate::probe::is_port_free("127.0.0.1", second));
        let _ = std::fs::remove_dir_all(&root);
    }
}
