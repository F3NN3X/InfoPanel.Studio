// touch.json: the touch panels (each a touch device and how its touches map onto the panel), the gesture thresholds
// they share, what the kiosk does with a gesture, and testing mode. Ported from touch-kit's panel app config.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct TouchConfig {
    /// One entry per touch panel, each with its own device thread and stream.
    pub panels: Vec<PanelEntry>,
    /// Shared by every panel's recogniser and the kiosk.
    pub gestures: touch_core::GestureConfig,
    /// How far ahead the kiosk draws a moving contact, ms (0 = off).
    pub prediction_ms: f64,
    /// Rings under every finger on the kiosk, for demos and recordings.
    pub touch_dots: bool,
    /// The kiosk's touch debug strip at start; a three-finger tap toggles it by default.
    pub debug: bool,
    /// Recognised gesture → action. Keys: `Tap`, `DoubleTap`, `LongPress`, `Swipe Left x1` (direction, finger count),
    /// `PinchStart`, `ThreeFingerTap`, ...
    pub actions: BTreeMap<String, Action>,
    /// Virtual panels that play recordings, for trying touch without hardware.
    pub testing: Testing,
}

impl Default for TouchConfig {
    fn default() -> Self {
        Self {
            panels: vec![PanelEntry::default()],
            gestures: Default::default(),
            prediction_ms: 16.0,
            touch_dots: false,
            debug: false,
            actions: BTreeMap::from([
                ("ThreeFingerTap".into(), Action::ToggleDebug),
                ("Swipe Left x2".into(), Action::Page { to: PageDir::Next }),
                ("Swipe Right x2".into(), Action::Page { to: PageDir::Prev }),
            ]),
            testing: Default::default(),
        }
    }
}

/// Testing mode: extra panels fed by a recording played in a loop instead of a USB device. The real panels keep
/// running alongside; a virtual panel's stream is `virtual-<n>`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Testing {
    pub enabled: bool,
    /// How many virtual panels, 1–4.
    pub virtual_panels: u8,
    /// What they play: a built-in capture (`all`, `tap`, `swipes`, `two-finger`, `hold`), `none` (idle) or a
    /// `touchprobe record` file.
    pub replay: String,
    /// Each virtual panel's size in panel pixels.
    pub size: [u32; 2],
}

