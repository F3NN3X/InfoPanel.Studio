// Pack effect scripts on the server (Cyberspec v2): whether a pack's script may run, the user's answer for one that is not
// verified, the switches, and the one route that serves a script. The client's sandbox (src/looks/pack-script/) asks these
// routes and runs nothing they do not allow; the declarative parts of a pack never depend on them.
//
// GET /api/packs/<id>/trust           `{ state, publisher?, reason?, hasScript, consent, scriptRuns, scriptSha256? }` (pack_trust.rs
//                                     states; `consent` is `none`, `granted` or `denied`)
// PUT /api/packs/<id>/script-consent  `{ "granted": bool }`, the user's answer for this pack's files (a write: the import's guards)
// GET /api/packs/<id>/fx.js           the script, only while `scriptRuns`: `text/javascript`, `nosniff`, `no-store`, a CSP that
//                                     allows nothing; with `?sha256=<hex>` 409 unless the bytes are those. 404 otherwise.
// GET/PUT /api/pack-scripts           `{ on, env, fetching, stale }`: the studio's switch (`{ "on": bool }`, the import's guards),
//                                     `env` false under PACK_SCRIPTS=off, and the revoke list's fetch (pack_revocation.rs)
//
// - `scriptRuns`: the pack has a script, scripts are on (PACK_SCRIPTS not off and the studio's switch on), the pack is neither
//   Modified nor Revoked, the revoke list is not stale, and the pack is Verified, Signed by a key whose "Allow pack scripts" is
//   on, or the user said yes to these files. Every kiosk asks, so the switches hold on every device.
// - The answer is bound to the pack's manifest (its SHA-256): an update, other bytes, asks again. It is kept in
//   packs/.consent.json `{ "<id>": { "manifest", "granted" } }`, the switch in packs/.scripts.json `{ "on" }`, and the last signed
//   version of each id in packs/.installed.json (pack_trust::Installed, kept after a remove so an older version cannot come back).
//   No pack id starts with a dot, so none of these is ever a pack.
// - The script is the pack's `script.file` in pack.json: an asset (`assets/<file>`, a `.js`), stored like any other and never
//   served by the file route.

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Value};

use crate::http::{self, Req};
use crate::pack_trust::{Installed, State, Trust};
use crate::packs::Packs;
use crate::widgets::sha256_hex;
use crate::App;

const CONSENT: &str = ".consent.json";
const SWITCH: &str = ".scripts.json";
const INSTALLED: &str = ".installed.json";
/// A script is at most this many bytes (the client's cap too).
pub const SCRIPT_MAX_BYTES: u64 = 64 * 1024;

/// The path of the script `pack.json` names (`script.file`, an asset ending in `.js`), or `None`.
pub fn script_path(pack_json: &[u8]) -> Option<String> {
    let pack: Value = serde_json::from_slice(pack_json).ok()?;
    let path = format!("assets/{}", pack.get("script")?.get("file")?.as_str()?);
    (crate::packs::is_pack_file(&path) && path.ends_with(".js")).then_some(path)
}

/// Whether a pack's script runs (the rule above).
pub fn runs(trust: &Trust, has_script: bool, scripts_on: bool, stale: bool, consent: &str) -> bool {
    has_script
        && scripts_on
        && !stale
        && match trust.state {
            State::Verified => true,
            State::Signed => trust.scripts_allowed || consent == "granted",
            State::Unverified => consent == "granted",
            State::Modified | State::Revoked => false,
        }
}

/// What the routes say of one pack.
pub struct Verdict {
    pub trust: Trust,
    /// The script's bytes, when the pack has one.
    pub script: Option<Vec<u8>>,
    pub consent: &'static str,
    pub runs: bool,
}

impl Verdict {
    fn view(&self) -> Value {
        let mut out = self.trust.view();
        out["hasScript"] = json!(self.script.is_some());
        out["consent"] = json!(self.consent);
        out["scriptRuns"] = json!(self.runs);
        if let Some(bytes) = &self.script {
            out["scriptSha256"] = json!(sha256_hex(bytes));
        }
        out
    }
}

