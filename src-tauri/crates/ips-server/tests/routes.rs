// The routes over a real socket: a server on a free port with a temp data folder and build, and raw HTTP/1.1 requests,
// so the exact status, headers and bytes are what a client sees.

use std::path::{Path, PathBuf};
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
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
        tokio::time::timeout(Duration::from_secs(5), &mut self.done)
            .await
            .expect("graceful stop")
            .unwrap();
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
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server {
        port,
        dir,
        stop: Some(stop),
        done,
    }
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
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }
}

fn dechunk(mut raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(end) = raw.windows(2).position(|w| w == b"\r\n") {
        let size =
            usize::from_str_radix(std::str::from_utf8(&raw[..end]).unwrap().trim(), 16).unwrap();
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
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw))
        .await
        .unwrap()
        .unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let mut lines = head.split("\r\n");
    let status = lines
        .next()
        .unwrap()
        .split(' ')
        .nth(1)
        .unwrap()
        .parse()
        .unwrap();
    let headers: Vec<(String, String)> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .collect();
    let rest = &raw[split + 4..];
    let chunked = headers
        .iter()
        .any(|(k, v)| k.eq_ignore_ascii_case("transfer-encoding") && v == "chunked");
    Reply {
        status,
        body: if chunked {
            dechunk(rest)
        } else {
            rest.to_vec()
        },
        headers,
    }
}

async fn get(port: u16, path: &str) -> Reply {
    send(port, "GET", path, &[], "").await
}

const JSON_WRITE: [(&str, &str); 2] = [
    ("Content-Type", "application/json"),
    ("X-Dashboard-Config", "1"),
];

