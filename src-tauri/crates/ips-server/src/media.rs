// The media keys (pinned layer P6, decision 10): POST /api/media/act `{ "key": "play-pause" | "next" | "previous" }` presses
// that media key on this PC, as a keyboard's would, so whatever player Windows routes media keys to answers. It is the
// touch actions' `media` op, guarded as the audio and OBS writes are: another machine only with remote editing on, the
// control header, JSON. No other key can be named, and nothing else is read or sent. Elsewhere than Windows it answers 503.

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::Value;

use crate::http::{self, Req};
use crate::request_guard::control_write_refusal;
use crate::App;

const MAX_BODY_BYTES: usize = 1024;

/// A media key the route presses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKey {
    PlayPause,
    Next,
    Previous,
}

/// Reads a request body: a JSON object whose `key` is one of the three.
pub fn parse(body: &str) -> Result<MediaKey, String> {
    let body: Value = serde_json::from_str(body).map_err(|_| "expected a JSON object".to_string())?;
    match body.as_object().and_then(|o| o.get("key")).and_then(Value::as_str) {
        Some("play-pause") => Ok(MediaKey::PlayPause),
        Some("next") => Ok(MediaKey::Next),
        Some("previous") => Ok(MediaKey::Previous),
        _ if !body.is_object() => Err("expected a JSON object".into()),
        _ => Err("\"key\" must be play-pause, next or previous".into()),
    }
}

/// Presses and lifts the key; false when the system took neither (no desktop to send to).
#[cfg(windows)]
fn press(key: MediaKey) -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK,
        VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
    };
    let vk = match key {
        MediaKey::PlayPause => VK_MEDIA_PLAY_PAUSE,
        MediaKey::Next => VK_MEDIA_NEXT_TRACK,
        MediaKey::Previous => VK_MEDIA_PREV_TRACK,
    };
    let input = |flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: KEYEVENTF_EXTENDEDKEY | flags, time: 0, dwExtraInfo: 0 } },
    };
    let inputs = [input(0), input(KEYEVENTF_KEYUP)];
    // SAFETY: a plain Win32 call over an array that outlives it, with its true length and element size.
    let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
    sent as usize == inputs.len()
}

#[cfg(not(windows))]
fn press(_key: MediaKey) -> bool {
    false
}

/// POST /api/media/act.
pub async fn handle_act(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return Ok(response);
    }
    if let Some(refusal) = control_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-control").as_deref()) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_BODY_BYTES).await {
        Ok(body) => body,
        Err(http::BodyRefused) => return Ok(http::closing(http::text(400, "expected a JSON object"))),
    };
    let key = match parse(&body) {
        Ok(key) => key,
        Err(message) => return Ok(http::text(400, message)),
    };
    Ok(if press(key) { http::empty(204) } else { http::text(503, "media keys aren't available") })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_three_keys_and_nothing_else() {
        assert_eq!(parse(r#"{"key":"play-pause"}"#), Ok(MediaKey::PlayPause));
        assert_eq!(parse(r#"{"key":"next"}"#), Ok(MediaKey::Next));
        assert_eq!(parse(r#"{"key":"previous"}"#), Ok(MediaKey::Previous));
        for bad in [r#"{"key":"volume-up"}"#, r#"{"key":"PLAY-PAUSE"}"#, r#"{"key":1}"#, "{}"] {
            assert_eq!(parse(bad), Err("\"key\" must be play-pause, next or previous".into()), "{bad}");
        }
        for bad in ["", "[]", r#""next""#, "{"] {
            assert_eq!(parse(bad), Err("expected a JSON object".into()), "{bad}");
        }
    }
}
