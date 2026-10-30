// The touch panels' message feed (experimental touch), GET /events/touch?panel=<id>: the app's touch engine publishes
// each panel's messages as JSON, and every kiosk page showing that panel gets them as events. A panel's last setup and
// last status are kept and sent first to a new subscriber, so a page that (re)connects knows straight away how to read
// the touches and whether its touchscreen is there. This computer only: a touch stream on the network would show
// every touch to anyone who asks.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use tokio::sync::mpsc;

use crate::http::{self, Req};
use crate::{sse, App};

/// The feed the app publishes to and the server streams from; it outlives server restarts.
pub static HUB: LazyLock<Arc<TouchHub>> = LazyLock::new(Arc::default);

/// Which of a panel's messages are kept for later subscribers, sent in this order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Keep {
    /// The panel's setup: its size and the kiosk's touch settings.
    Setup,
    /// The device's last status.
    Status,
}

#[derive(Default)]
struct Panel {
    setup: Option<Bytes>,
    status: Option<Bytes>,
    subscribers: Vec<mpsc::UnboundedSender<Bytes>>,
}

#[derive(Default)]
pub struct TouchHub {
    panels: Mutex<HashMap<String, Panel>>,
}

impl TouchHub {
    /// Sends `data` (one message's JSON) to every subscriber of `panel`, keeping it for later ones when `keep` says so.
    pub fn publish(&self, panel: &str, data: &str, keep: Option<Keep>) {
        let event = sse::event(data);
        let mut panels = self.panels.lock().unwrap_or_else(|e| e.into_inner());
        let entry = panels.entry(panel.to_owned()).or_default();
        match keep {
            Some(Keep::Setup) => entry.setup = Some(event.clone()),
            Some(Keep::Status) => entry.status = Some(event.clone()),
            None => {}
        }
        entry
            .subscribers
            .retain(|tx| tx.send(event.clone()).is_ok());
    }

    /// A new subscriber to `panel`'s messages, starting with its kept setup and status.
    pub fn subscribe(&self, panel: &str) -> mpsc::UnboundedReceiver<Bytes> {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut panels = self.panels.lock().unwrap_or_else(|e| e.into_inner());
        let entry = panels.entry(panel.to_owned()).or_default();
        for kept in [&entry.setup, &entry.status].into_iter().flatten() {
            let _ = tx.send(kept.clone());
        }
        entry.subscribers.push(tx);
        rx
    }

    /// How many pages are subscribed to `panel` (closed ones are counted until the next publish).
    pub fn subscribers(&self, panel: &str) -> usize {
        let panels = self.panels.lock().unwrap_or_else(|e| e.into_inner());
        panels.get(panel).map_or(0, |p| p.subscribers.len())
    }
}

/// A panel id as touch.json allows it: letters, digits and `-`.
fn valid_panel(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// GET /events/touch?panel=<id> → that panel's touch messages, from this computer only.
pub fn handle_events(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    if !req.is_loopback() {
        return http::text(403, "The touch stream is for this computer only.");
    }
    let Some(panel) = req.query("panel").filter(|p| valid_panel(p)) else {
        return http::text(
            400,
            "Name the touch panel: ?panel=<id>, letters, digits and -.",
        );
    };
    let client = app.debug.sse_open("touch");
    sse::response(
        HUB.subscribe(&panel),
        app.shutdown.clone(),
        Box::new(client),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(b: Bytes) -> String {
        String::from_utf8(b.to_vec()).unwrap()
    }

    #[test]
    fn a_subscriber_gets_the_kept_setup_and_status_first_then_only_its_own_panel() {
        let hub = TouchHub::default();
        hub.publish("a", r#"{"status":"Disconnected"}"#, Some(Keep::Status));
        hub.publish("a", r#"{"setup":{}}"#, Some(Keep::Setup));
        hub.publish("a", r#"{"type":"Pointer"}"#, None);
        let mut a = hub.subscribe("a");
        let mut b = hub.subscribe("b");
        assert_eq!(
            text(a.try_recv().unwrap()),
            "data: {\"setup\":{}}\n\n",
            "setup first"
        );
        assert_eq!(
            text(a.try_recv().unwrap()),
            "data: {\"status\":\"Disconnected\"}\n\n"
        );
        assert!(
            a.try_recv().is_err(),
            "a pointer before subscribing is not replayed"
        );
        assert!(b.try_recv().is_err(), "nothing kept for b");

        hub.publish("a", r#"{"type":"Gesture"}"#, None);
        assert_eq!(
            text(a.try_recv().unwrap()),
            "data: {\"type\":\"Gesture\"}\n\n"
        );
        assert!(b.try_recv().is_err(), "b hears nothing from a");
    }

    #[test]
    fn a_newer_message_replaces_the_kept_one_and_closed_subscribers_go() {
        let hub = TouchHub::default();
        hub.publish("a", "1", Some(Keep::Status));
        hub.publish("a", "2", Some(Keep::Status));
        let mut late = hub.subscribe("a");
        assert_eq!(text(late.try_recv().unwrap()), "data: 2\n\n");
        assert!(late.try_recv().is_err());

        drop(hub.subscribe("a"));
        assert_eq!(hub.subscribers("a"), 2);
        hub.publish("a", "3", None);
        assert_eq!(hub.subscribers("a"), 1);
    }

    #[test]
    fn panel_ids_are_what_touch_json_allows() {
        assert!(valid_panel("panel-1"));
        assert!(valid_panel("virtual-2"));
        for bad in ["", "a b", "../x", "a%20b", &"x".repeat(65)] {
            assert!(!valid_panel(bad), "{bad}");
        }
    }
}
