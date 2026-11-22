// Profile auto-switch (pinned layer P4, decision 7): a profile's `autoSwitch.exe` rules name the programs that bring it
// up while they are in front. The server reads the program in front (foreground.rs) and sends it here as the internal
// `{ type: "front", exe }` action; the switch chooses among the profiles of the size the panel shows and sets the
// control channel's profile override. `{ type: "auto", state: "on" | "off" | "toggle", profile? }` turns it on or
// pauses it; pausing with a profile is the lock (the override with auto-switch paused), and the lock wins: nothing in
// front moves a paused panel. With no rules in the config nothing is read and nothing changes.

use serde_json::Value;

use crate::control::{find_profile, id_eq, profiles_of, truthy, Reduced, State};

/// The longest program name kept (a Windows path's limit).
const EXE_MAX: usize = 260;

/// A program name as a rule compares it: the file name only, lowercase, without `.exe`.
pub fn exe_key(name: &str) -> String {
    let file = name.trim().rsplit(['\\', '/']).next().unwrap_or_default().to_lowercase();
    file.strip_suffix(".exe").map_or(file.clone(), str::to_string)
}

/// A profile's rules: its `autoSwitch.exe` names, as keys.
fn rules_of(profile: &Value) -> Vec<String> {
    let names = profile.get("autoSwitch").and_then(|a| a.get("exe")).and_then(Value::as_array);
    names.map_or_else(Vec::new, |n| n.iter().filter_map(Value::as_str).map(exe_key).filter(|k| !k.is_empty()).collect())
}

/// Whether any profile has a rule: only then is the program in front read and published.
pub fn has_rules(config: &Value) -> bool {
    profiles_of(config).iter().any(|p| !rules_of(p).is_empty())
}

fn size_of(profile: &Value) -> Option<(f64, f64)> {
    Some((profile.get("width")?.as_f64()?, profile.get("height")?.as_f64()?))
}

/// The profile whose rule names `exe`, among those of `base`'s size (the first in the config's order), or `None`.
pub fn matching_profile(config: &Value, base: &Value, exe: &str) -> Option<Value> {
    let size = size_of(find_profile(config, base)?)?;
    let key = exe_key(exe);
    profiles_of(config)
        .iter()
        .filter(|p| truthy(p) && size_of(p) == Some(size))
        .find(|p| rules_of(p).contains(&key))
        .and_then(|p| p.get("id").cloned())
}

/// The state after the rules have looked at the program in front: a match sets the override (and remembers that the
/// switch set it); no match takes back an override the switch set, so the panel resolves as usual. Paused, or with
/// nothing in front or no profile known, it is unchanged.
pub fn switched(state: State, config: &Value) -> State {
    let Some(front) = state.front.as_deref().filter(|_| !state.auto_paused) else {
        return state;
    };
    let base = if truthy(&state.profile) { &state.profile } else { &state.shown };
    if !truthy(base) {
        return state;
    }
    match matching_profile(config, base, front) {
        Some(id) if id_eq(&id, &state.profile) => state,
        Some(id) => State { profile: id.clone(), auto_profile: id, ..state },
        None if truthy(&state.auto_profile) && id_eq(&state.auto_profile, &state.profile) => {
            State { profile: Value::Null, auto_profile: Value::Null, ..state }
        }
        None => state,
    }
}

/// `{ type: "front", exe }`: the program in front changed.
pub fn reduce_front(state: &State, action: &Value, config: &Value) -> Reduced {
    let Some(exe) = action.get("exe").and_then(Value::as_str).map(str::trim).filter(|e| !e.is_empty() && e.len() <= EXE_MAX) else {
        return Err("expected exe");
    };
    let next = switched(State { front: Some(exe.to_string()), ..state.clone() }, config);
    Ok((next != *state).then_some(next))
}

