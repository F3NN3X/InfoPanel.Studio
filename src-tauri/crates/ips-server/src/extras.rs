// The server's extras for kiosks (server/extras.mjs): OBS's on-air state, the upcoming calendar events and the coding
// agents' sessions, from the integrations in their own file (integrations.rs). GET /api/extras and the SSE
// /events/extras carry only that state; GET/PUT /api/integrations is the studio's view of the settings, with secrets
// write-only.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Arc, Mutex, PoisonError, Weak};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

use crate::calendar::Calendar;
use crate::guarded_net::GuardedClient;
use crate::http::{self, Req};
use crate::integrations::IntegrationsStore;
use crate::obs::Obs;
use crate::request_guard::config_write_refusal;
use crate::streaming;
use crate::twitch::{auth::Endpoints, Twitch};
use crate::json::{parse as parse_json, stringify};
use crate::{sse, supervisor, App};

const MAX_INTEGRATIONS_BYTES: usize = 16 * 1024;
/// A save with a `streaming` section may be longer: 64 scenes' looks at their longest.
const MAX_STREAMING_BYTES: usize = 32 * 1024;

/// The open /events/extras streams by id, and the next id.
#[derive(Default)]
struct Listeners {
    next: u64,
    open: BTreeMap<u64, mpsc::UnboundedSender<Bytes>>,
}

/// OBS, the calendar, Twitch and the agents' sessions as the kiosks see them, and the stored integrations that drive the first three.
pub struct Extras {
    pub integrations: Arc<IntegrationsStore>,
    obs: Arc<Obs>,
    calendar: Arc<Calendar>,
    twitch: Arc<Twitch>,
    agents: Box<dyn Fn() -> Value + Send + Sync>,
    listeners: Mutex<Listeners>,
}

/// A stream's place in the listeners; dropped with the stream.
struct Listener {
    extras: Arc<Extras>,
    id: u64,
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.extras.listeners.lock().unwrap_or_else(PoisonError::into_inner).open.remove(&self.id);
    }
}

impl Extras {
    /// The extras over the integrations in `file`, with Twitch at `twitch`. `agents` returns the agents' public state
    /// (`{ sessions, plan, usage }`).
    pub fn new(file: &Path, twitch: Endpoints, agents: impl Fn() -> Value + Send + Sync + 'static) -> Result<Arc<Self>, String> {
        let integrations = Arc::new(IntegrationsStore::load(file));
        let client = GuardedClient::new(false)?;
        let twitch_client = client.clone();
        let extras = Arc::new_cyclic(|weak: &Weak<Self>| {
            let publish: Arc<dyn Fn() + Send + Sync> = {
                let weak = weak.clone();
                Arc::new(move || {
                    if let Some(extras) = weak.upgrade() {
                        extras.publish();
                    }
                })
            };
            let obs = Obs::with_streaming({
                let integrations = Arc::clone(&integrations);
                move || integrations.get().obs
            }, integrations.get().streaming.obs, {
                let publish = Arc::clone(&publish);
                move || publish()
            });
            let twitch = Twitch::new(twitch, twitch_client, integrations.get().streaming.twitch, {
                let integrations = Arc::clone(&integrations);
                move |auth| {
                    if let Err(e) = integrations.set_twitch_auth(auth) {
                        log::error!(target: "server", "saving the Twitch sign-in failed: {e}");
                    }
                }
            }, {
                let publish = Arc::clone(&publish);
                move || publish()
            });
            let calendar = Calendar::new(client, {
                let integrations = Arc::clone(&integrations);
                move || integrations.get().links
            }, move || publish());
            Self { integrations: Arc::clone(&integrations), obs, calendar, twitch, agents: Box::new(agents), listeners: Mutex::new(Listeners::default()) }
        });
        integrations.subscribe({
            let (obs, calendar, twitch) = (Arc::clone(&extras.obs), Arc::clone(&extras.calendar), Arc::clone(&extras.twitch));
            move |next, prev| {
                if next.streaming.twitch.channel != prev.streaming.twitch.channel {
                    twitch.set_channel(&next.streaming.twitch.channel);
                }
                if next.obs != prev.obs {
                    obs.reconfigure();
                }
                obs.set_streaming(next.streaming.obs.clone());
                if next.links != prev.links {
                    calendar.reconfigure();
                }
            }
        });
        Ok(extras)
    }

