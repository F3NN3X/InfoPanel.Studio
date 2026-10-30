// YouTube's live chat as pages in and events out: no I/O here. A page is what `liveChat/messages` answers; `parse_page` says
// what each item means for the chat window and what to ask next.

use serde_json::Value;

use crate::twitch::irc::{Entry, Message};

/// Messages are 200 characters at most on YouTube.
pub const MAX_SEND: usize = 200;

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Message(Entry),
    /// A message a moderator or its author removed (by message id).
    Deleted(String),
    /// A user banned from the chat (by channel id): their lines go.
    Banned(String),
}

/// One answer of the chat list.
#[derive(Debug, Clone, PartialEq)]
pub struct Page {
    pub events: Vec<Event>,
    /// Where the next page starts.
    pub next_token: String,
    /// How soon YouTube wants to be asked again.
    pub polling_ms: u64,
}

fn text(v: Option<&Value>) -> &str {
    v.and_then(Value::as_str).unwrap_or("")
}

fn flag(v: Option<&Value>) -> bool {
    v.and_then(Value::as_bool).unwrap_or(false)
}

/// "broadcaster", "mod", "sub" or "": the highest badge the author has.
fn badge_of(author: Option<&Value>) -> &'static str {
    if flag(author.and_then(|a| a.get("isChatOwner"))) {
        "broadcaster"
    } else if flag(author.and_then(|a| a.get("isChatModerator"))) {
        "mod"
    } else if flag(author.and_then(|a| a.get("isChatSponsor"))) {
        "sub"
    } else {
        ""
    }
}

/// A `publishedAt` (RFC 3339) in ms since the epoch, or `fallback`.
pub fn published_ms(snippet: Option<&Value>, fallback: i64) -> i64 {
    chrono::DateTime::parse_from_rfc3339(text(snippet.and_then(|s| s.get("publishedAt"))))
        .map_or(fallback, |t| t.timestamp_millis())
}

/// The line a snippet shows: its display text, else the typed text.
fn line_of(snippet: &Value) -> &str {
    let shown = text(snippet.get("displayMessage"));
    if shown.is_empty() {
        text(snippet.pointer("/textMessageDetails/messageText"))
    } else {
        shown
    }
}

/// One list item as an event, or `None` for a kind the chat doesn't show. `now` stands in for a missing time.
fn event_of(item: &Value, now: i64) -> Option<Event> {
    let snippet = item.get("snippet")?;
    match text(snippet.get("type")) {
        "textMessageEvent" | "superChatEvent" => {
            let (id, line) = (text(item.get("id")), line_of(snippet));
            if id.is_empty() || line.is_empty() {
                return None;
            }
            let author = item.get("authorDetails");
            let name = text(author.and_then(|a| a.get("displayName")));
            Some(Event::Message(Entry {
                message: Message {
                    id: id.to_string(),
                    platform: "youtube",
                    user: if name.is_empty() {
                        "?".to_string()
                    } else {
                        name.to_string()
                    },
                    text: line.to_string(),
                    color: String::new(),
                    badge: badge_of(author),
                    ts: published_ms(Some(snippet), now),
                },
                login: text(author.and_then(|a| a.get("channelId"))).to_string(),
            }))
        }
        "messageDeletedEvent" => {
            let id = text(snippet.pointer("/messageDeletedDetails/deletedMessageId"));
            (!id.is_empty()).then(|| Event::Deleted(id.to_string()))
        }
        "userBannedEvent" => {
            let id = text(snippet.pointer("/userBannedDetails/bannedUserDetails/channelId"));
            (!id.is_empty()).then(|| Event::Banned(id.to_string()))
        }
        _ => None,
    }
}

/// A list answer as events in order, with the token for the next page and the wait YouTube asks for.
pub fn parse_page(body: &Value, now: i64) -> Page {
    let items = body
        .get("items")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    Page {
        events: items
            .iter()
            .filter_map(|item| event_of(item, now))
            .collect(),
        next_token: text(body.get("nextPageToken")).to_string(),
        polling_ms: body
            .get("pollingIntervalMillis")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    }
}

