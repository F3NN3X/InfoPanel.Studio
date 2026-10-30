// Whether a page's headers let another origin show it in a frame: the HTML standard's X-Frame-Options check and
// CSP's `frame-ancestors` (CSP 3's source matching), for /api/frame-check (frame_check.rs). An enforced policy with
// `frame-ancestors` wins over X-Frame-Options, as in a browser; a Report-Only policy decides nothing. Source paths
// are ignored (an ancestor is an origin).

use axum::http::HeaderMap;
use url::Url;

/// Whether the page at `page`, answered with `headers`, may be framed by a page of `ancestor`'s origin.
pub fn may_frame(headers: &HeaderMap, page: &Url, ancestor: &Url) -> bool {
    let policies: Vec<Vec<String>> = values(headers, "content-security-policy")
        .flat_map(|value| value.split(',').filter_map(frame_ancestors).collect::<Vec<_>>())
        .collect();
    if !policies.is_empty() {
        return policies.iter().all(|sources| sources.iter().any(|s| source_matches(s, page, ancestor)));
    }
    x_frame_options_allow(headers, page, ancestor)
}

fn values<'a>(headers: &'a HeaderMap, name: &str) -> impl Iterator<Item = &'a str> {
    headers.get_all(name).into_iter().filter_map(|v| v.to_str().ok())
}

/// The sources of one policy's `frame-ancestors` (the first one, as CSP reads a repeated directive), or `None`.
fn frame_ancestors(policy: &str) -> Option<Vec<String>> {
    policy.split(';').find_map(|directive| {
        let mut tokens = directive.split_ascii_whitespace();
        let name = tokens.next()?;
        name.eq_ignore_ascii_case("frame-ancestors").then(|| tokens.map(str::to_ascii_lowercase).collect())
    })
}

/// The HTML standard's "check a navigation response's adherence to X-Frame-Options", for one ancestor.
fn x_frame_options_allow(headers: &HeaderMap, page: &Url, ancestor: &Url) -> bool {
    let mut options: Vec<String> =
        values(headers, "x-frame-options").flat_map(|v| v.split(',')).map(|v| v.trim().to_ascii_lowercase()).collect();
    options.sort();
    options.dedup();
    if options.len() > 1 {
        return !options.iter().any(|o| o == "deny" || o == "sameorigin" || o == "allowall");
    }
    match options.first().map(String::as_str) {
        Some("deny") => false,
        Some("sameorigin") => page.origin() == ancestor.origin(),
        _ => true,
    }
}

/// CSP's scheme-part match: the same scheme, or `a`'s secure upgrade.
fn scheme_matches(a: &str, b: &str) -> bool {
    a == b || (a == "http" && b == "https") || (a == "ws" && matches!(b, "wss" | "http" | "https")) || (a == "wss" && b == "https")
}

/// Whether one `frame-ancestors` source (lowercase) matches `ancestor`; `page` is what `'self'` and a source without
/// a scheme refer to. `'none'` and the other keywords match nothing.
fn source_matches(source: &str, page: &Url, ancestor: &Url) -> bool {
    if source == "*" {
        return matches!(ancestor.scheme(), "http" | "https" | "ws" | "wss") || ancestor.scheme() == page.scheme();
    }
    if source == "'self'" {
        let upgraded = page.scheme() == "http"
            && ancestor.scheme() == "https"
            && page.host_str() == ancestor.host_str()
            && page.port().is_none()
            && ancestor.port().is_none();
        return page.origin() == ancestor.origin() || upgraded;
    }
    if source.starts_with('\'') {
        return false;
    }
    if let Some(scheme) = source.strip_suffix(':').filter(|s| is_scheme(s)) {
        return scheme_matches(scheme, ancestor.scheme());
    }
    let rest = match source.split_once("://") {
        Some((scheme, rest)) if is_scheme(scheme) => {
            if !scheme_matches(scheme, ancestor.scheme()) {
                return false;
            }
            rest
        }
        Some(_) => return false,
        None if !scheme_matches(page.scheme(), ancestor.scheme()) => return false,
        None => source,
    };
    let authority = rest.split('/').next().unwrap_or("");
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (authority, None),
    };
    host_matches(host, ancestor.host_str().unwrap_or("")) && port_matches(port, ancestor)
}

fn is_scheme(s: &str) -> bool {
    s.starts_with(|c: char| c.is_ascii_alphabetic()) && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
}

fn host_matches(pattern: &str, host: &str) -> bool {
    match pattern.strip_prefix('*') {
        Some("") => true,
        Some(suffix) => suffix.starts_with('.') && host.ends_with(suffix),
        None => pattern == host,
    }
}

