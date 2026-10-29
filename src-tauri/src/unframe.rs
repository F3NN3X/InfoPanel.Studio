// Web Page widgets in the studio window show sites that refuse to be framed (X-Frame-Options, CSP `frame-ancestors`),
// as InfoPanel's own top-level WebView2 shows them. WebView2 can't edit a network response's headers (its
// WebResourceRequested can only replace the whole response, fetched again without the frame's cookies), so this uses
// the DevTools protocol's Fetch domain on the window's own webview: every document response pauses there, and one for
// a frame the window's own page embeds directly (a Web Page widget's), from another site, is served again with those
// two headers taken off (`Fetch.fulfillRequest` with the body read by `Fetch.getResponseBody`;
// `Fetch.continueResponse` with new headers leaves Chromium's frame check on the old ones). The browser still makes
// the request itself, so cookies, logins and redirects work as in any frame, and a navigation inside such a frame is
// unframed too. Frames are known by their parents (`Page.getFrameTree`, then `Page.frameAttached` and
// `Page.frameDetached`); a frame whose parent is not the window's main frame, or not known, is left alone, as are the
// window's own page and anything from the app's server or local pages. A browser on another device can't do this; the
// widget asks the server instead (ips-server's frame_check.rs).
//
// The trade-off: a site's own defence against being framed (clickjacking) is switched off for the pages a user puts
// in a Web Page widget, inside this app's window only. A frame inside that page (an ad, or a page framing another
// site to trick a click) keeps the framed site's defence: only the widget's own frame, which the user chose, loses it.
// Nothing else in the site's CSP changes, the window's navigation guard still keeps a framed page from taking over
// the window, and no other browser or app is affected. Windows only; elsewhere `install` does nothing.

use std::collections::HashMap;

use serde_json::{json, Value};
use tauri::Url;

/// The DevTools patterns: document responses, which is what a frame's page is.
#[cfg_attr(not(windows), allow(dead_code))]
fn patterns() -> Value {
    json!({ "patterns": [{ "urlPattern": "*", "resourceType": "Document", "requestStage": "Response" }] })
}

/// The window's frames as the DevTools protocol reports them: its main frame and each frame's parent.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Default)]
pub struct Frames {
    main: Option<String>,
    parents: HashMap<String, String>,
}

#[cfg_attr(not(windows), allow(dead_code))]
impl Frames {
    /// Takes a `Page.getFrameTree` result: the main frame and every frame under it.
    pub fn read_tree(&mut self, tree: &Value) {
        fn walk(frames: &mut Frames, node: &Value, parent: Option<&str>) {
            let Some(id) = node.pointer("/frame/id").and_then(Value::as_str) else { return };
            match parent {
                Some(parent) => frames.attached(id, parent),
                None => frames.main = Some(id.to_string()),
            }
            for child in node.get("childFrames").and_then(Value::as_array).into_iter().flatten() {
                walk(frames, child, Some(id));
            }
        }
        if let Some(root) = tree.get("frameTree") {
            walk(self, root, None);
        }
    }

    pub fn attached(&mut self, frame: &str, parent: &str) {
        self.parents.insert(frame.to_string(), parent.to_string());
    }

    pub fn detached(&mut self, frame: &str) {
        self.parents.remove(frame);
    }

    /// Whether `frame` is one the window's own page embeds directly (a Web Page widget's); false while either the
    /// main frame or the frame's parent is unknown.
    pub fn is_widget_frame(&self, frame: &str) -> bool {
        self.main.as_deref().is_some_and(|main| self.parents.get(frame).is_some_and(|parent| parent == main))
    }
}

/// Whether a paused document response (`Fetch.requestPaused`'s params) is one to unframe: a widget frame's (see
/// `Frames::is_widget_frame`) from a site that is not the app's server or its local pages.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn wants_unframe(params: &Value, frames: &Frames, server_origin: &str) -> bool {
    let Some(frame) = params.get("frameId").and_then(Value::as_str) else { return false };
    let Some(url) = params.pointer("/request/url").and_then(Value::as_str).and_then(|u| Url::parse(u).ok()) else {
        return false;
    };
    frames.is_widget_frame(frame)
        && matches!(url.scheme(), "http" | "https")
        && url.origin().ascii_serialization() != server_origin
        && !crate::nav::is_local_page(&url)
}

