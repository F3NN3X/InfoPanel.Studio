// In-app updates as a state machine held here: check, download (with progress, cancellable),
// then install after stopping the app's server (the installer replaces node.exe and the server
// files, which the server process holds open). Every change goes out as `update-state`.

use crate::settings::Channel;
use crate::state::{lock, now_ms, AppState};
use crate::{control, tray};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

/// How long after launch the background check runs.
const STARTUP_DELAY: Duration = Duration::from_secs(15);
pub const STATE_EVENT: &str = "update-state";
/// Progress events go out at most this often (about 10 a second).
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

const STABLE_FEED: &str =
    "https://github.com/F3NN3X/InfoPanel.Studio/releases/latest/download/latest.json";
const BETA_FEED: &str =
    "https://github.com/F3NN3X/InfoPanel.Studio/releases/download/updater-beta/latest.json";

/// The update feed of a release channel.
pub fn feed(channel: Channel) -> &'static str {
    match channel {
        Channel::Stable => STABLE_FEED,
        Channel::Beta => BETA_FEED,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Current,
    Checking,
    Available,
    Downloading,
    Ready,
    /// The installer is starting; the app closes when it does.
    Installing,
    Error,
}

/// Which step an error came from, so the card can say what to try again.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailedDuring {
    Check,
    Download,
    Install,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub state: Phase,
    pub current_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    /// Milliseconds since the epoch of the last finished check.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloaded: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// The step that failed, while in the error state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_during: Option<FailedDuring>,
    /// On Stable: a beta newer than the running version and than Stable's own offer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub newer_beta: Option<String>,
}

/// What a check found.
#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

impl UpdateState {
    pub fn new(current_version: &str) -> Self {
        Self {
            state: Phase::Current,
            current_version: current_version.into(),
            version: None,
            notes: None,
            date: None,
            checked_at: None,
            downloaded: None,
            total: None,
            error: None,
            failed_during: None,
            newer_beta: None,
        }
    }

    pub fn checking(&mut self) {
        self.state = Phase::Checking;
        self.error = None;
        self.failed_during = None;
    }

    /// The check finished: `found` is the newer release, if any.
    pub fn checked(&mut self, found: Option<Found>, now: u64) {
        self.checked_at = Some(now);
        self.error = None;
        self.failed_during = None;
        self.downloaded = None;
        self.total = None;
        match found {
            Some(f) => {
                self.state = Phase::Available;
                self.version = Some(f.version);
                self.notes = f.notes;
                self.date = f.date;
            }
            None => {
                self.state = Phase::Current;
                self.version = None;
                self.notes = None;
                self.date = None;
            }
        }
    }

    pub fn failed(&mut self, during: FailedDuring, error: String, now: u64) {
        self.state = Phase::Error;
        self.error = Some(error);
        self.failed_during = Some(during);
        self.checked_at = Some(now);
        self.downloaded = None;
        self.total = None;
    }

    pub fn downloading(&mut self) {
        self.state = Phase::Downloading;
        self.downloaded = Some(0);
        self.total = None;
        self.error = None;
        self.failed_during = None;
    }

    pub fn progress(&mut self, chunk: usize, total: Option<u64>) {
        self.downloaded = Some(self.downloaded.unwrap_or(0) + chunk as u64);
        if total.is_some() {
            self.total = total;
        }
    }

    pub fn ready(&mut self) {
        self.state = Phase::Ready;
    }

    /// Back to the update the check found.
    pub fn cancelled(&mut self) {
        self.state = Phase::Available;
        self.downloaded = None;
        self.total = None;
    }

    /// The version the tray offers: one that is found, downloading or ready.
    pub fn offered(&self) -> Option<&str> {
        matches!(
            self.state,
            Phase::Available | Phase::Downloading | Phase::Ready | Phase::Installing
        )
        .then_some(self.version.as_deref())
        .flatten()
    }
}

/// Lets one event through every `every`.
pub struct Throttle {
    every: Duration,
    last: Option<Instant>,
}

impl Throttle {
    pub fn new(every: Duration) -> Self {
        Self { every, last: None }
    }

