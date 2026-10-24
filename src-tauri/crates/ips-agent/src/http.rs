// One POST, like agent-status.mjs's fetch: raw TcpStream, no TLS, gives up after the timeout
// (connect, write and waiting for the response head together) and never reports a failure.

use socket2::{Domain, Protocol, Socket, Type};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

/// A parsed `http://host[:port][/prefix]` base URL.
#[derive(Debug, PartialEq)]
pub struct Base {
    /// Without the brackets of an IPv6 literal.
    pub host: String,
    pub port: u16,
    /// Everything after the authority; the request path is appended to it.
    pub prefix: String,
}

impl Base {
    /// None for anything but a plain http URL (the forwarder has no TLS).
    pub fn parse(url: &str) -> Option<Base> {
        let rest = url
            .get(..7)
            .filter(|s| s.eq_ignore_ascii_case("http://"))
            .map(|_| &url[7..])?;
        let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
        let (authority, prefix) = rest.split_at(end);
        let authority = authority.rsplit('@').next().unwrap_or(authority);
        let (host, port) = match authority.strip_prefix('[') {
            Some(v6) => {
                let (host, after) = v6.split_once(']')?;
                (host, after.strip_prefix(':').unwrap_or(""))
            }
            None => authority.rsplit_once(':').unwrap_or((authority, "")),
        };
        if host.is_empty() {
            return None;
        }
        let port = if port.is_empty() {
            80
        } else {
            port.parse().ok()?
        };
        Some(Base {
            host: host.to_owned(),
            port,
            prefix: prefix.to_owned(),
        })
    }

    /// The Host header: the port only when it is not the default.
    fn host_header(&self) -> String {
        let host = if self.host.contains(':') {
            format!("[{}]", self.host)
        } else {
            self.host.clone()
        };
        if self.port == 80 {
            host
        } else {
            format!("{host}:{}", self.port)
        }
    }

    fn addresses(&self) -> Vec<SocketAddr> {
        let mut addrs: Vec<SocketAddr> = (self.host.as_str(), self.port)
            .to_socket_addrs()
            .map(Iterator::collect)
            .unwrap_or_default();
        addrs.sort_by_key(SocketAddr::is_ipv6);
        addrs
    }
}

fn request(base: &Base, path: &str, body: &str) -> Vec<u8> {
    let mut out = format!(
        "POST {}{path} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nX-Agent-Event: 1\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        base.prefix,
        base.host_header(),
        body.len()
    )
    .into_bytes();
    out.extend_from_slice(body.as_bytes());
    out
}

/// Windows keeps retrying a refused loopback connection for about two seconds, which would hold a
/// statusline up when the dashboard is not running; Node (libuv) turns the retries off, so does this.
#[cfg(windows)]
fn no_syn_retries(socket: &Socket) {
    use std::os::windows::io::AsRawSocket;
    use windows_sys::Win32::Networking::WinSock::{
        WSAIoctl, SIO_TCP_INITIAL_RTO, TCP_INITIAL_RTO_DEFAULT_RTT,
        TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS, TCP_INITIAL_RTO_PARAMETERS,
    };
    let params = TCP_INITIAL_RTO_PARAMETERS {
        Rtt: TCP_INITIAL_RTO_DEFAULT_RTT as u16,
        MaxSynRetransmissions: TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS as u8,
    };
    let mut returned = 0u32;
    // SAFETY: the socket is open for the whole call and the buffers outlive it; a failure is ignored.
    unsafe {
        WSAIoctl(
            socket.as_raw_socket() as usize,
            SIO_TCP_INITIAL_RTO,
            std::ptr::from_ref(&params).cast(),
            std::mem::size_of::<TCP_INITIAL_RTO_PARAMETERS>() as u32,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
            None,
        );
    }
}

fn connect(addr: &SocketAddr, timeout: Duration) -> std::io::Result<TcpStream> {
    let socket = Socket::new(
        Domain::for_address(*addr),
        Type::STREAM,
        Some(Protocol::TCP),
    )?;
    #[cfg(windows)]
    no_syn_retries(&socket);
    socket.connect_timeout(&(*addr).into(), timeout)?;
    Ok(socket.into())
}

/// POST `body` to `path` under `base`; every error is swallowed.
pub fn post(base: &Base, path: &str, body: &str, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    let left = || {
        deadline
            .saturating_duration_since(Instant::now())
            .max(Duration::from_millis(1))
    };
    let Some(mut stream) = base
        .addresses()
        .into_iter()
        .find_map(|a| connect(&a, left()).ok())
    else {
        return;
    };
    let _ = stream.set_write_timeout(Some(left()));
    if stream.write_all(&request(base, path, body)).is_err() {
        return;
    }
    // Like fetch, finished once the response head is in; the body is never read.
    let mut head = Vec::new();
    let mut buf = [0u8; 1024];
    while Instant::now() < deadline && !head.windows(4).any(|w| w == b"\r\n\r\n") {
        let _ = stream.set_read_timeout(Some(left()));
        match stream.read(&mut buf) {
            Ok(n) if n > 0 => head.extend_from_slice(&buf[..n]),
            _ => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(url: &str) -> Option<(String, u16, String)> {
        Base::parse(url).map(|b| (b.host, b.port, b.prefix))
    }

    #[test]
    fn parses_the_base_url() {
        assert_eq!(
            base("http://127.0.0.1:3922"),
            Some(("127.0.0.1".into(), 3922, "".into()))
        );
        assert_eq!(
            base("HTTP://localhost"),
            Some(("localhost".into(), 80, "".into()))
        );
        assert_eq!(
            base("http://[::1]:9/p/q"),
            Some(("::1".into(), 9, "/p/q".into()))
        );
        assert_eq!(base("http://u:p@h:5/x"), Some(("h".into(), 5, "/x".into())));
        assert_eq!(base("https://h"), None);
        assert_eq!(base("h:1"), None);
        assert_eq!(base("http://h:nope"), None);
        assert_eq!(base("http://"), None);
    }

    #[test]
    fn writes_the_headers_the_server_reads() {
        let b = Base::parse("http://127.0.0.1:3922/pre").unwrap();
        let req =
            String::from_utf8(request(&b, "/api/agents/event?agent=codex", "{\"a\":1}")).unwrap();
        assert!(req.starts_with(
            "POST /pre/api/agents/event?agent=codex HTTP/1.1\r\nHost: 127.0.0.1:3922\r\n"
        ));
        assert!(req.contains("\r\nContent-Type: application/json\r\n"));
        assert!(req.contains("\r\nX-Agent-Event: 1\r\n"));
        assert!(req.contains("\r\nContent-Length: 7\r\n"));
        assert!(req.ends_with("\r\n\r\n{\"a\":1}"));
    }
}
