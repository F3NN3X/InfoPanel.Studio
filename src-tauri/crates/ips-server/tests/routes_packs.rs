// The user-pack routes over a real socket (/api/packs, /api/packs/<id>/<file>): a server on a free port with a temp data
// folder, and raw HTTP/1.1 requests. A pack is files in DATA_DIR/packs/<id>/; the checks here are path safety (every
// spelling of a way out of the pack folder), the caps, the types and headers, and an import's structure.

use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
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
    fn packs(&self) -> PathBuf {
        self.dir.path().join("data").join("packs")
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
        action_runner: false,
        obs_stream: false,
        agent_approvals: vec![],
        agent_key_file: None,
        dist: dir.join("dist"),
        data_dir: dir.join("data"),
        infopanel_dir: dir.join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    }
}

async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    std::fs::write(dir.path().join("dist/index.html"), "<p>index</p>").unwrap();
    let cfg = config(dir.path());
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

/// Sends `method path` and reads the whole answer; a socket the server closes before a head is a status 0.
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

const WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Pack", "1")];

fn pack_json(id: &str) -> String {
    json!({ "id": id, "name": "Mine" }).to_string()
}

/// A pack's files on disk, as an import would leave them.
fn write_pack(server: &Server, id: &str) -> PathBuf {
    let root = server.packs().join(id);
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::write(root.join("pack.json"), pack_json(id)).unwrap();
    std::fs::write(root.join("look.json"), json!({ "id": id }).to_string()).unwrap();
    std::fs::write(root.join("OFL.txt"), "licence").unwrap();
    std::fs::write(root.join("assets/hex.svg"), "<svg/>").unwrap();
    std::fs::write(root.join("assets/f.woff2"), b"wOF2").unwrap();
    std::fs::write(root.join("assets/p.png"), b"png").unwrap();
    root
}

fn import_body(id: &str, files: &[(&str, &str)]) -> String {
    let list: Vec<Value> = files.iter().map(|(p, c)| json!({ "path": p, "data": STANDARD.encode(c) })).collect();
    json!({ "id": id, "files": list }).to_string()
}

/// `(path, content)` pairs as borrowed text.
fn pairs<'a>(files: &'a [(&'a str, String)]) -> Vec<(&'a str, &'a str)> {
    files.iter().map(|(p, c)| (*p, c.as_str())).collect()
}

#[tokio::test]
async fn lists_ids_names_and_sizes_and_nothing_else() {
    let s = start().await;
    assert_eq!(get(s.port, "/api/packs").await.text(), "[]");
    write_pack(&s, "mine");
    std::fs::create_dir_all(s.packs().join("Not-An-Id")).unwrap();
    std::fs::create_dir_all(s.packs().join("empty")).unwrap();
    let reply = get(s.port, "/api/packs").await;
    assert_eq!(reply.status, 200);
    let list: Value = serde_json::from_slice(&reply.body).unwrap();
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["id"], "mine");
    assert_eq!(list[0]["name"], "Mine");
    assert!(list[0]["size"].as_u64().unwrap() > 0);
    assert_eq!(list[0].as_object().unwrap().len(), 3, "ids, names and sizes only");
    s.stop().await;
}

#[tokio::test]
async fn serves_a_file_with_its_type_nosniff_and_a_csp_that_allows_nothing() {
    let s = start().await;
    write_pack(&s, "mine");
    for (file, mime) in [
        ("pack.json", "application/json; charset=utf-8"),
        ("assets/f.woff2", "font/woff2"),
        ("assets/p.png", "image/png"),
        ("OFL.txt", "text/plain; charset=utf-8"),
        ("assets/hex.svg", "image/svg+xml"),
    ] {
        let reply = get(s.port, &format!("/api/packs/mine/{file}")).await;
        assert_eq!(reply.status, 200, "{file}");
        assert_eq!(reply.header("content-type"), Some(mime), "{file}");
        assert_eq!(reply.header("x-content-type-options"), Some("nosniff"), "{file}");
        assert!(reply.header("content-security-policy").unwrap().contains("default-src 'none'"), "{file}");
    }
    assert!(get(s.port, "/api/packs/mine/assets/hex.svg").await.header("content-security-policy").unwrap().contains("sandbox"));
    let head = send(s.port, "HEAD", "/api/packs/mine/pack.json", &[], "").await;
    assert_eq!(head.status, 200);
    assert!(head.body.is_empty());
    assert_eq!(get(s.port, "/api/packs/mine/pack.json").await.text(), pack_json("mine"));
    s.stop().await;
}

