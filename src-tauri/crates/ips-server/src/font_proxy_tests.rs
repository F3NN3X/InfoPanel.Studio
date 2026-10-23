use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use axum::body::{to_bytes, Bytes};
use axum::http::{HeaderMap, HeaderValue};

use super::*;

/// A fake network: each URL answers (status, location, body); anything else is a 404. Records what it was asked for.
fn fake(routes: &[(&str, u16, Option<&str>, &str)]) -> (Fetch, Arc<Mutex<Vec<String>>>) {
    let routes: Vec<(String, u16, Option<String>, String)> = routes.iter().map(|(u, s, l, b)| (u.to_string(), *s, l.map(str::to_string), b.to_string())).collect();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);
    let fetch: Fetch = Arc::new(move |url: Url| {
        log.lock().unwrap().push(url.to_string());
        let (status, location, body) = routes.iter().find(|r| r.0 == url.as_str()).map_or((404, None, String::new()), |r| (r.1, r.2.clone(), r.3.clone()));
        let mut headers = HeaderMap::new();
        if let Some(location) = location {
            headers.insert("location", HeaderValue::from_str(&location).unwrap());
        }
        let body = futures_util::stream::iter(vec![Ok(Bytes::from(body))]);
        Box::pin(async move { Ok(Upstream { status, headers, body: Box::pin(body) }) })
    });
    (fetch, seen)
}

/// A fetch that must not be called.
fn offline() -> Fetch {
    Arc::new(|url| panic!("fetched {url}"))
}

/// A deadline that never matters.
fn far() -> Instant {
    Instant::now() + Duration::from_secs(3600)
}

fn far_timeout() -> Duration {
    Duration::from_secs(3600)
}

async fn run(url: &str, fetch: &Fetch, dir: &Path) -> (u16, HeaderMap, String) {
    let response = respond(&Method::GET, Some(url.to_string()), dir, fetch, far_timeout()).await;
    let (parts, body) = response.into_parts();
    (parts.status.as_u16(), parts.headers, String::from_utf8(to_bytes(body, usize::MAX).await.unwrap().to_vec()).unwrap())
}

#[test]
fn proxies_font_squirrel_over_https_only() {
    for good in ["https://www.fontsquirrel.com/fonts/download/roboto", "https://WWW.FontSquirrel.com:8443/x", "https://u:p@www.fontsquirrel.com/x"] {
        assert!(proxy_allowed(good), "{good}");
    }
    for bad in ["http://www.fontsquirrel.com/x", "https://evil.example/x", "https://fonts.google.com/x", "not a url", "", "https://www.fontsquirrel.com./x", "https://fontsquirrel.com/x"] {
        assert!(!proxy_allowed(bad), "{bad}");
    }
}

#[test]
fn follows_redirects_to_font_hosts_only() {
    for good in ["https://cdn.jsdelivr.net/x.ttf", "https://api.fontsource.org/v1", "https://fonts.google.com/x", "https://fonts.gstatic.com/s/x.woff2", "https://www.fontsquirrel.com/x"] {
        assert!(hop_allowed(good), "{good}");
    }
    for bad in ["https://127.0.0.1/x", "file:///C:/x", "http://cdn.jsdelivr.net/x", "https://evil.example/x", "https://169.254.169.254/"] {
        assert!(!hop_allowed(bad), "{bad}");
    }
}

#[tokio::test]
async fn follows_a_checked_redirect() {
    let (fetch, seen) = fake(&[("https://www.fontsquirrel.com/a", 302, Some("https://cdn.jsdelivr.net/b"), ""), ("https://cdn.jsdelivr.net/b", 200, None, "font")]);
    assert_eq!(fetch_bytes("https://www.fontsquirrel.com/a", &fetch, far()).await, Ok(b"font".to_vec()));
    assert_eq!(*seen.lock().unwrap(), ["https://www.fontsquirrel.com/a", "https://cdn.jsdelivr.net/b"]);
}

