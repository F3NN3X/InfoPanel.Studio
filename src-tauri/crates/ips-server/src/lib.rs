// InfoPanel Studio's dashboard server, the native port of server.mjs (docs/server-contract.md is the spec,
// docs/server-native.md the plan). `bind` takes the port and prints the start line; `Bound::serve` answers until its
// shutdown future resolves. Every request passes the request guard, then goes to the first route that matches its raw
// pathname, in server.mjs's order; anything that is not /api/ is the static build.

pub mod canvases;
pub mod config;
pub mod config_guard;
pub mod config_settings;
pub mod control;
pub mod control_store;
pub mod debug;
pub mod env;
pub mod http;
pub mod js;
pub mod json;
pub mod locale;
pub mod request_guard;
pub mod security_headers;
pub mod sse;
pub mod static_files;
pub mod store;
pub mod studio_prefs;
pub mod supervisor;

use std::future::Future;
use std::net::{SocketAddr, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderValue, Method, Response, Version};
use serde_json::json;
use tokio::sync::watch;
use tower_http::catch_panic::CatchPanicLayer;

use crate::config::ConfigStore;
use crate::control_store::Control;
use crate::debug::Debug;
use crate::http::Req;
use crate::request_guard::{config_write_refusal, remote_edit_refusal, RequestGuard};
use crate::studio_prefs::StudioPrefs;

/// The health route's app id: older than the InfoPanel Studio name, and what the desktop app matches on.
pub const APP_ID: &str = "infopanel-dashboard";
const MAX_STUDIO_PREFS_BYTES: usize = 4 * 1024;

/// The routes server.mjs has that this server does not answer yet; each answers 501 until it is ported.
const PENDING: [&str; 8] = [
    "/api/alerts/history",
    "/api/extras",
    "/events/extras",
    "/api/integrations",
    "/api/agents/event",
    "/api/agents/statusline",
    "/api/image-proxy",
    "/api/font-proxy",
];
/// The pending route families: the path itself and everything under it.
const PENDING_FAMILIES: [&str; 4] = ["/api/assets", "/api/library", "/api/canvases", "/api/infopanel/installed"];

fn is_pending(path: &str) -> bool {
    PENDING.contains(&path)
        || PENDING_FAMILIES.iter().any(|route| path == *route || path.strip_prefix(route).is_some_and(|rest| rest.starts_with('/')))
}

/// What the server runs with: the same inputs as the Node server's environment.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// The listen address as given (HOST): an IP or a name; it also feeds the Host allowlist.
    pub host: String,
    /// 0: the OS picks.
    pub port: u16,
    pub allowed_hosts: Vec<String>,
    pub allow_remote_edit: bool,
    pub allow_remote_upload: bool,
    pub dist: PathBuf,
    pub data_dir: PathBuf,
    pub infopanel_dir: PathBuf,
    pub debug: bool,
    /// What GET /api/health reports.
    pub version: String,
}

impl ServerConfig {
    /// The config from the environment server.mjs reads, with its defaults. The build defaults to `./dist`.
    pub fn from_env() -> Result<Self, String> {
        let flag = |name: &str| std::env::var(name).is_ok_and(|v| v == "1");
        Ok(Self {
            host: env::non_empty("HOST").unwrap_or_else(|| "127.0.0.1".into()),
            port: env::parse_port(std::env::var("PORT").ok().as_deref())?,
            allowed_hosts: request_guard::parse_allowed_hosts(std::env::var("ALLOWED_HOSTS").ok().as_deref()),
            allow_remote_edit: flag("ALLOW_REMOTE_EDIT"),
            allow_remote_upload: flag("ALLOW_REMOTE_UPLOAD"),
            dist: env::non_empty("DASHBOARD_DIST").map_or_else(|| env::resolve("dist"), |d| env::resolve(&d)),
            data_dir: env::non_empty("DASHBOARD_DATA_DIR").map_or_else(env::default_data_dir, |d| env::resolve(&d)),
            infopanel_dir: env::infopanel_dir(),
            debug: flag("DASHBOARD_DEBUG"),
            version: env::version(),
        })
    }

    pub fn config_file(&self) -> PathBuf {
        self.data_dir.join("config.json")
    }
}

/// Why the server could not start. The messages carry the substrings the app looks for (`listen EADDRINUSE`,
/// `listen EACCES`), as Node's do.
#[derive(Debug)]
pub enum StartError {
    AddrInUse(String),
    Access(String),
    Other(String),
}

impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AddrInUse(at) => write!(f, "Error: listen EADDRINUSE: address already in use {at}"),
            Self::Access(at) => write!(f, "Error: listen EACCES: permission denied {at}"),
            Self::Other(message) => write!(f, "Error: {message}"),
        }
    }
}

