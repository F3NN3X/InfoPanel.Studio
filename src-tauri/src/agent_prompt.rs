// The agent prompt window (pinned layer P8, security review 1 and 3): where a coding agent's permission request is read and
// answered. Approving a tool call runs code, so the answer never goes over HTTP: any process on this PC can reach the
// server's loopback port, the agent asking included, and so can every page and code widget the server serves. Instead the
// in-process server's requests (ips-server's approvals.rs) are read and answered here, by IPC from one window:
//
// - the window is the app's own local page (app/agent-prompt.html), built with `windows::local_overlay`, which lets it
//   navigate to local pages only, so no server page or widget ever runs in it;
// - `agent_requests` and `agent_answer` are granted to that window alone (capabilities/agent-prompt.json, local pages only)
//   and check its label as well;
// - it opens, always on top and without taking the focus, over the main window's page area (`agent_prompt_room`, which the
//   kiosk page sends, the only thing it can send) while a request waits, and closes when none does;
// - with a server the app did not start (a foreign server) there is nothing to read: the agent asks in its terminal.
//
// The Settings window reads the log of answers (`agent_answers_log`).

use crate::state::{lock, AppState};
use crate::windows;
use ips_server::approvals::{self, Approvals, Behavior};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "agent-prompt";
/// Sent to the prompt window with the requests waiting, whenever one arrives or goes.
pub const REQUESTS_EVENT: &str = "agent-requests";
/// The window's size in logical pixels; a long command scrolls inside it.
const WIDTH: f64 = 600.0;
const HEIGHT: f64 = 460.0;
/// The largest side a page area can have (the kiosk's, kiosk.rs `MAX_SIDE`).
const MAX_SIDE: f64 = 16384.0;

/// The main window's page area, in CSS pixels from its top left: the kiosk's page without a pinned rail (Q12).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct Rect {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    fn valid(self) -> bool {
        let side = |v: f64| v.is_finite() && (0.0..=MAX_SIDE).contains(&v);
        side(self.left) && side(self.top) && side(self.width) && side(self.height)
    }
}

/// The page area last sent, and a lock that keeps one window update at a time.
#[derive(Default)]
pub struct Room {
    rect: Mutex<Option<Rect>>,
    sync: Mutex<()>,
}

/// Where the prompt's top left goes: centred on `room` (CSS px, the page's zoom `zoom`) inside a window whose page starts
/// at `origin`, physical pixels at `scale`.
pub fn placement(origin: (i32, i32), scale: f64, zoom: f64, room: Rect) -> (i32, i32) {
    let centre = |start: f64, side: f64, own: f64| ((start + side / 2.0) * zoom * scale - own * scale / 2.0).round() as i32;
    (origin.0 + centre(room.left, room.width, WIDTH), origin.1 + centre(room.top, room.height, HEIGHT))
}

fn approvals_of(app: &AppHandle) -> Option<Approvals> {
    let st = app.state::<AppState>();
    let server = lock(&st.server);
    server.native.as_ref().map(|n| n.approvals.clone())
}

/// The requests waiting now, as the prompt page reads them.
fn payload(approvals: Option<&Approvals>) -> Value {
    let now = ips_server::config::now_ms();
    let requests: Vec<Value> = approvals.map(|a| a.requests().iter().map(|r| r.to_json(now)).collect()).unwrap_or_default();
    json!({ "wait": approvals::WAIT.as_millis() as u64, "requests": requests })
}

/// Opens or closes the prompt window for `approvals`, the in-app server just started: called on every arrival and answer.
pub fn watch(app: &AppHandle, approvals: &Approvals) {
    let app = app.clone();
    approvals.set_on_change(move || {
        let app = app.clone();
        // off the server's task, and off the main thread (a window built there from a callback can hang it)
        tauri::async_runtime::spawn_blocking(move || sync(&app));
    });
}

