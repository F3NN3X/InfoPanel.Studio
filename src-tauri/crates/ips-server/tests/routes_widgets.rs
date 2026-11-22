// The user-widget routes over a real socket (/api/widgets, /api/widgets/<key>/<file>), as routes_packs.rs does for packs: a
// server on a free port with a temp data folder, and raw HTTP/1.1 requests. A package is files in DATA_DIR/widgets/<key>/; the
// checks here are an import's structure and its manifest (sizes and SHA-256), the round trip, path safety (every spelling of a
// way out of the folder), the caps, the types and headers, and the write guards; and (Phase 6a) publisher signatures: a code widget
// signed with the TEST-ONLY key (tests/fixtures/widgets/) is taken only once that key is trusted through the store the Settings
// window's commands write, is checked again on every read, and no HTTP request adds or removes a key.

use std::path::PathBuf;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use ips_server::widget_keys::KeyStore;
use ips_server::widgets::sha256_hex;
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
    fn widgets(&self) -> PathBuf {
        self.dir.path().join("data").join("widgets")
    }

    /// The publisher keys of this server's data folder, as the Settings window's commands reach them.
    fn keys(&self) -> KeyStore {
        KeyStore::new(&self.dir.path().join("data"))
    }

    async fn stop(mut self) {
        let _ = self.stop.take().unwrap().send(());
        tokio::time::timeout(Duration::from_secs(5), &mut self.done).await.expect("graceful stop").unwrap();
    }
}

async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    std::fs::write(dir.path().join("dist/index.html"), "<p>index</p>").unwrap();
    let cfg = ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        action_runner: false,
        obs_stream: false,
        agent_approvals: vec![],
        agent_key_file: None,
        dist: dir.path().join("dist"),
        data_dir: dir.path().join("data"),
        infopanel_dir: dir.path().join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    };
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, dir, stop: Some(stop), done }
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
    let _ = stream.write_all(request.as_bytes()).await;
    let mut raw = Vec::new();
    let _ = tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await;
    let Some(split) = raw.windows(4).position(|w| w == b"\r\n\r\n") else {
        return Reply { status: 0, headers: vec![], body: vec![] };
    };
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

const WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Widget", "1")];
/// A PNG's signature and a little more: enough to be an image file of the package.
const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

/// A package's files: recipe.json, the images given, and a manifest listing them with their sizes and hashes.
fn package_with(id: &str, version: &str, images: &[(&str, &[u8])]) -> Vec<(String, Vec<u8>)> {
    let recipe = format!("{}\n", json!({ "format": 1, "id": id, "name": "Mine", "version": version, "author": "me" })).into_bytes();
    let mut files: Vec<(String, Vec<u8>)> = vec![("recipe.json".into(), recipe)];
    files.extend(images.iter().map(|(p, b)| (p.to_string(), b.to_vec())));
    let listed: Vec<Value> = files.iter().map(|(p, b)| json!({ "path": p, "bytes": b.len(), "sha256": sha256_hex(b) })).collect();
    let manifest = format!(
        "{}\n",
        json!({ "format": 1, "kind": "recipe", "id": id, "version": version, "author": "me", "name": "Mine", "files": listed })
    )
    .into_bytes();
    files.insert(0, ("manifest.json".into(), manifest));
    files
}

fn package(id: &str) -> Vec<(String, Vec<u8>)> {
    package_with(id, "1.0.0", &[("images/logo.png", PNG)])
}

fn import_body(files: &[(String, Vec<u8>)]) -> String {
    let list: Vec<Value> = files.iter().map(|(p, b)| json!({ "path": p, "data": STANDARD.encode(b) })).collect();
    json!({ "files": list }).to_string()
}

/// A package's files on disk, as an import leaves them.
fn write_package(s: &Server, key: &str, files: &[(String, Vec<u8>)]) -> PathBuf {
    let root = s.widgets().join(key);
    for (path, bytes) in files {
        std::fs::create_dir_all(root.join(path).parent().unwrap()).unwrap();
        std::fs::write(root.join(path), bytes).unwrap();
    }
    root
}

fn list(reply: &Reply) -> Vec<Value> {
    serde_json::from_slice::<Value>(&reply.body).unwrap().as_array().unwrap().clone()
}

#[tokio::test]
async fn an_import_is_stored_listed_and_served_byte_for_byte() {
    let s = start().await;
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]");
    let files = package("recipe:mine");
    let reply = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&files)).await;
    assert_eq!(reply.status, 200, "{}", reply.text());
    let stored: Value = serde_json::from_slice(&reply.body).unwrap();
    assert_eq!(stored["id"], "recipe:mine");
    // the round trip: every file comes back as it went in
    for (path, bytes) in &files {
        let back = get(s.port, &format!("/api/widgets/recipe.mine/{path}")).await;
        assert_eq!(back.status, 200, "{path}");
        assert_eq!(&back.body, bytes, "{path}");
    }
    let items = list(&get(s.port, "/api/widgets").await);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], "recipe:mine");
    assert_eq!(items[0]["kind"], "recipe");
    assert_eq!(items[0]["name"], "Mine");
    assert_eq!(items[0]["version"], "1.0.0");
    assert_eq!(items[0]["size"].as_u64(), Some(files.iter().map(|(_, b)| b.len() as u64).sum()));
    assert_eq!(items[0]["origin"], "import", "a file import is the default");
    assert_eq!(items[0]["trust"], "unsigned", "a recipe without a signature");
    assert_eq!(items[0].as_object().unwrap().len(), 7, "id, kind, name, version, size, origin and trust only");
    assert!(
        s.widgets().read_dir().unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".import-")),
        "no temp folder left"
    );
    // a second import replaces the package whole
    let next = package_with("recipe:mine", "1.1.0", &[]);
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&next)).await.status, 200);
    assert_eq!(get(s.port, "/api/widgets/recipe.mine/images/logo.png").await.status, 404);
    assert_eq!(list(&get(s.port, "/api/widgets").await)[0]["version"], "1.1.0");
    let names: Vec<String> = s.widgets().read_dir().unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names, ["recipe.mine"], "no set-aside folder left");
    s.stop().await;
}

