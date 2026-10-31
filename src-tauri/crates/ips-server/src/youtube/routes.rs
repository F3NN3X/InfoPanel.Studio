// The YouTube routes: /api/youtube/signin (POST starts, GET shows what is pending), /api/youtube/signout and the
// /api/youtube/callback Google sends the browser back to. The writes are guarded like Twitch's. The callback is a plain GET
// navigation (no header can be added to it), so it is answered to this machine only and only for the state we issued.
// Nothing here carries a token.

use axum::body::Body;
use axum::http::{HeaderValue, Method, Response};
use serde_json::json;

use super::{CallbackError, SigninError};
use crate::http::{self, Req};
use crate::security_headers::security_headers;
use crate::twitch::routes::guarded_body;
use crate::App;

/// GET /api/youtube/signin → `{ pending: { auth_url, expires_at } | null, error }`, for this machine only (or with remote
/// editing on).
/// POST /api/youtube/signin → `{ authUrl }`, the Google page to open; 400 while the client isn't entered; 409 while a sign-in
/// is under way.
pub async fn handle_signin(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method == Method::GET {
        // The sign-in address holds the state that proves a callback is ours: not for a kiosk on the LAN.
        if let Some(response) = app.refuse_remote_edit(&req) {
            return Ok(response);
        }
        return Ok(http::json(200, &app.extras.youtube().pending_json()));
    }
    if let Err(response) = guarded_body(app, &mut req).await {
        return Ok(response);
    }
    Ok(match app.extras.youtube().signin(app.port) {
        Ok(url) => http::json(200, &json!({ "authUrl": url })),
        Err(SigninError::NotConfigured) => {
            http::text(400, "Enter the Client ID and the client secret first.")
        }
        Err(SigninError::Busy) => http::text(409, "A sign-in is already under way."),
        Err(SigninError::Failed(message)) => http::text(500, message),
    })
}

/// POST /api/youtube/signout → 204: ends a sign-in under way, or signs out and forgets the tokens.
pub async fn handle_signout(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if let Err(response) = guarded_body(app, &mut req).await {
        return Ok(response);
    }
    app.extras.youtube().signout();
    Ok(http::empty(204))
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// A small page for the browser tab Google sent back: no scripts, no external resources, this server's security headers.
fn page(status: u16, heading: &str, message: &str) -> Response<Body> {
    let html = format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{title}</title>\
         <style>body{{font:16px/1.5 system-ui,sans-serif;background:#16181d;color:#e8eaee;display:grid;place-items:center;min-height:100vh;margin:0}}main{{max-width:30rem;padding:2rem;text-align:center}}h1{{font-size:1.25rem;margin:0 0 .5rem}}p{{margin:0;color:#aab0bb}}</style></head>\
         <body><main><h1>{title}</h1><p>{message}</p></main></body></html>",
        title = escape(heading),
        message = escape(message),
    );
    let mut response = http::send(status, html, "text/html; charset=utf-8");
    for (name, value) in security_headers(true, "") {
        if let Ok(value) = HeaderValue::from_str(&value) {
            response.headers_mut().insert(name, value);
        }
    }
    response
}

/// GET /api/youtube/callback?code&state (or ?error&state): finishes the sign-in. 403 from another machine; 400 for a state
/// that isn't the pending one; otherwise a page that says how it went.
pub async fn handle_callback(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::GET {
        return Ok(http::empty(405));
    }
    if !req.is_loopback() {
        return Ok(http::text(
            403,
            "The YouTube sign-in finishes on the PC running InfoPanel Studio.",
        ));
    }
    let (code, state, error) = (req.query("code"), req.query("state"), req.query("error"));
    Ok(
        match app
            .extras
            .youtube()
            .callback(code.as_deref(), state.as_deref(), error.as_deref())
            .await
        {
            Ok(()) => page(200, "Signed in to YouTube — you can close this tab", ""),
            Err(CallbackError::Invalid) => page(
                400,
                "This sign-in link isn't valid",
                "Start the sign-in again from Settings in InfoPanel Studio.",
            ),
            Err(CallbackError::Declined(message)) => {
                page(200, "YouTube sign-in was not completed", &message)
            }
            Err(CallbackError::Failed(message)) => page(502, "YouTube sign-in failed", &message),
        },
    )
}
