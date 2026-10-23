// The routes over a real socket: a server on a free port with a temp data folder and build, and raw HTTP/1.1 requests,
// so the exact status, headers and bytes are what a client sees.

use std::path::{Path, PathBuf};
use std::time::Duration;

use ips_server::{bind, ServerConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

struct Server {
    port: u16,
    dir: tempfile::TempDir,
    stop: Option<oneshot::Sender<()>>,
    done: tokio::task::JoinHandle<()>,
}

impl Server {
    fn data(&self) -> PathBuf {
        self.dir.path().join("data")
    }

    async fn stop(mut self) {
        let _ = self.stop.take().unwrap().send(());
        tokio::time::timeout(Duration::from_secs(5), &mut self.done).await.expect("graceful stop").unwrap();
    }
}

fn config(dir: &Path) -> ServerConfig {
    ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        dist: dir.join("dist"),
        data_dir: dir.join("data"),
        infopanel_dir: dir.join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    }
}

async fn start_with(dir: tempfile::TempDir, cfg: ServerConfig) -> Server {
    let bound = bind(cfg).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, dir, stop: Some(stop), done }
}

async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    let dist = dir.path().join("dist");
    std::fs::create_dir_all(dist.join("assets")).unwrap();
    std::fs::write(dist.join("index.html"), "<p>index</p>").unwrap();
    std::fs::write(dist.join("a.txt"), "plain").unwrap();
    std::fs::write(dist.join("assets/app.JS"), "js").unwrap();
    std::fs::write(dist.join(".secret"), "no").unwrap();
    let cfg = config(dir.path());
    start_with(dir, cfg).await
}

struct Reply {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Reply {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }

    fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }
}

fn dechunk(mut raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(end) = raw.windows(2).position(|w| w == b"\r\n") {
        let size = usize::from_str_radix(std::str::from_utf8(&raw[..end]).unwrap().trim(), 16).unwrap();
        if size == 0 {
            break;
        }
        out.extend_from_slice(&raw[end + 2..end + 2 + size]);
        raw = &raw[end + 4 + size..];
    }
    out
}

/// Sends `method path` with `headers` (a Host is added unless given) and reads the whole answer.
async fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\n");
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("host")) {
        request.push_str(&format!("Host: 127.0.0.1:{port}\r\n"));
    }
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let mut lines = head.split("\r\n");
    let status = lines.next().unwrap().split(' ').nth(1).unwrap().parse().unwrap();
    let headers: Vec<(String, String)> =
        lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_string(), v.trim().to_string())).collect();
    let rest = &raw[split + 4..];
    let chunked = headers.iter().any(|(k, v)| k.eq_ignore_ascii_case("transfer-encoding") && v == "chunked");
    Reply { status, body: if chunked { dechunk(rest) } else { rest.to_vec() }, headers }
}

async fn get(port: u16, path: &str) -> Reply {
    send(port, "GET", path, &[], "").await
}

const JSON_WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Config", "1")];

async fn post_config(port: u16, body: &str, extra: &[(&str, &str)]) -> Reply {
    let headers: Vec<(&str, &str)> = JSON_WRITE.iter().copied().chain(extra.iter().copied()).collect();
    send(port, "POST", "/api/config", &headers, body).await
}

async fn patch_settings(port: u16, body: &str) -> Reply {
    send(port, "PATCH", "/api/config/settings", &JSON_WRITE, body).await
}

fn json(reply: &Reply) -> serde_json::Value {
    serde_json::from_slice(&reply.body).unwrap()
}