    pub fn ready(&mut self, now: Instant) -> bool {
        if self
            .last
            .is_some_and(|t| now.duration_since(t) < self.every)
        {
            return false;
        }
        self.last = Some(now);
        true
    }
}

/// What `begin_download` decided.
#[derive(Debug, PartialEq, Eq)]
pub enum DownloadStart {
    /// Download, with this id.
    Start(u64),
    /// The bytes of an earlier download are still here: ready again without downloading.
    Ready,
    /// Nothing is known to download: check first.
    Check,
    /// Not now (checking, downloading, installing, up to date).
    Ignore,
}

/// The update flow's bookkeeping, apart from the plugin's handles so its guards can be tested.
/// Every guard and the change it allows happen in one call, under the caller's lock.
#[derive(Debug)]
pub struct Flow {
    pub state: UpdateState,
    /// The downloaded installer, while ready (or after a failed install).
    pub bytes: Option<Vec<u8>>,
    /// A check found an update (the plugin handle is kept beside the flow).
    pub has_update: bool,
    /// The channel the found update and the bytes are from.
    pub channel: Option<Channel>,
    /// The channel of the check in flight.
    checking: Option<Channel>,
    /// Bumped by every check; an older check's answer is dropped.
    check_id: u64,
    /// Bumped by every download and cancel; an older download's result is dropped.
    download_id: u64,
}

impl Flow {
    pub fn new(current_version: &str) -> Self {
        Self {
            state: UpdateState::new(current_version),
            bytes: None,
            has_update: false,
            channel: None,
            checking: None,
            check_id: 0,
            download_id: 0,
        }
    }

    /// Starts a check of `channel`: the check id, and whether a download in progress has to be
    /// aborted. None while a check of the same channel, a download from it or an install runs.
    /// A switch of channel supersedes a check or download of the old one and drops its bytes.
    pub fn begin_check(&mut self, channel: Channel) -> Option<(u64, bool)> {
        let same = self.channel == Some(channel);
        match self.state.state {
            Phase::Installing => return None,
            Phase::Downloading if same => return None,
            Phase::Checking if self.checking == Some(channel) => return None,
            _ => {}
        }
        let abort = self.state.state == Phase::Downloading;
        if abort {
            self.download_id += 1;
        }
        if !same {
            self.bytes = None;
            self.has_update = false;
            self.state.newer_beta = None;
        }
        self.check_id += 1;
        self.checking = Some(channel);
        self.state.checking();
        Some((self.check_id, abort))
    }

    /// Applies the answer of check `id` for `channel`; false when a newer check superseded it
    /// (the caller then drops the update it found).
    pub fn finish_check(
        &mut self,
        id: u64,
        channel: Channel,
        result: Result<Option<Found>, String>,
        now: u64,
    ) -> bool {
        if id != self.check_id || self.state.state != Phase::Checking {
            return false;
        }
        self.checking = None;
        match result {
            Ok(Some(f)) => {
                // Ready bytes of the same version and channel stay ready.
                let keep = self.bytes.is_some()
                    && self.channel == Some(channel)
                    && self.state.version.as_deref() == Some(f.version.as_str());
                if keep {
                    self.state.checked_at = Some(now);
                    self.state.ready();
                } else {
                    self.bytes = None;
                    self.state.checked(Some(f), now);
                }
                self.has_update = true;
            }
            Ok(None) => {
                self.bytes = None;
                self.has_update = false;
                self.state.checked(None, now);
            }
            Err(e) => self.state.failed(FailedDuring::Check, e, now),
        }
        self.channel = Some(channel);
        true
    }

    /// From available, or from an error once an update is known: start (or skip) the download.
    pub fn begin_download(&mut self) -> DownloadStart {
        match self.state.state {
            Phase::Available if self.has_update => {}
            Phase::Error if self.bytes.is_some() => {
                self.state.error = None;
                self.state.failed_during = None;
                self.state.ready();
                return DownloadStart::Ready;
            }
            Phase::Error if self.has_update => {}
            Phase::Error | Phase::Available => return DownloadStart::Check,
            _ => return DownloadStart::Ignore,
        }
        self.download_id += 1;
        self.state.downloading();
        DownloadStart::Start(self.download_id)
    }