fn read(packs: &Packs, name: &str) -> Value {
    crate::store::read_json(&packs.dir().join(name)).filter(Value::is_object).unwrap_or_else(|| json!({}))
}

fn write(packs: &Packs, name: &str, value: &Value) -> std::io::Result<()> {
    std::fs::create_dir_all(packs.dir())?;
    crate::store::write_atomic(&packs.dir().join(name), value.to_string().as_bytes())
}

/// Whether the studio's switch is on (on when it was never set).
pub fn switch_on(packs: &Packs) -> bool {
    read(packs, SWITCH).get("on").and_then(Value::as_bool).unwrap_or(true)
}

/// The user's answer for pack `id` with the manifest `manifest`: `none` when there is none for these files.
pub fn consent(packs: &Packs, id: &str, manifest: &str) -> &'static str {
    let all = read(packs, CONSENT);
    match all.get(id).filter(|c| c.get("manifest").and_then(Value::as_str) == Some(manifest)).and_then(|c| c.get("granted")?.as_bool()) {
        Some(true) => "granted",
        Some(false) => "denied",
        None => "none",
    }
}

/// The record of the last signed version of `id` stored.
pub fn installed(packs: &Packs, id: &str) -> Option<Installed> {
    Installed::of(read(packs, INSTALLED).get(id)?)
}

/// Records a signed version stored (the caller holds the write lock).
pub fn record(packs: &Packs, id: &str, installed: &Installed) -> std::io::Result<()> {
    let mut all = read(packs, INSTALLED);
    all[id] = installed.to_json();
    write(packs, INSTALLED, &all)
}

/// The verdict on pack `id` as it is stored now (every file hashed again), or `None` when there is no such pack.
pub fn verdict(packs: &Packs, id: &str, now: i64) -> Option<Verdict> {
    let (trust, files) = packs.trust_now(id)?;
    let file = |name: &str| files.iter().find(|(p, _)| p == name).map(|(_, b)| b.clone());
    let script = file("pack.json").and_then(|p| script_path(&p)).and_then(|path| file(&path));
    let consent = consent(packs, id, &trust.manifest_sha256);
    let on = packs.scripts_env() && switch_on(packs);
    let runs = runs(&trust, script.is_some(), on, packs.revocations.stale(now), consent);
    Some(Verdict { trust, script, consent, runs })
}

fn no_store(mut reply: Response<Body>) -> Response<Body> {
    reply.headers_mut().insert("Cache-Control", axum::http::HeaderValue::from_static("no-store"));
    reply
}

/// GET /api/packs/<id>/trust.
pub fn handle_trust(app: &App, id: &str) -> Response<Body> {
    match verdict(&app.packs, id, crate::config::now_ms()) {
        Some(v) => no_store(http::json(200, &v.view())),
        None => http::empty(404),
    }
}

/// PUT /api/packs/<id>/script-consent.
pub async fn handle_consent(app: &App, mut req: Req, id: &str) -> std::io::Result<Response<Body>> {
    let packs = &app.packs;
    if let Some(refusal) = packs.write_refusal(&req) {
        return Ok(http::text(403, refusal));
    }
    let Ok(text) = req.read_body(1024).await else {
        return Ok(http::closing(http::text(413, "the body is too large")));
    };
    let Some(granted) = serde_json::from_str::<Value>(&text).ok().and_then(|b| b.get("granted")?.as_bool()) else {
        return Ok(http::text(400, "granted is true or false"));
    };
    let _held = packs.lock();
    let Some(v) = verdict(packs, id, crate::config::now_ms()) else {
        return Ok(http::empty(404));
    };
    if v.trust.state.refused() {
        return Ok(http::text(409, format!("this pack is refused: {}", v.trust.reason.unwrap_or_default())));
    }
    if v.script.is_none() {
        return Ok(http::text(400, "this pack has no script"));
    }
    let mut all = read(packs, CONSENT);
    all[id] = json!({ "manifest": v.trust.manifest_sha256, "granted": granted });
    write(packs, CONSENT, &all)?;
    drop(_held);
    Ok(handle_trust(app, id))
}

