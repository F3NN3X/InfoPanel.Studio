// Touch setup on the screens themselves (Settings › Touch), ported from touch-kit's panel app: short-lived overlay
// windows (app/touch.html) on the touch displays, above the kiosk, that never take focus and let the mouse through.
//
// - Set up panels: every monitor but the main one shows a target, each at a different distance from its centre, and
//   every ready touchscreen is opened. A tap tells both halves: the device that reports it, and (by how far from the
//   centre it lands) the monitor it was shown on. The distance doesn't change when a digitizer is mounted rotated or
//   mirrored, so this works before calibration. Each binding is written as a panel: port, monitor and its size.
// - Pair: "touch this screen" on one panel's monitor; the first ready touchscreen to report a finger is its port.
// - Calibrate: four targets on the panel; the fit is saved when the taps agree, and its error goes back to Settings.
// - Identify: the panel's name on its screen for a moment.
//
// One of these runs at a time, and Cancel (`touch_cancel`) stops it. Set up and Pair need every device free, so they
// run with the engine's devices closed.

use super::commands::edit;
use super::config::{MonitorMatch, PanelEntry, TouchConfig};
use super::Touch;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
};
use touch_core::{
    CalPoint, DeviceConfig, DeviceMsg, Output, PanelConfig, PointerKind, TouchDevice,
};

/// What an overlay page hears from here (`app/touch.html`).
const OVERLAY_EVENT: &str = "touch-overlay";
/// Overlay window labels start with this (capabilities/default.json lists `touch-overlay-*`).
const LABEL_PREFIX: &str = "touch-overlay-";
/// Set up gives up when no tap binds anything for this long.
const SETUP_IDLE: Duration = Duration::from_secs(60);
/// Pairing, and each calibration target, wait this long for a finger.
const TAP_TIMEOUT: Duration = Duration::from_secs(30);
/// How long Identify shows the name.
const IDENTIFY_FOR: Duration = Duration::from_secs(3);
/// Farthest setup target from the centre, as a fraction of the screen (0.5 is the edge).
const MAX_RADIUS: f32 = 0.4;
/// More setup targets than this would sit too close together for an uncalibrated tap.
const MAX_MONITORS: usize = 5;
/// Setup probes map touches onto 0..=GRID, so a position reads as a fraction of the screen.
const GRID: f32 = 1000.0;
/// Calibration targets at 10 % insets, clockwise from top-left, as fractions of the panel.
const TARGETS: [[f32; 2]; 4] = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
/// A fit worse than this (RMS px) means a target was missed; it isn't saved.
const BAD_FIT_PX: f32 = 20.0;

/// The parts of a monitor that matter for matching, in physical px.
#[derive(Clone, Debug, PartialEq)]
pub struct MonitorInfo {
    pub name: Option<String>,
    pub position: [i32; 2],
    pub size: [u32; 2],
}

/// The overlay task running, if any: its cancel flag.
#[derive(Default)]
pub struct Busy(Mutex<Option<Arc<AtomicBool>>>);

/// Clears [`Busy`] when the task ends, however it ends.
struct Running<'a>(&'a Busy);

impl Drop for Running<'_> {
    fn drop(&mut self) {
        *crate::state::lock(&self.0 .0) = None;
    }
}

impl Busy {
    fn begin(&self) -> Result<(Running<'_>, Arc<AtomicBool>), String> {
        let mut slot = crate::state::lock(&self.0);
        if slot.is_some() {
            return Err("Another touch setup step is running; finish or cancel it first.".into());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *slot = Some(cancel.clone());
        Ok((Running(self), cancel))
    }
}

fn monitors(app: &AppHandle) -> Result<Vec<MonitorInfo>, String> {
    Ok(app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|m| MonitorInfo {
            name: m.name().cloned(),
            position: [m.position().x, m.position().y],
            size: [m.size().width, m.size().height],
        })
        .collect())
}