fn import_with_origin(files: &[(String, Vec<u8>)], origin: &str) -> String {
    let mut body: Value = serde_json::from_str(&import_body(files)).unwrap();
    body["origin"] = json!(origin);
    body.to_string()
}

#[tokio::test]
async fn the_server_records_where_a_package_came_from_outside_the_package() {
    let s = start().await;
    let files = package("recipe:mine");
    // the builder's save
    let saved = send(s.port, "POST", "/api/widgets", &WRITE, &import_with_origin(&files, "studio")).await;
    assert_eq!(saved.status, 200, "{}", saved.text());
    assert_eq!(serde_json::from_slice::<Value>(&saved.body).unwrap()["origin"], "studio");
    assert_eq!(list(&get(s.port, "/api/widgets").await)[0]["origin"], "studio");
    assert_eq!(std::fs::read_to_string(s.widgets().join("recipe.mine/.origin")).unwrap(), "studio");
    // the sidecar is never a package file: not served, and every file the manifest lists comes back byte for byte
    assert_eq!(get(s.port, "/api/widgets/recipe.mine/.origin").await.status, 404);
    for (path, bytes) in &files {
        assert_eq!(&get(s.port, &format!("/api/widgets/recipe.mine/{path}")).await.body, bytes, "{path}");
    }
    // the same id imported from a file replaces the package and keeps the stored origin (Q7): your own export stays yours
    let newer = package_with("recipe:mine", "1.0.1", &[]);
    let replaced = send(s.port, "POST", "/api/widgets", &WRITE, &import_with_origin(&newer, "import")).await;
    assert_eq!((replaced.status, serde_json::from_slice::<Value>(&replaced.body).unwrap()["origin"].as_str()), (200, Some("studio")));
    assert_eq!(list(&get(s.port, "/api/widgets").await)[0]["origin"], "studio");
    assert_eq!(list(&get(s.port, "/api/widgets").await)[0]["version"], "1.0.1");
    for (path, bytes) in &newer {
        assert_eq!(&get(s.port, &format!("/api/widgets/recipe.mine/{path}")).await.body, bytes, "{path}");
    }
    // a new id from a file is an import
    let other = send(s.port, "POST", "/api/widgets", &WRITE, &import_with_origin(&package("recipe:theirs"), "import")).await;
    assert_eq!(serde_json::from_slice::<Value>(&other.body).unwrap()["origin"], "import");
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe.theirs", &WRITE, "").await.status, 204);
    // a package without the sidecar (stored before origins) is an import; an unknown origin is refused
    std::fs::remove_file(s.widgets().join("recipe.mine/.origin")).unwrap();
    assert_eq!(list(&get(s.port, "/api/widgets").await)[0]["origin"], "import");
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_with_origin(&files, "themely")).await.status, 400);
    // a sidecar folder, not a file, is a stray name: the folder is not a package
    std::fs::create_dir(s.widgets().join("recipe.mine/.origin")).unwrap();
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]");
    s.stop().await;
}

#[tokio::test]
async fn serves_a_file_with_its_type_nosniff_and_a_csp_that_allows_nothing() {
    let s = start().await;
    write_package(
        &s,
        "recipe.mine",
        &package_with(
            "recipe:mine",
            "1.0.0",
            &[("images/a.png", PNG), ("images/b.jpg", &[0xff, 0xd8, 0xff, 0]), ("images/c.webp", b"RIFF0000WEBP")],
        ),
    );
    for (file, mime) in [
        ("manifest.json", "application/json; charset=utf-8"),
        ("recipe.json", "application/json; charset=utf-8"),
        ("images/a.png", "image/png"),
        ("images/b.jpg", "image/jpeg"),
        ("images/c.webp", "image/webp"),
    ] {
        let reply = get(s.port, &format!("/api/widgets/recipe.mine/{file}")).await;
        assert_eq!(reply.status, 200, "{file}");
        assert_eq!(reply.header("content-type"), Some(mime), "{file}");
        assert_eq!(reply.header("x-content-type-options"), Some("nosniff"), "{file}");
        assert_eq!(reply.header("content-security-policy"), Some("default-src 'none'; sandbox"), "{file}");
    }
    let head = send(s.port, "HEAD", "/api/widgets/recipe.mine/recipe.json", &[], "").await;
    assert_eq!(head.status, 200);
    assert!(head.body.is_empty());
    s.stop().await;
}

