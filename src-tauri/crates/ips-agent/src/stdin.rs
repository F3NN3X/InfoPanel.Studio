// All of stdin, like agent-status.mjs: empty on a terminal, and whatever has arrived once the
// timeout passes.

use std::io::{IsTerminal, Read};
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// What JavaScript's `String.prototype.trim` strips: Rust's White_Space, less U+0085, plus U+FEFF.
fn is_js_space(c: char) -> bool {
    c != '\u{85}' && (c.is_whitespace() || c == '\u{feff}')
}

/// `input.trim() === ""`.
pub fn is_blank(input: &str) -> bool {
    input.chars().all(is_js_space)
}

pub fn read_all(timeout: Duration) -> String {
    let stdin = std::io::stdin();
    if stdin.is_terminal() {
        return String::new();
    }
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut lock = stdin.lock();
        let mut buf = [0u8; 8192];
        while let Ok(n) = lock.read(&mut buf) {
            if n == 0 || tx.send(buf[..n].to_vec()).is_err() {
                break;
            }
        }
        // Dropping the sender is the end of the input.
    });
    let deadline = Instant::now() + timeout;
    let mut bytes = Vec::new();
    while let Ok(chunk) = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_matches_javascript_trim() {
        assert!(is_blank(""));
        assert!(is_blank(" \r\n\t\u{a0}\u{feff}\u{2028}"));
        assert!(!is_blank("\u{85}"));
        assert!(!is_blank(" {} "));
    }
}
