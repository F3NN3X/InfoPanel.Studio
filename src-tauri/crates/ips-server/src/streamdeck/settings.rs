// The Stream Deck connection's saved settings: `streaming.streamdeck` in the integrations file. It holds whether the
// connection is on, the secret key every session pairs with (secret: the file keeps it, no view, event, log or error
// shows it; the views carry the pairing code instead) and the registry of virtual devices, one per widget: our own id,
// the name, the grid and the id the Stream Deck app gave the device once it was opened or created. A studio patch sets
// `enabled` only; the key is made by the store and the devices change through POST /api/streamdeck/act.

use serde_json::{json, Value};

use super::crypto;
use crate::integrations::text;
use crate::js;

/// The app drops the connection for a grid past 8 on either side.
pub const MAX_GRID: u32 = 8;
pub const DEFAULT_COLS: u32 = 5;
pub const DEFAULT_ROWS: u32 = 3;
pub const MAX_DEVICES: usize = 16;
pub const MAX_NAME: usize = 40;
/// The first device's name; later ones get the first free " 2", " 3"...
pub const DEFAULT_NAME: &str = "IPStudio";
const MAX_ID: usize = 64;
const MAX_APP_ID: usize = 128;
/// The same cap as the other secrets' (a key is 64 characters).
const MAX_SECRET: usize = 4096;

#[derive(Debug, Clone, PartialEq)]
pub struct Device {
    /// Ours, stable through renames.
    pub id: String,
    pub name: String,
    pub cols: u32,
    pub rows: u32,
    /// The Stream Deck app's id for the device; "" until it has been opened or created.
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct StreamdeckSettings {
    pub enabled: bool,
    /// 64 hex characters, or "" until the connection is first turned on.
    pub secret_key: String,
    pub devices: Vec<Device>,
}

impl StreamdeckSettings {
    pub fn device(&self, id: &str) -> Option<&Device> {
        self.devices.iter().find(|d| d.id == id)
    }

    pub fn device_mut(&mut self, id: &str) -> Option<&mut Device> {
        self.devices.iter_mut().find(|d| d.id == id)
    }

