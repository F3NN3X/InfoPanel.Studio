// Outgoing HTTP that cannot be pointed at this machine or its neighbours (server/calendar.mjs's `blockedAddress`,
// `guardedLookup`, `guardedFetch` and `checkTarget`; the image proxy reuses it). A name is resolved here, every
// address it has is checked, and the connection goes only to those addresses, so a name cannot answer differently
// between the check and the request. A redirect is the caller's to follow: the client never does, so each hop passes
// `check_target` again. The lookup and the block list are the client's, so a test can stand in for DNS.

use std::error::Error;
use std::fmt;
use std::future::Future;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::pin::Pin;
use std::sync::Arc;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::HeaderMap;

/// What the guard says for a refused address.
pub const NOT_ALLOWED: &str = "address not allowed";

/// An address a link may not reach: this machine (loopback, unspecified), link-local (which holds cloud metadata
/// services) and multicast. LAN addresses stay allowed: a calendar on a NAS is a real use. `block_lan` also refuses the
/// private ranges (the image proxy takes any URL a page names).
pub fn blocked_ip(ip: IpAddr, block_lan: bool) -> bool {
    match ip {
        IpAddr::V4(v4) => blocked_v4(v4, block_lan),
        IpAddr::V6(v6) => blocked_v6(v6, block_lan),
    }
}

fn blocked_v4(ip: Ipv4Addr, block_lan: bool) -> bool {
    let [a, b, _, _] = ip.octets();
    let lan = a == 10 || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168) || (a == 100 && (64..=127).contains(&b));
    a == 0 || a == 127 || (a == 169 && b == 254) || a >= 224 || (block_lan && lan)
}

fn blocked_v6(ip: Ipv6Addr, block_lan: bool) -> bool {
    let w = ip.segments();
    let zero = |from: usize, to: usize| w[from..to].iter().all(|x| *x == 0);
    // IPv4 inside IPv6, in any spelling ("::ffff:7f00:1" is 127.0.0.1): mapped, compatible and NAT64.
    let mapped = zero(0, 5) && w[5] == 0xffff;
    let compatible = zero(0, 6) && w[6] != 0;
    let nat64 = w[0] == 0x64 && w[1] == 0xff9b && zero(2, 6);
    if mapped || compatible || nat64 {
        return blocked_v4(Ipv4Addr::new((w[6] >> 8) as u8, (w[6] & 255) as u8, (w[7] >> 8) as u8, (w[7] & 255) as u8), block_lan);
    }
    let unspecified_or_loopback = zero(0, 7) && w[7] <= 1;
    unspecified_or_loopback || (w[0] & 0xffc0) == 0xfe80 || w[0] >> 8 == 0xff || (block_lan && (w[0] & 0xfe00) == 0xfc00)
}

/// `blockedAddress(ip, blockLan)` for text: a zone id (`fe80::1%eth0`) is ignored, and anything that is not an address
/// is blocked.
pub fn blocked_address(ip: &str, block_lan: bool) -> bool {
    if let Ok(v4) = ip.parse::<Ipv4Addr>() {
        return blocked_v4(v4, block_lan);
    }
    let bare = ip.to_lowercase();
    let bare = bare.split('%').next().unwrap_or("");
    bare.parse::<Ipv6Addr>().map_or(true, |v6| blocked_v6(v6, block_lan))
}

#[derive(Debug)]
struct NotAllowed;

impl fmt::Display for NotAllowed {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(NOT_ALLOWED)
    }
}

impl Error for NotAllowed {}

/// The addresses of a name, or the reason it has none.
pub type Lookup = Arc<dyn Fn(String) -> Pin<Box<dyn Future<Output = Result<Vec<IpAddr>, String>> + Send>> + Send + Sync>;

/// Whether a client refuses an address.
pub type Block = Arc<dyn Fn(IpAddr) -> bool + Send + Sync>;

/// The OS resolver, hosts file included.
pub fn os_lookup() -> Lookup {
    Arc::new(|host: String| {
        Box::pin(async move {
            let found = tokio::net::lookup_host((host.as_str(), 0)).await.map_err(|_| format!("getaddrinfo ENOTFOUND {host}"))?;
            Ok(found.map(|addr| addr.ip()).collect())
        })
    })
}

/// The resolver the client connects through: one lookup per connection, every address checked, and only those
/// addresses handed to the connector.
struct GuardedResolver {
    lookup: Lookup,
    block: Block,
}

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let (lookup, block) = (Arc::clone(&self.lookup), Arc::clone(&self.block));
        Box::pin(async move {
            let ips = lookup(name.as_str().to_string()).await?;
            if ips.is_empty() || ips.iter().any(|ip| block(*ip)) {
                return Err(NotAllowed.into());
            }
            Ok(Box::new(ips.into_iter().map(|ip| std::net::SocketAddr::new(ip, 0))) as Addrs)
        })
    }
}

/// A client that follows no redirects and uses no proxy (one would resolve the name itself), on the updater's TLS
/// setup: rustls on ring. The app installs the provider too; a second install is refused.
pub fn client_builder() -> reqwest::ClientBuilder {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).no_proxy()
}

