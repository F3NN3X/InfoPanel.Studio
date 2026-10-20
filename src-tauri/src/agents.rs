// The optional Claude Code / Codex hooks, installed and removed by the bundled
// tools/agent-install.mjs run with the bundled node.

use crate::paths::{self, Paths};
use crate::settings::{AgentInstall, Settings};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// The arguments after node.exe. agent-install leaves an existing hook alone, so installing is
/// always a removal followed by an apply (see `install_steps`).
pub fn agent_args(script: &str, node: &str, url: &str, install: bool) -> Vec<String> {
    let mut args = vec![script.to_owned()];
    if install {
        args.push("--apply".into());
        args.push(format!("--node={node}"));
        args.push(format!("--url={url}"));
    } else {
        args.push("--remove".into());
        args.push("--apply".into());
    }
    args.push("--json".into());
    args
}

/// Turning on (or refreshing) removes the old hooks first so the new node path and URL land.
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

pub fn install_record(s: &Settings, version: &str, node: &str) -> AgentInstall {
    AgentInstall {
        version: version.into(),
        url: hook_url(s),
        node: node.into(),
    }
}

/// True when the hooks are on but were written for another app version, URL or node path.
pub fn needs_reinstall(s: &Settings, version: &str, node: &str) -> bool {
    s.agents.enabled && s.agents.installed.as_ref() != Some(&install_record(s, version, node))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub step: &'static str,
    pub ok: bool,
    /// agent-install's `--json` output: `{ apply, results: [...] }`.
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

/// The JSON object agent-install printed (the whole output, or its last JSON line).
pub fn parse_output(stdout: &str) -> Option<Value> {
    serde_json::from_str::<Value>(stdout.trim())
        .ok()
        .or_else(|| {
            stdout
                .lines()
                .rev()
                .find_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        })
        .filter(Value::is_object)
}

/// A result list where any agent reported `error` counts as a failed step.
pub fn output_has_error(v: &Value) -> bool {
    v.get("results").and_then(Value::as_array).is_some_and(|r| {
        r.iter()
            .any(|x| x.get("status").and_then(Value::as_str) == Some("error"))
    })
}

fn run_step(paths: &Paths, s: &Settings, install: bool) -> StepResult {
    let step = if install { "install" } else { "remove" };
    let node = paths::display(&paths.node_exe());
    let script = paths::display(&paths.agent_install_script());
    let args = agent_args(&script, &node, &hook_url(s), install);
    run_script(paths, step, &node, &args)
}

fn run_script(paths: &Paths, step: &'static str, node: &str, args: &[String]) -> StepResult {
    log::debug!("agents: {node} {}", args.join(" "));
    let out = crate::sidecar::hidden_command(node)
        .args(args)
        .current_dir(paths::display(&paths.app_dir()))
        .output();
    match out {
        Err(e) => StepResult {
            step,
            ok: false,
            output: None,
            error: Some(format!("could not run the bundled node: {e}")),
        },
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let output = parse_output(&stdout);
            let failed = !o.status.success() || output.as_ref().is_none_or(output_has_error);
            let error = failed.then(|| {
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_owned();
                if stderr.is_empty() {
                    format!("agent-install exited with {}", o.status)
                } else {
                    stderr
                }
            });
            StepResult {
                step,
                ok: !failed,
                output,
                error,
            }
        }
    }
}