    /// Whether download `id` is still the one running.
    pub fn is_current_download(&self, id: u64) -> bool {
        id == self.download_id && self.state.state == Phase::Downloading
    }

    pub fn progress(&mut self, id: u64, chunk: usize, total: Option<u64>) -> bool {
        let current = self.is_current_download(id);
        if current {
            self.state.progress(chunk, total);
        }
        current
    }

    /// Applies the result of download `id`; false when it was cancelled or superseded.
    pub fn finish_download(&mut self, id: u64, result: Result<Vec<u8>, String>, now: u64) -> bool {
        if !self.is_current_download(id) {
            return false;
        }
        match result {
            Ok(bytes) => {
                self.bytes = Some(bytes);
                self.state.ready();
            }
            Err(e) => self.state.failed(FailedDuring::Download, e, now),
        }
        true
    }

    /// Stops the download in progress (back to available); false when none runs.
    pub fn cancel(&mut self) -> bool {
        if self.state.state != Phase::Downloading {
            return false;
        }
        self.download_id += 1;
        self.state.cancelled();
        true
    }

    /// Takes the bytes to install and moves to installing; None unless ready. Only one install
    /// gets them.
    pub fn begin_install(&mut self) -> Option<Vec<u8>> {
        if self.state.state != Phase::Ready {
            return None;
        }
        let bytes = self.bytes.take()?;
        self.state.state = Phase::Installing;
        Some(bytes)
    }

    /// The install failed: the bytes come back, so a retry needs no new download.
    pub fn install_failed(&mut self, bytes: Vec<u8>, error: String, now: u64) {
        self.bytes = Some(bytes);
        self.state.failed(FailedDuring::Install, error, now);
    }
}

struct Inner {
    flow: Flow,
    update: Option<Update>,
    task: Option<JoinHandle<()>>,
}

pub struct Updates(Mutex<Inner>);

impl Updates {
    pub fn new(current_version: &str) -> Self {
        Self(Mutex::new(Inner {
            flow: Flow::new(current_version),
            update: None,
            task: None,
        }))
    }
}

pub fn state(app: &AppHandle) -> UpdateState {
    lock(&app.state::<Updates>().0).flow.state.clone()
}

fn emit(app: &AppHandle, state: &UpdateState) {
    let _ = app.emit(STATE_EVENT, state);
    tray::set_update(app, state.offered());
}

/// Changes the state under the lock, then tells the pages and tray.
fn change<T>(app: &AppHandle, f: impl FnOnce(&mut Inner) -> T) -> (T, UpdateState) {
    let (out, state) = {
        let updates = app.state::<Updates>();
        let mut inner = lock(&updates.0);
        let out = f(&mut inner);
        (out, inner.flow.state.clone())
    };
    emit(app, &state);
    (out, state)
}

fn found(update: &Update) -> Found {
    Found {
        version: update.version.clone(),
        notes: update.body.clone().filter(|b| !b.trim().is_empty()),
        date: update.date.map(|d| d.to_string()),
    }
}

/// The beta to point a Stable user at: the Beta feed's version when it is newer than the running
/// one and than Stable's own offer. Nothing on Beta, or when the feed could not be read.
fn newer_beta(
    channel: Channel,
    current: &str,
    stable_offer: Option<&str>,
    beta: Result<Option<&str>, String>,
) -> Option<String> {
    if channel != Channel::Stable {
        return None;
    }
    let beta = beta.ok().flatten()?;
    let beta_v = semver::Version::parse(beta).ok()?;
    let newer_than = |other: &str| semver::Version::parse(other).map_or(true, |v| beta_v > v);
    (newer_than(current) && stable_offer.is_none_or(newer_than)).then(|| beta.to_string())
}

async fn fetch(app: &AppHandle, channel: Channel) -> Result<Option<Update>, String> {
    let url = Url::parse(feed(channel)).map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())
}

