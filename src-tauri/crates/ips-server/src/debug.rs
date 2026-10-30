// DASHBOARD_DEBUG=1 support (server/debug.mjs): request and SSE logging, and GET /api/debug/stats. The SSE clients are
// counted either way, for GET /api/server/stats.
//
// The stats have no V8 numbers here. Against Node's keys: `memory` is `{ rss, virtual }` (bytes) in place of rss and the
// four heap figures; `resources` counts the runtime's `Task`s and `Worker`s and the open `SseClient`s in place of
// Node's handle types; `eventLoopDelayMs` is how late a 10 ms timer fires (a scheduling-delay sample over the last
// ~10 s: p50 and p99; max since start), not the event-loop histogram. `uptimeSeconds` and `sseClients` are as in Node.

use std::collections::VecDeque;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use http_body::{Frame, SizeHint};
use serde_json::{json, Map, Value};
use tokio::sync::watch;

use crate::http::{self, Req};
use crate::{supervisor, App};

const SAMPLE_EVERY: Duration = Duration::from_millis(10);
/// How many scheduling-delay samples the percentiles cover.
const SAMPLES: usize = 1000;

/// The scheduling-delay samples (ms): the latest `SAMPLES`, and the largest since the start.
#[derive(Default)]
struct Delays {
    recent: VecDeque<f64>,
    max: f64,
}

#[derive(Default)]
pub struct Debug {
    pub enabled: bool,
    /// Open SSE streams per channel, in the order the channels first opened.
    clients: Mutex<Vec<(&'static str, i64)>>,
    delays: Mutex<Delays>,
}

impl Debug {
    pub fn new(enabled: bool) -> Arc<Self> {
        Arc::new(Self {
            enabled,
            clients: Mutex::default(),
            delays: Mutex::default(),
        })
    }

    fn count(&self, channel: &'static str, delta: i64) -> i64 {
        let mut clients = self.clients.lock().unwrap();
        match clients.iter_mut().find(|(c, _)| *c == channel) {
            Some((_, n)) => {
                *n += delta;
                *n
            }
            None => {
                clients.push((channel, delta));
                delta
            }
        }
    }

    /// An SSE client connected on `channel`; dropping the result counts it gone.
    pub fn sse_open(self: &Arc<Self>, channel: &'static str) -> SseClient {
        let n = self.count(channel, 1);
        if self.enabled {
            log::info!(target: "server", "[debug] sse connect {channel} ({n} now)");
        }
        SseClient {
            debug: Arc::clone(self),
            channel,
        }
    }

    /// Open SSE connections across all channels.
    pub fn sse_clients_total(&self) -> i64 {
        self.clients.lock().unwrap().iter().map(|(_, n)| n).sum()
    }

    /// Open SSE connections on `channel`.
    pub fn sse_clients(&self, channel: &str) -> i64 {
        self.clients
            .lock()
            .unwrap()
            .iter()
            .find(|(c, _)| *c == channel)
            .map_or(0, |(_, n)| *n)
    }

    /// Samples the scheduling delay until `shutdown` (debug mode only).
    pub fn start_sampler(self: &Arc<Self>, shutdown: watch::Receiver<bool>) {
        if !self.enabled {
            return;
        }
        let debug = Arc::clone(self);
        supervisor::spawn("debug sampler", shutdown, move || {
            let debug = Arc::clone(&debug);
            async move {
                loop {
                    let asked = Instant::now();
                    tokio::time::sleep(SAMPLE_EVERY).await;
                    debug.record_delay(
                        asked.elapsed().saturating_sub(SAMPLE_EVERY).as_secs_f64() * 1000.0,
                    );
                }
            }
        });
    }

    fn record_delay(&self, ms: f64) {
        let mut delays = self.delays.lock().unwrap();
        if delays.recent.len() == SAMPLES {
            delays.recent.pop_front();
        }
        delays.recent.push_back(ms);
        delays.max = delays.max.max(ms);
    }

    /// `{ p50, p99, max }` in ms, rounded to 2 decimals (0 before the first sample).
    fn delay_summary(&self) -> Value {
        let delays = self.delays.lock().unwrap();
        let mut sorted: Vec<f64> = delays.recent.iter().copied().collect();
        sorted.sort_by(f64::total_cmp);
        let percentile = |p: f64| {
            let rank = (sorted.len() as f64 * p / 100.0).ceil() as usize;
            sorted.get(rank.max(1) - 1).copied().unwrap_or(0.0)
        };
        let ms = |v: f64| json!((v * 100.0).round() / 100.0);
        json!({ "p50": ms(percentile(50.0)), "p99": ms(percentile(99.0)), "max": ms(delays.max) })
    }

    /// The numbers behind GET /api/debug/stats.
    pub fn stats(&self, uptime_seconds: u64) -> Value {
        let sse_clients: Map<String, Value> = self
            .clients
            .lock()
            .unwrap()
            .iter()
            .map(|(c, n)| ((*c).to_string(), json!(n)))
            .collect();
        let metrics = tokio::runtime::Handle::current().metrics();
        json!({
            "memory": process_memory(),
            "uptimeSeconds": uptime_seconds,
            "sseClients": sse_clients,
            "resources": { "Task": metrics.num_alive_tasks(), "Worker": metrics.num_workers(), "SseClient": self.sse_clients_total() },
            "eventLoopDelayMs": self.delay_summary(),
        })
    }

    /// The request log line once `response` has been sent (or its client went away): with debug on only.
    pub fn log_request(&self, method: &str, url: &str, response: Response<Body>) -> Response<Body> {
        if !self.enabled {
            return response;
        }
        let status = response.status().as_u16();
        let line = format!("[debug] {method} {url} {status}");
        response.map(|body| {
            Body::new(Logged {
                inner: body,
                line,
                start: Instant::now(),
            })
        })
    }
}

/// This process's resident and virtual memory in bytes.
fn process_memory() -> Value {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let pid = Pid::from_u32(std::process::id());
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing().with_memory(),
    );
    let (rss, virtual_memory) = sys
        .process(pid)
        .map_or((0, 0), |p| (p.memory(), p.virtual_memory()));
    json!({ "rss": rss, "virtual": virtual_memory })
}

/// GET /api/debug/stats → process and SSE numbers; only with DASHBOARD_DEBUG=1, only from this machine.
pub fn handle_stats(app: &App, req: &Req) -> Response<Body> {
    if !app.debug.enabled {
        return http::empty(404);
    }
    if req.method != Method::GET {
        return http::empty(405);
    }
    if !req.is_loopback() {
        return http::text(403, "debug stats are served to this machine only");
    }
    http::json(
        200,
        &app.debug
            .stats(app.started.elapsed().as_secs_f64().round() as u64),
    )
}

/// One open SSE stream on a channel.
pub struct SseClient {
    debug: Arc<Debug>,
    channel: &'static str,
}

impl Drop for SseClient {
    fn drop(&mut self) {
        let n = self.debug.count(self.channel, -1);
        if self.debug.enabled {
            log::info!(target: "server", "[debug] sse disconnect {} ({n} now)", self.channel);
        }
    }
}

/// A response body that logs its request line when it is dropped (sent in full, or the client closed).
struct Logged {
    inner: Body,
    line: String,
    start: Instant,
}

impl Drop for Logged {
    fn drop(&mut self) {
        log::info!(target: "server", "{} {}ms", self.line, self.start.elapsed().as_millis());
    }
}

impl http_body::Body for Logged {
    type Data = Bytes;
    type Error = axum::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Self::Error>>> {
        Pin::new(&mut self.inner).poll_frame(cx)
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}