#[tokio::test]
async fn a_missing_package_a_missing_file_and_a_wrong_type_are_404() {
    let s = start().await;
    write_package(&s, "recipe.mine", &package("recipe:mine"));
    for path in [
        "/api/widgets/recipe.nope/manifest.json",
        "/api/widgets/recipe.mine/images/none.png",
        "/api/widgets/recipe.mine",
        "/api/widgets/recipe.mine/",
        "/api/widgets/",
        "/api/widgets/recipe.mine/images/logo.gif",
        "/api/widgets/recipe.mine/images/logo.svg",
        "/api/widgets/recipe.mine/bundle.js",
        "/api/widgets/recipe.mine/pack.json",
        "/api/widgets/recipe.mine/images/logo.PNG",
        "/api/widgets/recipe:mine/manifest.json",
        "/api/widgets/mine/manifest.json",
    ] {
        assert_eq!(get(s.port, path).await.status, 404, "{path}");
    }
    s.stop().await;
}

#[tokio::test]
async fn no_spelling_of_a_way_out_reaches_a_file_outside_the_package() {
    let s = start().await;
    write_package(&s, "recipe.mine", &package("recipe:mine"));
    write_package(&s, "recipe.other", &package("recipe:other"));
    std::fs::write(s.widgets().join("secret.json"), "SECRET").unwrap();
    std::fs::write(s.dir.path().join("data").join("config.json"), "SECRET").unwrap();
    std::fs::write(s.dir.path().join("secret.json"), "SECRET").unwrap();
    let own: Vec<Vec<u8>> =
        [package("recipe:mine"), package("recipe:other")].concat().into_iter().map(|(_, b)| b).chain([b"<p>index</p>".to_vec()]).collect();
    let spellings = [
        "..",
        "../secret.json",
        "../../secret.json",
        "../../../secret.json",
        "..%2fsecret.json",
        "..%2Fsecret.json",
        "%2e%2e/secret.json",
        "%2e%2e%2fsecret.json",
        ".%2e/secret.json",
        "..%5csecret.json",
        "..\\secret.json",
        "%5c..%5csecret.json",
        "..%c0%afsecret.json",
        "%c0%ae%c0%ae/secret.json",
        "%252e%252e/secret.json",
        "images/../../secret.json",
        "images/../recipe.json/../../secret.json",
        "images/%2e%2e/%2e%2e/secret.json",
        "./recipe.json",
        "%2e/recipe.json",
        "recipe.json%00.png",
        "recipe.json%00",
        "images/a%00.png",
        "/etc/passwd",
        "%2fetc%2fpasswd",
        "//etc/passwd",
        "C:/Windows/win.ini",
        "C%3a/Windows/win.ini",
        "C:\\Windows\\win.ini",
        "\\\\server\\share\\x",
        "recipe.json::$DATA",
        "recipe.json:stream",
        "recipe.json.",
        "recipe.json%20",
        "RECIPE.JSON",
        "recipe%2ejson",
        "images%2flogo.png",
        "images/logo.png/",
        "images//logo.png",
        "%ef%bc%8e%ef%bc%8e/secret.json",
        "\u{ff0e}\u{ff0e}/secret.json",
        "\u{2025}/secret.json",
        "CON",
        "images/con.png",
        "../recipe.other/recipe.json",
        "..%2frecipe.other%2frecipe.json",
    ];
    for spelling in spellings {
        for key in ["recipe.mine", "..", "%2e%2e", "recipe.mine%2f..%2frecipe.other", "RECIPE.MINE", "recipe:mine", ".", ""] {
            let reply = get(s.port, &format!("/api/widgets/{key}/{spelling}")).await;
            assert!(!reply.text().contains("SECRET"), "{key} / {spelling:?} leaked");
            // a 200 is only ever one of the packages' own files (or, where the URL itself climbs out of /api/widgets, the app's index page)
            if reply.status == 200 {
                assert!(own.contains(&reply.body), "{key} / {spelling:?} gave a 200 with {:?}", reply.text());
            }
        }
    }
    s.stop().await;
}

#[tokio::test]
async fn a_symlink_out_of_a_package_is_not_followed() {
    let s = start().await;
    let root = write_package(&s, "recipe.mine", &package("recipe:mine"));
    let target = s.dir.path().join("secret.png");
    std::fs::write(&target, "SECRET").unwrap();
    std::fs::remove_file(root.join("images/logo.png")).unwrap();
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&target, root.join("images/logo.png"));
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(&target, root.join("images/logo.png"));
    if linked.is_err() {
        eprintln!("no symlink right here: the link case is skipped");
        s.stop().await;
        return;
    }
    let reply = get(s.port, "/api/widgets/recipe.mine/images/logo.png").await;
    assert!(!reply.text().contains("SECRET"));
    assert_ne!(reply.status, 200);
    s.stop().await;
}

/// A junction needs no symlink right, so unlike the symlink case this one always runs on Windows.
#[cfg(windows)]
#[tokio::test]
async fn a_junction_out_of_the_widgets_folder_is_not_followed() {
    let s = start().await;
    let outside = s.dir.path().join("outside");
    for (path, bytes) in package("recipe:linked") {
        std::fs::create_dir_all(outside.join(&path).parent().unwrap()).unwrap();
        std::fs::write(outside.join(&path), bytes).unwrap();
    }
    std::fs::create_dir_all(s.widgets()).unwrap();
    let done = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(s.widgets().join("recipe.linked"))
        .arg(&outside)
        .output()
        .unwrap();
    assert!(done.status.success(), "{}", String::from_utf8_lossy(&done.stderr));
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]");
    assert_ne!(get(s.port, "/api/widgets/recipe.linked/recipe.json").await.status, 200);
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe.linked", &WRITE, "").await.status, 404, "a junction is no package to remove");
    assert!(outside.join("recipe.json").exists());
    s.stop().await;
}