/// A response whose body was read up to a limit.
pub struct Fetched {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

/// A response's status and headers, and its body up to `max_bytes` (more is "too large").
async fn read_capped(mut response: reqwest::Response, max_bytes: usize) -> Result<Fetched, String> {
    let (status, headers) = (response.status().as_u16(), response.headers().clone());
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(describe)? {
        if body.len() + chunk.len() > max_bytes {
            return Err("too large".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(Fetched { status, headers, body })
}

/// An HTTP client that connects only through the guard (`client_builder`'s, with the guarded resolver).
#[derive(Clone)]
pub struct GuardedClient {
    client: reqwest::Client,
    lookup: Lookup,
    block: Block,
}

impl GuardedClient {
    pub fn new(block_lan: bool) -> Result<Self, String> {
        Self::with(os_lookup(), Arc::new(move |ip| blocked_ip(ip, block_lan)))
    }

    /// A client that reaches any address, for tests against a local server.
    #[cfg(test)]
    pub(crate) fn open() -> Self {
        Self::with(os_lookup(), Arc::new(|_| false)).unwrap()
    }

    /// A client on the given lookup and block list (tests stand in for DNS with it).
    pub fn with(lookup: Lookup, block: Block) -> Result<Self, String> {
        let resolver = GuardedResolver { lookup: Arc::clone(&lookup), block: Arc::clone(&block) };
        let client = client_builder().dns_resolver(Arc::new(resolver)).build().map_err(describe)?;
        Ok(Self { client, lookup, block })
    }

    /// Whether this client refuses `ip`.
    pub fn blocks(&self, ip: IpAddr) -> bool {
        (self.block)(ip)
    }

    /// Refuses a URL that is not http(s) or whose host is, or resolves to, a blocked address (every address the name has).
    pub async fn check_target(&self, url: &url::Url) -> Result<(), String> {
        if url.scheme() != "https" && url.scheme() != "http" {
            return Err("not an http(s) link".into());
        }
        let ips = match url.host() {
            Some(url::Host::Ipv4(ip)) => vec![IpAddr::V4(ip)],
            Some(url::Host::Ipv6(ip)) => vec![IpAddr::V6(ip)],
            Some(url::Host::Domain(name)) => (self.lookup)(name.to_string()).await?,
            None => vec![],
        };
        if ips.is_empty() || ips.iter().any(|ip| self.blocks(*ip)) {
            return Err(NOT_ALLOWED.into());
        }
        Ok(())
    }

    /// One GET, its body read up to `max_bytes` (more is "too large"). The caller checks the target first.
    pub async fn get(&self, url: &url::Url, headers: &[(&str, &str)], max_bytes: usize) -> Result<Fetched, String> {
        read_capped(self.send(url, headers).await?, max_bytes).await
    }

    /// One POST of a form (`application/x-www-form-urlencoded`), its body read up to `max_bytes`. The caller checks the
    /// target first.
    pub async fn post_form(&self, url: &url::Url, headers: &[(&str, &str)], form: &[(&str, &str)], max_bytes: usize) -> Result<Fetched, String> {
        let body = url::form_urlencoded::Serializer::new(String::new()).extend_pairs(form).finish();
        let mut request = self.client.post(url.clone()).header("Content-Type", "application/x-www-form-urlencoded").body(body);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        read_capped(request.send().await.map_err(describe)?, max_bytes).await
    }

    /// One POST of a JSON body, its reply read up to `max_bytes`. The caller checks the target first.
    pub async fn post_json(&self, url: &url::Url, headers: &[(&str, &str)], body: &str, max_bytes: usize) -> Result<Fetched, String> {
        let mut request = self.client.post(url.clone()).header("Content-Type", "application/json").body(body.to_string());
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        read_capped(request.send().await.map_err(describe)?, max_bytes).await
    }

    /// One GET, answered once its head is in; the body is the caller's to read.
    pub async fn send(&self, url: &url::Url, headers: &[(&str, &str)]) -> Result<reqwest::Response, String> {
        let mut request = self.client.get(url.clone());
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        request.send().await.map_err(describe)
    }
}

/// Why a request failed, in the innermost cause's words. The URL is left out: a calendar link is a secret.
pub fn describe(error: reqwest::Error) -> String {
    let error = error.without_url();
    let mut cause: &(dyn Error + 'static) = &error;
    loop {
        if cause.downcast_ref::<NotAllowed>().is_some() {
            return NOT_ALLOWED.into();
        }
        match cause.source() {
            Some(next) => cause = next,
            None => return cause.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_this_machine_link_local_unspecified_and_multicast_not_the_lan() {
        for ip in ["127.0.0.1", "0.0.0.0", "169.254.169.254", "224.0.0.1", "::1", "::", "fe80::1", "::ffff:127.0.0.1"] {
            assert!(blocked_address(ip, false), "{ip}");
        }
        for ip in ["192.168.1.10", "10.0.0.5", "93.184.216.34", "2606:4700::1"] {
            assert!(!blocked_address(ip, false), "{ip}");
        }
    }

    #[test]
    fn reads_ipv4_inside_ipv6_in_any_spelling() {
        for ip in ["::ffff:7f00:1", "::FFFF:A9FE:A9FE", "64:ff9b::7f00:1", "::127.0.0.1", "0:0:0:0:0:0:0:1", "0000::", "FE80::1%eth0", "febf::1", "ff02::1", "not an ip"] {
            assert!(blocked_address(ip, false), "{ip}");
        }
        for ip in ["::ffff:c0a8:10a", "::ffff:192.168.1.10", "64:ff9b::5db8:d822", "2001:db8::1", "fec0::1"] {
            assert!(!blocked_address(ip, false), "{ip}");
        }
    }

    #[test]
    fn the_image_proxy_mode_refuses_the_private_ranges_too() {
        for ip in ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "100.64.0.1", "fc00::1", "fdff::1", "::ffff:192.168.1.10"] {
            assert!(blocked_address(ip, true), "{ip}");
        }
        for ip in ["172.32.0.1", "100.128.0.1", "93.184.216.34", "fe00::1"] {
            assert!(!blocked_address(ip, true), "{ip}");
        }
    }

    #[test]
    fn every_blocked_range_holds_its_edges_and_not_its_neighbours() {
        // (inside, just outside), with the LAN blocked as the image proxy has it.
        let edges = [
            ("0.255.255.255", "1.0.0.0"),
            ("127.0.0.0", "126.255.255.255"),
            ("127.255.255.255", "128.0.0.0"),
            ("169.254.0.0", "169.253.255.255"),
            ("169.254.255.255", "169.255.0.0"),
            ("224.0.0.0", "223.255.255.255"),
            ("255.255.255.255", "8.8.8.8"),
            ("10.0.0.0", "9.255.255.255"),
            ("10.255.255.255", "11.0.0.0"),
            ("172.16.0.0", "172.15.255.255"),
            ("172.31.255.255", "172.32.0.0"),
            ("192.168.0.0", "192.167.255.255"),
            ("192.168.255.255", "192.169.0.0"),
            ("100.64.0.0", "100.63.255.255"),
            ("100.127.255.255", "100.128.0.0"),
            ("::", "::2"),
            ("::1", "1::1"),
            ("fe80::", "fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
            ("febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fec0::"),
            ("ff00::", "feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
            ("fc00::", "fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
            ("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fe00::"),
            // IPv4-mapped, -compatible and NAT64 forms decide by the IPv4 inside.
            ("::ffff:127.0.0.1", "::ffff:8.8.8.8"),
            ("::ffff:7f00:1", "::fffe:7f00:1"),
            ("::ffff:10.0.0.1", "::ffff:11.0.0.0"),
            ("::ffff:100.64.0.1", "::ffff:100.128.0.0"),
            ("::ffff:169.254.169.254", "::ffff:169.255.0.0"),
            ("::ffff:0.0.0.0", "::ffff:1.0.0.0"),
            ("::127.0.0.1", "::8.8.8.8"),
            ("64:ff9b::7f00:1", "64:ff9b:1::7f00:1"),
            ("64:ff9b::c0a8:1", "64:ff9b::808:808"),
        ];
        for (inside, outside) in edges {
            assert!(blocked_address(inside, true), "{inside} should be blocked");
            assert!(!blocked_address(outside, true), "{outside} should pass");
        }
        // The calendar's mode keeps the LAN ranges.
        for lan in ["10.0.0.0", "172.31.255.255", "192.168.0.0", "100.64.0.0", "fc00::", "::ffff:192.168.1.1"] {
            assert!(!blocked_address(lan, false), "{lan}");
        }
    }

    #[tokio::test]
    async fn refuses_a_literal_or_a_name_that_is_blocked_and_a_scheme_that_is_not_http() {
        let client = GuardedClient::new(false).unwrap();
        for (url, why) in [
            ("http://127.0.0.1/a.ics", NOT_ALLOWED),
            ("http://[::1]/a.ics", NOT_ALLOWED),
            ("http://localhost/a.ics", NOT_ALLOWED),
            ("ftp://example.com/a.ics", "not an http(s) link"),
        ] {
            assert_eq!(client.check_target(&url.parse().unwrap()).await, Err(why.to_string()), "{url}");
        }
        assert_eq!(client.check_target(&"http://93.184.216.34/".parse().unwrap()).await, Ok(()));
    }

    #[tokio::test]
    async fn connects_only_through_the_guard_and_leaves_the_url_out_of_an_error() {
        // A name that resolves to this machine fails at connect time, whatever the caller checked.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let client = GuardedClient::new(false).unwrap();
        let url: url::Url = format!("http://localhost:{port}/secret-token.ics").parse().unwrap();
        let error = client.get(&url, &[], 1024).await.err().unwrap();
        assert_eq!(error, NOT_ALLOWED);
    }
}
