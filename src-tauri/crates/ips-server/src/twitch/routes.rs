// The Twitch routes: POST /api/twitch/signin and /signout, GET /api/chat and the SSE /events/chat (both platforms' chat, from
// the chat hub), POST /api/chat/send (to Twitch or YouTube). A write is refused from other machines (unless remote editing is on) and needs the control marker header, like the audio and
// OBS writes. Nothing here carries a token.

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Value};

use super::{SendError, SigninError};
use crate::http::{self, Req};
use crate::json::parse as parse_json;
use crate::request_guard::control_write_refusal;
use crate::youtube::SendError as YoutubeSendError;
use crate::{sse, App};

const MAX_BODY_BYTES: usize = 4 * 1024;

/// The body of a guarded POST, or the response that refuses it.
#[allow(clippy::result_large_err)]
pub(crate) async fn guarded_body(app: &App, req: &mut Req) -> Result<String, Response<Body>> {
    if req.method != Method::POST {
        return Err(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(req) {
        return Err(response);
    }
    if let Some(refusal) = control_write_refusal(
        req.header("content-type").as_deref(),
        req.header("x-dashboard-control").as_deref(),
    ) {
        return Err(http::text(refusal.status, refusal.message));
    }
    req.read_body(MAX_BODY_BYTES)
        .await
        .map_err(|http::BodyRefused| http::closing(http::text(400, "expected a JSON object")))
}

/// GET /api/twitch/signin → `{ pending: { user_code, verification_uri, expires_at } | null, error }`, for this machine only (or
/// with remote editing on).
/// POST /api/twitch/signin → `{ user_code, verification_uri, expires_in }` once Twitch has handed out a code; 409 while a
/// sign-in is under way; 502 when Twitch can't be reached.
pub async fn handle_signin(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method == Method::GET {
        // The code to approve is shown to this machine only (and to remote editors): a kiosk on the LAN must not see it.
        if let Some(response) = app.refuse_remote_edit(&req) {
            return Ok(response);
        }
        return Ok(http::json(200, &app.extras.twitch().pending_json()));
    }
    if let Err(response) = guarded_body(app, &mut req).await {
        return Ok(response);
    }
    Ok(match app.extras.twitch().signin().await {
        Ok(code) => http::json(
            200,
            &json!({ "user_code": code.user_code, "verification_uri": code.verification_uri, "expires_in": code.expires_in }),
        ),
        Err(SigninError::Cancelled) => http::text(409, "The sign-in was cancelled."),
        Err(SigninError::Busy) => http::text(409, "A sign-in is already under way."),
        Err(SigninError::Failed(message)) => http::text(502, message),
    })
}

/// POST /api/twitch/signout → 204: ends a sign-in under way, or signs out and forgets the tokens.
pub async fn handle_signout(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if let Err(response) = guarded_body(app, &mut req).await {
        return Ok(response);
    }
    app.extras.twitch().signout();
    Ok(http::empty(204))
}

/// GET /api/chat → the chat; any other method 405.
pub fn handle_chat(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    http::json(200, &app.extras.chat().json())
}

/// /events/chat: the chat now, then the newest after each change (a reader that falls behind skips the ones between).
pub fn handle_chat_events(app: &App) -> Response<Body> {
    let rx = app.extras.chat().listen();
    let client = app.debug.sse_open("chat");
    sse::latest_response(rx, app.shutdown.clone(), Box::new(client))
}

/// POST /api/chat/send `{ platform: "twitch" | "youtube", text }` → 204 once the message is on its way; 400 for a body that is
/// not a message (or text that isn't 1 to 500 characters on one line, 200 for YouTube); 503 while the chat isn't connected
/// (YouTube: not signed in or not live); 429 past 20 Twitch messages in 30 seconds; 502 when YouTube refuses the message.
pub async fn handle_chat_send(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let body = match guarded_body(app, &mut req).await {
        Ok(body) => body,
        Err(response) => return Ok(response),
    };
    let Some(Value::Object(body)) = parse_json(&body) else {
        return Ok(http::text(400, "expected a JSON object"));
    };
    let platform = body.get("platform").and_then(Value::as_str);
    if !matches!(platform, Some("twitch" | "youtube")) {
        return Ok(http::text(400, "platform: expected \"twitch\" or \"youtube\""));
    }
    let Some(text) = body.get("text").and_then(Value::as_str) else {
        return Ok(http::text(400, "text: expected text"));
    };
    if platform == Some("youtube") {
        return Ok(match app.extras.youtube().send(text).await {
            Ok(()) => http::empty(204),
            Err(YoutubeSendError::Invalid(message)) => http::text(400, message),
            Err(YoutubeSendError::NotLive) => http::text(503, "YouTube chat isn't live."),
            Err(YoutubeSendError::Failed(message)) => http::text(502, message),
        });
    }
    Ok(match app.extras.twitch().send(text) {
        Ok(()) => http::empty(204),
        Err(SendError::Invalid(message)) => http::text(400, message),
        Err(SendError::NotConnected) => http::text(503, "Twitch chat isn't connected."),
        Err(SendError::RateLimited) => {
            http::text(429, "Slow down: Twitch allows 20 messages in 30 seconds.")
        }
    })
}