/// The text to send: trimmed, 1 to 200 characters, on one line.
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
    use serde_json::json;

    fn message(id: &str, name: &str, flags: Value, at: &str) -> Value {
        json!({ "id": id, "snippet": { "type": "textMessageEvent", "publishedAt": at, "displayMessage": format!("hi from {name}"), "textMessageDetails": { "messageText": "typed" } },
            "authorDetails": { "channelId": format!("UC-{name}"), "displayName": name, "isChatOwner": flags["owner"], "isChatModerator": flags["mod"], "isChatSponsor": flags["sponsor"] } })
    }

    #[test]
    fn maps_a_page_to_messages_with_badges_times_and_the_next_request() {
        let none = json!({});
        let body = json!({ "nextPageToken": "NEXT", "pollingIntervalMillis": 5000, "items": [
            message("a", "Owner", json!({ "owner": true, "mod": true }), "2026-07-15T12:00:00.250Z"),
            message("b", "Mod", json!({ "mod": true, "sponsor": true }), "2026-07-15T12:00:01Z"),
            message("c", "Member", json!({ "sponsor": true }), "2026-07-15T12:00:02+00:00"),
            message("d", "Plain", none, "garbage"),
            { "id": "e", "snippet": { "type": "textMessageEvent", "textMessageDetails": { "messageText": "only typed" } }, "authorDetails": {} },
            { "id": "f", "snippet": { "type": "tombstone" } },
            { "id": "", "snippet": { "type": "textMessageEvent", "displayMessage": "no id" } },
            { "id": "g", "snippet": { "type": "textMessageEvent", "displayMessage": "" } },
        ] });
        let page = parse_page(&body, 777);
        assert_eq!((page.next_token.as_str(), page.polling_ms), ("NEXT", 5000));
        let messages: Vec<_> = page
            .events
            .iter()
            .map(|e| match e {
                Event::Message(m) => m.clone(),
                other => panic!("{other:?}"),
            })
            .collect();
        let badges: Vec<_> = messages
            .iter()
            .map(|m| (m.message.id.as_str(), m.message.badge))
            .collect();
        assert_eq!(
            badges,
            [
                ("a", "broadcaster"),
                ("b", "mod"),
                ("c", "sub"),
                ("d", ""),
                ("e", "")
            ]
        );
        assert_eq!(messages[0].message.ts, 1_784_116_800_250);
        assert_eq!(messages[2].message.ts, 1_784_116_802_000);
        // A bad time reads as now; no name reads as "?"; the display text wins over the typed one.
        assert_eq!(
            (
                messages[3].message.ts,
                messages[4].message.user.as_str(),
                messages[4].message.text.as_str()
            ),
            (777, "?", "only typed")
        );
        assert_eq!(messages[0].message.text, "hi from Owner");
        assert_eq!(
            (
                messages[0].message.platform,
                messages[0].message.color.as_str(),
                messages[0].login.as_str()
            ),
            ("youtube", "", "UC-Owner")
        );
    }

    #[test]
    fn reads_deletions_and_bans_and_an_empty_page() {
        let body = json!({ "items": [
            { "id": "x", "snippet": { "type": "messageDeletedEvent", "messageDeletedDetails": { "deletedMessageId": "a" } } },
            { "id": "y", "snippet": { "type": "userBannedEvent", "userBannedDetails": { "bannedUserDetails": { "channelId": "UC-Bad" }, "banType": "permanent" } } },
            { "id": "z", "snippet": { "type": "messageDeletedEvent", "messageDeletedDetails": {} } },
        ] });
        assert_eq!(
            parse_page(&body, 0).events,
            [Event::Deleted("a".into()), Event::Banned("UC-Bad".into())]
        );
        assert_eq!(
            parse_page(&json!({}), 0),
            Page {
                events: vec![],
                next_token: String::new(),
                polling_ms: 0
            }
        );
        assert_eq!(parse_page(&Value::Null, 0).events, []);
    }

    #[test]
    fn validates_what_is_sent() {
        assert_eq!(validate_send("  hi  ").unwrap(), "hi");
        assert!(validate_send("   ").is_err());
        assert!(validate_send("a\nb").is_err());
        assert!(validate_send("a\rb").is_err());
        assert!(validate_send(&"x".repeat(200)).is_ok());
        assert!(validate_send(&"x".repeat(201)).is_err());
        assert!(validate_send(&"é".repeat(200)).is_ok());
    }
}