#[tokio::test]
async fn a_folder_that_is_not_its_manifest_is_not_served_or_listed() {
    let s = start().await;
    let root = write_package(&s, "recipe.mine", &package("recipe:mine"));
    write_package(&s, "recipe.ok", &package("recipe:ok"));
    let assert_refused = |what: &'static str| {
        let port = s.port;
        async move {
            assert_eq!(get(port, "/api/widgets/recipe.mine/recipe.json").await.status, 413, "{what}");
            let ids: Vec<String> = list(&get(port, "/api/widgets").await).iter().map(|w| w["id"].as_str().unwrap().to_string()).collect();
            assert_eq!(ids, ["recipe:ok"], "{what}");
        }
    };
    let recipe = std::fs::read(root.join("recipe.json")).unwrap();
    std::fs::write(root.join("recipe.json"), [recipe.as_slice(), b" "].concat()).unwrap();
    assert_refused("a file edited after the import").await;
    std::fs::write(root.join("recipe.json"), &recipe).unwrap();
    assert_eq!(get(s.port, "/api/widgets/recipe.mine/recipe.json").await.status, 200, "put back");
    std::fs::write(root.join("images/extra.png"), PNG).unwrap();
    assert_refused("a file the manifest does not list").await;
    std::fs::remove_file(root.join("images/extra.png")).unwrap();
    std::fs::write(root.join("notes.txt"), "x").unwrap();
    assert_refused("a stray name").await;
    std::fs::remove_file(root.join("notes.txt")).unwrap();
    std::fs::remove_file(root.join("images/logo.png")).unwrap();
    assert_refused("a listed file taken away").await;
    // the same bytes in another package's folder name another id
    std::fs::rename(&root, s.widgets().join("recipe.copy")).unwrap();
    assert_eq!(get(s.port, "/api/widgets/recipe.copy/recipe.json").await.status, 413);
    s.stop().await;
}

#[tokio::test]
async fn a_package_over_a_cap_is_not_served_or_listed() {
    let s = start().await;
    let big = vec![0u8; 256_001];
    write_package(&s, "recipe.fat", &package_with("recipe:fat", "1.0.0", &[("images/big.png", &big)]));
    assert_eq!(get(s.port, "/api/widgets/recipe.fat/recipe.json").await.status, 413, "a file over 256,000");
    let parts: Vec<(String, Vec<u8>)> = (0..3).map(|k| (format!("images/f{k}.png"), vec![0u8; 200_000])).collect();
    let refs: Vec<(&str, &[u8])> = parts.iter().map(|(p, b)| (p.as_str(), b.as_slice())).collect();
    write_package(&s, "recipe.wide", &package_with("recipe:wide", "1.0.0", &refs));
    assert_eq!(get(s.port, "/api/widgets/recipe.wide/recipe.json").await.status, 413, "a package over 512,000");
    let many: Vec<(String, Vec<u8>)> = (0..32).map(|k| (format!("images/g{k}.png"), PNG.to_vec())).collect();
    let refs: Vec<(&str, &[u8])> = many.iter().map(|(p, b)| (p.as_str(), b.as_slice())).collect();
    write_package(&s, "recipe.many", &package_with("recipe:many", "1.0.0", &refs));
    assert_eq!(get(s.port, "/api/widgets/recipe.many/recipe.json").await.status, 413, "over 32 files");
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]");
    s.stop().await;
}

#[tokio::test]
async fn an_import_refuses_what_is_not_its_manifest() {
    let s = start().await;
    let refused = |files: Vec<(String, Vec<u8>)>, what: &'static str| {
        let port = s.port;
        async move {
            let reply = send(port, "POST", "/api/widgets", &WRITE, &import_body(&files)).await;
            assert_eq!(reply.status, 400, "{what}: {}", reply.text());
        }
    };
    let ok = package("recipe:mine");
    let mut edited = ok.clone();
    edited[1].1.push(b' ');
    refused(edited, "a file whose hash is not the listed one").await;
    let mut extra = ok.clone();
    extra.push(("images/other.png".into(), PNG.to_vec()));
    refused(extra, "a file not listed").await;
    refused(ok.iter().filter(|(p, _)| p != "images/logo.png").cloned().collect(), "a listed file missing").await;
    refused(ok.iter().filter(|(p, _)| p != "manifest.json").cloned().collect(), "no manifest").await;
    refused(
        package_with("recipe:mine", "1.0.0", &[])
            .into_iter()
            .map(|(p, b)| if p == "recipe.json" { (p, b"not json".to_vec()) } else { (p, b) })
            .collect(),
        "recipe.json not JSON",
    )
    .await;
    let mut twice = ok.clone();
    twice.push(ok[1].clone());
    refused(twice, "a file given twice").await;
    for (field, value) in [
        ("kind", json!("code")),
        ("id", json!("recipe:Bad")),
        ("id", json!("ext:me.card")),
        ("id", json!("recipe:nul")),
        ("signature", json!({ "alg": "ed25519" })),
    ] {
        let mut files = package_with("recipe:mine", "1.0.0", &[]);
        let mut manifest: Value = serde_json::from_slice(&files[0].1).unwrap();
        manifest[field] = value;
        files[0].1 = manifest.to_string().into_bytes();
        refused(files, field).await;
    }
    // the recipe names another id or version than the manifest
    let mut files = package_with("recipe:mine", "1.0.0", &[]);
    let mut manifest: Value = serde_json::from_slice(&files[0].1).unwrap();
    manifest["version"] = json!("2.0.0");
    files[0].1 = manifest.to_string().into_bytes();
    refused(files, "another version").await;
    for path in [
        "../x.json",
        "images/../recipe.json",
        "images/a.svg",
        "images/a.gif",
        "bundle.js",
        "/recipe.json",
        "C:/x.json",
        "images/a.png\0",
        "images/CON.png",
        "pack.json",
    ] {
        let mut files = ok.clone();
        files.push((path.to_string(), PNG.to_vec()));
        let reply = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&files)).await;
        assert_eq!(reply.status, 400, "{path:?}: {}", reply.text());
    }
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, "not json").await.status, 400);
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, r#"{"files":"x"}"#).await.status, 400);
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]", "nothing was stored");
    s.stop().await;
}

