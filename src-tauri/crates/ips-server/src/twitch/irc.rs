// Twitch chat's IRC dialect (IRCv3 tags on), as lines in and events out: no I/O here. A line is
// `[@tags ][:prefix ]COMMAND params [:trailing]`; `event` says what a line means for the chat window.

use std::collections::HashMap;

use serde::Serialize;

/// One line split into its parts. `params` holds the trailing text last.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub tags: HashMap<String, String>,
    pub prefix: String,
    pub command: String,
    pub params: Vec<String>,
}

/// A chat line as kiosks get it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Message {
    pub id: String,
    pub platform: &'static str,
    pub user: String,
    pub text: String,
    pub color: String,
    /// "broadcaster", "mod", "vip", "sub" or "".
    pub badge: &'static str,
    pub ts: i64,
}

/// A message with the login that sent it (what a CLEARCHAT names); the login is not published.
#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub message: Message,
    pub login: String,
}

/// How our own messages look, from the USERSTATE Twitch sends after a join and after each message we send.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Me {
    pub display: String,
    pub color: String,
    pub badge: &'static str,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Message(Entry),
    /// A user's messages are removed (a timeout or ban), or all of them.
    ClearChat(Option<String>),
    ClearMsg(String),
    Ping(String),
    /// Twitch asks for a new connection.
    Reconnect,
    AuthFailed,
    /// 001: the login was accepted.
    Welcome,
    UserState(Me),
    Other,
}

/// The value of an escaped tag: `\s` space, `\:` `;`, `\\` `\`, `\r`, `\n`; any other escape drops the backslash.
pub fn unescape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('s') => out.push(' '),
            Some(':') => out.push(';'),
            Some('\\') => out.push('\\'),
            Some('r') => out.push('\r'),
            Some('n') => out.push('\n'),
            Some(other) => out.push(other),
            None => {}
        }
    }
    out
}

/// Splits one line (without its CRLF), or `None` for an empty one.
pub fn parse_line(raw: &str) -> Option<Line> {
    let mut rest = raw.trim_end_matches(['\r', '\n']);
    let mut tags = HashMap::new();
    if let Some(tagged) = rest.strip_prefix('@') {
        let (list, after) = tagged.split_once(' ')?;
        for pair in list.split(';') {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            tags.insert(key.to_string(), unescape(value));
        }
        rest = after.trim_start();
    }
    let mut prefix = String::new();
    if let Some(prefixed) = rest.strip_prefix(':') {
        let (p, after) = prefixed.split_once(' ')?;
        prefix = p.to_string();
        rest = after.trim_start();
    }
    let (command, mut args) = rest.split_once(' ').unwrap_or((rest, ""));
    if command.is_empty() {
        return None;
    }
    let mut params = Vec::new();
    while !args.is_empty() {
        if let Some(trailing) = args.strip_prefix(':') {
            params.push(trailing.to_string());
            break;
        }
        let (param, after) = args.split_once(' ').unwrap_or((args, ""));
        params.push(param.to_string());
        args = after.trim_start();
    }
    Some(Line {
        tags,
        prefix,
        command: command.to_string(),
        params,
    })
}

/// The badge to show for a `badges` tag (`broadcaster/1,subscriber/12`): the highest of broadcaster, moderator, vip, subscriber.
pub fn badge_of(badges: &str) -> &'static str {
    let has = |name: &str| badges.split(',').any(|b| b.split('/').next() == Some(name));
    if has("broadcaster") {
        "broadcaster"
    } else if has("moderator") {
        "mod"
    } else if has("vip") {
        "vip"
    } else if has("subscriber") {
        "sub"
    } else {
        ""
    }
}

/// The login in a `nick!user@host` prefix.
fn nick_of(prefix: &str) -> &str {
    prefix.split('!').next().unwrap_or(prefix)
}

fn tag<'a>(line: &'a Line, name: &str) -> &'a str {
    line.tags.get(name).map_or("", String::as_str)
}

/// What a line means. `now_ms` stands in for a message that carries no timestamp.
pub fn event(line: &Line, now_ms: i64) -> Event {
    match line.command.as_str() {
        "PING" => Event::Ping(
            line.params
                .last()
                .cloned()
                .unwrap_or_else(|| "tmi.twitch.tv".into()),
        ),
        "RECONNECT" => Event::Reconnect,
        "001" => Event::Welcome,
        "NOTICE" => {
            let text = line
                .params
                .last()
                .map_or("", String::as_str)
                .to_ascii_lowercase();
            let on_login = line.params.first().is_some_and(|p| p == "*");
            if on_login
                && (text.contains("authentication failed")
                    || text.contains("improperly formatted auth"))
            {
                Event::AuthFailed
            } else {
                Event::Other
            }
        }
        "CLEARCHAT" => Event::ClearChat(line.params.get(1).map(|u| u.to_ascii_lowercase())),
        "CLEARMSG" => match tag(line, "target-msg-id") {
            "" => Event::Other,
            id => Event::ClearMsg(id.to_string()),
        },
        "USERSTATE" => Event::UserState(Me {
            display: tag(line, "display-name").to_string(),
            color: tag(line, "color").to_string(),
            badge: badge_of(tag(line, "badges")),
        }),
        "PRIVMSG" => message(line, now_ms).map_or(Event::Other, Event::Message),
        _ => Event::Other,
    }
}

