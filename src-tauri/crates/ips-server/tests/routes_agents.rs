// The agent routes over a real socket (POST /api/agents/event and /statusline, and what reaches /api/extras and its SSE): a
// server on a free port with a temp data folder and a temp home, and raw HTTP/1.1 requests. The real home is never read.

use std::path::{Path, PathBuf};
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::json;
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
    #[allow(dead_code)]
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

/// A Claude session file of a live process (this test's) and of a dead one, and a transcript with one request.
fn seed_home(home: &Path) {
    let sessions = home.join(".claude/sessions");
    std::fs::create_dir_all(&sessions).unwrap();
    let live = json!({ "pid": std::process::id(), "sessionId": "live-file", "cwd": "E:\\work\\filed", "status": "busy", "updatedAt": 1_760_000_000_000_i64 });
    std::fs::write(sessions.join("live.json"), live.to_string()).unwrap();
    std::fs::write(
        sessions.join("dead.json"),
        r#"{"pid":4294967295,"sessionId":"dead-file","cwd":"/w/ghost","status":"busy"}"#,
    )
    .unwrap();
    let projects = home.join(".claude/projects/x");
    std::fs::create_dir_all(&projects).unwrap();
    let line = json!({ "type": "assistant", "requestId": "r1", "timestamp": ips_server::js::iso_string(ips_server::config::now_ms()), "cwd": "/w/filed", "message": { "model": "claude-opus-5-5", "usage": { "input_tokens": 7 } } });
    std::fs::write(projects.join("s.jsonl"), format!("{line}\n")).unwrap();
}

async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    seed_home(&home);
    let dist = dir.path().join("dist");
    std::fs::create_dir_all(&dist).unwrap();
    std::fs::write(dist.join("index.html"), "<p>index</p>").unwrap();
    let bound = bind_with_home(config(dir.path()), home).await.unwrap();
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

/// Sends `method path` with `headers` (a Host is added) and reads the whole answer.
async fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request =
        format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    // A request over the body cap is answered before it is all sent, so a write error is not a failure.
    let _ = stream.write_all(request.as_bytes()).await;
    let mut raw = Vec::new();
    let _ = tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw))
        .await
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

const HOOK: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Agent-Event", "1")];

async fn post(port: u16, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    send(port, "POST", path, headers, body).await
}