    pub fn obs(&self) -> &Arc<Obs> {
        &self.obs
    }

    pub fn twitch(&self) -> &Arc<Twitch> {
        &self.twitch
    }

    /// The state kiosks get: `{ obs, calendar, agents, twitch }`.
    pub fn state(&self) -> Value {
        json!({ "obs": self.obs.json(), "calendar": self.calendar.state(), "agents": (self.agents)(), "twitch": self.twitch.status() })
    }

    /// Sends the full state to every open stream.
    pub fn publish(&self) {
        let event = sse::event(&stringify(&self.state()));
        self.listeners.lock().unwrap_or_else(PoisonError::into_inner).open.retain(|_, tx| tx.send(event.clone()).is_ok());
    }

    /// A stream's receiver, with the state now already queued, and the registration to drop.
    fn listen(self: &Arc<Self>) -> (mpsc::UnboundedReceiver<Bytes>, Listener) {
        let (tx, rx) = mpsc::unbounded_channel();
        let _ = tx.send(sse::event(&stringify(&self.state())));
        let mut listeners = self.listeners.lock().unwrap_or_else(PoisonError::into_inner);
        let id = listeners.next;
        listeners.next += 1;
        listeners.open.insert(id, tx);
        (rx, Listener { extras: Arc::clone(self), id })
    }

    /// Starts the OBS connection, the calendar refresh and Twitch's chat and viewers, each under the supervisor.
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> [JoinHandle<()>; 4] {
        let (obs, calendar) = (Arc::clone(&self.obs), Arc::clone(&self.calendar));
        let [chat, viewers] = self.twitch.start(shutdown);
        [
            chat,
            viewers,
            supervisor::spawn("obs", shutdown.clone(), move || {
                let obs = Arc::clone(&obs);
                async move { obs.run().await }
            }),
            supervisor::spawn("calendar", shutdown.clone(), move || {
                let calendar = Arc::clone(&calendar);
                async move { calendar.run().await }
            }),
        ]
    }
}

/// GET /api/extras → the state; any other method 405.
pub fn handle_extras(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    http::json(200, &app.extras.state())
}

/// /events/extras: the state now, then each change.
pub fn handle_events(app: &App) -> Response<Body> {
    let (rx, listener) = app.extras.listen();
    let client = app.debug.sse_open("extras");
    sse::response(rx, app.shutdown.clone(), Box::new((listener, client)))
}

/// GET /api/integrations → the OBS and calendar settings without their secrets; PUT with a patch → the same. Writes need
/// the config write header.
pub async fn handle_integrations(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let extras = &app.extras;
    if req.method == Method::GET {
        return Ok(http::json(200, &extras.integrations.public()));
    }
    if req.method != Method::PUT {
        return Ok(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return Ok(response);
    }
    if let Some(refusal) = config_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-config").as_deref()) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_STREAMING_BYTES).await {
        Ok(body) if body.is_empty() => Some(json!({})),
        // Past the plain cap only a patch that has a `streaming` section is taken; anything else is cut off as before.
        Ok(body) if body.len() > MAX_INTEGRATIONS_BYTES && !body.contains("\"streaming\"") => {
            return Ok(http::closing(http::text(400, "expected a JSON object")));
        }
        Ok(body) => parse_json(&body),
        Err(http::BodyRefused) => return Ok(http::closing(http::text(400, "expected a JSON object"))),
    };
    let Some(mut patch) = body else {
        return Ok(http::text(400, "expected a JSON object"));
    };
    // The looks of scenes OBS no longer has are not kept.
    if let Some(known) = extras.obs().scene_ids() {
        streaming::prune_patch(&mut patch, &known);
    }
    Ok(match extras.integrations.apply(&patch)? {
        Ok(()) => http::json(200, &extras.integrations.public()),
        Err(message) => http::text(400, message),
    })
}