#[tokio::test]
async fn a_missing_pack_a_missing_file_and_a_wrong_type_are_404() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    std::fs::write(root.join("assets/x.png"), b"x").unwrap();
    for path in [
        "/api/packs/nope/pack.json",
        "/api/packs/mine/icons.json",
        "/api/packs/mine/assets/none.png",
        "/api/packs/mine",
        "/api/packs/mine/",
        "/api/packs/",
        "/api/packs/mine/assets/hex.bmp",
        "/api/packs/mine/assets/hex.exe",
        "/api/packs/mine/pack.css",
        "/api/packs/mine/LOOK.md",
        "/api/packs/mine/assets/x.PNG",
    ] {
        assert_eq!(get(s.port, path).await.status, 404, "{path}");
    }
    s.stop().await;
}

#[tokio::test]
async fn no_spelling_of_a_way_out_reaches_a_file_outside_the_pack() {
    let s = start().await;
    write_pack(&s, "mine");
    write_pack(&s, "other");
    std::fs::write(s.packs().join("secret.json"), "SECRET").unwrap();
    std::fs::write(s.dir.path().join("data").join("config.json"), "SECRET").unwrap();
    std::fs::write(s.dir.path().join("secret.json"), "SECRET").unwrap();
    let spellings = [
        "..",
        "../secret.json",
        "../../secret.json",
        "../../../secret.json",
        "..%2fsecret.json",
        "..%2Fsecret.json",
        "%2e%2e/secret.json",
        "%2e%2e%2fsecret.json",
        "%2E%2E/secret.json",
        ".%2e/secret.json",
        "..%5csecret.json",
        "..\\secret.json",
        "%5c..%5csecret.json",
        "..%c0%afsecret.json",
        "%c0%ae%c0%ae/secret.json",
        "%252e%252e/secret.json",
        "%252e%252e%252fsecret.json",
        "assets/../../secret.json",
        "assets/../pack.json/../../secret.json",
        "assets/%2e%2e/%2e%2e/secret.json",
        "./pack.json",
        "%2e/pack.json",
        "pack.json%00.png",
        "pack.json%00",
        "assets/a%00.png",
        "/etc/passwd",
        "%2fetc%2fpasswd",
        "//etc/passwd",
        "C:/Windows/win.ini",
        "C%3a/Windows/win.ini",
        "C:\\Windows\\win.ini",
        "c%3A%5CWindows%5Cwin.ini",
        "\\\\server\\share\\x",
        "%5c%5cserver%5cshare%5cx",
        "pack.json::$DATA",
        "pack.json:stream",
        "pack.json.",
        "pack.json%20",
        "pack.json ",
        "PACK.JSON",
        "Pack.json",
        "pack%2ejson",
        "assets%2fhex.svg",
        "assets/hex.svg%2f",
        "assets/hex.svg/",
        "assets//hex.svg",
        "%ef%bc%8e%ef%bc%8e/secret.json",
        "\u{ff0e}\u{ff0e}/secret.json",
        "\u{2025}/secret.json",
        "\u{2024}\u{2024}/secret.json",
        "assets/h\u{e9}x.svg",
        "CON",
        "NUL",
        "assets/con.svg",
        "assets/CON.svg",
        "mine/pack.json",
        "../other/pack.json",
        "../mine/pack.json",
        "..%2fother%2fpack.json",
    ];
    for spelling in spellings {
        for id in ["mine", "..", "%2e%2e", "mine%2f..%2fother", "MINE", ".", ""] {
            let reply = get(s.port, &format!("/api/packs/{id}/{spelling}")).await;
            assert!(!reply.text().contains("SECRET"), "{id} / {spelling:?} leaked");
            // a 200 is only ever one of the packs' own files, reached by a path that names it exactly (or, where the URL
            // itself climbs out of /api/packs, the app's own index page: not a file of the data folder)
            if reply.status == 200 {
                let own = [pack_json("mine"), pack_json("other"), "<svg/>".to_string(), "licence".to_string(), "<p>index</p>".to_string()];
                assert!(own.contains(&reply.text()), "{id} / {spelling:?} gave a 200 with {:?}", reply.text());
            }
        }
    }
    s.stop().await;
}

#[tokio::test]
async fn a_symlink_out_of_a_pack_is_not_followed() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    std::fs::write(s.dir.path().join("secret.json"), "SECRET").unwrap();
    let target = s.dir.path().join("secret.json");
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&target, root.join("icons.json"));
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(&target, root.join("icons.json"));
    if linked.is_err() {
        eprintln!("no symlink right here: the link case is skipped");
        s.stop().await;
        return;
    }
    let reply = get(s.port, "/api/packs/mine/icons.json").await;
    assert!(!reply.text().contains("SECRET"));
    assert_ne!(reply.status, 200);
    s.stop().await;
}

/// A junction needs no symlink right, so unlike the symlink case this one always runs on Windows.
#[cfg(windows)]
fn junction(link: &Path, target: &Path) {
    let done = std::process::Command::new("cmd").args(["/C", "mklink", "/J"]).arg(link).arg(target).output().unwrap();
    assert!(done.status.success(), "{}", String::from_utf8_lossy(&done.stderr));
}

