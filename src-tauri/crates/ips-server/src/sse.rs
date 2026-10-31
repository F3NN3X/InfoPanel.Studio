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

struct Latest {
    rx: watch::Receiver<Bytes>,
    first: bool,
    keep_alive: Interval,
    shutdown: watch::Receiver<bool>,
    _guards: Box<dyn Any + Send>,
}

/// Like `response`, for a state where only the newest matters: the stream sends the value `rx` holds now, then each
/// newer one. A reader that falls behind skips the values in between, so nothing queues up for it.
pub fn latest_response(rx: watch::Receiver<Bytes>, shutdown: watch::Receiver<bool>, guards: Box<dyn Any + Send>) -> Response<Body> {
    let state = Latest { rx, first: true, keep_alive: interval_at(Instant::now() + KEEP_ALIVE, KEEP_ALIVE), shutdown, _guards: guards };
    let body = futures_util::stream::unfold(state, |mut s| async move {
        let next = if std::mem::take(&mut s.first) {
            Some(s.rx.borrow_and_update().clone())
        } else {
            tokio::select! {
                _ = s.shutdown.wait_for(|stop| *stop) => None,
                changed = s.rx.changed() => changed.ok().map(|()| s.rx.borrow_and_update().clone()),
                _ = s.keep_alive.tick() => Some(Bytes::from_static(b": keep-alive\n\n")),
            }
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

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    #[tokio::test]
    async fn a_reader_that_fell_behind_gets_only_the_newest_value() {
        let (tx, rx) = watch::channel(event("1"));
        let (_stop, shutdown) = watch::channel(false);
        let mut body = latest_response(rx, shutdown, Box::new(())).into_body().into_data_stream();
        tx.send_replace(event("2"));
        tx.send_replace(event("3"));
        assert_eq!(body.next().await.unwrap().unwrap(), event("3"), "the current one first, with 1 and 2 skipped");
        tx.send_replace(event("4"));
        assert_eq!(body.next().await.unwrap().unwrap(), event("4"));
    }
}
