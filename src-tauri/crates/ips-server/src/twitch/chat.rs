// The chat window kept in memory (not persisted) and the rules for what we send.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

use super::irc::{Entry, Message};

/// Messages kept per platform.
pub const WINDOW: usize = 60;
pub const MAX_SEND: usize = 500;
/// Twitch's limit for an account that is not a moderator: 20 messages in 30 seconds.
const SEND_LIMIT: usize = 20;
const SEND_PERIOD: Duration = Duration::from_secs(30);

/// The last `WINDOW` messages, oldest first.
#[derive(Debug, Default)]
pub struct Window {
    entries: VecDeque<Entry>,
}

impl Window {
    /// Adds a message; one whose id is already there is ignored.
    pub fn push(&mut self, entry: Entry) {
        if self
            .entries
            .iter()
            .any(|e| e.message.id == entry.message.id)
        {
            return;
        }
        if self.entries.len() == WINDOW {
            self.entries.pop_front();
        }
        self.entries.push_back(entry);
    }

    /// A user's messages are removed (`login` in lowercase).
    pub fn clear_user(&mut self, login: &str) {
        self.entries.retain(|e| e.login != login);
    }

    pub fn clear_all(&mut self) {
        self.entries.clear();
    }

    pub fn remove(&mut self, id: &str) {
        self.entries.retain(|e| e.message.id != id);
    }

    pub fn messages(&self) -> Vec<Message> {
        self.entries.iter().map(|e| e.message.clone()).collect()
    }
}

/// Counts our sends against Twitch's limit.
#[derive(Debug, Default)]
pub struct SendLimiter {
    sent: VecDeque<Instant>,
}

impl SendLimiter {
    /// Records a send at `now` and says yes, or says no (nothing recorded) when the limit is reached.
    pub fn allow(&mut self, now: Instant) -> bool {
        while self
            .sent
            .front()
            .is_some_and(|t| now.duration_since(*t) >= SEND_PERIOD)
        {
            self.sent.pop_front();
        }
        if self.sent.len() >= SEND_LIMIT {
            return false;
        }
        self.sent.push_back(now);
        true
    }
}

/// The text to send: trimmed, 1 to 500 characters, on one line.
pub fn validate_send(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Type a message first.".into());
    }
    if text.chars().count() > MAX_SEND {
        return Err(format!("A message is at most {MAX_SEND} characters."));
    }
    if text.contains(['\r', '\n']) {
        return Err("A message is one line.".into());
    }
    Ok(text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, login: &str) -> Entry {
        Entry {
            message: Message {
                id: id.into(),
                platform: "twitch",
                user: login.into(),
                text: id.into(),
                color: String::new(),
                badge: "",
                ts: 0,
            },
            login: login.into(),
        }
    }

    #[test]
    fn keeps_the_last_sixty_oldest_first_and_ignores_a_repeated_id() {
        let mut w = Window::default();
        for i in 0..70 {
            w.push(entry(&format!("m{i}"), "a"));
        }
        w.push(entry("m69", "a"));
        let ids: Vec<_> = w.messages().into_iter().map(|m| m.id).collect();
        assert_eq!(ids.len(), WINDOW);
        assert_eq!((ids[0].as_str(), ids[59].as_str()), ("m10", "m69"));
    }

    #[test]
    fn removes_by_user_by_id_and_all() {
        let mut w = Window::default();
        for (id, login) in [("1", "a"), ("2", "b"), ("3", "a"), ("4", "c")] {
            w.push(entry(id, login));
        }
        w.clear_user("a");
        assert_eq!(
            w.messages()
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["2", "4"]
        );
        w.remove("2");
        assert_eq!(w.messages().len(), 1);
        w.clear_all();
        assert!(w.messages().is_empty());
    }

    #[test]
    fn limits_sends_to_twenty_in_thirty_seconds() {
        let mut limiter = SendLimiter::default();
        let start = Instant::now();
        assert!((0..20).all(|i| limiter.allow(start + Duration::from_millis(i))));
        assert!(!limiter.allow(start + Duration::from_secs(29)));
        // The refused one was not counted: once the first ones age out, sending resumes.
        assert!(limiter.allow(start + Duration::from_secs(30)));
    }

    #[test]
    fn validates_what_is_sent() {
        assert_eq!(validate_send("  hi  ").unwrap(), "hi");
        assert!(validate_send("   ").is_err());
        assert!(validate_send("a\nb").is_err());
        assert!(validate_send("a\rb").is_err());
        assert!(validate_send(&"x".repeat(500)).is_ok());
        assert!(validate_send(&"x".repeat(501)).is_err());
        assert!(validate_send(&"é".repeat(500)).is_ok());
    }
}