/// The panel's monitor: the one its `monitor` names, else the first whose size equals the panel's.
pub fn pick_monitor<'a>(
    monitors: &'a [MonitorInfo],
    entry: &PanelEntry,
) -> Option<&'a MonitorInfo> {
    if let Some(m) = &entry.monitor {
        return monitors.iter().find(|mon| {
            m.name.as_ref().is_none_or(|n| mon.name.as_ref() == Some(n))
                && m.position.is_none_or(|p| mon.position == p)
        });
    }
    let size = [entry.panel.width_px, entry.panel.height_px];
    monitors.iter().find(|mon| mon.size == size)
}

fn panel(cfg: &TouchConfig, index: usize) -> Result<PanelEntry, String> {
    cfg.panels
        .get(index)
        .cloned()
        .ok_or_else(|| "There's no such panel.".into())
}

fn panel_monitor(app: &AppHandle, entry: &PanelEntry) -> Result<MonitorInfo, String> {
    pick_monitor(&monitors(app)?, entry)
        .cloned()
        .ok_or_else(|| {
            format!(
            "No monitor is {} × {} px for {}. Run Set up panels, or set its size to its display's.",
            entry.panel.width_px, entry.panel.height_px, entry.name
        )
        })
}

/// Opens overlay `name` covering `mon`, at `route` (the page's hash).
fn open(
    app: &AppHandle,
    name: &str,
    mon: &MonitorInfo,
    route: &str,
) -> Result<WebviewWindow, String> {
    let label = format!("{LABEL_PREFIX}{name}");
    if let Some(old) = app.get_webview_window(&label) {
        let _ = old.destroy();
    }
    let url = WebviewUrl::App(format!("app/touch.html#{route}").into());
    let build = || -> tauri::Result<WebviewWindow> {
        let win = crate::windows::local_overlay(touch_kit_tauri::window::builder(app, &label, url))
            .title("InfoPanel Studio touch setup")
            .always_on_top(true)
            .build()?;
        win.set_position(PhysicalPosition::new(mon.position[0], mon.position[1]))?;
        win.set_size(PhysicalSize::new(mon.size[0], mon.size[1]))?;
        // Touches come from touch-core; the real mouse passes through to whatever is under it.
        win.set_ignore_cursor_events(true)?;
        touch_kit_tauri::window::show(&win)?;
        Ok(win)
    };
    build().map_err(|e| {
        format!(
            "Opening the overlay on {}: {e}",
            mon.name.as_deref().unwrap_or("the panel's monitor")
        )
    })
}

/// Enough percent-encoding for a name in a URL fragment.
fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn ready_ports(device: &DeviceConfig) -> Result<Vec<String>, String> {
    let ports: Vec<String> = touch_core::usb::candidates(device)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|t| t.ready)
        .map(|t| t.port)
        .collect();
    if ports.is_empty() {
        return Err(
            "No touchscreen is ready: give it the WinUSB driver first (Touchscreens, below)."
                .into(),
        );
    }
    Ok(ports)
}

/// One device per port, mapping onto `panel`; each finger down comes out tagged with its port.
fn probes(
    ports: &[String],
    panel: &PanelConfig,
    cfg: &TouchConfig,
) -> (Vec<TouchDevice>, Receiver<(String, f32, f32)>) {
    let (hit_tx, hit_rx) = mpsc::channel();
    let devices = ports
        .iter()
        .map(|port| {
            let touch = touch_core::Config {
                device: DeviceConfig {
                    port: Some(port.clone()),
                    ..Default::default()
                },
                panel: panel.clone(),
                gestures: cfg.gestures.clone(),
            };
            let (tx, rx) = mpsc::channel::<DeviceMsg>();
            let (hit_tx, port) = (hit_tx.clone(), port.clone());
            std::thread::spawn(move || {
                for m in rx {
                    if let DeviceMsg::Output(Output::Pointer(p)) = m {
                        if p.kind == PointerKind::Down
                            && hit_tx.send((port.clone(), p.x, p.y)).is_err()
                        {
                            return;
                        }
                    }
                }
            });
            TouchDevice::spawn(touch, Vec::new(), tx)
        })
        .collect();
    (devices, hit_rx)
}

