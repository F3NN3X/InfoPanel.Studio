// Pack signatures and the script routes over a real socket (pack_trust.rs, pack_scripts.rs, pack_revocation.rs): a server on a free
// port with a temp data folder, packs signed here with throwaway keys. Its own test binary: Themely's pack key comes from
// PACK_THEMELY_TEST_KEY (debug builds only), process-wide, the same key in every test.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use blake2::{Blake2b512, Digest};
use ips_server::pack_trust::{entries, manifest_bytes, statement_bytes};
use ips_server::{bind_with_home, ServerConfig};
use rustls::crypto::ring::sign::any_eddsa_type;
use rustls::pki_types::PrivatePkcs8KeyDer;
use rustls::sign::SigningKey;
use serde_json::{json, Value};
use sha2::Sha256;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

/// A minisign key from a fixed seed, signing as minisign does (pre-hashed `ED`, a trusted comment and its global signature).
struct Signer {
    id: [u8; 8],
    key: Arc<dyn SigningKey>,
    public: Vec<u8>,
}

impl Signer {
    fn new(seed: u8) -> Signer {
        let prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
        let key = any_eddsa_type(&PrivatePkcs8KeyDer::from([prefix.as_slice(), &[seed; 32]].concat())).unwrap();
        let spki = key.public_key().unwrap();
        let public = spki.as_ref()[spki.as_ref().len() - 32..].to_vec();
        Signer { id: [seed; 8], key, public }
    }

    fn line(&self) -> String {
        STANDARD.encode([b"Ed".as_slice(), &self.id, &self.public].concat())
    }

    fn fingerprint(&self) -> String {
        format!("{:016X}", u64::from_le_bytes(self.id))
    }

    fn raw(&self, message: &[u8]) -> Vec<u8> {
        self.key.choose_scheme(&[rustls::SignatureScheme::ED25519]).unwrap().sign(message).unwrap()
    }

    fn sign(&self, message: &[u8]) -> String {
        let sig = self.raw(&Blake2b512::digest(message));
        let global = self.raw(&[sig.as_slice(), b"t"].concat());
        format!(
            "untrusted comment: x\n{}\ntrusted comment: t\n{}\n",
            STANDARD.encode([b"ED".as_slice(), &self.id, &sig].concat()),
            STANDARD.encode(global)
        )
    }
}

fn themely() -> Signer {
    Signer::new(2)
}

fn publisher() -> Signer {
    Signer::new(1)
}

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

    fn packs(&self) -> PathBuf {
        self.data().join("packs")
    }

    async fn stop(mut self) {
        let _ = self.stop.take().unwrap().send(());
        tokio::time::timeout(Duration::from_secs(5), &mut self.done).await.expect("graceful stop").unwrap();
    }
}