/// Asks the saved channel's feed for a newer version: current or available, and with
/// autoDownload on, straight on to downloading. A check or download of another channel (a
/// channel switch) is superseded.
pub async fn check(app: &AppHandle) -> UpdateState {
    let s = app.state::<AppState>().settings();
    let channel = s.update_channel;
    let (started, state) = change(app, |inner| {
        let started = inner.flow.begin_check(channel);
        if let Some((_, true)) = started {
            if let Some(task) = inner.task.take() {
                task.abort();
            }
        }
        started
    });
    let Some((id, _)) = started else {
        return state;
    };
    let result = fetch(app, channel).await;
    let answer = result
        .as_ref()
        .map(|u| u.as_ref().map(found))
        .map_err(Clone::clone);
    let (_, state) = change(app, |inner| {
        if inner.flow.finish_check(id, channel, answer, now_ms()) {
            match result {
                Ok(update) => {
                    match &update {
                        Some(u) => log::info!("update available: {}", u.version),
                        None => log::info!("no update available"),
                    }
                    inner.update = update;
                }
                Err(e) => log::info!("update check failed: {e}"),
            }
        }
    });
    let state = if channel == Channel::Stable && state.error.is_none() {
        let offer = state.version.clone();
        let beta = fetch(app, Channel::Beta).await;
        let beta = beta
            .as_ref()
            .map(|u| u.as_ref().map(|u| u.version.as_str()));
        let notice = newer_beta(
            channel,
            &state.current_version,
            offer.as_deref(),
            beta.map_err(Clone::clone),
        );
        change(app, |inner| {
            // A channel switched meanwhile has its own check; its answer stands.
            if inner.flow.channel == Some(channel) {
                inner.flow.state.newer_beta = notice;
            }
        })
        .1
    } else {
        state
    };
    if state.state == Phase::Available && s.auto_download {
        return download(app);
    }
    state
}

/// Starts downloading the update the check found; progress goes out as `update-state`. After a
/// failure it retries: ready again when the bytes are still here, a new check when nothing is
/// known.
pub fn download(app: &AppHandle) -> UpdateState {
    let (start, state) = change(app, |inner| match inner.flow.begin_download() {
        DownloadStart::Start(id) => match inner.update.clone() {
            Some(update) => Some((id, update)),
            None => {
                inner.flow.cancel();
                None
            }
        },
        DownloadStart::Check => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                check(&app).await;
            });
            None
        }
        DownloadStart::Ready | DownloadStart::Ignore => None,
    });
    let Some((id, update)) = start else {
        return state;
    };
    log::info!("downloading update {}", update.version);
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let app = task_app;
        let mut throttle = Throttle::new(PROGRESS_EVERY);
        let result = update
            .download(
                |chunk, total| {
                    let state = {
                        let updates = app.state::<Updates>();
                        let mut inner = lock(&updates.0);
                        if !inner.flow.progress(id, chunk, total) {
                            return;
                        }
                        inner.flow.state.clone()
                    };
                    if throttle.ready(Instant::now()) {
                        emit(&app, &state);
                    }
                },
                || {},
            )
            .await;
        let (done, state) = {
            let updates = app.state::<Updates>();
            let mut inner = lock(&updates.0);
            let result = result.map_err(|e| e.to_string());
            let done = inner.flow.finish_download(id, result, now_ms());
            if done {
                inner.task = None;
            }
            (done, inner.flow.state.clone())
        };
        if done {
            log::info!(
                "update {} download finished: {:?}",
                update.version,
                state.state
            );
            emit(&app, &state);
        }
    });
    let updates = app.state::<Updates>();
    let mut inner = lock(&updates.0);
    if inner.flow.is_current_download(id) {
        inner.task = Some(task);
    } else {
        // Cancelled (or superseded) before the handle was stored.
        task.abort();
    }
    inner.flow.state.clone()
}

/// Stops a download in progress and goes back to available.
pub fn cancel(app: &AppHandle) -> UpdateState {
    change(app, |inner| {
        if inner.flow.cancel() {
            if let Some(task) = inner.task.take() {
                task.abort();
            }
            log::info!("update download cancelled");
        }
    })
    .1
}