/// The file's `panels` as written, or one empty entry per panel in effect when the file has none (the same panels).
fn file_panels(touch: &Touch, cfg: &TouchConfig) -> Result<Vec<Value>, String> {
    let file = match std::fs::read_to_string(touch.path()) {
        Ok(text) => serde_json::from_str::<Value>(&text)
            .map_err(|_| "touch.json doesn't parse; fix it first.".to_string())?,
        Err(_) => json!({}),
    };
    Ok(file
        .get("panels")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| cfg.panels.iter().map(|_| json!({})).collect()))
}

fn write_panels(touch: &Touch, panels: Vec<Value>) -> Result<(), String> {
    edit(touch.path(), "panels", Some(Value::Array(panels))).map_err(|e| e.join("; "))?;
    touch.reload();
    Ok(())
}

fn need_on(touch: &Touch) -> Result<TouchConfig, String> {
    let snapshot = touch.snapshot();
    if !snapshot.enabled {
        return Err("Turn on Touch panels first.".into());
    }
    Ok(snapshot.config)
}

/// Runs `f` off the async runtime: these steps wait for taps and build windows.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Target distance from the centre for each of `n` monitors, spread evenly from the centre out.
pub fn radii(n: usize) -> Vec<f32> {
    match n {
        0 => Vec::new(),
        1 => vec![0.0],
        _ => (0..n)
            .map(|k| k as f32 * MAX_RADIUS / (n - 1) as f32)
            .collect(),
    }
}

/// The monitor whose target a tap at `(u, v)` (fractions of the screen) was meant for: the nearest radius among those
/// not bound yet, if within half the spacing between targets.
pub fn pick(u: f32, v: f32, radii: &[f32], bound: &[bool]) -> Option<usize> {
    let r = ((u - 0.5).powi(2) + (v - 0.5).powi(2)).sqrt();
    let tolerance = if radii.len() > 1 {
        MAX_RADIUS / (radii.len() - 1) as f32 / 2.0
    } else {
        f32::INFINITY
    };
    (0..radii.len())
        .filter(|&k| !bound[k])
        .map(|k| (k, (radii[k] - r).abs()))
        .filter(|(_, d)| *d <= tolerance)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(k, _)| k)
}

/// `base` (an object, or nothing) with `extra`'s keys set.
fn merged(base: Option<&Value>, extra: Value) -> Value {
    let mut out = base
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));
    for (k, v) in extra.as_object().expect("an object") {
        out[k] = v.clone();
    }
    out
}

/// The file's `panels` with `bindings` applied. `effective` is the panels in effect, index for index with `file`. Each
/// binding goes to the panel with that port, else the one on that monitor, else the first with neither, else a new
/// one; that panel gets the port, the monitor and the monitor's size, and any other panel holding either lets go.
pub fn apply(
    file: Vec<Value>,
    effective: &[PanelEntry],
    bindings: &[(String, MonitorInfo)],
) -> Vec<Value> {
    let mut panels = file;
    let mut entries = effective.to_vec();
    for (port, mon) in bindings {
        let name = mon.name.clone().unwrap_or_default();
        let has_port = |p: &PanelEntry| p.device.port.as_deref() == Some(port.as_str());
        let on_monitor = |p: &PanelEntry| {
            p.monitor.as_ref().and_then(|m| m.name.as_deref()) == Some(name.as_str())
        };
        let blank = |p: &PanelEntry| p.device.port.is_none() && p.monitor.is_none();
        let i = entries
            .iter()
            .position(has_port)
            .or_else(|| entries.iter().position(on_monitor))
            .or_else(|| entries.iter().position(blank))
            .unwrap_or_else(|| {
                let mut n = entries.len() + 1;
                while entries.iter().any(|e| e.id == format!("panel-{n}")) {
                    n += 1;
                }
                let (id, title) = (format!("panel-{n}"), format!("Panel {n}"));
                entries.push(PanelEntry {
                    id: id.clone(),
                    name: title.clone(),
                    ..Default::default()
                });
                panels.push(json!({ "id": id, "name": title }));
                entries.len() - 1
            });
        for (j, e) in entries.iter_mut().enumerate() {
            if j == i {
                continue;
            }
            if e.device.port.as_deref() == Some(port.as_str()) {
                e.device.port = None;
                if let Some(d) = panels[j].get_mut("device").and_then(Value::as_object_mut) {
                    d.remove("port");
                }
            }
            if e.monitor.as_ref().and_then(|m| m.name.as_deref()) == Some(name.as_str()) {
                e.monitor = None;
                if let Some(o) = panels[j].as_object_mut() {
                    o.remove("monitor");
                }
            }
        }
        entries[i].device.port = Some(port.clone());
        entries[i].monitor = Some(MonitorMatch {
            name: Some(name.clone()),
            position: None,
        });
        let p = &mut panels[i];
        if !p.is_object() {
            *p = json!({});
        }
        p["device"] = merged(p.get("device"), json!({ "port": port }));
        p["monitor"] = json!({ "name": name });
        p["panel"] = merged(
            p.get("panel"),
            json!({ "width_px": mon.size[0], "height_px": mon.size[1] }),
        );
    }
    panels
}