#[tokio::test]
async fn an_import_from_the_wrong_caller_is_refused() {
    let s = start().await;
    let body = import_body(&package("recipe:mine"));
    assert_eq!(send(s.port, "POST", "/api/widgets", &[("Content-Type", "application/json")], &body).await.status, 403, "no header");
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &[("Content-Type", "application/json"), ("X-Dashboard-Pack", "1")], &body).await.status,
        403,
        "the packs' header"
    );
    let foreign = [("Content-Type", "application/json"), ("X-Dashboard-Widget", "1"), ("Origin", "http://evil.example")];
    assert_eq!(send(s.port, "POST", "/api/widgets", &foreign, &body).await.status, 403, "another origin");
    let cross = [("Content-Type", "application/json"), ("X-Dashboard-Widget", "1"), ("Sec-Fetch-Site", "cross-site")];
    assert_eq!(send(s.port, "POST", "/api/widgets", &cross, &body).await.status, 403, "cross-site");
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &[("Host", "evil.example"), ("X-Dashboard-Widget", "1")], &body).await.status,
        421,
        "a rebound host"
    );
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]");
    s.stop().await;
}

#[tokio::test]
async fn an_import_over_the_caps_is_413() {
    let s = start().await;
    let big = vec![0u8; 256_001];
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package_with("recipe:mine", "1.0.0", &[("images/big.png", &big)])))
            .await
            .status,
        413,
        "a file"
    );
    let parts: Vec<(String, Vec<u8>)> = (0..3).map(|k| (format!("images/f{k}.png"), vec![0u8; 180_000])).collect();
    let refs: Vec<(&str, &[u8])> = parts.iter().map(|(p, b)| (p.as_str(), b.as_slice())).collect();
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package_with("recipe:mine", "1.0.0", &refs))).await.status,
        413,
        "over 512,000 in all"
    );
    let many: Vec<(String, Vec<u8>)> = (0..32).map(|k| (format!("images/g{k}.png"), PNG.to_vec())).collect();
    let refs: Vec<(&str, &[u8])> = many.iter().map(|(p, b)| (p.as_str(), b.as_slice())).collect();
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package_with("recipe:mine", "1.0.0", &refs))).await.status,
        413,
        "over 32 files"
    );
    s.stop().await;
}

#[tokio::test]
async fn more_widgets_than_the_count_cap_are_413_but_a_replace_is_not() {
    let s = start().await;
    for k in 0..64 {
        write_package(&s, &format!("recipe.p{k}"), &package(&format!("recipe:p{k}")));
    }
    let reply = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package("recipe:extra"))).await;
    assert_eq!(reply.status, 413, "{}", reply.text());
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package_with("recipe:p3", "1.0.1", &[]))).await.status,
        200,
        "a replace"
    );
    s.stop().await;
}

#[tokio::test]
async fn a_package_is_removed_by_its_key_from_this_computer_only() {
    let s = start().await;
    write_package(&s, "recipe.mine", &package("recipe:mine"));
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe.mine", &[], "").await.status, 403, "no header");
    assert_eq!(send(s.port, "DELETE", "/api/widgets/..", &WRITE, "").await.status, 404);
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe.nope", &WRITE, "").await.status, 404);
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe:mine", &WRITE, "").await.status, 404, "the id is not the key");
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe.mine", &WRITE, "").await.status, 204);
    assert!(!s.widgets().join("recipe.mine").exists());
    assert_eq!(send(s.port, "PUT", "/api/widgets", &WRITE, "").await.status, 405);
    assert_eq!(send(s.port, "POST", "/api/widgets/recipe.mine/recipe.json", &WRITE, "").await.status, 405);
    s.stop().await;
}

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/widgets")
}

/// A fixture package's files (signed with the TEST-ONLY publisher key), the manifest first.
fn fixture(name: &str) -> Vec<(String, Vec<u8>)> {
    let root = fixtures().join(name);
    let mut files: Vec<(String, Vec<u8>)> = std::fs::read_dir(&root)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .map(|p| (p.clone(), std::fs::read(root.join(&p)).unwrap()))
        .collect();
    files.sort_by_key(|(p, _)| p != "manifest.json");
    files
}

fn test_key() -> String {
    std::fs::read_to_string(fixtures().join("TEST-ONLY-publisher.pub")).unwrap()
}

fn edit_manifest(files: &[(String, Vec<u8>)], edit: impl Fn(&mut Value)) -> Vec<(String, Vec<u8>)> {
    let mut out = files.to_vec();
    let mut manifest: Value = serde_json::from_slice(&out[0].1).unwrap();
    edit(&mut manifest);
    out[0].1 = serde_json::to_vec_pretty(&manifest).unwrap();
    out
}

