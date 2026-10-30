// The dashboard server's integrations (server/integrations.mjs): the OBS WebSocket connection and the calendar (ICS)
// links. They hold secrets (the OBS password, the private calendar URLs), so they live in their own file beside the
// config, never in config.json: every kiosk downloads the config, and only the server reads this file. The studio sees
// the public form (`public_view`) and writes changes with PUT /api/integrations (`apply_integrations`); a secret is
// write-only.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::{js, store};

pub const OBS_DEFAULT_PORT: u16 = 4455;
pub const MAX_LINKS: usize = 10;
const MAX_LABEL: usize = 40;
const MAX_PASSWORD: usize = 512;

#[derive(Debug, Clone, PartialEq)]
pub struct ObsSettings {
    pub host: String,
    pub port: u16,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Link {
    pub id: String,
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Integrations {
    pub obs: ObsSettings,
    pub links: Vec<Link>,
}

pub fn empty_integrations() -> Integrations {
    Integrations {
        obs: ObsSettings {
            host: String::new(),
            port: OBS_DEFAULT_PORT,
            password: String::new(),
        },
        links: vec![],
    }
}

/// `s.slice(0, max)`: `max` is in UTF-16 units; a pair cut in half is dropped (JSON can't hold half of one).
fn slice_units(s: &str, max: usize) -> String {
    let mut units = 0;
    let mut out = String::new();
    for c in s.chars() {
        units += c.len_utf16();
        if units > max {
            break;
        }
        out.push(c);
    }
    out
}

/// `text(v, max)`: a string trimmed and cut to `max` units, or "".
fn text(v: Option<&Value>, max: usize) -> String {
    v.and_then(Value::as_str)
        .map_or_else(String::new, |s| slice_units(js::trim(s), max))
}

/// A host name or IP for OBS, or "" (no scheme, path or spaces).
pub fn clean_host(v: Option<&Value>) -> String {
    let h = text(v, 253);
    let name = |s: &str| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
    };
    let bracketed = h
        .strip_prefix('[')
        .and_then(|r| r.strip_suffix(']'))
        .is_some_and(|inner| {
            !inner.is_empty()
                && inner
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() || b == b':' || b == b'.')
        });
    if bracketed || name(&h) {
        h
    } else {
        String::new()
    }
}

/// `cleanPort`: `Number(v)` when it is a whole number from 1 to 65535, else 4455.
fn clean_port(v: Option<&Value>) -> u16 {
    let n = js::value_to_number(v);
    if n.fract() == 0.0 && (1.0..=65535.0).contains(&n) {
        n as u16
    } else {
        OBS_DEFAULT_PORT
    }
}

/// A calendar link as an https/http URL (webcal:// is https), or `None`.
pub fn clean_calendar_url(v: Option<&Value>) -> Option<String> {
    let raw = text(v, 2048);
    let lower = raw.to_ascii_lowercase();
    let raw = ["webcals://", "webcal://"]
        .iter()
        .find(|p| lower.starts_with(**p))
        .map_or(raw.clone(), |p| format!("https://{}", &raw[p.len()..]));
    let url = url::Url::parse(&raw).ok()?;
    (url.scheme() == "https" || url.scheme() == "http").then(|| url.to_string())
}

/// Tolerant read of the stored file.
pub fn normalize_integrations(raw: &Value) -> Integrations {
    let mut state = empty_integrations();
    let Some(raw) = raw.as_object() else {
        return state;
    };
    if let Some(obs) = raw.get("obs").and_then(Value::as_object) {
        state.obs = ObsSettings {
            host: clean_host(obs.get("host")),
            port: clean_port(obs.get("port").filter(|p| !p.is_null())),
            password: obs
                .get("password")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        };
    }
    let links = raw
        .get("calendar")
        .and_then(|c| c.get("links"))
        .and_then(Value::as_array);
    state.links = links
        .into_iter()
        .flatten()
        .filter(|l| l.is_object())
        .filter_map(|l| {
            let (id, url) = (text(l.get("id"), 64), clean_calendar_url(l.get("url")));
            Some(Link {
                id: Some(id).filter(|id| !id.is_empty())?,
                label: text(l.get("label"), MAX_LABEL),
                url: url?,
            })
        })
        .take(MAX_LINKS)
        .collect();
    state
}

/// `new URL(url).host`: the host name and a port that is not the scheme's default.
fn host_of(url: &str) -> String {
    let Ok(parsed) = url::Url::parse(url) else {
        return String::new();
    };
    let host = parsed.host_str().unwrap_or_default();
    parsed
        .port()
        .map_or_else(|| host.to_string(), |port| format!("{host}:{port}"))
}