#[derive(Serialize)]
pub struct Bound {
    port: String,
    monitor: String,
}

/// Set up panels; resolves when every touch display is bound, Cancel, or a minute without a binding.
#[tauri::command]
pub async fn touch_setup(app: AppHandle) -> Result<Vec<Bound>, String> {
    log::debug!("ipc: touch_setup");
    blocking(move || {
        let (busy, touch) = (app.state::<Busy>(), app.state::<Touch>());
        let cfg = need_on(&touch)?;
        let main = app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .map(|m| [m.position().x, m.position().y]);
        let mut screens: Vec<MonitorInfo> = monitors(&app)?
            .into_iter()
            .filter(|m| Some(m.position) != main)
            .collect();
        screens.sort_by_key(|m| (m.position[1], m.position[0]));
        screens.truncate(MAX_MONITORS);
        if screens.is_empty() {
            return Err(
                "There's no monitor besides the main one: connect the touch display first.".into(),
            );
        }
        let ports = ready_ports(&DeviceConfig::default())?;
        let (_running, cancel) = busy.begin()?;
        let radii = radii(screens.len());
        let bindings = touch.while_stopped(|| -> Result<Vec<(String, MonitorInfo)>, String> {
            let windows = screens
                .iter()
                .enumerate()
                .map(|(k, mon)| {
                    open(
                        &app,
                        &format!("setup-{k}"),
                        mon,
                        &format!("setup/{}", radii[k]),
                    )
                })
                .collect::<Result<Vec<_>, _>>();
            let windows = match windows {
                Ok(w) => w,
                Err(e) => {
                    close_overlays(&app);
                    return Err(e);
                }
            };
            log::info!(
                "touch: setup on {} monitor(s), {} touchscreen(s)",
                screens.len(),
                ports.len()
            );
            let probe = PanelConfig {
                width_px: GRID as u32 + 1,
                height_px: GRID as u32 + 1,
                ..Default::default()
            };
            let (devices, hits) = probes(&ports, &probe, &cfg);
            let mut bound = vec![false; screens.len()];
            let mut bindings: Vec<(String, MonitorInfo)> = Vec::new();
            let mut idle_until = Instant::now() + SETUP_IDLE;
            while !cancel.load(Ordering::Relaxed)
                && Instant::now() < idle_until
                && bindings.len() < screens.len().min(ports.len())
            {
                match hits.recv_timeout(Duration::from_millis(100)) {
                    Ok((port, x, y)) => {
                        if bindings.iter().any(|(p, _)| *p == port) {
                            continue;
                        }
                        let Some(k) = pick(x / GRID, y / GRID, &radii, &bound) else {
                            continue;
                        };
                        bound[k] = true;
                        let name = screens[k].name.clone().unwrap_or_default();
                        log::info!("touch: setup: {port} is the touchscreen of {name}");
                        let _ = windows[k].emit_to(
                            windows[k].label(),
                            OVERLAY_EVENT,
                            json!({ "bound": name }),
                        );
                        bindings.push((port, screens[k].clone()));
                        idle_until = Instant::now() + SETUP_IDLE;
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            drop(devices);
            // Long enough to read the last "Set up" on its screen.
            std::thread::sleep(Duration::from_millis(800));
            close_overlays(&app);
            Ok(bindings)
        })?;
        if !bindings.is_empty() {
            write_panels(
                &touch,
                apply(file_panels(&touch, &cfg)?, &cfg.panels, &bindings),
            )?;
        }
        Ok(bindings
            .into_iter()
            .map(|(port, m)| Bound {
                port,
                monitor: m.name.unwrap_or_default(),
            })
            .collect())
    })
    .await
}

/// Pairs panel `index` with the touchscreen touched on its screen; resolves to that USB port.
#[tauri::command]
pub async fn touch_pair(app: AppHandle, index: usize) -> Result<String, String> {
    log::debug!("ipc: touch_pair {index}");
    blocking(move || {
        let (busy, touch) = (app.state::<Busy>(), app.state::<Touch>());
        let cfg = need_on(&touch)?;
        let entry = panel(&cfg, index)?;
        let mon = panel_monitor(&app, &entry)?;
        let ports = ready_ports(&entry.device)?;
        let (_running, cancel) = busy.begin()?;
        let port = touch.while_stopped(|| -> Result<String, String> {
            open(&app, "pair", &mon, &format!("pair/{}", encode(&entry.name)))?;
            let (devices, hits) = probes(&ports, &entry.panel, &cfg);
            let deadline = Instant::now() + TAP_TIMEOUT;
            let result = loop {
                if cancel.load(Ordering::Relaxed) {
                    break Err("Pairing cancelled.".to_string());
                }
                if Instant::now() > deadline {
                    break Err("No touch within 30 seconds; pairing stopped.".into());
                }
                match hits.recv_timeout(Duration::from_millis(100)) {
                    Ok((port, _, _)) => break Ok(port),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => {
                        break Err("The touchscreens closed.".into())
                    }
                }
            };
            drop(devices);
            close_overlays(&app);
            result
        })?;
        // The port moves to this panel; a panel that had it pinned lets go (it was the wrong one).
        let mut panels = file_panels(&touch, &cfg)?;
        for (j, p) in panels.iter_mut().enumerate() {
            if j != index {
                if let Some(d) = p.get_mut("device").and_then(Value::as_object_mut) {
                    if d.get("port").and_then(Value::as_str) == Some(port.as_str()) {
                        d.remove("port");
                    }
                }
            }
        }
        if let Some(p) = panels.get_mut(index) {
            if !p.is_object() {
                *p = json!({});
            }
            p["device"] = merged(p.get("device"), json!({ "port": port }));
        }
        write_panels(&touch, panels)?;
        log::info!("touch: {} is the touchscreen at {port}", entry.name);
        Ok(port)
    })
    .await
}

/// Calibrates panel `index` with four targets on its screen; resolves to the fit's error in panel px once saved.
#[tauri::command]
pub async fn touch_calibrate(app: AppHandle, index: usize) -> Result<f32, String> {
    log::debug!("ipc: touch_calibrate {index}");
    blocking(move || {
        let (busy, touch) = (app.state::<Busy>(), app.state::<Touch>());
        let cfg = need_on(&touch)?;
        let entry = panel(&cfg, index)?;
        let mon = panel_monitor(&app, &entry)?;
        let connected = touch
            .snapshot()
            .panels
            .iter()
            .any(|p| p.id == entry.id && matches!(p.status, Some(touch_core::Status::Connected { .. })));
        if !connected {
            return Err(format!("{}'s touchscreen isn't connected.", entry.name));
        }
        let (_running, cancel) = busy.begin()?;
        let (w, h) = (entry.panel.width_px as f32, entry.panel.height_px as f32);
        // Without its calibration, so a finger's px convert back to the raw touch.
        let raw = PanelConfig { calibration: None, ..entry.panel.clone() };
        let taps = touch.taps(index, raw).ok_or_else(|| format!("{} isn't running.", entry.name))?;
        let win = match open(&app, "calibrate", &mon, &format!("calibrate/{}", encode(&entry.name))) {
            Ok(win) => win,
            Err(e) => {
                touch.stop_taps(index);
                return Err(e);
            }
        };
        let mut points: Vec<CalPoint> = Vec::new();
        let result = loop {
            if points.len() == TARGETS.len() {
                let points: [CalPoint; 4] = points.clone().try_into().expect("four points");
                break touch_core::mapper::calibration_error(&points)
                    .map_err(|e| e.to_string())
                    .map(|error| (points, error));
            }
            let deadline = Instant::now() + TAP_TIMEOUT;
            let tap = loop {
                if cancel.load(Ordering::Relaxed) {
                    break Err("Calibration cancelled.".to_string());
                }
                if Instant::now() > deadline {
                    break Err("No touch within 30 seconds; calibration stopped.".into());
                }
                match taps.recv_timeout(Duration::from_millis(100)) {
                    Ok(tap) => break Ok(tap),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break Err("The touchscreen closed.".into()),
                }
            };
            match tap {
                Ok((x, y)) => {
                    let [fx, fy] = TARGETS[points.len()];
                    points.push(CalPoint { touch: [x / (w - 1.0), y / (h - 1.0)], panel: [fx * (w - 1.0), fy * (h - 1.0)] });
                    let _ = win.emit_to(win.label(), OVERLAY_EVENT, json!({ "target": points.len() }));
                }
                Err(e) => break Err(e),
            }
        };
        let saved = result.and_then(|(points, error)| {
            if error > BAD_FIT_PX {
                return Err(format!("The taps were {error:.0} px apart from the targets: one was probably missed. Calibrate again."));
            }
            let value = serde_json::to_value(points).map_err(|e| e.to_string())?;
            edit(touch.path(), &format!("panels.{index}.panel.calibration"), Some(value)).map_err(|e| e.join("; "))?;
            Ok(error)
        });
        let _ = win.emit_to(win.label(), OVERLAY_EVENT, json!({ "done": saved.is_ok() }));
        std::thread::sleep(Duration::from_millis(1200));
        let _ = win.destroy();
        touch.stop_taps(index);
        touch.reload();
        saved
    })
    .await
}

/// Shows panel `index`'s name on its screen for a few seconds.
#[tauri::command]
pub async fn touch_identify(app: AppHandle, index: usize) -> Result<(), String> {
    log::debug!("ipc: touch_identify {index}");
    blocking(move || {
        let cfg = app.state::<Touch>().snapshot().config;
        let entry = panel(&cfg, index)?;
        let mon = panel_monitor(&app, &entry)?;
        let win = open(
            &app,
            &format!("identify-{index}"),
            &mon,
            &format!("identify/{}", encode(&entry.name)),
        )?;
        std::thread::spawn(move || {
            std::thread::sleep(IDENTIFY_FOR);
            let _ = win.destroy();
        });
        Ok(())
    })
    .await
}

/// Stops the running setup step (Set up keeps what it bound so far).
#[tauri::command]
pub fn touch_cancel(busy: State<'_, Busy>) {
    log::debug!("ipc: touch_cancel");
    if let Some(cancel) = crate::state::lock(&busy.0).as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
}

fn close_overlays(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with(LABEL_PREFIX) {
            let _ = win.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(name: &str, position: [i32; 2], size: [u32; 2]) -> MonitorInfo {
        MonitorInfo {
            name: Some(name.into()),
            position,
            size,
        }
    }

    #[test]
    fn a_panel_takes_its_named_monitor_else_the_first_of_its_size() {
        let ms = vec![
            mon(r"\\.\DISPLAY2", [0, 0], [3840, 2160]),
            mon(r"\\.\DISPLAY3", [596, -1440], [2560, 1440]),
            mon(r"\\.\DISPLAY4", [3833, 2178], [1920, 550]),
        ];
        assert_eq!(
            pick_monitor(&ms, &PanelEntry::default())
                .unwrap()
                .name
                .as_deref(),
            Some(r"\\.\DISPLAY4")
        );
        let named = PanelEntry {
            monitor: Some(MonitorMatch {
                name: Some(r"\\.\DISPLAY3".into()),
                position: None,
            }),
            ..Default::default()
        };
        assert_eq!(pick_monitor(&ms, &named).unwrap().position, [596, -1440]);
        let mut small = PanelEntry::default();
        small.panel.height_px = 480;
        assert!(
            pick_monitor(&ms, &small).is_none(),
            "never falls back to the main screen"
        );
    }

    #[test]
    fn taps_pick_the_target_at_their_distance_from_the_centre() {
        let r = radii(3); // 0, 0.2, 0.4
        assert_eq!(pick(0.5, 0.5, &r, &[false; 3]), Some(0));
        // 0.2 from the centre in any direction: rotated or mirrored digitizers land the same.
        assert_eq!(pick(0.7, 0.5, &r, &[false; 3]), Some(1));
        assert_eq!(pick(0.5, 0.3, &r, &[false; 3]), Some(1));
        assert_eq!(pick(0.1, 0.5, &r, &[false; 3]), Some(2));
        assert_eq!(pick(0.82, 0.5, &r, &[false, true, false]), Some(2));
        assert_eq!(
            pick(0.65, 0.5, &r, &[false, true, false]),
            None,
            "too far from both free targets"
        );
        assert_eq!(
            pick(0.0, 0.0, &radii(1), &[false]),
            Some(0),
            "one monitor: any tap"
        );
    }

    #[test]
    fn bindings_fill_the_blank_default_panel_then_add_panels_with_free_ids() {
        let out = apply(
            vec![json!({})],
            &[PanelEntry::default()],
            &[
                ("p1".into(), mon("D4", [0, 0], [1920, 550])),
                ("p2".into(), mon("D5", [0, 0], [1280, 800])),
            ],
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0]["device"]["port"], "p1");
        assert_eq!(out[0]["monitor"]["name"], "D4");
        assert_eq!(out[0]["panel"], json!({"width_px": 1920, "height_px": 550}));
        assert_eq!(
            (out[1]["id"].as_str(), out[1]["name"].as_str()),
            (Some("panel-2"), Some("Panel 2"))
        );
        assert_eq!(out[1]["panel"]["width_px"], 1280);
    }

    #[test]
    fn a_panel_keeps_its_settings_and_others_let_go_of_the_port_and_monitor() {
        let file = vec![
            json!({"name": "main", "device": {"port": "p1"}, "panel": {"rotation": "180"}}),
            json!({"id": "side", "name": "side", "monitor": {"name": "D4"}}),
        ];
        let mut effective = vec![
            PanelEntry::default(),
            PanelEntry {
                id: "side".into(),
                ..Default::default()
            },
        ];
        effective[0].device.port = Some("p1".into());
        effective[1].monitor = Some(MonitorMatch {
            name: Some("D4".into()),
            position: None,
        });
        let out = apply(
            file,
            &effective,
            &[("p1".into(), mon("D4", [0, 0], [1920, 550]))],
        );
        assert_eq!(out[0]["name"], "main");
        assert_eq!(out[0]["panel"]["rotation"], "180");
        assert_eq!(out[0]["monitor"]["name"], "D4");
        assert!(out[1].get("monitor").is_none());
    }

    #[test]
    fn names_survive_the_url_fragment() {
        assert_eq!(encode("Edge #2 / ünï"), "Edge%20%232%20%2F%20%C3%BCn%C3%AF");
    }

    #[test]
    fn only_one_step_runs_at_a_time() {
        let busy = Busy::default();
        let (running, _) = busy.begin().unwrap();
        assert!(busy.begin().is_err());
        drop(running);
        assert!(busy.begin().is_ok(), "ending a step frees the slot");
    }
}