fn port_matches(port: Option<&str>, ancestor: &Url) -> bool {
    match port {
        None => ancestor.port().is_none(),
        Some("*") => true,
        Some(port) => {
            let actual = ancestor.port_or_known_default();
            port.parse::<u16>().is_ok_and(|p| Some(p) == actual || (p == 80 && actual == Some(443)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.append(axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(), value.parse().unwrap());
        }
        map
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    const DASHBOARD: &str = "http://192.168.1.10:3922/";
    const PAGE: &str = "https://www.example.com/news";

    fn allowed(pairs: &[(&str, &str)], ancestor: &str) -> bool {
        may_frame(&headers(pairs), &url(PAGE), &url(ancestor))
    }

    #[test]
    fn a_page_without_either_header_may_be_framed() {
        assert!(allowed(&[], DASHBOARD));
        assert!(allowed(&[("content-security-policy", "default-src 'self'; script-src 'none'")], DASHBOARD));
        assert!(allowed(&[("x-frame-options", "")], DASHBOARD));
    }

    #[test]
    fn x_frame_options_deny_and_sameorigin() {
        assert!(!allowed(&[("x-frame-options", "DENY")], DASHBOARD));
        assert!(!allowed(&[("x-frame-options", " sameorigin ")], DASHBOARD));
        assert!(allowed(&[("x-frame-options", "SAMEORIGIN")], "https://www.example.com/other"));
        // An unknown value (ALLOW-FROM included) is ignored; ALLOWALL allows.
        assert!(allowed(&[("x-frame-options", "ALLOW-FROM https://a.test")], DASHBOARD));
        assert!(allowed(&[("x-frame-options", "ALLOWALL")], DASHBOARD));
    }

    #[test]
    fn repeated_x_frame_options_count_once_and_conflicting_ones_refuse() {
        assert!(!allowed(&[("x-frame-options", "DENY"), ("x-frame-options", "deny")], DASHBOARD));
        assert!(!allowed(&[("x-frame-options", "SAMEORIGIN, DENY")], "https://www.example.com/"));
        assert!(!allowed(&[("x-frame-options", "ALLOWALL, sameorigin")], DASHBOARD));
        // Two values neither of which is one of the three: nothing to enforce.
        assert!(allowed(&[("x-frame-options", "foo, bar")], DASHBOARD));
    }

    #[test]
    fn frame_ancestors_wins_over_x_frame_options() {
        let pairs = [("x-frame-options", "DENY"), ("content-security-policy", "frame-ancestors *")];
        assert!(allowed(&pairs, DASHBOARD));
        let pairs = [("x-frame-options", "ALLOWALL"), ("content-security-policy", "frame-ancestors 'none'")];
        assert!(!allowed(&pairs, DASHBOARD));
        // A report-only policy decides nothing.
        assert!(!allowed(&[("x-frame-options", "DENY"), ("content-security-policy-report-only", "frame-ancestors *")], DASHBOARD));
    }

    #[test]
    fn none_self_and_an_empty_list() {
        assert!(!allowed(&[("content-security-policy", "frame-ancestors 'none'")], DASHBOARD));
        assert!(!allowed(&[("content-security-policy", "frame-ancestors")], DASHBOARD));
        assert!(!allowed(&[("content-security-policy", "frame-ancestors 'self'")], DASHBOARD));
        assert!(allowed(&[("content-security-policy", "frame-ancestors 'self'")], "https://www.example.com/x"));
        assert!(!allowed(&[("content-security-policy", "frame-ancestors 'self'")], "https://example.com/"));
        // 'none' beside a source is just a source that matches nothing.
        assert!(allowed(&[("content-security-policy", "frame-ancestors 'none' http://192.168.1.10:3922")], DASHBOARD));
    }

    #[test]
    fn host_sources_with_wildcards_ports_and_schemes() {
        let csp = |sources: &str| [("content-security-policy", format!("default-src 'self'; FRAME-ANCESTORS {sources}"))];
        let check = |sources: &str, ancestor: &str| {
            let pairs = csp(sources);
            allowed(&[(pairs[0].0, pairs[0].1.as_str())], ancestor)
        };
        assert!(check("http://192.168.1.10:3922", DASHBOARD));
        assert!(check("http://192.168.1.10:*", DASHBOARD));
        assert!(!check("http://192.168.1.10", DASHBOARD), "no port means the scheme's default");
        assert!(!check("http://192.168.1.10:3923", DASHBOARD));
        assert!(check("http://localhost:*", "http://localhost:3922/"));
        assert!(!check("http://localhost:*", "http://127.0.0.1:3922/"));
        assert!(check("https://*.example.com", "https://dash.example.com/"));
        assert!(!check("https://*.example.com", "https://example.com/"));
        assert!(!check("https://*.example.com", "https://dash.example.com.evil.test/"));
        assert!(check("*", DASHBOARD));
        assert!(check("http:", DASHBOARD));
        assert!(!check("https:", DASHBOARD));
        // http matches its https upgrade, not the other way round; a source without a scheme takes the page's (https).
        assert!(check("http://dash.test", "https://dash.test/"));
        assert!(!check("https://dash.test", "http://dash.test/"));
        assert!(check("dash.test", "https://dash.test/"));
        assert!(!check("dash.test:3922", "http://dash.test:3922/"));
        assert!(check("https://dash.test/some/path", "https://dash.test/"));
    }

    #[test]
    fn every_policy_must_allow() {
        let pairs = [("content-security-policy", "frame-ancestors *"), ("content-security-policy", "frame-ancestors 'self'")];
        assert!(!allowed(&pairs, DASHBOARD));
        assert!(!allowed(&[("content-security-policy", "frame-ancestors *, frame-ancestors 'none'")], DASHBOARD));
        // The first frame-ancestors of a policy counts.
        assert!(allowed(&[("content-security-policy", "frame-ancestors *; frame-ancestors 'none'")], DASHBOARD));
    }

    #[test]
    fn the_sites_from_the_report() {
        // vg.no: DENY plus a frame-ancestors that names localhost on any port.
        let vg = [
            ("x-frame-options", "DENY"),
            ("content-security-policy", "frame-ancestors 'self' http://localhost:* https://*.aftonbladet.se"),
        ];
        assert!(!allowed(&vg, DASHBOARD));
        assert!(allowed(&vg, "http://localhost:3922/"));
        // reddit: SAMEORIGIN.
        assert!(!allowed(&[("x-frame-options", "SAMEORIGIN")], DASHBOARD));
    }
}
