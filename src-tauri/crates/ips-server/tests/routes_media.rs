// The media routes over a real socket: /api/assets, /api/canvases, /api/library and /api/infopanel/installed, with every
// status they return and the bytes a client sees.

use std::path::{Path, PathBuf};
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
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

async fn start_in(dir: tempfile::TempDir) -> Server {
    let bound = bind_with_home(config(dir.path()), dir.path().join("home")).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, dir, stop: Some(stop), done }
}

async fn start() -> Server {
    start_in(tempfile::tempdir().unwrap()).await
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

    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap_or_else(|e| panic!("{e}: {}", self.text()))
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

fn parse(raw: &[u8], head_only: bool) -> Reply {
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap_or_else(|| panic!("no head in {:?}", String::from_utf8_lossy(raw)));
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let mut lines = head.split("\r\n");
    let status = lines.next().unwrap().split(' ').nth(1).unwrap().parse().unwrap();
    let headers: Vec<(String, String)> = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_string(), v.trim().to_string())).collect();
    let rest = &raw[split + 4..];
    let chunked = headers.iter().any(|(k, v)| k.eq_ignore_ascii_case("transfer-encoding") && v == "chunked");
    let body = if head_only { Vec::new() } else if chunked { dechunk(rest) } else { rest.to_vec() };
    Reply { status, body, headers }
}

/// `method path` with `headers` (a Host is added) and the raw body, read to the end of the answer.
async fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &[u8]) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n", body.len()));
    stream.write_all(request.as_bytes()).await.unwrap();
    stream.write_all(body).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    parse(&raw, method == "HEAD")
}

async fn get(port: u16, path: &str) -> Reply {
    send(port, "GET", path, &[], b"").await
}

const PNG: [u8; 12] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const UPLOAD: [(&str, &str); 2] = [("Content-Type", "image/png"), ("X-Dashboard-Asset", "1")];
const ASSET_ONLY: [(&str, &str); 1] = [("X-Dashboard-Asset", "1")];

