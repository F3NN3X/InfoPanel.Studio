// The Streaming widgets' saved settings: the `streaming` section of integrations.json, beside `obs` and `calendar`. The OBS
// section holds the mic input the Stream Control tile follows and, per scene, the line under its name and its icon. Nothing
// in it is secret, so the studio reads it back whole. Absent from the file (and from every output) until something is set.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use crate::integrations::text;

/// Most scenes with a saved look.
pub const MAX_SCENES: usize = 64;
const MAX_ID: usize = 128;
const MAX_MIC: usize = 256;
const MAX_SUB: usize = 60;
const MAX_ICON: usize = 40;

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

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Streaming {
    pub obs: ObsStreaming,
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

/// Tolerant read of the stored section.
pub fn normalize(raw: Option<&Value>) -> Streaming {
    let Some(obs) = raw.and_then(|s| s.get("obs")).and_then(Value::as_object) else {
        return Streaming::default();
    };
    let scenes = obs
        .get("scenes")
        .and_then(Value::as_object)
        .into_iter()
        .flatten();
    Streaming {
        obs: ObsStreaming {
            mic: text(obs.get("mic"), MAX_MIC),
            scenes: scenes
                .filter(|(id, look)| !id.is_empty() && id.len() <= MAX_ID && look.is_object())
                .map(|(id, look)| (id.clone(), look_of(look)))
                .filter(|(_, look)| *look != SceneLook::default())
                .take(MAX_SCENES)
                .collect(),
        },
    }
}

/// The section as stored and as the studio sees it, or `None` while nothing is set.
pub fn to_json(s: &Streaming) -> Option<Value> {
    if s.is_empty() {
        return None;
    }
    let scenes: Map<String, Value> = s
        .obs
        .scenes
        .iter()
        .map(|(id, look)| (id.clone(), json!({ "sub": look.sub, "icon": look.icon })))
        .collect();
    Some(json!({ "obs": { "mic": s.obs.mic, "scenes": scenes } }))
}

/// The state with a `streaming` patch applied, or the error to answer with:
/// - `obs.mic`: the input's name; "" clears it, absent keeps it.
/// - `obs.scenes`: the full map of { sub?, icon? } by scene id; a scene with neither is dropped.
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
    Ok(next)
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
}
