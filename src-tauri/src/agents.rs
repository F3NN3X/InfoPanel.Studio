// The optional Claude Code / Codex hooks, installed and removed in-process by ips-agent's
// installer (a port of tools/agent-install.mjs). They run the bundled ips-agent.exe.

use crate::paths::{self, Paths};
use crate::settings::{AgentInstall, Settings};
use ips_agent::install;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// The installer leaves an existing hook alone, so installing is always a removal followed by an
/// install (see `install_steps`).
pub fn install_steps(enable: bool) -> &'static [bool] {
    if enable {
        &[false, true]
    } else {
        &[false]
    }
}

/// The base URL the hooks post to.
pub fn hook_url(s: &Settings) -> String {
    crate::settings::server_origin(s)
}

/// The ips-agent the hook commands run, with forward slashes: the agents run hook commands through
/// a shell, and a backslash in a quoted path can be an escape there.
pub fn agent_path(paths: &Paths) -> String {
    paths::display(&paths.agent_exe()).replace('\\', "/")
}

pub fn install_record(s: &Settings, version: &str, agent: &str) -> AgentInstall {
    AgentInstall {
        version: version.into(),
        url: hook_url(s),
        agent: agent.into(),
    }
}

/// True when the hooks are on but were written for another app version, URL or ips-agent path
/// (hooks from before ips-agent have no path, so they count as stale and are migrated).
pub fn needs_reinstall(s: &Settings, version: &str, agent: &str) -> bool {
    s.agents.enabled && s.agents.installed.as_ref() != Some(&install_record(s, version, agent))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub step: &'static str,
    pub ok: bool,
    /// The installer's result: `{ apply, results: [...] }`.
    pub output: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResult {
    pub ok: bool,
    pub enabled: bool,
    pub steps: Vec<StepResult>,
}

fn run_step(paths: &Paths, s: &Settings, home: &Path, install_hooks: bool) -> StepResult {
    let step = if install_hooks { "install" } else { "remove" };
    if install_hooks && !paths.agent_exe().is_file() {
        return StepResult {
            step,
            ok: false,
            output: None,
            error: Some(format!(
                "{} is missing from the app folder",
                paths::display(&paths.agent_exe())
            )),
        };
    }
    let agent = agent_path(paths);
    let url = hook_url(s);
    log::debug!("agents: {step} for {agent} -> {url}");
    let outcomes = install::run(&install::Options {
        apply: true,
        remove: !install_hooks,
        agent: &agent,
        url: Some(&url),
        home,
    });
    let errors: Vec<&str> = outcomes
        .iter()
        .filter(|o| o.status == install::Status::Error)
        .map(|o| o.message.as_str())
        .collect();
    StepResult {
        step,
        ok: errors.is_empty(),
        output: Some(install::to_json(true, &outcomes)),
        error: (!errors.is_empty()).then(|| errors.join("\n")),
    }
}

/// Installs (`enable`) or removes the hooks, then writes or deletes the uninstaller's marker.
pub fn apply(paths: &Paths, s: &Settings, home: &Path, enable: bool) -> AgentResult {
    let mut steps = Vec::new();
    for &install_hooks in install_steps(enable) {
        let r = run_step(paths, s, home, install_hooks);
        let ok = r.ok;
        steps.push(r);
        if !ok {
            break;
        }
    }
    let ok = steps.iter().all(|r| r.ok);
    if ok {
        let marker = paths.agents_marker();
        let _ = if enable {
            std::fs::write(&marker, agent_path(paths))
        } else {
            std::fs::remove_file(&marker).or(Ok(()))
        };
    }
    log::info!("agents: {} -> ok={ok}", if enable { "on" } else { "off" });
    AgentResult {
        ok,
        enabled: enable,
        steps,
    }
}

/// The result when the hooks could not even be attempted (no home folder).
pub fn failed(enable: bool, error: String) -> AgentResult {
    AgentResult {
        ok: false,
        enabled: enable,
        steps: vec![StepResult {
            step: if enable { "install" } else { "remove" },
            ok: false,
            output: None,
            error: Some(error),
        }],
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
}

impl Agent {
    /// The name the installer reports the agent by.
    fn install_name(self) -> &'static str {
        match self {
            Agent::Claude => "Claude Code",
            Agent::Codex => "Codex",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HookState {
    Installed,
    NotConnected,
    /// Enabled, but the hooks are missing, changed or written for another setup.
    NeedsRepair,
    /// The agent's folder doesn't exist.
    NotFound,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentStatus {
    pub agent: Agent,
    pub path: String,
    pub status: HookState,
}

/// The folder and the file the installer edits for each agent under `home`.
pub fn agent_files(home: &Path) -> [(Agent, PathBuf, PathBuf); 2] {
    let claude = home.join(".claude");
    let codex = home.join(".codex");
    [
        (Agent::Claude, claude.join("settings.json"), claude),
        (Agent::Codex, codex.join("hooks.json"), codex),
    ]
}

/// `planned` is what a dry run of the install would do to the file (the installer's status:
/// `unchanged` means every hook is in place); None when the dry run could not tell.
pub fn hook_state(folder: bool, enabled: bool, stale: bool, planned: Option<&str>) -> HookState {
    if !folder {
        HookState::NotFound
    } else if !enabled {
        HookState::NotConnected
    } else if !stale && planned == Some("unchanged") {
        HookState::Installed
    } else {
        HookState::NeedsRepair
    }
}

/// The installer's dry-run status for `agent` in its result.
pub fn planned_status(output: &Value, agent: Agent) -> Option<&str> {
    output
        .get("results")?
        .as_array()?
        .iter()
        .find(|r| r.get("agent").and_then(Value::as_str) == Some(agent.install_name()))?
        .get("status")?
        .as_str()
}

/// Each agent's hook file and whether the hooks are in place. Runs a dry run of the install
/// (nothing is written) only when the hooks are on and recorded as current.
pub fn statuses(paths: &Paths, s: &Settings, version: &str, home: &Path) -> Vec<AgentStatus> {
    let agent = agent_path(paths);
    let stale = needs_reinstall(s, version, &agent);
    let files = agent_files(home);
    let any_folder = files.iter().any(|(_, _, dir)| dir.is_dir());
    let planned = (s.agents.enabled && !stale && any_folder).then(|| {
        let url = hook_url(s);
        let outcomes = install::run(&install::Options {
            apply: false,
            remove: false,
            agent: &agent,
            url: Some(&url),
            home,
        });
        install::to_json(false, &outcomes)
    });
    files
        .into_iter()
        .map(|(kind, file, dir)| AgentStatus {
            agent: kind,
            path: paths::display(&file),
            status: hook_state(
                dir.is_dir(),
                s.agents.enabled,
                stale,
                planned.as_ref().and_then(|p| planned_status(p, kind)),
            ),
        })
        .collect()
}

/// The newest backup the installer made (`<file>.dashboard-<time>.bak`, beside each file).
pub fn newest_backup(dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter()
        .filter_map(|d| std::fs::read_dir(d).ok())
        .flatten()
        .filter_map(Result::ok)
        .filter(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name.contains(".dashboard-") && name.ends_with(".bak")
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .max_by_key(|(t, _)| *t)
        .map(|(_, p)| p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ips-agents-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// An install folder holding a stand-in ips-agent.exe, and a settings struct for port 3942.
    fn fixture(name: &str) -> (PathBuf, Paths, Settings) {
        let root = temp(name);
        let resources = root.join("res");
        std::fs::create_dir_all(&resources).unwrap();
        std::fs::write(resources.join("ips-agent.exe"), "x").unwrap();
        let paths = Paths {
            config_dir: root.join("config"),
            log_dir: root.join("logs"),
            resource_dir: resources,
            data_dir: None,
        };
        std::fs::create_dir_all(&paths.config_dir).unwrap();
        let settings = Settings {
            port: 3942,
            ..Settings::default()
        };
        (root, paths, settings)
    }

    fn read(file: &Path) -> Value {
        serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap()
    }

    #[test]
    fn enabling_removes_first() {
        assert_eq!(install_steps(true), &[false, true]);
        assert_eq!(install_steps(false), &[false]);
    }

    #[test]
    fn hook_url_follows_the_connect_host() {
        let s = Settings {
            listen: crate::settings::Listen::Lan,
            port: 3942,
            ..Settings::default()
        };
        assert_eq!(hook_url(&s), "http://127.0.0.1:3942");
    }

    #[test]
    fn the_agent_path_uses_forward_slashes() {
        let paths = Paths {
            config_dir: "c".into(),
            log_dir: "l".into(),
            resource_dir: PathBuf::from(r"C:\Apps\InfoPanel Studio"),
            data_dir: None,
        };
        let path = agent_path(&paths);
        assert!(!path.contains('\\') && path.ends_with("InfoPanel Studio/ips-agent.exe"));
    }

    #[test]
    fn reinstall_on_version_port_or_agent_path_change() {
        let mut s = Settings::default();
        assert!(!needs_reinstall(&s, "1.0.0", "a"));
        s.agents.enabled = true;
        assert!(needs_reinstall(&s, "1.0.0", "a"));
        s.agents.installed = Some(install_record(&s, "1.0.0", "a"));
        assert!(!needs_reinstall(&s, "1.0.0", "a"));
        assert!(needs_reinstall(&s, "1.1.0", "a"));
        assert!(needs_reinstall(&s, "1.0.0", "b"));
        s.port = 3942;
        assert!(needs_reinstall(&s, "1.0.0", "a"));
    }

    #[test]
    fn a_record_from_the_node_era_is_stale() {
        let mut s = Settings::default();
        s.agents.enabled = true;
        let old: crate::settings::AgentSettings = serde_json::from_value(json!({
            "enabled": true,
            "installed": { "version": "1.0.0", "url": hook_url(&s), "node": "C:/n/node.exe" }
        }))
        .unwrap();
        s.agents = old;
        assert!(needs_reinstall(&s, "1.0.0", "C:/app/ips-agent.exe"));
    }

    #[test]
    fn hook_states() {
        assert_eq!(
            hook_state(false, true, false, Some("unchanged")),
            HookState::NotFound
        );
        assert_eq!(
            hook_state(true, false, false, None),
            HookState::NotConnected
        );
        assert_eq!(
            hook_state(true, true, false, Some("unchanged")),
            HookState::Installed
        );
        assert_eq!(
            hook_state(true, true, false, Some("installed")),
            HookState::NeedsRepair
        );
        assert_eq!(
            hook_state(true, true, true, Some("unchanged")),
            HookState::NeedsRepair
        );
        assert_eq!(hook_state(true, true, false, None), HookState::NeedsRepair);
        assert_eq!(
            serde_json::to_value(HookState::NotConnected).unwrap(),
            "not_connected"
        );
    }

    #[test]
    fn dry_run_status_per_agent() {
        let out = json!({ "apply": false, "results": [
            { "agent": "Claude Code", "status": "unchanged" },
            { "agent": "Codex", "status": "skipped" }
        ] });
        assert_eq!(planned_status(&out, Agent::Claude), Some("unchanged"));
        assert_eq!(planned_status(&out, Agent::Codex), Some("skipped"));
        assert_eq!(planned_status(&json!({}), Agent::Codex), None);
    }

    #[test]
    fn agent_files_are_the_ones_the_installer_edits() {
        let [claude, codex] = agent_files(Path::new("H"));
        assert_eq!(claude.0, Agent::Claude);
        assert_eq!(claude.1, Path::new("H/.claude/settings.json"));
        assert_eq!(codex.1, Path::new("H/.codex/hooks.json"));
        assert_eq!(codex.2, Path::new("H/.codex"));
    }

    #[test]
    fn turning_on_writes_the_hooks_and_the_marker_and_off_takes_them_out() {
        let (root, paths, mut s) = fixture("on-off");
        let home = root.join("home");
        let claude = home.join(".claude").join("settings.json");
        std::fs::create_dir_all(claude.parent().unwrap()).unwrap();
        std::fs::write(&claude, r#"{"model":"opus","hooks":{"Stop":[{"hooks":[{"type":"command","command":"mine.sh"}]}]}}"#).unwrap();

        let on = apply(&paths, &s, &home, true);
        assert!(on.ok, "{on:?}");
        assert_eq!(on.steps.len(), 2);
        let agent = agent_path(&paths);
        assert_eq!(
            std::fs::read_to_string(paths.agents_marker()).unwrap(),
            agent
        );
        let saved = read(&claude);
        assert_eq!(saved["hooks"]["Stop"][0]["hooks"][0]["command"], "mine.sh");
        assert_eq!(
            saved["hooks"]["Stop"][1]["hooks"][0]["command"],
            format!("\"{agent}\" hook claude --url=http://127.0.0.1:3942")
        );

        // Recorded as current, the dry run finds nothing to do; a new port makes it stale.
        s.agents.enabled = true;
        s.agents.installed = Some(install_record(&s, "1.0.0", &agent));
        let st = statuses(&paths, &s, "1.0.0", &home);
        assert_eq!(st[0].status, HookState::Installed);
        assert_eq!(st[1].status, HookState::NotFound);
        s.port = 3943;
        assert_eq!(
            statuses(&paths, &s, "1.0.0", &home)[0].status,
            HookState::NeedsRepair
        );

        let off = apply(&paths, &s, &home, false);
        assert!(off.ok);
        assert!(!paths.agents_marker().exists());
        assert_eq!(
            read(&claude),
            json!({ "model": "opus", "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "mine.sh" }] }] } })
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn turning_on_migrates_the_old_node_hooks() {
        let (root, paths, s) = fixture("migrate");
        let home = root.join("home");
        let claude = home.join(".claude").join("settings.json");
        std::fs::create_dir_all(claude.parent().unwrap()).unwrap();
        let old = r#""C:/n/node.exe" "C:/app/tools/agent-status.mjs""#;
        let hook = |c: &str| json!([{ "hooks": [{ "type": "command", "command": c, "timeout": 5, "async": true }] }]);
        std::fs::write(
            &claude,
            serde_json::to_string(&json!({
                "hooks": { "Stop": hook(&format!("{old} hook claude --url=http://127.0.0.1:3942")) },
                "statusLine": { "type": "command", "command": format!("{old} statusline --url=http://127.0.0.1:3942") }
            }))
            .unwrap(),
        )
        .unwrap();

        let on = apply(&paths, &s, &home, true);
        assert!(on.ok, "{on:?}");
        let text = std::fs::read_to_string(&claude).unwrap();
        assert!(!text.contains("agent-status.mjs") && !text.contains("node.exe"));
        assert_eq!(read(&claude)["hooks"]["Stop"].as_array().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn turning_on_fails_clearly_without_the_bundled_agent_or_with_unreadable_settings() {
        let (root, paths, s) = fixture("fails");
        let home = root.join("home");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude").join("settings.json"), "{ nope").unwrap();
        let bad = apply(&paths, &s, &home, true);
        assert!(!bad.ok);
        assert!(bad
            .steps
            .last()
            .unwrap()
            .error
            .as_deref()
            .unwrap()
            .contains("not valid JSON"));
        assert!(!paths.agents_marker().exists());

        std::fs::remove_file(home.join(".claude").join("settings.json")).unwrap();
        std::fs::remove_file(paths.agent_exe()).unwrap();
        let missing = apply(&paths, &s, &home, true);
        assert!(!missing.ok);
        assert!(missing
            .steps
            .last()
            .unwrap()
            .error
            .as_deref()
            .unwrap()
            .contains("ips-agent.exe is missing"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn finds_the_newest_backup() {
        let dir = std::env::temp_dir().join(format!("ips-backups-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(newest_backup(std::slice::from_ref(&dir)), None);
        std::fs::write(dir.join("settings.json"), "{}").unwrap();
        std::fs::write(dir.join("settings.json.dashboard-1.bak"), "{}").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        std::fs::write(dir.join("settings.json.dashboard-2.bak"), "{}").unwrap();
        assert_eq!(
            newest_backup(&[dir.clone(), dir.join("missing")]),
            Some(dir.join("settings.json.dashboard-2.bak"))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