/// Installs (`enable`) or removes the hooks, then writes or deletes the uninstaller's marker.
pub fn apply(paths: &Paths, s: &Settings, enable: bool) -> AgentResult {
    let mut steps = Vec::new();
    for &install in install_steps(enable) {
        let r = run_step(paths, s, install);
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
            std::fs::write(&marker, paths::display(&paths.node_exe()))
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
}

impl Agent {
    /// The name agent-install reports the agent by.
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

/// The folder and the file agent-install edits for each agent under `home`.
pub fn agent_files(home: &Path) -> [(Agent, PathBuf, PathBuf); 2] {
    let claude = home.join(".claude");
    let codex = home.join(".codex");
    [
        (Agent::Claude, claude.join("settings.json"), claude),
        (Agent::Codex, codex.join("hooks.json"), codex),
    ]
}

/// `planned` is what a dry run of the install would do to the file (agent-install's status:
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

/// agent-install's dry-run status for `agent` in its `--json` output.
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
    let node = paths::display(&paths.node_exe());
    let stale = needs_reinstall(s, version, &node);
    let files = agent_files(home);
    let any_folder = files.iter().any(|(_, _, dir)| dir.is_dir());
    let planned = (s.agents.enabled && !stale && any_folder)
        .then(|| {
            let script = paths::display(&paths.agent_install_script());
            let mut args = agent_args(&script, &node, &hook_url(s), true);
            // A dry run: the same arguments without --apply.
            args.retain(|a| a != "--apply");
            run_script(paths, "check", &node, &args).output
        })
        .flatten();
    files
        .into_iter()
        .map(|(agent, file, dir)| AgentStatus {
            agent,
            path: paths::display(&file),
            status: hook_state(
                dir.is_dir(),
                s.agents.enabled,
                stale,
                planned.as_ref().and_then(|p| planned_status(p, agent)),
            ),
        })
        .collect()
}

/// The newest backup agent-install made (`<file>.dashboard-<time>.bak`, beside each file).
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

    #[test]
    fn install_args() {
        let args = agent_args(
            r"C:\S\app\tools\agent-install.mjs",
            r"C:\S\node\node.exe",
            "http://127.0.0.1:3942",
            true,
        );
        assert_eq!(
            args,
            vec![
                r"C:\S\app\tools\agent-install.mjs",
                "--apply",
                r"--node=C:\S\node\node.exe",
                "--url=http://127.0.0.1:3942",
                "--json"
            ]
        );
    }

    #[test]
    fn remove_args() {
        let args = agent_args("x.mjs", "node.exe", "http://127.0.0.1:3922", false);
        assert_eq!(args, vec!["x.mjs", "--remove", "--apply", "--json"]);
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
    fn reinstall_on_version_port_or_node_change() {
        let mut s = Settings::default();
        assert!(!needs_reinstall(&s, "1.0.0", "n"));
        s.agents.enabled = true;
        assert!(needs_reinstall(&s, "1.0.0", "n"));
        s.agents.installed = Some(install_record(&s, "1.0.0", "n"));
        assert!(!needs_reinstall(&s, "1.0.0", "n"));
        assert!(needs_reinstall(&s, "1.1.0", "n"));
        assert!(needs_reinstall(&s, "1.0.0", "m"));
        s.port = 3942;
        assert!(needs_reinstall(&s, "1.0.0", "n"));
    }

    #[test]
    fn parses_json_output() {
        let v = parse_output("note\n{\"apply\":true,\"results\":[]}\n").unwrap();
        assert_eq!(v["apply"], true);
        assert!(parse_output("nothing").is_none());
        let bad =
            serde_json::json!({ "results": [{ "status": "installed" }, { "status": "error" }] });
        assert!(output_has_error(&bad));
        assert!(!output_has_error(&serde_json::json!({ "results": [] })));
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
        let out = serde_json::json!({ "apply": false, "results": [
            { "agent": "Claude Code", "status": "unchanged" },
            { "agent": "Codex", "status": "skipped" }
        ] });
        assert_eq!(planned_status(&out, Agent::Claude), Some("unchanged"));
        assert_eq!(planned_status(&out, Agent::Codex), Some("skipped"));
        assert_eq!(planned_status(&serde_json::json!({}), Agent::Codex), None);
    }

    #[test]
    fn agent_files_are_the_ones_agent_install_edits() {
        let [claude, codex] = agent_files(Path::new("H"));
        assert_eq!(claude.0, Agent::Claude);
        assert_eq!(claude.1, Path::new("H/.claude/settings.json"));
        assert_eq!(codex.1, Path::new("H/.codex/hooks.json"));
        assert_eq!(codex.2, Path::new("H/.codex"));
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