fn is_frame_ancestors(directive: &str) -> bool {
    directive.split_ascii_whitespace().next().is_some_and(|name| name.eq_ignore_ascii_case("frame-ancestors"))
}

/// A CSP value without its `frame-ancestors` directives (every policy of it: a value may hold several), or `None`
/// when nothing is left.
fn without_frame_ancestors(csp: &str) -> Option<String> {
    let policies: Vec<String> = csp
        .split([',', '\n'])
        .map(|policy| {
            let kept: Vec<&str> = policy.split(';').map(str::trim).filter(|d| !d.is_empty() && !is_frame_ancestors(d)).collect();
            kept.join("; ")
        })
        .filter(|p| !p.is_empty())
        .collect();
    (!policies.is_empty()).then(|| policies.join(", "))
}

/// The headers (DevTools `{ name, value }` entries) to serve a document again with, without X-Frame-Options and
/// `frame-ancestors`, or `None` when it has neither. The body is re-served decoded, so its encoding and length go too.
pub fn unframed_headers(headers: &[Value]) -> Option<Vec<Value>> {
    let field = |h: &Value, key: &str| h.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    let mut changed = false;
    let mut kept = Vec::new();
    for header in headers {
        let (name, value) = (field(header, "name"), field(header, "value"));
        match name.to_ascii_lowercase().as_str() {
            "x-frame-options" => changed = true,
            "content-security-policy" if value.split([',', '\n', ';']).any(is_frame_ancestors) => {
                changed = true;
                if let Some(policy) = without_frame_ancestors(&value) {
                    kept.push(json!({ "name": name, "value": policy }));
                }
            }
            _ => kept.push(header.clone()),
        }
    }
    changed.then(|| {
        kept.into_iter()
            .filter(|h| !matches!(field(h, "name").to_ascii_lowercase().as_str(), "content-encoding" | "content-length"))
            .collect()
    })
}

#[cfg(windows)]
pub use windows_impl::install;

#[cfg(not(windows))]
pub fn install(_window: &tauri::WebviewWindow, _origin: std::sync::Arc<std::sync::RwLock<String>>) {}

#[cfg(windows)]
mod windows_impl {
    use super::{patterns, unframed_headers, wants_unframe, Frames};
    use base64::Engine;
    use serde_json::{json, Value};
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::sync::{Arc, RwLock};
    use tauri::WebviewWindow;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use webview2_com::{take_pwstr, CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler};
    use windows_core::{HSTRING, PWSTR};

