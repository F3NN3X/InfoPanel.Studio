// Connects Claude Code and Codex to the dashboard: the hook installer, with
// `ips-agent` as the hook command. Claude Code gets a hook per lifecycle event and its statusline
// wrapped (~/.claude/settings.json); Codex gets the same hooks (~/.codex/hooks.json).
//
// Hooks written for the old forwarder (a command running `agent-status.mjs`) are recognised and
// replaced, so an existing user migrates cleanly. Anything else in the files is left as it was,
// key order included.

use crate::wrap;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Marks the current hooks: any command that runs `ips-agent`.
pub const MARK: &str = "ips-agent";
/// Marks the old Node hooks.
pub const LEGACY_MARK: &str = "agent-status.mjs";

pub const CLAUDE_EVENTS: [&str; 12] = [
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "Notification",
    "Stop",
    "StopFailure",
    "SubagentStart",
    "SubagentStop",
];
pub const CODEX_EVENTS: [&str; 10] = [
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "Interrupt",
];

type Object = Map<String, Value>;

fn command_of(hook: &Value) -> Option<&str> {
    hook.get("command").and_then(Value::as_str)
}

fn is_current(hook: &Value) -> bool {
    command_of(hook).is_some_and(|c| c.contains(MARK))
}

fn is_legacy(hook: &Value) -> bool {
    command_of(hook).is_some_and(|c| c.contains(LEGACY_MARK))
}

fn is_ours(hook: &Value) -> bool {
    is_current(hook) || is_legacy(hook)
}

fn hooks_of(group: &Value) -> Option<&Vec<Value>> {
    group.get("hooks").and_then(Value::as_array)
}

fn any_hook(hooks: &Object, test: fn(&Value) -> bool) -> bool {
    hooks.values().filter_map(Value::as_array).any(|groups| {
        groups
            .iter()
            .filter_map(hooks_of)
            .any(|hs| hs.iter().any(test))
    })
}

/// `hooks` without the entries `test` matches (and without groups or events left empty by that).
fn without_hooks(hooks: &Object, test: fn(&Value) -> bool) -> Object {
    let mut next = Object::new();
    for (event, groups) in hooks {
        let Some(groups) = groups.as_array() else {
            next.insert(event.clone(), groups.clone());
            continue;
        };
        let kept: Vec<Value> = groups
            .iter()
            .filter_map(|group| match (hooks_of(group), group.as_object()) {
                (Some(hs), Some(obj)) => {
                    let left: Vec<Value> = hs.iter().filter(|h| !test(h)).cloned().collect();
                    (!left.is_empty()).then(|| {
                        let mut obj = obj.clone();
                        obj.insert("hooks".into(), Value::Array(left));
                        Value::Object(obj)
                    })
                }
                _ => Some(group.clone()),
            })
            .collect();
        if !kept.is_empty() {
            next.insert(event.clone(), Value::Array(kept));
        }
    }
    next
}

/// `hooks` with one group running `command` added to each event, unless it is there already; old
/// Node hooks are dropped first.
fn with_hooks(
    hooks: Option<&Value>,
    events: &[&str],
    command: &str,
    extra: Option<(&str, Value)>,
) -> Object {
    let base = hooks
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut next = if any_hook(&base, is_legacy) {
        without_hooks(&base, is_legacy)
    } else {
        base
    };
    for event in events {
        let mut groups = next
            .get(*event)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let present = groups
            .iter()
            .filter_map(hooks_of)
            .any(|hs| hs.iter().any(is_current));
        if present {
            continue;
        }
        let mut hook = Object::new();
        hook.insert("type".into(), json!("command"));
        hook.insert("command".into(), json!(command));
        hook.insert("timeout".into(), json!(5));
        if let Some((key, value)) = &extra {
            hook.insert((*key).into(), value.clone());
        }
        groups.push(json!({ "hooks": [Value::Object(hook)] }));
        next.insert((*event).into(), Value::Array(groups));
    }
    next
}