#[cfg(windows)]
#[tokio::test]
async fn a_junction_out_of_a_pack_is_not_followed() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    let outside = s.dir.path().join("outside");
    std::fs::create_dir_all(outside.join("assets")).unwrap();
    std::fs::write(outside.join("pack.json"), r#"{"id":"linked","name":"SECRET"}"#).unwrap();
    std::fs::write(outside.join("assets/a.png"), "SECRET").unwrap();
    junction(&s.packs().join("linked"), &outside);
    let list = get(s.port, "/api/packs").await;
    assert!(!list.text().contains("linked"), "{}", list.text());
    let reply = get(s.port, "/api/packs/linked/pack.json").await;
    assert_ne!(reply.status, 200);
    assert!(!reply.text().contains("SECRET"));
    assert_eq!(send(s.port, "DELETE", "/api/packs/linked", &WRITE, "").await.status, 404, "a junction is no pack to remove");
    assert!(outside.join("pack.json").exists());
    std::fs::remove_dir_all(root.join("assets")).unwrap();
    junction(&root.join("assets"), &outside.join("assets"));
    let reply = get(s.port, "/api/packs/mine/assets/a.png").await;
    assert_ne!(reply.status, 200);
    assert!(!reply.text().contains("SECRET"));
    s.stop().await;
}

#[tokio::test]
async fn a_pack_over_a_cap_is_not_served_or_listed() {
    let s = start().await;
    let root = write_pack(&s, "fat");
    write_pack(&s, "ok");
    std::fs::write(root.join("assets/big.png"), vec![0u8; 256_001]).unwrap();
    assert_eq!(get(s.port, "/api/packs/fat/assets/big.png").await.status, 413, "a file over 256,000");
    assert_eq!(get(s.port, "/api/packs/fat/pack.json").await.status, 413, "the pack goes with it");
    std::fs::remove_file(root.join("assets/big.png")).unwrap();
    for k in 0..3 {
        std::fs::write(root.join(format!("assets/f{k}.png")), vec![0u8; 200_000]).unwrap();
    }
    assert_eq!(get(s.port, "/api/packs/fat/pack.json").await.status, 413, "a pack over 512,000");
    for k in 0..3 {
        std::fs::remove_file(root.join(format!("assets/f{k}.png"))).unwrap();
    }
    for k in 0..65 {
        std::fs::write(root.join(format!("assets/g{k}.png")), b"x").unwrap();
    }
    assert_eq!(get(s.port, "/api/packs/fat/pack.json").await.status, 413, "over 64 files");
    let list: Value = serde_json::from_slice(&get(s.port, "/api/packs").await.body).unwrap();
    assert_eq!(list.as_array().unwrap().iter().map(|p| p["id"].as_str().unwrap()).collect::<Vec<_>>(), ["ok"]);
    s.stop().await;
}

#[tokio::test]
async fn a_folder_with_a_stray_file_is_not_a_pack() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    std::fs::write(root.join("pack.css"), "a{}").unwrap();
    assert_eq!(get(s.port, "/api/packs/mine/pack.json").await.status, 413);
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 404);
    assert_eq!(get(s.port, "/api/packs").await.text(), "[]");
    s.stop().await;
}

#[tokio::test]
async fn an_import_stores_a_pack_that_is_then_served_and_replaced() {
    let s = start().await;
    let files =
        [("pack.json", pack_json("mine")), ("look.json", json!({ "id": "mine" }).to_string()), ("assets/hex.svg", "<svg/>".to_string())];
    let reply = send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &pairs(&files))).await;
    assert_eq!(reply.status, 200, "{}", reply.text());
    assert_eq!(get(s.port, "/api/packs/mine/assets/hex.svg").await.text(), "<svg/>");
    assert!(
        s.packs().read_dir().unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".import-")),
        "no temp folder left"
    );
    // a second import replaces the pack whole
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &pairs(&files[..2]))).await.status, 200);
    assert_eq!(get(s.port, "/api/packs/mine/assets/hex.svg").await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn an_import_refuses_pack_css_a_bad_path_a_bad_id_and_the_wrong_caller() {
    let s = start().await;
    let ok = [("pack.json", pack_json("mine")), ("look.json", json!({ "id": "mine" }).to_string())];
    let with = |extra: (&str, &str)| -> String {
        let mut list = pairs(&ok);
        list.push(extra);
        import_body("mine", &list)
    };
    for extra in [
        ("pack.css", "a{}"),
        ("../x.json", "{}"),
        ("assets/../x.json", "{}"),
        ("assets/a.bmp", "x"),
        ("assets/a.exe", "x"),
        ("/pack.json", "{}"),
        ("C:/x.json", "{}"),
        ("assets/a.svg\0", "x"),
        ("assets/CON.png", "x"),
    ] {
        let reply = send(s.port, "POST", "/api/packs", &WRITE, &with(extra)).await;
        assert_eq!(reply.status, 400, "{extra:?}: {}", reply.text());
    }
    assert!(send(s.port, "POST", "/api/packs", &WRITE, &with(("pack.css", "a{}"))).await.text().contains("no pack.css"));
    for id in ["Mine", "../mine", "a b", ""] {
        assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body(id, &pairs(&ok))).await.status, 400, "{id}");
    }
    for id in ["nul", "con", "com1", "lpt9"] {
        let named = [("pack.json", pack_json(id)), ("look.json", json!({ "id": id }).to_string())];
        assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body(id, &pairs(&named))).await.status, 400, "device name {id}");
    }
    assert_eq!(
        send(s.port, "POST", "/api/packs", &[("Content-Type", "application/json")], &import_body("mine", &pairs(&ok))).await.status,
        403,
        "no header"
    );
    let foreign = [("Content-Type", "application/json"), ("X-Dashboard-Pack", "1"), ("Origin", "http://evil.example")];
    assert_eq!(send(s.port, "POST", "/api/packs", &foreign, &import_body("mine", &pairs(&ok))).await.status, 403, "cross-site");
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, "not json").await.status, 400);
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &[("pack.json", "{}")])).await.status, 400, "no look.json");
    assert_eq!(get(s.port, "/api/packs").await.text(), "[]", "nothing was stored");
    s.stop().await;
}