/// GET/HEAD /api/packs/<id>/fx.js.
pub fn handle_script(app: &App, req: &Req, id: &str) -> Response<Body> {
    let Some(bytes) = verdict(&app.packs, id, crate::config::now_ms()).filter(|v| v.runs).and_then(|v| v.script) else {
        return http::empty(404);
    };
    if req.query("sha256").is_some_and(|want| want != sha256_hex(&bytes)) {
        return http::text(409, "the script is not the one asked for (it changed): read the pack's trust again");
    }
    let length = bytes.len();
    Response::builder()
        .status(200)
        .header("Content-Type", "text/javascript; charset=utf-8")
        .header("Content-Length", length.to_string())
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(if req.method == Method::HEAD { Body::empty() } else { Body::from(bytes) })
        .unwrap_or_default()
}

/// /api/pack-scripts: the switches, read by any page; the studio's set under the import's guards.
pub async fn handle_switch(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let packs = &app.packs;
    let view = |packs: &Packs| {
        json!({
            "on": switch_on(packs),
            "env": packs.scripts_env(),
            "fetching": packs.revocations.fetching(),
            "stale": packs.revocations.stale(crate::config::now_ms()),
        })
    };
    match req.method {
        Method::GET => Ok(no_store(http::json(200, &view(packs)))),
        Method::PUT => {
            if let Some(refusal) = packs.write_refusal(&req) {
                return Ok(http::text(403, refusal));
            }
            let Ok(text) = req.read_body(1024).await else {
                return Ok(http::closing(http::text(413, "the body is too large")));
            };
            let Some(on) = serde_json::from_str::<Value>(&text).ok().and_then(|b| b.get("on")?.as_bool()) else {
                return Ok(http::text(400, "on is true or false"));
            };
            let _held = packs.lock();
            write(packs, SWITCH, &json!({ "on": on }))?;
            Ok(no_store(http::json(200, &view(packs))))
        }
        _ => Ok(http::empty(405)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trust(state: State, scripts_allowed: bool) -> Trust {
        Trust { state, publisher: None, reason: None, scripts_allowed, manifest_sha256: String::new(), version: String::new(), key: None }
    }

    #[test]
    fn a_script_runs_by_the_state_the_switches_the_list_and_the_answer() {
        use State::*;
        let cases = [
            (trust(Verified, true), "none", true),
            (trust(Signed, true), "none", true),
            (trust(Signed, false), "none", false),
            (trust(Signed, false), "granted", true),
            (trust(Unverified, false), "none", false),
            (trust(Unverified, false), "denied", false),
            (trust(Unverified, false), "granted", true),
            (trust(Modified, true), "granted", false),
            (trust(Revoked, true), "granted", false),
        ];
        for (t, consent, want) in &cases {
            assert_eq!(runs(t, true, true, false, consent), *want, "{:?} {consent}", t.state);
            assert!(!runs(t, false, true, false, consent), "no script");
            assert!(!runs(t, true, false, false, consent), "switched off");
            assert!(!runs(t, true, true, true, consent), "the revoke list is stale");
        }
    }

    #[test]
    fn the_script_is_a_js_asset_pack_json_names() {
        assert_eq!(script_path(br#"{"script":{"file":"fx.js"}}"#).as_deref(), Some("assets/fx.js"));
        for bad in [
            r#"{"script":{"file":"fx.png"}}"#,
            r#"{"script":{"file":"../fx.js"}}"#,
            r#"{"script":{"file":"a/fx.js"}}"#,
            r#"{"script":"fx.js"}"#,
            "{}",
            "x",
        ] {
            assert_eq!(script_path(bad.as_bytes()), None, "{bad}");
        }
    }
}
