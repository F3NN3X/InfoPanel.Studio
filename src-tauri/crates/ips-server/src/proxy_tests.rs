use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use axum::body::to_bytes;
use axum::http::HeaderValue;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use super::*;
use crate::guarded_net::{blocked_ip, Lookup};

const PNG: [u8; 10] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];

fn upstream(status: u16, headers: &[(&str, &str)], chunks: Vec<Result<Bytes, String>>) -> Upstream {
    let mut map = HeaderMap::new();
    for (k, v) in headers {
        map.append(axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(), HeaderValue::from_str(v).unwrap());
    }
    Upstream { status, headers: map, body: Box::pin(futures_util::stream::iter(chunks)) }
}

/// A fake network answering from a map of URL → (status, location), recording what it was asked for.
struct Fake {
    seen: Arc<Mutex<Vec<String>>>,
    fetch: Fetch,
}

fn fake(routes: &[(&str, u16, Option<&str>)]) -> Fake {
    let routes: HashMap<String, (u16, Option<String>)> = routes.iter().map(|(u, s, l)| (u.to_string(), (*s, l.map(str::to_string)))).collect();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);
    let fetch: Fetch = Arc::new(move |url: Url| {
        log.lock().unwrap().push(url.to_string());
        let (status, location) = routes.get(url.as_str()).cloned().unwrap_or((404, None));
        let headers: Vec<(&str, String)> = location.into_iter().map(|l| ("location", l)).collect();
        let headers: Vec<(&str, &str)> = headers.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let answer = upstream(status, &headers, vec![Ok(Bytes::from_static(b"body"))]);
        Box::pin(async move { Ok(answer) })
    });
    Fake { seen, fetch }
}

/// A fetch that always answers with what `make` builds.
fn answering(make: impl Fn() -> Result<Upstream, String> + Send + Sync + 'static) -> Fetch {
    Arc::new(move |_| {
        let answer = make();
        Box::pin(async move { answer })
    })
}

async fn proxy(fetch: &Fetch, url: &str) -> (u16, HeaderMap, Vec<u8>) {
    let response = respond(&Method::GET, Some(url.to_string()), fetch, PROXY_TIMEOUT).await;
    let (parts, body) = response.into_parts();
    (parts.status.as_u16(), parts.headers, to_bytes(body, usize::MAX).await.unwrap().to_vec())
}

#[test]
fn allows_https_anywhere_and_http_on_loopback_only() {
    for u in ["https://i.scdn.co/a.jpg", "https://10.0.0.1/x", "https://user:pw@a.test:8443/x", "http://localhost:9/a", "http://127.0.0.1/a", "http://[::1]/a", "http://LOCALHOST/a", "http://127.1/a"] {
        assert!(is_valid_proxy_target(&Url::parse(u).unwrap()), "{u}");
    }
    for u in ["http://169.254.169.254/latest", "http://10.0.0.1/x", "http://example.com/a.jpg", "file:///C:/a.png", "ftp://example.com/a", "http://127.0.0.2/a", "http://[::ffff:127.0.0.1]/a", "data:image/png;base64,AA"] {
        assert!(!is_valid_proxy_target(&Url::parse(u).unwrap()), "{u}");
    }
}

#[test]
fn allows_raster_types_and_refuses_svg_and_the_rest() {
    for t in ["image/png", "image/jpeg", "image/webp", "IMAGE/PNG", "image/avif; q=1", "image/x-icon", " image/png "] {
        assert!(is_allowed_proxy_type(t), "{t}");
    }
    for t in ["text/html", "text/html; charset=utf-8", "application/json", "application/octet-stream", "image/svg+xml", "IMAGE/SVG+XML; x", "image/", "", "video/mp4", "image/p_g"] {
        assert!(!is_allowed_proxy_type(t), "{t}");
    }
}