fn place(app: &AppHandle, win: &WebviewWindow) {
    let Some(main) = app.get_webview_window(windows::MAIN) else { return };
    if !main.is_visible().unwrap_or(false) || main.is_minimized().unwrap_or(true) {
        return;
    }
    let (Ok(origin), Ok(size), Ok(scale)) = (main.inner_position(), main.inner_size(), main.scale_factor()) else { return };
    let zoom = windows::zoom_factor(app);
    let whole = Rect { left: 0.0, top: 0.0, width: f64::from(size.width) / scale / zoom, height: f64::from(size.height) / scale / zoom };
    let room = lock(&app.state::<Room>().rect).unwrap_or(whole);
    let (x, y) = placement((origin.x, origin.y), scale, zoom, room);
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn sync(app: &AppHandle) {
    let room = app.state::<Room>();
    let _one = lock(&room.sync);
    let approvals = approvals_of(app);
    let waiting = approvals.as_ref().is_some_and(|a| !a.requests().is_empty());
    match (app.get_webview_window(LABEL), waiting) {
        (Some(win), true) => {
            let _ = win.emit_to(LABEL, REQUESTS_EVENT, payload(approvals.as_ref()));
        }
        (Some(win), false) => {
            let _ = win.destroy();
        }
        (None, true) => {
            let url = WebviewUrl::App("app/agent-prompt.html".into());
            let built = windows::local_overlay(WebviewWindowBuilder::new(app, LABEL, url))
                .title("InfoPanel Studio: an agent asks")
                .inner_size(WIDTH, HEIGHT)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .visible(false)
                .center()
                .build();
            match built {
                Ok(win) => {
                    place(app, &win);
                    let _ = win.show();
                }
                Err(e) => log::warn!("could not open the agent prompt: {e}"),
            }
        }
        (None, false) => {}
    }
}

fn prompt_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == LABEL {
        Ok(())
    } else {
        Err("Agent requests are answered in InfoPanel Studio's own prompt window only.".into())
    }
}

/// The requests waiting, for the prompt window as it opens.
#[tauri::command]
pub fn agent_requests(window: WebviewWindow, app: AppHandle) -> Result<Value, String> {
    prompt_only(&window)?;
    Ok(payload(approvals_of(&app).as_ref()))
}

/// The prompt's answer to request `id`: false when that request no longer waits (answered, timed out, or another one).
#[tauri::command]
pub fn agent_answer(window: WebviewWindow, app: AppHandle, id: String, behavior: String) -> Result<bool, String> {
    prompt_only(&window)?;
    let behavior = Behavior::parse(&behavior).ok_or("The answer is allow or deny.")?;
    let Some(approvals) = approvals_of(&app) else { return Ok(false) };
    let answered = approvals.answer(&id, behavior, "prompt", ips_server::config::now_ms());
    log::info!("agent prompt: {} {id} ({})", behavior.as_str(), if answered { "taken" } else { "no longer waiting" });
    Ok(answered)
}

/// The log of answers, newest last, for Settings > Coding agents.
#[tauri::command]
pub fn agent_answers_log(app: AppHandle) -> Vec<Value> {
    approvals::read_log(&crate::native::server_data_dir(&app.state::<AppState>().paths))
}

/// The kiosk page's page area (without a pinned rail), so the prompt sits centred on it.
#[tauri::command]
pub fn agent_prompt_room(window: WebviewWindow, app: AppHandle, room: Rect) -> Result<(), String> {
    if window.label() != windows::MAIN || !room.valid() {
        return Err("Not a page area.".into());
    }
    *lock(&app.state::<Room>().rect) = Some(room);
    if let Some(win) = app.get_webview_window(LABEL) {
        place(&app, &win);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_prompt_centres_on_the_page_area_at_any_scale_and_zoom() {
        let room = Rect { left: 0.0, top: 0.0, width: 1600.0, height: 900.0 };
        assert_eq!(placement((100, 50), 1.0, 1.0, room), (100 + 800 - 300, 50 + 450 - 230));
        // a rail pinned on the left: the page area starts after it
        let beside = Rect { left: 400.0, ..room };
        assert_eq!(placement((0, 0), 1.0, 1.0, beside).0, 400 + 800 - 300);
        // 150 % display scale and 125 % app zoom
        assert_eq!(placement((0, 0), 1.5, 1.25, room), (1500 - 450, 844 - 345));
    }

    #[test]
    fn only_the_prompt_window_may_read_or_answer_and_only_on_local_pages() {
        let prompt: Value = serde_json::from_str(include_str!("../capabilities/agent-prompt.json")).unwrap();
        assert_eq!(prompt["windows"], json!([LABEL]));
        assert_eq!(prompt["local"], true);
        assert!(prompt.get("remote").is_none());
        let others: Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let granted = others["permissions"].as_array().unwrap();
        for command in ["allow-agent-requests", "allow-agent-answer"] {
            assert!(!granted.contains(&json!(command)), "{command} is granted to the app's other pages");
        }
    }

    #[test]
    fn a_page_area_is_finite_and_within_the_kiosks_sides() {
        let ok = Rect { left: 0.0, top: 0.0, width: 1920.0, height: 1080.0 };
        assert!(ok.valid());
        for bad in
            [Rect { width: f64::NAN, ..ok }, Rect { left: -1.0, ..ok }, Rect { height: 20000.0, ..ok }, Rect { top: f64::INFINITY, ..ok }]
        {
            assert!(!bad.valid(), "{bad:?}");
        }
    }
}
