// POST /api/audio/act's body, read into an action. Pure: every refusal is a message for the 400.

use serde_json::Value;

/// What a Windows write targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Output,
    Input,
    App,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WinAct {
    Volume {
        kind: Kind,
        id: String,
        value: u8,
    },
    /// `muted: None` toggles.
    Mute {
        kind: Kind,
        id: String,
        muted: Option<bool>,
    },
    /// Makes the endpoint the default for every role.
    Default {
        id: String,
    },
    /// Opens Windows' sound settings on this PC.
    Settings,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WlAct {
    /// With `mix`, the channel's level and mute on that mix only.
    Channel {
        id: String,
        mix: Option<String>,
        level: Option<u8>,
        muted: Option<bool>,
    },
    Mix {
        id: String,
        level: Option<u8>,
        muted: Option<bool>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Act {
    Windows(WinAct),
    WaveLink(WlAct),
}

fn text(body: &Value, key: &str) -> Result<String, String> {
    match body.get(key) {
        Some(Value::String(s)) if !s.is_empty() && s.len() <= 512 => Ok(s.clone()),
        _ => Err(format!("\"{key}\" must be a non-empty string")),
    }
}

fn percent(v: &Value, key: &str) -> Result<u8, String> {
    match v.as_f64() {
        Some(n) if (0.0..=100.0).contains(&n) => Ok(n.round() as u8),
        _ => Err(format!("\"{key}\" must be a number from 0 to 100")),
    }
}

fn optional_percent(body: &Value, key: &str) -> Result<Option<u8>, String> {
    body.get(key).map(|v| percent(v, key)).transpose()
}

fn optional_bool(body: &Value, key: &str) -> Result<Option<bool>, String> {
    match body.get(key) {
        None => Ok(None),
        Some(Value::Bool(b)) => Ok(Some(*b)),
        Some(_) => Err(format!("\"{key}\" must be true or false")),
    }
}

fn kind(body: &Value) -> Result<Kind, String> {
    match body.get("kind").and_then(Value::as_str) {
        Some("output") => Ok(Kind::Output),
        Some("input") => Ok(Kind::Input),
        Some("app") => Ok(Kind::App),
        _ => Err("\"kind\" must be output, input or app".into()),
    }
}

fn windows(body: &Value) -> Result<WinAct, String> {
    match body.get("op").and_then(Value::as_str) {
        Some("volume") => {
            let value = body
                .get("value")
                .ok_or("\"value\" must be a number from 0 to 100")?;
            Ok(WinAct::Volume {
                kind: kind(body)?,
                id: text(body, "id")?,
                value: percent(value, "value")?,
            })
        }
        Some("mute") => Ok(WinAct::Mute {
            kind: kind(body)?,
            id: text(body, "id")?,
            muted: optional_bool(body, "muted")?,
        }),
        Some("default") => Ok(WinAct::Default {
            id: text(body, "id")?,
        }),
        Some("settings") => Ok(WinAct::Settings),
        _ => Err("unknown windows op".into()),
    }
}

fn wavelink(body: &Value) -> Result<WlAct, String> {
    let (level, muted) = (
        optional_percent(body, "level")?,
        optional_bool(body, "muted")?,
    );
    if level.is_none() && muted.is_none() {
        return Err("give \"level\" or \"muted\"".into());
    }
    match body.get("op").and_then(Value::as_str) {
        Some("channel") => {
            let mix = match body.get("mix") {
                None | Some(Value::Null) => None,
                Some(_) => Some(text(body, "mix")?),
            };
            Ok(WlAct::Channel {
                id: text(body, "id")?,
                mix,
                level,
                muted,
            })
        }
        Some("mix") => Ok(WlAct::Mix {
            id: text(body, "id")?,
            level,
            muted,
        }),
        _ => Err("unknown wavelink op".into()),
    }
}

/// The action a request body asks for, or why it isn't one.
pub fn parse(body: &str) -> Result<Act, String> {
    let body: Value =
        serde_json::from_str(body).map_err(|_| "expected a JSON object".to_string())?;
    if !body.is_object() {
        return Err("expected a JSON object".into());
    }
    match body.get("target").and_then(Value::as_str) {
        Some("windows") => windows(&body).map(Act::Windows),
        Some("wavelink") => wavelink(&body).map(Act::WaveLink),
        _ => Err("\"target\" must be windows or wavelink".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(body: &str) -> Act {
        parse(body).unwrap_or_else(|e| panic!("{body}: {e}"))
    }

    #[test]
    fn reads_each_windows_op() {
        assert_eq!(
            ok(r#"{"target":"windows","op":"volume","kind":"app","id":"discord.exe","value":42}"#),
            Act::Windows(WinAct::Volume {
                kind: Kind::App,
                id: "discord.exe".into(),
                value: 42
            })
        );
        assert_eq!(
            ok(r#"{"target":"windows","op":"mute","kind":"input","id":"{x}"}"#),
            Act::Windows(WinAct::Mute {
                kind: Kind::Input,
                id: "{x}".into(),
                muted: None
            })
        );
        assert_eq!(
            ok(r#"{"target":"windows","op":"mute","kind":"output","id":"a","muted":false}"#),
            Act::Windows(WinAct::Mute {
                kind: Kind::Output,
                id: "a".into(),
                muted: Some(false)
            })
        );
        assert_eq!(
            ok(r#"{"target":"windows","op":"default","id":"a"}"#),
            Act::Windows(WinAct::Default { id: "a".into() })
        );
        assert_eq!(
            ok(r#"{"target":"windows","op":"settings"}"#),
            Act::Windows(WinAct::Settings)
        );
    }

    #[test]
    fn reads_the_wave_link_ops() {
        assert_eq!(
            ok(r#"{"target":"wavelink","op":"channel","id":"c1","mix":"m1","level":50.4}"#),
            Act::WaveLink(WlAct::Channel {
                id: "c1".into(),
                mix: Some("m1".into()),
                level: Some(50),
                muted: None
            })
        );
        assert_eq!(
            ok(r#"{"target":"wavelink","op":"channel","id":"c1","muted":true}"#),
            Act::WaveLink(WlAct::Channel {
                id: "c1".into(),
                mix: None,
                level: None,
                muted: Some(true)
            })
        );
        assert_eq!(
            ok(r#"{"target":"wavelink","op":"mix","id":"m1","level":0,"muted":false}"#),
            Act::WaveLink(WlAct::Mix {
                id: "m1".into(),
                level: Some(0),
                muted: Some(false)
            })
        );
    }

    #[test]
    fn refuses_what_is_not_an_action() {
        let bad = [
            "",
            "not json",
            "[]",
            "{}",
            r#"{"target":"sonos","op":"mix"}"#,
            r#"{"target":"windows","op":"explode"}"#,
            r#"{"target":"windows","op":"volume","kind":"app","id":"a"}"#,
            r#"{"target":"windows","op":"volume","kind":"app","id":"a","value":101}"#,
            r#"{"target":"windows","op":"volume","kind":"app","id":"a","value":-1}"#,
            r#"{"target":"windows","op":"volume","kind":"app","id":"a","value":"50"}"#,
            r#"{"target":"windows","op":"volume","kind":"speaker","id":"a","value":5}"#,
            r#"{"target":"windows","op":"volume","kind":"app","id":"","value":5}"#,
            r#"{"target":"windows","op":"mute","kind":"app","id":"a","muted":"yes"}"#,
            r#"{"target":"windows","op":"default"}"#,
            r#"{"target":"wavelink","op":"channel","id":"c"}"#,
            r#"{"target":"wavelink","op":"channel","level":5}"#,
            r#"{"target":"wavelink","op":"mix","id":"m","level":150}"#,
            r#"{"target":"wavelink","op":"channel","id":"c","mix":7,"level":5}"#,
        ];
        for body in bad {
            assert!(parse(body).is_err(), "{body}");
        }
    }
}