#[tokio::test]
async fn a_replace_leaves_no_temp_or_set_aside_folder_behind() {
    let s = start().await;
    let files = [("pack.json", pack_json("mine")), ("look.json", json!({ "id": "mine" }).to_string())];
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &pairs(&files))).await.status, 200);
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &pairs(&files))).await.status, 200, "replaced");
    let names: Vec<String> = s.packs().read_dir().unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names, ["mine"]);
    s.stop().await;
}

#[tokio::test]
async fn more_packs_than_the_count_cap_are_413_but_a_replace_is_not() {
    let s = start().await;
    for k in 0..32 {
        write_pack(&s, &format!("p{k}"));
    }
    let files = [("pack.json", pack_json("extra")), ("look.json", json!({ "id": "extra" }).to_string())];
    let reply = send(s.port, "POST", "/api/packs", &WRITE, &import_body("extra", &pairs(&files))).await;
    assert_eq!(reply.status, 413, "{}", reply.text());
    let again = [("pack.json", pack_json("p3")), ("look.json", json!({ "id": "p3" }).to_string())];
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("p3", &pairs(&again))).await.status, 200, "a replace");
    s.stop().await;
}

#[tokio::test]
async fn an_import_over_the_caps_is_413() {
    let s = start().await;
    let big = "a".repeat(256_001);
    let half = "a".repeat(180_000);
    let ok = [("pack.json", pack_json("mine")), ("look.json", json!({ "id": "mine" }).to_string())];
    let mut list = pairs(&ok);
    list.push(("OFL.txt", &big));
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &list)).await.status, 413);
    let mut list = pairs(&ok);
    list.extend([("OFL.txt", half.as_str()), ("thumb.png", half.as_str()), ("thumb.jpg", half.as_str())]);
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &list)).await.status, 413, "over 512,000 in all");
    let names: Vec<String> = (0..65).map(|k| format!("assets/f{k}.png")).collect();
    let mut list = pairs(&ok);
    list.extend(names.iter().map(|n| (n.as_str(), "x")));
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &list)).await.status, 413, "over 64 files");
    s.stop().await;
}

#[tokio::test]
async fn a_pack_is_removed_by_its_id_from_this_computer_only() {
    let s = start().await;
    write_pack(&s, "mine");
    assert_eq!(send(s.port, "DELETE", "/api/packs/mine", &[], "").await.status, 403, "no header");
    assert_eq!(send(s.port, "DELETE", "/api/packs/..", &WRITE, "").await.status, 404);
    assert_eq!(send(s.port, "DELETE", "/api/packs/nope", &WRITE, "").await.status, 404);
    assert_eq!(send(s.port, "DELETE", "/api/packs/mine", &WRITE, "").await.status, 204);
    assert!(!s.packs().join("mine").exists());
    assert_eq!(send(s.port, "PUT", "/api/packs", &WRITE, "").await.status, 405);
    s.stop().await;
}

// ---- a pack's CSS and its signature (L94) ---------------------------------------------------------------------------------

const CSS: &str = "[data-part=\"num\"] { color: #fff; }";

/// The hash of a pack folder as `write_pack` leaves it, with `css` beside it: what the studio sends.
fn hash_with(root: &Path, css: &str) -> String {
    let mut files: Vec<(String, Vec<u8>)> = vec![("pack.css".to_string(), css.as_bytes().to_vec())];
    for (dir, prefix) in [(root.to_path_buf(), ""), (root.join("assets"), "assets/")] {
        for entry in std::fs::read_dir(dir).unwrap().map(Result::unwrap) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_file() && name != "pack.css" && name != "pack.sig" && !name.ends_with(".tmp") {
                files.push((format!("{prefix}{name}"), std::fs::read(entry.path()).unwrap()));
            }
        }
    }
    ips_server::pack_sign::content_hash(&files)
}