impl std::error::Error for StartError {}

/// The shared state the handlers read.
pub struct App {
    pub cfg: ServerConfig,
    guard: RequestGuard,
    started: Instant,
    pub debug: Arc<Debug>,
    pub config: Arc<ConfigStore>,
    pub control: Arc<Control>,
    prefs: StudioPrefs,
    pub shutdown: watch::Receiver<bool>,
}

impl App {
    /// The 403 (JSON) for a config write from another machine while ALLOW_REMOTE_EDIT is off.
    pub fn refuse_remote_edit(&self, req: &Req) -> Option<Response<Body>> {
        let refusal = remote_edit_refusal(Some(&req.peer), self.cfg.allow_remote_edit)?;
        Some(http::json(refusal.status, &json!({ "error": refusal.message })))
    }
}

/// A server with its port taken, not yet answering.
pub struct Bound {
    listener: tokio::net::TcpListener,
    app: Arc<App>,
    stop: watch::Sender<bool>,
}

fn listen_socket(addr: SocketAddr) -> std::io::Result<std::net::TcpListener> {
    use socket2::{Domain, Socket, Type};
    let socket = Socket::new(Domain::for_address(addr), Type::STREAM, None)?;
    if addr.is_ipv6() {
        // `::` takes IPv4 too, as Node's listen does.
        socket.set_only_v6(false)?;
    }
    #[cfg(not(windows))]
    socket.set_reuse_address(true)?;
    socket.bind(&addr.into())?;
    socket.listen(511)?;
    socket.set_nonblocking(true)?;
    Ok(socket.into())
}

/// Takes the port, loads the data folder and prints the start line (stdout), as server.mjs does on listen.
pub async fn bind(cfg: ServerConfig) -> Result<Bound, StartError> {
    std::fs::create_dir_all(&cfg.data_dir).map_err(|e| StartError::Other(format!("{}: {e}", cfg.data_dir.display())))?;
    let config = ConfigStore::load(&cfg.config_file());
    let prefs = StudioPrefs::load(&cfg.data_dir.join("studio-prefs.json"));

    let at = format!("{}:{}", cfg.host, cfg.port);
    let addr = (cfg.host.as_str(), cfg.port)
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
        .ok_or_else(|| StartError::Other(format!("getaddrinfo ENOTFOUND {}", cfg.host)))?;
    let listener = listen_socket(addr)
        .and_then(tokio::net::TcpListener::from_std)
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AddrInUse => StartError::AddrInUse(at.clone()),
            std::io::ErrorKind::PermissionDenied => StartError::Access(at.clone()),
            _ => StartError::Other(format!("listen {e} {at}")),
        })?;
    let port = listener.local_addr().map_err(|e| StartError::Other(e.to_string()))?.port();

    let machine_name = sysinfo::System::host_name().unwrap_or_default();
    let guard = RequestGuard::new(&cfg.host, &cfg.allowed_hosts, &machine_name);
    let (stop, shutdown) = watch::channel(false);
    let debug = Debug::new(cfg.debug);
    debug.start_sampler(shutdown.clone());
    let control = Control::new(cfg.data_dir.join("control.json"), config::now_ms(), {
        let config = Arc::clone(&config);
        move || config.read()
    });
    // After every config save, as server.mjs's saveConfig does.
    config.on_saved({
        let control = Arc::clone(&control);
        move || control.config_changed()
    });
    control_store::start_tick(Arc::clone(&control), shutdown.clone());
    println!("InfoPanel Studio on http://{}:{port} (config: {})", cfg.host, cfg.config_file().display());
    if cfg.debug {
        println!("[debug] DASHBOARD_DEBUG=1: logging requests and SSE clients; stats at /api/debug/stats");
    }
    let app = App { cfg, guard, started: Instant::now(), debug, config, control, prefs, shutdown };
    Ok(Bound { listener, app: Arc::new(app), stop })
}

impl Bound {
    pub fn port(&self) -> u16 {
        self.listener.local_addr().map_or(0, |a| a.port())
    }

    /// Answers until `shutdown` resolves, then ends the event streams and lets open requests finish.
    pub async fn serve(self, shutdown: impl Future<Output = ()> + Send + 'static) {
        let router = axum::Router::new()
            .fallback(dispatch)
            .layer(CatchPanicLayer::custom(|_| {
                log::error!(target: "server", "a request handler panicked");
                http::text(500, "internal error")
            }))
            .with_state(Arc::clone(&self.app));
        let stop = self.stop;
        let signal = async move {
            shutdown.await;
            let _ = stop.send(true);
        };
        let service = router.into_make_service_with_connect_info::<SocketAddr>();
        if let Err(e) = axum::serve(self.listener, service).with_graceful_shutdown(signal).await {
            log::error!(target: "server", "server failed: {e}");
        }
    }
}