/// The command a wrapped statusline ran before (None when it is not ours, empty when it wrapped none).
pub fn unwrap_statusline(command: &str) -> Option<String> {
    if !command.contains(MARK) && !command.contains(LEGACY_MARK) {
        return None;
    }
    let found = command.match_indices("--wrap=").find_map(|(i, _)| {
        let run: String = command[i + 7..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .collect();
        (!run.is_empty()).then_some(run)
    });
    Some(found.map(|run| wrap::decode(&run)).unwrap_or_default())
}

/// The command that runs the forwarder: `"<exe>"`.
pub fn forward_command(exe: &str) -> String {
    format!("\"{exe}\"")
}

/// The ` --url=<base>` that ends a hook command ("" without a base).
pub fn url_suffix(url: Option<&str>) -> String {
    url.filter(|u| !u.is_empty())
        .map(|u| format!(" --url={u}"))
        .unwrap_or_default()
}

fn statusline_with(line: Option<&Value>, command: String) -> Value {
    match line.and_then(Value::as_object) {
        Some(obj) => {
            let mut obj = obj.clone();
            obj.insert("command".into(), Value::String(command));
            Value::Object(obj)
        }
        None => json!({ "type": "command", "command": command }),
    }
}

/// Claude Code settings with the hooks added and the statusline wrapped (`forward` runs the
/// forwarder, `suffix` ends each command).
pub fn install_claude(settings: &Object, forward: &str, suffix: &str) -> Object {
    let hooks = with_hooks(
        settings.get("hooks"),
        &CLAUDE_EVENTS,
        &format!("{forward} hook claude{suffix}"),
        Some(("async", json!(true))),
    );
    let line = settings.get("statusLine");
    let plain = format!("{forward} statusline{suffix}");
    let wrapped = |original: &str| {
        format!(
            "{forward} statusline --wrap={}{suffix}",
            wrap::encode(original)
        )
    };
    let status_line = match line.and_then(|l| l.get("command")).and_then(Value::as_str) {
        None => json!({ "type": "command", "command": plain }),
        Some(c) if c.contains(MARK) => line.cloned().unwrap_or_default(),
        // The old forwarder's statusline: keep what it wrapped, point it at the new one.
        Some(c) if c.contains(LEGACY_MARK) => {
            let original = unwrap_statusline(c).unwrap_or_default();
            let command = if original.is_empty() {
                plain
            } else {
                wrapped(&original)
            };
            statusline_with(line, command)
        }
        Some(c) => statusline_with(line, wrapped(c)),
    };
    let mut next = settings.clone();
    next.insert("hooks".into(), Value::Object(hooks));
    next.insert("statusLine".into(), status_line);
    next
}

/// Claude Code settings without our hooks, the statusline unwrapped (or removed if we added it).
pub fn remove_claude(settings: &Object) -> Object {
    let mut next = settings.clone();
    if let Some(hooks) = settings.get("hooks").and_then(Value::as_object) {
        let kept = without_hooks(hooks, is_ours);
        if kept.is_empty() {
            next.shift_remove("hooks");
        } else {
            next.insert("hooks".into(), Value::Object(kept));
        }
    }
    let line = settings.get("statusLine");
    let before = line
        .and_then(|l| l.get("command"))
        .and_then(Value::as_str)
        .and_then(unwrap_statusline);
    match before {
        Some(original) if original.is_empty() => {
            next.shift_remove("statusLine");
        }
        Some(original) => {
            next.insert("statusLine".into(), statusline_with(line, original));
        }
        None => {}
    }
    next
}

pub fn install_codex(file: &Object, forward: &str, suffix: &str) -> Object {
    let hooks = with_hooks(
        file.get("hooks"),
        &CODEX_EVENTS,
        &format!("{forward} hook codex{suffix}"),
        None,
    );
    let mut next = file.clone();
    next.insert("hooks".into(), Value::Object(hooks));
    next
}

pub fn remove_codex(file: &Object) -> Object {
    let mut next = file.clone();
    if let Some(hooks) = file.get("hooks").and_then(Value::as_object) {
        next.insert("hooks".into(), Value::Object(without_hooks(hooks, is_ours)));
    }
    let empty = match next.get("hooks") {
        None | Some(Value::Null) => true,
        Some(Value::Object(o)) => o.is_empty(),
        Some(_) => false,
    };
    if empty {
        next.shift_remove("hooks");
    }
    next
}

/// Whether two settings objects differ in a hook event or the statusline (all the installer touches).
fn changed(before: &Object, after: &Object) -> bool {
    let hooks = |o: &Object| {
        o.get("hooks")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    };
    let (a, b) = (hooks(before), hooks(after));
    a.keys().chain(b.keys()).any(|e| a.get(e) != b.get(e))
        || before.get("statusLine") != after.get("statusLine")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Installed,
    Removed,
    Skipped,
    Unchanged,
    Error,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Installed => "installed",
            Status::Removed => "removed",
            Status::Skipped => "skipped",
            Status::Unchanged => "unchanged",
            Status::Error => "error",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Outcome {
    pub agent: &'static str,
    pub status: Status,
    pub file: PathBuf,
    pub backup: Option<PathBuf>,
    pub message: String,
}

pub struct Options<'a> {
    /// Without it nothing is written and the statuses say what would happen.
    pub apply: bool,
    pub remove: bool,
    /// The `ips-agent` the hook commands run.
    pub agent: &'a str,
    /// The dashboard the hooks post to, appended to each hook command as `--url=<base>`.
    pub url: Option<&'a str>,
    pub home: &'a Path,
}

/// `{ apply, results: [{ agent, status, file, backup, message }] }`, the shape the Node installer printed.
pub fn to_json(apply: bool, outcomes: &[Outcome]) -> Value {
    let results: Vec<Value> = outcomes
        .iter()
        .map(|o| {
            json!({
                "agent": o.agent,
                "status": o.status.as_str(),
                "file": o.file.to_string_lossy(),
                "backup": o.backup.as_ref().map(|b| b.to_string_lossy().into_owned()),
                "message": o.message,
            })
        })
        .collect();
    json!({ "apply": apply, "results": results })
}

fn read_object(file: &Path) -> Result<(bool, Object), String> {
    let text = match std::fs::read_to_string(file) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok((false, Object::new())),
        Err(e) => return Err(e.to_string()),
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(o)) => Ok((true, o)),
        Ok(_) => Err("not a JSON object".into()),
        Err(e) => Err(e.to_string()),
    }
}