impl Default for Testing {
    fn default() -> Self {
        Self {
            enabled: false,
            virtual_panels: 1,
            replay: "all".into(),
            size: [1920, 550],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    /// Show or hide the kiosk's touch debug strip.
    ToggleDebug,
    /// Go to the next or previous page of the kiosk's profile.
    Page { to: PageDir },
    /// Dispatch a named DOM event (`touch:<name>`) on the kiosk.
    Emit { name: String },
    /// Only log the gesture.
    Log,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PageDir {
    Next,
    Prev,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Issue {
    pub level: Level,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    /// The file was not applied.
    Error,
    /// Applied, but something in it is probably a mistake (a misspelt key, which serde ignores).
    Warning,
}

impl Issue {
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            level: Level::Error,
            message: message.into(),
        }
    }

    pub fn warning(message: impl Into<String>) -> Self {
        Self {
            level: Level::Warning,
            message: message.into(),
        }
    }
}

/// A read of touch.json: the config if it can be applied, and everything wrong with it.
#[derive(Debug)]
pub struct Loaded {
    pub config: Option<TouchConfig>,
    pub issues: Vec<Issue>,
}

/// A touch panel: which USB device, and how its touches map onto the panel.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PanelEntry {
    /// The panel's stream (`touch=<id>` in its kiosk URL): letters, digits and `-`.
    pub id: String,
    pub name: String,
    /// `device.port` pins one of several identical devices (set by pairing).
    pub device: touch_core::DeviceConfig,
    /// Which monitor shows the panel (set by Set up panels). Unset: the first monitor of the panel's size.
    pub monitor: Option<MonitorMatch>,
    pub panel: touch_core::PanelConfig,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MonitorMatch {
    pub name: Option<String>,
    /// Physical position of the monitor's top-left corner.
    pub position: Option<[i32; 2]>,
}

impl Default for PanelEntry {
    fn default() -> Self {
        Self {
            id: "panel-1".into(),
            name: "Panel 1".into(),
            device: Default::default(),
            monitor: None,
            panel: Default::default(),
        }
    }
}

impl PanelEntry {
    /// touch-core's config for this panel.
    pub fn touch(&self, gestures: &touch_core::GestureConfig) -> touch_core::Config {
        touch_core::Config {
            device: self.device.clone(),
            panel: self.panel.clone(),
            gestures: gestures.clone(),
        }
    }
}

/// Written when touch is first turned on. Deliberately not every default: a written default would pin today's
/// value and hide later changes to it. Missing keys take the current defaults.
const STARTER: &str = "{\n  \"touch_dots\": false\n}\n";

/// Loads touch.json, writing a starter file first if none exists yet.
pub fn load_or_init(path: &Path) -> Loaded {
    if !path.exists() {
        let written = path
            .parent()
            .map_or(Ok(()), std::fs::create_dir_all)
            .and_then(|()| std::fs::write(path, STARTER));
        if let Err(e) = written {
            return failed(format!("writing the starter touch.json: {e}"));
        }
        log::info!("touch: wrote a starter {}", path.display());
    }
    load(path)
}

pub fn load(path: &Path) -> Loaded {
    match std::fs::read_to_string(path) {
        Ok(text) => check(&text),
        Err(e) => failed(format!("reading: {e}")),
    }
}

fn failed(message: String) -> Loaded {
    Loaded {
        config: None,
        issues: vec![Issue::error(message)],
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Parses and validates touch.json's text.
pub fn check(text: &str) -> Loaded {
    let value: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => return failed(e.to_string()),
    };
    // serde would also read a struct from an array, so `[]` would pass as all defaults.
    if !value.is_object() {
        return failed("touch.json must be a JSON object".into());
    }
    let cfg: TouchConfig = match serde_json::from_value(value.clone()) {
        Ok(c) => c,
        Err(e) => return failed(e.to_string()),
    };

    let mut issues: Vec<Issue> = cfg
        .gestures
        .validate()
        .into_iter()
        .map(|e| Issue::error(format!("gestures: {e}")))
        .collect();
    for (i, p) in cfg.panels.iter().enumerate() {
        let at = format!("panels[{i}] \"{}\"", p.name);
        issues.extend(
            p.panel
                .validate()
                .into_iter()
                .map(|e| Issue::error(format!("{at}: panel: {e}"))),
        );
        let earlier = &cfg.panels[..i];
        if !valid_id(&p.id) || p.id.starts_with("virtual-") {
            issues.push(Issue::error(format!(
                "{at}: id must be letters, digits and -, and not start with virtual-"
            )));
        } else if earlier.iter().any(|q| q.id == p.id) {
            issues.push(Issue::error(format!(
                "{at}: id \"{}\" is already used by another panel",
                p.id
            )));
        }
        if p.device.port.is_some() && earlier.iter().any(|q| q.device.port == p.device.port) {
            issues.push(Issue::error(format!(
                "{at}: device.port is already used by another panel"
            )));
        }
        if earlier.iter().any(|q| q.name == p.name) {
            issues.push(Issue::warning(format!(
                "{at}: another panel has the same name"
            )));
        }
    }
    if !(0.0..=100.0).contains(&cfg.prediction_ms) {
        issues.push(Issue::error("prediction_ms must be between 0 and 100"));
    }
    if !(1..=4).contains(&cfg.testing.virtual_panels) {
        issues.push(Issue::error(
            "testing.virtual_panels must be between 1 and 4",
        ));
    }
    if cfg.testing.size.iter().any(|v| !(320..=7680).contains(v)) {
        issues.push(Issue::error(
            "testing.size: width and height must be between 320 and 7680",
        ));
    }
    let replay = &cfg.testing.replay;
    if !super::testing::BUILT_IN.contains(&replay.as_str())
        && replay != "none"
        && !Path::new(replay).is_file()
    {
        issues.push(Issue::error(format!(
            "testing.replay: \"{replay}\" is no built-in capture and no file"
        )));
    }
    let defaults =
        serde_json::to_value(TouchConfig::default()).expect("the touch config serialises");
    unknown_keys(&value, &defaults, "", &mut issues);
    for key in cfg.actions.keys().filter(|k| !is_gesture_key(k)) {
        issues.push(Issue::warning(format!(
            "actions: no gesture is called \"{key}\""
        )));
    }

    let ok = issues.iter().all(|i| i.level == Level::Warning);
    Loaded {
        config: ok.then_some(cfg),
        issues,
    }
}

/// Keys the file has but the config doesn't: serde ignores them, so they are usually typos. Array elements are
/// checked against the default's first element (`panels[0]`).
fn unknown_keys(
    file: &serde_json::Value,
    known: &serde_json::Value,
    prefix: &str,
    issues: &mut Vec<Issue>,
) {
    if let (Some(items), Some(model)) = (file.as_array(), known.as_array().and_then(|a| a.first()))
    {
        let base = prefix.trim_end_matches('.');
        for (i, item) in items.iter().enumerate() {
            unknown_keys(item, model, &format!("{base}[{i}]."), issues);
        }
        return;
    }
    let (Some(file), Some(known)) = (file.as_object(), known.as_object()) else {
        return;
    };
    for (k, v) in file {
        let path = format!("{prefix}{k}");
        match known.get(k) {
            None => issues.push(Issue::warning(format!("unknown key \"{path}\" (ignored)"))),
            Some(_) if k == "actions" => {}
            Some(d) => unknown_keys(v, d, &format!("{path}."), issues),
        }
    }
}

/// The gesture's name, or `Swipe <Dir> x<fingers>`; the kiosk keys its actions the same way.
fn is_gesture_key(key: &str) -> bool {
    const NAMES: [&str; 11] = [
        "Tap",
        "DoubleTap",
        "LongPress",
        "LongPressRepeat",
        "DragStart",
        "DragMove",
        "DragEnd",
        "PinchStart",
        "Pinch",
        "PinchEnd",
        "ThreeFingerTap",
    ];
    if NAMES.contains(&key) {
        return true;
    }
    let mut parts = key.split(' ');
    matches!(
        (parts.next(), parts.next(), parts.next().and_then(|n| n.strip_prefix('x')), parts.next()),
        (Some("Swipe"), Some("Left" | "Right" | "Up" | "Down"), Some(n), None) if n.parse::<u8>().is_ok_and(|n| n > 0)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn messages(loaded: &Loaded) -> Vec<(Level, &str)> {
        loaded
            .issues
            .iter()
            .map(|i| (i.level, i.message.as_str()))
            .collect()
    }

    #[test]
    fn partial_files_fill_defaults() {
        let cfg: TouchConfig = serde_json::from_str(
            r#"{"gestures": {"slop_px": 20}, "panels": [{"panel": {"rotation": "180"}}, {"id": "right", "name": "Right"}]}"#,
        )
        .unwrap();
        assert_eq!(cfg.gestures.slop_px, 20.0);
        assert_eq!(cfg.panels.len(), 2);
        assert_eq!(cfg.panels[0].id, "panel-1");
        assert_eq!(cfg.panels[0].panel.rotation, touch_core::Rotation::R180);
        assert_eq!(cfg.panels[0].panel.width_px, 1920);
        assert_eq!(cfg.panels[1].device.vid, None, "no ids: any touchscreen");
        assert_eq!(
            cfg.panels[1].touch(&cfg.gestures).gestures.slop_px,
            20.0,
            "gestures are shared"
        );
        assert_eq!(cfg.prediction_ms, 16.0);
        assert_eq!(
            cfg.actions.get("ThreeFingerTap"),
            Some(&Action::ToggleDebug)
        );
        assert_eq!(TouchConfig::default().panels, vec![PanelEntry::default()]);
    }

    #[test]
    fn panel_problems_name_the_panel() {
        let loaded = check(
            r#"{"panels": [{"id": "a", "name": "A", "device": {"port": "B-1"}},
                {"id": "a", "name": "B", "device": {"port": "B-1"}, "panel": {"width_px": 0}, "monitr": {}},
                {"id": "virtual-1", "name": "C"}, {"id": "a b", "name": "D"}]}"#,
        );
        assert_eq!(
            messages(&loaded),
            [
                (
                    Level::Error,
                    r#"panels[1] "B": panel: panel size must be non-zero"#
                ),
                (
                    Level::Error,
                    r#"panels[1] "B": id "a" is already used by another panel"#
                ),
                (
                    Level::Error,
                    r#"panels[1] "B": device.port is already used by another panel"#
                ),
                (
                    Level::Error,
                    r#"panels[2] "C": id must be letters, digits and -, and not start with virtual-"#
                ),
                (
                    Level::Error,
                    r#"panels[3] "D": id must be letters, digits and -, and not start with virtual-"#
                ),
                (
                    Level::Warning,
                    r#"unknown key "panels[1].monitr" (ignored)"#
                ),
            ]
        );
        assert_eq!(loaded.config, None);
    }

    #[test]
    fn actions_parse_and_unknown_gestures_only_warn() {
        let cfg: TouchConfig = serde_json::from_str(
            r#"{"actions": {"LongPress": {"action": "emit", "name": "mute"}, "Swipe Up x1": {"action": "page", "to": "prev"}}}"#,
        )
        .unwrap();
        assert_eq!(
            cfg.actions.len(),
            2,
            "a file's actions replace the defaults"
        );
        assert_eq!(
            cfg.actions["LongPress"],
            Action::Emit {
                name: "mute".into()
            }
        );
        assert_eq!(
            cfg.actions["Swipe Up x1"],
            Action::Page { to: PageDir::Prev }
        );
        assert!(serde_json::from_str::<TouchConfig>(
            r#"{"actions": {"Tap": {"action": "explode"}}}"#
        )
        .is_err());

        let typo = check(
            r#"{"touch_dot": true, "gestures": {"slop": 5},
                "actions": {"Swipe Left x2": {"action": "log"}, "Swipe left x2": {"action": "log"}, "Swipe Up x0": {"action": "log"}}}"#,
        );
        assert_eq!(
            messages(&typo),
            [
                (Level::Warning, r#"unknown key "touch_dot" (ignored)"#),
                (Level::Warning, r#"unknown key "gestures.slop" (ignored)"#),
                (
                    Level::Warning,
                    r#"actions: no gesture is called "Swipe Up x0""#
                ),
                (
                    Level::Warning,
                    r#"actions: no gesture is called "Swipe left x2""#
                ),
            ]
        );
        assert!(typo.config.is_some(), "warnings still apply the file");
    }

    #[test]
    fn out_of_range_values_reject_the_file() {
        let bad = check(
            r#"{"prediction_ms": -1, "gestures": {"slop_px": 0},
                "testing": {"virtual_panels": 5, "size": [100, 550], "replay": "no/such/file.jsonl"}}"#,
        );
        assert_eq!(bad.config, None);
        assert_eq!(bad.issues.len(), 5, "{:?}", bad.issues);
        assert!(bad.issues.iter().all(|i| i.level == Level::Error));
        assert_eq!(check("{").config, None);
        assert_eq!(check("[]").config, None);
    }

    #[test]
    fn the_starter_file_is_written_once_and_reads_back_as_the_defaults() {
        let dir = std::env::temp_dir().join(format!("ips-touch-config-{}", std::process::id()));
        let path = dir.join("touch.json");
        let _ = std::fs::remove_dir_all(&dir);
        for _ in 0..2 {
            let loaded = load_or_init(&path);
            assert_eq!(loaded.issues, vec![]);
            assert_eq!(loaded.config, Some(TouchConfig::default()));
        }
        std::fs::write(&path, r#"{"touch_dots": true}"#).unwrap();
        assert!(
            load_or_init(&path).config.unwrap().touch_dots,
            "an existing file is kept"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
