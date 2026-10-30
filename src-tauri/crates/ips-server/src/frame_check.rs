// GET /api/frame-check?url=: whether the page at `url` lets this dashboard show it in a frame, for the Web Page widget
// in a browser, which can't be talked out of X-Frame-Options or `frame-ancestors` (the desktop app takes them off
// instead: src-tauri/src/unframe.rs). The answer is `{ "frame": "allowed" | "refused" | "unknown" }`, decided by
// frame_policy.rs for the page the redirects end at, with this request's own origin (its Host, over http) as the
// ancestor.
//
// The page is fetched as the image proxy fetches (proxy.rs): https anywhere, plain http on loopback only, every
// redirect hop checked again, and the https connection through the guarded client with the LAN blocked. Only the
// head is read. A refused hop, a failed or slow fetch and an answer that is not a 2xx are `unknown`: this fetch is
// not the browser's (no cookies, no login), so the widget then shows the frame as it always has.

use std::sync::OnceLock;
use std::time::Duration;

use axum::body::Body;
use axum::http::{HeaderValue, Method, Response};
use serde_json::json;
use tokio::time::timeout;
use url::Url;

use crate::frame_policy::may_frame;
use crate::guarded_net::{client_builder, describe, GuardedClient};
use crate::http::{self, Req};
use crate::proxy::{fetch_final, fetch_sending, is_valid_proxy_target, Fetch};

pub const FRAME_CHECK_TIMEOUT: Duration = Duration::from_secs(10);
/// What the https fetch sends: a request for a page to show in a frame, since a site may answer by what is asked for.
const PAGE_HEADERS: [(&str, &str); 3] = [
    ("user-agent", "Mozilla/5.0 (compatible; InfoPanel-Studio)"),
    ("accept", "text/html,application/xhtml+xml,*/*;q=0.8"),
    ("sec-fetch-dest", "iframe"),
];

/// The server's fetch: the LAN blocked for https.
fn default_fetch() -> Result<Fetch, String> {
    static FETCH: OnceLock<Result<Fetch, String>> = OnceLock::new();
    FETCH
        .get_or_init(|| {
            let plain = client_builder().build().map_err(describe)?;
            Ok(fetch_sending(
                GuardedClient::new(true)?,
                plain,
                &PAGE_HEADERS,
            ))
        })
        .clone()
}

/// The route, on the server's network.
pub async fn handle(req: Req) -> Result<Response<Body>, String> {
    let ancestor = req
        .header("host")
        .and_then(|host| Url::parse(&format!("http://{host}/")).ok());
    Ok(respond(
        &req.method,
        req.query("url"),
        ancestor,
        &default_fetch()?,
        FRAME_CHECK_TIMEOUT,
    )
    .await)
}

