// A minimal HTTP/1.1 GET for the app's own server (health and debug stats). Loopback or a
// local address only, so no TLS, redirects or keep-alive.

use std::io::{ErrorKind, Read, Write};

/// The most a probe reads from a response.
const MAX_RESPONSE: u64 = 64 * 1024;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub struct Response {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum HttpError {
    /// Nothing listens on the port.
    Refused,
    /// Something accepted the connection but did not answer in time.
    Timeout,
    Other(String),
}

/// Windows retries a refused loopback connection for about two seconds before reporting it, so
/// connecting gets this much longer than the answer.
const CONNECT_GRACE: Duration = Duration::from_secs(3);

/// GET `path` from `host:port` (`host` as in a URL, IPv6 in brackets); `timeout` bounds the answer.
pub fn get(host: &str, port: u16, path: &str, timeout: Duration) -> Result<Response, HttpError> {
    let authority = format!("{host}:{port}");
    let addr = authority
        .to_socket_addrs()
        .map_err(|e| HttpError::Other(e.to_string()))?
        .next()
        .ok_or_else(|| HttpError::Other(format!("no address for {authority}")))?;
    let mut stream = TcpStream::connect_timeout(&addr, timeout + CONNECT_GRACE).map_err(|e| match e.kind() {
        ErrorKind::ConnectionRefused => HttpError::Refused,
        ErrorKind::TimedOut | ErrorKind::WouldBlock => HttpError::Timeout,
        _ => HttpError::Other(e.to_string()),
    })?;
    let io = |e: std::io::Error| match e.kind() {
        ErrorKind::TimedOut | ErrorKind::WouldBlock => HttpError::Timeout,
        _ => HttpError::Other(e.to_string()),
    };
    stream.set_read_timeout(Some(timeout)).map_err(io)?;
    stream.set_write_timeout(Some(timeout)).map_err(io)?;
    let request = format!("GET {path} HTTP/1.1\r\nHost: {authority}\r\nAccept: application/json\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).map_err(io)?;
    // A health answer is tiny; never buffer an endless body from whatever holds the port.
    let mut raw = Vec::new();
    stream.take(MAX_RESPONSE).read_to_end(&mut raw).map_err(io)?;
    parse_response(&raw).ok_or_else(|| HttpError::Other("malformed HTTP response".into()))
}

/// Status and body of a complete response (chunked bodies decoded).
pub fn parse_response(raw: &[u8]) -> Option<Response> {
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = std::str::from_utf8(&raw[..split]).ok()?;
    let body = &raw[split + 4..];
    let mut lines = head.split("\r\n");
    let status = lines.next()?.split_whitespace().nth(1)?.parse().ok()?;
    let chunked = lines.any(|l| {
        let (name, value) = l.split_once(':').unwrap_or((l, ""));
        name.trim().eq_ignore_ascii_case("transfer-encoding") && value.to_ascii_lowercase().contains("chunked")
    });
    let body = if chunked { decode_chunked(body)? } else { body.to_vec() };
    Some(Response { status, body: String::from_utf8_lossy(&body).into_owned() })
}

fn decode_chunked(mut data: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    loop {
        let end = data.windows(2).position(|w| w == b"\r\n")?;
        let size_line = std::str::from_utf8(&data[..end]).ok()?;
        let size = usize::from_str_radix(size_line.split(';').next()?.trim(), 16).ok()?;
        data = &data[end + 2..];
        if size == 0 {
            return Some(out);
        }
        out.extend_from_slice(data.get(..size)?);
        data = data.get(size + 2..)?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_plain_response() {
        let r = parse_response(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").unwrap();
        assert_eq!(r, Response { status: 200, body: "{}".into() });
    }

    #[test]
    fn decodes_chunked_bodies() {
        let raw = b"HTTP/1.1 404 Not Found\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n";
        let r = parse_response(raw).unwrap();
        assert_eq!(r.status, 404);
        assert_eq!(r.body, "abcde");
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_response(b"hello").is_none());
    }

    #[test]
    fn refused_when_nothing_listens() {
        // Bound but never listening, held until the end: a port bound and dropped can be handed to another
        // test's listener (the tests run in parallel) before the connection lands.
        let socket = socket2::Socket::new(socket2::Domain::IPV4, socket2::Type::STREAM, None).unwrap();
        socket.bind(&std::net::SocketAddr::from(([127, 0, 0, 1], 0)).into()).unwrap();
        let port = socket.local_addr().unwrap().as_socket().unwrap().port();
        let r = get("127.0.0.1", port, "/", Duration::from_millis(500));
        assert_eq!(r, Err(HttpError::Refused));
        drop(socket);
    }
}
