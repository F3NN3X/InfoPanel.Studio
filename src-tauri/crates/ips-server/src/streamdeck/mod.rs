// The Stream Deck connection: the Elgato Stream Deck app's "Virtual Stream Deck v2" (VSD2) server on this PC, which
// lets a client open virtual decks (key grids), shows it each key's title and icon and runs a key's real action when the
// client presses it. Each widget has its own virtual device from the registry in the integrations file
// (settings.rs); while the connection is on, each device has a session (session.rs) that connects, pairs, opens or
// creates the app's device and follows its keys. Every session uses the one stored keypair, so the app trusts us once.
// GET /api/streamdeck and the SSE /events/streamdeck carry `{ enabled, pairingCode, devices }`; icons are served by
// GET /api/streamdeck/icon and actions taken by POST /api/streamdeck/act (routes.rs). The secret key never leaves the
// integrations file.

pub mod act;
pub mod client;
pub mod crypto;
pub mod icon;
pub mod port;
pub mod proto;
pub mod routes;
mod session;
pub mod settings;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::Duration;

use axum::body::Bytes;
use crypto_box::SecretKey;
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot, watch};

use crate::integrations::IntegrationsStore;
use crate::json::stringify;
use crate::{sse, supervisor};
use icon::IconData;
pub use port::Endpoint;
use session::Cmd;
use settings::{Device, StreamdeckSettings};

/// Keys past this index are not kept: the largest grid is 8 x 8.
pub const MAX_KEYS: u32 = settings::MAX_GRID * settings::MAX_GRID;
const QUEUED_CMDS: usize = 32;
/// How long a forget waits for the session to delete the app's device.
const FORGET_WAIT: Duration = Duration::from_secs(3);

/// Where a device's session is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    /// The connection is off.
    Off,
    /// The Stream Deck app isn't running (nothing listens on its port).
    Absent,
    Connecting,
    /// The app asks whether to trust us; the pairing code is what it shows.
    Pairing,
    /// The device is open: its keys are shown and can be pressed.
    Ready,
    Error,
}

impl Status {
    fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Absent => "absent",
            Self::Connecting => "connecting",
            Self::Pairing => "pairing",
            Self::Ready => "ready",
            Self::Error => "error",
        }
    }
}

/// Which page to show.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageTo {
    Next,
    Prev,
    /// The page's index, as the app's context counts them.
    Index(u32),
}

/// Why an action was refused.
#[derive(Debug, PartialEq)]
pub enum ActError {
    Off,
    NoDevice,
    /// The device isn't open in the app (yet).
    NotReady,
    Invalid(String),
}

/// A device's live state: from the app's context (titles, page) and its icons, for the current page.
struct DeviceState {
    status: Status,
    error: Option<String>,
    /// (current, total)
    page: (u32, u32),
    titles: BTreeMap<u32, String>,
    icons: BTreeMap<u32, IconData>,
}

impl Default for DeviceState {
    fn default() -> Self {
        Self {
            status: Status::Connecting,
            error: None,
            page: (0, 0),
            titles: BTreeMap::new(),
            icons: BTreeMap::new(),
        }
    }
}

impl DeviceState {
    fn keys_json(&self) -> Vec<Value> {
        let indexes: BTreeSet<u32> = self
            .titles
            .keys()
            .chain(self.icons.keys())
            .copied()
            .collect();
        let key = |i: u32| json!({ "index": i, "title": self.titles.get(&i).map_or("", String::as_str), "icon": self.icons.get(&i).map(|icon| icon.version.as_str()) });
        indexes.into_iter().map(key).collect()
    }
}

struct Session {
    cmds: mpsc::Sender<Cmd>,
    stop: watch::Sender<bool>,
}

/// The pairing: the app asks the user once per keypair, so one session at a time asks (sends `Authenticate`), and once
/// it said yes the others ask too (the app knows the key by then).
#[derive(Default)]
struct Pairing {
    /// An ask is wanted: the connection was just turned on, or the user pressed Pair.
    wanted: bool,
    /// The device whose session is asking.
    claimant: Option<String>,
    trusted: bool,
}