/// Polls `/api/extras` until `done` accepts its agents part (or five seconds pass), and returns it.
async fn agents_until(port: u16, done: impl Fn(&serde_json::Value) -> bool) -> serde_json::Value {
    for _ in 0..100 {
        let reply = send(port, "GET", "/api/extras", &[], "").await;
        let state =
            serde_json::from_slice::<serde_json::Value>(&reply.body).unwrap()["agents"].clone();
        if done(&state) {
            return state;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the agents state never matched");
}

#[tokio::test]
async fn answers_204_to_a_hook_and_a_statusline_and_shows_them_to_the_kiosks() {
    let s = start().await;
    let event = json!({ "hook_event_name": "PreToolUse", "session_id": "abc", "cwd": "E:\\GitHub\\repo", "tool_name": "Bash", "prompt": "secret prompt", "transcript_path": "C:\\secret.jsonl" });
    let reply = post(
        s.port,
        "/api/agents/event?agent=claude",
        &HOOK,
        &event.to_string(),
    )
    .await;
    assert_eq!((reply.status, reply.body.len()), (204, 0));
    assert_eq!(
        reply.header("content-type"),
        Some("text/plain; charset=utf-8")
    );
    assert_eq!(reply.header("cache-control"), Some("no-store"));
    let status = r#"{"session_id":"abc","version":"2.1.0","rate_limits":{"five_hour":{"used_percentage":12,"resets_at":1760000000}},"context_window":{"used_percentage":30},"cost":{"total_cost_usd":0.5},"model":{"display_name":"Opus"}}"#;
    assert_eq!(
        post(s.port, "/api/agents/statusline", &HOOK, status)
            .await
            .status,
        204
    );
    let state = agents_until(s.port, |a| {
        a["sessions"]
            .as_array()
            .is_some_and(|l| l.iter().any(|x| x["tool"] == "Bash" && x["context"] == 30))
    })
    .await;
    let mine = state["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["tool"] == "Bash")
        .unwrap();
    assert_eq!(
        (
            &mine["agent"],
            &mine["project"],
            &mine["state"],
            &mine["cost"],
            &mine["model"]
        ),
        (
            &json!("claude"),
            &json!("repo"),
            &json!("working"),
            &json!(0.5),
            &json!("Opus")
        )
    );
    assert_eq!(
        state["plan"]["claude"]["fiveHour"],
        json!({ "used": 12, "resetsAt": 1_760_000_000_000_i64 })
    );
    for secret in ["secret", "abc", "transcript", "GitHub"] {
        assert!(!state.to_string().contains(secret), "{secret}");
    }
    s.stop().await;
}

#[tokio::test]
async fn shows_the_live_session_file_not_the_dead_one_and_the_transcripts_tokens() {
    let s = start().await;
    let state = agents_until(s.port, |a| a["usage"]["claude"].is_object()).await;
    assert_eq!(state["usage"]["claude"]["today"], 7);
    assert_eq!(
        state["usage"]["claude"]["breakdown"]["today"]["projects"],
        json!([{ "name": "filed", "total": 7 }])
    );
    let sessions = state["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 1, "{state}");
    assert_eq!(
        (
            &sessions[0]["project"],
            &sessions[0]["state"],
            &sessions[0]["since"]
        ),
        (
            &json!("filed"),
            &json!("working"),
            &json!(1_760_000_000_000_i64)
        )
    );
    s.stop().await;
}

#[tokio::test]
async fn ignores_what_is_not_a_hook_with_204_and_refuses_what_is_not_json() {
    let s = start().await;
    for (path, body) in [
        (
            "/api/agents/event?agent=gemini",
            r#"{"hook_event_name":"Stop","session_id":"x"}"#,
        ),
        (
            "/api/agents/event",
            r#"{"hook_event_name":"Stop","session_id":"x"}"#,
        ),
        ("/api/agents/event?agent=claude", "null"),
        ("/api/agents/event?agent=claude", "5"),
        (
            "/api/agents/event?agent=claude",
            r#"{"hook_event_name":"Stop"}"#,
        ),
        ("/api/agents/statusline", "[]"),
        ("/api/agents/statusline", r#""text""#),
    ] {
        assert_eq!(
            post(s.port, path, &HOOK, body).await.status,
            204,
            "{path} {body}"
        );
    }
    for body in ["", "{", "nope"] {
        let reply = post(s.port, "/api/agents/event?agent=claude", &HOOK, body).await;
        assert_eq!(
            (reply.status, reply.text()),
            (400, "invalid JSON".to_string()),
            "{body:?}"
        );
    }
    let big = format!(r#"{{"x":"{}"}}"#, "a".repeat(600 * 1024));
    assert_eq!(
        post(s.port, "/api/agents/event?agent=claude", &HOOK, &big)
            .await
            .status,
        400
    );
    s.stop().await;
}

#[tokio::test]
async fn refuses_in_the_guards_order_and_other_methods_before_any_guard() {
    let s = start().await;
    for method in ["GET", "PUT", "DELETE", "PATCH"] {
        for path in ["/api/agents/event", "/api/agents/statusline"] {
            let reply = send(s.port, method, path, &[], "").await;
            assert_eq!(
                (reply.status, reply.body.len()),
                (405, 0),
                "{method} {path}"
            );
        }
    }
    let text = |r: Reply| (r.status, r.text());
    let wrong_type = post(
        s.port,
        "/api/agents/event?agent=claude",
        &[("Content-Type", "text/plain"), ("X-Agent-Event", "1")],
        "{}",
    )
    .await;
    assert_eq!(
        text(wrong_type),
        (415, "expected application/json".to_string())
    );
    let no_header = post(
        s.port,
        "/api/agents/event?agent=claude",
        &[("Content-Type", "application/json")],
        "{}",
    )
    .await;
    assert_eq!(
        text(no_header),
        (403, "missing X-Agent-Event header".to_string())
    );
    let bad_header = post(
        s.port,
        "/api/agents/statusline",
        &[("Content-Type", "application/json"), ("X-Agent-Event", "0")],
        "{}",
    )
    .await;
    assert_eq!(bad_header.status, 403);
    assert_eq!(
        text(post(s.port, "/api/agents/statusline", &[], "{}").await),
        (415, "expected application/json".to_string())
    );
    // The trailing slash is not the route.
    assert_eq!(
        post(s.port, "/api/agents/event/", &HOOK, "{}").await.status,
        404
    );
    s.stop().await;
}

#[tokio::test]
async fn pushes_a_hook_to_the_extras_stream() {
    let s = start().await;
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /events/extras HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n",
                s.port
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let hook = r#"{"hook_event_name":"UserPromptSubmit","session_id":"sse","cwd":"/w/streamed"}"#;
    assert_eq!(
        post(s.port, "/api/agents/event?agent=codex", &HOOK, hook)
            .await
            .status,
        204
    );
    let mut seen = String::new();
    let mut buf = [0u8; 4096];
    let found = tokio::time::timeout(Duration::from_secs(5), async {
        while !seen.contains("streamed") {
            let n = stream.read(&mut buf).await.unwrap();
            assert!(n > 0, "the stream ended");
            seen.push_str(&String::from_utf8_lossy(&buf[..n]));
        }
    })
    .await;
    assert!(found.is_ok(), "{seen}");
    assert!(
        seen.contains(r#""agent":"codex""#) && seen.contains(r#""state":"working""#),
        "{seen}"
    );
    s.stop().await;
}