#[tokio::test]
async fn health_and_the_host_guard() {
    let s = start().await;
    let health = get(s.port, "/api/health").await;
    assert_eq!(health.status, 200);
    assert_eq!(health.text(), r#"{"app":"infopanel-dashboard","version":"9.9.9","configVersion":0}"#);
    assert_eq!(health.header("content-type"), Some("application/json; charset=utf-8"));
    assert_eq!(health.header("cache-control"), Some("no-store"));
    assert_eq!(send(s.port, "POST", "/api/health", &[], "").await.status, 405);
    assert_eq!(send(s.port, "HEAD", "/api/health", &[], "").await.status, 405);
    let rebound = send(s.port, "GET", "/api/health", &[("Host", "evil.example")], "").await;
    assert_eq!((rebound.status, rebound.text().as_str()), (421, "host not allowed"));
    assert_eq!(rebound.header("connection"), Some("close"));
    let cross = send(s.port, "POST", "/api/config", &[("Sec-Fetch-Site", "cross-site")], "").await;
    assert_eq!((cross.status, cross.text().as_str()), (403, "cross-site request refused"));
    assert_eq!(get(s.port, "/api/health/").await.status, 404);
    assert_eq!(get(s.port, "/api/nope").await.status, 404);
    assert_eq!(get(s.port, "/api/control").await.status, 501);
    assert_eq!(get(s.port, "/api/canvases/x").await.status, 501);
    s.stop().await;
}

#[tokio::test]
async fn stores_the_config_verbatim_behind_its_guards() {
    let s = start().await;
    assert_eq!(get(s.port, "/api/config").await.status, 404);
    let no_header = send(s.port, "POST", "/api/config", &[("Content-Type", "application/json")], "{}").await;
    assert_eq!((no_header.status, no_header.text().as_str()), (403, "missing X-Dashboard-Config header"));
    let text = send(s.port, "POST", "/api/config", &[("Content-Type", "text/plain"), ("X-Dashboard-Config", "1")], "{}").await;
    assert_eq!(text.status, 415);
    for bad in ["", "[]", "null", "{", "5"] {
        let r = post_config(s.port, bad, &[]).await;
        assert_eq!((r.status, r.text().as_str()), (400, "expected a config object"), "{bad}");
    }

    let body = "{ \"version\": 11,\n  \"n\": 1.0, \"2\": 1e21, \"profiles\": [] }";
    let saved = post_config(s.port, body, &[]).await;
    assert_eq!(saved.status, 200);
    let version = json(&saved)["version"].as_i64().unwrap();
    assert_eq!(saved.text(), format!(r#"{{"ok":true,"version":{version}}}"#));
    let read = get(s.port, "/api/config").await;
    assert_eq!(read.text(), body);
    assert!(read.header("x-settings-rev").unwrap().parse::<i64>().unwrap() > 0);
    assert_eq!(std::fs::read_to_string(s.data().join("config.json")).unwrap(), body);
    assert!(!s.data().join("config.json.tmp").exists());

    let older = post_config(s.port, r#"{"version":10}"#, &[]).await;
    assert_eq!((older.status, older.text().as_str()), (409, "a newer dashboard version saved this config; reload"));
    let health = json(&get(s.port, "/api/health").await);
    assert_eq!(health["configVersion"].as_i64(), Some(version));
    let again = json(&post_config(s.port, r#"{"version":11}"#, &[]).await)["version"].as_i64().unwrap();
    assert!(again > version);

    // Every canvasRef must name a file in the canvas store.
    let refs: Vec<String> = (0..7).map(|i| format!("cnv_{i:032x}")).collect();
    let canvases = s.data().join("canvases");
    std::fs::create_dir_all(&canvases).unwrap();
    std::fs::write(canvases.join(format!("{}.json", refs[0])), "{}").unwrap();
    let zones: Vec<String> = refs.iter().map(|r| format!(r#"{{"canvasRef":"{r}"}}"#)).collect();
    let config = format!(r#"{{"version":11,"profiles":[{{"pages":[{{"placements":[{}]}}]}}]}}"#, zones.join(","));
    let missing = post_config(s.port, &config, &[]).await;
    assert_eq!(missing.status, 422);
    assert_eq!(missing.text(), format!("canvas files missing from the store: {}", refs[1..6].join(", ")));
    let one = format!(r#"{{"version":11,"profiles":[{{"canvasRef":"{}"}}],"x":{{"canvasRef":"bad"}}}}"#, refs[0]);
    assert_eq!(post_config(s.port, &one, &[]).await.text(), "canvas files missing from the store: bad");
    let only = format!(r#"{{"version":11,"profiles":[{{"canvasRef":"{}"}}]}}"#, refs[0]);
    assert_eq!(post_config(s.port, &only, &[]).await.status, 200);
    // Not a config (no profiles array): nothing to check.
    assert_eq!(post_config(s.port, r#"{"version":11,"canvasRef":"bad"}"#, &[]).await.status, 200);

    let big = format!(r#"{{"version":11,"pad":"{}"}}"#, "x".repeat(5 * 1024 * 1024));
    assert_eq!(post_config(s.port, &big, &[]).await.status, 413);
    s.stop().await;
}

#[tokio::test]
async fn merges_settings_patches_and_feeds_them() {
    let s = start().await;
    assert_eq!(patch_settings(s.port, r#"{"general":{"maxFps":15}}"#).await.text(), "no config saved yet");
    let stored = r#"{"version":11,"general":{"font":"inter"},"profiles":[{"id":"desk","pages":[],"performance":{"maxFps":30}}],"z":1}"#;
    post_config(s.port, stored, &[]).await;
    let known: i64 = get(s.port, "/api/config").await.header("x-settings-rev").unwrap().parse().unwrap();

    assert_eq!(patch_settings(s.port, "").await.text(), "expected a settings patch");
    assert_eq!(patch_settings(s.port, r#"{"general":{"maxFps":24}}"#).await.text(), "not a valid general.maxFps");
    assert_eq!(patch_settings(s.port, r#"{"profiles":{"gone":{"performance":null}}}"#).await.status, 404);
    assert_eq!(send(s.port, "POST", "/api/config/settings", &JSON_WRITE, "{}").await.status, 405);

    let done = patch_settings(s.port, r#"{"general":{"maxFps":15},"profiles":{"desk":{"performance":null}}}"#).await;
    assert_eq!(done.status, 200);
    let result = json(&done);
    assert_eq!(result["settingsRev"].as_i64(), Some(known + 1));
    assert_eq!(done.text(), format!(r#"{{"ok":true,"version":{},"settingsRev":{}}}"#, result["version"], known + 1));
    assert_eq!(
        get(s.port, "/api/config").await.text(),
        r#"{"version":11,"profiles":[{"id":"desk","pages":[]}],"z":1,"general":{"font":"inter","maxFps":15}}"#
    );

    let feed = get(s.port, &format!("/api/config/settings?since={known}")).await;
    assert_eq!(
        feed.text(),
        format!(r#"{{"settingsRev":{},"patches":[{{"rev":{},"patch":{{"general":{{"maxFps":15}},"profiles":{{"desk":{{"performance":null}}}}}}}}]}}"#, known + 1, known + 1)
    );
    assert_eq!(json(&get(s.port, &format!("/api/config/settings?since={}", known + 1)).await)["patches"], serde_json::json!([]));
    for bad in ["", "?since=", "?since=abc", "?since=Infinity"] {
        assert_eq!(get(s.port, &format!("/api/config/settings{bad}")).await.text(), "expected ?since=<revision>");
    }

    // A push built before the patch names the older revision and gets it again; one naming none is saved as sent.
    post_config(s.port, r#"{"version":11,"general":{"maxFps":60},"profiles":[{"id":"desk"}]}"#, &[("X-Settings-Rev", &known.to_string())]).await;
    assert_eq!(get(s.port, "/api/config").await.text(), r#"{"version":11,"profiles":[{"id":"desk"}],"general":{"maxFps":15}}"#);
    post_config(s.port, r#"{"version":11,"general":{"maxFps":60}}"#, &[("X-Settings-Rev", "abc")]).await;
    assert_eq!(get(s.port, "/api/config").await.text(), r#"{"version":11,"general":{"maxFps":60}}"#);
    // An empty header is revision 0: every logged patch again. One that no longer applies (no screen desk) is
    // skipped, and the push is still saved re-serialised.
    post_config(s.port, r#"{"version":11, "general":{"maxFps":60}}"#, &[("X-Settings-Rev", "")]).await;
    assert_eq!(get(s.port, "/api/config").await.text(), r#"{"version":11,"general":{"maxFps":60}}"#);
    post_config(s.port, r#"{"version":11, "profiles":[{"id":"desk","performance":{}}]}"#, &[("X-Settings-Rev", " ")]).await;
    assert_eq!(get(s.port, "/api/config").await.text(), r#"{"version":11,"profiles":[{"id":"desk"}],"general":{"maxFps":15}}"#);

    // The log keeps the newest 50.
    for i in 0..55 {
        let fps = [5, 15, 30, 60, 0][i % 5];
        assert_eq!(patch_settings(s.port, &format!(r#"{{"general":{{"maxFps":{fps}}}}}"#)).await.status, 200);
    }
    let all = json(&get(s.port, "/api/config/settings?since=0").await);
    let patches = all["patches"].as_array().unwrap();
    assert_eq!(patches.len(), 50);
    assert_eq!(patches[49]["rev"], all["settingsRev"]);
    s.stop().await;
}

/// Reads from an open event stream until `n` events (`data:` lines) have arrived.
async fn events(stream: &mut TcpStream, seen: &mut String, n: usize) {
    let mut buf = [0u8; 4096];
    while seen.matches("data: ").count() < n {
        let read = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf)).await.unwrap().unwrap();
        assert!(read > 0, "stream closed: {seen}");
        seen.push_str(&String::from_utf8_lossy(&buf[..read]));
    }
}

#[tokio::test]
async fn streams_config_events_and_counts_the_clients() {
    let s = start().await;
    let rev: i64 = json(&get(s.port, "/api/config/settings?since=0").await)["settingsRev"].as_i64().unwrap();
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream.write_all(format!("GET /events/config HTTP/1.1\r\nHost: localhost:{}\r\n\r\n", s.port).as_bytes()).await.unwrap();
    let mut seen = String::new();
    events(&mut stream, &mut seen, 1).await;
    assert!(seen.starts_with("HTTP/1.1 200"), "{seen}");
    assert!(seen.to_ascii_lowercase().contains("content-type: text/event-stream\r\n"));
    assert!(seen.contains(&format!("data: {{\"version\":0,\"settingsRev\":{rev}}}\n\n")), "{seen}");

    let stats = get(s.port, "/api/server/stats").await;
    let body = json(&stats);
    assert_eq!((body["clients"].as_i64(), body["studios"].as_i64()), (Some(1), Some(0)));
    assert!(stats.text().starts_with(r#"{"uptimeSeconds":"#));
    assert_eq!(send(s.port, "POST", "/api/server/stats", &[], "").await.status, 405);

    let version = json(&post_config(s.port, r#"{"version":1}"#, &[]).await)["version"].as_i64().unwrap();
    events(&mut stream, &mut seen, 2).await;
    assert!(seen.contains(&format!("data: {{\"version\":{version},\"settingsRev\":{rev}}}\n\n")), "{seen}");
    drop(stream);
    for _ in 0..100 {
        if json(&get(s.port, "/api/server/stats").await)["clients"] == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(json(&get(s.port, "/api/server/stats").await)["clients"], 0);

    // A stream still open ends when the server stops.
    let mut open = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    open.write_all(format!("POST /events/config HTTP/1.1\r\nHost: localhost:{}\r\nContent-Length: 0\r\n\r\n", s.port).as_bytes()).await.unwrap();
    let mut seen = String::new();
    events(&mut open, &mut seen, 1).await;
    s.stop().await;
}

#[tokio::test]
async fn keeps_the_studio_prefs_in_their_own_file() {
    let s = start().await;
    let put = |body: &'static str| send(s.port, "PUT", "/api/studio-prefs", &JSON_WRITE, body);
    assert_eq!(get(s.port, "/api/studio-prefs").await.text(), "{}");
    assert_eq!(put(r#"{"studio.previewData":"paused"}"#).await.text(), "studio.previewData takes live, frozen, frozenWhenUnfocused");
    assert_eq!(put(r#"{"studio.other":"x"}"#).await.text(), "unknown preference studio.other");
    assert_eq!(put("nope").await.text(), "expected a JSON object");
    assert_eq!(put("[]").await.text(), "expected a JSON object");
    assert_eq!(send(s.port, "POST", "/api/studio-prefs", &JSON_WRITE, "{}").await.status, 405);
    assert_eq!(put("").await.text(), "{}");
    assert_eq!(std::fs::read_to_string(s.data().join("studio-prefs.json")).unwrap(), "{}");
    assert_eq!(put(r#"{"studio.previewData":"frozen"}"#).await.text(), r#"{"studio.previewData":"frozen"}"#);
    assert_eq!(std::fs::read_to_string(s.data().join("studio-prefs.json")).unwrap(), r#"{"studio.previewData":"frozen"}"#);
    assert_eq!(get(s.port, "/api/studio-prefs").await.text(), r#"{"studio.previewData":"frozen"}"#);
    s.stop().await;
}

#[tokio::test]
async fn serves_the_build_with_the_static_rules() {
    let s = start().await;
    let index = get(s.port, "/").await;
    assert_eq!((index.status, index.text().as_str()), (200, "<p>index</p>"));
    assert_eq!(index.header("content-type"), Some("text/html; charset=utf-8"));
    assert_eq!(index.header("cache-control"), Some("no-store"));
    assert_eq!(index.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(index.header("referrer-policy"), Some("strict-origin-when-cross-origin"));
    assert!(index.header("content-length").is_none());
    assert!(!index.header("content-security-policy").unwrap().contains("frame-ancestors"));
    assert!(get(s.port, "/x/y?studio").await.header("content-security-policy").unwrap().ends_with("; frame-ancestors 'self'"));

    let txt = get(s.port, "/a.txt").await;
    assert_eq!((txt.text().as_str(), txt.header("content-type")), ("plain", Some("text/plain; charset=utf-8")));
    assert_eq!((txt.header("cache-control"), txt.header("referrer-policy")), (Some("no-cache"), Some("no-referrer")));
    assert!(txt.header("content-security-policy").is_none());
    assert_eq!(get(s.port, "/assets/app.JS").await.header("content-type"), Some("text/javascript; charset=utf-8"));

    for fallback in ["/missing.js", "/assets", "/assets/", "/%61.txt/..", "/x%5c..%5c..%5ca.txt"] {
        let r = get(s.port, fallback).await;
        assert_eq!((r.status, r.text().as_str()), (200, "<p>index</p>"), "{fallback}");
    }
    assert_eq!(get(s.port, "/%61.txt").await.text(), "plain");
    if cfg!(windows) {
        // A backslash separates there, after the dot-segment check, and a trailing separator is dropped.
        assert_eq!(get(s.port, "/a.txt/").await.text(), "plain");
        assert_eq!(get(s.port, "/x%5c..%5ca.txt").await.text(), "plain");
    }
    for hidden in ["/.secret", "/assets/.x", "/%2esecret", "/a/..%2F.secret", "/..%5c..%5ca.txt"] {
        assert_eq!(get(s.port, hidden).await.status, 404, "{hidden}");
    }
    let malformed = get(s.port, "/%zz").await;
    assert_eq!((malformed.status, malformed.text().as_str()), (500, "internal error"));
    assert_eq!(get(s.port, "/%c3%28").await.status, 500);

    let head = send(s.port, "HEAD", "/a.txt", &[], "").await;
    assert_eq!((head.status, head.body.len()), (200, 0));
    assert_eq!(send(s.port, "POST", "/", &[], "").await.status, 405);
    assert_eq!(send(s.port, "OPTIONS", "/", &[], "").await.status, 405);
    s.stop().await;

    let dir = tempfile::tempdir().unwrap();
    let cfg = config(dir.path());
    let empty = start_with(dir, cfg).await;
    let none = get(empty.port, "/").await;
    assert_eq!((none.status, none.text().as_str()), (503, "No build found. Run `npm run build` first."));
    empty.stop().await;
}

#[tokio::test]
async fn reads_the_config_version_from_the_file_and_names_a_taken_port() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("data")).unwrap();
    std::fs::write(dir.path().join("data/config.json"), "{}").unwrap();
    let mtime = std::fs::metadata(dir.path().join("data/config.json")).unwrap().modified().unwrap();
    let ms = mtime.duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut cfg = config(dir.path());
    let s = start_with(dir, cfg.clone()).await;
    assert_eq!(json(&get(s.port, "/api/health").await)["configVersion"].as_i64(), Some(ms));

    cfg.port = s.port;
    let taken = bind(cfg).await.err().expect("the port is taken").to_string();
    assert!(taken.contains("listen EADDRINUSE"), "{taken}");
    s.stop().await;
}
