// The extras routes over a real socket (/api/integrations, /api/extras, /events/extras): a server on a free port with a
// temp data folder, and raw HTTP/1.1 requests, so the exact status, headers and bytes are what a client sees.

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
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
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


fn json(reply: &Reply) -> serde_json::Value {
    serde_json::from_slice(&reply.body).unwrap()
}

const PUT_HEADERS: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Config", "1")];

async fn put(port: u16, body: &str) -> Reply {
    send(port, "PUT", "/api/integrations", &PUT_HEADERS, body).await
}

/// Polls `/api/extras` until `done` accepts it (or five seconds pass), and returns what it last said.
async fn extras_until(port: u16, done: impl Fn(&serde_json::Value) -> bool) -> serde_json::Value {
    for _ in 0..100 {
        let state = json(&get(port, "/api/extras").await);
        if done(&state) {
            return state;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    json(&get(port, "/api/extras").await)
}

#[tokio::test]
async fn starts_with_nothing_set_up_and_sends_no_secret() {
    let s = start().await;
    let extras = get(s.port, "/api/extras").await;
    assert_eq!(extras.status, 200);
    assert_eq!(
        extras.text(),
        r#"{"obs":{"configured":false,"connected":false,"streaming":false,"recording":false},"calendar":{"configured":false,"events":[]},"agents":{"sessions":[],"plan":{},"usage":{}}}"#
    );
    assert_eq!(extras.header("content-type"), Some("application/json; charset=utf-8"));
    assert_eq!(extras.header("cache-control"), Some("no-store"));
    for method in ["POST", "PUT", "DELETE"] {
        assert_eq!(send(s.port, method, "/api/extras", &[], "").await.status, 405, "{method}");
    }
    let integrations = get(s.port, "/api/integrations").await;
    assert_eq!(integrations.text(), r#"{"obs":{"host":"","port":4455,"hasPassword":false},"calendar":{"links":[]}}"#);
    assert_eq!(send(s.port, "POST", "/api/integrations", &PUT_HEADERS, "{}").await.status, 405);
    assert_eq!(send(s.port, "DELETE", "/api/integrations", &[], "").await.status, 405);
    assert!(!s.data().join("integrations.json").exists());
    s.stop().await;
}

#[tokio::test]
async fn refuses_a_write_without_the_config_headers_or_with_a_bad_body() {
    let s = start().await;
    let no_header = send(s.port, "PUT", "/api/integrations", &[("Content-Type", "application/json")], "{}").await;
    assert_eq!((no_header.status, no_header.text().as_str()), (403, "missing X-Dashboard-Config header"));
    let text = send(s.port, "PUT", "/api/integrations", &[("Content-Type", "text/plain"), ("X-Dashboard-Config", "1")], "{}").await;
    assert_eq!((text.status, text.text().as_str()), (415, "expected application/json"));
    for bad in ["{", "nope", "5", "[]", "null", "\"x\""] {
        let r = put(s.port, bad).await;
        assert_eq!((r.status, r.text().as_str()), (400, "expected a JSON object"), "{bad}");
    }
    let refusals = [
        (r#"{"obs":null}"#, "obs: expected an object"),
        (r#"{"obs":{"host":"ws://x/y"}}"#, "obs.host: a host name or IP address"),
        (r#"{"calendar":{}}"#, "calendar.links: expected a list"),
        (r#"{"calendar":{"links":[1]}}"#, "calendar.links: expected objects"),
        (r#"{"calendar":{"links":[{"url":"file:///c:/x.ics"}]}}"#, "calendar.links: an http(s) or webcal link"),
    ];
    for (body, message) in refusals {
        let r = put(s.port, body).await;
        assert_eq!((r.status, r.text().as_str()), (400, message), "{body}");
    }
    let eleven = format!(r#"{{"calendar":{{"links":[{}]}}}}"#, [r#"{"url":"https://a.example/a"}"#; 11].join(","));
    assert_eq!(put(s.port, &eleven).await.text(), "calendar.links: at most 10");
    // Over 16 KiB: the body is cut off, as Node's reader does.
    let big = put(s.port, &format!(r#"{{"obs":{{"password":"{}"}}}}"#, "p".repeat(17 * 1024))).await;
    assert_eq!((big.status, big.header("connection")), (400, Some("close")));
    // Nothing was saved by any of it.
    assert!(!s.data().join("integrations.json").exists());
    assert_eq!(get(s.port, "/api/integrations").await.text(), r#"{"obs":{"host":"","port":4455,"hasPassword":false},"calendar":{"links":[]}}"#);
    // An empty body is an empty patch.
    assert_eq!(put(s.port, "").await.status, 200);
    s.stop().await;
}

#[tokio::test]
async fn saves_secrets_to_their_own_file_and_shows_the_studio_only_the_public_form() {
    let s = start().await;
    let patch = r#"{"obs":{"host":"127.0.0.1","port":"1","password":"hunter2"},"calendar":{"links":[{"url":"webcal://calendar.example.com/private/abc/basic.ics","label":"Work"}]}}"#;
    let saved = put(s.port, patch).await;
    assert_eq!(saved.status, 200);
    let id = json(&saved)["calendar"]["links"][0]["id"].as_str().unwrap().to_string();
    assert_eq!(id.len(), 36);
    let public = format!(r#"{{"obs":{{"host":"127.0.0.1","port":1,"hasPassword":true}},"calendar":{{"links":[{{"id":"{id}","label":"Work","host":"calendar.example.com"}}]}}}}"#);
    assert_eq!(saved.text(), public);
    assert_eq!(get(s.port, "/api/integrations").await.text(), public);
    for secret in ["hunter2", "private"] {
        assert!(!saved.text().contains(secret));
        assert!(!get(s.port, "/api/extras").await.text().contains(secret));
    }
    // The file is the only pretty-printed one, without a trailing newline.
    let file = std::fs::read_to_string(s.data().join("integrations.json")).unwrap();
    let expected = format!(
        "{{\n  \"obs\": {{\n    \"host\": \"127.0.0.1\",\n    \"port\": 1,\n    \"password\": \"hunter2\"\n  }},\n  \"calendar\": {{\n    \"links\": [\n      {{\n        \"id\": \"{id}\",\n        \"label\": \"Work\",\n        \"url\": \"https://calendar.example.com/private/abc/basic.ics\"\n      }}\n    ]\n  }}\n}}"
    );
    assert_eq!(file, expected);
    assert!(!s.data().join("integrations.json.tmp").exists());
    // A password is kept unless one is sent; a stored link is kept by its id, whatever url the patch names.
    let kept = put(s.port, &format!(r#"{{"obs":{{"port":4456}},"calendar":{{"links":[{{"id":"{id}","url":"https://other.example/x"}}]}}}}"#)).await;
    assert!(kept.text().contains(r#""port":4456,"hasPassword":true"#) && kept.text().contains(r#""label":"Work","host":"calendar.example.com""#));
    let cleared = put(s.port, r#"{"obs":{"password":""},"calendar":{"links":[]}}"#).await;
    assert_eq!(cleared.text(), r#"{"obs":{"host":"127.0.0.1","port":4456,"hasPassword":false},"calendar":{"links":[]}}"#);
    s.stop().await;

    // A new server reads the file back.
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("data")).unwrap();
    std::fs::write(dir.path().join("data/integrations.json"), &file).unwrap();
    let cfg = config(dir.path());
    let again = start_with(dir, cfg).await;
    assert_eq!(get(again.port, "/api/integrations").await.text(), public);
    again.stop().await;
}

/// Reads from an event stream until what it has sent so far contains the needle.
async fn read_until(stream: &mut TcpStream, seen: &mut String, needle: &str) {
    let mut buf = [0u8; 4096];
    while !seen.contains(needle) {
        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf)).await.expect("an event in time").unwrap();
        assert!(n > 0, "the stream closed");
        seen.push_str(&String::from_utf8_lossy(&buf[..n]));
    }
}

#[tokio::test]
async fn follows_obs_settings_in_the_extras_state_and_its_stream() {
    let s = start().await;
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream.write_all(format!("GET /events/extras HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n", s.port).as_bytes()).await.unwrap();
    let mut seen = String::new();
    read_until(&mut stream, &mut seen, "\r\n\r\n").await;
    assert!(seen.starts_with("HTTP/1.1 200 OK") && seen.to_lowercase().contains("content-type: text/event-stream"));
    read_until(&mut stream, &mut seen, r#"data: {"obs":{"configured":false,"connected":false,"streaming":false,"recording":false},"calendar":{"configured":false,"events":[]},"agents""#).await;
    // Nothing listens on port 1, so OBS is set up but not connected.
    assert_eq!(put(s.port, r#"{"obs":{"host":"127.0.0.1","port":1}}"#).await.status, 200);
    read_until(&mut stream, &mut seen, r#"data: {"obs":{"configured":true,"connected":false"#).await;
    let state = extras_until(s.port, |state| state["obs"]["configured"] == true).await;
    assert_eq!(state["obs"], serde_json::json!({ "configured": true, "connected": false, "streaming": false, "recording": false }));
    assert_eq!(put(s.port, r#"{"obs":{"host":""}}"#).await.status, 200);
    assert_eq!(extras_until(s.port, |state| state["obs"]["configured"] == false).await["obs"]["configured"], false);
    drop(stream);
    s.stop().await;
}

#[tokio::test]
async fn will_not_fetch_a_calendar_from_this_machine_and_says_so_without_the_link() {
    let s = start().await;
    let link = r#"{"calendar":{"links":[{"url":"http://127.0.0.1:9/secret-token.ics","label":"Local"},{"url":"http://localhost:9/secret-token.ics"}]}}"#;
    assert_eq!(put(s.port, link).await.status, 200);
    let state = extras_until(s.port, |state| state["calendar"]["configured"] == true).await;
    assert_eq!(state["calendar"], serde_json::json!({ "configured": true, "events": [], "error": "Local: address not allowed; localhost:9: address not allowed" }));
    assert!(!state.to_string().contains("secret-token"));
    // Removing the links turns the calendar off again.
    assert_eq!(put(s.port, r#"{"calendar":{"links":[]}}"#).await.status, 200);
    assert_eq!(extras_until(s.port, |state| state["calendar"]["configured"] == false).await["calendar"], serde_json::json!({ "configured": false, "events": [] }));
    s.stop().await;
}

#[tokio::test]
async fn takes_agent_posts_from_this_machine_with_the_agent_header_only() {
    let s = start().await;
    let agent: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Agent-Event", "1")];
    for route in ["/api/agents/event?agent=claude", "/api/agents/statusline"] {
        for ok in ["{}", "null", r#"{"session_id":"s"}"#] {
            let r = send(s.port, "POST", route, &agent, ok).await;
            assert_eq!((r.status, r.body.len()), (204, 0), "{route} {ok}");
        }
        for bad in ["", "{", "nope"] {
            let r = send(s.port, "POST", route, &agent, bad).await;
            assert_eq!((r.status, r.text().as_str()), (400, "invalid JSON"), "{route} {bad}");
        }
        let text = send(s.port, "POST", route, &[("Content-Type", "text/plain"), ("X-Agent-Event", "1")], "{}").await;
        assert_eq!((text.status, text.text().as_str()), (415, "expected application/json"));
        let unmarked = send(s.port, "POST", route, &[("Content-Type", "application/json")], "{}").await;
        assert_eq!((unmarked.status, unmarked.text().as_str()), (403, "missing X-Agent-Event header"));
        for method in ["GET", "PUT", "DELETE"] {
            assert_eq!(send(s.port, method, route, &[], "").await.status, 405, "{method} {route}");
        }
    }
    let big = send(s.port, "POST", "/api/agents/event?agent=codex", &agent, &format!("\"{}\"", "x".repeat(513 * 1024))).await;
    assert_eq!((big.status, big.header("connection")), (400, Some("close")));
    assert_eq!(get(s.port, "/api/agents/other").await.status, 404);
    s.stop().await;
}