fn sign_body(css: &str, hash: &str) -> String {
    json!({ "css": STANDARD.encode(css), "hash": hash }).to_string()
}

/// A pack on disk with a stylesheet the server signed.
async fn signed_pack(s: &Server, id: &str) -> PathBuf {
    let root = write_pack(s, id);
    let reply = send(s.port, "POST", &format!("/api/packs/{id}/sign"), &WRITE, &sign_body(CSS, &hash_with(&root, CSS))).await;
    assert_eq!(reply.status, 200, "{}", reply.text());
    root
}

fn key_file(s: &Server) -> PathBuf {
    s.dir.path().join("data").join(ips_server::pack_sign::KEY_FILE)
}

#[tokio::test]
async fn the_first_signature_makes_the_key_and_a_signed_css_is_served_with_the_pack_file_headers() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    assert!(!key_file(&s).exists(), "no key before the first use");
    let reply = send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(CSS, &hash_with(&root, CSS))).await;
    assert_eq!(reply.status, 200, "{}", reply.text());
    assert_eq!(std::fs::metadata(key_file(&s)).unwrap().len(), 32);
    let key = std::fs::read(key_file(&s)).unwrap();
    let css = get(s.port, "/api/packs/mine/pack.css").await;
    assert_eq!(css.status, 200);
    assert_eq!(css.text(), CSS);
    assert_eq!(css.header("content-type"), Some("text/css; charset=utf-8"));
    assert_eq!(css.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(css.header("content-security-policy"), Some("default-src 'none'; sandbox"));
    assert_eq!(css.header("x-pack-signature"), Some("valid"));
    let meta = get(s.port, "/api/packs/mine/pack.json").await;
    assert_eq!(meta.header("x-pack-signature"), None, "the word is for the CSS");
    assert_eq!(meta.header("x-pack-css"), Some("1"), "what tells the loader to ask for it");
    write_pack(&s, "plain");
    assert_eq!(get(s.port, "/api/packs/plain/pack.json").await.header("x-pack-css"), None, "a pack with no CSS is asked for none");
    let list: Value = serde_json::from_slice(&get(s.port, "/api/packs").await.body).unwrap();
    assert_eq!(list[0]["id"], "mine");
    signed_pack(&s, "other").await;
    assert_eq!(std::fs::read(key_file(&s)).unwrap(), key, "one key");
    assert!(get(s.port, "/api/packs/other/pack.css").await.status == 200);
    s.stop().await;
}

#[tokio::test]
async fn the_server_signs_only_the_bytes_the_studio_hashed() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    let reply = send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(CSS, &"0".repeat(64))).await;
    assert_eq!(reply.status, 409, "{}", reply.text());
    // the hash of another stylesheet: what was checked is not what would be stored
    let other = hash_with(&root, "[data-part=\"num\"] { color: #000; }");
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(CSS, &other)).await.status, 409);
    // a stored file changed after the hash was taken
    let hash = hash_with(&root, CSS);
    std::fs::write(root.join("look.json"), "{}").unwrap();
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(CSS, &hash)).await.status, 409);
    assert!(!root.join("pack.css").exists() && !root.join("pack.sig").exists(), "nothing was stored");
    assert!(!key_file(&s).exists(), "and no key made");
    s.stop().await;
}

#[tokio::test]
async fn the_signing_route_refuses_what_is_not_a_signing() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    let good = sign_body(CSS, &hash_with(&root, CSS));
    assert_eq!(send(s.port, "POST", "/api/packs/none/sign", &WRITE, &good).await.status, 404, "no such pack");
    assert_eq!(send(s.port, "POST", "/api/packs/..%2fmine/sign", &WRITE, &good).await.status, 404, "not an id");
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, "not json").await.status, 400);
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, r#"{"css":"YQ=="}"#).await.status, 400, "no hash");
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, r#"{"css":"%%%","hash":"x"}"#).await.status, 400, "not base64");
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body("", "x")).await.status, 413, "an empty file");
    assert_eq!(
        send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(&"a".repeat(256_001), "x")).await.status,
        413,
        "over a file's cap"
    );
    // the same guards as every pack write
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &[("Content-Type", "application/json")], &good).await.status, 403, "no header");
    let foreign = [("Content-Type", "application/json"), ("X-Dashboard-Pack", "1"), ("Origin", "http://evil.example")];
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &foreign, &good).await.status, 403, "another origin");
    let cross = [("Content-Type", "application/json"), ("X-Dashboard-Pack", "1"), ("Sec-Fetch-Site", "cross-site")];
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &cross, &good).await.status, 403, "cross-site");
    assert_eq!(
        send(s.port, "POST", "/api/packs/mine/sign", &[("Host", "evil.example"), ("X-Dashboard-Pack", "1")], &good).await.status,
        421,
        "a rebound host"
    );
    assert_eq!(send(s.port, "GET", "/api/packs/mine/sign", &WRITE, "").await.status, 404);
    assert!(!root.join("pack.css").exists());
    s.stop().await;
}