/// What the studio may see: no password, and each link only as its host.
pub fn public_view(s: &Integrations) -> Value {
    json!({
        "obs": { "host": s.obs.host, "port": s.obs.port, "hasPassword": !s.obs.password.is_empty() },
        "calendar": { "links": s.links.iter().map(|l| json!({ "id": l.id, "label": l.label, "host": host_of(&l.url) })).collect::<Vec<_>>() },
    })
}

/// The stored form (the keys in the order the file has them).
pub fn stored_form(s: &Integrations) -> Value {
    json!({
        "obs": { "host": s.obs.host, "port": s.obs.port, "password": s.obs.password },
        "calendar": { "links": s.links.iter().map(|l| json!({ "id": l.id, "label": l.label, "url": l.url })).collect::<Vec<_>>() },
    })
}

fn apply_obs(s: &Integrations, obs: &Value) -> Result<ObsSettings, String> {
    let Some(o) = obs.as_object() else {
        return Err("obs: expected an object".into());
    };
    let host = match o.get("host") {
        None => s.obs.host.clone(),
        Some(v) => {
            let host = clean_host(Some(v));
            if !text(Some(v), 2048).is_empty() && host.is_empty() {
                return Err("obs.host: a host name or IP address".into());
            }
            host
        }
    };
    Ok(ObsSettings {
        host,
        port: o.get("port").map_or(s.obs.port, |p| clean_port(Some(p))),
        password: o
            .get("password")
            .and_then(Value::as_str)
            .map_or_else(|| s.obs.password.clone(), |p| slice_units(p, MAX_PASSWORD)),
    })
}

fn apply_links(
    s: &Integrations,
    calendar: &Value,
    new_id: &mut dyn FnMut() -> String,
) -> Result<Vec<Link>, String> {
    let Some(list) = calendar.get("links").and_then(Value::as_array) else {
        return Err("calendar.links: expected a list".into());
    };
    if list.len() > MAX_LINKS {
        return Err(format!("calendar.links: at most {MAX_LINKS}"));
    }
    let mut links = Vec::new();
    for item in list {
        let Some(item) = item.as_object() else {
            return Err("calendar.links: expected objects".into());
        };
        let label = text(item.get("label"), MAX_LABEL);
        let kept = item
            .get("id")
            .and_then(Value::as_str)
            .and_then(|id| s.links.iter().find(|l| l.id == id));
        if let Some(kept) = kept {
            links.push(Link {
                label: if item.contains_key("label") {
                    label
                } else {
                    kept.label.clone()
                },
                ..kept.clone()
            });
            continue;
        }
        let Some(url) = clean_calendar_url(item.get("url")) else {
            return Err("calendar.links: an http(s) or webcal link".into());
        };
        links.push(Link {
            id: new_id(),
            label,
            url,
        });
    }
    Ok(links)
}

/// The state with a studio patch applied, or the error to answer with:
/// - `obs`: { host?, port?, password? }: a password string replaces it, "" clears it, absent keeps it.
/// - `calendar.links`: the full list in order; { id, label? } keeps a stored link, { url, label? } adds one.
pub fn apply_integrations(
    s: &Integrations,
    patch: &Value,
    new_id: &mut dyn FnMut() -> String,
) -> Result<Integrations, String> {
    let Some(patch) = patch.as_object() else {
        return Err("expected a JSON object".into());
    };
    let mut next = s.clone();
    if let Some(obs) = patch.get("obs") {
        next.obs = apply_obs(s, obs)?;
    }
    if let Some(calendar) = patch.get("calendar") {
        next.links = apply_links(s, calendar, new_id)?;
    }
    Ok(next)
}

/// `JSON.stringify(value, null, 2)`.
fn pretty(value: &Value, indent: usize, out: &mut String) {
    let pad = |out: &mut String, depth: usize| out.push_str(&"  ".repeat(depth));
    match value {
        Value::Array(items) if !items.is_empty() => {
            out.push_str("[\n");
            for (i, item) in items.iter().enumerate() {
                pad(out, indent + 1);
                pretty(item, indent + 1, out);
                out.push_str(if i + 1 < items.len() { ",\n" } else { "\n" });
            }
            pad(out, indent);
            out.push(']');
        }
        Value::Object(map) if !map.is_empty() => {
            out.push_str("{\n");
            for (i, (key, item)) in map.iter().enumerate() {
                pad(out, indent + 1);
                out.push_str(&crate::json::stringify(&Value::String(key.clone())));
                out.push_str(": ");
                pretty(item, indent + 1, out);
                out.push_str(if i + 1 < map.len() { ",\n" } else { "\n" });
            }
            pad(out, indent);
            out.push('}');
        }
        other => out.push_str(&crate::json::stringify(other)),
    }
}

