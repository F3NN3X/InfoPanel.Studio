// The pack revoke list Themely publishes (`revoked.json`): the pack and publisher keys withdrawn since the app was built, and the
// packs withdrawn by id or manifest. It adds to the list that ships with each update (widget-keys-revoked.json), never replaces it.
//
// - The list is signed by Themely's pinned pack key (pack_trust.rs): `{ "list": { "format": 1, "version", "expires", "keys":
//   [{ "key", "reason" }], "packs": [{ "id"?, "version"?, "manifestSha256"?, "reason" }] }, "minisign" }`, the signature over
//   `DOMAIN` and the list as canonical JSON. `version` only rises (an older list is a rollback and is refused); a list past its
//   `expires` is refused too, so a frozen copy cannot be replayed for ever.
// - The server fetches it once a day through the guarded client, pinned to `HOSTS` (as the weather source), sending only the
//   request. `URL` stays `None`, so nothing is fetched, until the owner sets it up; `PACK_REVOCATION=off` turns the fetch off.
// - The last good list is kept in DATA_DIR/pack-revocation.json with when it was last confirmed, and is checked again on every
//   read. While the fetch is on and no list has been confirmed for `STALE_AFTER`, the list is stale: the scripts of packs that
//   are not built in stop (pack_scripts.rs); a pack's declarative parts are not affected.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::guarded_net::GuardedClient;
use crate::pack_trust::Withdrawn;
use crate::widget_sign::{self, Key};

/// What the signed list's bytes start with.
pub const DOMAIN: &[u8] = b"infopanel-studio pack revocations 1\n";
/// Where Themely publishes the list, and the only host the fetch may reach; `None` until the owner sets it up.
pub const URL: Option<&str> = None;
pub const HOSTS: [&str; 1] = ["themely.dev"];
pub const FILE: &str = "pack-revocation.json";
const EVERY: Duration = Duration::from_secs(24 * 3600);
const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_BYTES: usize = 256 * 1024;
/// A list not confirmed for this long (ms) is stale.
pub const STALE_AFTER: i64 = 30 * 24 * 3600 * 1000;

/// A verified list.
#[derive(Clone, Debug, Default)]
pub struct List {
    pub version: u64,
    /// Ms since the epoch.
    pub expires: i64,
    pub keys: Vec<(Key, String)>,
    pub packs: Vec<Withdrawn>,
}

/// The list in `text` when Themely's key signed it, or why not.
pub fn parse(text: &str, themely: &Key) -> Result<List, String> {
    let doc: Value = serde_json::from_str(text).map_err(|_| "the list is not JSON")?;
    let (Some(list), Some(sig)) = (doc.get("list"), doc.get("minisign").and_then(Value::as_str)) else {
        return Err("the list is not signed".into());
    };
    let bytes = [DOMAIN, widget_sign::canonical_json(list)?.as_bytes()].concat();
    if !themely.verifies(&bytes, sig) {
        return Err("the list's signature is not Themely's".into());
    }
    let version = list.get("version").and_then(Value::as_u64).ok_or("the list has no version")?;
    let expires = list
        .get("expires")
        .and_then(Value::as_str)
        .and_then(|e| chrono::DateTime::parse_from_rfc3339(e).ok())
        .map(|e| e.timestamp_millis())
        .ok_or("the list has no expiry")?;
    let keys = list
        .get("keys")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|e| {
            let key = Key::parse(e.get("key")?.as_str()?).ok()?;
            Some((key, e.get("reason").and_then(Value::as_str).unwrap_or("withdrawn").chars().take(200).collect()))
        })
        .collect();
    Ok(List { version, expires, keys, packs: Withdrawn::list(list.get("packs")) })
}

/// A fetched list taken over the one held: signed by Themely, not older than it (no rollback) and not expired at `now`.
pub fn accept(held: Option<&List>, text: &str, themely: &Key, now: i64) -> Result<List, String> {
    let list = parse(text, themely)?;
    if let Some(held) = held.filter(|h| h.version > list.version) {
        return Err(format!("version {} is older than the list held ({})", list.version, held.version));
    }
    if now >= list.expires {
        return Err("the list has expired".into());
    }
    Ok(list)
}

/// The revoke list's keeper: its file, Themely's key and the fetch (when it is on).
pub struct Revocations {
    file: PathBuf,
    themely: Option<Key>,
    fetch: Option<(url::Url, GuardedClient)>,
}

