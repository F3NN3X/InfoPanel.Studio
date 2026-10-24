// GET /api/image-proxy?url= (the Node server's image proxy): cover art the page cannot load
// itself, relayed from the dashboard's own origin.
//
// Whatever it relays must not be able to run as a page there: only image types go through (406 otherwise), and the
// answer carries `X-Content-Type-Options: nosniff`. SVG is an image type but a script host when opened directly, so it
// is refused too. A plugin's local image server (http on loopback) may send application/octet-stream or no type at
// all; that one type is allowed when the bytes themselves are a png/jpeg/gif/webp/avif image, and the answer then
// carries the sniffed type.
//
// Targets: https anywhere, plain http only on loopback. Redirects are followed by hand (at most three) and every hop
// is checked the same way. An https target that is, or resolves to, a loopback, private, link-local or multicast
// address is refused: the connection goes through the guarded client (guarded_net.rs) with the LAN blocked, so a name
// cannot change its answer after the check. A blocked address, like any network failure, is a 504.

use std::future::Future;
use std::net::IpAddr;
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::http::{HeaderMap, Method, Response, StatusCode};
use futures_util::{Stream, StreamExt};
use tokio::time::{timeout_at, Instant};
use url::{Host, Url};

use crate::guarded_net::{client_builder, describe, GuardedClient, NOT_ALLOWED};
use crate::http::{self, Req};
use crate::js;

pub const MAX_PROXY_BYTES: usize = 25 * 1024 * 1024;
pub const PROXY_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 3;
const LOOPBACK_HOSTS: [&str; 3] = ["localhost", "127.0.0.1", "[::1]"];
/// What the https fetch sends; some image hosts refuse a request without a User-Agent.
const PROXY_HEADERS: [(&str, &str); 2] = [("user-agent", "InfoPanel-Studio"), ("accept", "image/*,*/*;q=0.8")];

/// The ports Node's fetch refuses to connect to (the Fetch standard's "bad ports"), which the loopback path keeps.
const BAD_PORTS: [u16; 82] = [
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
    135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
    995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
];

/// An upstream body, chunk by chunk.
pub type Chunks = Pin<Box<dyn Stream<Item = Result<Bytes, String>> + Send>>;

/// An upstream answer whose head is in.
pub struct Upstream {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Chunks,
}

impl Upstream {
    pub fn of(response: reqwest::Response) -> Self {
        let (status, headers) = (response.status().as_u16(), response.headers().clone());
        let body = futures_util::stream::unfold(Some(response), |state| async move {
            let mut response = state?;
            match response.chunk().await {
                Ok(Some(chunk)) => Some((Ok(chunk), Some(response))),
                Ok(None) => None,
                Err(e) => Some((Err(describe(e)), None)),
            }
        });
        Self { status, headers, body: Box::pin(body) }
    }

    /// `headers.get(name)`.
    pub fn header(&self, name: &str) -> Option<String> {
        http::header(&self.headers, name)
    }

    /// The `Location` of a redirect (300-399 with a non-empty one), or `None`.
    pub fn location(&self) -> Option<String> {
        (300..400).contains(&self.status).then(|| self.header("location")).flatten().filter(|l| !l.is_empty())
    }
}

/// An upstream answer on its way.
pub type Fetching = Pin<Box<dyn Future<Output = Result<Upstream, String>> + Send>>;

/// One GET of a URL: the server's network, or a test's.
pub type Fetch = Arc<dyn Fn(Url) -> Fetching + Send + Sync>;

/// Whether the proxy may fetch `url`: https anywhere, plain http only on loopback.
pub fn is_valid_proxy_target(url: &Url) -> bool {
    url.scheme() == "https" || is_loopback_http(url)
}

fn is_loopback_http(url: &Url) -> bool {
    url.scheme() == "http" && url.host_str().is_some_and(|host| LOOPBACK_HOSTS.contains(&host))
}