/// Refused whole, however it was refused: not listed, no file served, no CSS.
async fn assert_refused(s: &Server, id: &str, what: &str) {
    assert_eq!(get(s.port, &format!("/api/packs/{id}/pack.css")).await.status, 404, "{what}");
    assert_eq!(get(s.port, &format!("/api/packs/{id}/pack.json")).await.status, 413, "{what}");
    let list: Value = serde_json::from_slice(&get(s.port, "/api/packs").await.body).unwrap();
    assert!(list.as_array().unwrap().iter().all(|p| p["id"] != id), "{what}");
}

#[tokio::test]
async fn editing_any_stored_file_takes_the_signature_away() {
    let s = start().await;
    let root = signed_pack(&s, "mine").await;
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200);
    for file in ["pack.css", "pack.json", "look.json", "OFL.txt", "assets/hex.svg", "assets/f.woff2", "assets/p.png"] {
        let path = root.join(file);
        let was = std::fs::read(&path).unwrap();
        let mut edited = was.clone();
        edited.push(b' ');
        std::fs::write(&path, edited).unwrap();
        assert_refused(&s, "mine", file).await;
        std::fs::write(&path, was).unwrap();
        assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200, "{file} put back");
    }
    // a file added or taken away counts too
    std::fs::write(root.join("assets/new.png"), "x").unwrap();
    assert_refused(&s, "mine", "a file added").await;
    std::fs::remove_file(root.join("assets/new.png")).unwrap();
    let kept = std::fs::read(root.join("OFL.txt")).unwrap();
    std::fs::remove_file(root.join("OFL.txt")).unwrap();
    assert_refused(&s, "mine", "a file taken away").await;
    std::fs::write(root.join("OFL.txt"), kept).unwrap();
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200);
    s.stop().await;
}

#[tokio::test]
async fn css_put_straight_into_the_folder_is_refused_however_it_is_dressed() {
    let s = start().await;
    let signed = signed_pack(&s, "mine").await;
    let sig = std::fs::read(signed.join("pack.sig")).unwrap();
    assert_eq!(sig.len(), 32);
    let root = write_pack(&s, "dropped");
    std::fs::write(root.join("pack.css"), CSS).unwrap();
    assert_refused(&s, "dropped", "no signature").await;
    std::fs::write(root.join("pack.sig"), [0u8; 32]).unwrap();
    assert_refused(&s, "dropped", "a made-up signature").await;
    std::fs::write(root.join("pack.sig"), "").unwrap();
    assert_refused(&s, "dropped", "an empty signature").await;
    std::fs::write(root.join("pack.sig"), &sig).unwrap();
    assert_refused(&s, "dropped", "another pack's signature, the same bytes under another id").await;
    let copied = s.packs().join("mine-2");
    std::fs::rename(&root, &copied).unwrap();
    assert_refused(&s, "mine-2", "a renamed folder").await;
    // the very same bytes and signature under another folder's id
    let twin = s.packs().join("twin");
    std::fs::create_dir_all(twin.join("assets")).unwrap();
    for file in ["pack.json", "look.json", "OFL.txt", "pack.css", "pack.sig", "assets/hex.svg", "assets/f.woff2", "assets/p.png"] {
        std::fs::copy(signed.join(file), twin.join(file)).unwrap();
    }
    assert_refused(&s, "twin", "a signed pack copied under another id").await;
    // a signature with no CSS beside it means nothing either way: the pack is a plain one
    std::fs::remove_file(copied.join("pack.css")).unwrap();
    assert_eq!(get(s.port, "/api/packs/mine-2/pack.json").await.status, 200);
    assert_eq!(get(s.port, "/api/packs/mine-2/pack.css").await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn with_no_key_nothing_verifies_and_a_damaged_key_is_not_replaced() {
    let s = start().await;
    signed_pack(&s, "mine").await;
    let key = key_file(&s);
    let held = std::fs::read(&key).unwrap();
    std::fs::remove_file(&key).unwrap();
    assert_refused(&s, "mine", "the key is gone").await;
    std::fs::write(&key, "damaged").unwrap();
    assert_refused(&s, "mine", "the key is damaged").await;
    let root = write_pack(&s, "other");
    let reply = send(s.port, "POST", "/api/packs/other/sign", &WRITE, &sign_body(CSS, &hash_with(&root, CSS))).await;
    assert_eq!(reply.status, 500, "{}", reply.text());
    assert_eq!(std::fs::read(&key).unwrap(), b"damaged");
    assert!(!root.join("pack.css").exists());
    std::fs::write(&key, held).unwrap();
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200);
    s.stop().await;
}

#[tokio::test]
async fn the_key_is_never_served() {
    let s = start().await;
    signed_pack(&s, "mine").await;
    let key = std::fs::read(key_file(&s)).unwrap();
    let hex: String = key.iter().map(|b| format!("{b:02x}")).collect();
    let base = STANDARD.encode(&key);
    let leaked = |reply: &Reply| {
        reply.body.windows(key.len()).any(|w| w == key.as_slice()) || reply.text().contains(&hex) || reply.text().contains(&base)
    };
    let name = ips_server::pack_sign::KEY_FILE;
    for path in [
        format!("/{name}"),
        format!("/data/{name}"),
        format!("/api/packs/{name}"),
        format!("/api/packs/mine/{name}"),
        format!("/api/packs/mine/../{name}"),
        format!("/api/packs/mine/..%2f{name}"),
        format!("/api/packs/mine/..%2f..%2f{name}"),
        format!("/api/packs/..%2f{name}"),
        format!("/api/packs/../{name}"),
        format!("/api/assets/{name}"),
        format!("/api/assets/..%2f{name}"),
        format!("/api/library/{name}"),
        "/api/packs".to_string(),
        "/api/packs/mine/pack.sig".to_string(),
        "/api/config".to_string(),
        "/api/debug/stats".to_string(),
    ] {
        let reply = get(s.port, &path).await;
        assert!(!leaked(&reply), "{path} gave the key");
    }
    for spelling in ["..", "%2e%2e", "..%5c..", "..\\.."] {
        let reply = get(s.port, &format!("/api/packs/{spelling}/{name}")).await;
        assert!(!leaked(&reply), "{spelling}");
    }
    assert!(
        !leaked(&send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(CSS, &hash_with(&s.packs().join("mine"), CSS))).await),
        "the signing answer"
    );
    assert_eq!(get(s.port, "/api/packs/mine/pack.sig").await.status, 404);
    assert!(!s.packs().join(name).exists(), "the key is outside the packs folder");
    s.stop().await;
}

