// InfoPanel Studio's coding-agent forwarder: a native program (it replaced a Node script).
//
//   ips-agent hook claude|codex [--url=<base>]            posts its stdin JSON, prints nothing
//   ips-agent statusline [--wrap=<base64url>] [--url=..]  posts the statusline JSON, runs the wrapped
//                                                         statusline with the same input and passes its
//                                                         output through
//   ips-agent remove-hooks                                takes the hooks out of Claude Code and Codex
//                                                         (the uninstaller runs this)
//
// It never fails the agent: every error is swallowed, the post gives up after a second, and the
// exit code is 0 (see main.rs). The dashboard is at http://127.0.0.1:3922 unless --url=<base> or,
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
            let agent = if rest.first().map(String::as_str) == Some("codex") {
                "codex"
            } else {
                "claude"
            };
            if has_input {
                post(&base, &format!("/api/agents/event?agent={agent}"), &input);
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
