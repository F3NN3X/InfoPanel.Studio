// The event streams (`/events/*`): `data: <JSON>\n\n` per event, a `: keep-alive` comment every 15 s, open until the
// client goes away or the server stops.

use std::any::Any;
use std::convert::Infallible;
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::http::Response;
use tokio::sync::{mpsc, watch};
use tokio::time::{interval_at, Instant, Interval};

const KEEP_ALIVE: Duration = Duration::from_secs(15);

/// One event's bytes.
pub fn event(data: &str) -> Bytes {
    Bytes::from(format!("data: {data}\n\n"))
}

struct Stream {
    rx: mpsc::UnboundedReceiver<Bytes>,
    keep_alive: Interval,
    shutdown: watch::Receiver<bool>,
    /// Whatever must live as long as the stream (its client count, its listener registration).
    _guards: Box<dyn Any + Send>,
}

/// The stream's response: the events sent on `rx`, then keep-alives, until the client closes or `shutdown` is set.
pub fn response(rx: mpsc::UnboundedReceiver<Bytes>, shutdown: watch::Receiver<bool>, guards: Box<dyn Any + Send>) -> Response<Body> {
    let state = Stream { rx, keep_alive: interval_at(Instant::now() + KEEP_ALIVE, KEEP_ALIVE), shutdown, _guards: guards };
    let body = futures_util::stream::unfold(state, |mut s| async move {
        let next = tokio::select! {
            _ = s.shutdown.wait_for(|stop| *stop) => None,
            event = s.rx.recv() => event,
            _ = s.keep_alive.tick() => Some(Bytes::from_static(b": keep-alive\n\n")),
        };
        next.map(|bytes| (Ok::<_, Infallible>(bytes), s))
    });
    Response::builder()
        .status(200)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-store")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(body))
        .unwrap_or_default()
}
