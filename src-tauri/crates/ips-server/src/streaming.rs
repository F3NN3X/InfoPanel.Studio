// The Streaming widgets' saved settings: the `streaming` section of integrations.json, beside `obs` and `calendar`. The OBS
// section holds the mic input the Stream Control tile follows and, per scene, the line under its name and its icon. Nothing
// in it is secret, so the studio reads it back whole. The Twitch section holds the chat channel and, secret, the sign-in's
// tokens: the studio's view (`to_json`) leaves the tokens out, the file (`to_stored_json`) keeps them. Absent from the file
// (and from every output) until something is set.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use crate::integrations::text;

/// Most scenes with a saved look.
pub const MAX_SCENES: usize = 64;
const MAX_ID: usize = 128;
const MAX_MIC: usize = 256;
const MAX_SUB: usize = 60;
const MAX_ICON: usize = 40;
const MAX_TOKEN: usize = 512;
/// Twitch logins are 25 characters at most.
const MAX_LOGIN: usize = 25;

/// What the Stream Control tile shows for a scene besides its name.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SceneLook {
    pub sub: String,
    /// A Material Symbols name; "" = the tile's default.
    pub icon: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ObsStreaming {
    /// The OBS input whose mute and level the tile follows; "" = none.
    pub mic: String,
    /// By scene id (its uuid, or its name on an OBS without uuids).
    pub scenes: BTreeMap<String, SceneLook>,
}