#[tokio::test]
async fn an_import_over_a_signed_pack_takes_its_css_and_signature_with_it() {
    let s = start().await;
    let root = signed_pack(&s, "mine").await;
    let files = [("pack.json", pack_json("mine")), ("look.json", json!({ "id": "mine" }).to_string())];
    assert_eq!(send(s.port, "POST", "/api/packs", &WRITE, &import_body("mine", &pairs(&files))).await.status, 200);
    assert!(!root.join("pack.css").exists() && !root.join("pack.sig").exists());
    assert_eq!(get(s.port, "/api/packs/mine/pack.json").await.status, 200);
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn a_css_file_that_is_a_link_is_not_followed() {
    let s = start().await;
    let root = signed_pack(&s, "mine").await;
    let outside = s.dir.path().join("outside.css");
    std::fs::write(&outside, CSS).unwrap();
    std::fs::remove_file(root.join("pack.css")).unwrap();
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&outside, root.join("pack.css"));
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(&outside, root.join("pack.css"));
    if linked.is_err() {
        eprintln!("no symlink right here: the link case is skipped");
        s.stop().await;
        return;
    }
    assert_refused(&s, "mine", "a link").await;
    s.stop().await;
}

/// `/?widget-qa` with the headers a browser gives a frame of this origin.
const FRAME: [(&str, &str); 2] = [("Sec-Fetch-Dest", "iframe"), ("Sec-Fetch-Site", "same-origin")];

#[tokio::test]
async fn the_render_checks_page_opens_for_a_frame_of_this_origin_and_nothing_else() {
    let s = start().await;
    let page = send(s.port, "GET", "/?widget-qa&pack-check=1", &FRAME, "").await;
    assert_eq!(page.status, 200);
    assert_eq!(page.text(), "<p>index</p>");
    assert!(page.header("content-security-policy").unwrap().contains("frame-ancestors 'self'"));
    let refused = |reply: &Reply| reply.status == 404 && reply.text().contains("Turn on debug mode");
    assert!(refused(&get(s.port, "/?widget-qa&pack-check=1").await), "no fetch metadata");
    assert!(
        refused(&send(s.port, "GET", "/?widget-qa&pack-check=1", &[("Sec-Fetch-Dest", "document"), ("Sec-Fetch-Site", "none")], "").await),
        "a page opened by hand"
    );
    assert!(
        refused(
            &send(s.port, "GET", "/?widget-qa&pack-check=1", &[("Sec-Fetch-Dest", "document"), ("Sec-Fetch-Site", "same-origin")], "")
                .await
        ),
        "a link on this origin"
    );
    assert!(
        refused(
            &send(s.port, "GET", "/?widget-qa&pack-check=1", &[("Sec-Fetch-Dest", "iframe"), ("Sec-Fetch-Site", "cross-site")], "").await
        ),
        "a frame of another site"
    );
    assert!(
        refused(
            &send(s.port, "GET", "/?widget-qa&pack-check=1", &[("Sec-Fetch-Dest", "iframe"), ("Sec-Fetch-Site", "same-site")], "").await
        ),
        "a frame of a sibling site"
    );
    assert!(refused(&send(s.port, "GET", "/?widget-qa", &FRAME, "").await), "Widget QA itself stays a debug tool");
    assert!(refused(&send(s.port, "GET", "/widget-qa", &FRAME, "").await));
    // the client mounts the page from the query on any path the server answers with index.html
    for path in ["/index.html?widget-qa", "/x?widget-qa", "/index.html?widget-qa&pack-check=1", "/x?%77idget-qa&pack-check=1"] {
        let by_hand = [("Sec-Fetch-Dest", "document"), ("Sec-Fetch-Site", "none")];
        assert!(refused(&send(s.port, "GET", path, &by_hand, "").await), "{path} by hand");
        assert!(refused(&send(s.port, "GET", path, &FRAME, "").await) != path.contains("pack-check"), "{path} as a frame");
    }
    s.stop().await;
}