impl Revocations {
    /// The keeper of `data_dir`. The fetch is on when `URL` is set, Themely's key is, and `PACK_REVOCATION` is not off.
    pub fn new(data_dir: &Path, themely: Option<Key>) -> Self {
        let on = !matches!(std::env::var("PACK_REVOCATION").ok().as_deref(), Some("off" | "0"));
        let fetch = URL.filter(|_| on && themely.is_some()).and_then(|u| Some((url::Url::parse(u).ok()?, GuardedClient::new(true).ok()?)));
        Self::with(data_dir, themely, fetch)
    }

    pub fn with(data_dir: &Path, themely: Option<Key>, fetch: Option<(url::Url, GuardedClient)>) -> Self {
        let me = Self { file: data_dir.join(FILE), themely, fetch };
        // the clock of a list never confirmed starts with the first run that fetches
        if me.fetch.is_some() && crate::store::read_json(&me.file).is_none() {
            let _ = me.write(None, crate::config::now_ms());
        }
        me
    }

    fn write(&self, doc: Option<&str>, checked: i64) -> std::io::Result<()> {
        if let Some(parent) = self.file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        crate::store::write_atomic(&self.file, json!({ "doc": doc, "checked": checked }).to_string().as_bytes())
    }

    /// The list held and when it was last confirmed (ms): checked against Themely's key again, so a file edited by hand holds none.
    fn held(&self) -> (Option<(String, List)>, i64) {
        let file = crate::store::read_json(&self.file).unwrap_or(Value::Null);
        let checked = file.get("checked").and_then(Value::as_i64).unwrap_or(0);
        let doc = file.get("doc").and_then(Value::as_str).map(str::to_string);
        let list = doc.zip(self.themely.as_ref()).and_then(|(d, k)| parse(&d, k).ok().map(|l| (d, l)));
        (list, checked)
    }

    /// The list held, verified now; empty when there is none.
    pub fn list(&self) -> List {
        self.held().0.map(|(_, l)| l).unwrap_or_default()
    }

    /// Whether the fetch is on and no list was confirmed within `STALE_AFTER` of `now`.
    pub fn stale(&self, now: i64) -> bool {
        self.fetch.is_some() && now - self.held().1 > STALE_AFTER
    }

    /// Whether the server fetches the list.
    pub fn fetching(&self) -> bool {
        self.fetch.is_some()
    }

    /// Takes `text` (a fetched list) when `accept` does: a newer list replaces the one held, the same one is confirmed again.
    pub fn take(&self, text: &str, now: i64) -> Result<(), String> {
        let themely = self.themely.as_ref().ok_or("no Themely key")?;
        let (held, _) = self.held();
        let list = accept(held.as_ref().map(|(_, l)| l), text, themely, now)?;
        let doc = match held {
            Some((doc, was)) if was.version == list.version => doc,
            _ => text.to_string(),
        };
        self.write(Some(&doc), now).map_err(|e| e.to_string())
    }

    async fn fetch_once(&self, now: i64) -> Result<(), String> {
        let (url, client) = self.fetch.as_ref().ok_or("off")?;
        let hosts: Vec<String> = HOSTS.iter().map(|h| h.to_string()).collect();
        let call = async {
            client.check_listed(url, &hosts).await?;
            let ua = format!("InfoPanel-Studio/{}", crate::env::version());
            let got = client.get(url, &[("Accept", "application/json"), ("User-Agent", &ua)], MAX_BYTES).await?;
            if !(200..300).contains(&got.status) {
                return Err(format!("HTTP {}", got.status));
            }
            String::from_utf8(got.body).map_err(|_| "the list is not UTF-8".to_string())
        };
        let text = tokio::time::timeout(TIMEOUT, call).await.unwrap_or_else(|_| Err("timed out".into()))?;
        self.take(&text, now)
    }

    /// Fetches at once, then once a day. Never returns.
    async fn run(&self) {
        loop {
            if let Err(why) = self.fetch_once(crate::config::now_ms()).await {
                log::warn!(target: "server", "Pack revoke list: {why}");
            }
            tokio::time::sleep(EVERY).await;
        }
    }