#[test]
fn sniffs_the_supported_formats_only() {
    assert_eq!(sniff_image_type(&PNG), Some("image/png"));
    assert_eq!(sniff_image_type(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
    assert_eq!(sniff_image_type(b"GIF87a...."), Some("image/gif"));
    assert_eq!(sniff_image_type(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
    assert_eq!(sniff_image_type(b"\0\0\0\x1cftypavif\0\0\0\0"), Some("image/avif"));
    for junk in [&b"<html><script>"[..], b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>", b"", b"GIF88a", &PNG[..7], b"RIFF\0\0\0\0WEB"] {
        assert_eq!(sniff_image_type(junk), None, "{junk:?}");
    }
}

#[test]
fn keeps_an_image_type_sniffs_octet_stream_and_refuses_the_rest() {
    assert_eq!(resolve_proxy_type(Some("image/jpeg; charset=x"), b"junk").as_deref(), Some("image/jpeg"));
    assert_eq!(resolve_proxy_type(Some("Application/Octet-Stream"), &PNG).as_deref(), Some("image/png"));
    assert_eq!(resolve_proxy_type(None, b"RIFF\0\0\0\0WEBPVP8 ").as_deref(), Some("image/webp"));
    assert_eq!(resolve_proxy_type(Some("application/octet-stream"), b"<html>"), None);
    assert_eq!(resolve_proxy_type(Some("text/html"), &PNG), None);
    assert_eq!(resolve_proxy_type(Some("image/svg+xml"), &PNG), None);
}

#[tokio::test]
async fn follows_allowed_hops_resolving_relative_locations() {
    let f = fake(&[("https://a.test/x", 302, Some("/y")), ("https://a.test/y", 301, Some("https://b.test/z")), ("https://b.test/z", 200, None)]);
    let got = fetch_proxied(Url::parse("https://a.test/x").unwrap(), &f.fetch).await.unwrap().unwrap();
    assert_eq!(got.status, 200);
    assert_eq!(*f.seen.lock().unwrap(), ["https://a.test/x", "https://a.test/y", "https://b.test/z"]);
}

#[tokio::test]
async fn refuses_a_hop_to_plain_http_off_loopback_without_fetching_it() {
    let f = fake(&[("https://a.test/x", 302, Some("http://169.254.169.254/latest/meta-data"))]);
    assert!(fetch_proxied(Url::parse("https://a.test/x").unwrap(), &f.fetch).await.unwrap().is_none());
    assert_eq!(*f.seen.lock().unwrap(), ["https://a.test/x"]);
}

#[tokio::test]
async fn gives_up_after_three_redirects() {
    let f = fake(&[
        ("https://a.test/0", 302, Some("/1")),
        ("https://a.test/1", 302, Some("/2")),
        ("https://a.test/2", 302, Some("/3")),
        ("https://a.test/3", 302, Some("/4")),
        ("https://a.test/4", 200, None),
    ]);
    assert!(fetch_proxied(Url::parse("https://a.test/0").unwrap(), &f.fetch).await.unwrap().is_none());
    assert_eq!(f.seen.lock().unwrap().len(), 4);
    // Three are followed.
    let f = fake(&[("https://a.test/1", 302, Some("/2")), ("https://a.test/2", 302, Some("/3")), ("https://a.test/3", 302, Some("/4")), ("https://a.test/4", 200, None)]);
    assert_eq!(fetch_proxied(Url::parse("https://a.test/1").unwrap(), &f.fetch).await.unwrap().unwrap().status, 200);
}

#[tokio::test]
async fn refuses_a_hop_from_a_public_page_to_http_on_loopback() {
    let f = fake(&[("https://a.test/x", 302, Some("http://127.0.0.1:9/admin")), ("http://127.0.0.1:9/a", 302, Some("http://localhost:9/b")), ("http://localhost:9/b", 200, None)]);
    assert!(fetch_proxied(Url::parse("https://a.test/x").unwrap(), &f.fetch).await.unwrap().is_none());
    assert_eq!(*f.seen.lock().unwrap(), ["https://a.test/x"]);
    // Loopback to loopback is the local cover-art server's own redirect.
    assert_eq!(fetch_proxied(Url::parse("http://127.0.0.1:9/a").unwrap(), &f.fetch).await.unwrap().unwrap().status, 200);
}

#[tokio::test]
async fn returns_a_redirect_without_a_location_and_refuses_a_bad_one() {
    let f = fake(&[("https://a.test/x", 302, None), ("https://a.test/e", 302, Some("")), ("https://a.test/bad", 302, Some("http://[::1"))]);
    assert_eq!(fetch_proxied(Url::parse("https://a.test/x").unwrap(), &f.fetch).await.unwrap().unwrap().status, 302);
    assert_eq!(fetch_proxied(Url::parse("https://a.test/e").unwrap(), &f.fetch).await.unwrap().unwrap().status, 302);
    assert!(fetch_proxied(Url::parse("https://a.test/bad").unwrap(), &f.fetch).await.unwrap().is_none());
}

#[tokio::test]
async fn refuses_other_methods_and_bad_targets() {
    let f = fake(&[]);
    assert_eq!(respond(&Method::POST, Some("https://a.test/x".into()), &f.fetch, PROXY_TIMEOUT).await.status(), 405);
    for url in [None, Some(""), Some("/relative"), Some("not a url"), Some("http://example.com/a.png"), Some("file:///etc/passwd"), Some("http://127.0.0.2/a")] {
        assert_eq!(respond(&Method::GET, url.map(str::to_string), &f.fetch, PROXY_TIMEOUT).await.status(), 400, "{url:?}");
    }
    assert!(f.seen.lock().unwrap().is_empty());
}

#[tokio::test]
async fn relays_an_image_with_nosniff_and_its_own_type() {
    let jpeg = answering(|| Ok(upstream(200, &[("content-type", "image/jpeg"), ("set-cookie", "a=1")], vec![Ok(Bytes::from_static(&PNG))])));
    let (status, headers, body) = proxy(&jpeg, "https://a.test/x").await;
    assert_eq!((status, body.as_slice()), (200, &PNG[..]));
    assert_eq!(headers["content-type"], "image/jpeg");
    assert_eq!(headers["cache-control"], "no-store");
    assert_eq!(headers["x-content-type-options"], "nosniff");
    assert!(headers.get("set-cookie").is_none());
    let octet = answering(|| Ok(upstream(200, &[("content-type", "application/octet-stream")], vec![Ok(Bytes::from_static(&PNG[..4])), Ok(Bytes::from_static(&PNG[4..]))])));
    assert_eq!(proxy(&octet, "http://127.0.0.1:9/a").await.1["content-type"], "image/png");
}

#[tokio::test]
async fn refuses_svg_and_non_images_with_406() {
    for (t, body) in [("image/svg+xml", &b"<svg xmlns='http://www.w3.org/2000/svg'/>"[..]), ("text/html", b"<html>"), ("application/octet-stream", b"<html>"), ("application/json", b"{}")] {
        let fetch = answering(move || Ok(upstream(200, &[("content-type", t)], vec![Ok(Bytes::copy_from_slice(body))])));
        let (status, _, text) = proxy(&fetch, "https://a.test/x").await;
        assert_eq!((status, text.as_slice()), (406, &b"not an image"[..]), "{t}");
    }
}

#[tokio::test]
async fn maps_failures_to_node_statuses() {
    let refused = answering(|| Err(NOT_ALLOWED.into()));
    assert_eq!(proxy(&refused, "https://a.test/x").await.0, 504);
    let missing = answering(|| Ok(upstream(404, &[], vec![])));
    let (status, _, body) = proxy(&missing, "https://a.test/x").await;
    assert_eq!((status, body.len()), (404, 0));
    let escape = fake(&[("https://a.test/x", 302, Some("http://169.254.169.254/"))]);
    let (status, _, body) = proxy(&escape.fetch, "https://a.test/x").await;
    assert_eq!((status, body.as_slice()), (502, &b"redirect refused"[..]));
    let broken = answering(|| Ok(upstream(200, &[("content-type", "image/png")], vec![Ok(Bytes::from_static(&PNG)), Err("terminated".into())])));
    assert_eq!(proxy(&broken, "https://a.test/x").await.0, 502);
}

#[tokio::test]
async fn refuses_an_oversize_body_by_its_length_or_as_it_streams() {
    let declared = answering(|| Ok(upstream(200, &[("content-type", "image/png"), ("content-length", "26214401")], vec![Ok(Bytes::from_static(&PNG))])));
    assert_eq!(proxy(&declared, "https://a.test/x").await.0, 413);
    let at_cap = answering(|| Ok(upstream(200, &[("content-type", "image/png"), ("content-length", "26214400")], vec![Ok(Bytes::from_static(&PNG))])));
    assert_eq!(proxy(&at_cap, "https://a.test/x").await.0, 200);
    // No length, and one byte over the cap in 1 MiB chunks.
    let mib = Bytes::from(vec![0u8; 1024 * 1024]);
    let streamed = answering(move || {
        let mut chunks: Vec<Result<Bytes, String>> = (0..25).map(|_| Ok(mib.clone())).collect();
        chunks.push(Ok(Bytes::from_static(b"x")));
        Ok(upstream(200, &[("content-type", "image/png")], chunks))
    });
    assert_eq!(proxy(&streamed, "https://a.test/x").await.0, 413);
}

#[tokio::test]
async fn times_out_before_the_head_with_504_and_after_it_with_502() {
    let slow: Fetch = Arc::new(|_| {
        Box::pin(async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok(upstream(200, &[], vec![]))
        })
    });
    assert_eq!(respond(&Method::GET, Some("https://a.test/x".into()), &slow, Duration::from_millis(50)).await.status(), 504);
    let stalled: Fetch = Arc::new(|_| {
        let body = futures_util::stream::once(async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok(Bytes::new())
        });
        Box::pin(async move { Ok(Upstream { status: 200, headers: HeaderMap::new(), body: Box::pin(body) }) })
    });
    assert_eq!(respond(&Method::GET, Some("https://a.test/x".into()), &stalled, Duration::from_millis(50)).await.status(), 502);
}

/// A lookup that answers from a list, one entry per call (the last repeats), counting the calls.
fn lookup_seq(answers: Vec<Vec<IpAddr>>) -> (Lookup, Arc<AtomicUsize>) {
    let calls = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&calls);
    let lookup: Lookup = Arc::new(move |_| {
        let n = count.fetch_add(1, Ordering::SeqCst);
        let answer = answers[n.min(answers.len() - 1)].clone();
        Box::pin(async move { Ok(answer) })
    });
    (lookup, calls)
}

/// The proxy's block list, but with 127.0.0.1 standing in for a public address (tests have no internet).
fn guarded(lookup: Lookup) -> GuardedClient {
    let loopback: IpAddr = "127.0.0.1".parse().unwrap();
    GuardedClient::with(lookup, Arc::new(move |ip| ip != loopback && blocked_ip(ip, true))).unwrap()
}

/// A listener that answers every request with `answer` and closes, counting connections.
async fn listen(addr: &str, answer: &'static [u8]) -> (u16, Arc<AtomicUsize>) {
    let listener = TcpListener::bind(addr).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let accepted = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&accepted);
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            count.fetch_add(1, Ordering::SeqCst);
            let mut buf = [0u8; 4096];
            let _ = socket.read(&mut buf).await;
            let _ = socket.write_all(answer).await;
        }
    });
    (port, accepted)
}

