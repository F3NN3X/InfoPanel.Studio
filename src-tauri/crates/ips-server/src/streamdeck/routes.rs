// The Stream Deck routes: GET /api/streamdeck and the SSE /events/streamdeck (the state), GET /api/streamdeck/icon (a
// key's icon, which LAN kiosks read too) and POST /api/streamdeck/act. An action is refused from other machines (unless
// remote editing is on) and needs the control marker header, like the other integrations' writes. Turning the
// connection on or off is a PUT /api/integrations of `streaming.streamdeck.enabled`.

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::json;

use super::act::{self, Act};
use super::icon::IconData;
use super::ActError;
use crate::http::{self, Req};
use crate::twitch::routes::guarded_body;
use crate::{sse, App};

/// GET /api/streamdeck → the state; any other method 405.
pub fn handle_state(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    http::json(200, &app.streamdeck.json())
}

/// /events/streamdeck: the state now, then the newest after each change.
pub fn handle_events(app: &App) -> Response<Body> {
    let rx = app.streamdeck.listen();
    let client = app.debug.sse_open("streamdeck");
    sse::latest_response(rx, app.shutdown.clone(), Box::new(client))
}

/// The icon's answer: the bytes, cached for good, when `version` is the icon's; else 404 (not cached).
pub fn icon_response(icon: Option<IconData>, version: Option<&str>) -> Response<Body> {
    match icon {
        Some(icon) if version == Some(icon.version.as_str()) => Response::builder()
            .status(200)
            .header("Content-Type", icon.content_type)
            .header("Cache-Control", "public, max-age=31536000, immutable")
            .body(Body::from(icon.bytes))
            .unwrap_or_default(),
        _ => http::empty(404),
    }
}

/// GET /api/streamdeck/icon?device=<id>&index=<n>&v=<version> → the key's icon on the current page.
pub fn handle_icon(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    let index = req.query("index").and_then(|i| i.parse::<u32>().ok());
    let icon = match (req.query("device"), index) {
        (Some(device), Some(index)) => app.streamdeck.icon(&device, index),
        _ => None,
    };
    icon_response(icon, req.query("v").as_deref())
}

fn refused(error: ActError) -> Response<Body> {
    match error {
        ActError::NoDevice => http::text(404, "There's no such Stream Deck device."),
        ActError::Off => http::text(503, "The Stream Deck connection is off."),
        ActError::NotReady => http::text(503, "The Stream Deck device isn't connected."),
        ActError::Invalid(message) => http::text(400, message),
    }
}

/// POST /api/streamdeck/act → 204 (create: 200 `{ id }`). Needs a JSON body and `X-Dashboard-Control: 1`; 403 from another
/// machine while remote editing is off; 400 for a body that is not an action; 404 for a device not in the registry; 503
/// when the connection is off (pair, press, page) or the device isn't open in the app (press, page).
pub async fn handle_act(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let body = match guarded_body(app, &mut req).await {
        Ok(body) => body,
        Err(response) => return Ok(response),
    };
    let act = match act::parse(&body) {
        Ok(act) => act,
        Err(message) => return Ok(http::text(400, message)),
    };
    let deck = &app.streamdeck;
    let done = match act {
        Act::Press {
            device,
            index,
            down,
        } => deck.press(&device, index, down),
        Act::Page { device, to } => deck.page(&device, to),
        Act::Pair => deck.pair(),
        Act::Create { name, cols, rows } => {
            return Ok(match deck.create(name, cols, rows)? {
                Ok(id) => http::json(200, &json!({ "id": id })),
                Err(error) => refused(error),
            });
        }
        Act::Grid { device, cols, rows } => deck.grid(&device, cols, rows)?,
        Act::Rename { device, name } => deck.rename(&device, name)?,
        Act::Forget { device } => deck.forget(&device).await?,
    };
    Ok(match done {
        Ok(()) => http::empty(204),
        Err(error) => refused(error),
    })
}