    /// Starts the supervised fetch (none when it is off, or in a server that does not run its backends).
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>, live: bool) -> Option<JoinHandle<()>> {
        let me = Arc::clone(self);
        (live && self.fetch.is_some()).then(|| {
            crate::supervisor::spawn("pack-revocation", shutdown.clone(), move || {
                let me = Arc::clone(&me);
                async move { me.run().await }
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pack_trust::testing::Signer;

    const DAY: i64 = 24 * 3600 * 1000;
    /// 2026-11-23T00:00:00Z.
    const NOW: i64 = 1_795_392_000_000;

    fn signed(by: &Signer, version: u64, expires: &str) -> String {
        let list = json!({
            "format": 1, "version": version, "expires": expires,
            "keys": [{ "key": Signer::new(9).key().line, "reason": "stolen" }],
            "packs": [{ "id": "bad", "reason": "copies a logo" }],
        });
        let sig = by.sign(&[DOMAIN, widget_sign::canonical_json(&list).unwrap().as_bytes()].concat());
        json!({ "list": list, "minisign": sig }).to_string()
    }

    #[test]
    fn a_list_is_taken_only_signed_by_themely_newer_and_unexpired() {
        let (themely, other) = (Signer::new(2), Signer::new(3));
        let key = themely.key();
        let list = accept(None, &signed(&themely, 3, "2026-12-31T00:00:00Z"), &key, NOW).unwrap();
        assert_eq!((list.version, list.keys.len(), list.packs[0].reason.as_str()), (3, 1, "copies a logo"));
        assert_eq!(list.keys[0].1, "stolen");
        assert!(accept(None, &signed(&other, 3, "2026-12-31T00:00:00Z"), &key, NOW).unwrap_err().contains("not Themely's"));
        assert!(accept(Some(&list), &signed(&themely, 2, "2026-12-31T00:00:00Z"), &key, NOW).unwrap_err().contains("older"), "rollback");
        assert!(accept(Some(&list), &signed(&themely, 3, "2026-12-31T00:00:00Z"), &key, NOW).is_ok(), "the same version again");
        assert!(accept(None, &signed(&themely, 4, "2026-11-22T00:00:00Z"), &key, NOW).unwrap_err().contains("expired"));
        let mut edited: Value = serde_json::from_str(&signed(&themely, 5, "2026-12-31T00:00:00Z")).unwrap();
        edited["list"]["packs"] = json!([]);
        assert!(accept(None, &edited.to_string(), &key, NOW).is_err(), "an entry taken out after signing");
        assert!(parse("{}", &key).is_err());
    }

    #[test]
    fn the_keeper_holds_the_newest_list_and_goes_stale_without_one() {
        let dir = tempfile::tempdir().unwrap();
        let themely = Signer::new(2);
        let url = url::Url::parse("https://themely.dev/revoked.json").unwrap();
        let keeper = Revocations::with(dir.path(), Some(themely.key()), Some((url, GuardedClient::new(true).unwrap())));
        assert!(!keeper.stale(crate::config::now_ms()), "the clock starts at the first run");
        assert!(keeper.stale(crate::config::now_ms() + STALE_AFTER + DAY));
        keeper.take(&signed(&themely, 2, "2026-12-31T00:00:00Z"), NOW).unwrap();
        assert_eq!(keeper.list().version, 2);
        assert!(keeper.take(&signed(&themely, 1, "2026-12-31T00:00:00Z"), NOW + DAY).is_err());
        assert_eq!(keeper.list().version, 2, "a rollback changes nothing");
        assert!(!keeper.stale(NOW + 29 * DAY));
        assert!(keeper.stale(NOW + 31 * DAY), "nothing confirmed for 30 days");
        keeper.take(&signed(&themely, 2, "2026-12-31T00:00:00Z"), NOW + 20 * DAY).unwrap();
        assert!(!keeper.stale(NOW + 31 * DAY), "the same list confirmed again");
        // a file edited by hand holds no list, and no key reads none
        std::fs::write(dir.path().join(FILE), json!({ "doc": "{}", "checked": NOW }).to_string()).unwrap();
        assert_eq!(keeper.list().version, 0);
        let off = Revocations::with(dir.path(), Some(themely.key()), None);
        assert!(!off.stale(NOW + 365 * DAY), "a fetch that is off is never stale");
        assert!(!off.fetching());
    }

    #[test]
    fn the_fetch_is_off_until_the_owner_sets_the_url() {
        assert!(URL.is_none());
        let dir = tempfile::tempdir().unwrap();
        assert!(!Revocations::new(dir.path(), Some(Signer::new(2).key())).fetching());
        assert!(!dir.path().join(FILE).exists(), "nothing written while off");
    }
}