async fn post_config(port: u16, body: &str, extra: &[(&str, &str)]) -> Reply {
    let headers: Vec<(&str, &str)> = JSON_WRITE
        .iter()
        .copied()
        .chain(extra.iter().copied())
        .collect();
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
    assert_eq!(
        health.text(),
        r#"{"app":"infopanel-dashboard","version":"9.9.9","configVersion":0}"#
    );
    assert_eq!(
        health.header("content-type"),
        Some("application/json; charset=utf-8")
    );
    assert_eq!(health.header("cache-control"), Some("no-store"));
    assert_eq!(
        send(s.port, "POST", "/api/health", &[], "").await.status,
        405
    );
    assert_eq!(
        send(s.port, "HEAD", "/api/health", &[], "").await.status,
        405
    );
    let rebound = send(
        s.port,
        "GET",
        "/api/health",
        &[("Host", "evil.example")],
        "",
    )
    .await;
    assert_eq!(
        (rebound.status, rebound.text().as_str()),
        (421, "host not allowed")
    );
    assert_eq!(rebound.header("connection"), Some("close"));
    let cross = send(
        s.port,
        "POST",
        "/api/config",
        &[("Sec-Fetch-Site", "cross-site")],
        "",
    )
    .await;
    assert_eq!(
        (cross.status, cross.text().as_str()),
        (403, "cross-site request refused")
    );
    assert_eq!(get(s.port, "/api/health/").await.status, 404);
    assert_eq!(get(s.port, "/api/nope").await.status, 404);
    assert_eq!(get(s.port, "/api/assets").await.status, 200);
    assert_eq!(get(s.port, "/api/canvases/x").await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn stores_the_config_verbatim_behind_its_guards() {
    let s = start().await;
    assert_eq!(get(s.port, "/api/config").await.status, 404);
    let no_header = send(
        s.port,
        "POST",
        "/api/config",
        &[("Content-Type", "application/json")],
        "{}",
    )
    .await;
    assert_eq!(
        (no_header.status, no_header.text().as_str()),
        (403, "missing X-Dashboard-Config header")
    );
    let text = send(
        s.port,
        "POST",
        "/api/config",
        &[("Content-Type", "text/plain"), ("X-Dashboard-Config", "1")],
        "{}",
    )
    .await;
    assert_eq!(text.status, 415);
    for bad in ["", "[]", "null", "{", "5"] {
        let r = post_config(s.port, bad, &[]).await;
        assert_eq!(
            (r.status, r.text().as_str()),
            (400, "expected a config object"),
            "{bad}"
        );
    }

    let body = "{ \"version\": 11,\n  \"n\": 1.0, \"2\": 1e21, \"profiles\": [] }";
    let saved = post_config(s.port, body, &[]).await;
    assert_eq!(saved.status, 200);
    let version = json(&saved)["version"].as_i64().unwrap();
    assert_eq!(
        saved.text(),
        format!(r#"{{"ok":true,"version":{version}}}"#)
    );
    let read = get(s.port, "/api/config").await;
    assert_eq!(read.text(), body);
    assert!(
        read.header("x-settings-rev")
            .unwrap()
            .parse::<i64>()
            .unwrap()
            > 0
    );
    assert_eq!(
        std::fs::read_to_string(s.data().join("config.json")).unwrap(),
        body
    );
    assert!(!s.data().join("config.json.tmp").exists());

    let older = post_config(s.port, r#"{"version":10}"#, &[]).await;
    assert_eq!(
        (older.status, older.text().as_str()),
        (409, "a newer dashboard version saved this config; reload")
    );
    let health = json(&get(s.port, "/api/health").await);
    assert_eq!(health["configVersion"].as_i64(), Some(version));
    let again = json(&post_config(s.port, r#"{"version":11}"#, &[]).await)["version"]
        .as_i64()
        .unwrap();
    assert!(again > version);

    // Every canvasRef must name a file in the canvas store.
    let refs: Vec<String> = (0..7).map(|i| format!("cnv_{i:032x}")).collect();
    let canvases = s.data().join("canvases");
    std::fs::create_dir_all(&canvases).unwrap();
    std::fs::write(canvases.join(format!("{}.json", refs[0])), "{}").unwrap();
    let zones: Vec<String> = refs
        .iter()
        .map(|r| format!(r#"{{"canvasRef":"{r}"}}"#))
        .collect();
    let config = format!(
        r#"{{"version":11,"profiles":[{{"pages":[{{"placements":[{}]}}]}}]}}"#,
        zones.join(",")
    );
    let missing = post_config(s.port, &config, &[]).await;
    assert_eq!(missing.status, 422);
    assert_eq!(
        missing.text(),
        format!(
            "canvas files missing from the store: {}",
            refs[1..6].join(", ")
        )
    );
    let one = format!(
        r#"{{"version":11,"profiles":[{{"canvasRef":"{}"}}],"x":{{"canvasRef":"bad"}}}}"#,
        refs[0]
    );
    assert_eq!(
        post_config(s.port, &one, &[]).await.text(),
        "canvas files missing from the store: bad"
    );
    let only = format!(
        r#"{{"version":11,"profiles":[{{"canvasRef":"{}"}}]}}"#,
        refs[0]
    );
    assert_eq!(post_config(s.port, &only, &[]).await.status, 200);
    // Not a config (no profiles array): nothing to check.
    assert_eq!(
        post_config(s.port, r#"{"version":11,"canvasRef":"bad"}"#, &[])
            .await
            .status,
        200
    );

    let big = format!(
        r#"{{"version":11,"pad":"{}"}}"#,
        "x".repeat(5 * 1024 * 1024)
    );
    assert_eq!(post_config(s.port, &big, &[]).await.status, 413);
    s.stop().await;
}

#[tokio::test]
async fn keeps_the_older_config_before_a_save_raises_its_version() {
    let s = start().await;
    let backup = s.data().join("config.backup-before-v16.json");
    let v15 = r#"{"version":15,"theme":{"primary":"1 2% 3%"},"profiles":[]}"#;
    assert_eq!(post_config(s.port, v15, &[]).await.status, 200);
    assert!(!backup.exists());
    // The first v16 save copies the v15 file first, byte for byte, and says where.
    let raised = post_config(s.port, r#"{"version":16,"profiles":[]}"#, &[]).await;
    assert_eq!(raised.status, 200);
    assert_eq!(json(&raised)["backup"], backup.display().to_string());
    assert_eq!(std::fs::read_to_string(&backup).unwrap(), v15);
    // A save that keeps the version names no backup.
    assert!(
        json(&post_config(s.port, r#"{"version":16,"profiles":[2]}"#, &[]).await)
            .get("backup")
            .is_none()
    );
    // Another v16 save, or a refused older one, leaves it as it was; a later raise never overwrites it.
    assert_eq!(
        post_config(s.port, r#"{"version":16,"profiles":[1]}"#, &[])
            .await
            .status,
        200
    );
    assert_eq!(post_config(s.port, v15, &[]).await.status, 409);
    std::fs::write(s.data().join("config.json"), v15).unwrap();
    assert_eq!(
        post_config(s.port, r#"{"version":16,"n":2}"#, &[])
            .await
            .status,
        200
    );
    assert_eq!(std::fs::read_to_string(&backup).unwrap(), v15);
    assert_eq!(
        std::fs::read_to_string(s.data().join("config.json")).unwrap(),
        r#"{"version":16,"n":2}"#
    );
    s.stop().await;
}

#[tokio::test]
async fn settings_patch_sets_the_startup_screen() {
    let s = start().await;
    post_config(
        s.port,
        r#"{"version":11,"activeProfile":"auto","profiles":[{"id":"desk","pages":[]}]}"#,
        &[],
    )
    .await;
    for bad in [r#""gone""#, "1", "true"] {
        let refused = patch_settings(s.port, &format!(r#"{{"activeProfile":{bad}}}"#)).await;
        assert_eq!(
            (refused.status, refused.text()),
            (400, "not a valid activeProfile".to_string())
        );
    }
    assert_eq!(
        patch_settings(s.port, r#"{"activeProfile":"desk"}"#)
            .await
            .status,
        200
    );
    assert_eq!(
        json(&get(s.port, "/api/config").await)["activeProfile"],
        "desk"
    );
    assert_eq!(
        patch_settings(s.port, r#"{"activeProfile":null}"#)
            .await
            .status,
        200
    );
    assert_eq!(
        json(&get(s.port, "/api/config").await)["activeProfile"],
        "auto"
    );
    assert_eq!(
        patch_settings(s.port, r#"{"activeProfile":"auto"}"#)
            .await
            .status,
        200
    );
    s.stop().await;
}

#[tokio::test]
async fn merges_settings_patches_and_feeds_them() {
    let s = start().await;
    assert_eq!(
        patch_settings(s.port, r#"{"general":{"maxFps":15}}"#)
            .await
            .text(),
        "no config saved yet"
    );
    let stored = r#"{"version":11,"general":{"font":"inter"},"profiles":[{"id":"desk","pages":[],"performance":{"maxFps":30}}],"z":1}"#;
    post_config(s.port, stored, &[]).await;
    let known: i64 = get(s.port, "/api/config")
        .await
        .header("x-settings-rev")
        .unwrap()
        .parse()
        .unwrap();

    assert_eq!(
        patch_settings(s.port, "").await.text(),
        "expected a settings patch"
    );
    assert_eq!(
        patch_settings(s.port, r#"{"general":{"maxFps":24}}"#)
            .await
            .text(),
        "not a valid general.maxFps"
    );
    assert_eq!(
        patch_settings(s.port, r#"{"profiles":{"gone":{"performance":null}}}"#)
            .await
            .status,
        404
    );
    assert_eq!(
        send(s.port, "POST", "/api/config/settings", &JSON_WRITE, "{}")
            .await
            .status,
        405
    );

    let done = patch_settings(
        s.port,
        r#"{"general":{"maxFps":15},"profiles":{"desk":{"performance":null}}}"#,
    )
    .await;
    assert_eq!(done.status, 200);
    let result = json(&done);
    assert_eq!(result["settingsRev"].as_i64(), Some(known + 1));
    assert_eq!(
        done.text(),
        format!(
            r#"{{"ok":true,"version":{},"settingsRev":{}}}"#,
            result["version"],
            known + 1
        )
    );
    assert_eq!(
        get(s.port, "/api/config").await.text(),
        r#"{"version":11,"profiles":[{"id":"desk","pages":[]}],"z":1,"general":{"font":"inter","maxFps":15}}"#
    );

    let feed = get(s.port, &format!("/api/config/settings?since={known}")).await;
    assert_eq!(
        feed.text(),
        format!(
            r#"{{"settingsRev":{},"patches":[{{"rev":{},"patch":{{"general":{{"maxFps":15}},"profiles":{{"desk":{{"performance":null}}}}}}}}]}}"#,
            known + 1,
            known + 1
        )
    );
    assert_eq!(
        json(&get(s.port, &format!("/api/config/settings?since={}", known + 1)).await)["patches"],
        serde_json::json!([])
    );
    for bad in ["", "?since=", "?since=abc", "?since=Infinity"] {
        assert_eq!(
            get(s.port, &format!("/api/config/settings{bad}"))
                .await
                .text(),
            "expected ?since=<revision>"
        );
    }

    // A push built before the patch names the older revision and gets it again; one naming none is saved as sent.
    post_config(
        s.port,
        r#"{"version":11,"general":{"maxFps":60},"profiles":[{"id":"desk"}]}"#,
        &[("X-Settings-Rev", &known.to_string())],
    )
    .await;
    assert_eq!(
        get(s.port, "/api/config").await.text(),
        r#"{"version":11,"profiles":[{"id":"desk"}],"general":{"maxFps":15}}"#
    );
    post_config(
        s.port,
        r#"{"version":11,"general":{"maxFps":60}}"#,
        &[("X-Settings-Rev", "abc")],
    )
    .await;
    assert_eq!(
        get(s.port, "/api/config").await.text(),
        r#"{"version":11,"general":{"maxFps":60}}"#
    );
    // An empty header is revision 0: every logged patch again. One that no longer applies (no screen desk) is
    // skipped, and the push is still saved re-serialised.
    post_config(
        s.port,
        r#"{"version":11, "general":{"maxFps":60}}"#,
        &[("X-Settings-Rev", "")],
    )
    .await;
    assert_eq!(
        get(s.port, "/api/config").await.text(),
        r#"{"version":11,"general":{"maxFps":60}}"#
    );
    post_config(
        s.port,
        r#"{"version":11, "profiles":[{"id":"desk","performance":{}}]}"#,
        &[("X-Settings-Rev", " ")],
    )
    .await;
    assert_eq!(
        get(s.port, "/api/config").await.text(),
        r#"{"version":11,"profiles":[{"id":"desk"}],"general":{"maxFps":15}}"#
    );

    // The log keeps the newest 50.
    for i in 0..55 {
        let fps = [5, 15, 30, 60, 0][i % 5];
        assert_eq!(
            patch_settings(s.port, &format!(r#"{{"general":{{"maxFps":{fps}}}}}"#))
                .await
                .status,
            200
        );
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
        let read = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf))
            .await
            .unwrap()
            .unwrap();
        assert!(read > 0, "stream closed: {seen}");
        seen.push_str(&String::from_utf8_lossy(&buf[..read]));
    }
}

#[tokio::test]
async fn streams_config_events_and_counts_the_clients() {
    let s = start().await;
    let rev: i64 = json(&get(s.port, "/api/config/settings?since=0").await)["settingsRev"]
        .as_i64()
        .unwrap();
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /events/config HTTP/1.1\r\nHost: localhost:{}\r\n\r\n",
                s.port
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let mut seen = String::new();
    events(&mut stream, &mut seen, 1).await;
    assert!(seen.starts_with("HTTP/1.1 200"), "{seen}");
    assert!(seen
        .to_ascii_lowercase()
        .contains("content-type: text/event-stream\r\n"));
    assert!(
        seen.contains(&format!(
            "data: {{\"version\":0,\"settingsRev\":{rev}}}\n\n"
        )),
        "{seen}"
    );

    let stats = get(s.port, "/api/server/stats").await;
    let body = json(&stats);
    assert_eq!(
        (body["clients"].as_i64(), body["studios"].as_i64()),
        (Some(1), Some(0))
    );
    assert!(stats.text().starts_with(r#"{"uptimeSeconds":"#));
    assert_eq!(
        send(s.port, "POST", "/api/server/stats", &[], "")
            .await
            .status,
        405
    );

    let version = json(&post_config(s.port, r#"{"version":1}"#, &[]).await)["version"]
        .as_i64()
        .unwrap();
    events(&mut stream, &mut seen, 2).await;
    assert!(
        seen.contains(&format!(
            "data: {{\"version\":{version},\"settingsRev\":{rev}}}\n\n"
        )),
        "{seen}"
    );
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
    open.write_all(
        format!(
            "POST /events/config HTTP/1.1\r\nHost: localhost:{}\r\nContent-Length: 0\r\n\r\n",
            s.port
        )
        .as_bytes(),
    )
    .await
    .unwrap();
    let mut seen = String::new();
    events(&mut open, &mut seen, 1).await;
    s.stop().await;
}

#[tokio::test]
async fn streams_a_touch_panels_messages_starting_with_its_kept_setup() {
    use ips_server::touch_hub::{Keep, HUB};
    let s = start().await;
    assert_eq!(get(s.port, "/events/touch").await.status, 400, "no panel");
    assert_eq!(get(s.port, "/events/touch?panel=a%20b").await.status, 400);
    assert_eq!(
        send(s.port, "POST", "/events/touch?panel=routes-1", &[], "")
            .await
            .status,
        405
    );

    HUB.publish(
        "routes-1",
        r#"{"setup":{"name":"Left"}}"#,
        Some(Keep::Setup),
    );
    HUB.publish("routes-1", r#"{"type":"Pointer","kind":"Down"}"#, None);
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /events/touch?panel=routes-1 HTTP/1.1\r\nHost: localhost:{}\r\n\r\n",
                s.port
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let mut seen = String::new();
    events(&mut stream, &mut seen, 1).await;
    assert!(seen.starts_with("HTTP/1.1 200"), "{seen}");
    assert!(seen
        .to_ascii_lowercase()
        .contains("content-type: text/event-stream\r\n"));
    assert!(
        seen.contains("data: {\"setup\":{\"name\":\"Left\"}}\n\n"),
        "{seen}"
    );
    assert!(
        !seen.contains("Pointer"),
        "a message from before the page connected is not replayed: {seen}"
    );

    for _ in 0..100 {
        if HUB.subscribers("routes-1") == 1 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    HUB.publish("routes-1", r#"{"type":"Gesture"}"#, None);
    HUB.publish("routes-2", r#"{"type":"Pointer"}"#, None);
    events(&mut stream, &mut seen, 2).await;
    assert!(seen.contains("data: {\"type\":\"Gesture\"}\n\n"), "{seen}");
    assert!(!seen.contains("Pointer"), "only its own panel: {seen}");
    s.stop().await;
}

#[tokio::test]
async fn keeps_the_studio_prefs_in_their_own_file() {
    let s = start().await;
    let put = |body: &'static str| send(s.port, "PUT", "/api/studio-prefs", &JSON_WRITE, body);
    assert_eq!(get(s.port, "/api/studio-prefs").await.text(), "{}");
    assert_eq!(
        put(r#"{"studio.previewData":"paused"}"#).await.text(),
        "studio.previewData takes live, frozen, frozenWhenUnfocused"
    );
    assert_eq!(
        put(r#"{"studio.other":"x"}"#).await.text(),
        "unknown preference studio.other"
    );
    assert_eq!(put("nope").await.text(), "expected a JSON object");
    assert_eq!(put("[]").await.text(), "expected a JSON object");
    assert_eq!(
        send(s.port, "POST", "/api/studio-prefs", &JSON_WRITE, "{}")
            .await
            .status,
        405
    );
    assert_eq!(put("").await.text(), "{}");
    assert_eq!(
        std::fs::read_to_string(s.data().join("studio-prefs.json")).unwrap(),
        "{}"
    );
    assert_eq!(
        put(r#"{"studio.previewData":"frozen"}"#).await.text(),
        r#"{"studio.previewData":"frozen"}"#
    );
    assert_eq!(
        std::fs::read_to_string(s.data().join("studio-prefs.json")).unwrap(),
        r#"{"studio.previewData":"frozen"}"#
    );
    assert_eq!(
        get(s.port, "/api/studio-prefs").await.text(),
        r#"{"studio.previewData":"frozen"}"#
    );
    s.stop().await;
}

#[tokio::test]
async fn serves_the_build_with_the_static_rules() {
    let s = start().await;
    let index = get(s.port, "/").await;
    assert_eq!((index.status, index.text().as_str()), (200, "<p>index</p>"));
    assert_eq!(
        index.header("content-type"),
        Some("text/html; charset=utf-8")
    );
    assert_eq!(index.header("cache-control"), Some("no-store"));
    assert_eq!(index.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(
        index.header("referrer-policy"),
        Some("strict-origin-when-cross-origin")
    );
    assert!(index.header("content-length").is_none());
    assert!(!index
        .header("content-security-policy")
        .unwrap()
        .contains("frame-ancestors"));
    assert!(get(s.port, "/x/y?studio")
        .await
        .header("content-security-policy")
        .unwrap()
        .ends_with("; frame-ancestors 'self'"));

    let txt = get(s.port, "/a.txt").await;
    assert_eq!(
        (txt.text().as_str(), txt.header("content-type")),
        ("plain", Some("text/plain; charset=utf-8"))
    );
    assert_eq!(
        (txt.header("cache-control"), txt.header("referrer-policy")),
        (Some("no-cache"), Some("no-referrer"))
    );
    assert!(txt.header("content-security-policy").is_none());
    assert_eq!(
        get(s.port, "/assets/app.JS").await.header("content-type"),
        Some("text/javascript; charset=utf-8")
    );

    for fallback in [
        "/missing.js",
        "/assets",
        "/assets/",
        "/%61.txt/..",
        "/x%5c..%5c..%5ca.txt",
    ] {
        let r = get(s.port, fallback).await;
        assert_eq!(
            (r.status, r.text().as_str()),
            (200, "<p>index</p>"),
            "{fallback}"
        );
    }
    assert_eq!(get(s.port, "/%61.txt").await.text(), "plain");
    if cfg!(windows) {
        // A backslash separates there, after the dot-segment check, and a trailing separator is dropped.
        assert_eq!(get(s.port, "/a.txt/").await.text(), "plain");
        assert_eq!(get(s.port, "/x%5c..%5ca.txt").await.text(), "plain");
    }
    for hidden in [
        "/.secret",
        "/assets/.x",
        "/%2esecret",
        "/a/..%2F.secret",
        "/..%5c..%5ca.txt",
    ] {
        assert_eq!(get(s.port, hidden).await.status, 404, "{hidden}");
    }
    let malformed = get(s.port, "/%zz").await;
    assert_eq!(
        (malformed.status, malformed.text().as_str()),
        (500, "internal error")
    );
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
    assert_eq!(
        (none.status, none.text().as_str()),
        (503, "No build found. Run `npm run build` first.")
    );
    empty.stop().await;
}

#[tokio::test]
async fn reads_the_config_version_from_the_file_and_names_a_taken_port() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("data")).unwrap();
    std::fs::write(dir.path().join("data/config.json"), "{}").unwrap();
    let mtime = std::fs::metadata(dir.path().join("data/config.json"))
        .unwrap()
        .modified()
        .unwrap();
    let ms = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let mut cfg = config(dir.path());
    let s = start_with(dir, cfg.clone()).await;
    assert_eq!(
        json(&get(s.port, "/api/health").await)["configVersion"].as_i64(),
        Some(ms)
    );

    cfg.port = s.port;
    let home = cfg.data_dir.with_file_name("home");
    let taken = bind_with_home(cfg, home)
        .await
        .err()
        .expect("the port is taken")
        .to_string();
    assert!(taken.contains("listen EADDRINUSE"), "{taken}");
    s.stop().await;
}

const CONTROL_WRITE: [(&str, &str); 2] = [
    ("Content-Type", "application/json"),
    ("X-Dashboard-Control", "1"),
];

async fn post_control(port: u16, action: &str, body: &str) -> Reply {
    send(
        port,
        "POST",
        &format!("/api/control/{action}"),
        &CONTROL_WRITE,
        body,
    )
    .await
}

const CONTROL_CONFIG: &str = r#"{"version":11,"activeProfile":"auto","profiles":[{"id":"desk","pages":[{"id":"main"},{"id":"game"}]},{"id":"strip","pages":[{"id":"main"}]}]}"#;

#[tokio::test]
async fn answers_the_control_routes_and_keeps_control_json() {
    let s = start().await;
    let initial = get(s.port, "/api/control").await;
    assert_eq!(initial.status, 200);
    assert_eq!(
        initial.header("content-type"),
        Some("application/json; charset=utf-8")
    );
    let start_reload = json(&initial)["reload"].as_i64().unwrap();
    assert_eq!(
        initial.text(),
        format!(
            r#"{{"profile":null,"shown":null,"profiles":{{}},"alerts":[],"mutedUntil":null,"reload":{start_reload},"kiosks":[]}}"#
        )
    );
    assert_eq!(
        send(s.port, "POST", "/api/control", &CONTROL_WRITE, "{}")
            .await
            .status,
        405
    );
    // An unknown type is 404 before the method is looked at.
    for path in [
        "/api/control/",
        "/api/control/nope",
        "/api/control/page/x",
        "/api/control/mute",
        "/api/control/shown",
    ] {
        assert_eq!(get(s.port, path).await.status, 404, "{path}");
    }
    assert_eq!(get(s.port, "/api/control/page").await.status, 405);

    let no_header = send(
        s.port,
        "POST",
        "/api/control/page",
        &[("Content-Type", "application/json")],
        "{}",
    )
    .await;
    assert_eq!(
        (no_header.status, no_header.text().as_str()),
        (403, "missing X-Dashboard-Control header")
    );
    let text = send(
        s.port,
        "POST",
        "/api/control/page",
        &[("Content-Type", "text/plain"), ("X-Dashboard-Control", "1")],
        "{}",
    )
    .await;
    assert_eq!(text.status, 415);
    for bad in ["[]", "null", "{", "5", "\"x\""] {
        let r = post_control(s.port, "page", bad).await;
        assert_eq!(
            (r.status, r.text().as_str()),
            (400, "expected a JSON object"),
            "{bad}"
        );
    }
    let big = format!(r#"{{"pad":"{}"}}"#, "x".repeat(5000));
    assert_eq!(post_control(s.port, "page", &big).await.status, 400);
    // The alert action is the alerts module's (routes_alerts.rs covers it): an empty action is refused by the engine.
    let alert = post_control(s.port, "alert", "{}").await;
    assert_eq!(
        (alert.status, alert.text().as_str()),
        (400, "unknown action")
    );

    // Without a config there is no profile to act on.
    let none = post_control(s.port, "page", r#"{"page":"main"}"#).await;
    assert_eq!((none.status, none.text().as_str()), (400, "no profile"));
    assert_eq!(post_config(s.port, CONTROL_CONFIG, &[]).await.status, 200);

    let moved = post_control(
        s.port,
        "page",
        r#"{"profile":"desk","page":"game","type":"profile"}"#,
    )
    .await;
    assert_eq!(moved.status, 200);
    assert_eq!(json(&moved)["profiles"]["desk"]["page"], "game");
    assert_eq!(json(&moved)["profile"], serde_json::Value::Null);
    assert_eq!(
        post_control(s.port, "page", r#"{"page":"nope"}"#)
            .await
            .text(),
        "unknown page"
    );
    assert_eq!(
        post_control(s.port, "profile", r#"{"profile":"nope"}"#)
            .await
            .text(),
        "unknown profile"
    );
    assert_eq!(
        post_control(s.port, "rotate", r#"{"state":"sideways"}"#)
            .await
            .text(),
        "bad rotate state"
    );
    assert_eq!(
        post_control(
            s.port,
            "kiosk",
            r#"{"action":"dim","profile":"desk","level":0.05}"#
        )
        .await
        .text(),
        "bad dim level"
    );
    assert_eq!(
        post_control(s.port, "kiosk", r#"{"action":"nope"}"#)
            .await
            .text(),
        "unknown kiosk action"
    );
    assert_eq!(
        post_control(
            s.port,
            "kiosk",
            r#"{"action":"dim","profile":"desk","level":0.4}"#
        )
        .await
        .status,
        200
    );
    assert_eq!(
        post_control(
            s.port,
            "kiosk",
            r#"{"action":"island","profile":"desk","state":"on"}"#
        )
        .await
        .status,
        200
    );
    let touched = post_control(s.port, "touch", "").await;
    assert_eq!(touched.status, 200);
    assert_eq!(
        json(&get(s.port, "/api/control").await)["profiles"]["desk"]["dim"],
        0.4
    );

    // The durable part only, compact, in Node's key order.
    assert_eq!(
        std::fs::read_to_string(s.data().join("control.json")).unwrap(),
        r#"{"profile":null,"pages":{"desk":"game"},"override":{},"mutedUntil":null,"dim":{"desk":0.4},"dimLevel":{"desk":0.4},"islandOverride":{"desk":"on"}}"#
    );
    assert!(!s.data().join("control.json.tmp").exists());

    // A second server on the same folder reads it back; its reload counter starts at its own start.
    let other = tempfile::tempdir().unwrap();
    let mut cfg = config(other.path());
    cfg.data_dir = s.data();
    let again = start_with(other, cfg).await;
    post_config(again.port, CONTROL_CONFIG, &[]).await;
    let state = json(&get(again.port, "/api/control").await);
    assert_eq!(
        (
            state["profiles"]["desk"]["page"].as_str(),
            state["profiles"]["desk"]["dim"].as_f64()
        ),
        (Some("game"), Some(0.4))
    );
    assert_eq!(state["profiles"]["desk"]["islandOverride"], "on");
    again.stop().await;
    s.stop().await;
}

#[tokio::test]
async fn streams_the_control_state_and_lists_kiosks() {
    let s = start().await;
    assert_eq!(post_config(s.port, CONTROL_CONFIG, &[]).await.status, 200);
    let open = |query: &'static str, port: u16| async move {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        stream
            .write_all(
                format!(
                    "GET /events/control{query} HTTP/1.1
Host: localhost:{port}

"
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        stream
    };
    let last_state = |seen: &str| -> serde_json::Value {
        let line = seen.lines().rfind(|l| l.starts_with("data: ")).unwrap();
        serde_json::from_str(line.trim_start_matches("data: ")).unwrap()
    };
    let stat = |name: &'static str| async move {
        json(&get(s.port, "/api/server/stats").await)[name]
            .as_i64()
            .unwrap()
    };

    // A studio marker counts; a profile makes it a kiosk, not a studio.
    let mut studio = open("?client=studio", s.port).await;
    let mut seen = String::new();
    events(&mut studio, &mut seen, 1).await;
    assert!(seen.starts_with("HTTP/1.1 200"), "{seen}");
    assert_eq!(last_state(&seen)["kiosks"], serde_json::json!([]));
    assert_eq!((stat("studios").await, stat("clients").await), (1, 1));

    let mut kiosk = open("?profile=desk&page=game&client=studio", s.port).await;
    let mut kiosk_seen = String::new();
    events(&mut kiosk, &mut kiosk_seen, 1).await;
    let state = last_state(&kiosk_seen);
    assert_eq!(state["shown"], "desk");
    assert_eq!(state["kiosks"][0]["id"], "k1");
    assert_eq!(
        (
            state["kiosks"][0]["profile"].as_str(),
            state["kiosks"][0]["page"].as_str(),
            state["kiosks"][0]["address"].as_str()
        ),
        (Some("desk"), Some("game"), Some("127.0.0.1"))
    );
    assert_eq!((stat("studios").await, stat("clients").await), (1, 2));
    // The studio stream is told: shown changed, then the kiosk joined.
    events(&mut studio, &mut seen, 3).await;
    assert_eq!(last_state(&seen)["kiosks"].as_array().unwrap().len(), 1);

    // A page switch reaches both; a touch does not.
    post_control(s.port, "page", r#"{"profile":"desk","page":"main"}"#).await;
    post_control(s.port, "touch", "{}").await;
    events(&mut studio, &mut seen, 4).await;
    assert_eq!(last_state(&seen)["profiles"]["desk"]["page"], "main");

    // A config save tells the streams too (the pages may have changed).
    let more = CONTROL_CONFIG.replace(r#"{"id":"game"}"#, r#"{"id":"game"},{"id":"extra"}"#);
    post_config(s.port, &more, &[]).await;
    events(&mut studio, &mut seen, 5).await;
    drop(kiosk);
    for _ in 0..200 {
        if json(&get(s.port, "/api/control").await)["kiosks"] == serde_json::json!([]) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(
        json(&get(s.port, "/api/control").await)["kiosks"],
        serde_json::json!([])
    );
    events(&mut studio, &mut seen, 6).await;
    assert_eq!(last_state(&seen)["kiosks"], serde_json::json!([]));
    drop(studio);
    for _ in 0..200 {
        if stat("studios").await == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!((stat("studios").await, stat("clients").await), (0, 0));
    s.stop().await;
}

#[tokio::test]
async fn lists_a_named_display_online_and_pushes_its_assigned_screen() {
    let s = start().await;
    assert_eq!(post_config(s.port, CONTROL_CONFIG, &[]).await.status, 200);
    let mut kiosk = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    let request = format!(
        "GET /events/control?profile=desk&display=hall-1 HTTP/1.1\r\nHost: localhost:{}\r\n\r\n",
        s.port
    );
    kiosk.write_all(request.as_bytes()).await.unwrap();
    let last_state = |seen: &str| -> serde_json::Value {
        let line = seen.lines().rfind(|l| l.starts_with("data: ")).unwrap();
        serde_json::from_str(line.trim_start_matches("data: ")).unwrap()
    };

    // The first state is queued after `shown` and the connect, which already counted the display as online.
    let mut seen = String::new();
    events(&mut kiosk, &mut seen, 1).await;
    let display = last_state(&seen)["displays"][0].clone();
    assert_eq!(
        (
            display["name"].as_str(),
            display["online"].as_bool(),
            display["screen"].as_str()
        ),
        (Some("hall-1"), Some(true), Some("follow"))
    );
    assert_eq!(last_state(&seen)["kiosks"][0]["display"], "hall-1");

    // Assigning a screen pushes it to the stream; an unknown screen or display is refused.
    let assigned = post_control(
        s.port,
        "display",
        r#"{"action":"assign","display":"hall-1","screen":"strip"}"#,
    )
    .await;
    assert_eq!(assigned.status, 200);
    events(&mut kiosk, &mut seen, 2).await;
    let display = last_state(&seen)["displays"][0].clone();
    assert_eq!(
        (display["screen"].as_str(), display["shows"].as_str()),
        (Some("strip"), Some("strip"))
    );
    assert_eq!(
        post_control(
            s.port,
            "display",
            r#"{"action":"assign","display":"hall-1","screen":"gone"}"#
        )
        .await
        .status,
        400
    );
    assert_eq!(
        post_control(
            s.port,
            "display",
            r#"{"action":"assign","display":"nobody","screen":"strip"}"#
        )
        .await
        .status,
        400
    );

    // Closing the stream leaves the display known and offline; forgetting removes it.
    drop(kiosk);
    for _ in 0..200 {
        if json(&get(s.port, "/api/control").await)["displays"][0]["online"] == false {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(
        json(&get(s.port, "/api/control").await)["displays"][0]["online"],
        false
    );
    assert_eq!(
        post_control(
            s.port,
            "display",
            r#"{"action":"forget","display":"hall-1"}"#
        )
        .await
        .status,
        200
    );
    assert!(json(&get(s.port, "/api/control").await)
        .get("displays")
        .is_none());
    s.stop().await;
}

#[tokio::test]
async fn serves_debug_stats_only_in_debug_mode() {
    let s = start().await;
    for method in ["GET", "POST", "PUT"] {
        assert_eq!(
            send(s.port, method, "/api/debug/stats", &[], "")
                .await
                .status,
            404,
            "{method}"
        );
    }
    s.stop().await;

    let dir = tempfile::tempdir().unwrap();
    let mut cfg = config(dir.path());
    cfg.debug = true;
    let s = start_with(dir, cfg).await;
    assert_eq!(
        send(s.port, "POST", "/api/debug/stats", &[], "")
            .await
            .status,
        405
    );
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /events/config HTTP/1.1
Host: localhost:{}

",
                s.port
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    events(&mut stream, &mut String::new(), 1).await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    let stats = get(s.port, "/api/debug/stats").await;
    assert_eq!(stats.status, 200);
    assert_eq!(
        stats.header("content-type"),
        Some("application/json; charset=utf-8")
    );
    let body = json(&stats);
    assert!(body["memory"]["rss"].as_u64().unwrap() > 0);
    assert_eq!(body["sseClients"]["config"], 1);
    assert!(body["eventLoopDelayMs"]["p99"].is_number());
    assert!(body["resources"]["Task"].as_u64().unwrap() > 0);
    assert!(body["uptimeSeconds"].is_number());
    drop(stream);
    s.stop().await;
}

#[tokio::test]
async fn serves_the_debug_tools_only_in_debug_mode() {
    for debug in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let dist = dir.path().join("dist");
        std::fs::create_dir_all(dist.join("lab")).unwrap();
        std::fs::write(dist.join("index.html"), "<p>index</p>").unwrap();
        std::fs::write(dist.join("lab").join("index.html"), "<p>lab</p>").unwrap();
        let mut cfg = config(dir.path());
        cfg.debug = debug;
        let s = start_with(dir, cfg).await;
        if debug {
            let lab = get(s.port, "/lab/").await;
            assert_eq!(
                (lab.status, lab.body.as_slice()),
                (200, b"<p>lab</p>".as_slice())
            );
            let bare = get(s.port, "/lab").await;
            assert_eq!((bare.status, bare.header("location")), (302, Some("/lab/")));
            for path in ["/widget-qa", "/?widget-qa", "/?widget-qa&settings=1"] {
                let qa = get(s.port, path).await;
                assert_eq!(
                    (qa.status, qa.body.as_slice()),
                    (200, b"<p>index</p>".as_slice()),
                    "{path}"
                );
            }
        } else {
            for path in [
                "/lab",
                "/lab/",
                "/lab/index.html",
                "/widget-qa",
                "/?widget-qa",
                "/?widget-qa&settings=1",
            ] {
                assert_eq!(get(s.port, path).await.status, 404, "{path}");
            }
            // The kiosk and studio are unaffected.
            assert_eq!(get(s.port, "/?studio=1").await.status, 200);
        }
        s.stop().await;
    }
}