const PNG_ANSWER: &[u8] = b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";

#[tokio::test]
async fn a_name_that_rebinds_to_a_private_address_is_never_connected_to() {
    // The "public" server on 127.0.0.1 and a private one (::1) on the same port.
    let (port, private) = listen("[::1]:0", PNG_ANSWER).await;
    let (_, public) = listen(&format!("127.0.0.1:{port}"), PNG_ANSWER).await;
    let (lookup, calls) = lookup_seq(vec![vec!["127.0.0.1".parse().unwrap()], vec!["::1".parse().unwrap()]]);
    let client = guarded(lookup);
    let url = Url::parse(&format!("http://rebind.test:{port}/a.png")).unwrap();
    // The check sees the public answer; the connection makes its own lookup, which now says private, and is refused.
    assert_eq!(client.check_target(&url).await, Ok(()));
    assert_eq!(client.send(&url, &[]).await.err().as_deref(), Some(NOT_ALLOWED));
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    // A client that has not checked first connects to the vetted address; the next connection's lookup is private.
    let (lookup, _) = lookup_seq(vec![vec!["127.0.0.1".parse().unwrap()], vec!["::1".parse().unwrap()]]);
    let client = guarded(lookup);
    assert_eq!(client.send(&url, &[]).await.unwrap().status(), 200);
    assert_eq!(client.send(&url, &[]).await.err().as_deref(), Some(NOT_ALLOWED));
    assert_eq!(public.load(Ordering::SeqCst), 1);
    assert_eq!(private.load(Ordering::SeqCst), 0);
    // One private address among public ones is enough to refuse the name.
    let (lookup, _) = lookup_seq(vec![vec!["127.0.0.1".parse().unwrap(), "10.0.0.1".parse().unwrap()]]);
    assert_eq!(guarded(lookup).send(&url, &[]).await.err().as_deref(), Some(NOT_ALLOWED));
    assert_eq!(public.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn refuses_blocked_literals_and_names_before_connecting() {
    let (lookup, calls) = lookup_seq(vec![vec!["127.0.0.1".parse().unwrap()]]);
    let client = GuardedClient::with(lookup, Arc::new(|ip| blocked_ip(ip, true))).unwrap();
    for host in ["10.0.0.5", "192.168.1.1", "172.16.0.1", "100.64.0.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "224.0.0.1", "[::1]", "[::]", "[fd00::1]", "[fe80::1]", "[ff02::1]", "[::ffff:127.0.0.1]", "[::ffff:10.0.0.1]", "[64:ff9b::a9fe:a9fe]", "[::127.0.0.1]"] {
        let url = Url::parse(&format!("https://{host}/x")).unwrap();
        assert_eq!(guarded_proxy_fetch(&client, &url).await.err().as_deref(), Some(NOT_ALLOWED), "{host}");
    }
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    for address in ["10.1.2.3", "192.168.0.9", "169.254.169.254", "fc00::1", "::ffff:127.0.0.1"] {
        let (lookup, _) = lookup_seq(vec![vec![address.parse().unwrap()]]);
        let client = GuardedClient::with(lookup, Arc::new(|ip| blocked_ip(ip, true))).unwrap();
        let url = Url::parse("https://rebind.test/x").unwrap();
        assert_eq!(guarded_proxy_fetch(&client, &url).await.err().as_deref(), Some(NOT_ALLOWED), "{address}");
    }
}

#[tokio::test]
async fn a_redirect_to_a_private_address_is_refused() {
    // A loopback cover-art server redirects to https targets that are, or resolve to, private addresses: 504, as in
    // Node. A redirect to plain http off loopback is never fetched: 502.
    for (location, want) in [("https://10.0.0.1/x", 504), ("https://private.test/x", 504), ("https://[::ffff:192.168.1.10]/x", 504), ("http://10.0.0.1/x", 502), ("http://[::ffff:127.0.0.1]/x", 502)] {
        let answer: &'static [u8] = format!("HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").into_bytes().leak();
        let (port, _) = listen("127.0.0.1:0", answer).await;
        let (lookup, calls) = lookup_seq(vec![vec!["192.168.1.10".parse().unwrap()]]);
        let fetch = fetch_with(GuardedClient::with(lookup, Arc::new(|ip| blocked_ip(ip, true))).unwrap(), client_builder().build().unwrap());
        let (status, _, _) = proxy(&fetch, &format!("http://127.0.0.1:{port}/hop")).await;
        assert_eq!(status, want, "{location}");
        assert_eq!(calls.load(Ordering::SeqCst), usize::from(location.contains("private.test")), "{location}");
    }
}

#[tokio::test]
async fn relays_a_loopback_server_through_the_real_clients() {
    let (port, _) = listen("127.0.0.1:0", b"HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: 10\r\nConnection: close\r\n\r\n\x89PNG\r\n\x1a\n\0\0").await;
    let fetch = default_fetch().unwrap();
    let (status, headers, body) = proxy(&fetch, &format!("http://127.0.0.1:{port}/a")).await;
    assert_eq!((status, body.as_slice()), (200, &PNG[..]));
    assert_eq!(headers["content-type"], "image/png");
    // Nothing listens: a network failure is a 504.
    let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let dead = closed.local_addr().unwrap().port();
    drop(closed);
    assert_eq!(proxy(&fetch, &format!("http://127.0.0.1:{dead}/a")).await.0, 504);
    // Fetch's bad ports are refused without a connection, as Node's fetch does.
    for bad in ["http://127.0.0.1:6000/a", "http://localhost:10080/a", "http://[::1]:1/a"] {
        assert_eq!(fetch(Url::parse(bad).unwrap()).await.err().as_deref(), Some("bad port"), "{bad}");
    }
}
