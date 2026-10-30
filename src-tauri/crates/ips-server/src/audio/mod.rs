// The audio control the Stream Mixer and the audio buttons use: this PC's Windows audio (Core Audio) and Elgato Wave Link,
// read into one state and written by POST /api/audio/act. GET /api/audio and the SSE /events/audio carry that state; a
// write is refused from other machines (unless remote editing is on) and needs the control marker header. Windows' side
// exists on Windows only; elsewhere it reports `available: false` and its writes answer 503.

pub mod act;
#[cfg(windows)]
mod coreaudio;
pub mod state;
pub mod wavelink;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError, Weak};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use serde_json::Value;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

use crate::http::{self, Req};
use crate::request_guard::control_write_refusal;
use crate::{sse, supervisor, App};
use act::{Act, WinAct};
use state::{AudioState, WindowsState};
use wavelink::WaveLink;

const MAX_BODY_BYTES: usize = 4 * 1024;

/// The open /events/audio streams by id, and the next id.
#[derive(Default)]
struct Listeners {
    next: u64,
    open: BTreeMap<u64, mpsc::UnboundedSender<Bytes>>,
}

/// Windows' audio and Wave Link as kiosks see them, and the way to write to both.
pub struct Audio {
    windows: Mutex<WindowsState>,
    wavelink: WaveLink,
    #[cfg(windows)]
    core: Arc<coreaudio::Backend>,
    /// Set by `start`: a server that never started its backends (a test) neither writes to Windows nor opens its settings.
    started: AtomicBool,
    listeners: Mutex<Listeners>,
}

/// A stream's place in the listeners; dropped with the stream.
struct Listener {
    audio: Arc<Audio>,
    id: u64,
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.audio
            .listeners
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .open
            .remove(&self.id);
    }
}

/// Wave Link's `ws-info.json` under this user's local app data, when there is one.
pub fn local_ws_info() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|dir| wavelink::ws_info_path(dir.as_ref()))
}

impl Audio {
    /// The audio over Wave Link's `ws-info.json` (None: no Wave Link is looked for). Nothing runs until `start`.
    pub fn new(ws_info: Option<PathBuf>) -> Arc<Self> {
        Arc::new_cyclic(|weak: &Weak<Self>| {
            let weak = weak.clone();
            Self {
                windows: Mutex::new(WindowsState::default()),
                wavelink: WaveLink::new(ws_info, move || {
                    if let Some(audio) = weak.upgrade() {
                        audio.publish();
                    }
                }),
                #[cfg(windows)]
                core: Arc::new(coreaudio::Backend::new()),
                started: AtomicBool::new(false),
                listeners: Mutex::new(Listeners::default()),
            }
        })
    }

    pub fn state(&self) -> AudioState {
        AudioState {
            windows: self
                .windows
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone(),
            wavelink: self.wavelink.state(),
        }
    }

    fn json(&self) -> String {
        serde_json::to_string(&self.state()).unwrap_or_else(|_| "{}".into())
    }

    /// Sends the full state to every open stream.
    pub fn publish(&self) {
        let event = sse::event(&self.json());
        self.listeners
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .open
            .retain(|_, tx| tx.send(event.clone()).is_ok());
    }

    /// A stream's receiver, with the state now already queued, and the registration to drop.
    fn listen(self: &Arc<Self>) -> (mpsc::UnboundedReceiver<Bytes>, Listener) {
        let (tx, rx) = mpsc::unbounded_channel();
        let _ = tx.send(sse::event(&self.json()));
        let mut listeners = self
            .listeners
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let id = listeners.next;
        listeners.next += 1;
        listeners.open.insert(id, tx);
        (
            rx,
            Listener {
                audio: Arc::clone(self),
                id,
            },
        )
    }

    /// Starts the Windows audio thread and the Wave Link connection, each under the supervisor.
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> Vec<JoinHandle<()>> {
        self.started.store(true, Ordering::SeqCst);
        let mut tasks = Vec::new();
        #[cfg(windows)]
        tasks.push({
            let audio = Arc::clone(self);
            let stop = shutdown.clone();
            supervisor::spawn("audio-windows", shutdown.clone(), move || {
                let (audio, stop) = (Arc::clone(&audio), stop.clone());
                async move {
                    let on_state: Arc<dyn Fn(WindowsState) + Send + Sync> = {
                        let audio = Arc::clone(&audio);
                        Arc::new(move |next| {
                            *audio.windows.lock().unwrap_or_else(PoisonError::into_inner) = next;
                            audio.publish();
                        })
                    };
                    audio.core.run(stop, on_state).await;
                }
            })
        });
        let audio = Arc::clone(self);
        tasks.push(supervisor::spawn("wavelink", shutdown.clone(), move || {
            let audio = Arc::clone(&audio);
            async move { audio.wavelink.run().await }
        }));
        tasks
    }

    /// Hands a Windows write to its backend; false when there is none (or the platform has none).
    #[cfg(windows)]
    fn send_windows(&self, act: WinAct) -> bool {
        if act == WinAct::Settings {
            return self.started.load(Ordering::SeqCst)
                && std::process::Command::new("explorer.exe")
                    .arg("ms-settings:sound")
                    .spawn()
                    .is_ok();
        }
        self.windows
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .available
            && self.core.send(act)
    }

    #[cfg(not(windows))]
    fn send_windows(&self, _act: WinAct) -> bool {
        false
    }
}

/// GET /api/audio → the state; any other method 405.
pub fn handle_state(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    let state = serde_json::to_value(app.audio.state()).unwrap_or(Value::Null);
    http::json(200, &state)
}

/// /events/audio: the state now, then each change.
pub fn handle_events(app: &App) -> Response<Body> {
    let (rx, listener) = app.audio.listen();
    let client = app.debug.sse_open("audio");
    sse::response(rx, app.shutdown.clone(), Box::new((listener, client)))
}

/// POST /api/audio/act → 204 once the write is handed on. Needs a JSON body and `X-Dashboard-Control: 1`; 403 from another
/// machine while remote editing is off; 400 for a body that is not an action; 503 when that backend isn't running.
pub async fn handle_act(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return Ok(response);
    }
    if let Some(refusal) = control_write_refusal(
        req.header("content-type").as_deref(),
        req.header("x-dashboard-control").as_deref(),
    ) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_BODY_BYTES).await {
        Ok(body) => body,
        Err(http::BodyRefused) => {
            return Ok(http::closing(http::text(400, "expected a JSON object")))
        }
    };
    let act = match act::parse(&body) {
        Ok(act) => act,
        Err(message) => return Ok(http::text(400, message)),
    };
    let audio = &app.audio;
    let (sent, backend) = match act {
        Act::Windows(act) => (audio.send_windows(act), "Windows audio"),
        Act::WaveLink(act) => (audio.wavelink.send(act), "Wave Link"),
    };
    Ok(if sent {
        http::empty(204)
    } else {
        http::text(503, format!("{backend} isn't available"))
    })
}