async fn upload(port: u16, headers: &[(&str, &str)], body: &[u8]) -> Reply {
    send(port, "POST", "/api/assets", headers, body).await
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

#[tokio::test]
async fn uploads_serves_lists_and_deletes_assets() {
    let dir = tempfile::tempdir().unwrap();
    // The leftover of an upload a restart cut off goes at start.
    std::fs::create_dir_all(dir.path().join("data/assets")).unwrap();
    std::fs::write(dir.path().join("data/assets/.upload-old.tmp"), "x").unwrap();
    std::fs::write(dir.path().join("data/assets/keep.txt"), "x").unwrap();
    let s = start_in(dir).await;
    assert!(!s.data().join("assets/.upload-old.tmp").exists() && s.data().join("assets/keep.txt").exists());
    assert_eq!(get(s.port, "/api/assets").await.json(), json!([]));

    let mut png = PNG.to_vec();
    png.extend(b"IHDR-and-more-bytes");
    let saved = upload(s.port, &UPLOAD, &png).await;
    assert_eq!(saved.status, 200);
    let id = format!("{}.png", sha256_hex(&png));
    assert_eq!(saved.json(), json!({ "id": id, "url": format!("/api/assets/{id}"), "type": "image/png", "size": png.len() }));
    assert_eq!(saved.header("content-type"), Some("application/json; charset=utf-8"));
    assert_eq!(upload(s.port, &UPLOAD, &png).await.json()["id"], json!(id));
    assert_eq!(std::fs::read_dir(s.data().join("assets")).unwrap().count(), 2);

    let served = get(s.port, &format!("/api/assets/{id}")).await;
    assert_eq!((served.status, served.body.clone()), (200, png.clone()));
    assert_eq!(served.header("cache-control"), Some("public, max-age=31536000, immutable"));
    assert_eq!(served.header("content-type"), Some("image/png"));
    assert_eq!(served.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(served.header("accept-ranges"), Some("bytes"));
    assert_eq!(served.header("content-length"), Some(png.len().to_string().as_str()));
    let listed = get(s.port, "/api/assets").await.json();
    assert_eq!(listed[0]["id"], json!(id));
    assert_eq!((listed[0]["kind"].as_str(), listed[0]["type"].as_str(), listed[0]["size"].as_u64()), (Some("image"), Some("image/png"), Some(png.len() as u64)));

    let range = send(s.port, "GET", &format!("/api/assets/{id}"), &[("Range", "bytes=2-5")], b"").await;
    assert_eq!((range.status, range.body.clone(), range.header("content-range").map(String::from)), (206, png[2..6].to_vec(), Some(format!("bytes 2-5/{}", png.len()))));
    let suffix = send(s.port, "GET", &format!("/api/assets/{id}"), &[("Range", "bytes=-3")], b"").await;
    assert_eq!((suffix.status, suffix.body), (206, png[png.len() - 3..].to_vec()));
    let past = send(s.port, "GET", &format!("/api/assets/{id}"), &[("Range", "bytes=999-")], b"").await;
    assert_eq!((past.status, past.header("content-range").map(String::from), past.body.len()), (416, Some(format!("bytes */{}", png.len())), 0));
    let whole = send(s.port, "GET", &format!("/api/assets/{id}"), &[("Range", "bytes=5-2")], b"").await;
    assert_eq!((whole.status, whole.body.len()), (200, png.len()));
    let head = send(s.port, "HEAD", &format!("/api/assets/{id}"), &[], b"").await;
    assert_eq!((head.status, head.header("content-length").map(String::from)), (200, Some(png.len().to_string())));

    // ?unused=1 keeps out what the config, a library item or a canvas names.
    assert_eq!(get(s.port, "/api/assets?unused=1").await.json().as_array().unwrap().len(), 1);
    std::fs::write(s.data().join("config.json"), format!("{{\"bg\":\"/api/assets/{id}\"}}")).unwrap();
    assert_eq!(get(s.port, "/api/assets?unused=1").await.json(), json!([]));
    std::fs::remove_file(s.data().join("config.json")).unwrap();
    std::fs::create_dir_all(s.data().join("library")).unwrap();
    std::fs::write(s.data().join("library/x.json"), &id).unwrap();
    assert_eq!(get(s.port, "/api/assets?unused=1").await.json(), json!([]));
    std::fs::remove_file(s.data().join("library/x.json")).unwrap();
    assert_eq!(get(s.port, "/api/assets?unused=0").await.json().as_array().unwrap().len(), 1);

    let url = format!("/api/assets/{id}");
    assert_eq!(send(s.port, "DELETE", &url, &[], b"").await.status, 403);
    assert_eq!(send(s.port, "DELETE", &url, &ASSET_ONLY, b"").await.status, 204);
    assert_eq!(send(s.port, "DELETE", &url, &ASSET_ONLY, b"").await.status, 404);
    assert_eq!(get(s.port, &url).await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn serves_svg_with_its_sandbox_and_an_empty_file_whole() {
    let s = start().await;
    let svg = br#"<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>"#;
    let saved = upload(s.port, &[("Content-Type", "image/svg+xml"), ("X-Dashboard-Asset", "1")], svg).await;
    let id = saved.json()["id"].as_str().unwrap().to_string();
    assert!(id.ends_with(".svg"));
    let served = get(s.port, &format!("/api/assets/{id}")).await;
    assert_eq!(served.header("content-security-policy"), Some("default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"));
    assert_eq!(served.header("content-type"), Some("image/svg+xml"));
    // An empty stored file: a Range is unsatisfiable, no Range is an empty 200.
    let empty = format!("{}.png", "e".repeat(64));
    std::fs::write(s.data().join("assets").join(&empty), b"").unwrap();
    let whole = get(s.port, &format!("/api/assets/{empty}")).await;
    assert_eq!((whole.status, whole.body.len(), whole.header("content-length")), (200, 0, Some("0")));
    assert_eq!(send(s.port, "GET", &format!("/api/assets/{empty}"), &[("Range", "bytes=-1")], b"").await.status, 416);
    s.stop().await;
}

#[tokio::test]
async fn refuses_uploads_the_way_node_does() {
    let s = start().await;
    let p = s.port;
    assert_eq!(upload(p, &[("Content-Type", "image/png")], &PNG).await.text(), "missing X-Dashboard-Asset header");
    assert_eq!(upload(p, &[("Content-Type", "image/png")], &PNG).await.status, 403);
    let unsupported = upload(p, &[("Content-Type", "text/html"), ("X-Dashboard-Asset", "1")], b"<html>").await;
    assert_eq!((unsupported.status, unsupported.text().starts_with("unsupported type: png, jpeg")), (415, true));
    assert_eq!(upload(p, &[("X-Dashboard-Asset", "1")], &PNG).await.status, 415);
    let mismatch = upload(p, &UPLOAD, b"GIF89a....").await;
    assert_eq!((mismatch.status, mismatch.text().as_str(), mismatch.header("connection")), (415, "file content does not match its type", Some("close")));
    let mut late = vec![0u8; 2048];
    late[..PNG.len()].copy_from_slice(&PNG);
    late.extend(b"<html>");
    assert_eq!(upload(p, &UPLOAD, &b"<html>".repeat(300)).await.status, 415);
    assert_eq!(upload(p, &UPLOAD, &late).await.status, 200);
    let empty = upload(p, &UPLOAD, b"").await;
    assert_eq!((empty.status, empty.text().as_str()), (400, "empty body"));
    // A body over the limit, announced: refused before it is read.
    let mut stream = TcpStream::connect(("127.0.0.1", p)).await.unwrap();
    let head = format!("POST /api/assets HTTP/1.1\r\nHost: 127.0.0.1:{p}\r\nContent-Type: image/svg+xml\r\nX-Dashboard-Asset: 1\r\nContent-Length: 300000\r\n\r\n");
    stream.write_all(head.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().ok();
    let big = parse(&raw, false);
    assert_eq!((big.status, big.header("connection"), big.body.len()), (413, Some("close"), 0));
    // Wrong methods and paths that are not ids.
    assert_eq!(send(p, "PUT", "/api/assets", &[], b"").await.status, 405);
    let id = format!("{}.png", "a".repeat(64));
    assert_eq!(send(p, "PUT", &format!("/api/assets/{id}"), &[], b"").await.status, 405);
    for bad in ["/api/assets/", "/api/assets/..%2fconfig.json", "/api/assets/nope.png", &format!("/api/assets/{}.PNG", "a".repeat(64))] {
        assert_eq!(get(p, bad).await.status, 404, "{bad}");
        assert_eq!(send(p, "PUT", bad, &[], b"").await.status, 404, "{bad}");
    }
    assert_eq!(send(p, "DELETE", &format!("/api/assets/{}", "../x"), &ASSET_ONLY, b"").await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn answers_429_while_two_uploads_are_running() {
    let s = start().await;
    let p = s.port;
    let mut open = Vec::new();
    for _ in 0..2 {
        let mut stream = TcpStream::connect(("127.0.0.1", p)).await.unwrap();
        let head = format!("POST /api/assets HTTP/1.1\r\nHost: 127.0.0.1:{p}\r\nContent-Type: image/png\r\nX-Dashboard-Asset: 1\r\nContent-Length: 100\r\n\r\n");
        stream.write_all(head.as_bytes()).await.unwrap();
        stream.write_all(&PNG).await.unwrap();
        open.push(stream);
    }
    tokio::time::sleep(Duration::from_millis(300)).await;
    let busy = upload(p, &UPLOAD, &PNG).await;
    assert_eq!((busy.status, busy.text().as_str(), busy.header("connection")), (429, "too many uploads in progress", Some("close")));
    drop(open);
    tokio::time::sleep(Duration::from_millis(300)).await;
    // The aborted uploads left no file and gave their slots back.
    assert_eq!(upload(p, &UPLOAD, &PNG).await.status, 200);
    let names: Vec<String> = std::fs::read_dir(s.data().join("assets")).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names.len(), 1, "{names:?}");
    s.stop().await;
}

const CANVAS_WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Canvas", "1")];

fn canvas(name: &str) -> String {
    json!({ "format": "infopanel-canvas", "version": 1, "source": { "name": name }, "items": [] }).to_string()
}

#[tokio::test]
async fn stores_canvases_by_content_and_checks_the_refs_of_a_config() {
    let s = start().await;
    let p = s.port;
    let text = canvas("ARCv2");
    let saved = send(p, "POST", "/api/canvases", &CANVAS_WRITE, text.as_bytes()).await;
    assert_eq!(saved.status, 200);
    let id = saved.json()["id"].as_str().unwrap().to_string();
    assert!(id.starts_with("cnv_") && id.len() == 36);
    assert_eq!(send(p, "POST", "/api/canvases", &CANVAS_WRITE, text.as_bytes()).await.json()["id"], json!(id));
    let read = get(p, &format!("/api/canvases/{id}")).await;
    assert_eq!((read.status, read.text(), read.header("content-type")), (200, text.clone(), Some("application/json; charset=utf-8")));
    assert_eq!(std::fs::read_to_string(s.data().join(format!("canvases/{id}.json"))).unwrap(), text);

    assert_eq!(send(p, "POST", "/api/canvases", &[("Content-Type", "application/json")], text.as_bytes()).await.text(), "missing X-Dashboard-Canvas header");
    assert_eq!(send(p, "POST", "/api/canvases", &[("X-Dashboard-Canvas", "1")], text.as_bytes()).await.status, 415);
    assert_eq!(send(p, "POST", "/api/canvases", &CANVAS_WRITE, b"{}").await.text(), "expected a canvas (format \"infopanel-canvas\")");
    assert_eq!(send(p, "POST", "/api/canvases", &CANVAS_WRITE, b"{nope").await.text(), "expected JSON");
    let huge = vec![b' '; 8 * 1024 * 1024 + 1];
    let too_big = send(p, "POST", "/api/canvases", &CANVAS_WRITE, &huge).await;
    assert_eq!((too_big.status, too_big.header("connection")), (413, Some("close")));
    assert_eq!(get(p, "/api/canvases").await.status, 405);
    assert_eq!(send(p, "PUT", &format!("/api/canvases/{id}"), &CANVAS_WRITE, b"").await.status, 405);
    assert_eq!(send(p, "DELETE", &format!("/api/canvases/{id}"), &CANVAS_WRITE, b"").await.status, 405);
    for bad in ["/api/canvases/", "/api/canvases/..%2fconfig", "/api/canvases/cnv_00000000000000000000000000000000"] {
        assert_eq!(get(p, bad).await.status, 404, "{bad}");
    }
    assert_eq!(send(p, "PUT", "/api/canvases/nope", &[], b"").await.status, 404);

    let config = |r: &str| json!({ "version": 1, "profiles": [{ "pages": [{ "placements": [{ "canvasRef": r }] }] }] }).to_string();
    let headers = [("Content-Type", "application/json"), ("X-Dashboard-Config", "1")];
    let missing = format!("cnv_{}", "0".repeat(32));
    let refused = send(p, "POST", "/api/config", &headers, config(&missing).as_bytes()).await;
    assert_eq!((refused.status, refused.text()), (422, format!("canvas files missing from the store: {missing}")));
    assert_eq!(send(p, "POST", "/api/config", &headers, config(&id).as_bytes()).await.status, 200);
    s.stop().await;
}

const LIBRARY_WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Library", "1")];

#[tokio::test]
async fn keeps_the_library_with_its_guards_and_statuses() {
    let s = start().await;
    let p = s.port;
    assert_eq!(get(p, "/api/library").await.json(), json!([]));
    let made = send(p, "POST", "/api/library", &LIBRARY_WRITE, br#"{"kind":"gauge","name":"  Arc ","data":{"shape":"arc"},"junk":1}"#).await;
    assert_eq!(made.status, 201);
    let item = made.json();
    let id = item["id"].as_str().unwrap().to_string();
    assert_eq!(item["name"], json!("Arc"));
    assert_eq!(item.as_object().unwrap().keys().collect::<Vec<_>>(), ["id", "kind", "name", "createdAt", "updatedAt", "files", "meta", "copies", "data"]);
    assert_eq!(std::fs::read_to_string(s.data().join(format!("library/{id}.json"))).unwrap(), serde_json::to_string(&item).unwrap());
    assert_eq!(get(p, "/api/library").await.json(), json!([item]));
    assert_eq!(get(p, &format!("/api/library/{id}")).await.json(), item);

    let updated = send(p, "PUT", &format!("/api/library/{id}"), &LIBRARY_WRITE, br#"{"name":"Arc 2"}"#).await;
    assert_eq!((updated.status, updated.json()["name"].clone(), updated.json()["createdAt"].clone()), (200, json!("Arc 2"), item["createdAt"].clone()));
    assert_eq!(send(p, "PUT", &format!("/api/library/{id}"), &LIBRARY_WRITE, br#"{"kind":"image"}"#).await.text(), "kind cannot change");
    assert_eq!(send(p, "PUT", "/api/library/lib_missing0000", &LIBRARY_WRITE, br#"{"name":""}"#).await.status, 404);
    assert_eq!(send(p, "POST", "/api/library", &LIBRARY_WRITE, br#"{"kind":"nope","name":"x"}"#).await.status, 400);
    assert_eq!(send(p, "POST", "/api/library", &LIBRARY_WRITE, b"nope").await.text(), "expected a JSON body under 8 MB");
    assert_eq!(send(p, "POST", "/api/library", &LIBRARY_WRITE, b"null").await.text(), "expected an object");
    let huge = vec![b' '; 8 * 1024 * 1024 + 1025];
    assert_eq!(send(p, "POST", "/api/library", &LIBRARY_WRITE, &huge).await.text(), "expected a JSON body under 8 MB");

    assert_eq!(send(p, "POST", "/api/library", &[("Content-Type", "application/json")], b"{}").await.text(), "missing X-Dashboard-Library header");
    assert_eq!(send(p, "POST", "/api/library", &[("X-Dashboard-Library", "1")], b"{}").await.status, 415);
    assert_eq!(send(p, "PATCH", "/api/library", &[], b"").await.status, 405);
    assert_eq!(send(p, "PATCH", &format!("/api/library/{id}"), &[], b"").await.status, 405);
    assert_eq!(get(p, "/api/library/nope").await.status, 404);
    assert_eq!(get(p, "/api/library/lib_missing0000").await.status, 404);
    assert_eq!(send(p, "DELETE", &format!("/api/library/{id}"), &[], b"").await.status, 403);
    assert_eq!(send(p, "DELETE", &format!("/api/library/{id}"), &[("X-Dashboard-Library", "1")], b"").await.status, 204);
    assert_eq!(send(p, "DELETE", &format!("/api/library/{id}"), &[("X-Dashboard-Library", "1")], b"").await.status, 404);
    s.stop().await;
}

const G1: &str = "70538526-f13f-4074-bb42-f6892d6e42d4";

#[tokio::test]
async fn serves_the_installed_infopanel_profiles_read_only() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("infopanel");
    std::fs::create_dir_all(root.join("profiles")).unwrap();
    std::fs::create_dir_all(root.join(format!("assets/{G1}"))).unwrap();
    std::fs::write(root.join("profiles.xml"), format!("<ArrayOfProfile><Profile><Guid>{G1}</Guid><Name>A &amp; B</Name></Profile></ArrayOfProfile>")).unwrap();
    std::fs::write(root.join(format!("profiles/{G1}.xml")), "<ArrayOfDisplayItem/>").unwrap();
    std::fs::write(root.join(format!("assets/{G1}/logo.png")), [1u8, 2, 3]).unwrap();
    std::fs::write(root.join(format!("assets/{G1}/a b.png")), "x").unwrap();
    let s = start_in(dir).await;
    let p = s.port;
    let listed = get(p, "/api/infopanel/installed").await;
    assert_eq!(listed.json(), json!([{ "guid": G1, "name": "A & B", "bytes": 21, "assets": ["a b.png", "logo.png"] }]));
    let base = format!("/api/infopanel/installed/{G1}");
    let profile = get(p, &format!("{base}/Profile.xml")).await;
    assert_eq!(profile.text(), format!("<Profile><Guid>{G1}</Guid><Name>A &amp; B</Name></Profile>"));
    assert_eq!((profile.header("content-type"), profile.header("cache-control"), profile.header("x-content-type-options")), (Some("application/xml; charset=utf-8"), Some("no-store"), Some("nosniff")));
    assert_eq!(get(p, &format!("{base}/DisplayItems.xml")).await.text(), "<ArrayOfDisplayItem/>");
    let asset = get(p, &format!("{base}/assets/logo.png")).await;
    assert_eq!((asset.body.clone(), asset.header("content-type")), (vec![1, 2, 3], Some("application/octet-stream")));
    assert_eq!(get(p, &format!("{base}/assets/a%20b.png")).await.text(), "x");
    for bad in ["/api/infopanel/installed/", base.as_str(), &format!("{base}/"), &format!("{base}/assets"), &format!("{base}/assets/gone.png"), &format!("{base}/assets/..%2fx"), &format!("{base}/assets/%ff"), &format!("{base}/assets/%"), &format!("{base}/assets/.."), &format!("{base}/Other.xml"), "/api/infopanel/installed/nope/Profile.xml", &format!("{base}/profile.xml")] {
        assert_eq!(get(p, bad).await.status, 404, "{bad}");
    }
    for method in ["POST", "PUT", "DELETE", "HEAD"] {
        assert_eq!(send(p, method, "/api/infopanel/installed", &[], b"").await.status, 405, "{method}");
    }
    s.stop().await;

    // No profiles.xml at all: an empty list.
    let s = start().await;
    assert_eq!(get(s.port, "/api/infopanel/installed").await.json(), json!([]));
    s.stop().await;
}