/// What a Twitch sign-in leaves: secret, written only by the server's own sign-in (never by a studio patch).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TwitchAuth {
    pub access_token: String,
    pub refresh_token: String,
    /// When the access token runs out, in ms since the epoch.
    pub expires_at: i64,
    pub login: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct TwitchSettings {
    /// The chat to read; "" = the signed-in user's own.
    pub channel: String,
    pub auth: TwitchAuth,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Streaming {
    pub obs: ObsStreaming,
    pub twitch: TwitchSettings,
}

impl Streaming {
    fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

fn look_of(raw: &Value) -> SceneLook {
    SceneLook {
        sub: text(raw.get("sub"), MAX_SUB),
        icon: text(raw.get("icon"), MAX_ICON),
    }
}

fn normalize_obs(raw: Option<&Value>) -> ObsStreaming {
    let Some(obs) = raw.and_then(Value::as_object) else {
        return ObsStreaming::default();
    };
    let scenes = obs
        .get("scenes")
        .and_then(Value::as_object)
        .into_iter()
        .flatten();
    ObsStreaming {
        mic: text(obs.get("mic"), MAX_MIC),
        scenes: scenes
            .filter(|(id, look)| !id.is_empty() && id.len() <= MAX_ID && look.is_object())
            .map(|(id, look)| (id.clone(), look_of(look)))
            .filter(|(_, look)| *look != SceneLook::default())
            .take(MAX_SCENES)
            .collect(),
    }
}

fn normalize_twitch(raw: Option<&Value>) -> TwitchSettings {
    let Some(twitch) = raw.and_then(Value::as_object) else {
        return TwitchSettings::default();
    };
    TwitchSettings {
        channel: clean_channel(twitch.get("channel")).unwrap_or_default(),
        auth: TwitchAuth {
            access_token: text(twitch.get("access_token"), MAX_TOKEN),
            refresh_token: text(twitch.get("refresh_token"), MAX_TOKEN),
            expires_at: twitch.get("expires_at").and_then(Value::as_i64).unwrap_or(0),
            login: text(twitch.get("login"), MAX_LOGIN),
            user_id: text(twitch.get("user_id"), MAX_LOGIN),
        },
    }
}

/// A Twitch channel name: lowercase letters, digits and `_` (a leading `#` is dropped); "" for none; `None` for anything else.
pub fn clean_channel(v: Option<&Value>) -> Option<String> {
    let raw = text(v, MAX_LOGIN + 1);
    let name = raw.strip_prefix('#').unwrap_or(&raw).to_ascii_lowercase();
    let valid = name.len() <= MAX_LOGIN && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_');
    valid.then_some(name)
}

/// Tolerant read of the stored section.
pub fn normalize(raw: Option<&Value>) -> Streaming {
    let Some(raw) = raw.and_then(Value::as_object) else {
        return Streaming::default();
    };
    Streaming { obs: normalize_obs(raw.get("obs")), twitch: normalize_twitch(raw.get("twitch")) }
}

fn obs_json(s: &Streaming) -> Value {
    let scenes: Map<String, Value> = s
        .obs
        .scenes
        .iter()
        .map(|(id, look)| (id.clone(), json!({ "sub": look.sub, "icon": look.icon })))
        .collect();
    json!({ "mic": s.obs.mic, "scenes": scenes })
}

/// The section as the studio sees it, or `None` while nothing is set. The Twitch tokens are not in it.
pub fn to_json(s: &Streaming) -> Option<Value> {
    if s.is_empty() {
        return None;
    }
    let mut section = json!({ "obs": obs_json(s) });
    if s.twitch != TwitchSettings::default() {
        section["twitch"] = json!({ "channel": s.twitch.channel, "login": s.twitch.auth.login });
    }
    Some(section)
}

/// The section as stored, tokens included, or `None` while nothing is set.
pub fn to_stored_json(s: &Streaming) -> Option<Value> {
    let mut section = to_json(s)?;
    if s.twitch != TwitchSettings::default() {
        let a = &s.twitch.auth;
        section["twitch"] = json!({
            "channel": s.twitch.channel, "access_token": a.access_token, "refresh_token": a.refresh_token,
            "expires_at": a.expires_at, "login": a.login, "user_id": a.user_id,
        });
    }
    Some(section)
}

/// The state with a `streaming` patch applied, or the error to answer with:
/// - `obs.mic`: the input's name; "" clears it, absent keeps it.
/// - `obs.scenes`: the full map of { sub?, icon? } by scene id; a scene with neither is dropped.
/// - `twitch.channel`: the chat to read; "" = the signed-in user's own, absent keeps it. The tokens are not settable here.
pub fn apply(s: &Streaming, patch: &Value) -> Result<Streaming, String> {
    let Some(patch) = patch.as_object() else {
        return Err("streaming: expected an object".into());
    };
    let mut next = s.clone();
    if let Some(obs) = patch.get("obs") {
        let Some(obs) = obs.as_object() else {
            return Err("streaming.obs: expected an object".into());
        };
        match obs.get("mic") {
            None => {}
            Some(Value::String(_)) => next.obs.mic = text(obs.get("mic"), MAX_MIC),
            Some(_) => return Err("streaming.obs.mic: expected text".into()),
        }
        if let Some(scenes) = obs.get("scenes") {
            next.obs.scenes = apply_scenes(scenes)?;
        }
    }
    if let Some(twitch) = patch.get("twitch") {
        let Some(twitch) = twitch.as_object() else {
            return Err("streaming.twitch: expected an object".into());
        };
        match twitch.get("channel") {
            None => {}
            Some(channel @ Value::String(_)) => {
                next.twitch.channel = clean_channel(Some(channel)).ok_or("streaming.twitch.channel: a Twitch channel name")?;
            }
            Some(_) => return Err("streaming.twitch.channel: expected text".into()),
        }
    }
    Ok(next)
}

/// Drops from a patch's `streaming.obs.scenes` the looks of scenes not in `known` (OBS's current list), so deleted scenes
/// do not pile up toward `MAX_SCENES`.
pub fn prune_patch(patch: &mut Value, known: &[String]) {
    let scenes = patch.get_mut("streaming").and_then(|s| s.get_mut("obs")).and_then(|o| o.get_mut("scenes")).and_then(Value::as_object_mut);
    if let Some(scenes) = scenes {
        scenes.retain(|id, _| known.contains(id));
    }
}

fn apply_scenes(scenes: &Value) -> Result<BTreeMap<String, SceneLook>, String> {
    let Some(scenes) = scenes.as_object() else {
        return Err("streaming.obs.scenes: expected an object".into());
    };
    if scenes.len() > MAX_SCENES {
        return Err(format!("streaming.obs.scenes: at most {MAX_SCENES}"));
    }
    let mut out = BTreeMap::new();
    for (id, look) in scenes {
        if id.is_empty() || id.len() > MAX_ID {
            return Err("streaming.obs.scenes: a scene id is 1 to 128 characters".into());
        }
        if !look.is_object() {
            return Err("streaming.obs.scenes: expected { sub, icon } objects".into());
        }
        let look = look_of(look);
        if look != SceneLook::default() {
            out.insert(id.clone(), look);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_absent_until_something_is_set() {
        assert_eq!(normalize(None), Streaming::default());
        assert_eq!(
            normalize(Some(&json!({ "obs": { "mic": "", "scenes": {} } }))),
            Streaming::default()
        );
        assert_eq!(to_json(&Streaming::default()), None);
    }

    #[test]
    fn reads_the_stored_section_tolerantly_and_bounds_the_texts() {
        let long = "x".repeat(300);
        let raw = json!({ "obs": { "mic": format!("  {long}  "), "scenes": {
            "a": { "sub": long, "icon": "movie" },
            "b": "nope",
            "c": {},
            "": { "sub": "dropped" },
        } } });
        let s = normalize(Some(&raw));
        assert_eq!(s.obs.mic.len(), MAX_MIC);
        assert_eq!(s.obs.scenes.len(), 1);
        assert_eq!(s.obs.scenes["a"].sub.len(), MAX_SUB);
        assert_eq!(s.obs.scenes["a"].icon, "movie");
        assert_eq!(normalize(Some(&json!("x"))), Streaming::default());
        assert_eq!(normalize(Some(&json!({ "obs": 5 }))), Streaming::default());
    }

    #[test]
    fn patches_the_mic_and_replaces_the_scene_map() {
        let first = apply(&Streaming::default(), &json!({ "obs": { "mic": "Mic/Aux", "scenes": { "u1": { "sub": "Main cam", "icon": "videocam" }, "u2": { "sub": "", "icon": "" } } } })).unwrap();
        assert_eq!(first.obs.mic, "Mic/Aux");
        assert_eq!(first.obs.scenes.keys().collect::<Vec<_>>(), ["u1"]);
        // Absent keeps; "" clears the mic; a scenes map replaces the whole map.
        let kept = apply(&first, &json!({ "obs": {} })).unwrap();
        assert_eq!(kept, first);
        let cleared = apply(
            &first,
            &json!({ "obs": { "mic": "", "scenes": { "u3": { "icon": "movie" } } } }),
        )
        .unwrap();
        assert_eq!(cleared.obs.mic, "");
        assert_eq!(cleared.obs.scenes.keys().collect::<Vec<_>>(), ["u3"]);
        assert_eq!(
            to_json(&cleared).unwrap(),
            json!({ "obs": { "mic": "", "scenes": { "u3": { "sub": "", "icon": "movie" } } } })
        );
    }

    #[test]
    fn prunes_the_looks_of_scenes_obs_no_longer_has() {
        let mut patch = json!({ "streaming": { "obs": { "mic": "M", "scenes": { "a": { "sub": "x" }, "gone": { "sub": "y" } } } } });
        prune_patch(&mut patch, &["a".to_string(), "b".to_string()]);
        assert_eq!(patch, json!({ "streaming": { "obs": { "mic": "M", "scenes": { "a": { "sub": "x" } } } } }));
        // Patches without a scenes map are left alone.
        let mut other = json!({ "obs": { "host": "h" }, "streaming": { "obs": { "mic": "M" } } });
        let before = other.clone();
        prune_patch(&mut other, &[]);
        assert_eq!(other, before);
    }

    #[test]
    fn refuses_a_malformed_patch_and_too_many_scenes() {
        let e = Streaming::default();
        let refusal = |patch: Value| apply(&e, &patch).unwrap_err();
        assert_eq!(refusal(json!([])), "streaming: expected an object");
        assert_eq!(
            refusal(json!({ "obs": 1 })),
            "streaming.obs: expected an object"
        );
        assert_eq!(
            refusal(json!({ "obs": { "mic": 3 } })),
            "streaming.obs.mic: expected text"
        );
        assert_eq!(
            refusal(json!({ "obs": { "scenes": [] } })),
            "streaming.obs.scenes: expected an object"
        );
        assert_eq!(
            refusal(json!({ "obs": { "scenes": { "a": 1 } } })),
            "streaming.obs.scenes: expected { sub, icon } objects"
        );
        assert_eq!(
            refusal(json!({ "obs": { "scenes": { "x".repeat(129): {} } } })),
            "streaming.obs.scenes: a scene id is 1 to 128 characters"
        );
        let many: Map<String, Value> = (0..=MAX_SCENES)
            .map(|i| (format!("s{i}"), json!({ "sub": "x" })))
            .collect();
        assert_eq!(
            refusal(json!({ "obs": { "scenes": many } })),
            "streaming.obs.scenes: at most 64"
        );
    }

    fn signed_in() -> Streaming {
        let stored = json!({ "twitch": { "channel": "#Some_Chan", "access_token": "at", "refresh_token": "rt", "expires_at": 1234, "login": "me", "user_id": "9" } });
        normalize(Some(&stored))
    }

    #[test]
    fn keeps_the_twitch_tokens_in_the_file_and_out_of_the_studios_view() {
        let s = signed_in();
        assert_eq!(s.twitch.channel, "some_chan");
        assert_eq!((s.twitch.auth.access_token.as_str(), s.twitch.auth.expires_at, s.twitch.auth.user_id.as_str()), ("at", 1234, "9"));
        let public = to_json(&s).unwrap();
        assert_eq!(public["twitch"], json!({ "channel": "some_chan", "login": "me" }));
        assert!(!public.to_string().contains("at\"") && !public.to_string().contains("rt"));
        let stored = to_stored_json(&s).unwrap();
        assert_eq!(stored["twitch"]["access_token"], "at");
        assert_eq!(normalize(Some(&stored)), s, "round-trips");
        // Until Twitch is used, the key is in neither form.
        assert!(to_json(&Streaming { obs: ObsStreaming { mic: "m".into(), ..Default::default() }, ..Default::default() }).unwrap().get("twitch").is_none());
    }

    #[test]
    fn a_patch_sets_the_twitch_channel_but_never_the_tokens() {
        let s = signed_in();
        let next = apply(&s, &json!({ "twitch": { "channel": "  Other_One ", "access_token": "evil", "login": "x" } })).unwrap();
        assert_eq!(next.twitch.channel, "other_one");
        assert_eq!(next.twitch.auth, s.twitch.auth);
        assert_eq!(apply(&s, &json!({ "twitch": {} })).unwrap(), s);
        assert_eq!(apply(&s, &json!({ "twitch": { "channel": "" } })).unwrap().twitch.channel, "");
        let refusal = |patch: Value| apply(&s, &patch).unwrap_err();
        assert_eq!(refusal(json!({ "twitch": 1 })), "streaming.twitch: expected an object");
        assert_eq!(refusal(json!({ "twitch": { "channel": 3 } })), "streaming.twitch.channel: expected text");
        assert_eq!(refusal(json!({ "twitch": { "channel": "bad name" } })), "streaming.twitch.channel: a Twitch channel name");
        assert_eq!(refusal(json!({ "twitch": { "channel": "x".repeat(26) } })), "streaming.twitch.channel: a Twitch channel name");
    }
}
