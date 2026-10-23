// GET /api/font-proxy?url=<https URL on www.fontsquirrel.com> (server/font-proxy.mjs): font sources that send no CORS
// headers (Font Squirrel), for the studio's Library › Fonts › Get a font and the import lab. Only that host is proxied;
// every redirect hop must stay on a known font host over HTTPS, and the body is capped. The answer is opaque bytes,
// sandboxed, never rendered here. As in Node there is no timeout and no address check: the hosts are an allowlist.
//
// Font Squirrel throttles (an empty 202), so its catalogue is kept in `cacheDir/fontsquirrel-list.json` for a week and
// served stale when a refresh fails. With no copy at all the page gets an empty body, which it reports as "throttled?"
// instead of an error. The host lists match src/lib/infopanel/font-sources.ts (HOSTS, PROXIED).

use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime};

use axum::body::Body;
use axum::http::{Method, Response};
use futures_util::StreamExt;
use url::Url;

use crate::guarded_net::{client_builder, describe};
use crate::http::{self, Req};
use crate::proxy::{Fetch, Fetching, Upstream};
use crate::{json, store, App};

pub const CATALOGUE: &str = "https://www.fontsquirrel.com/api/fontlist/all";
const PROXIED: [&str; 1] = ["www.fontsquirrel.com"];
const FONT_HOSTS: [&str; 5] = ["api.fontsource.org", "cdn.jsdelivr.net", "fonts.google.com", "fonts.gstatic.com", "www.fontsquirrel.com"];
pub const MAX_BYTES: usize = 30 * 1024 * 1024;
const MAX_REDIRECTS: usize = 3;
const WEEK: Duration = Duration::from_secs(7 * 24 * 3600);
const CACHE_FILE: &str = "fontsquirrel-list.json";

/// Whether `url` is https on one of `hosts`.
fn https_on(url: &str, hosts: &[&str]) -> bool {
    Url::parse(url).is_ok_and(|u| u.scheme() == "https" && u.host_str().is_some_and(|h| hosts.contains(&h)))
}

/// May the server fetch this for a page?
pub fn proxy_allowed(url: &str) -> bool {
    https_on(url, &PROXIED)
}

/// Whether a redirect target stays on a font host over HTTPS.
pub fn hop_allowed(url: &str) -> bool {
    https_on(url, &FONT_HOSTS)
}

/// The body of `url`, following checked redirects by hand, at most `MAX_BYTES`. The errors are Node's messages, which
/// go into the 502.
pub async fn fetch_bytes(url: &str, fetch: &Fetch) -> Result<Vec<u8>, String> {
    let mut url = url.to_string();
    for _ in 0..=MAX_REDIRECTS {
        if !hop_allowed(&url) {
            return Err(format!("refusing to fetch {url}"));
        }
        let parsed = Url::parse(&url).map_err(|_| "Invalid URL".to_string())?;
        let mut upstream = fetch(parsed.clone()).await?;
        if let Some(location) = upstream.location() {
            url = parsed.join(&location).map_err(|_| "Invalid URL".to_string())?.to_string();
            continue;
        }
        if !(200..300).contains(&upstream.status) {
            return Err(format!("{url}: HTTP {}", upstream.status));
        }
        let mut body = Vec::new();
        while let Some(chunk) = upstream.body.next().await {
            let chunk = chunk?;
            if body.len() + chunk.len() > MAX_BYTES {
                return Err(format!("{url}: over {MAX_BYTES} bytes"));
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(body);
    }
    Err(format!("{url}: too many redirects"))
}

/// The server's fetch: no redirects, no proxy, Node's fetch error words.
fn default_fetch() -> Result<Fetch, String> {
    static FETCH: OnceLock<Result<Fetch, String>> = OnceLock::new();
    FETCH
        .get_or_init(|| {
            let client = client_builder().build().map_err(describe)?;
            Ok(Arc::new(move |url: Url| -> Fetching {
                let request = client.get(url).header("User-Agent", "infopanel-studio");
                Box::pin(async move {
                    let upstream = Upstream::of(request.send().await.map_err(|_| "fetch failed".to_string())?);
                    let body = upstream.body.map(|chunk| chunk.map_err(|_| "terminated".to_string()));
                    Ok(Upstream { body: Box::pin(body), ..upstream })
                })
            }) as Fetch)
        })
        .clone()
}

/// The catalogue: the copy while it is under a week old, else a fresh list (kept only when it is whole JSON), else
/// the stale copy, else nothing.
async fn catalogue(cache_dir: &Path, fetch: &Fetch) -> Result<Vec<u8>, String> {
    let cache = cache_dir.join(CACHE_FILE);
    let modified = tokio::fs::metadata(&cache).await.and_then(|m| m.modified()).ok();
    // A copy from the future counts as fresh, as Node's negative age does.
    if modified.is_some_and(|m| SystemTime::now().duration_since(m).map_or(true, |age| age < WEEK)) {
        return tokio::fs::read(&cache).await.map_err(|e| e.to_string());
    }
    let fresh = async {
        let body = fetch_bytes(CATALOGUE, fetch).await?;
        // Only a whole list replaces the copy. TextDecoder drops a byte order mark.
        let text = String::from_utf8_lossy(&body);
        json::parse(text.strip_prefix('\u{feff}').unwrap_or(&text)).ok_or("not JSON")?;
        tokio::fs::create_dir_all(cache_dir).await.map_err(|e| e.to_string())?;
        // Atomic: a crash mid-write must not leave a cut list that a week of reads then serves.
        let (file, bytes) = (cache.clone(), body.clone());
        tokio::task::spawn_blocking(move || store::write_atomic(&file, &bytes)).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
        Ok::<_, String>(body)
    };
    match fresh.await {
        Ok(body) => Ok(body),
        Err(_) => Ok(tokio::fs::read(&cache).await.unwrap_or_default()),
    }
}

/// The route, on the server's network and data folder.
pub async fn handle(app: &App, req: Req) -> Result<Response<Body>, String> {
    Ok(respond(&req.method, req.query("url"), &app.cfg.data_dir.join("cache"), &default_fetch()?).await)
}

/// The route for a method and `url` parameter, with the catalogue copy in `cache_dir`, fetching through `fetch`.
pub async fn respond(method: &Method, url: Option<String>, cache_dir: &Path, fetch: &Fetch) -> Response<Body> {
    if method != Method::GET {
        return http::empty(405);
    }
    let url = url.unwrap_or_default();
    if !proxy_allowed(&url) {
        return http::text(400, "not an allowed font URL");
    }
    let body = if url == CATALOGUE { catalogue(cache_dir, fetch).await } else { fetch_bytes(&url, fetch).await };
    match body {
        // proxy_allowed holds, so the host is Font Squirrel's.
        Ok(body) if body.is_empty() && url != CATALOGUE => http::text(502, format!("{} sent nothing (throttled?)", PROXIED[0])),
        Ok(body) => Response::builder()
            .status(200)
            .header("Content-Type", "application/octet-stream")
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "sandbox; default-src 'none'")
            .body(http::chunked(body))
            .unwrap_or_default(),
        Err(message) => http::text(502, message),
    }
}

#[cfg(test)]
#[path = "font_proxy_tests.rs"]
mod tests;
