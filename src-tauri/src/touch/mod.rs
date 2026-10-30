// Experimental touch: touch-core reads each configured touch panel over raw USB (the touchscreen bound to WinUSB, so
// Windows never sees a touch), and each panel's messages go to the server's touch hub for the kiosk pages showing that
// panel. Off unless the `experimentalTouch` setting is on; while off, no device is opened.
//
// The config is its own file, touch.json in the settings folder, applied live: thresholds and mapping go to the
// running devices, and a change to the panel list or a panel's id, name or device restarts them.

pub mod commands;
mod config;
mod driver;
pub mod screens;
mod testing;

use crate::state::lock;
use config::{Issue, Level, TouchConfig};
use ips_server::touch_hub::{Keep, TouchHub};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use touch_core::{DeviceMsg, Output, PanelConfig, Status, TouchDevice};

/// How often touch.json is checked for changes while touch is on.
const POLL: Duration = Duration::from_millis(500);

/// What a panel's stream says once its device is stopped (touch turned off, or the panel removed).
const STOPPED: &str = r#"{"status":"Stopped"}"#;

struct Running {
    /// The stream id: the panel's `id`, or `virtual-<n>`.
    id: String,
    name: String,
    /// Position in the config's `panels`; `None` for a virtual panel.
    index: Option<usize>,
    /// A virtual panel's mapping; it has no config entry to take one from.
    virtual_panel: Option<PanelConfig>,
    /// The device's last status, for Settings.
    status: Arc<Mutex<Option<Status>>>,
    /// Where a finger down goes while calibration listens, besides the kiosk.
    taps: Taps,
    device: TouchDevice,
}

/// A running panel's finger downs, in panel px, while something listens.
type Taps = Arc<Mutex<Option<Sender<(f32, f32)>>>>;

/// A running panel as Settings shows it.
#[derive(Clone, Debug, Serialize)]
pub struct PanelState {
    pub id: String,
    pub name: String,
    pub is_virtual: bool,
    /// `None` until the device's first status.
    pub status: Option<Status>,
}

/// What Settings shows: whether touch is on, the config in effect, and how each panel is doing.
pub struct Snapshot {
    pub enabled: bool,
    pub config: TouchConfig,
    pub issues: Vec<Issue>,
    pub panels: Vec<PanelState>,
}

#[derive(Default)]
struct Inner {
    enabled: bool,
    /// The config in effect: the file's if it applied, else the previous one (the defaults at first).
    config: TouchConfig,
    /// Problems found the last time the file was read.
    issues: Vec<Issue>,
    running: Vec<Running>,
}

pub struct Touch {
    path: PathBuf,
    hub: Arc<TouchHub>,
    inner: Mutex<Inner>,
}