async fn start() -> Server {
    std::env::set_var("PACK_THEMELY_TEST_KEY", themely().line());
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

    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap_or(Value::Null)
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
    let mut request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    let _ = stream.write_all(request.as_bytes()).await;
    let mut raw = Vec::new();
    let _ = tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await;
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

const WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Pack", "1")];
const SCRIPT: &str = "fx.onFrame(() => fx.draw([]));";

type Files = Vec<(String, Vec<u8>)>;

/// A pack with a script, at `version`.
fn pack(id: &str, version: &str) -> Files {
    vec![
        (
            "pack.json".into(),
            json!({ "id": id, "name": "Mine", "version": version, "script": { "file": "fx.js" } }).to_string().into_bytes(),
        ),
        ("look.json".into(), json!({ "id": id }).to_string().into_bytes()),
        ("assets/fx.js".into(), SCRIPT.as_bytes().to_vec()),
    ]
}

fn version_of(files: &Files) -> String {
    serde_json::from_slice::<Value>(&files[0].1).unwrap()["version"].as_str().unwrap().to_string()
}

fn signed(id: &str, mut files: Files, by: &Signer) -> Files {
    let sig = by.sign(&manifest_bytes(id, &version_of(&files), &entries(&files)));
    files.push(("pack.minisig".into(), sig.into_bytes()));
    files
}

fn reviewed(id: &str, files: Files, by: &Signer) -> Files {
    let mut files = signed(id, files, by);
    let manifest = hex(&Sha256::digest(manifest_bytes(id, &version_of(&files), &entries(&files))));
    let statement = json!({
        "manifestSha256": manifest, "packId": id, "version": version_of(&files), "publisherKeyId": by.fingerprint(),
        "checksVersion": 1, "reviewLevel": "reviewed", "sourceHash": "", "issuedAt": "2026-11-23T00:00:00Z",
    });
    let doc =
        json!({ "statement": statement, "publisherKey": by.line(), "minisign": themely().sign(&statement_bytes(&statement).unwrap()) });
    files.push(("themely.json".into(), doc.to_string().into_bytes()));
    files
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn import_body(id: &str, files: &Files) -> String {
    let list: Vec<Value> = files.iter().map(|(p, b)| json!({ "path": p, "data": STANDARD.encode(b) })).collect();
    json!({ "id": id, "files": list }).to_string()
}

async fn import(s: &Server, id: &str, files: &Files) -> Reply {
    send(s.port, "POST", "/api/packs", &WRITE, &import_body(id, files)).await
}

async fn trust(s: &Server, id: &str) -> Value {
    get(s.port, &format!("/api/packs/{id}/trust")).await.json()
}

/// Trusts `by` as a user key named `name` (what Settings writes), with its "Allow pack scripts".
fn trust_key(s: &Server, by: &Signer, name: &str, scripts: bool) {
    let file = json!({ "format": 1, "keys": [{ "name": name, "key": by.line(), "added": 0, "publishers": ["acme"], "packScripts": scripts }], "removed": [] });
    std::fs::create_dir_all(s.data()).unwrap();
    std::fs::write(s.data().join("widget-keys.json"), file.to_string()).unwrap();
}

#[tokio::test]
async fn an_unverified_pack_runs_its_script_only_after_a_yes_for_these_files() {
    let s = start().await;
    assert_eq!(import(&s, "mine", &pack("mine", "1.0.0")).await.json()["trust"], json!({ "state": "unverified" }));
    let reply = get(s.port, "/api/packs/mine/trust").await;
    assert_eq!(reply.status, 200);
    assert_eq!(reply.header("cache-control"), Some("no-store"));
    let t = reply.json();
    assert_eq!(
        (t["state"].as_str(), t["hasScript"].as_bool(), t["consent"].as_str(), t["scriptRuns"].as_bool()),
        (Some("unverified"), Some(true), Some("none"), Some(false))
    );
    assert_eq!(t["scriptSha256"], hex(&Sha256::digest(SCRIPT)));
    assert_eq!(get(s.port, "/api/packs/mine/fx.js").await.status, 404, "not before a yes");
    assert_eq!(get(s.port, "/api/packs/mine/assets/fx.js").await.status, 404, "never by the file route");
    assert_eq!(get(s.port, "/api/packs/none/trust").await.status, 404);

    let consent = |granted: bool| json!({ "granted": granted }).to_string();
    assert_eq!(
        send(s.port, "PUT", "/api/packs/mine/script-consent", &[("Content-Type", "application/json")], &consent(true)).await.status,
        403,
        "the write header"
    );
    assert_eq!(send(s.port, "PUT", "/api/packs/mine/script-consent", &WRITE, "{}").await.status, 400);
    assert_eq!(send(s.port, "PUT", "/api/packs/none/script-consent", &WRITE, &consent(true)).await.status, 404);
    let yes = send(s.port, "PUT", "/api/packs/mine/script-consent", &WRITE, &consent(true)).await;
    assert_eq!((yes.status, yes.json()["consent"].as_str(), yes.json()["scriptRuns"].as_bool()), (200, Some("granted"), Some(true)));

    let fx = get(s.port, "/api/packs/mine/fx.js").await;
    assert_eq!((fx.status, fx.text().as_str()), (200, SCRIPT));
    assert_eq!(fx.header("content-type"), Some("text/javascript; charset=utf-8"));
    assert_eq!(fx.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(fx.header("cache-control"), Some("no-store"));
    assert_eq!(fx.header("content-security-policy"), Some("default-src 'none'; sandbox"));
    assert_eq!(get(s.port, &format!("/api/packs/mine/fx.js?sha256={}", hex(&Sha256::digest(SCRIPT)))).await.status, 200);
    assert_eq!(get(s.port, "/api/packs/mine/fx.js?sha256=00").await.status, 409, "by hash");
    let head = send(s.port, "HEAD", "/api/packs/mine/fx.js", &[], "").await;
    assert!(head.status == 200 && head.body.is_empty());

    // an update (other bytes) asks again
    std::fs::write(s.packs().join("mine/look.json"), json!({ "id": "mine", "v": 2 }).to_string()).unwrap();
    assert_eq!(trust(&s, "mine").await["consent"], "none");
    assert_eq!(get(s.port, "/api/packs/mine/fx.js").await.status, 404);
    let no = send(s.port, "PUT", "/api/packs/mine/script-consent", &WRITE, &consent(false)).await;
    assert_eq!((no.json()["consent"].as_str(), no.json()["scriptRuns"].as_bool()), (Some("denied"), Some(false)));
    s.stop().await;
}

#[tokio::test]
async fn the_studio_switch_stops_every_script_and_is_written_under_the_guards() {
    let s = start().await;
    import(&s, "mine", &reviewed("mine", pack("mine", "1.0.0"), &publisher())).await;
    assert_eq!(trust(&s, "mine").await["scriptRuns"], true);
    let view = get(s.port, "/api/pack-scripts").await;
    assert_eq!(view.json(), json!({ "on": true, "env": true, "fetching": false, "stale": false }));
    assert_eq!(view.header("cache-control"), Some("no-store"));
    assert_eq!(send(s.port, "PUT", "/api/pack-scripts", &[("Content-Type", "application/json")], r#"{"on":false}"#).await.status, 403);
    assert_eq!(send(s.port, "PUT", "/api/pack-scripts", &WRITE, r#"{"on":"no"}"#).await.status, 400);
    assert_eq!(send(s.port, "PUT", "/api/pack-scripts", &WRITE, r#"{"on":false}"#).await.json()["on"], false);
    assert_eq!(trust(&s, "mine").await["scriptRuns"], false);
    assert_eq!(get(s.port, "/api/packs/mine/fx.js").await.status, 404);
    assert_eq!(send(s.port, "DELETE", "/api/pack-scripts", &WRITE, "").await.status, 405);
    send(s.port, "PUT", "/api/pack-scripts", &WRITE, r#"{"on":true}"#).await;
    assert_eq!(trust(&s, "mine").await["scriptRuns"], true);
    s.stop().await;
}

#[tokio::test]
async fn a_verified_pack_runs_and_a_changed_one_is_refused_with_its_reason() {
    let s = start().await;
    let files = reviewed("mine", pack("mine", "1.0.0"), &publisher());
    let stored = import(&s, "mine", &files).await;
    assert_eq!((stored.status, stored.json()["trust"]["state"].as_str()), (200, Some("verified")));
    let t = trust(&s, "mine").await;
    assert_eq!((t["state"].as_str(), t["scriptRuns"].as_bool(), t["consent"].as_str()), (Some("verified"), Some(true), Some("none")));
    assert_eq!(get(s.port, "/api/packs").await.json()[0]["trust"]["state"], "verified");
    assert_eq!(get(s.port, "/api/packs/mine/fx.js").await.status, 200);

    std::fs::write(s.packs().join("mine/assets/fx.js"), "fx.onFrame(() => steal());").unwrap();
    let t = trust(&s, "mine").await;
    assert_eq!((t["state"].as_str(), t["scriptRuns"].as_bool()), (Some("modified"), Some(false)));
    assert!(t["reason"].as_str().unwrap().contains("changed"));
    let file = get(s.port, "/api/packs/mine/pack.json").await;
    assert_eq!(file.status, 403, "a changed pack is not worn");
    assert!(file.text().starts_with("changed since it was signed"));
    assert_eq!(get(s.port, "/api/packs/mine/fx.js").await.status, 404);
    let listed = get(s.port, "/api/packs").await.json();
    assert_eq!(
        (listed[0]["id"].as_str(), listed[0]["trust"]["state"].as_str()),
        (Some("mine"), Some("modified")),
        "listed, so the studio says why"
    );
    assert_eq!(send(s.port, "PUT", "/api/packs/mine/script-consent", &WRITE, r#"{"granted":true}"#).await.status, 409);

    // an import of a changed pack is refused
    let mut bad = files.clone();
    bad[1].1 = b"{\"id\":\"other\"}".to_vec();
    let refused = import(&s, "other", &bad).await;
    assert_eq!(refused.status, 400, "look.json names another id: refused before the signature");
    let mut bad = files.clone();
    bad[2].1 = b"fx.onFrame(() => 1);".to_vec();
    let refused = import(&s, "mine", &bad).await;
    assert_eq!(refused.status, 409, "{}", refused.text());
    assert!(refused.text().contains("changed since it was signed"));
    s.stop().await;
}

#[tokio::test]
async fn a_signed_pack_names_its_publisher_and_runs_only_where_the_key_allows_scripts() {
    let s = start().await;
    trust_key(&s, &publisher(), "Acme", false);
    let reply = import(&s, "mine", &signed("mine", pack("mine", "1.0.0"), &publisher())).await;
    assert_eq!(reply.json()["trust"], json!({ "state": "signed", "publisher": "Acme" }));
    let t = trust(&s, "mine").await;
    assert_eq!((t["state"].as_str(), t["publisher"].as_str(), t["scriptRuns"].as_bool()), (Some("signed"), Some("Acme"), Some(false)));
    trust_key(&s, &publisher(), "Acme", true);
    assert_eq!(trust(&s, "mine").await["scriptRuns"], true, "the key's Allow pack scripts");
    // a key the user has not added is a signature this app cannot check: unverified
    std::fs::remove_file(s.data().join("widget-keys.json")).unwrap();
    let t = trust(&s, "mine").await;
    assert_eq!(t["state"], "unverified");
    assert!(t["reason"].as_str().unwrap().contains(&publisher().fingerprint()));
    s.stop().await;
}

/// Themely's revoke list as the server keeps it, signed with the test key.
fn revocation_file(keys: Value, packs: Value) -> String {
    let list = json!({ "format": 1, "version": 1, "expires": "2099-01-01T00:00:00Z", "keys": keys, "packs": packs });
    let canonical = {
        // the list's canonical JSON: keys sorted, no whitespace (serde_json with `preserve_order` keeps insertion order)
        fn sorted(v: &Value) -> Value {
            match v {
                Value::Object(m) => {
                    let mut keys: Vec<&String> = m.keys().collect();
                    keys.sort();
                    Value::Object(keys.into_iter().map(|k| (k.clone(), sorted(&m[k]))).collect())
                }
                Value::Array(a) => Value::Array(a.iter().map(sorted).collect()),
                other => other.clone(),
            }
        }
        sorted(&list).to_string()
    };
    let sig = themely().sign(&[b"infopanel-studio pack revocations 1\n".as_slice(), canonical.as_bytes()].concat());
    json!({ "doc": json!({ "list": list, "minisign": sig }).to_string(), "checked": 0 }).to_string()
}

#[tokio::test]
async fn a_withdrawn_key_or_pack_is_refused_with_the_lists_reason() {
    let s = start().await;
    import(&s, "mine", &reviewed("mine", pack("mine", "1.0.0"), &publisher())).await;
    std::fs::write(
        s.data().join("pack-revocation.json"),
        revocation_file(json!([{ "key": publisher().line(), "reason": "stolen key" }]), json!([])),
    )
    .unwrap();
    let t = trust(&s, "mine").await;
    assert_eq!((t["state"].as_str(), t["scriptRuns"].as_bool()), (Some("revoked"), Some(false)));
    assert!(t["reason"].as_str().unwrap().contains("stolen key"));
    let file = get(s.port, "/api/packs/mine/look.json").await;
    assert_eq!(file.status, 403);
    assert!(file.text().starts_with("withdrawn: "));
    assert!(s.packs().join("mine/look.json").is_file(), "the files are kept");
    let again = import(&s, "mine", &reviewed("mine", pack("mine", "1.1.0"), &publisher())).await;
    assert_eq!(again.status, 409, "an import signed with a withdrawn key");

    std::fs::write(s.data().join("pack-revocation.json"), revocation_file(json!([]), json!([{ "id": "mine", "reason": "copies a logo" }])))
        .unwrap();
    assert_eq!(trust(&s, "mine").await["reason"], "copies a logo");
    // a list edited after Themely signed it holds nothing
    let edited = revocation_file(json!([]), json!([{ "id": "mine", "reason": "x" }])).replace("\\\"x\\\"", "\\\"y\\\"");
    std::fs::write(s.data().join("pack-revocation.json"), edited).unwrap();
    assert_eq!(trust(&s, "mine").await["state"], "verified");
    s.stop().await;
}

#[tokio::test]
async fn an_update_needs_the_same_key_and_a_higher_version_even_after_a_remove() {
    let s = start().await;
    trust_key(&s, &publisher(), "Acme", false);
    let at = |v: &str, by: &Signer| signed("mine", pack("mine", v), by);
    assert_eq!(import(&s, "mine", &at("1.1.0", &publisher())).await.status, 200);
    let older = import(&s, "mine", &at("1.0.0", &publisher())).await;
    assert_eq!(older.status, 409, "a rollback");
    assert!(older.text().contains("not newer"));
    assert_eq!(import(&s, "mine", &at("1.1.0", &publisher())).await.status, 200, "the same files again");
    assert_eq!(import(&s, "mine", &pack("mine", "9.0.0")).await.status, 409, "an unsigned pack over a signed one");
    assert_eq!(import(&s, "mine", &at("1.2.0", &publisher())).await.status, 200);
    assert_eq!(trust(&s, "mine").await["state"], "signed");
    assert_eq!(send(s.port, "DELETE", "/api/packs/mine", &WRITE, "").await.status, 204);
    assert_eq!(import(&s, "mine", &at("1.1.0", &publisher())).await.status, 409, "the record outlives the pack");
    let other = Signer::new(5);
    assert!(
        import(&s, "mine", &at("2.0.0", &other)).await.status == 200,
        "a key not added here signs nothing: unverified, which a removed signed pack does not stop"
    );
    s.stop().await;
}

#[tokio::test]
async fn a_signed_packs_css_arrives_by_the_signing_route_under_its_manifest() {
    let s = start().await;
    trust_key(&s, &publisher(), "Acme", false);
    let css = b"a { color: red; }".to_vec();
    let with_css = signed("mine", [pack("mine", "1.0.0"), vec![("pack.css".into(), css.clone())]].concat(), &publisher());
    let without: Files = with_css.iter().filter(|(p, _)| p != "pack.css").cloned().collect();
    let refused = import(&s, "mine", &without).await;
    assert_eq!(refused.status, 409, "the CSS is in the signed manifest: missing, the files differ");
    let mut body: Value = serde_json::from_str(&import_body("mine", &without)).unwrap();
    body["css"] = json!({ "size": css.len(), "sha256": hex(&Sha256::digest(&css)) });
    let stored = send(s.port, "POST", "/api/packs", &WRITE, &body.to_string()).await;
    assert_eq!((stored.status, stored.json()["trust"]["state"].as_str()), (200, Some("signed")), "{}", stored.text());
    let hash = ips_server::pack_sign::content_hash(&with_css);
    let sign =
        send(s.port, "POST", "/api/packs/mine/sign", &WRITE, &json!({ "css": STANDARD.encode(&css), "hash": hash }).to_string()).await;
    assert_eq!(sign.status, 200, "{}", sign.text());
    assert_eq!(trust(&s, "mine").await["state"], "signed");
    assert_eq!(get(s.port, "/api/packs/mine/pack.css").await.status, 200);
    s.stop().await;
}