#[tokio::test]
async fn refuses_a_redirect_off_the_font_hosts() {
    let (fetch, seen) = fake(&[("https://www.fontsquirrel.com/a", 302, Some("http://169.254.169.254/"), "")]);
    assert_eq!(fetch_bytes("https://www.fontsquirrel.com/a", &fetch, far()).await, Err("refusing to fetch http://169.254.169.254/".into()));
    assert_eq!(seen.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn gives_up_after_three_redirects_naming_the_last_url() {
    let hops: Vec<(String, Option<String>)> = (0..4).map(|i| (format!("https://www.fontsquirrel.com/{i}"), Some(format!("/{}", i + 1)))).collect();
    let routes: Vec<(&str, u16, Option<&str>, &str)> = hops.iter().map(|(u, l)| (u.as_str(), 302, l.as_deref(), "")).collect();
    let (fetch, seen) = fake(&routes);
    assert_eq!(fetch_bytes("https://www.fontsquirrel.com/0", &fetch, far()).await, Err("https://www.fontsquirrel.com/4: too many redirects".into()));
    assert_eq!(seen.lock().unwrap().len(), 4);
}

#[tokio::test]
async fn reports_a_status_a_bad_location_and_an_oversize_body() {
    let (fetch, _) = fake(&[("https://www.fontsquirrel.com/x", 302, None, ""), ("https://www.fontsquirrel.com/bad", 301, Some("https://[::1"), "")]);
    // The URL as given, not normalised.
    assert_eq!(fetch_bytes("https://WWW.fontsquirrel.com/x", &fetch, far()).await, Err("https://WWW.fontsquirrel.com/x: HTTP 302".into()));
    assert_eq!(fetch_bytes("https://www.fontsquirrel.com/gone", &fetch, far()).await, Err("https://www.fontsquirrel.com/gone: HTTP 404".into()));
    assert_eq!(fetch_bytes("https://www.fontsquirrel.com/bad", &fetch, far()).await, Err("Invalid URL".into()));
    let big: Fetch = Arc::new(|_| {
        let chunks: Vec<Result<Bytes, String>> = (0..31).map(|_| Ok(Bytes::from(vec![0u8; 1024 * 1024]))).collect();
        Box::pin(async move { Ok(Upstream { status: 200, headers: HeaderMap::new(), body: Box::pin(futures_util::stream::iter(chunks)) }) })
    });
    assert_eq!(fetch_bytes("https://www.fontsquirrel.com/big", &big, far()).await, Err("https://www.fontsquirrel.com/big: over 31457280 bytes".into()));
}

#[tokio::test]
async fn refuses_other_methods_and_urls() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(respond(&Method::POST, Some(CATALOGUE.into()), dir.path(), &offline(), far_timeout()).await.status(), 405);
    for url in [None, Some("https://evil.example/x"), Some("http://www.fontsquirrel.com/x")] {
        let response = respond(&Method::GET, url.map(str::to_string), dir.path(), &offline(), far_timeout()).await;
        assert_eq!(response.status(), 400);
        assert_eq!(to_bytes(response.into_body(), 100).await.unwrap(), "not an allowed font URL");
    }
}

#[tokio::test]
async fn serves_the_body_sandboxed() {
    let dir = tempfile::tempdir().unwrap();
    let (fetch, _) = fake(&[("https://www.fontsquirrel.com/fonts/download/x", 200, None, "zip")]);
    let (status, headers, body) = run("https://www.fontsquirrel.com/fonts/download/x", &fetch, dir.path()).await;
    assert_eq!((status, body.as_str()), (200, "zip"));
    assert_eq!(headers["content-type"], "application/octet-stream");
    assert_eq!(headers["cache-control"], "no-store");
    assert_eq!(headers["x-content-type-options"], "nosniff");
    assert_eq!(headers["content-security-policy"], "sandbox; default-src 'none'");
}

#[tokio::test]
async fn an_empty_font_is_a_throttle_and_a_failure_is_a_502_with_the_reason() {
    let dir = tempfile::tempdir().unwrap();
    let (fetch, _) = fake(&[("https://www.fontsquirrel.com/x", 202, None, "")]);
    assert_eq!(run("https://www.fontsquirrel.com/x", &fetch, dir.path()).await.2, "www.fontsquirrel.com sent nothing (throttled?)");
    let down: Fetch = Arc::new(|_| Box::pin(async { Err("fetch failed".to_string()) }));
    let (status, _, body) = run("https://www.fontsquirrel.com/x", &down, dir.path()).await;
    assert_eq!((status, body.as_str()), (502, "fetch failed"));
}

#[tokio::test]
async fn keeps_the_catalogue_and_serves_the_copy_while_font_squirrel_throttles() {
    let dir = tempfile::tempdir().unwrap();
    let cache = dir.path().join("cache");
    let file = cache.join(CACHE_FILE);
    let (fetch, _) = fake(&[(CATALOGUE, 200, None, "[1]")]);
    assert_eq!(run(CATALOGUE, &fetch, &cache).await.2, "[1]");
    assert_eq!(std::fs::read(&file).unwrap(), b"[1]");
    assert!(!cache.join("fontsquirrel-list.json.tmp").exists());
    // Fresh: served without a fetch.
    assert_eq!(run(CATALOGUE, &offline(), &cache).await.2, "[1]");
    // A week old: the refresh is an empty 202, which is not a list, so the copy stays and is served.
    std::fs::File::options().write(true).open(&file).unwrap().set_modified(SystemTime::UNIX_EPOCH).unwrap();
    let (throttled, _) = fake(&[(CATALOGUE, 202, None, "")]);
    let (status, _, body) = run(CATALOGUE, &throttled, &cache).await;
    assert_eq!((status, body.as_str()), (200, "[1]"));
    let (cut, _) = fake(&[(CATALOGUE, 200, None, "[1, 2")]);
    assert_eq!(run(CATALOGUE, &cut, &cache).await.2, "[1]");
    assert_eq!(std::fs::read(&file).unwrap(), b"[1]");
    // A list with a byte order mark is whole.
    let (bom, _) = fake(&[(CATALOGUE, 200, None, "\u{feff}[2]")]);
    assert_eq!(run(CATALOGUE, &bom, &cache).await.2, "\u{feff}[2]");
}

#[tokio::test]
async fn with_no_copy_a_failed_catalogue_is_an_empty_200() {
    let dir = tempfile::tempdir().unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&calls);
    let down: Fetch = Arc::new(move |_| {
        count.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err("fetch failed".to_string()) })
    });
    let (status, _, body) = run(CATALOGUE, &down, dir.path()).await;
    assert_eq!((status, body.as_str()), (200, ""));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn only_the_exact_catalogue_url_is_cached() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!("{CATALOGUE}?x=1");
    let (fetch, seen) = fake(&[(&url, 200, None, "[3]")]);
    assert_eq!(run(&url, &fetch, dir.path()).await.2, "[3]");
    assert_eq!(seen.lock().unwrap().len(), 1);
    assert!(!dir.path().join(CACHE_FILE).exists());
}

/// A fetch whose headers, or whose body after the headers, never arrive.
fn stalled(after_headers: bool) -> Fetch {
    Arc::new(move |_| {
        Box::pin(async move {
            if !after_headers {
                std::future::pending::<()>().await;
            }
            let body = futures_util::stream::pending::<Result<Bytes, String>>();
            Ok(Upstream { status: 200, headers: HeaderMap::new(), body: Box::pin(body) })
        })
    })
}

#[tokio::test]
async fn a_deadline_before_the_headers_is_a_504_and_during_the_body_a_502() {
    let dir = tempfile::tempdir().unwrap();
    for (after_headers, expected) in [(false, 504), (true, 502)] {
        let response = respond(&Method::GET, Some("https://www.fontsquirrel.com/x".into()), dir.path(), &stalled(after_headers), Duration::from_millis(50)).await;
        assert_eq!(response.status(), expected);
        assert!(to_bytes(response.into_body(), 100).await.unwrap().is_empty());
    }
}