    /// Calls a DevTools method; `then` gets its result object or the error.
    fn cdp(core: &ICoreWebView2, method: &str, params: Value, then: impl FnOnce(&ICoreWebView2, Result<Value, String>) + 'static) {
        let target = core.clone();
        let name = method.to_string();
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, json| {
            let result = match result {
                Ok(()) => serde_json::from_str::<Value>(&json).map_err(|e| e.to_string()),
                Err(e) => Err(format!("{name}: {e} {json}")),
            };
            then(&target, result);
            Ok(())
        }));
        if let Err(e) = unsafe { core.CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params.to_string()), &handler) } {
            log::warn!("could not call {method}: {e}");
        }
    }

    /// Lets a paused request go on as it is. A paused request that is never answered never loads.
    fn go_on(core: &ICoreWebView2, id: &str) {
        cdp(core, "Fetch.continueRequest", json!({ "requestId": id }), |_, result| match result {
            // A frame removed meanwhile cancels its request; that is no error.
            Err(e) if !e.contains("Invalid InterceptionId") => log::warn!("could not continue a document request: {e}"),
            _ => {}
        });
    }

    fn on_paused(core: &ICoreWebView2, params: &Value, frames: &Frames, server_origin: &str) {
        let Some(id) = params.get("requestId").and_then(Value::as_str).map(str::to_string) else { return };
        let status = params.get("responseStatusCode").and_then(Value::as_u64);
        let headers = params.get("responseHeaders").and_then(Value::as_array);
        let unframed = match (status, headers) {
            (Some(_), Some(headers)) if wants_unframe(params, frames, server_origin) => unframed_headers(headers),
            _ => None,
        };
        let (Some(status), Some(headers)) = (status, unframed) else { return go_on(core, &id) };
        let phrase = params.get("responseStatusText").and_then(Value::as_str).filter(|p| !p.is_empty()).map(str::to_string);
        cdp(core, "Fetch.getResponseBody", json!({ "requestId": id }), move |core, result| {
            let body = match result {
                Ok(v) => {
                    let text = v.get("body").and_then(Value::as_str).unwrap_or("");
                    if v.get("base64Encoded").and_then(Value::as_bool) == Some(true) {
                        text.to_string()
                    } else {
                        base64::engine::general_purpose::STANDARD.encode(text)
                    }
                }
                Err(e) => {
                    log::warn!("could not read a framed page: {e}");
                    return go_on(core, &id);
                }
            };
            let mut answer = json!({ "requestId": id, "responseCode": status, "responseHeaders": headers, "body": body });
            if let Some(phrase) = phrase {
                answer["responsePhrase"] = json!(phrase);
            }
            cdp(core, "Fetch.fulfillRequest", answer, move |core, result| {
                if let Err(e) = result {
                    log::warn!("could not serve a framed page: {e}");
                    go_on(core, &id);
                }
            });
        });
    }

    /// Calls `handle` with the params of every `event` the webview reports.
    fn on_event(core: &ICoreWebView2, event: &str, mut handle: impl FnMut(&Value) + 'static) -> windows_core::Result<()> {
        let receiver = unsafe { core.GetDevToolsProtocolEventReceiver(&HSTRING::from(event))? };
        let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut json = PWSTR::null();
            unsafe { args.ParameterObjectAsJson(&mut json)? };
            if let Ok(params) = serde_json::from_str::<Value>(&take_pwstr(json)) {
                handle(&params);
            }
            Ok(())
        }));
        let mut token = 0i64;
        unsafe { receiver.add_DevToolsProtocolEventReceived(&handler, &mut token) }
    }

    /// Unframes the widget frames' documents in `window`'s webview; `origin` is the app's server origin.
    pub fn install(window: &WebviewWindow, origin: Arc<RwLock<String>>) {
        let sent = window.with_webview(move |webview| {
            let Ok(core) = (unsafe { webview.controller().CoreWebView2() }) else { return };
            // Everything here runs on the webview's thread, the events and the method results alike.
            let frames: Rc<RefCell<Frames>> = Rc::default();
            let (attached, detached, paused) = (Rc::clone(&frames), Rc::clone(&frames), Rc::clone(&frames));
            let target = core.clone();
            let watched = on_event(&core, "Page.frameAttached", move |p| {
                if let (Some(frame), Some(parent)) = (p.get("frameId").and_then(Value::as_str), p.get("parentFrameId").and_then(Value::as_str)) {
                    attached.borrow_mut().attached(frame, parent);
                }
            })
            .and_then(|()| {
                on_event(&core, "Page.frameDetached", move |p| {
                    if let Some(frame) = p.get("frameId").and_then(Value::as_str) {
                        detached.borrow_mut().detached(frame);
                    }
                })
            })
            .and_then(|()| {
                on_event(&core, "Fetch.requestPaused", move |p| {
                    let server_origin = origin.read().map(|o| o.clone()).unwrap_or_default();
                    on_paused(&target, p, &paused.borrow(), &server_origin);
                })
            });
            if let Err(e) = watched {
                return log::warn!("could not watch the webview's documents: {e}");
            }
            cdp(&core, "Page.enable", json!({}), |_, result| {
                if let Err(e) = result {
                    log::warn!("could not watch the webview's frames: {e}");
                }
            });
            cdp(&core, "Page.getFrameTree", json!({}), move |_, result| match result {
                Ok(tree) => frames.borrow_mut().read_tree(&tree),
                Err(e) => log::warn!("could not read the webview's frames: {e}"),
            });
            cdp(&core, "Fetch.enable", patterns(), |_, result| {
                if let Err(e) = result {
                    log::warn!("could not watch the webview's documents: {e}");
                }
            });
        });
        if let Err(e) = sent {
            log::warn!("could not reach the webview: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SERVER: &str = "http://127.0.0.1:3922";

    fn paused(url: &str, frame: &str) -> Value {
        json!({ "requestId": "1", "frameId": frame, "request": { "url": url }, "responseStatusCode": 200 })
    }

    /// The window's page MAIN with a widget frame W, which holds a frame G.
    fn frames() -> Frames {
        let mut frames = Frames::default();
        frames.read_tree(&json!({ "frameTree": { "frame": { "id": "MAIN" }, "childFrames": [{ "frame": { "id": "W" } }] } }));
        frames.attached("G", "W");
        frames
    }

    #[test]
    fn unframes_a_widget_frame_from_another_site_and_its_navigations() {
        let frames = frames();
        assert!(wants_unframe(&paused("https://www.vg.no/", "W"), &frames, SERVER));
        assert!(wants_unframe(&paused("https://www.vg.no/sport", "W"), &frames, SERVER));
        assert!(wants_unframe(&paused("http://localhost:3000/d", "W"), &frames, SERVER));
        // A widget added after the tree was read.
        let mut later = frames;
        later.attached("W2", "MAIN");
        assert!(wants_unframe(&paused("https://www.vg.no/", "W2"), &later, SERVER));
    }

    #[test]
    fn leaves_a_frame_inside_a_framed_page_alone() {
        assert!(!wants_unframe(&paused("https://bank.test/", "G"), &frames(), SERVER));
    }

    #[test]
    fn leaves_a_frame_whose_parent_is_unknown_alone() {
        let frames = frames();
        assert!(!wants_unframe(&paused("https://www.vg.no/", "NEW"), &frames, SERVER));
        // Before the main frame is known, nothing is a widget frame.
        let mut early = Frames::default();
        early.attached("W", "MAIN");
        assert!(!wants_unframe(&paused("https://www.vg.no/", "W"), &early, SERVER));
        // A detached frame is forgotten.
        let mut gone = frames;
        gone.detached("W");
        assert!(!wants_unframe(&paused("https://www.vg.no/", "W"), &gone, SERVER));
    }

    #[test]
    fn leaves_the_windows_page_and_the_apps_own_pages_alone() {
        let frames = frames();
        assert!(!wants_unframe(&paused("https://www.vg.no/", "MAIN"), &frames, SERVER));
        assert!(!wants_unframe(&paused("http://127.0.0.1:3922/?kiosk=1", "W"), &frames, SERVER));
        assert!(!wants_unframe(&paused("http://tauri.localhost/start.html", "W"), &frames, SERVER));
        assert!(!wants_unframe(&paused("data:text/html,x", "W"), &frames, SERVER));
        assert!(!wants_unframe(&json!({ "requestId": "1", "request": { "url": "https://a.test/" } }), &frames, SERVER));
    }

    fn entries(pairs: &[(&str, &str)]) -> Vec<Value> {
        pairs.iter().map(|(n, v)| json!({ "name": n, "value": v })).collect()
    }

    #[test]
    fn takes_off_x_frame_options_and_frame_ancestors_only() {
        let headers = entries(&[
            ("Content-Type", "text/html"),
            ("X-Frame-Options", "DENY"),
            ("Content-Security-Policy", "default-src 'self'; FRAME-ANCESTORS 'self' http://localhost:*; img-src *"),
            ("content-encoding", "gzip"),
            ("Content-Length", "123"),
            ("Set-Cookie", "a=1"),
        ]);
        let expected = entries(&[
            ("Content-Type", "text/html"),
            ("Content-Security-Policy", "default-src 'self'; img-src *"),
            ("Set-Cookie", "a=1"),
        ]);
        assert_eq!(unframed_headers(&headers), Some(expected));
    }

    #[test]
    fn drops_a_policy_left_empty_and_keeps_every_other_policy() {
        let headers = entries(&[("content-security-policy", "frame-ancestors 'none'"), ("content-security-policy", "script-src 'self', frame-ancestors 'self'; base-uri 'none'")]);
        assert_eq!(unframed_headers(&headers), Some(entries(&[("content-security-policy", "script-src 'self', base-uri 'none'")])));
    }

    #[test]
    fn leaves_a_page_that_does_not_refuse_framing_alone() {
        assert_eq!(unframed_headers(&entries(&[("Content-Type", "text/html"), ("Content-Security-Policy", "default-src 'self';")])), None);
        assert_eq!(unframed_headers(&[]), None);
    }
}