#[tokio::test]
async fn the_server_signs_no_css_that_holds_what_the_grammar_never_lets_through() {
    let s = start().await;
    let root = write_pack(&s, "mine");
    for (what, css) in [
        ("an escape", "[data-part=\"num\"] { color: #fff; } /* */ [data-part=\"n\\75m\"] { color: #fff; }"),
        ("an at-rule", "@import 'x'; [data-part=\"num\"] { color: #fff; }"),
        ("markup", "[data-part=\"num\"] { color: #fff; } </style>"),
        ("a url() outside the pack", "[data-part=\"num\"] { background: URL(https://x.test/x.png); }"),
        ("an at-rule other than @keyframes", "@media screen { [data-part=\"num\"] { color: #fff; } }"),
        ("image-set()", "[data-part=\"num\"] { background: image-set(x 1x); }"),
        ("src()", "[data-part=\"num\"] { color: SRC(x); }"),
        ("a url() between two strings that hold comment marks", "[data-part=\"num\"] { content: \"/*\" url(//x) \"*/\"; }"),
    ] {
        let reply = send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(css, &hash_with(&root, css))).await;
        assert_eq!(reply.status, 400, "{what}: {}", reply.text());
    }
    let latin1 = json!({ "css": STANDARD.encode([b'a', 0xe9, b'{', b'}']), "hash": "x" }).to_string();
    assert_eq!(send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &latin1).await.status, 400, "not UTF-8");
    assert!(!root.join("pack.css").exists() && !root.join("pack.sig").exists(), "nothing was stored");
    assert!(!key_file(&s).exists(), "and no key made");
    // plain CSS passes, and a comment may mention what the rest may not hold
    let noted = "/* url(x) @media \\ <b> */ [data-part=\"num\"] { color: #fff; }";
    let reply = send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(noted, &hash_with(&root, noted))).await;
    assert_eq!(reply.status, 200, "{}", reply.text());
    // a quote inside a comment opens no string: the comment ends at its own close
    let quoted = "/* it's \" */ [data-part=\"num\"] { color: #fff; } /* ' */";
    let reply = send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(quoted, &hash_with(&root, quoted))).await;
    assert_eq!(reply.status, 200, "{}", reply.text());
    s.stop().await;
}

#[tokio::test]
async fn a_signing_clears_the_temp_files_a_crash_left() {
    let s = start().await;
    let root = signed_pack(&s, "mine").await;
    let css = "[data-part=\"num\"] { color: #eee; }";
    // even a signing that is refused (its hash is not the stored pack's) clears them: the size they take counts toward no cap
    for tmp in ["pack.sig.tmp", "pack.css.tmp"] {
        std::fs::write(root.join(tmp), vec![b'x'; 100_000]).unwrap();
    }
    let reply = send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &sign_body(css, "0000")).await;
    assert_eq!(reply.status, 409, "{}", reply.text());
    assert!(!root.join("pack.sig.tmp").exists() && !root.join("pack.css.tmp").exists(), "the leftovers went");
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200, "the signed pack is still served");
    s.stop().await;
}

#[tokio::test]
async fn the_writers_own_temp_files_do_not_strand_a_pack() {
    let s = start().await;
    let root = signed_pack(&s, "mine").await;
    for tmp in ["pack.sig.tmp", "pack.css.tmp"] {
        std::fs::write(root.join(tmp), "half a file").unwrap();
    }
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200, "a signed pack");
    assert_eq!(get(s.port, "/api/packs/mine/pack.json").await.status, 200);
    assert_eq!(get(s.port, "/api/packs/mine/pack.sig.tmp").await.status, 404, "and a temp file is never served");
    let list: Value = serde_json::from_slice(&get(s.port, "/api/packs").await.body).unwrap();
    assert!(list.as_array().unwrap().iter().any(|p| p["id"] == "mine"));
    // any other stray name still refuses the folder
    std::fs::write(root.join("pack.sig.tmp2"), "x").unwrap();
    assert_refused(&s, "mine", "a stray name").await;
    s.stop().await;
}
