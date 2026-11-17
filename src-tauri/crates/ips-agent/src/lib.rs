// InfoPanel Studio's coding-agent forwarder: a native program (it replaced a Node script).
//
//   ips-agent hook claude|codex [--url=<base>]            posts its stdin JSON, prints nothing
//   ips-agent permission claude|codex [--url=<base>]      a PermissionRequest: posts it and waits up to 28 s for the
//                                                         panel's answer; prints the allow or deny decision, or nothing
//                                                         (the agent then asks in its terminal)
//   ips-agent statusline [--wrap=<base64url>] [--url=..]  posts the statusline JSON, runs the wrapped
//                                                         statusline with the same input and passes its
//                                                         output through
//   ips-agent remove-hooks                                takes the hooks out of Claude Code and Codex
//                                                         (the uninstaller runs this)
//
// It never fails the agent: every error is swallowed, the post gives up after a second (a permission
// request after `PERMISSION_DEADLINE`), and the exit code is 0 (see main.rs). Silence never allows. The dashboard is at http://127.0.0.1:3922 unless --url=<base> or,
// failing that, DASHBOARD_URL says otherwise.

pub mod http;
pub mod install;
mod shell;
pub mod stdin;
pub mod wrap;

use std::time::Duration;

const DEFAULT_BASE: &str = "http://127.0.0.1:3922";
const POST_TIMEOUT: Duration = Duration::from_millis(1000);
const STDIN_TIMEOUT: Duration = Duration::from_millis(3000);
/// How long a permission request waits for the panel: the server answers by 25 s (ips-server's approvals.rs `WAIT`), and
/// the hook is installed with a 30 s timeout (install.rs `PERMISSION_TIMEOUT`), so it always ends before the agent kills it.
pub const PERMISSION_DEADLINE: Duration = Duration::from_millis(28_000);

/// The dashboard URL: the first `--url=` argument, else `DASHBOARD_URL`, else the default; no trailing `/`.
pub fn base_url(args: &[String], env_url: Option<&str>) -> String {
    let from_arg = args
        .iter()
        .find(|a| a.starts_with("--url="))
        .map(|a| &a[6..])
        .filter(|s| !s.is_empty());
    let url = from_arg
        .or(env_url.filter(|s| !s.is_empty()))
        .unwrap_or(DEFAULT_BASE);
    url.trim_end_matches('/').to_owned()
}

fn post(base: &str, path: &str, body: &str) {
    if let Some(base) = http::Base::parse(base) {
        http::post(&base, path, body, POST_TIMEOUT);
    }
}

pub fn run(args: &[String], env_url: Option<&str>) {
    if args.first().map(String::as_str) == Some("remove-hooks") {
        remove_hooks();
        return;
    }
    let base = base_url(args, env_url);
    // Like the script, every other run reads its stdin first, whatever the mode.
    let input = stdin::read_all(STDIN_TIMEOUT);
    let has_input = !stdin::is_blank(&input);
    let Some((mode, rest)) = args.split_first() else {
        return;
    };
    match mode.as_str() {
        "hook" => {
            let agent = agent_of(rest);
            if has_input {
                post(&base, &format!("/api/agents/event?agent={agent}"), &input);
            }
        }
        "permission" => {
            if has_input {
                if let Some(out) = permission(&base, agent_of(rest), &input, PERMISSION_DEADLINE) {
                    println!("{out}");
                }
            }
        }
        "statusline" => {
            let wrapped = wrap::wrapped_command(rest);
            // The post and the wrapped statusline run side by side.
            std::thread::scope(|scope| {
                if has_input {
                    scope.spawn(|| post(&base, "/api/agents/statusline", &input));
                }
                if !wrapped.is_empty() {
                    shell::run_wrapped(&wrapped, &input);
                }
            });
        }
        _ => {}
    }
}

/// The agent named after a mode: codex, else claude.
fn agent_of(rest: &[String]) -> &'static str {
    if rest.first().map(String::as_str) == Some("codex") {
        "codex"
    } else {
        "claude"
    }
}

/// What the hook prints for the server's answer: the PermissionRequest decision in the shape Claude Code and Codex both
/// read (`hookSpecificOutput.decision.behavior`), or None for anything but an explicit allow or deny.
pub fn permission_output(answer: &[u8]) -> Option<String> {
    let v: serde_json::Value = serde_json::from_slice(answer).ok()?;
    let decision = match v.get("behavior")?.as_str()? {
        "allow" => serde_json::json!({ "behavior": "allow" }),
        "deny" => serde_json::json!({ "behavior": "deny", "message": "Denied on the InfoPanel Studio panel." }),
        _ => return None,
    };
    let out = serde_json::json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": decision } });
    Some(out.to_string())
}

/// Posts a permission request and waits for the panel; the decision to print, or None (no answer, an error, a refusal).
pub fn permission(base: &str, agent: &str, input: &str, deadline: Duration) -> Option<String> {
    let base = http::Base::parse(base)?;
    let (status, body) = http::exchange(&base, &format!("/api/agents/permission?agent={agent}"), input, deadline)?;
    if status != 200 {
        return None;
    }
    permission_output(&body)
}

fn remove_hooks() {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    if let Some(home) = std::env::var_os(var).map(std::path::PathBuf::from) {
        install::run(&install::Options {
            apply: true,
            remove: true,
            agent: "",
            url: None,
            home: &home,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn prints_an_allow_or_a_deny_and_nothing_else() {
        let out = |s: &str| permission_output(s.as_bytes()).map(|o| serde_json::from_str::<serde_json::Value>(&o).unwrap());
        assert_eq!(
            out(r#"{"behavior":"allow"}"#),
            Some(serde_json::json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": { "behavior": "allow" } } }))
        );
        let deny = out(r#"{"behavior":"deny"}"#).unwrap();
        assert_eq!(deny["hookSpecificOutput"]["decision"]["behavior"], "deny");
        assert!(deny["hookSpecificOutput"]["decision"]["message"].is_string());
        // never `interrupt`: Codex fails closed on it, and Claude Code would stop the turn
        assert!(deny["hookSpecificOutput"]["decision"].get("interrupt").is_none());
        for silent in ["{}", r#"{"behavior":"ask"}"#, r#"{"behavior":true}"#, "", "not json"] {
            assert_eq!(out(silent), None, "{silent}");
        }
    }

    #[test]
    fn a_server_that_never_answers_is_given_up_on_at_the_deadline() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        // accepts and reads, never answers
        let held = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let _ = std::io::Read::read(&mut stream, &mut buf);
            std::thread::sleep(Duration::from_millis(1500));
        });
        let started = std::time::Instant::now();
        assert_eq!(permission(&base, "claude", "{}", Duration::from_millis(300)), None);
        assert!(started.elapsed() < Duration::from_millis(1200));
        held.join().unwrap();
    }

    #[test]
    fn url_precedence_and_trailing_slashes() {
        assert_eq!(
            base_url(&args(&["hook", "claude"]), None),
            "http://127.0.0.1:3922"
        );
        assert_eq!(
            base_url(&args(&["hook"]), Some("http://e:1//")),
            "http://e:1"
        );
        assert_eq!(
            base_url(&args(&["--url=http://a:2/", "hook"]), Some("http://e:1")),
            "http://a:2"
        );
        // An empty --url= is falsy in the script: the environment, then the default, apply.
        assert_eq!(
            base_url(&args(&["hook", "--url="]), Some("http://e:1")),
            "http://e:1"
        );
        assert_eq!(
            base_url(&args(&["hook", "--url="]), Some("")),
            "http://127.0.0.1:3922"
        );
    }
}