/// The peer address as Node prints it.
fn peer_of(addr: SocketAddr) -> String {
    addr.ip().to_string()
}

async fn dispatch(State(app): State<Arc<App>>, ConnectInfo(peer): ConnectInfo<SocketAddr>, request: Request) -> Response<Body> {
    let (parts, body) = request.into_parts();
    // Node refuses an HTTP/1.1 request without a Host before its handler runs.
    if parts.version == Version::HTTP_11 && !parts.headers.contains_key("host") {
        let mut response = Response::new(http::chunked(""));
        *response.status_mut() = axum::http::StatusCode::BAD_REQUEST;
        response.headers_mut().insert("Connection", HeaderValue::from_static("close"));
        return response;
    }
    let header = |name: &str| http::header(&parts.headers, name);
    if let Some(refusal) = app.guard.check(parts.method.as_str(), header("host").as_deref(), header("sec-fetch-site").as_deref(), header("origin").as_deref()) {
        let mut response = http::text(refusal.status, refusal.message);
        response.headers_mut().insert("Connection", HeaderValue::from_static("close"));
        return response;
    }
    let url = parts.uri.to_string();
    let (path, search) = match url::Url::parse("http://localhost").and_then(|base| base.join(&url)) {
        Ok(u) => (u.path().to_string(), u.query().map_or(String::new(), |q| format!("?{q}"))),
        Err(_) => ("/".into(), String::new()),
    };
    let method = parts.method.clone();
    let req = Req { method: parts.method, headers: parts.headers, peer: peer_of(peer), url: url.clone(), path, search, body };
    let path = req.path.clone();
    let response = match route(&app, req).await {
        Ok(response) => response,
        Err(e) => {
            log::error!(target: "server", "{method} {path} failed: {e}");
            http::text(500, "internal error")
        }
    };
    app.debug.log_request(method.as_str(), &url, response)
}

async fn route(app: &App, req: Req) -> Result<Response<Body>, String> {
    let io = |e: std::io::Error| e.to_string();
    match req.path.as_str() {
        "/api/health" => Ok(health(app, &req)),
        "/api/server/stats" => Ok(server_stats(app, &req)),
        "/api/debug/stats" => Ok(debug::handle_stats(app, &req)),
        "/api/config" => config::handle_config(app, req).await.map_err(io),
        "/api/config/settings" => config::handle_settings(app, req).await.map_err(io),
        "/api/studio-prefs" => studio_prefs(app, req).await.map_err(io),
        "/events/config" => Ok(config::handle_events(app)),
        "/events/control" => Ok(control_store::handle_events(app, &req)),
        p if p == "/api/control" || p.starts_with("/api/control/") => Ok(control_store::handle(app, req).await),
        p if is_pending(p) => Ok(http::text(501, "not ported to ips-server yet")),
        p if p.starts_with("/api/") => Ok(http::empty(404)),
        _ => static_files::serve(&app.cfg.dist, &req),
    }
}

/// GET /api/health → what is running here; the desktop app uses it to recognise its own server.
fn health(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    http::json(200, &json!({ "app": APP_ID, "version": app.cfg.version, "configVersion": app.config.version() }))
}

/// GET /api/server/stats → uptime and open SSE clients for the desktop app; this machine only.
fn server_stats(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    if !req.is_loopback() {
        return http::text(403, "server stats are served to this machine only");
    }
    let stats = json!({
        "uptimeSeconds": app.started.elapsed().as_secs_f64().round() as u64,
        "clients": app.debug.sse_clients_total(),
        "studios": app.debug.sse_clients("studio"),
    });
    http::json(200, &stats)
}

/// GET and PUT /api/studio-prefs: the studio's preferences that follow the user between the app window and a browser
/// studio. This machine only; a write takes the config write headers.
async fn studio_prefs(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if !req.is_loopback() {
        return Ok(http::text(403, "studio preferences are served to this machine only"));
    }
    if req.method == Method::GET {
        return Ok(http::json(200, &app.prefs.get()));
    }
    if req.method != Method::PUT {
        return Ok(http::empty(405));
    }
    if let Some(refusal) = config_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-config").as_deref()) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let patch = match req.read_body(MAX_STUDIO_PREFS_BYTES).await {
        Ok(body) if body.is_empty() => Some(json!({})),
        Ok(body) => json::parse(&body),
        Err(()) => return Ok(http::closing(http::text(400, "expected a JSON object"))),
    };
    let Some(patch) = patch else {
        return Ok(http::text(400, "expected a JSON object"));
    };
    Ok(match app.prefs.apply(&patch)? {
        Ok(prefs) => http::json(200, &prefs),
        Err(error) => http::text(400, error),
    })
}