/// An https GET that connects only to the addresses `client` allows.
pub async fn guarded_proxy_fetch(client: &GuardedClient, url: &Url) -> Result<Upstream, String> {
    // The client skips the lookup for an IP literal, so it is checked here.
    let literal = match url.host() {
        Some(Host::Ipv4(ip)) => Some(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => Some(IpAddr::V6(ip)),
        _ => None,
    };
    if literal.is_some_and(|ip| client.blocks(ip)) {
        return Err(NOT_ALLOWED.into());
    }
    client.send(url, &PROXY_HEADERS).await.map(Upstream::of)
}

/// Loopback http through `plain` as it is (the client's own headers, and fetch's bad ports refused), anything else
/// through `guarded_proxy_fetch`.
pub fn fetch_with(guarded: GuardedClient, plain: reqwest::Client) -> Fetch {
    Arc::new(move |url: Url| -> Fetching {
        let (guarded, plain) = (guarded.clone(), plain.clone());
        Box::pin(async move {
            if url.scheme() == "http" {
                if url.port_or_known_default().is_some_and(|port| BAD_PORTS.contains(&port)) {
                    return Err("bad port".into());
                }
                return plain.get(url).send().await.map(Upstream::of).map_err(describe);
            }
            guarded_proxy_fetch(&guarded, &url).await
        })
    })
}

/// The server's fetch: the LAN blocked for https.
fn default_fetch() -> Result<Fetch, String> {
    static FETCH: OnceLock<Result<Fetch, String>> = OnceLock::new();
    FETCH
        .get_or_init(|| {
            let plain = client_builder().build().map_err(describe)?;
            Ok(fetch_with(GuardedClient::new(true)?, plain))
        })
        .clone()
}

/// The final upstream answer for `target`, following redirects by hand and checking each hop, or `None` when a hop is
/// refused or there are too many. A network error is `Err`.
pub async fn fetch_proxied(target: Url, fetch: &Fetch) -> Result<Option<Upstream>, String> {
    let mut url = target.clone();
    let mut previous = target;
    for hop in 0..=MAX_REDIRECTS {
        if !is_valid_proxy_target(&url) {
            return Ok(None);
        }
        // A public page must not bounce the proxy to a service on this machine.
        if hop > 0 && is_loopback_http(&url) && !is_loopback_http(&previous) {
            return Ok(None);
        }
        let upstream = fetch(url.clone()).await?;
        previous = url;
        let Some(location) = upstream.location() else { return Ok(Some(upstream)) };
        drop(upstream);
        url = match previous.join(&location) {
            Ok(next) => next,
            Err(_) => return Ok(None),
        };
    }
    Ok(None)
}

/// A media type without its parameters, trimmed and lowercased.
fn essence(header: &str) -> String {
    js::trim(header.split(';').next().unwrap_or("")).to_lowercase()
}

/// Whether an upstream media type may be relayed as it is.
pub fn is_allowed_proxy_type(header: &str) -> bool {
    let t = essence(header);
    let Some(sub) = t.strip_prefix("image/") else { return false };
    !sub.is_empty() && sub.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b".+-".contains(&b)) && t != "image/svg+xml"
}

/// The image type the first bytes of `buf` show, or `None`.
pub fn sniff_image_type(buf: &[u8]) -> Option<&'static str> {
    if buf.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if buf.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if buf.starts_with(b"GIF87a") || buf.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if buf.len() >= 12 && &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if buf.len() >= 12 && &buf[4..8] == b"ftyp" && (&buf[8..12] == b"avif" || &buf[8..12] == b"avis") {
        return Some("image/avif");
    }
    None
}

/// The type to serve for an upstream `content-type` and body, or `None` to refuse (406).
pub fn resolve_proxy_type(header: Option<&str>, body: &[u8]) -> Option<String> {
    let t = essence(header.unwrap_or(""));
    if is_allowed_proxy_type(&t) {
        return Some(t);
    }
    if t.is_empty() || t == "application/octet-stream" {
        return sniff_image_type(body).map(str::to_string);
    }
    None
}

/// The route, on the server's network.
pub async fn handle(req: Req) -> Result<Response<Body>, String> {
    Ok(respond(&req.method, req.query("url"), &default_fetch()?, PROXY_TIMEOUT).await)
}

/// The route for a method and `url` parameter, fetching through `fetch`; `timeout` covers the hops and the body.
pub async fn respond(method: &Method, url: Option<String>, fetch: &Fetch, timeout: Duration) -> Response<Body> {
    if method != Method::GET {
        return http::empty(405);
    }
    let Ok(target) = Url::parse(&url.unwrap_or_default()) else { return http::empty(400) };
    if !is_valid_proxy_target(&target) {
        return http::empty(400);
    }
    let deadline = Instant::now() + timeout;
    let mut upstream = match timeout_at(deadline, fetch_proxied(target, fetch)).await {
        Ok(Ok(Some(upstream))) => upstream,
        Ok(Ok(None)) => return http::text(502, "redirect refused"),
        Ok(Err(_)) | Err(_) => return http::empty(504),
    };
    if !(200..300).contains(&upstream.status) {
        return relay_status(upstream.status);
    }
    if js::string_to_number(&upstream.header("content-length").unwrap_or_default()) > MAX_PROXY_BYTES as f64 {
        return http::empty(413);
    }
    let mut body = Vec::new();
    loop {
        match timeout_at(deadline, upstream.body.next()).await {
            Ok(Some(Ok(chunk))) if body.len() + chunk.len() > MAX_PROXY_BYTES => return http::empty(413),
            Ok(Some(Ok(chunk))) => body.extend_from_slice(&chunk),
            Ok(None) => break,
            Ok(Some(Err(_))) | Err(_) => return http::empty(502),
        }
    }
    let Some(content_type) = resolve_proxy_type(upstream.header("content-type").as_deref(), &body) else {
        return http::text(406, "not an image");
    };
    Response::builder()
        .status(200)
        .header("Content-Type", content_type)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(http::chunked(body))
        .unwrap_or_default()
}

/// `send(res, status)` for an upstream's status, with Node's reason phrase where it is not the http crate's.
fn relay_status(status: u16) -> Response<Body> {
    let reason = match status {
        418 => Some(&b"I'm a Teapot"[..]),
        509 => Some(&b"Bandwidth Limit Exceeded"[..]),
        _ => StatusCode::from_u16(status).ok().filter(|s| s.canonical_reason().is_none()).map(|_| &b"unknown"[..]),
    };
    let mut response = http::empty(status);
    if let Some(reason) = reason {
        response.extensions_mut().insert(hyper::ext::ReasonPhrase::from_static(reason));
    }
    response
}

#[cfg(test)]
#[path = "proxy_tests.rs"]
mod tests;