/// Installs the downloaded update after stopping the server. On Windows the passive installer
/// closes the app and starts the new version. Only one install runs; a failure brings back the
/// server (if it was running) and the bytes.
pub fn install(app: &AppHandle) -> Result<(), String> {
    let (taken, _) = change(app, |inner| {
        let update = inner.update.clone()?;
        let bytes = inner.flow.begin_install()?;
        Some((update, bytes))
    });
    let (update, bytes) = taken.ok_or("There is no downloaded update to install.")?;
    log::info!("installing update {}", update.version);
    let status = app.state::<AppState>().status();
    let was_running = status.owned
        && matches!(
            status.state,
            crate::state::Phase::Running | crate::state::Phase::Starting
        );
    control::stop_owned(app);
    if let Err(e) = update.install(&bytes) {
        log::warn!("update install failed: {e}");
        if was_running {
            control::start(app);
        }
        change(app, |inner| {
            inner.flow.install_failed(bytes, e.to_string(), now_ms())
        });
        return Err(e.to_string());
    }
    app.restart()
}

/// One check shortly after launch, in the background. A network failure is only logged.
pub fn check_soon(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_DELAY);
        tauri::async_runtime::block_on(check(&app));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(v: &str) -> Found {
        Found {
            version: v.into(),
            notes: Some("notes".into()),
            date: None,
        }
    }

    #[test]
    fn state_serializes_camel_case_without_empty_fields() {
        let mut s = UpdateState::new("1.2.0");
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "state": "current", "currentVersion": "1.2.0" })
        );
        s.checked(Some(found("1.3.0")), 7);
        s.downloading();
        s.progress(10, Some(100));
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(v["state"], "downloading");
        assert_eq!(v["version"], "1.3.0");
        assert_eq!(v["checkedAt"], 7);
        assert_eq!(v["downloaded"], 10);
        assert_eq!(v["total"], 100);
        assert!(v.get("error").is_none());
    }

    #[test]
    fn a_check_finds_an_update_or_nothing() {
        let mut s = UpdateState::new("1.2.0");
        s.checking();
        assert_eq!(s.state, Phase::Checking);
        s.checked(None, 1);
        assert_eq!((s.state, s.checked_at), (Phase::Current, Some(1)));
        assert_eq!(s.offered(), None);
        s.checked(Some(found("1.3.0")), 2);
        assert_eq!(s.state, Phase::Available);
        assert_eq!(s.offered(), Some("1.3.0"));
        assert_eq!(s.notes.as_deref(), Some("notes"));
    }

    #[test]
    fn download_progress_ready_and_cancel() {
        let mut s = UpdateState::new("1.2.0");
        s.checked(Some(found("1.3.0")), 1);
        s.downloading();
        s.progress(40, None);
        s.progress(60, Some(100));
        assert_eq!((s.downloaded, s.total), (Some(100), Some(100)));
        s.cancelled();
        assert_eq!(s.state, Phase::Available);
        assert_eq!(s.downloaded, None);
        s.downloading();
        s.ready();
        assert_eq!(s.state, Phase::Ready);
        assert_eq!(s.offered(), Some("1.3.0"));
    }

    #[test]
    fn errors_carry_the_reason() {
        let mut s = UpdateState::new("1.2.0");
        s.checking();
        s.failed(FailedDuring::Check, "offline".into(), 5);
        assert_eq!(s.state, Phase::Error);
        assert_eq!(s.error.as_deref(), Some("offline"));
        assert_eq!(s.failed_during, Some(FailedDuring::Check));
        assert_eq!(s.offered(), None);
        s.checking();
        assert_eq!(s.error, None);
        assert_eq!(s.failed_during, None);
    }

    #[test]
    fn progress_is_throttled() {
        let mut t = Throttle::new(Duration::from_millis(100));
        let t0 = Instant::now();
        assert!(t.ready(t0));
        assert!(!t.ready(t0 + Duration::from_millis(50)));
        assert!(t.ready(t0 + Duration::from_millis(100)));
        assert!(!t.ready(t0 + Duration::from_millis(150)));
    }

    #[test]
    fn a_newer_beta_is_offered_on_stable_only() {
        let beta = |v: &'static str| Ok(Some(v));
        let n = |ch, cur, offer, b| newer_beta(ch, cur, offer, b);
        let some = |v: &str| Some(v.to_string());
        // Stable, beta ahead of the running version and of Stable's offer.
        assert_eq!(
            n(
                Channel::Stable,
                "1.3.0-beta.34",
                None,
                beta("1.3.0-beta.35")
            ),
            some("1.3.0-beta.35")
        );
        assert_eq!(
            n(
                Channel::Stable,
                "1.2.0",
                Some("1.2.1"),
                beta("1.3.0-beta.1")
            ),
            some("1.3.0-beta.1")
        );
        // Prerelease order: beta.9 < beta.10 < 1.3.0.
        assert_eq!(
            n(Channel::Stable, "1.3.0-beta.9", None, beta("1.3.0-beta.10")),
            some("1.3.0-beta.10")
        );
        assert_eq!(
            n(Channel::Stable, "1.3.0-beta.10", None, beta("1.3.0-beta.9")),
            None
        );
        assert_eq!(
            n(
                Channel::Stable,
                "1.2.0",
                Some("1.3.0"),
                beta("1.3.0-beta.40")
            ),
            None
        );
        // Not newer than the running version.
        assert_eq!(
            n(
                Channel::Stable,
                "1.3.0-beta.35",
                None,
                beta("1.3.0-beta.35")
            ),
            None
        );
        assert_eq!(
            n(Channel::Stable, "1.3.0", None, beta("1.3.0-beta.35")),
            None
        );
        // Beta channel, no beta, a feed error or a version that does not parse.
        assert_eq!(
            n(Channel::Beta, "1.3.0-beta.34", None, beta("1.3.0-beta.35")),
            None
        );
        assert_eq!(n(Channel::Stable, "1.2.0", None, Ok(None)), None);
        assert_eq!(
            n(Channel::Stable, "1.2.0", None, Err("offline".into())),
            None
        );
        assert_eq!(
            n(Channel::Stable, "1.2.0", None, beta("not a version")),
            None
        );
    }

    #[test]
    fn the_notice_serializes_and_a_channel_switch_clears_it() {
        let mut flow = Flow::new("1.3.0-beta.34");
        flow.state.newer_beta = Some("1.3.0-beta.35".into());
        assert_eq!(
            serde_json::to_value(&flow.state).unwrap()["newerBeta"],
            "1.3.0-beta.35"
        );
        flow.begin_check(Channel::Beta);
        assert_eq!(flow.state.newer_beta, None);
    }

    #[test]
    fn channels_have_their_own_feed() {
        assert!(feed(Channel::Stable).ends_with("/releases/latest/download/latest.json"));
        assert!(feed(Channel::Beta).ends_with("/releases/download/updater-beta/latest.json"));
        for c in [Channel::Stable, Channel::Beta] {
            assert!(Url::parse(feed(c)).is_ok());
        }
    }

    fn ok(v: &str) -> Result<Option<Found>, String> {
        Ok(Some(found(v)))
    }

    /// A flow that found 1.3.0 on stable and downloaded it.
    fn ready_flow() -> Flow {
        let mut f = Flow::new("1.2.0");
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        assert!(f.finish_check(id, Channel::Stable, ok("1.3.0"), 1));
        let DownloadStart::Start(d) = f.begin_download() else {
            panic!("no download");
        };
        assert!(f.finish_download(d, Ok(vec![1, 2, 3]), 2));
        assert_eq!(f.state.state, Phase::Ready);
        f
    }

    #[test]
    fn a_check_runs_once_per_channel() {
        let mut f = Flow::new("1.2.0");
        let (first, abort) = f.begin_check(Channel::Stable).unwrap();
        assert!(!abort);
        assert_eq!(f.begin_check(Channel::Stable), None);
        // A channel switch supersedes the check in flight.
        let (second, _) = f.begin_check(Channel::Beta).unwrap();
        assert!(!f.finish_check(first, Channel::Stable, ok("1.3.0"), 1));
        assert_eq!(f.state.state, Phase::Checking);
        assert!(f.finish_check(second, Channel::Beta, ok("1.4.0-beta.1"), 2));
        assert_eq!(f.state.version.as_deref(), Some("1.4.0-beta.1"));
        assert_eq!(f.channel, Some(Channel::Beta));
    }

    #[test]
    fn a_channel_switch_aborts_the_download_and_drops_the_bytes() {
        let mut f = Flow::new("1.2.0");
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        f.finish_check(id, Channel::Stable, ok("1.3.0"), 1);
        let DownloadStart::Start(d) = f.begin_download() else {
            panic!("no download");
        };
        // Same channel: the download is left alone.
        assert_eq!(f.begin_check(Channel::Stable), None);
        let (_, abort) = f.begin_check(Channel::Beta).unwrap();
        assert!(abort);
        assert!(!f.finish_download(d, Ok(vec![1]), 2));
        assert!(f.bytes.is_none());

        let mut f = ready_flow();
        f.begin_check(Channel::Beta).unwrap();
        assert!(f.bytes.is_none());
        assert!(!f.has_update);
    }

    #[test]
    fn a_recheck_keeps_ready_bytes_of_the_same_version_and_channel() {
        let mut f = ready_flow();
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        assert!(f.finish_check(id, Channel::Stable, ok("1.3.0"), 3));
        assert_eq!(f.state.state, Phase::Ready);
        assert!(f.bytes.is_some());
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        f.finish_check(id, Channel::Stable, ok("1.3.1"), 4);
        assert_eq!(f.state.state, Phase::Available);
        assert!(f.bytes.is_none());
    }

    #[test]
    fn downloads_need_a_found_update() {
        let mut f = Flow::new("1.2.0");
        assert_eq!(f.begin_download(), DownloadStart::Ignore);
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        assert_eq!(f.begin_download(), DownloadStart::Ignore);
        f.finish_check(id, Channel::Stable, Ok(None), 1);
        assert_eq!(f.begin_download(), DownloadStart::Ignore);
        // An error before anything was found: check again.
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        f.finish_check(id, Channel::Stable, Err("offline".into()), 2);
        assert_eq!(f.state.failed_during, Some(FailedDuring::Check));
        assert_eq!(f.begin_download(), DownloadStart::Check);
    }

    #[test]
    fn a_failed_download_can_be_retried() {
        let mut f = Flow::new("1.2.0");
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        f.finish_check(id, Channel::Stable, ok("1.3.0"), 1);
        let DownloadStart::Start(d) = f.begin_download() else {
            panic!("no download");
        };
        assert!(f.finish_download(d, Err("reset".into()), 2));
        assert_eq!(f.state.state, Phase::Error);
        assert_eq!(f.state.failed_during, Some(FailedDuring::Download));
        assert!(matches!(f.begin_download(), DownloadStart::Start(_)));
    }

    #[test]
    fn cancel_drops_the_download_result() {
        let mut f = Flow::new("1.2.0");
        assert!(!f.cancel());
        let (id, _) = f.begin_check(Channel::Stable).unwrap();
        f.finish_check(id, Channel::Stable, ok("1.3.0"), 1);
        let DownloadStart::Start(d) = f.begin_download() else {
            panic!("no download");
        };
        assert!(f.progress(d, 10, Some(100)));
        assert!(f.cancel());
        assert_eq!(f.state.state, Phase::Available);
        assert!(!f.progress(d, 10, Some(100)));
        assert!(!f.finish_download(d, Ok(vec![1]), 2));
        assert_eq!(f.state.state, Phase::Available);
        assert!(f.bytes.is_none());
    }

    #[test]
    fn install_is_single_flight_and_restored_on_failure() {
        let mut f = ready_flow();
        let bytes = f.begin_install().unwrap();
        assert_eq!(f.state.state, Phase::Installing);
        assert_eq!(f.begin_install(), None);
        assert_eq!(f.begin_check(Channel::Stable), None);
        assert_eq!(f.begin_download(), DownloadStart::Ignore);
        f.install_failed(bytes, "denied".into(), 3);
        assert_eq!(f.state.state, Phase::Error);
        assert_eq!(f.state.failed_during, Some(FailedDuring::Install));
        // The bytes are back: ready again without a download.
        assert_eq!(f.begin_download(), DownloadStart::Ready);
        assert_eq!(f.state.state, Phase::Ready);
        assert!(f.begin_install().is_some());
        assert_eq!(Flow::new("1.2.0").begin_install(), None);
    }
}