/// `{ type: "auto", state, profile? }`: on resumes the switch (and applies it now), off pauses it; off with a profile
/// locks the panel to that profile.
pub fn reduce_auto(state: &State, action: &Value, config: &Value) -> Reduced {
    let paused = match action.get("state").and_then(Value::as_str) {
        Some("on") => false,
        Some("off") => true,
        Some("toggle") => !state.auto_paused,
        _ => return Err("expected state on, off or toggle"),
    };
    let lock = action.get("profile").filter(|p| !p.is_null());
    if lock.is_some_and(|p| !paused || find_profile(config, p).is_none()) {
        return Err("unknown profile");
    }
    let next = match lock {
        Some(p) => State { profile: p.clone(), auto_profile: Value::Null, auto_paused: true, ..state.clone() },
        None => switched(State { auto_paused: paused, ..state.clone() }, config),
    };
    Ok((next != *state).then_some(next))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn config() -> Value {
        json!({ "profiles": [
            { "id": "main", "width": 1024, "height": 600 },
            { "id": "coding", "width": 1024, "height": 600, "autoSwitch": { "exe": ["Code.exe", "WindowsTerminal.exe"] } },
            { "id": "streaming", "width": 1024, "height": 600, "autoSwitch": { "exe": ["obs64"] } },
            { "id": "bar", "width": 1920, "height": 550, "autoSwitch": { "exe": ["Code.exe"] } },
        ] })
    }

    fn shown(id: &str) -> State {
        State { shown: json!(id), ..State::default() }
    }

    fn front(state: &State, exe: &str) -> State {
        reduce_front(state, &json!({ "type": "front", "exe": exe }), &config()).unwrap().unwrap_or_else(|| state.clone())
    }

    #[test]
    fn a_program_name_compares_by_file_name_without_case_or_exe() {
        assert_eq!(exe_key("C:\\Program Files\\Microsoft VS Code\\Code.exe"), "code");
        assert_eq!(exe_key(" OBS64 "), "obs64");
        assert_eq!(exe_key("/usr/bin/zed"), "zed");
    }

    #[test]
    fn the_app_in_front_switches_among_profiles_of_the_shown_size_only() {
        let s = front(&shown("main"), "C:\\Apps\\code.EXE");
        assert_eq!((s.profile.clone(), s.auto_profile.clone()), (json!("coding"), json!("coding")));
        // the 1920 x 550 bar has the same rule, but it is another size
        assert_eq!(matching_profile(&config(), &json!("bar"), "Code.exe"), Some(json!("bar")));
        assert_eq!(matching_profile(&config(), &json!("main"), "notepad.exe"), None);
        // a rule without .exe still matches
        assert_eq!(front(&s, "obs64.exe").profile, json!("streaming"));
    }

    #[test]
    fn no_match_takes_back_only_an_override_the_switch_set() {
        let auto = front(&shown("main"), "Code.exe");
        let back = front(&auto, "explorer.exe");
        assert_eq!((back.profile, back.auto_profile), (Value::Null, Value::Null));
        // an override chosen by hand stays when nothing matches
        let hand = State { profile: json!("streaming"), ..shown("main") };
        assert_eq!(front(&hand, "explorer.exe").profile, json!("streaming"));
    }

    #[test]
    fn the_lock_wins_until_auto_switch_is_on_again() {
        let locked =
            reduce_auto(&shown("main"), &json!({ "type": "auto", "state": "off", "profile": "main" }), &config()).unwrap().unwrap();
        assert!(locked.auto_paused);
        assert_eq!(locked.profile, json!("main"));
        let still = front(&locked, "Code.exe");
        assert_eq!((still.profile.clone(), still.front.as_deref()), (json!("main"), Some("Code.exe")));
        // turning it on applies the app in front at once
        let on = reduce_auto(&still, &json!({ "type": "auto", "state": "on" }), &config()).unwrap().unwrap();
        assert_eq!((on.auto_paused, on.profile), (false, json!("coding")));
    }

    #[test]
    fn bad_auto_actions_are_refused() {
        let s = shown("main");
        assert_eq!(reduce_auto(&s, &json!({ "state": "maybe" }), &config()), Err("expected state on, off or toggle"));
        assert_eq!(reduce_auto(&s, &json!({ "state": "off", "profile": "gone" }), &config()), Err("unknown profile"));
        assert_eq!(reduce_auto(&s, &json!({ "state": "on", "profile": "main" }), &config()), Err("unknown profile"));
        assert_eq!(reduce_front(&s, &json!({ "exe": "" }), &config()), Err("expected exe"));
        assert_eq!(reduce_front(&s, &json!({ "exe": "a".repeat(261) }), &config()), Err("expected exe"));
    }

    #[test]
    fn rules_are_off_by_default() {
        assert!(!has_rules(&json!({ "profiles": [{ "id": "main", "width": 1024, "height": 600 }] })));
        assert!(has_rules(&config()));
        // without rules the app in front is kept but changes nothing
        let plain = json!({ "profiles": [{ "id": "main", "width": 1024, "height": 600 }] });
        let s = reduce_front(&shown("main"), &json!({ "exe": "Code.exe" }), &plain).unwrap().unwrap();
        assert_eq!(s.profile, Value::Null);
    }
}
