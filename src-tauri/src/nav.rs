// Navigation guard: the window may show the app's local pages and the studio from its own
// server; everything else opens in the system browser.

use tauri::Url;

/// True for Tauri's own pages (tauri://localhost, http://tauri.localhost on Windows). The port must
/// be absent: Tauri's own check ignores it, so `http://tauri.localhost:<port>` would otherwise reach
/// the local pages' commands from any loopback listener.
pub fn is_local_page(url: &Url) -> bool {
    let host = match url.scheme() {
        "tauri" => "localhost",
        "http" => "tauri.localhost",
        _ => return false,
    };
    url.host_str() == Some(host) && url.port().is_none()
}

/// Whether the main window may navigate to `url`; `server_origin` is `http://host:port`.
pub fn is_allowed_nav(url: &Url, server_origin: &str) -> bool {
    if is_local_page(url) || url.as_str() == "about:blank" {
        return true;
    }
    let same_server = url.origin().ascii_serialization() == server_origin;
    match url.scheme() {
        "http" => same_server && !url.path().starts_with("/api/"),
        // A download of a studio-made Blob.
        "blob" => same_server,
        _ => false,
    }
}

/// Links the guard refused that are worth handing to the system browser.
pub fn opens_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORIGIN: &str = "http://127.0.0.1:3942";

    fn allowed(u: &str) -> bool {
        is_allowed_nav(&Url::parse(u).unwrap(), ORIGIN)
    }

    #[test]
    fn local_pages_and_the_studio_are_allowed() {
        assert!(allowed("tauri://localhost/start.html"));
        assert!(allowed("http://tauri.localhost/app/settings.html"));
        assert!(allowed("http://127.0.0.1:3942/?studio=1"));
        assert!(allowed("http://127.0.0.1:3942/"));
        assert!(allowed("about:blank"));
        assert!(allowed("blob:http://127.0.0.1:3942/2f1c-11"));
    }

    #[test]
    fn api_other_ports_and_sites_are_not() {
        assert!(!allowed("http://127.0.0.1:3942/api/assets/abc"));
        assert!(!allowed("http://127.0.0.1:3922/?studio=1"));
        assert!(!allowed("http://localhost:3942/"));
        assert!(!allowed("https://github.com/"));
        assert!(!allowed("https://tauri.localhost.evil.com/"));
        assert!(!allowed("tauri://evil/"));
        assert!(!allowed("blob:https://example.com/1"));
        assert!(!allowed("data:text/html,hi"));
        assert!(!allowed("file:///C:/x.html"));
    }

    #[test]
    fn local_pages_need_the_bare_origin() {
        assert!(!allowed("http://tauri.localhost:3922/app/settings.html"));
        assert!(!allowed("http://tauri.localhost:8080/"));
        assert!(!allowed("https://tauri.localhost/app/settings.html"));
        assert!(!allowed("tauri://localhost:1/start.html"));
    }

    #[test]
    fn external_schemes() {
        assert!(opens_externally(&Url::parse("https://x.dev").unwrap()));
        assert!(opens_externally(&Url::parse("mailto:a@b.c").unwrap()));
        assert!(!opens_externally(&Url::parse("file:///C:/x").unwrap()));
    }
}