struct Inner {
    settings: StreamdeckSettings,
    states: HashMap<String, DeviceState>,
    sessions: HashMap<String, Session>,
}

pub struct StreamDeck {
    store: Arc<IntegrationsStore>,
    endpoint: Endpoint,
    inner: Mutex<Inner>,
    pairing: Mutex<Pairing>,
    /// Bumped when the pairing changes, so the sessions waiting to ask look again.
    pair_kick: watch::Sender<u64>,
    /// The newest state as an event; a stream only ever needs this one.
    latest: watch::Sender<Bytes>,
    /// Set by `start`: sessions run only on a started server, and stop with it.
    shutdown: OnceLock<watch::Receiver<bool>>,
}

fn locked<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl StreamDeck {
    /// The connection over the settings in `store`, talking to `endpoint`. Nothing runs until `start`.
    pub fn new(store: Arc<IntegrationsStore>, endpoint: Endpoint) -> Arc<Self> {
        // A connection that is on without a key (a damaged file) gets one now.
        let stored = store.get().streaming.streamdeck;
        if stored.enabled && stored.secret_key.is_empty() {
            if let Err(e) = store.update_streamdeck(|_| ()) {
                log::error!(target: "server", "saving the Stream Deck key failed: {e}");
            }
        }
        let deck = Arc::new(Self {
            endpoint,
            inner: Mutex::new(Inner {
                settings: store.get().streaming.streamdeck,
                states: HashMap::new(),
                sessions: HashMap::new(),
            }),
            store: Arc::clone(&store),
            pairing: Mutex::new(Pairing::default()),
            pair_kick: watch::channel(0).0,
            latest: watch::channel(Bytes::new()).0,
            shutdown: OnceLock::new(),
        });
        store.subscribe({
            let weak = Arc::downgrade(&deck);
            move |next, prev| {
                if next.streaming.streamdeck != prev.streaming.streamdeck {
                    if let Some(deck) = weak.upgrade() {
                        deck.sync(next.streaming.streamdeck.clone());
                    }
                }
            }
        });
        deck.publish();
        deck
    }

    /// Starts a session per device while the connection is on; they stop when `shutdown` is set.
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) {
        if self.shutdown.set(shutdown.clone()).is_err() {
            return;
        }
        let on = {
            let mut inner = locked(&self.inner);
            self.reconcile(&mut inner);
            inner.settings.enabled
        };
        if on {
            self.request_pair();
        }
        let (deck, mut shutdown) = (Arc::clone(self), shutdown.clone());
        tokio::spawn(async move {
            let _ = shutdown.wait_for(|stop| *stop).await;
            deck.reconcile(&mut locked(&deck.inner));
        });
        self.publish();
    }

    /// The stored settings changed (called by the store, with its lock held: nothing here may write to it).
    fn sync(self: &Arc<Self>, settings: StreamdeckSettings) {
        let turned_on = {
            let mut inner = locked(&self.inner);
            let was_on = inner.settings.enabled;
            inner.settings = settings;
            self.reconcile(&mut inner);
            inner.settings.enabled && !was_on
        };
        // The first session after the connection is turned on asks to be trusted without waiting for Pair.
        if turned_on {
            self.request_pair();
        }
        self.publish();
    }

    /// Runs a session for each device while the connection is on and the server runs, and none otherwise.
    fn reconcile(self: &Arc<Self>, inner: &mut Inner) {
        let Some(shutdown) = self.shutdown.get() else {
            return;
        };
        let running = inner.settings.enabled && !*shutdown.borrow();
        let wanted: Vec<String> = if running {
            inner
                .settings
                .devices
                .iter()
                .map(|d| d.id.clone())
                .collect()
        } else {
            Vec::new()
        };
        inner.sessions.retain(|id, session| {
            let keep = wanted.contains(id);
            if !keep {
                let _ = session.stop.send(true);
            }
            keep
        });
        inner.states.retain(|id, _| wanted.contains(id));
        for id in wanted {
            if !inner.sessions.contains_key(&id) {
                inner.sessions.insert(id.clone(), self.spawn_session(&id));
            }
        }
    }

    fn spawn_session(self: &Arc<Self>, id: &str) -> Session {
        let (cmds, rx) = mpsc::channel(QUEUED_CMDS);
        let (stop, stopped) = watch::channel(false);
        let rx = Arc::new(tokio::sync::Mutex::new(rx));
        let (deck, id) = (Arc::clone(self), id.to_string());
        supervisor::spawn("streamdeck", stopped, move || {
            let (deck, id, rx) = (Arc::clone(&deck), id.clone(), Arc::clone(&rx));
            async move { session::run(deck, id, rx).await }
        });
        Session { cmds, stop }
    }

    // ---- the state ----

    /// The state kiosks get: `{ enabled, pairingCode, devices: [{ id, name, cols, rows, status, error?, page, keys }] }`.
    pub fn json(&self) -> Value {
        let inner = locked(&self.inner);
        let s = &inner.settings;
        let devices: Vec<Value> = s
            .devices
            .iter()
            .map(|d| {
                let state = inner.states.get(&d.id).filter(|_| s.enabled);
                let status = if s.enabled { state.map_or(Status::Connecting, |st| st.status) } else { Status::Off };
                let (current, total) = state.map_or((0, 0), |st| st.page);
                let mut device = json!({
                    "id": d.id, "name": d.name, "cols": d.cols, "rows": d.rows, "status": status.as_str(),
                    "page": { "current": current, "total": total },
                    "keys": state.map_or_else(Vec::new, DeviceState::keys_json),
                });
                if let Some(error) = state.and_then(|st| st.error.as_ref()) {
                    device["error"] = json!(error);
                }
                device
            })
            .collect();
        json!({ "enabled": s.enabled, "pairingCode": crypto::pairing_code_of(&s.secret_key), "devices": devices })
    }

    /// Makes the state now the one every open stream sends next, unless it is the one they have.
    pub fn publish(&self) {
        let event = sse::event(&stringify(&self.json()));
        self.latest.send_if_modified(|latest| {
            if *latest == event {
                return false;
            }
            *latest = event;
            true
        });
    }

    /// A stream's receiver, holding the state as of now.
    pub fn listen(&self) -> watch::Receiver<Bytes> {
        self.publish();
        self.latest.subscribe()
    }

    /// A key's icon on the current page, while the connection is on.
    pub fn icon(&self, device: &str, index: u32) -> Option<IconData> {
        let inner = locked(&self.inner);
        if !inner.settings.enabled {
            return None;
        }
        inner.states.get(device)?.icons.get(&index).cloned()
    }

    /// Changes a device's state (when it is still in the registry) and publishes it.
    fn update(&self, id: &str, f: impl FnOnce(&mut DeviceState)) {
        {
            let mut inner = locked(&self.inner);
            if inner.settings.device(id).is_none() || !inner.sessions.contains_key(id) {
                return;
            }
            f(inner.states.entry(id.to_string()).or_default());
        }
        self.publish();
    }

    /// A device's session is somewhere else now; out of `Ready` the keys it showed are gone.
    fn set_status(&self, id: &str, status: Status, error: Option<String>) {
        self.update(id, |st| {
            st.status = status;
            st.error = error;
            if status != Status::Ready {
                st.page = (0, 0);
                st.titles.clear();
                st.icons.clear();
            }
        });
    }

    fn context(&self, id: &str, context: &proto::Context) {
        self.update(id, |st| {
            st.page = (context.current_page, context.total_pages);
            st.titles = context
                .actions
                .iter()
                .filter(|a| a.index < MAX_KEYS)
                .map(|a| (a.index, a.title.clone()))
                .collect();
        });
    }

    fn context_update(&self, id: &str, update: &proto::ContextUpdate) {
        self.update(id, |st| {
            for a in update.replace.iter().filter(|a| a.index < MAX_KEYS) {
                st.titles.insert(a.index, a.title.clone());
            }
            for index in &update.remove {
                st.titles.remove(index);
            }
        });
    }

    fn set_icon(&self, id: &str, icon: &proto::Icon) {
        if icon.index >= MAX_KEYS {
            return;
        }
        let decoded = icon.image.as_ref().and_then(icon::decode);
        self.update(id, |st| match decoded {
            Some(data) => {
                st.icons.insert(icon.index, data);
            }
            None => {
                st.icons.remove(&icon.index);
            }
        });
    }

    // ---- what a session reads and stores ----

    fn device(&self, id: &str) -> Option<Device> {
        locked(&self.inner).settings.device(id).cloned()
    }

    /// The keypair: the stored secret and its public key.
    fn keys(&self) -> Option<(SecretKey, [u8; 32])> {
        let secret = crypto::secret_key(&locked(&self.inner).settings.secret_key)?;
        let public = crypto::public_key(&secret);
        Some((secret, public))
    }

    /// The app opened `name` as `app_id`: stored, unless the device was renamed meanwhile.
    fn opened(&self, id: &str, name: &str, app_id: &str) {
        let stored = self.store.update_streamdeck(|s| {
            if let Some(device) = s.device_mut(id).filter(|d| d.name == name) {
                device.app_id = app_id.to_string();
            }
        });
        if let Err(e) = stored {
            log::error!(target: "server", "saving the Stream Deck device failed: {e}");
        }
    }

    // ---- pairing ----

    fn request_pair(&self) {
        locked(&self.pairing).wanted = true;
        self.pair_kick.send_modify(|n| *n += 1);
    }

    /// Whether the session of `id` may ask now; it is the one asking from here on.
    fn claim_pair(&self, id: &str) -> bool {
        let mut p = locked(&self.pairing);
        if p.trusted {
            return true;
        }
        if !p.wanted || p.claimant.is_some() {
            return false;
        }
        p.wanted = false;
        p.claimant = Some(id.to_string());
        true
    }

    /// The app answered the ask of `id`'s session.
    fn pair_answered(&self, id: &str, trusted: bool) {
        {
            let mut p = locked(&self.pairing);
            if p.claimant.as_deref() == Some(id) {
                p.claimant = None;
            }
            p.trusted |= trusted;
        }
        self.pair_kick.send_modify(|n| *n += 1);
    }

    /// `id`'s session ended before the app answered: the next session asks again.
    fn abandon_pair(&self, id: &str) {
        {
            let mut p = locked(&self.pairing);
            if p.claimant.as_deref() != Some(id) {
                return;
            }
            p.claimant = None;
            p.wanted = true;
        }
        self.pair_kick.send_modify(|n| *n += 1);
    }

    // ---- actions ----

    /// The session of a device that is open in the app.
    fn ready_session(&self, id: &str) -> Result<mpsc::Sender<Cmd>, ActError> {
        let inner = locked(&self.inner);
        if inner.settings.device(id).is_none() {
            return Err(ActError::NoDevice);
        }
        if !inner.settings.enabled {
            return Err(ActError::Off);
        }
        if inner
            .states
            .get(id)
            .is_none_or(|st| st.status != Status::Ready)
        {
            return Err(ActError::NotReady);
        }
        inner
            .sessions
            .get(id)
            .map(|s| s.cmds.clone())
            .ok_or(ActError::NotReady)
    }

    /// Hands `cmd` to a device's session, if it has one.
    fn tell(&self, id: &str, cmd: Cmd) {
        if let Some(session) = locked(&self.inner).sessions.get(id) {
            let _ = session.cmds.try_send(cmd);
        }
    }

    /// Presses (`down`) or releases a key.
    pub fn press(&self, id: &str, index: u32, down: bool) -> Result<(), ActError> {
        let session = self.ready_session(id)?;
        session
            .try_send(Cmd::Press { index, down })
            .map_err(|_| ActError::NotReady)
    }

    pub fn page(&self, id: &str, to: PageTo) -> Result<(), ActError> {
        let session = self.ready_session(id)?;
        session
            .try_send(Cmd::Page(to))
            .map_err(|_| ActError::NotReady)
    }

    /// Asks the app to trust us (again): the next session that needs it asks.
    pub fn pair(&self) -> Result<(), ActError> {
        if !locked(&self.inner).settings.enabled {
            return Err(ActError::Off);
        }
        self.request_pair();
        Ok(())
    }

    /// Adds a device to the registry ("IPStudio", "IPStudio 2"... when no name is given) and answers its id.
    pub fn create(
        &self,
        name: Option<String>,
        cols: u32,
        rows: u32,
    ) -> std::io::Result<Result<String, ActError>> {
        self.store.update_streamdeck(|s| {
            if s.devices.len() >= settings::MAX_DEVICES {
                return Err(ActError::Invalid(format!(
                    "at most {} devices",
                    settings::MAX_DEVICES
                )));
            }
            let name = name.unwrap_or_else(|| s.next_name());
            if s.devices.iter().any(|d| d.name == name) {
                return Err(ActError::Invalid(
                    "name: another device has that name".into(),
                ));
            }
            let id = uuid::Uuid::new_v4().to_string();
            let (cols, rows) = (
                settings::clamp_grid(cols.into()),
                settings::clamp_grid(rows.into()),
            );
            s.devices.push(Device {
                id: id.clone(),
                name,
                cols,
                rows,
                app_id: String::new(),
            });
            Ok(id)
        })
    }

    /// A device's grid: stored, and applied to the open device.
    pub fn grid(&self, id: &str, cols: u32, rows: u32) -> std::io::Result<Result<(), ActError>> {
        let (cols, rows) = (
            settings::clamp_grid(cols.into()),
            settings::clamp_grid(rows.into()),
        );
        let found = self.store.update_streamdeck(|s| {
            s.device_mut(id)
                .map(|d| (d.cols, d.rows) = (cols, rows))
                .is_some()
        })?;
        if !found {
            return Ok(Err(ActError::NoDevice));
        }
        self.tell(id, Cmd::Grid { cols, rows });
        Ok(Ok(()))
    }

    /// A device's name: stored (our id stays), and the app's device replaced by one with the new name.
    pub fn rename(&self, id: &str, name: String) -> std::io::Result<Result<(), ActError>> {
        let renamed = self.store.update_streamdeck(|s| {
            if s.devices.iter().any(|d| d.name == name && d.id != id) {
                return Err(ActError::Invalid(
                    "name: another device has that name".into(),
                ));
            }
            let device = s.device_mut(id).ok_or(ActError::NoDevice)?;
            if device.name == name {
                return Ok(false);
            }
            device.name = name.clone();
            device.app_id = String::new();
            Ok(true)
        })?;
        match renamed {
            Ok(true) => {
                self.tell(id, Cmd::Rename);
                Ok(Ok(()))
            }
            Ok(false) => Ok(Ok(())),
            Err(e) => Ok(Err(e)),
        }
    }

    /// Deletes the app's device (when its session has it open) and drops it from the registry.
    pub async fn forget(&self, id: &str) -> std::io::Result<Result<(), ActError>> {
        if self.device(id).is_none() {
            return Ok(Err(ActError::NoDevice));
        }
        let session = locked(&self.inner).sessions.get(id).map(|s| s.cmds.clone());
        if let Some(session) = session {
            let (ack, done) = oneshot::channel();
            if session.send(Cmd::Forget(ack)).await.is_ok() {
                let _ = tokio::time::timeout(FORGET_WAIT, done).await;
            }
        }
        self.store
            .update_streamdeck(|s| s.devices.retain(|d| d.id != id))?;
        Ok(Ok(()))
    }
}