type Listener = Box<dyn Fn(&Integrations, &Integrations) + Send + Sync>;

/// The stored integrations with persistence and change listeners.
pub struct IntegrationsStore {
    file: PathBuf,
    state: Mutex<Integrations>,
    listeners: Mutex<Vec<Listener>>,
}

/// Writes the file owner-only where the platform has modes (it holds the OBS password and the secret calendar links).
fn write_private(file: &Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    store::write_atomic(file, text.as_bytes())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

impl IntegrationsStore {
    pub fn load(file: &Path) -> Self {
        let state = store::read_json(file)
            .map_or_else(empty_integrations, |raw| normalize_integrations(&raw));
        Self {
            file: file.to_path_buf(),
            state: Mutex::new(state),
            listeners: Mutex::new(Vec::new()),
        }
    }

    pub fn get(&self) -> Integrations {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn public(&self) -> Value {
        public_view(&self.get())
    }

    /// Runs `listener(next, prev)` after every change that was saved.
    pub fn subscribe(
        &self,
        listener: impl Fn(&Integrations, &Integrations) + Send + Sync + 'static,
    ) {
        self.listeners
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push(Box::new(listener));
    }

    /// Applies a studio patch: `Ok(Err(message))` for a patch that is refused, `Err` when the file can't be written (the
    /// state has changed by then, as it does in Node, and the listeners are not told).
    pub fn apply(&self, patch: &Value) -> std::io::Result<Result<(), String>> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let next = match apply_integrations(&state, patch, &mut || uuid::Uuid::new_v4().to_string())
        {
            Ok(next) => next,
            Err(message) => return Ok(Err(message)),
        };
        let prev = std::mem::replace(&mut *state, next);
        let mut text = String::new();
        pretty(&stored_form(&state), 0, &mut text);
        write_private(&self.file, &text)?;
        for listener in self
            .listeners
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
        {
            listener(&state, &prev);
        }
        Ok(Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids() -> impl FnMut() -> String {
        let mut n = 0;
        move || {
            n += 1;
            format!("id{n}")
        }
    }

    fn applied(s: &Integrations, patch: Value, new_id: &mut dyn FnMut() -> String) -> Integrations {
        apply_integrations(s, &patch, new_id).unwrap()
    }

    #[test]
    fn never_shows_the_password_or_a_calendar_url_to_the_studio() {
        let patch = json!({ "obs": { "host": "127.0.0.1", "password": "hunter2" }, "calendar": { "links": [{ "url": "webcal://calendar.example.com/private/abc/basic.ics", "label": "Work" }] } });
        let s = applied(&empty_integrations(), patch, &mut ids());
        let public = public_view(&s);
        assert!(!public.to_string().contains("hunter2") && !public.to_string().contains("private"));
        assert_eq!(
            public,
            json!({ "obs": { "host": "127.0.0.1", "port": 4455, "hasPassword": true }, "calendar": { "links": [{ "id": "id1", "label": "Work", "host": "calendar.example.com" }] } })
        );
        assert_eq!(
            s.links[0].url,
            "https://calendar.example.com/private/abc/basic.ics"
        );
    }

    #[test]
    fn keeps_a_password_unless_one_is_sent_and_clears_it_with_an_empty_one() {
        let set = applied(
            &empty_integrations(),
            json!({ "obs": { "host": "obs-pc", "password": "pw" } }),
            &mut ids(),
        );
        assert_eq!(
            applied(&set, json!({ "obs": { "port": 4456 } }), &mut ids()).obs,
            ObsSettings {
                host: "obs-pc".into(),
                port: 4456,
                password: "pw".into()
            }
        );
        assert_eq!(
            applied(&set, json!({ "obs": { "password": "" } }), &mut ids())
                .obs
                .password,
            ""
        );
        assert_eq!(
            applied(&set, json!({ "obs": { "password": 5 } }), &mut ids())
                .obs
                .password,
            "pw"
        );
    }

    #[test]
    fn keeps_stored_links_by_id_adds_new_ones_and_drops_the_rest() {
        let mut next = ids();
        let two = applied(
            &empty_integrations(),
            json!({ "calendar": { "links": [{ "url": "https://a.example/a.ics" }, { "url": "https://b.example/b.ics" }] } }),
            &mut next,
        );
        let after = applied(
            &two,
            json!({ "calendar": { "links": [{ "id": "id2", "label": "B", "url": "https://other.example/x" }, { "url": "https://c.example/c.ics" }] } }),
            &mut next,
        );
        let seen: Vec<_> = after
            .links
            .iter()
            .map(|l| (l.id.as_str(), l.label.as_str(), l.url.as_str()))
            .collect();
        assert_eq!(
            seen,
            [
                ("id2", "B", "https://b.example/b.ics"),
                ("id3", "", "https://c.example/c.ics")
            ]
        );
    }

    #[test]
    fn refuses_bad_hosts_and_links_with_the_messages_the_studio_shows() {
        let e = empty_integrations();
        let refusal = |patch: Value| apply_integrations(&e, &patch, &mut ids()).unwrap_err();
        assert_eq!(
            refusal(json!({ "obs": { "host": "ws://x/y" } })),
            "obs.host: a host name or IP address"
        );
        assert_eq!(
            refusal(json!({ "calendar": { "links": [{ "url": "file:///c:/x.ics" }] } })),
            "calendar.links: an http(s) or webcal link"
        );
        assert_eq!(refusal(json!([])), "expected a JSON object");
        assert_eq!(refusal(json!({ "obs": null })), "obs: expected an object");
        assert_eq!(
            refusal(json!({ "calendar": {} })),
            "calendar.links: expected a list"
        );
        assert_eq!(
            refusal(json!({ "calendar": { "links": [1] } })),
            "calendar.links: expected objects"
        );
        let eleven = vec![json!({ "url": "https://a.example/a" }); 11];
        assert_eq!(
            refusal(json!({ "calendar": { "links": eleven } })),
            "calendar.links: at most 10"
        );
        assert_eq!(
            clean_calendar_url(Some(&json!("javascript:alert(1)"))),
            None
        );
        // A host that is not a string clears the host without an error; a bad port becomes 4455.
        let set = applied(
            &e,
            json!({ "obs": { "host": "obs-pc", "port": 99999 } }),
            &mut ids(),
        );
        assert_eq!(set.obs.port, 4455);
        assert_eq!(
            applied(&set, json!({ "obs": { "host": 7 } }), &mut ids())
                .obs
                .host,
            ""
        );
    }

    #[test]
    fn reads_a_damaged_file_as_empty_and_normalises_values() {
        assert_eq!(normalize_integrations(&json!("x")), empty_integrations());
        let damaged = json!({ "obs": { "host": "bad host", "port": 99999 }, "calendar": { "links": [{ "id": "a", "url": "ftp://x" }] } });
        assert_eq!(normalize_integrations(&damaged), empty_integrations());
    }

    #[test]
    fn saves_pretty_and_private_and_tells_listeners_the_old_and_new_state() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("sub").join("integrations.json");
        let store = IntegrationsStore::load(&file);
        let seen = std::sync::Arc::new(Mutex::new(Vec::new()));
        let log = std::sync::Arc::clone(&seen);
        store.subscribe(move |next, prev| {
            log.lock()
                .unwrap()
                .push((prev.obs.host.clone(), next.obs.host.clone()))
        });
        store.apply(&json!({ "obs": { "host": "localhost", "password": "pw" }, "calendar": { "links": [{ "url": "https://a.example/x.ics", "label": "A" }] } })).unwrap().unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            [(String::new(), "localhost".to_string())]
        );
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.starts_with("{\n  \"obs\": {\n    \"host\": \"localhost\",\n    \"port\": 4455,\n    \"password\": \"pw\"\n  },\n  \"calendar\": {\n    \"links\": [\n      {\n        \"id\": \""));
        assert!(text.ends_with("\"\n      }\n    ]\n  }\n}"));
        assert_eq!(IntegrationsStore::load(&file).get().obs.host, "localhost");
        // A refused patch changes nothing.
        assert!(store.apply(&json!(5)).unwrap().is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), text);
    }

    #[test]
    fn empty_state_is_written_with_empty_arrays_inline() {
        let mut text = String::new();
        pretty(&stored_form(&empty_integrations()), 0, &mut text);
        assert_eq!(text, "{\n  \"obs\": {\n    \"host\": \"\",\n    \"port\": 4455,\n    \"password\": \"\"\n  },\n  \"calendar\": {\n    \"links\": []\n  }\n}");
    }
}
