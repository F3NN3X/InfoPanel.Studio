// The live chat as kiosks get it: Twitch's and YouTube's windows merged by time into one `{ messages, platforms }`, with its
// own latest-wins stream (`/events/chat`). Each platform tells the hub when its window changed.

use std::sync::Arc;

use axum::body::Bytes;
use serde_json::{json, Map, Value};
use tokio::sync::watch;

use crate::twitch::irc::Message;
use crate::twitch::Twitch;
use crate::youtube::Youtube;
use crate::{json::stringify, sse};

pub struct ChatHub {
    twitch: Arc<Twitch>,
    youtube: Arc<Youtube>,
    /// The chat as an event; a stream only ever needs the newest.
    latest: watch::Sender<Bytes>,
}

/// Both windows by time, oldest first; messages with the same time keep Twitch's first.
fn merge(mut twitch: Vec<Message>, youtube: Vec<Message>) -> Vec<Message> {
    twitch.extend(youtube);
    twitch.sort_by_key(|m| m.ts);
    twitch
}

impl ChatHub {
    pub fn new(twitch: Arc<Twitch>, youtube: Arc<Youtube>) -> Self {
        Self {
            twitch,
            youtube,
            latest: watch::channel(Bytes::new()).0,
        }
    }

    /// The event data: both windows by time, oldest first (a tie keeps Twitch's first), and each connected platform's state.
    pub fn json(&self) -> Value {
        let (twitch_messages, twitch) = self.twitch.chat_parts();
        let (youtube_messages, youtube) = self.youtube.chat_parts();
        let messages = merge(twitch_messages, youtube_messages);
        let mut platforms = Map::new();
        platforms.insert("twitch".into(), twitch);
        if let Some(youtube) = youtube {
            platforms.insert("youtube".into(), youtube);
        }
        json!({ "messages": messages, "platforms": platforms })
    }

    /// Makes the chat the one every open stream sends next. It is read inside the channel's lock, so of two publishes the
    /// later reader wins.
    pub fn publish(&self) {
        self.latest
            .send_modify(|event| *event = sse::event(&stringify(&self.json())));
    }

    /// A chat stream's receiver, holding the chat as of now.
    pub fn listen(&self) -> watch::Receiver<Bytes> {
        self.publish();
        self.latest.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guarded_net::GuardedClient;
    use crate::streaming::{TwitchSettings, YoutubeAuth, YoutubeSettings};

    fn message(id: &str, platform: &'static str, ts: i64) -> Message {
        Message {
            id: id.into(),
            platform,
            user: "u".into(),
            text: id.into(),
            color: String::new(),
            badge: "",
            ts,
        }
    }

    #[test]
    fn merges_by_time_and_keeps_twitch_first_on_a_tie() {
        let twitch = vec![message("t1", "twitch", 10), message("t2", "twitch", 30)];
        let youtube = vec![message("y1", "youtube", 10), message("y2", "youtube", 20)];
        let ids: Vec<_> = merge(twitch, youtube).into_iter().map(|m| m.id).collect();
        assert_eq!(ids, ["t1", "y1", "y2", "t2"]);
    }

    fn hub(youtube: YoutubeSettings) -> ChatHub {
        let twitch = Twitch::new(
            crate::twitch::auth::Endpoints::offline(),
            GuardedClient::open(),
            TwitchSettings::default(),
            |_| {},
            || {},
        );
        let youtube = Youtube::new(
            crate::youtube::auth::Endpoints::offline(),
            GuardedClient::open(),
            youtube,
            |_| {},
            || {},
        );
        ChatHub::new(twitch, youtube)
    }

    #[test]
    fn lists_youtube_among_the_platforms_only_once_signed_in() {
        let signed_out = hub(YoutubeSettings::default()).json();
        assert_eq!(
            signed_out,
            json!({ "messages": [], "platforms": { "twitch": { "connected": false, "channel": "" } } })
        );
        let auth = YoutubeAuth {
            access_token: "a".into(),
            refresh_token: "r".into(),
            expires_at: i64::MAX,
            channel: "Me".into(),
            channel_id: "UC1".into(),
        };
        let signed_in = hub(YoutubeSettings {
            auth,
            ..YoutubeSettings::default()
        });
        assert_eq!(
            signed_in.json()["platforms"]["youtube"],
            json!({ "connected": false, "channel": "Me" })
        );
        // The stream starts with the merged chat as of now.
        let rx = signed_in.listen();
        assert!(String::from_utf8_lossy(&rx.borrow()).contains("\"youtube\""));
    }
}