#[tokio::test]
async fn a_signed_code_widget_is_taken_only_with_a_trusted_key_and_checked_on_every_read() {
    let s = start().await;
    let clock = fixture("ext.test.clock");
    let import = |files: Vec<(String, Vec<u8>)>| {
        let port = s.port;
        async move { send(port, "POST", "/api/widgets", &WRITE, &import_body(&files)).await }
    };
    let unknown = import(clock.clone()).await;
    assert_eq!(
        (unknown.status, unknown.text()),
        (400, "refused: signed with a key this app does not trust (FD89B8C08B250DF6)".into()),
        "an unknown key"
    );
    assert_eq!(get(s.port, "/api/widgets").await.text(), "[]");

    // The Settings window's path: the app's command writes the store (src-tauri/src/commands.rs `trust_widget_key`).
    // A key that holds another publisher's name signs nothing for `test`.
    s.keys().add_user("Elsewhere", &test_key(), &["acme".into()]).unwrap();
    let elsewhere = import(clock.clone()).await;
    assert_eq!(
        (elsewhere.status, elsewhere.text()),
        (400, "refused: signed with a key (FD89B8C08B250DF6) that does not sign for the publisher test".into()),
        "the signer does not hold the publisher"
    );
    s.keys().remove("FD89B8C08B250DF6").unwrap();
    s.keys().add_user("Test publisher", &test_key(), &["test".into()]).unwrap();
    let good = import(clock.clone()).await;
    assert_eq!(good.status, 200, "{}", good.text());
    let stored: Value = serde_json::from_slice(&good.body).unwrap();
    assert_eq!(
        (stored["id"].as_str(), stored["kind"].as_str(), stored["trust"].as_str()),
        (Some("ext:test.clock"), Some("code"), Some("user:Test publisher"))
    );
    assert!(s.widgets().join("ext.test.clock").is_dir());
    let items = list(&get(s.port, "/api/widgets").await);
    assert_eq!((items[0]["id"].as_str(), items[0]["trust"].as_str()), (Some("ext:test.clock"), Some("user:Test publisher")));
    let bundle = get(s.port, "/api/widgets/ext.test.clock/widget.js").await;
    assert_eq!((bundle.status, bundle.header("content-type")), (200, Some("text/javascript; charset=utf-8")));
    assert_eq!(
        bundle.header("content-security-policy"),
        Some("default-src 'none'; sandbox"),
        "stored and served as data only: 6a runs nothing"
    );
    assert_eq!(bundle.body, clock[1].1);

    let mut tampered = clock.clone();
    tampered[1].1.extend_from_slice(b"\nfetch('https://evil.example')");
    let reply = import(tampered).await;
    assert_eq!(
        (reply.status, reply.text()),
        (400, "widget.js is not the file the manifest lists (size or SHA-256)".into()),
        "a tampered file"
    );
    let reply = import(edit_manifest(&clock, |m| m["name"] = json!("Another clock"))).await;
    assert_eq!((reply.status, reply.text()), (400, "refused: the signature does not match the package".into()), "a changed manifest field");
    let reply = import(edit_manifest(&clock, |m| {
        m.as_object_mut().unwrap().remove("signature");
    }))
    .await;
    assert_eq!(
        (reply.status, reply.text()),
        (400, "refused: a code widget must be signed, and this one is not".into()),
        "a missing signature"
    );
    let reply =
        import(edit_manifest(&clock, |m| m["signature"] = json!({ "minisign": "untrusted comment: x\nAAAA\ntrusted comment: y\nAAAA" })))
            .await;
    assert_eq!((reply.status, reply.text()), (400, "refused: the signature is not a minisign signature".into()), "a bad signature");
    // a signed recipe is taken like any recipe once its key is trusted
    let recipe = import(fixture("recipe.signed")).await;
    assert_eq!(
        (recipe.status, serde_json::from_slice::<Value>(&recipe.body).unwrap()["trust"].as_str().map(str::to_string)),
        (200, Some("user:Test publisher".into()))
    );

    // A file on disk changed after the import is refused on the next read; so is everything the key signed once it is removed.
    let fp = s.keys().list()[2].id.clone();
    s.keys().remove(&fp).unwrap();
    let items = list(&get(s.port, "/api/widgets").await);
    assert!(
        items.iter().all(|i| i["trust"].as_str().unwrap().starts_with("refused:signed with a key this app does not trust")),
        "{items:?}"
    );
    let refused = get(s.port, "/api/widgets/ext.test.clock/widget.js").await;
    assert_eq!(refused.status, 403);
    assert!(refused.text().starts_with("refused:"));
    assert_eq!(get(s.port, "/api/widgets/recipe.signed/recipe.json").await.status, 403);
    s.stop().await;
}

#[tokio::test]
async fn a_bundle_asked_for_by_its_hash_is_served_only_while_it_is_those_bytes() {
    let s = start().await;
    let clock = fixture("ext.test.clock");
    s.keys().add_user("Test", &test_key(), &["test".into()]).unwrap();
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&clock)).await.status, 200);
    let hash = sha256_hex(&clock[1].1);
    let pinned = get(s.port, &format!("/api/widgets/ext.test.clock/widget.js?sha256={hash}")).await;
    assert_eq!((pinned.status, pinned.body.clone()), (200, clock[1].1.clone()));
    let other = get(s.port, &format!("/api/widgets/ext.test.clock/widget.js?sha256={}", sha256_hex(b"other"))).await;
    assert_eq!(other.status, 409, "a hash the file does not have");
    // the bundle changed on disk after the page read the manifest: not served, under its old hash or any other
    std::fs::write(s.widgets().join("ext.test.clock/widget.js"), b"export default () => null;").unwrap();
    assert_eq!(get(s.port, &format!("/api/widgets/ext.test.clock/widget.js?sha256={hash}")).await.status, 413);
    assert_eq!(get(s.port, "/api/widgets/ext.test.clock/widget.js").await.status, 413);
    s.stop().await;
}

