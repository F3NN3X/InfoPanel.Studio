// A request as the Node handlers see it (`req.headers`, `req.url`, the WHATWG pathname and query, the peer address)
// and the responses they write (`send`: a type, `Cache-Control: no-store` and a body).

use std::convert::Infallible;

use axum::body::{to_bytes, Body, Bytes};
use axum::http::{HeaderMap, HeaderValue, Method, Response, StatusCode};

use crate::json;
use serde_json::Value;

pub const JSON_TYPE: &str = "application/json; charset=utf-8";
pub const TEXT_TYPE: &str = "text/plain; charset=utf-8";

/// Headers Node keeps the first of when a request repeats them; any other repeated header is joined with ", ".
const SINGLE_HEADERS: [&str; 18] = [
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "server",
    "user-agent",
];

/// A header value as Node reads it (Latin-1).
fn latin1(value: &HeaderValue) -> String {
    value.as_bytes().iter().map(|&b| b as char).collect()
}

/// `req.headers[name]` (`name` lowercase).
pub fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    let mut values = headers.get_all(name).iter();
    let first = latin1(values.next()?);
    if SINGLE_HEADERS.contains(&name) {
        return Some(first);
    }
    Some(values.fold(first, |acc, v| format!("{acc}, {}", latin1(v))))
}

/// One request: what the route handlers read.
pub struct Req {
    pub method: Method,
    pub headers: HeaderMap,
    /// The peer's IP address as Node prints it (`::ffff:127.0.0.1` for IPv4 on a dual-stack socket).
    pub peer: String,
    /// The request target as sent (`req.url`).
    pub url: String,
    /// `new URL(req.url, "http://localhost").pathname`, still percent-encoded.
    pub path: String,
    /// Its `.search` (`?...`, or empty).
    pub search: String,
    pub body: Body,
}

impl Req {
    pub fn header(&self, name: &str) -> Option<String> {
        header(&self.headers, name)
    }

    /// `searchParams.get(name)`.
    pub fn query(&self, name: &str) -> Option<String> {
        let query = self.search.strip_prefix('?').unwrap_or(&self.search);
        url::form_urlencoded::parse(query.as_bytes()).find(|(k, _)| k == name).map(|(_, v)| v.into_owned())
    }

    pub fn is_loopback(&self) -> bool {
        crate::request_guard::is_loopback(Some(&self.peer))
    }

    /// The body as UTF-8 text (invalid bytes read as U+FFFD), or `Err` when it is over `limit` bytes or breaks off.
    pub async fn read_body(&mut self, limit: usize) -> Result<String, ()> {
        let body = std::mem::take(&mut self.body);
        let bytes = to_bytes(body, limit).await.map_err(|_| ())?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }
}

/// `send(res, status, body, type)`. Node writes the head before the body, so the body goes chunked, without a length.
pub fn send(status: u16, body: impl Into<Bytes>, content_type: &str) -> Response<Body> {
    Response::builder()
        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR))
        .header("Content-Type", content_type)
        .header("Cache-Control", "no-store")
        .body(chunked(body))
        .unwrap_or_default()
}

/// A body sent chunked, without a length, as Node sends one written after its head.
pub fn chunked(body: impl Into<Bytes>) -> Body {
    let body: Bytes = body.into();
    Body::from_stream(futures_util::stream::once(async move { Ok::<_, Infallible>(body) }))
}

/// `send(res, status, message)`: plain text.
pub fn text(status: u16, message: impl Into<String>) -> Response<Body> {
    send(status, message.into(), TEXT_TYPE)
}

/// `send(res, status)`: plain text, no body.
pub fn empty(status: u16) -> Response<Body> {
    send(status, Bytes::new(), TEXT_TYPE)
}

/// `send(res, status, JSON.stringify(value), JSON)`.
pub fn json(status: u16, value: &Value) -> Response<Body> {
    send(status, json::stringify(value), JSON_TYPE)
}

/// A body read that failed (over the limit or broken off): Node destroys the socket, so this one is closed too.
pub fn closing(mut response: Response<Body>) -> Response<Body> {
    response.headers_mut().insert("Connection", HeaderValue::from_static("close"));
    response
}