fn message(line: &Line, now_ms: i64) -> Option<Entry> {
    let body = line.params.get(1)?;
    // `/me` arrives as CTCP ACTION; it is shown as the text.
    let text = body
        .strip_prefix("\u{1}ACTION ")
        .map_or(body.as_str(), |action| {
            action.strip_suffix('\u{1}').unwrap_or(action)
        })
        .to_string();
    let login = nick_of(&line.prefix).to_ascii_lowercase();
    let display = tag(line, "display-name");
    let id = tag(line, "id");
    Some(Entry {
        message: Message {
            id: if id.is_empty() {
                format!("{login}-{now_ms}")
            } else {
                id.to_string()
            },
            platform: "twitch",
            user: if display.is_empty() {
                nick_of(&line.prefix).to_string()
            } else {
                display.to_string()
            },
            text,
            color: tag(line, "color").to_string(),
            badge: badge_of(tag(line, "badges")),
            ts: tag(line, "tmi-sent-ts").parse().unwrap_or(now_ms),
        },
        login,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(raw: &str) -> Event {
        event(&parse_line(raw).unwrap(), 1000)
    }

    #[test]
    fn splits_tags_prefix_command_and_trailing_text() {
        let line = parse_line(
            "@a=1;b=x\\sy;c :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :hello there: you\r\n",
        )
        .unwrap();
        assert_eq!(line.tags["a"], "1");
        assert_eq!(line.tags["b"], "x y");
        assert_eq!(line.tags["c"], "");
        assert_eq!(line.prefix, "nick!nick@nick.tmi.twitch.tv");
        assert_eq!(line.command, "PRIVMSG");
        assert_eq!(line.params, ["#chan", "hello there: you"]);
        let bare = parse_line("PING :tmi.twitch.tv").unwrap();
        assert_eq!(
            (bare.command.as_str(), bare.params),
            ("PING", vec!["tmi.twitch.tv".to_string()])
        );
        assert!(parse_line("").is_none() && parse_line("@only=tags").is_none());
    }

    #[test]
    fn unescapes_tag_values() {
        assert_eq!(unescape("a\\sb\\:c\\\\d\\re\\nf"), "a b;c\\d\re\nf");
        assert_eq!(unescape("odd\\"), "odd");
        assert_eq!(unescape("\\x"), "x");
    }

    #[test]
    fn reads_a_message_with_its_tags() {
        let raw = "@badge-info=subscriber/8;badges=moderator/1,subscriber/6;color=#FF4500;display-name=Some\\sOne;id=abc-1;tmi-sent-ts=1700000000123 :someone!someone@someone.tmi.twitch.tv PRIVMSG #chan :Kappa hi";
        let Event::Message(entry) = ev(raw) else {
            panic!("not a message")
        };
        assert_eq!(entry.login, "someone");
        assert_eq!(
            entry.message,
            Message {
                id: "abc-1".into(),
                platform: "twitch",
                user: "Some One".into(),
                text: "Kappa hi".into(),
                color: "#FF4500".into(),
                badge: "mod",
                ts: 1_700_000_000_123
            }
        );
    }

    #[test]
    fn falls_back_to_the_nick_and_the_clock_and_reads_actions_as_text() {
        let Event::Message(entry) = ev(":Nick!n@n PRIVMSG #c :\u{1}ACTION waves\u{1}") else {
            panic!("not a message")
        };
        assert_eq!(entry.message.user, "Nick");
        assert_eq!(entry.message.text, "waves");
        assert_eq!(entry.message.ts, 1000);
        assert_eq!(entry.message.id, "nick-1000");
        assert_eq!(
            (entry.message.badge, entry.message.color.as_str()),
            ("", "")
        );
    }

    #[test]
    fn picks_the_highest_badge() {
        assert_eq!(badge_of("subscriber/12,vip/1,broadcaster/1"), "broadcaster");
        assert_eq!(badge_of("subscriber/12,moderator/1"), "mod");
        assert_eq!(badge_of("subscriber/3,vip/1"), "vip");
        assert_eq!(badge_of("subscriber/3,bits/100"), "sub");
        assert_eq!(badge_of("bits/100,premium/1"), "");
        assert_eq!(badge_of(""), "");
    }

    #[test]
    fn reads_clears_pings_reconnects_and_auth_failures() {
        assert_eq!(
            ev(":tmi.twitch.tv CLEARCHAT #chan :BadUser"),
            Event::ClearChat(Some("baduser".into()))
        );
        assert_eq!(ev(":tmi.twitch.tv CLEARCHAT #chan"), Event::ClearChat(None));
        assert_eq!(
            ev("@login=x;target-msg-id=m-9 :tmi.twitch.tv CLEARMSG #chan :gone"),
            Event::ClearMsg("m-9".into())
        );
        assert_eq!(
            ev("@login=x :tmi.twitch.tv CLEARMSG #chan :gone"),
            Event::Other
        );
        assert_eq!(
            ev("PING :tmi.twitch.tv"),
            Event::Ping("tmi.twitch.tv".into())
        );
        assert_eq!(ev(":tmi.twitch.tv RECONNECT"), Event::Reconnect);
        assert_eq!(
            ev(":tmi.twitch.tv NOTICE * :Login authentication failed"),
            Event::AuthFailed
        );
        assert_eq!(
            ev(":tmi.twitch.tv NOTICE * :Improperly formatted auth"),
            Event::AuthFailed
        );
        assert_eq!(ev(":tmi.twitch.tv NOTICE #chan :Slow mode"), Event::Other);
        assert_eq!(ev(":tmi.twitch.tv 001 me :Welcome, GLHF!"), Event::Welcome);
        assert_eq!(
            ev("@display-name=Me;color=#00FF7F;badges=broadcaster/1 :tmi.twitch.tv USERSTATE #chan"),
            Event::UserState(Me { display: "Me".into(), color: "#00FF7F".into(), badge: "broadcaster" })
        );
        assert_eq!(ev(":tmi.twitch.tv 372 me :motd"), Event::Other);
    }
}