#[tokio::test]
async fn the_example_code_widget_verifies_for_its_publisher_only() {
    let s = start().await;
    let key = std::fs::read_to_string(fixtures().join("TEST-ONLY-example.pub")).unwrap();
    s.keys().add_user("Example", &key, &["test".into()]).unwrap();
    let good = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("ext.test.example"))).await;
    assert_eq!(good.status, 200, "{}", good.text());
    let wrong = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("wrong-publisher/ext.acme.example"))).await;
    assert_eq!(
        (wrong.status, wrong.text()),
        (400, "refused: signed with a key (345BEEA66DE248DB) that does not sign for the publisher acme".into()),
        "a wrong publisher"
    );
    s.stop().await;
}

#[tokio::test]
async fn the_widgets_page_switches_hide_and_refuse_code_widgets_for_every_page() {
    let s = start().await;
    let clock = fixture("ext.test.clock");
    s.keys().add_user("Test", &test_key(), &["test".into()]).unwrap();
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&clock)).await.status, 200);
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package("recipe:mine"))).await.status, 200);
    let switches = || async { serde_json::from_slice::<Value>(&get(s.port, "/api/widgets/code").await.body).unwrap() };
    assert_eq!(switches().await, json!({ "on": true, "env": true, "off": [] }), "all on until switched");
    let put = |body: &'static str, headers: &'static [(&'static str, &'static str)]| {
        let port = s.port;
        async move { send(port, "PUT", "/api/widgets/code", headers, body).await }
    };
    assert_eq!(put(r#"{"on":false}"#, &[("Content-Type", "application/json")]).await.status, 403, "a write needs the header");
    assert_eq!(put(r#"{"on":"no"}"#, &WRITE).await.status, 400);

    // one widget off: still listed, marked, and none of its files served
    assert_eq!(put(r#"{"off":["ext:test.clock","recipe:mine","nonsense"]}"#, &WRITE).await.status, 200);
    assert_eq!(switches().await["off"], json!(["ext:test.clock"]), "only code widget ids are kept");
    let items = list(&get(s.port, "/api/widgets").await);
    assert_eq!(
        items.iter().map(|i| (i["id"].as_str().unwrap(), i["off"].as_bool())).collect::<Vec<_>>(),
        [("ext:test.clock", Some(true)), ("recipe:mine", None)]
    );
    assert_eq!(get(s.port, "/api/widgets/ext.test.clock/widget.js").await.status, 404);
    assert_eq!(get(s.port, "/api/widgets/ext.test.clock/manifest.json").await.status, 404);

    // every code widget off: hidden, refused, an import 403; recipes untouched
    assert_eq!(put(r#"{"on":false,"off":[]}"#, &WRITE).await.status, 200);
    let listing = get(s.port, "/api/widgets").await;
    assert_eq!(listing.header("x-user-code-widgets"), Some("off"));
    assert_eq!(list(&listing).iter().map(|i| i["id"].as_str().unwrap().to_string()).collect::<Vec<_>>(), ["recipe:mine"]);
    assert_eq!(get(s.port, "/api/widgets/ext.test.clock/widget.js").await.status, 404);
    let reply = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&clock)).await;
    assert_eq!((reply.status, reply.text()), (403, "third-party code widgets are switched off on the Widgets page".into()));
    assert_eq!(get(s.port, "/api/widgets/recipe.mine/recipe.json").await.status, 200);

    assert_eq!(put(r#"{"on":true}"#, &WRITE).await.status, 200);
    assert_eq!(get(s.port, "/api/widgets/ext.test.clock/widget.js").await.status, 200, "back on");
    assert_eq!(send(s.port, "DELETE", "/api/widgets/code", &WRITE, "").await.status, 405);
    s.stop().await;
}

#[tokio::test]
async fn a_signed_package_is_replaced_only_by_the_same_key() {
    let s = start().await;
    let clock = fixture("ext.test.clock");
    s.keys().add_user("Test", &test_key(), &["test".into()]).unwrap();
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&clock)).await.status, 200);
    assert_eq!(
        send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&clock)).await.status,
        200,
        "the same key replaces its own package"
    );
    // Another key that now holds `test` (the first one removed in Settings, this one added for the name) cannot take it over.
    let fp = s.keys().list()[2].id.clone();
    s.keys().remove(&fp).unwrap();
    let other = std::fs::read_to_string(fixtures().join("TEST-ONLY-other.pub")).unwrap();
    s.keys().add_user("Other", &other, &["test".into()]).unwrap();
    let takeover = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("other-signer/ext.test.clock"))).await;
    assert_eq!((takeover.status, takeover.text()), (409, "ext:test.clock is installed, signed with the key FD89B8C08B250DF6: only that key may replace it (remove it first to install this one)".into()));
    assert_eq!(list(&get(s.port, "/api/widgets").await)[0]["version"], "1.0.0", "the installed package is untouched");
    let other_fp = s.keys().list()[2].id.clone();
    s.keys().remove(&other_fp).unwrap();
    s.keys().add_user("Test", &test_key(), &["test".into()]).unwrap();
    // The signed recipe, then an unsigned recipe of the same id (a builder save, or someone else's file): refused.
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("recipe.signed"))).await.status, 200);
    let unsigned = package_with("recipe:signed", "2.0.0", &[]);
    let reply = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&unsigned)).await;
    assert_eq!((reply.status, reply.text()), (409, "recipe:signed is installed, signed with the key FD89B8C08B250DF6: only that key may replace it (remove it first to install this one)".into()));
    // Once its key is removed, the stored package no longer verifies: nothing replaces it until it is removed.
    s.keys().remove("FD89B8C08B250DF6").unwrap();
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&unsigned)).await.status, 409);
    assert_eq!(send(s.port, "DELETE", "/api/widgets/recipe.signed", &WRITE, "").await.status, 204);
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&unsigned)).await.status, 200, "after a remove");
    assert_eq!(list(&get(s.port, "/api/widgets").await).iter().find(|i| i["id"] == "recipe:signed").unwrap()["version"], "2.0.0");
    s.stop().await;
}

