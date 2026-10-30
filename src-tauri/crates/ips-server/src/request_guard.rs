// The request gate (server/request-guard.mjs), applied before any routing.
//
// - Host allowlist (DNS rebinding defence): a Host whose hostname is not allowed is refused for every route. Allowed:
//   localhost, 127.0.0.1, [::1] (any port), the configured HOST and the ALLOWED_HOSTS names; when HOST listens on all
//   interfaces (0.0.0.0 / ::), any IP literal and this machine's name too.
// - Cross-site writes: for POST/PUT/PATCH/DELETE an `Origin` that is not the request's own host, or a
//   `Sec-Fetch-Site` other than same-origin / none, is refused.
// - The write refusals the routes apply (config, control, agents, remote edit).

use std::collections::HashSet;
use std::net::IpAddr;

use crate::js;

/// A refused request: its status and plain-text message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal {
    pub status: u16,
    pub message: String,
}

impl Refusal {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

const LOOPBACK_NAMES: [&str; 3] = ["localhost", "127.0.0.1", "[::1]"];
const WRITE_METHODS: [&str; 4] = ["POST", "PUT", "PATCH", "DELETE"];

pub const REMOTE_EDIT_MESSAGE: &str =
    "Editing from other devices is off. Turn it on in Settings > Server on the PC running InfoPanel Studio.";

/// The lowercase hostname (IPv6 keeps its brackets) of a Host header or origin host, or `None`.
pub fn hostname_of(value: Option<&str>) -> Option<String> {
    let v = js::trim(value.unwrap_or(""));
    let end = if let Some(inner) = v.strip_prefix('[') {
        let close = inner.find(']')?;
        let ip = &inner[..close];
        if ip.is_empty()
            || !ip
                .chars()
                .all(|c| c.is_ascii_hexdigit() || c == ':' || c == '.')
        {
            return None;
        }
        close + 2
    } else {
        v.find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')))
            .unwrap_or(v.len())
    };
    if end == 0 {
        return None;
    }
    let rest = &v[end..];
    if !rest.is_empty() {
        let port = rest.strip_prefix(':')?;
        if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
    }
    Some(v[..end].to_ascii_lowercase())
}

fn is_ip_literal(hostname: &str) -> bool {
    let bare = hostname.strip_prefix('[').unwrap_or(hostname);
    let bare = bare.strip_suffix(']').unwrap_or(bare);
    bare.parse::<IpAddr>().is_ok()
}

/// The host (`name[:port]`, the port only when not the scheme's default) of an `Origin` value, or `None`.
fn origin_host(origin: &str) -> Option<String> {
    let url = url::Url::parse(origin).ok()?;
    let host = url.host_str().filter(|h| !h.is_empty())?;
    Some(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    })
}

/// The Host allowlist and the cross-site write checks for one listen address.
#[derive(Debug, Clone)]
pub struct RequestGuard {
    names: HashSet<String>,
    all_exposed: bool,
}

impl RequestGuard {
    /// A guard for the listen address `host`, the extra `allowed_hosts` and this machine's name.
    pub fn new(host: &str, allowed_hosts: &[String], machine_name: &str) -> Self {
        let all_exposed = host == "0.0.0.0" || host == "::";
        let mut names: HashSet<String> = LOOPBACK_NAMES.iter().map(|n| n.to_string()).collect();
        for name in std::iter::once(host).chain(allowed_hosts.iter().map(String::as_str)) {
            if let Some(normalized) = hostname_of(Some(name)) {
                names.insert(normalized);
            }
        }
        if all_exposed && !machine_name.is_empty() {
            names.insert(machine_name.to_lowercase());
        }
        Self { names, all_exposed }
    }

    fn host_allowed(&self, hostname: &str) -> bool {
        self.names.contains(hostname) || (self.all_exposed && is_ip_literal(hostname))
    }

    /// The refusal for a request with these headers, or `None` to let it through.
    pub fn check(
        &self,
        method: &str,
        host: Option<&str>,
        sec_fetch_site: Option<&str>,
        origin: Option<&str>,
    ) -> Option<Refusal> {
        let hostname = match hostname_of(host) {
            Some(h) if self.host_allowed(&h) => h,
            _ => return Some(Refusal::new(421, "host not allowed")),
        };
        if !WRITE_METHODS.contains(&method) {
            return None;
        }
        if sec_fetch_site.is_some_and(|site| site != "same-origin" && site != "none") {
            return Some(Refusal::new(403, "cross-site request refused"));
        }
        if let Some(origin) = origin {
            let Some(origin_host) = origin_host(origin) else {
                return Some(Refusal::new(403, "origin not allowed"));
            };
            let same_host =
                origin_host.to_lowercase() == js::trim(host.unwrap_or("undefined")).to_lowercase();
            // A dev proxy may rewrite Host but not Origin: two loopback names are the same machine.
            let both_loopback = hostname_of(Some(&origin_host))
                .is_some_and(|h| LOOPBACK_NAMES.contains(&h.as_str()))
                && LOOPBACK_NAMES.contains(&hostname.as_str());
            if !same_host && !both_loopback {
                return Some(Refusal::new(403, "origin not allowed"));
            }
        }
        None
    }
}

/// The names of a comma-separated ALLOWED_HOSTS value.
pub fn parse_allowed_hosts(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or("")
        .split(',')
        .map(js::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

/// The media type of a Content-Type value: before any `;`, trimmed, lowercase.
fn media_type(content_type: Option<&str>) -> String {
    js::trim(content_type.unwrap_or("").split(';').next().unwrap_or("")).to_lowercase()
}

fn json_write_refusal(
    content_type: Option<&str>,
    marker: Option<&str>,
    missing: &str,
) -> Option<Refusal> {
    if media_type(content_type) != "application/json" {
        return Some(Refusal::new(415, "expected application/json"));
    }
    if marker != Some("1") {
        return Some(Refusal::new(403, missing));
    }
    None
}

/// Why a config write is refused (its Content-Type and `X-Dashboard-Config`), or `None`.
pub fn config_write_refusal(content_type: Option<&str>, marker: Option<&str>) -> Option<Refusal> {
    json_write_refusal(content_type, marker, "missing X-Dashboard-Config header")
}

/// Why a POST /api/control/* is refused (its Content-Type and `X-Dashboard-Control`), or `None`.
pub fn control_write_refusal(content_type: Option<&str>, marker: Option<&str>) -> Option<Refusal> {
    json_write_refusal(content_type, marker, "missing X-Dashboard-Control header")
}

/// Why a config or integrations write from `address` is refused: only this machine edits unless ALLOW_REMOTE_EDIT=1.
pub fn remote_edit_refusal(address: Option<&str>, allow_remote_edit: bool) -> Option<Refusal> {
    if allow_remote_edit || is_loopback(address) {
        return None;
    }
    Some(Refusal::new(403, REMOTE_EDIT_MESSAGE))
}

/// Whether a socket address is this machine (IPv4, IPv6, or IPv4 inside IPv6).
pub fn is_loopback(address: Option<&str>) -> bool {
    let a = address.unwrap_or("");
    a.starts_with("127.") || a == "::1" || a.starts_with("::ffff:127.")
}

/// Why a POST /api/agents/* is refused (this machine only, then Content-Type and `X-Agent-Event`), or `None`.
pub fn agent_write_refusal(
    content_type: Option<&str>,
    marker: Option<&str>,
    address: Option<&str>,
) -> Option<Refusal> {
    if !is_loopback(address) {
        return Some(Refusal::new(
            403,
            "agent status is accepted from this machine only",
        ));
    }
    json_write_refusal(content_type, marker, "missing X-Agent-Event header")
}
