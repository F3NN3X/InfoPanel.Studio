// Response headers of the static files (server/security-headers.mjs): the studio, Settings and kiosk pages, which run
// with the desktop app's IPC on this origin. The policy goes on HTML only.

/// The Studio and Settings pages may be framed by their own origin only; kiosk pages stay embeddable.
const FRAME_SELF: &str = "frame-ancestors 'self'";

const CSP: [&str; 11] = [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: blob: https:",
    "img-src 'self' data: blob: http: https:",
    "media-src 'self' blob: http: https:",
    "connect-src 'self' http: https: ws: wss: ipc:",
    "frame-src 'self' blob: http: https:",
];

/// Whether `search` (a URL's `?...`) names the Studio or Settings page (`?studio`, `?settings`).
pub fn is_editor_page(search: &str) -> bool {
    let query = search.strip_prefix('?').unwrap_or(search);
    url::form_urlencoded::parse(query.as_bytes())
        .any(|(key, _)| key == "studio" || key == "settings")
}

/// The security headers of a static response, in Node's order.
pub fn security_headers(is_html: bool, search: &str) -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("X-Content-Type-Options", "nosniff".to_string()),
        (
            "Referrer-Policy",
            if is_html {
                "strict-origin-when-cross-origin"
            } else {
                "no-referrer"
            }
            .to_string(),
        ),
    ];
    if is_html {
        let mut directives = CSP.to_vec();
        if is_editor_page(search) {
            directives.push(FRAME_SELF);
        }
        headers.push(("Content-Security-Policy", directives.join("; ")));
    }
    headers
}
