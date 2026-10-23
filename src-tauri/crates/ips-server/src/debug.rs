// DASHBOARD_DEBUG=1 support (server/debug.mjs): request and SSE logging. The SSE clients are counted either way, for
// GET /api/server/stats.

use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use std::time::Instant;

use axum::body::{Body, Bytes};
use http_body::{Frame, SizeHint};
use axum::http::Response;

#[derive(Default)]
pub struct Debug {
    pub enabled: bool,
    /// Open SSE streams per channel, in the order the channels first opened.
    clients: Mutex<Vec<(&'static str, i64)>>,
}

impl Debug {
    pub fn new(enabled: bool) -> Arc<Self> {
        Arc::new(Self { enabled, clients: Mutex::default() })
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
        SseClient { debug: Arc::clone(self), channel }
    }

    /// Open SSE connections across all channels.
    pub fn sse_clients_total(&self) -> i64 {
        self.clients.lock().unwrap().iter().map(|(_, n)| n).sum()
    }

    /// Open SSE connections on `channel`.
    pub fn sse_clients(&self, channel: &str) -> i64 {
        self.clients.lock().unwrap().iter().find(|(c, _)| *c == channel).map_or(0, |(_, n)| *n)
    }

    /// The request log line once `response` has been sent (or its client went away): with debug on only.
    pub fn log_request(&self, method: &str, url: &str, response: Response<Body>) -> Response<Body> {
        if !self.enabled {
            return response;
        }
        let status = response.status().as_u16();
        let line = format!("[debug] {method} {url} {status}");
        response.map(|body| Body::new(Logged { inner: body, line, start: Instant::now() }))
    }
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

    fn poll_frame(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Result<Frame<Bytes>, Self::Error>>> {
        Pin::new(&mut self.inner).poll_frame(cx)
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}