/// `2026-10-23T08-15-30-123Z`, JavaScript's ISO time with ":" and "." replaced by "-".
fn stamp(now: SystemTime) -> String {
    let ms = now
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);
    let (secs, millis) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    // Howard Hinnant's days-to-civil.
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    let rem = secs.rem_euclid(86_400);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}-{:02}-{:02}-{millis:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

fn with_suffix(file: &Path, suffix: &str) -> PathBuf {
    let mut name = file.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

/// Backs the file up (when it exists) and replaces it atomically: the agent's own settings file
/// must never be left cut off by a crash.
fn write(file: &Path, found: bool, next: &Object) -> std::io::Result<Option<PathBuf>> {
    let backup = if found {
        let backup = with_suffix(
            file,
            &format!(".dashboard-{}.bak", stamp(SystemTime::now())),
        );
        std::fs::copy(file, &backup)?;
        Some(backup)
    } else {
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        None
    };
    let text = serde_json::to_string_pretty(next).map_err(std::io::Error::other)?;
    let tmp = with_suffix(file, ".dashboard.tmp");
    std::fs::write(&tmp, format!("{text}\n"))?;
    std::fs::rename(&tmp, file)?;
    Ok(backup)
}

/// One agent's settings file and how this run changes it.
struct Target<'a> {
    name: &'static str,
    file: PathBuf,
    /// The agent's own folder, which must exist (Claude Code's is created along with its file).
    needs_folder: Option<PathBuf>,
    change: Box<dyn Fn(&Object) -> Object + 'a>,
}

/// Plans (and with `apply`, makes) the changes under `opts.home`: one outcome per agent.
pub fn run(opts: &Options) -> Vec<Outcome> {
    let forward = forward_command(opts.agent);
    let suffix = url_suffix(opts.url);
    let claude_dir = opts.home.join(".claude");
    let codex_dir = opts.home.join(".codex");
    let targets = [
        Target {
            name: "Claude Code",
            file: claude_dir.join("settings.json"),
            needs_folder: None,
            change: if opts.remove {
                Box::new(remove_claude)
            } else {
                Box::new(|o| install_claude(o, &forward, &suffix))
            },
        },
        Target {
            name: "Codex",
            file: codex_dir.join("hooks.json"),
            needs_folder: Some(codex_dir),
            change: if opts.remove {
                Box::new(remove_codex)
            } else {
                Box::new(|o| install_codex(o, &forward, &suffix))
            },
        },
    ];
    targets
        .into_iter()
        .map(
            |Target {
                 name,
                 file,
                 needs_folder,
                 change,
             }| {
                let outcome = |status, message: String, backup| Outcome {
                    agent: name,
                    status,
                    file: file.clone(),
                    backup,
                    message,
                };
                if let Some(folder) = needs_folder.filter(|f| !f.exists()) {
                    let message = format!(
                        "{name}: not installed ({} missing), skipped.",
                        folder.display()
                    );
                    return outcome(Status::Skipped, message, None);
                }
                let (found, data) = match read_object(&file) {
                    Ok(read) => read,
                    Err(e) => {
                        let message = format!(
                            "{name}: {} is not valid JSON ({e}); left alone.",
                            file.display()
                        );
                        return outcome(Status::Error, message, None);
                    }
                };
                let next = change(&data);
                if !changed(&data, &next) {
                    let message = format!("{name}: nothing to change in {}.", file.display());
                    return outcome(Status::Unchanged, message, None);
                }
                let status = if opts.remove {
                    Status::Removed
                } else {
                    Status::Installed
                };
                if !opts.apply {
                    return outcome(status, String::new(), None);
                }
                match write(&file, found, &next) {
                    Ok(backup) => outcome(status, String::new(), backup),
                    Err(e) => {
                        let message = format!("{name}: could not write {} ({e}).", file.display());
                        outcome(Status::Error, message, None)
                    }
                }
            },
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const FWD: &str = "\"E:/app/ips-agent.exe\"";
    const OLD_FWD: &str = "\"C:/n/node.exe\" \"E:/app/tools/agent-status.mjs\"";

    fn obj(v: Value) -> Object {
        v.as_object().unwrap().clone()
    }

    fn mine() -> Object {
        obj(json!({
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "my-stop.sh" }] }] },
            "statusLine": { "type": "command", "command": "node \"C:/Users/me/.claude/statusline.mjs\"", "padding": 1 },
            "model": "opus"
        }))
    }

    fn command_at(settings: &Object, event: &str, group: usize) -> String {
        settings["hooks"][event][group]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    #[test]
    fn adds_a_hook_per_event_beside_the_users_own_and_wraps_the_statusline() {
        let next = install_claude(&mine(), FWD, "");
        let mut events: Vec<&str> = next["hooks"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        events.sort_unstable();
        let mut expected = CLAUDE_EVENTS.to_vec();
        expected.sort_unstable();
        assert_eq!(events, expected);
        assert_eq!(next["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(next["hooks"]["Stop"][0], mine()["hooks"]["Stop"][0]);
        assert_eq!(
            next["hooks"]["Stop"][1]["hooks"][0],
            json!({ "type": "command", "command": format!("{FWD} hook claude"), "timeout": 5, "async": true })
        );
        assert_eq!(next["statusLine"]["padding"], 1);
        let line = next["statusLine"]["command"].as_str().unwrap();
        assert!(line.starts_with(&format!("{FWD} statusline --wrap=")));
        assert_eq!(
            unwrap_statusline(line).unwrap(),
            mine()["statusLine"]["command"].as_str().unwrap()
        );
        assert_eq!(next["model"], "opus");
    }

    #[test]
    fn is_idempotent_and_fully_reversible() {
        let once = install_claude(&mine(), FWD, "");
        assert_eq!(install_claude(&once, FWD, ""), once);
        assert_eq!(remove_claude(&once), mine());
        // A statusline we added (none before) goes away again.
        let bare = install_claude(&Object::new(), FWD, "");
        assert_eq!(bare["statusLine"]["command"], format!("{FWD} statusline"));
        assert_eq!(remove_claude(&bare), Object::new());
    }

    #[test]
    fn keeps_the_key_order_of_what_it_does_not_touch() {
        let text = r#"{"zeta":1,"alpha":{"b":2,"a":1},"hooks":{"Stop":[]},"model":"x"}"#;
        let next = install_claude(&obj(serde_json::from_str(text).unwrap()), FWD, "");
        let keys: Vec<&str> = next.keys().map(String::as_str).collect();
        assert_eq!(keys, ["zeta", "alpha", "hooks", "model", "statusLine"]);
        let inner: Vec<&str> = next["alpha"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(inner, ["b", "a"]);
    }

    #[test]
    fn does_the_same_for_codex() {
        let file = obj(
            json!({ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "x" }] }] } }),
        );
        let next = install_codex(&file, FWD, "");
        assert_eq!(next["hooks"].as_object().unwrap().len(), CODEX_EVENTS.len());
        assert_eq!(
            command_at(&next, "Interrupt", 0),
            format!("{FWD} hook codex")
        );
        assert!(next["hooks"]["Interrupt"][0]["hooks"][0]
            .get("async")
            .is_none());
        assert_eq!(remove_codex(&next), file);
        assert_eq!(
            remove_codex(&install_codex(&Object::new(), FWD, "")),
            Object::new()
        );
    }

    #[test]
    fn ends_each_command_with_the_url() {
        let url = url_suffix(Some("http://127.0.0.1:3999"));
        assert_eq!(url_suffix(None), "");
        let claude = install_claude(
            &obj(json!({ "statusLine": { "type": "command", "command": "mine" } })),
            FWD,
            &url,
        );
        assert_eq!(
            command_at(&claude, "Stop", 0),
            format!("{FWD} hook claude --url=http://127.0.0.1:3999")
        );
        let line = claude["statusLine"]["command"].as_str().unwrap();
        assert!(line.ends_with(" --url=http://127.0.0.1:3999"));
        assert_eq!(unwrap_statusline(line).unwrap(), "mine");
        let bare = install_claude(&Object::new(), FWD, &url);
        assert_eq!(
            bare["statusLine"]["command"],
            format!("{FWD} statusline --url=http://127.0.0.1:3999")
        );
        assert_eq!(
            remove_claude(&claude),
            obj(json!({ "statusLine": { "type": "command", "command": "mine" } }))
        );
    }

    #[test]
    fn leaves_other_tools_hooks_alone_through_install_and_remove() {
        let others = obj(json!({
            "hooks": {
                "Stop": [
                    { "matcher": "x", "hooks": [{ "type": "command", "command": "a.sh" }, { "type": "command", "command": "b.sh" }] },
                    { "hooks": [{ "type": "command", "command": "c.sh" }] }
                ],
                "Custom": [{ "hooks": [{ "type": "command", "command": "d.sh" }] }],
                "Odd": "not a list",
                "Empty": []
            }
        }));
        let next = install_claude(&others, FWD, "");
        for event in ["Custom", "Odd", "Empty"] {
            assert_eq!(next["hooks"][event], others["hooks"][event]);
        }
        assert_eq!(next["hooks"]["Stop"].as_array().unwrap().len(), 3);
        // The same group that holds a user hook and ours loses only ours.
        let mut shared = next.clone();
        let ours = shared["hooks"]["Stop"][2]["hooks"][0].clone();
        shared["hooks"]["Stop"][0]["hooks"]
            .as_array_mut()
            .unwrap()
            .push(ours);
        let cleaned = remove_claude(&shared);
        assert_eq!(cleaned["hooks"]["Stop"][0], others["hooks"]["Stop"][0]);
        assert_eq!(cleaned["hooks"]["Stop"][1], others["hooks"]["Stop"][1]);
        assert_eq!(cleaned["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(cleaned["hooks"]["Custom"], others["hooks"]["Custom"]);
    }

    #[test]
    fn replaces_the_old_node_hooks() {
        let old = obj(json!({
            "hooks": {
                "Stop": [
                    { "hooks": [{ "type": "command", "command": "my-stop.sh" }] },
                    { "hooks": [{ "type": "command", "command": format!("{OLD_FWD} hook claude --url=http://127.0.0.1:3922"), "timeout": 5, "async": true }] }
                ],
                "Notification": [{ "hooks": [{ "type": "command", "command": format!("{OLD_FWD} hook claude"), "timeout": 5 }] }]
            },
            "statusLine": { "type": "command", "command": format!("{OLD_FWD} statusline --wrap={} --url=http://127.0.0.1:3922", wrap::encode("my line")), "padding": 2 }
        }));
        let next = install_claude(&old, FWD, " --url=http://127.0.0.1:3922");
        let text = serde_json::to_string(&next).unwrap();
        assert!(!text.contains(LEGACY_MARK));
        assert_eq!(next["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(next["hooks"]["Stop"][0], old["hooks"]["Stop"][0]);
        assert_eq!(
            command_at(&next, "Stop", 1),
            format!("{FWD} hook claude --url=http://127.0.0.1:3922")
        );
        assert_eq!(
            next["hooks"].as_object().unwrap().len(),
            CLAUDE_EVENTS.len()
        );
        let line = &next["statusLine"];
        assert_eq!(line["padding"], 2);
        assert!(line["command"]
            .as_str()
            .unwrap()
            .starts_with(&format!("{FWD} statusline --wrap=")));
        assert_eq!(
            unwrap_statusline(line["command"].as_str().unwrap()).unwrap(),
            "my line"
        );
        assert_eq!(
            install_claude(&next, FWD, " --url=http://127.0.0.1:3922"),
            next
        );
        // A bare old statusline (it wrapped none) becomes a bare new one.
        let bare = install_claude(
            &obj(
                json!({ "statusLine": { "type": "command", "command": format!("{OLD_FWD} statusline") } }),
            ),
            FWD,
            "",
        );
        assert_eq!(bare["statusLine"]["command"], format!("{FWD} statusline"));
        // Removing also takes the old ones out.
        assert_eq!(
            remove_claude(&old)["hooks"]["Stop"],
            json!([old["hooks"]["Stop"][0]])
        );
        assert_eq!(remove_claude(&old)["statusLine"]["command"], "my line");
        let old_codex = obj(
            json!({ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": format!("{OLD_FWD} hook codex") }] }] } }),
        );
        assert_eq!(remove_codex(&old_codex), Object::new());
        let migrated = install_codex(&old_codex, FWD, "");
        assert!(!serde_json::to_string(&migrated)
            .unwrap()
            .contains(LEGACY_MARK));
        assert_eq!(
            command_at(&migrated, "Stop", 0),
            format!("{FWD} hook codex")
        );
    }

    #[test]
    fn unwraps_only_our_statuslines() {
        assert_eq!(unwrap_statusline("mine --wrap=YQ"), None);
        assert_eq!(
            unwrap_statusline("\"ips-agent.exe\" statusline").as_deref(),
            Some("")
        );
        assert_eq!(
            unwrap_statusline("\"ips-agent.exe\" statusline --wrap= --wrap=YQ").as_deref(),
            Some("a")
        );
    }

    #[test]
    fn stamps_like_javascript_iso_time() {
        let t = SystemTime::UNIX_EPOCH + std::time::Duration::from_millis(1_792_743_330_123);
        assert_eq!(stamp(t), "2026-10-23T08-15-30-123Z");
        assert_eq!(stamp(SystemTime::UNIX_EPOCH), "1970-01-01T00-00-00-000Z");
    }

    fn opts<'a>(home: &'a Path, apply: bool, remove: bool) -> Options<'a> {
        Options {
            apply,
            remove,
            agent: "C:/app/ips-agent.exe",
            url: Some("http://127.0.0.1:3999"),
            home,
        }
    }

    fn summary(out: &[Outcome]) -> Vec<(&'static str, &'static str)> {
        out.iter().map(|o| (o.agent, o.status.as_str())).collect()
    }

    #[test]
    fn reports_each_agents_status_and_backs_up_what_it_rewrites() {
        let home = tempfile::tempdir().unwrap();
        let file = home.path().join(".claude").join("settings.json");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, r#"{"model":"opus"}"#).unwrap();

        let dry = run(&opts(home.path(), false, false));
        assert_eq!(
            summary(&dry),
            [("Claude Code", "installed"), ("Codex", "skipped")]
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), r#"{"model":"opus"}"#);

        let done = run(&opts(home.path(), true, false));
        assert_eq!(done[0].file, file);
        let backup = done[0].backup.clone().unwrap();
        assert!(
            backup.to_string_lossy().contains(".dashboard-")
                && backup.to_string_lossy().ends_with(".bak")
        );
        assert_eq!(fs::read_to_string(backup).unwrap(), r#"{"model":"opus"}"#);
        let text = fs::read_to_string(&file).unwrap();
        // Pretty, two spaces, trailing newline; the temp file is gone.
        assert!(text.starts_with("{\n  \"model\": \"opus\",\n  \"hooks\": {"));
        assert!(text.ends_with("}\n"));
        assert!(!file.with_file_name("settings.json.dashboard.tmp").exists());
        let saved: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            saved["hooks"]["Stop"][0]["hooks"][0]["command"],
            "\"C:/app/ips-agent.exe\" hook claude --url=http://127.0.0.1:3999"
        );

        // Again: nothing to do, no new backup.
        let again = run(&opts(home.path(), true, false));
        assert_eq!(again[0].status, Status::Unchanged);
        assert!(again[0].backup.is_none());
        let removed = run(&opts(home.path(), true, true));
        assert_eq!(removed[0].status, Status::Removed);
        assert_eq!(
            serde_json::from_str::<Value>(&fs::read_to_string(&file).unwrap()).unwrap(),
            json!({ "model": "opus" })
        );
    }

    #[test]
    fn creates_codexs_file_and_reports_unreadable_json_as_an_error() {
        let home = tempfile::tempdir().unwrap();
        fs::create_dir_all(home.path().join(".codex")).unwrap();
        fs::create_dir_all(home.path().join(".claude")).unwrap();
        let claude = home.path().join(".claude").join("settings.json");
        fs::write(&claude, "{ nope").unwrap();
        let out = run(&opts(home.path(), true, false));
        assert_eq!(out[0].status, Status::Error);
        assert!(out[0].message.contains("not valid JSON"));
        assert_eq!(fs::read_to_string(&claude).unwrap(), "{ nope");
        assert_eq!(out[1].status, Status::Installed);
        assert!(out[1].backup.is_none());
        assert!(home.path().join(".codex").join("hooks.json").exists());
    }

    #[test]
    fn creates_claudes_file_and_folder_when_missing() {
        let home = tempfile::tempdir().unwrap();
        let out = run(&opts(home.path(), true, false));
        assert_eq!(out[0].status, Status::Installed);
        assert!(out[0].backup.is_none());
        assert!(home.path().join(".claude").join("settings.json").exists());
        // Remove empties it again, with a backup of what was there.
        let removed = run(&opts(home.path(), true, true));
        assert!(removed[0].backup.is_some());
        let left = fs::read_to_string(home.path().join(".claude").join("settings.json")).unwrap();
        assert_eq!(left, "{}\n");
    }

    #[test]
    fn migrates_old_hooks_on_a_temp_home_and_json_has_the_old_shape() {
        let home = tempfile::tempdir().unwrap();
        let file = home.path().join(".claude").join("settings.json");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        let old = install_old(&obj(json!({ "model": "opus" })));
        fs::write(&file, serde_json::to_string_pretty(&old).unwrap()).unwrap();
        let out = run(&opts(home.path(), true, false));
        assert_eq!(out[0].status, Status::Installed);
        let text = fs::read_to_string(&file).unwrap();
        assert!(!text.contains(LEGACY_MARK) && text.contains("ips-agent.exe"));
        let json = to_json(true, &out);
        assert_eq!(json["apply"], true);
        let mut keys: Vec<&str> = json["results"][0]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(keys, ["agent", "backup", "file", "message", "status"]);
    }

    /// Settings as the old node-based installer left them.
    fn install_old(base: &Object) -> Object {
        let mut next = base.clone();
        let hooks: Object = CLAUDE_EVENTS
            .iter()
            .map(|e| ((*e).to_owned(), json!([{ "hooks": [{ "type": "command", "command": format!("{OLD_FWD} hook claude"), "timeout": 5, "async": true }] }])))
            .collect();
        next.insert("hooks".into(), Value::Object(hooks));
        next.insert(
            "statusLine".into(),
            json!({ "type": "command", "command": format!("{OLD_FWD} statusline") }),
        );
        next
    }
}
