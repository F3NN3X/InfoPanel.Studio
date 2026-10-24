// The proxy routes over a real socket (/api/image-proxy, /api/font-proxy): a server on a free port with a temp data
// folder, raw HTTP/1.1 requests, and an upstream on loopback, so the exact status, headers and bytes are what a client
// sees. Nothing here reaches the internet: an https target is refused before it connects, and the font catalogue is
// served from a fresh copy.

use std::path::Path;
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

struct Server {
    port: u16,
    dir: tempfile::TempDir,
    stop: Option<oneshot::Sender<()>>,
    done: tokio::task::JoinHandle<()>,
}

impl Server {
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

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0";
const JPEG: &[u8] = b"\xff\xd8\xff\xe0\0\0";

/// The raw answer an upstream path gets.
fn upstream_answer(path: &str) -> Vec<u8> {
    let ok = |t: &str, body: &[u8]| [format!("HTTP/1.1 200 OK\r\nContent-Type: {t}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).into_bytes(), body.to_vec()].concat();
    let head = |line: &str| format!("HTTP/1.1 {line}\r\nConnection: close\r\n\r\n").into_bytes();
    match path {
        "/jpg" => ok("image/jpeg", JPEG),
        "/png-octet" => ok("application/octet-stream", PNG),
        "/svg" => ok("image/svg+xml", b"<svg xmlns='http://www.w3.org/2000/svg'/>"),
        "/html" => ok("text/html", b"<html>"),
        "/octet-html" => ok("application/octet-stream", b"<html>"),
        "/hop" => head("302 Found\r\nLocation: /jpg\r\nContent-Length: 0"),
        "/escape" => head("302 Found\r\nLocation: http://169.254.169.254/latest/meta-data\r\nContent-Length: 0"),
        "/to-private" => head("302 Found\r\nLocation: https://10.0.0.1/x\r\nContent-Length: 0"),
        "/huge" => head("200 OK\r\nContent-Type: image/png\r\nContent-Length: 26214401"),
        "/cut" => [head("200 OK\r\nContent-Type: image/png\r\nContent-Length: 100"), PNG.to_vec()].concat(),
        _ => head("404 Not Found\r\nContent-Length: 0"),
    }
}

/// An upstream on loopback answering by path; returns its port.
async fn upstream() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            tokio::spawn(async move {
                let mut buf = vec![0u8; 8192];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]).into_owned();
                let path = request.split(' ').nth(1).unwrap_or("/").to_string();
                let _ = socket.write_all(&upstream_answer(&path)).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    port
}

fn encode(url: &str) -> String {
    url::form_urlencoded::byte_serialize(url.as_bytes()).collect()
}

async fn image(port: u16, url: &str) -> Reply {
    get(port, &format!("/api/image-proxy?url={}", encode(url))).await
}

#[tokio::test]
async fn relays_raster_images_with_nosniff_and_refuses_everything_else() {
    let s = start().await;
    let origin = format!("http://127.0.0.1:{}", upstream().await);
    let jpg = image(s.port, &format!("{origin}/jpg")).await;
    assert_eq!((jpg.status, jpg.body.as_slice()), (200, JPEG));
    assert_eq!(jpg.header("content-type"), Some("image/jpeg"));
    assert_eq!(jpg.header("cache-control"), Some("no-store"));
    assert_eq!(jpg.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(jpg.header("transfer-encoding"), Some("chunked"));
    let sniffed = image(s.port, &format!("{origin}/png-octet")).await;
    assert_eq!((sniffed.status, sniffed.header("content-type")), (200, Some("image/png")));
    for p in ["/svg", "/html", "/octet-html"] {
        let refused = image(s.port, &format!("{origin}{p}")).await;
        assert_eq!((refused.status, refused.text().as_str()), (406, "not an image"), "{p}");
    }
    let missing = image(s.port, &format!("{origin}/missing")).await;
    assert_eq!((missing.status, missing.body.len()), (404, 0));
    s.stop().await;
}

#[tokio::test]
async fn follows_redirects_only_to_allowed_targets() {
    let s = start().await;
    let origin = format!("http://127.0.0.1:{}", upstream().await);
    let hop = image(s.port, &format!("{origin}/hop")).await;
    assert_eq!((hop.status, hop.header("content-type")), (200, Some("image/jpeg")));
    let escape = image(s.port, &format!("{origin}/escape")).await;
    assert_eq!((escape.status, escape.text().as_str()), (502, "redirect refused"));
    // An https hop to a private address is refused before it connects, a 504 as in Node.
    let private = image(s.port, &format!("{origin}/to-private")).await;
    assert_eq!((private.status, private.body.len()), (504, 0));
    s.stop().await;
}

#[tokio::test]
async fn maps_oversize_cut_and_unreachable_upstreams_to_node_statuses() {
    let s = start().await;
    let origin = format!("http://127.0.0.1:{}", upstream().await);
    assert_eq!(image(s.port, &format!("{origin}/huge")).await.status, 413);
    assert_eq!(image(s.port, &format!("{origin}/cut")).await.status, 502);
    let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let dead = closed.local_addr().unwrap().port();
    drop(closed);
    assert_eq!(image(s.port, &format!("http://127.0.0.1:{dead}/a")).await.status, 504);
    // This machine over https, as a literal, an IPv4-mapped literal or a name: refused before any connection.
    for url in ["https://127.0.0.1:1/a.png", "https://[::ffff:127.0.0.1]:1/a.png", "https://localhost:1/a.png", "https://169.254.169.254/latest"] {
        assert_eq!(image(s.port, url).await.status, 504, "{url}");
    }
    s.stop().await;
}

#[tokio::test]
async fn refuses_bad_image_targets_and_other_methods() {
    let s = start().await;
    assert_eq!(get(s.port, "/api/image-proxy").await.status, 400);
    for url in ["not a url", "http://example.com/a.png", "file:///etc/passwd", "ftp://example.com/a", "http://127.0.0.2/a", "http://[::ffff:127.0.0.1]/a"] {
        let refused = image(s.port, url).await;
        assert_eq!((refused.status, refused.body.len()), (400, 0), "{url}");
    }
    for method in ["POST", "DELETE", "OPTIONS"] {
        assert_eq!(send(s.port, method, "/api/image-proxy?url=x", &[], "").await.status, 405, "{method}");
    }
    s.stop().await;
}

#[tokio::test]
async fn the_font_proxy_refuses_other_urls_and_serves_a_fresh_catalogue_copy() {
    let s = start().await;
    assert_eq!(send(s.port, "POST", "/api/font-proxy?url=x", &[], "").await.status, 405);
    for url in ["", "https://evil.example/x", "http://www.fontsquirrel.com/x", "https://fonts.google.com/x"] {
        let refused = get(s.port, &format!("/api/font-proxy?url={}", encode(url))).await;
        assert_eq!((refused.status, refused.text().as_str()), (400, "not an allowed font URL"), "{url}");
    }
    let cache = s.dir.path().join("data/cache");
    std::fs::create_dir_all(&cache).unwrap();
    std::fs::write(cache.join("fontsquirrel-list.json"), "[{\"family_name\":\"Roboto\"}]").unwrap();
    let list = get(s.port, &format!("/api/font-proxy?url={}", encode("https://www.fontsquirrel.com/api/fontlist/all"))).await;
    assert_eq!((list.status, list.text().as_str()), (200, "[{\"family_name\":\"Roboto\"}]"));
    assert_eq!(list.header("content-type"), Some("application/octet-stream"));
    assert_eq!(list.header("cache-control"), Some("no-store"));
    assert_eq!(list.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(list.header("content-security-policy"), Some("sandbox; default-src 'none'"));
    s.stop().await;
}