    /// "IPStudio", or the first free "IPStudio N".
    pub fn next_name(&self) -> String {
        let taken = |name: &str| self.devices.iter().any(|d| d.name == name);
        if !taken(DEFAULT_NAME) {
            return DEFAULT_NAME.into();
        }
        (2..)
            .map(|n| format!("{DEFAULT_NAME} {n}"))
            .find(|name| !taken(name))
            .unwrap_or_default()
    }
}

/// A grid side brought into 1 to 8.
pub fn clamp_grid(n: u64) -> u32 {
    n.clamp(1, MAX_GRID as u64) as u32
}

/// A device name: text of 1 to 40 characters once trimmed, without control characters.
pub fn clean_name(v: Option<&Value>) -> Option<String> {
    let name = js::trim(v?.as_str()?);
    let fits =
        !name.is_empty() && name.chars().count() <= MAX_NAME && !name.chars().any(char::is_control);
    fits.then(|| name.to_string())
}

fn device_of(raw: &Value) -> Option<Device> {
    let id = text(raw.get("id"), MAX_ID + 1);
    if id.is_empty() || id.len() > MAX_ID {
        return None;
    }
    let side = |key: &str, default: u32| {
        raw.get(key)
            .and_then(Value::as_u64)
            .map_or(default, clamp_grid)
    };
    Some(Device {
        id,
        name: clean_name(raw.get("name")).unwrap_or_else(|| DEFAULT_NAME.into()),
        cols: side("cols", DEFAULT_COLS),
        rows: side("rows", DEFAULT_ROWS),
        app_id: text(raw.get("app_id"), MAX_APP_ID),
    })
}

/// Tolerant read of the stored subsection: a key that isn't one is dropped (a new one is made when the connection is
/// next on), as are devices without an id and a second device with the same id.
pub fn normalize(raw: Option<&Value>) -> StreamdeckSettings {
    let Some(raw) = raw.and_then(Value::as_object) else {
        return StreamdeckSettings::default();
    };
    let secret_key = text(raw.get("secret_key"), MAX_SECRET);
    let mut devices: Vec<Device> = Vec::new();
    for device in raw
        .get("devices")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(device_of)
    {
        if devices.len() < MAX_DEVICES && !devices.iter().any(|d| d.id == device.id) {
            devices.push(device);
        }
    }
    StreamdeckSettings {
        enabled: raw.get("enabled").and_then(Value::as_bool).unwrap_or(false),
        secret_key: if crypto::secret_key(&secret_key).is_some() {
            secret_key
        } else {
            String::new()
        },
        devices,
    }
}

/// The studio's view: on or off, the pairing code and the devices, never the key.
pub fn to_json(s: &StreamdeckSettings) -> Value {
    let devices: Vec<Value> = s
        .devices
        .iter()
        .map(|d| json!({ "id": d.id, "name": d.name, "cols": d.cols, "rows": d.rows }))
        .collect();
    json!({ "enabled": s.enabled, "pairingCode": crypto::pairing_code_of(&s.secret_key), "devices": devices })
}

/// The stored form, the key included.
pub fn to_stored_json(s: &StreamdeckSettings) -> Value {
    let devices: Vec<Value> = s.devices.iter().map(|d| json!({ "id": d.id, "name": d.name, "cols": d.cols, "rows": d.rows, "app_id": d.app_id })).collect();
    json!({ "enabled": s.enabled, "secret_key": s.secret_key, "devices": devices })
}

/// The settings with a studio patch applied: `enabled` (true or false, absent keeps it). Nothing else is settable here.
pub fn apply(s: &StreamdeckSettings, patch: &Value) -> Result<StreamdeckSettings, String> {
    let Some(patch) = patch.as_object() else {
        return Err("streaming.streamdeck: expected an object".into());
    };
    let mut next = s.clone();
    match patch.get("enabled") {
        None => {}
        Some(Value::Bool(on)) => next.enabled = *on,
        Some(_) => return Err("streaming.streamdeck.enabled: expected true or false".into()),
    }
    Ok(next)
}

/// Makes the key a connection that is on needs, when there is none yet.
pub fn ensure_key(s: &mut StreamdeckSettings) {
    if !s.enabled || !s.secret_key.is_empty() {
        return;
    }
    match crypto::new_secret() {
        Ok(key) => s.secret_key = key,
        Err(e) => log::error!(target: "server", "stream deck: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a";

    #[test]
    fn reads_the_stored_subsection_tolerantly() {
        assert_eq!(normalize(None), StreamdeckSettings::default());
        assert_eq!(normalize(Some(&json!("x"))), StreamdeckSettings::default());
        let raw = json!({ "enabled": true, "secret_key": KEY, "devices": [
            { "id": "a", "name": "  Deck  ", "cols": 20, "rows": 0, "app_id": "app-a" },
            { "id": "a", "name": "again" },
            { "name": "no id" },
            { "id": "b", "name": "x".repeat(41) },
            "nope",
        ] });
        let s = normalize(Some(&raw));
        assert!(s.enabled);
        assert_eq!(s.secret_key, KEY);
        assert_eq!(
            s.devices,
            [
                Device {
                    id: "a".into(),
                    name: "Deck".into(),
                    cols: 8,
                    rows: 1,
                    app_id: "app-a".into()
                },
                Device {
                    id: "b".into(),
                    name: DEFAULT_NAME.into(),
                    cols: 5,
                    rows: 3,
                    app_id: String::new()
                },
            ]
        );
        assert_eq!(normalize(Some(&to_stored_json(&s))), s, "round-trips");
        // A damaged key is dropped; too many devices are cut to the cap.
        assert_eq!(
            normalize(Some(&json!({ "secret_key": "abc" }))).secret_key,
            ""
        );
        let many: Vec<Value> = (0..20).map(|i| json!({ "id": format!("d{i}") })).collect();
        assert_eq!(
            normalize(Some(&json!({ "devices": many }))).devices.len(),
            MAX_DEVICES
        );
    }

    #[test]
    fn shows_the_pairing_code_and_never_the_key() {
        let s = normalize(Some(
            &json!({ "enabled": true, "secret_key": KEY, "devices": [{ "id": "a", "name": "IPStudio", "app_id": "app-a" }] }),
        ));
        let public = to_json(&s);
        assert_eq!(
            public,
            json!({ "enabled": true, "pairingCode": crypto::pairing_code_of(KEY), "devices": [{ "id": "a", "name": "IPStudio", "cols": 5, "rows": 3 }] })
        );
        assert!(!public.to_string().contains(KEY) && !public.to_string().contains("app-a"));
        assert_eq!(to_stored_json(&s)["secret_key"], KEY);
        assert_eq!(to_json(&StreamdeckSettings::default())["pairingCode"], "");
    }

    #[test]
    fn a_patch_turns_it_on_or_off_and_nothing_else() {
        let s = normalize(Some(
            &json!({ "secret_key": KEY, "devices": [{ "id": "a" }] }),
        ));
        let on = apply(
            &s,
            &json!({ "enabled": true, "secret_key": "evil", "devices": [] }),
        )
        .unwrap();
        assert_eq!(
            on,
            StreamdeckSettings {
                enabled: true,
                ..s.clone()
            }
        );
        assert_eq!(apply(&on, &json!({})).unwrap(), on);
        assert!(!apply(&on, &json!({ "enabled": false })).unwrap().enabled);
        assert_eq!(
            apply(&s, &json!(1)).unwrap_err(),
            "streaming.streamdeck: expected an object"
        );
        assert_eq!(
            apply(&s, &json!({ "enabled": "yes" })).unwrap_err(),
            "streaming.streamdeck.enabled: expected true or false"
        );
    }

    #[test]
    fn makes_a_key_only_for_a_connection_that_is_on() {
        let mut off = StreamdeckSettings::default();
        ensure_key(&mut off);
        assert_eq!(off.secret_key, "");
        let mut on = StreamdeckSettings {
            enabled: true,
            ..Default::default()
        };
        ensure_key(&mut on);
        assert!(crypto::secret_key(&on.secret_key).is_some());
        let kept = on.secret_key.clone();
        ensure_key(&mut on);
        assert_eq!(on.secret_key, kept);
    }

    #[test]
    fn names_new_devices_and_checks_names() {
        let mut s = StreamdeckSettings::default();
        assert_eq!(s.next_name(), "IPStudio");
        for (id, name) in [("a", "IPStudio"), ("b", "IPStudio 3")] {
            s.devices.push(Device {
                id: id.into(),
                name: name.into(),
                cols: 5,
                rows: 3,
                app_id: String::new(),
            });
        }
        assert_eq!(s.next_name(), "IPStudio 2");
        assert_eq!(
            clean_name(Some(&json!("  Desk  "))).as_deref(),
            Some("Desk")
        );
        assert_eq!(
            clean_name(Some(&json!("é".repeat(40)))).map(|n| n.chars().count()),
            Some(40)
        );
        for bad in [
            json!(""),
            json!("   "),
            json!("x".repeat(41)),
            json!("a\nb"),
            json!(5),
        ] {
            assert_eq!(clean_name(Some(&bad)), None, "{bad}");
        }
        assert_eq!((clamp_grid(0), clamp_grid(3), clamp_grid(99)), (1, 3, 8));
    }
}