#[tokio::test]
async fn a_signed_package_of_a_stored_version_with_other_files_is_refused() {
    let s = start().await;
    s.keys().add_user("Test", &test_key(), &["test".into()]).unwrap();
    // an unsigned 1.0.0 stored, then the signed 1.0.0 with other files: one version, two packages, refused; the stored one stays
    let unsigned = package_with("recipe:signed", "1.0.0", &[]);
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_with_origin(&unsigned, "studio")).await.status, 200);
    let reply = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("recipe.signed"))).await;
    assert_eq!(
        (reply.status, reply.text()),
        (409, "recipe:signed 1.0.0 is installed and signed: a package of the same version with other files is refused (a signed package changes its version when its files change)".into())
    );
    assert_eq!(get(s.port, "/api/widgets/recipe.signed/recipe.json").await.body, unsigned[1].1, "the stored package is untouched");
    // another version of it is taken, and keeps the stored origin
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&package_with("recipe:signed", "0.9.0", &[]))).await.status, 200);
    let signed = send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("recipe.signed"))).await;
    assert_eq!((signed.status, serde_json::from_slice::<Value>(&signed.body).unwrap()["origin"].as_str()), (200, Some("studio")));
    // the same signed bytes again replace it (nothing differs)
    assert_eq!(send(s.port, "POST", "/api/widgets", &WRITE, &import_body(&fixture("recipe.signed"))).await.status, 200);
    s.stop().await;
}

#[tokio::test]
async fn publisher_keys_are_read_over_http_and_never_written() {
    let s = start().await;
    let keys = || async { serde_json::from_slice::<Value>(&get(s.port, "/api/widget-keys").await.body).unwrap()["keys"].clone() };
    let before = keys().await;
    assert_eq!((before[0]["id"].as_str(), before[0]["state"].as_str()), (Some("owner"), Some("trusted")), "the owner's key is built in");
    assert!(before[0]["fingerprint"].as_str().is_some_and(|f| !f.is_empty()));
    assert_eq!(
        (before[1]["id"].as_str(), before[1]["state"].as_str()),
        (Some("themely"), Some("not-available")),
        "the Themely slot is disabled"
    );
    assert_eq!(before.as_array().unwrap().len(), 2);
    let body = json!({ "name": "Mine", "key": test_key() }).to_string();
    let port = format!("127.0.0.1:{}", s.port);
    let origin = format!("http://{port}");
    // The studio page (same origin, every write marker), the kiosk (a plain request), a rebound host. The refusal does not look at
    // the caller at all, so another device (which this socket test cannot be) gets it too.
    let callers: [(&str, Vec<(&str, &str)>); 3] = [
        (
            "the studio page",
            vec![
                ("Content-Type", "application/json"),
                ("Origin", origin.as_str()),
                ("Sec-Fetch-Site", "same-origin"),
                ("X-Dashboard-Config", "1"),
                ("X-Dashboard-Widget", "1"),
            ],
        ),
        ("the kiosk", vec![("Content-Type", "application/json")]),
        ("a rebound host", vec![("Host", "evil.example"), ("Content-Type", "application/json")]),
    ];
    for (who, headers) in &callers {
        for method in ["POST", "PUT", "PATCH", "DELETE"] {
            let reply = send(s.port, method, "/api/widget-keys", headers, &body).await;
            assert!(matches!(reply.status, 403 | 421), "{who} {method}: {} {}", reply.status, reply.text());
        }
    }
    assert_eq!(
        send(s.port, "POST", "/api/widget-keys", &callers[0].1, &body).await.text(),
        "publisher keys are added and removed in the app's Settings window only"
    );
    assert_eq!(keys().await, before, "no key was added");
    assert!(!s.dir.path().join("data").join("widget-keys.json").exists(), "nothing was written");
    // the settings path adds and removes one, and the read shows it
    s.keys().add_user("Mine", &test_key(), &["test".into()]).unwrap();
    let after = keys().await;
    assert_eq!(
        (after[2]["name"].as_str(), after[2]["kind"].as_str(), after[2]["fingerprint"].as_str()),
        (Some("Mine"), Some("user"), Some("FD89B8C08B250DF6"))
    );
    assert_eq!(after[2]["publishers"], json!(["test"]));
    assert_eq!(before[0]["publishers"], json!(["infopanel", "infopanel-studio"]), "the owner's publisher names are fixed");
    s.keys().remove("FD89B8C08B250DF6").unwrap();
    assert_eq!(keys().await, before);
    s.stop().await;
}

#[test]
fn the_hash_is_sha256_in_lowercase_hex() {
    assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}