/// The route for a method, `url` parameter and the dashboard's origin, fetching through `fetch`; `limit` covers every
/// hop.
pub async fn respond(
    method: &Method,
    url: Option<String>,
    ancestor: Option<Url>,
    fetch: &Fetch,
    limit: Duration,
) -> Response<Body> {
    if method != Method::GET {
        return http::empty(405);
    }
    let Ok(target) = Url::parse(&url.unwrap_or_default()) else {
        return http::empty(400);
    };
    if !is_valid_proxy_target(&target) {
        return http::empty(400);
    }
    let frame = match (ancestor, timeout(limit, fetch_final(target, fetch)).await) {
        (Some(ancestor), Ok(Ok(Some((page, upstream)))))
            if (200..300).contains(&upstream.status) =>
        {
            if may_frame(&upstream.headers, &page, &ancestor) {
                "allowed"
            } else {
                "refused"
            }
        }
        _ => "unknown",
    };
    let mut response = http::json(200, &json!({ "frame": frame }));
    response
        .headers_mut()
        .insert("Cache-Control", HeaderValue::from_static("no-store"));
    response
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;

    use axum::body::{to_bytes, Bytes};
    use axum::http::{HeaderMap, HeaderName};

    use super::*;
    use crate::proxy::Upstream;

    /// A route of the fake network: its status and headers.
    type Route<'a> = (&'a str, u16, &'a [(&'a str, &'a str)]);

    /// A fake network: URL → (status, headers).
    fn fake(routes: &[Route]) -> Fetch {
        let routes: HashMap<String, (u16, Vec<(String, String)>)> = routes
            .iter()
            .map(|(u, s, h)| {
                (
                    u.to_string(),
                    (
                        *s,
                        h.iter()
                            .map(|(k, v)| (k.to_string(), v.to_string()))
                            .collect(),
                    ),
                )
            })
            .collect();
        Arc::new(move |url: Url| {
            let (status, pairs) = routes.get(url.as_str()).cloned().unwrap_or((404, vec![]));
            let mut headers = HeaderMap::new();
            for (k, v) in pairs {
                headers.append(
                    HeaderName::from_bytes(k.as_bytes()).unwrap(),
                    v.parse().unwrap(),
                );
            }
            let body = Box::pin(futures_util::stream::iter(vec![Ok(Bytes::from_static(
                b"<html>",
            ))]));
            Box::pin(async move {
                Ok(Upstream {
                    status,
                    headers,
                    body,
                })
            })
        })
    }

    async fn check(fetch: &Fetch, url: &str) -> (u16, String) {
        let ancestor = Url::parse("http://192.168.1.10:3922/").ok();
        let response = respond(
            &Method::GET,
            Some(url.into()),
            ancestor,
            fetch,
            FRAME_CHECK_TIMEOUT,
        )
        .await;
        let status = response.status().as_u16();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8_lossy(&body).into_owned())
    }

    const REFUSED: &str = r#"{"frame":"refused"}"#;
    const ALLOWED: &str = r#"{"frame":"allowed"}"#;
    const UNKNOWN: &str = r#"{"frame":"unknown"}"#;

    #[tokio::test]
    async fn says_whether_the_page_may_be_framed() {
        let fetch = fake(&[
            ("https://deny.test/", 200, &[("x-frame-options", "DENY")]),
            ("https://open.test/", 200, &[]),
            (
                "https://csp.test/",
                200,
                &[(
                    "content-security-policy",
                    "frame-ancestors http://192.168.1.10:*",
                )],
            ),
        ]);
        assert_eq!(
            check(&fetch, "https://deny.test/").await,
            (200, REFUSED.into())
        );
        assert_eq!(
            check(&fetch, "https://open.test/").await,
            (200, ALLOWED.into())
        );
        assert_eq!(
            check(&fetch, "https://csp.test/").await,
            (200, ALLOWED.into())
        );
    }

    #[tokio::test]
    async fn judges_the_page_the_redirects_end_at_against_its_own_origin() {
        let fetch = fake(&[
            (
                "https://a.test/",
                301,
                &[
                    ("location", "https://b.test/home"),
                    ("x-frame-options", "DENY"),
                ],
            ),
            (
                "https://b.test/home",
                200,
                &[("content-security-policy", "frame-ancestors 'self'")],
            ),
            ("https://open.test/", 302, &[("location", "/next")]),
            ("https://open.test/next", 200, &[]),
        ]);
        assert_eq!(
            check(&fetch, "https://a.test/").await,
            (200, REFUSED.into())
        );
        assert_eq!(
            check(&fetch, "https://open.test/").await,
            (200, ALLOWED.into())
        );
    }

    #[tokio::test]
    async fn a_failed_refused_or_non_2xx_fetch_is_unknown() {
        let fetch = fake(&[
            ("https://gone.test/", 404, &[("x-frame-options", "DENY")]),
            (
                "https://escape.test/",
                302,
                &[("location", "http://169.254.169.254/")],
            ),
        ]);
        assert_eq!(
            check(&fetch, "https://gone.test/").await,
            (200, UNKNOWN.into())
        );
        assert_eq!(
            check(&fetch, "https://escape.test/").await,
            (200, UNKNOWN.into())
        );
        let failing: Fetch =
            Arc::new(|_| Box::pin(async { Err::<Upstream, _>("address not allowed".to_string()) }));
        assert_eq!(
            check(&failing, "https://10.0.0.1/").await,
            (200, UNKNOWN.into())
        );
        let slow: Fetch = Arc::new(|_| Box::pin(std::future::pending()));
        let response = respond(
            &Method::GET,
            Some("https://a.test/".into()),
            Url::parse("http://h/").ok(),
            &slow,
            Duration::from_millis(30),
        )
        .await;
        assert_eq!(
            to_bytes(response.into_body(), usize::MAX).await.unwrap(),
            UNKNOWN.as_bytes()
        );
    }

    #[tokio::test]
    async fn refuses_other_methods_and_bad_targets() {
        let fetch = fake(&[]);
        let ancestor = Url::parse("http://h/").ok();
        assert_eq!(
            respond(
                &Method::POST,
                Some("https://a.test/".into()),
                ancestor.clone(),
                &fetch,
                FRAME_CHECK_TIMEOUT
            )
            .await
            .status(),
            405
        );
        for url in [
            None,
            Some("not a url"),
            Some("http://example.com/"),
            Some("file:///C:/x"),
            Some("javascript:alert(1)"),
        ] {
            let status = respond(
                &Method::GET,
                url.map(str::to_string),
                ancestor.clone(),
                &fetch,
                FRAME_CHECK_TIMEOUT,
            )
            .await
            .status();
            assert_eq!(status, 400, "{url:?}");
        }
    }
}