impl Touch {
    pub fn new(config_dir: &Path, hub: Arc<TouchHub>) -> Self {
        Self {
            path: config_dir.join("touch.json"),
            hub,
            inner: Mutex::default(),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn snapshot(&self) -> Snapshot {
        let inner = lock(&self.inner);
        Snapshot {
            enabled: inner.enabled,
            config: inner.config.clone(),
            issues: inner.issues.clone(),
            panels: inner
                .running
                .iter()
                .map(|r| PanelState {
                    id: r.id.clone(),
                    name: r.name.clone(),
                    is_virtual: r.index.is_none(),
                    status: lock(&r.status).clone(),
                })
                .collect(),
        }
    }

    /// The running real panel `index`'s finger downs, mapped by `panel` until [`Touch::stop_taps`] (calibration maps
    /// without the calibration being made). `None` when that panel isn't running.
    pub fn taps(&self, index: usize, panel: PanelConfig) -> Option<Receiver<(f32, f32)>> {
        let inner = lock(&self.inner);
        let r = inner.running.iter().find(|r| r.index == Some(index))?;
        let (tx, rx) = std::sync::mpsc::channel();
        *lock(&r.taps) = Some(tx);
        r.device.reconfigure(panel, inner.config.gestures.clone());
        Some(rx)
    }

    /// Ends [`Touch::taps`]: panel `index` maps by its config again.
    pub fn stop_taps(&self, index: usize) {
        let inner = lock(&self.inner);
        if let Some(r) = inner.running.iter().find(|r| r.index == Some(index)) {
            *lock(&r.taps) = None;
            if let Some(entry) = inner.config.panels.get(index) {
                r.device
                    .reconfigure(entry.panel.clone(), inner.config.gestures.clone());
            }
        }
    }

    /// Runs `f` with every device closed (a driver change needs the USB device free), then opens them again.
    pub fn while_stopped<T>(&self, f: impl FnOnce() -> T) -> T {
        let stopped = std::mem::take(&mut lock(&self.inner).running);
        self.stop(stopped);
        let result = f();
        let mut inner = lock(&self.inner);
        if inner.enabled && inner.running.is_empty() {
            inner.running = start_all(&inner.config, &self.hub);
        }
        result
    }

    /// Turns touch on (reading touch.json, writing a starter file the first time) or off.
    pub fn set_enabled(&self, on: bool) {
        let stopped = {
            let mut inner = lock(&self.inner);
            if inner.enabled == on {
                return;
            }
            inner.enabled = on;
            if on {
                let loaded = config::load_or_init(&self.path);
                log_issues(&self.path, &loaded.issues);
                if let Some(c) = loaded.config {
                    inner.config = c;
                }
                inner.issues = loaded.issues;
                inner.running = start_all(&inner.config, &self.hub);
                log::info!("touch: on, {} panel(s)", inner.running.len());
                Vec::new()
            } else {
                log::info!("touch: off");
                std::mem::take(&mut inner.running)
            }
        };
        self.stop(stopped);
    }

    /// Rereads touch.json and applies it; a file that doesn't apply keeps the config in effect.
    pub fn reload(&self) {
        let stopped = {
            let mut inner = lock(&self.inner);
            if !inner.enabled {
                return;
            }
            let loaded = config::load(&self.path);
            log_issues(&self.path, &loaded.issues);
            inner.issues = loaded.issues;
            let Some(next) = loaded.config else {
                return;
            };
            let stopped = if restarts(&inner.config, &next) {
                let old = std::mem::take(&mut inner.running);
                inner.running = start_all(&next, &self.hub);
                old
            } else {
                reconfigure(&inner.running, &inner.config, &next);
                for r in &inner.running {
                    let (name, panel) = match (r.index, &r.virtual_panel) {
                        (Some(i), _) => (next.panels[i].name.as_str(), &next.panels[i].panel),
                        (None, Some(p)) => (r.name.as_str(), p),
                        (None, None) => continue,
                    };
                    self.hub
                        .publish(&r.id, &setup(&next, name, panel), Some(Keep::Setup));
                }
                Vec::new()
            };
            inner.config = next;
            log::info!("touch: touch.json reloaded");
            stopped
        };
        self.stop(stopped);
    }

    /// Stops `running`'s devices (not under the lock: dropping one joins its thread) and tells their pages.
    fn stop(&self, running: Vec<Running>) {
        let ids: Vec<String> = running.iter().map(|r| r.id.clone()).collect();
        drop(running);
        let live: Vec<String> = lock(&self.inner)
            .running
            .iter()
            .map(|r| r.id.clone())
            .collect();
        for id in ids.iter().filter(|id| !live.contains(id)) {
            self.hub.publish(id, STOPPED, Some(Keep::Status));
        }
    }
}

/// Checks touch.json for changes while touch is on, for the life of the app.
pub fn watch(app: AppHandle) {
    std::thread::Builder::new()
        .name("touch-config".into())
        .spawn(move || {
            let touch = app.state::<Touch>();
            let mut seen = modified(&touch.path);
            loop {
                std::thread::sleep(POLL);
                let m = modified(&touch.path);
                if m != seen {
                    seen = m;
                    touch.reload();
                }
            }
        })
        .expect("spawning the touch-config thread");
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

fn log_issues(path: &Path, issues: &[Issue]) {
    for i in issues {
        match i.level {
            Level::Error => log::error!(
                "touch: {}: {}; keeping the config in effect",
                path.display(),
                i.message
            ),
            Level::Warning => log::warn!("touch: {}: {}", path.display(), i.message),
        }
    }
}

/// Whether going from `old` to `new` restarts the devices (else they are reconfigured in place).
fn restarts(old: &TouchConfig, new: &TouchConfig) -> bool {
    let identity = |p: &config::PanelEntry| (p.id.clone(), p.name.clone(), p.device.clone());
    old.panels.len() != new.panels.len()
        || old
            .panels
            .iter()
            .map(identity)
            .ne(new.panels.iter().map(identity))
        || old.testing != new.testing
}

fn reconfigure(running: &[Running], old: &TouchConfig, new: &TouchConfig) {
    let gestures = old.gestures != new.gestures;
    for r in running {
        match (r.index, &r.virtual_panel) {
            (Some(i), _) if gestures || old.panels[i].panel != new.panels[i].panel => {
                r.device
                    .reconfigure(new.panels[i].panel.clone(), new.gestures.clone());
            }
            (None, Some(p)) if gestures => r.device.reconfigure(p.clone(), new.gestures.clone()),
            _ => {}
        }
    }
}

fn start_all(cfg: &TouchConfig, hub: &Arc<TouchHub>) -> Vec<Running> {
    let mut running = Vec::new();
    for (i, entry) in cfg.panels.iter().enumerate() {
        // Ports other panels name: this panel's device thread never opens those.
        let taken: Vec<String> = cfg
            .panels
            .iter()
            .enumerate()
            .filter(|(j, _)| *j != i)
            .filter_map(|(_, p)| p.device.port.clone())
            .collect();
        hub.publish(
            &entry.id,
            &setup(cfg, &entry.name, &entry.panel),
            Some(Keep::Setup),
        );
        let (tx, rx) = std::sync::mpsc::channel();
        let (status, taps) = (Arc::default(), Taps::default());
        forward(
            &entry.id,
            rx,
            hub.clone(),
            Arc::clone(&status),
            Arc::clone(&taps),
        );
        let device = TouchDevice::spawn(entry.touch(&cfg.gestures), taken, tx);
        running.push(Running {
            id: entry.id.clone(),
            name: entry.name.clone(),
            index: Some(i),
            virtual_panel: None,
            status,
            taps,
            device,
        });
    }
    if cfg.testing.enabled {
        match testing::recording(&cfg.testing.replay) {
            Ok(rec) => {
                let [width_px, height_px] = cfg.testing.size;
                let panel = PanelConfig {
                    width_px,
                    height_px,
                    ..Default::default()
                };
                for k in 1..=cfg.testing.virtual_panels {
                    let id = format!("virtual-{k}");
                    let name = format!("Virtual {k}");
                    hub.publish(&id, &setup(cfg, &name, &panel), Some(Keep::Setup));
                    let (tx, rx) = std::sync::mpsc::channel();
                    let (status, taps) = (Arc::default(), Taps::default());
                    forward(&id, rx, hub.clone(), Arc::clone(&status), Arc::clone(&taps));
                    let device = TouchDevice::replay(
                        copy(&rec),
                        format!("virtual:{k}"),
                        panel.clone(),
                        cfg.gestures.clone(),
                        tx,
                    );
                    log::info!("touch: {id} plays {}", cfg.testing.replay);
                    running.push(Running {
                        id,
                        name,
                        index: None,
                        virtual_panel: Some(panel.clone()),
                        status,
                        taps,
                        device,
                    });
                }
            }
            Err(e) => log::error!("touch: testing.replay: {e}"),
        }
    }
    running
}

/// A copy of `rec` for one more virtual panel (`Recording` isn't `Clone`).
fn copy(rec: &touch_core::Recording) -> touch_core::Recording {
    touch_core::Recording {
        descriptor: rec.descriptor.clone(),
        reports: rec.reports.clone(),
    }
}

/// Hands a panel's device messages to the hub until its device stops.
fn forward(
    id: &str,
    rx: Receiver<DeviceMsg>,
    hub: Arc<TouchHub>,
    status: Arc<Mutex<Option<Status>>>,
    taps: Taps,
) {
    let id = id.to_owned();
    std::thread::Builder::new()
        .name("touch-forward".into())
        .spawn(move || {
            for msg in rx {
                match &msg {
                    DeviceMsg::Status(s) => {
                        log::info!("touch: {id}: {s:?}");
                        *lock(&status) = Some(s.clone());
                    }
                    // While calibration listens, touches are its alone: the kiosk under its targets gets none.
                    DeviceMsg::Output(out) => {
                        if let Some(tx) = lock(&taps).as_ref() {
                            if let Output::Pointer(p) = out {
                                if p.kind == touch_core::PointerKind::Down {
                                    let _ = tx.send((p.x, p.y));
                                }
                            }
                            continue;
                        }
                    }
                }
                if let Some(data) = wire(&msg, wall_ms()) {
                    let keep = matches!(msg, DeviceMsg::Status(_)).then_some(Keep::Status);
                    hub.publish(&id, &data, keep);
                }
            }
        })
        .expect("spawning a touch-forward thread");
}

/// What the kiosk showing a panel needs before its touches: the panel's size in panel pixels (the page checks that it
/// fills the panel), and the kiosk's touch settings.
fn setup(cfg: &TouchConfig, name: &str, panel: &PanelConfig) -> String {
    serde_json::json!({ "setup": {
        "name": name,
        "width_px": panel.width_px,
        "height_px": panel.height_px,
        "prediction_ms": cfg.prediction_ms,
        "touch_dots": cfg.touch_dots,
        "debug": cfg.debug,
        "slop_px": cfg.gestures.slop_px,
        "actions": cfg.actions,
    }})
    .to_string()
}

fn wall_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

/// A message as the kiosk reads it: touch-kit's wire format plus `sent_ms`, the wall-clock time it left the app, for
/// the kiosk's latency figure. Reports the pipeline ignored (a mouse mode's) aren't sent.
fn wire(msg: &DeviceMsg, sent_ms: f64) -> Option<String> {
    if matches!(msg, DeviceMsg::Output(Output::Ignored { .. })) {
        return None;
    }
    let mut v = serde_json::to_value(msg).ok()?;
    v.as_object_mut()?.insert("sent_ms".into(), sent_ms.into());
    Some(v.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use touch_core::{PointerEvent, PointerKind, Status};

    fn parse(s: Option<String>) -> serde_json::Value {
        serde_json::from_str(&s.unwrap()).unwrap()
    }

    #[test]
    fn wire_messages_are_touch_kits_with_the_send_time() {
        let p = PointerEvent {
            kind: PointerKind::Move,
            id: 0,
            x: 1.0,
            y: 2.0,
            t_ms: 3,
        };
        assert_eq!(
            parse(wire(&DeviceMsg::Output(Output::Pointer(p)), 4.5)),
            json!({"type": "Pointer", "kind": "Move", "id": 0, "x": 1.0, "y": 2.0, "t_ms": 3, "sent_ms": 4.5})
        );
        assert_eq!(
            parse(wire(&DeviceMsg::Status(Status::Disconnected), 1.0)),
            json!({"status": "Disconnected", "sent_ms": 1.0})
        );
        assert_eq!(
            wire(&DeviceMsg::Output(Output::Ignored { report_id: 2 }), 1.0),
            None
        );
    }

    #[test]
    fn only_a_panel_list_or_testing_change_restarts() {
        let base = TouchConfig::default();
        let with = |f: &dyn Fn(&mut TouchConfig)| {
            let mut c = base.clone();
            f(&mut c);
            c
        };
        assert!(!restarts(&base, &with(&|c| c.gestures.slop_px = 20.0)));
        assert!(!restarts(
            &base,
            &with(&|c| c.panels[0].panel.flip_x = true)
        ));
        assert!(!restarts(&base, &with(&|c| c.touch_dots = true)));
        assert!(restarts(&base, &with(&|c| c.panels[0].id = "left".into())));
        assert!(restarts(
            &base,
            &with(&|c| c.panels[0].device.port = Some("1-2".into()))
        ));
        assert!(restarts(
            &base,
            &with(&|c| c.panels.push(Default::default()))
        ));
        assert!(restarts(&base, &with(&|c| c.testing.enabled = true)));
    }

    /// A virtual panel end to end: touch.json → device thread → hub, then off sends Stopped.
    #[test]
    fn a_virtual_panel_streams_to_the_hub_until_touch_is_off() {
        let dir = std::env::temp_dir().join(format!("ips-touch-engine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // No real panel: a USB device is never opened in a test.
        std::fs::write(
            dir.join("touch.json"),
            r#"{"panels": [], "testing": {"enabled": true, "replay": "tap"}}"#,
        )
        .unwrap();
        let hub = Arc::new(TouchHub::default());
        let mut rx = hub.subscribe("virtual-1");
        let touch = Touch::new(&dir, hub.clone());
        touch.set_enabled(true);

        fn next<B: AsRef<[u8]>>(
            rx: &mut tokio::sync::mpsc::UnboundedReceiver<B>,
        ) -> serde_json::Value {
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            loop {
                if let Ok(b) = rx.try_recv() {
                    let text = std::str::from_utf8(b.as_ref()).unwrap();
                    return serde_json::from_str(text.trim_start_matches("data: ").trim()).unwrap();
                }
                assert!(
                    std::time::Instant::now() < deadline,
                    "no message from the virtual panel"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        let first = next(&mut rx);
        assert_eq!(
            first["setup"]["name"], "Virtual 1",
            "the setup comes before the device starts"
        );
        assert_eq!(first["setup"]["width_px"], 1920);
        assert_eq!(
            first["setup"]["actions"]["ThreeFingerTap"]["action"],
            "toggle_debug"
        );
        assert_eq!(next(&mut rx)["status"], "Connected");
        assert_eq!(next(&mut rx)["type"], "Pointer", "the recording plays");

        // A settings change that doesn't restart the panel sends a new setup.
        std::fs::write(
            dir.join("touch.json"),
            r#"{"panels": [], "touch_dots": true, "testing": {"enabled": true, "replay": "tap"}}"#,
        )
        .unwrap();
        touch.reload();
        let setup = loop {
            let m = next(&mut rx);
            if m.get("setup").is_some() {
                break m;
            }
        };
        assert_eq!(setup["setup"]["touch_dots"], true);

        touch.set_enabled(false);
        let mut late = hub.subscribe("virtual-1");
        assert_eq!(next(&mut late)["setup"]["touch_dots"], true);
        assert_eq!(next(&mut late)["status"], "Stopped");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
