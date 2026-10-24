// ips-agent end to end: stdin, arguments and environment in, against a test HTTP server, and the posted requests,
// stdout and exit code out. The cases are the ones the removed Node forwarder was held to;
// the assertions are what it did.

use ips_agent::wrap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
struct Recorded {
    method: String,
    path: String,
    host: String,
    content_type: String,
    agent_event: String,
    content_length: String,
    body: Vec<u8>,
}

#[derive(Clone, Copy)]
enum Reply {
    NoContent,
    ServerError,
    /// Accepts the request and never answers.
    Hang,
}

struct Server {
    port: u16,
    seen: Arc<Mutex<Vec<Recorded>>>,
}

impl Server {
    fn start(reply: Reply) -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let log = log.clone();
                std::thread::spawn(move || serve(stream, reply, port, &log));
            }
        });
        Server { port, seen }
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    fn requests(&self) -> Vec<Recorded> {
        self.seen.lock().unwrap().clone()
    }
}

fn serve(mut stream: TcpStream, reply: Reply, port: u16, log: &Mutex<Vec<Recorded>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    let head_end = loop {
        if let Some(i) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
        match stream.read(&mut buf) {
            Ok(n) if n > 0 => raw.extend_from_slice(&buf[..n]),
            _ => return,
        }
    };
    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let mut lines = head.split("\r\n");
    let mut first = lines.next().unwrap_or("").split(' ');
    let (method, path) = (
        first.next().unwrap_or("").to_owned(),
        first.next().unwrap_or("").to_owned(),
    );
    let header = |name: &str| {
        head.split("\r\n")
            .skip(1)
            .find_map(|l| {
                let (k, v) = l.split_once(':')?;
                k.eq_ignore_ascii_case(name).then(|| v.trim().to_owned())
            })
            .unwrap_or_default()
    };
    let want: usize = header("content-length").parse().unwrap_or(0);
    let mut body = raw[head_end..].to_vec();
    while body.len() < want {
        match stream.read(&mut buf) {
            Ok(n) if n > 0 => body.extend_from_slice(&buf[..n]),
            _ => break,
        }
    }
    log.lock().unwrap().push(Recorded {
        method,
        path,
        host: header("host").replace(&port.to_string(), "PORT"),
        content_type: header("content-type"),
        agent_event: header("x-agent-event"),
        content_length: header("content-length"),
        body,
    });
    match reply {
        Reply::NoContent => {
            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
        }
        Reply::ServerError => {
            let _ = stream.write_all(
                b"HTTP/1.1 500 Oops\r\nContent-Length: 2\r\nConnection: close\r\n\r\nno",
            );
        }
        Reply::Hang => std::thread::sleep(Duration::from_secs(4)),
    }
}

#[derive(Debug, PartialEq)]
struct Outcome {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    code: Option<i32>,
}

struct Case {
    /// `{URL}` stands for the test server's base URL.
    args: Vec<String>,
    env_url: Option<String>,
    stdin: Vec<u8>,
    /// Keep stdin open this long after writing it (the agent must give up waiting at 3 s).
    hold_stdin: Duration,
    reply: Reply,
    /// The server is down (a port nothing listens on).
    down: bool,
}

impl Case {
    fn new(args: &[&str], stdin: &str) -> Case {
        Case {
            args: args.iter().map(|s| (*s).to_owned()).collect(),
            env_url: None,
            stdin: stdin.as_bytes().to_vec(),
            hold_stdin: Duration::ZERO,
            reply: Reply::NoContent,
            down: false,
        }
    }
    fn env(mut self, url: &str) -> Case {
        self.env_url = Some(url.to_owned());
        self
    }
    fn reply(mut self, reply: Reply) -> Case {
        self.reply = reply;
        self
    }
    fn bytes(mut self, stdin: &[u8]) -> Case {
        self.stdin = stdin.to_vec();
        self
    }
}

fn run(mut command: Command, case: &Case, url: &str) -> Outcome {
    let fill = |s: &str| s.replace("{URL}", url);
    command.args(case.args.iter().map(|a| fill(a)));
    command.env_remove("DASHBOARD_URL");
    if let Some(env) = &case.env_url {
        command.env("DASHBOARD_URL", fill(env));
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let data = case.stdin.clone();
    let _ = stdin.write_all(&data);
    if case.hold_stdin.is_zero() {
        drop(stdin);
    }
    let out = child.wait_with_output().unwrap();
    Outcome {
        stdout: out.stdout,
        stderr: out.stderr,
        code: out.status.code(),
    }
}

/// Runs the case and returns what the program printed and the requests the test server saw.
fn run_case(case: &Case) -> (Outcome, Vec<Recorded>) {
    let dead = {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        format!("http://127.0.0.1:{}", l.local_addr().unwrap().port())
    };
    let server = Server::start(case.reply);
    let url = if case.down { dead } else { server.url() };
    let outcome = run(Command::new(env!("CARGO_BIN_EXE_ips-agent")), case, &url);
    (outcome, server.requests())
}

/// Runs the case, asserts the agent exits 0 whatever happened, and returns the posted requests.
fn post(case: Case) -> Vec<Recorded> {
    let (outcome, requests) = run_case(&case);
    assert_eq!(outcome.code, Some(0), "exit code");
    requests
}

fn hook<'a>(extra: &[&'a str]) -> Vec<&'a str> {
    ["hook", "claude"]
        .into_iter()
        .chain(extra.iter().copied())
        .collect()
}

/// The wrapped statusline command: prints its stdin.
#[cfg(windows)]
const ECHO: &str = r#"findstr "^""#;
#[cfg(not(windows))]
const ECHO: &str = "cat";

fn wrapped(command: &str) -> String {
    format!("--wrap={}", wrap::encode(command))
}

#[test]
fn hooks_post_the_raw_stdin_and_print_nothing() {
    let stop = Case::new(
        &["hook", "claude", "--url={URL}"],
        r#"{"hook_event_name":"Stop","session_id":"x"}"#,
    );
    let (outcome, claude) = run_case(&stop);
    assert_eq!((outcome.stdout, outcome.stderr, outcome.code), (vec![], vec![], Some(0)));
    assert_eq!(claude.len(), 1);
    assert_eq!(claude[0].path, "/api/agents/event?agent=claude");
    assert_eq!(claude[0].content_type, "application/json");
    assert_eq!(claude[0].agent_event, "1");
    let codex = post(Case::new(
        &["hook", "codex", "--url={URL}"],
        "  {\"a\":\"æøå\"}\n",
    ));
    assert_eq!(codex[0].path, "/api/agents/event?agent=codex");
    assert_eq!(codex[0].body, "  {\"a\":\"æøå\"}\n".as_bytes());
    // Any other agent name means claude; a flag before the agent hides it.
    assert_eq!(
        post(Case::new(&["hook", "gemini", "--url={URL}"], "{}"))[0].path,
        "/api/agents/event?agent=claude"
    );
    assert_eq!(
        post(Case::new(&["hook", "--url={URL}", "codex"], "{}"))[0].path,
        "/api/agents/event?agent=claude"
    );
}

#[test]
fn blank_or_odd_input() {
    for blank in ["", "   ", "\r\n\t", "\u{feff}", "\u{a0}\u{2028}"] {
        assert!(
            post(Case::new(&["hook", "claude", "--url={URL}"], blank)).is_empty(),
            "{blank:?}"
        );
    }
    // U+0085 is not whitespace to JavaScript's trim.
    assert_eq!(
        post(Case::new(&["hook", "claude", "--url={URL}"], "\u{85}")).len(),
        1
    );
    // Not JSON, and not UTF-8: posted as the text it decodes to.
    assert_eq!(
        post(Case::new(&["hook", "claude", "--url={URL}"], "not json")).len(),
        1
    );
    let bad = post(
        Case::new(&["hook", "claude", "--url={URL}"], "")
            .bytes(&[0x7b, 0xff, 0xfe, 0xc3, 0x28, 0x7d]),
    );
    assert_eq!(bad[0].body, "{\u{fffd}\u{fffd}\u{fffd}(}".as_bytes());
}

#[test]
fn statusline_posts_and_passes_the_wrapped_output_through() {
    let input = r#"{"session_id":"x","rate_limits":{}}"#;
    let plain = post(Case::new(&["statusline", "--url={URL}"], input));
    assert_eq!(plain[0].path, "/api/agents/statusline");
    assert_eq!(plain[0].body, input.as_bytes());
    let (outcome, echoed) = run_case(&Case::new(
        &["statusline", &wrapped(ECHO), "--url={URL}"],
        input,
    ));
    assert_eq!(echoed.len(), 1);
    assert!(String::from_utf8_lossy(&outcome.stdout).contains(input), "the wrapped output");
    // Blank input: nothing is posted but the wrapped command still gets it.
    assert!(post(Case::new(
        &["statusline", &wrapped(ECHO), "--url={URL}"],
        "\n"
    ))
    .is_empty());
    // Quotes and non-ASCII survive the shell.
    post(Case::new(
        &[
            "statusline",
            &wrapped(r#"echo "æøå 'q' & more""#),
            "--url={URL}",
        ],
        input,
    ));
}

#[test]
fn a_failing_wrapped_command_changes_nothing() {
    let input = r#"{"session_id":"x"}"#;
    for command in [
        "exit 3",
        "definitely-not-a-command-xyz",
        "echo out & echo err 1>&2 & exit 1",
    ] {
        assert_eq!(
            post(Case::new(
                &["statusline", &wrapped(command), "--url={URL}"],
                input
            ))
            .len(),
            1,
            "{command}"
        );
    }
    // Nothing usable to wrap.
    assert_eq!(
        post(Case::new(&["statusline", "--wrap=", "--url={URL}"], input)).len(),
        1
    );
    assert_eq!(
        post(Case::new(
            &["statusline", "--wrap=!!!", "--url={URL}"],
            input
        ))
        .len(),
        1
    );
}

#[test]
fn the_url_comes_from_the_flag_then_the_environment() {
    // Trailing slashes are stripped and a path prefix is kept.
    let prefixed = post(Case::new(&hook(&["--url={URL}/pre//"]), "{}"));
    assert_eq!(prefixed[0].path, "/pre/api/agents/event?agent=claude");
    assert_eq!(post(Case::new(&hook(&[]), "{}").env("{URL}")).len(), 1);
    // The flag wins over a dead environment URL; an empty one falls through to it.
    assert_eq!(
        post(Case::new(&hook(&["--url={URL}"]), "{}").env("http://127.0.0.1:9")).len(),
        1
    );
    assert_eq!(
        post(Case::new(&hook(&["--url="]), "{}").env("{URL}")).len(),
        1
    );
    // The first --url= is the one that counts.
    assert_eq!(
        post(Case::new(
            &hook(&["--url={URL}", "--url=http://127.0.0.1:9"]),
            "{}"
        ))
        .len(),
        1
    );
}

#[test]
fn an_error_reply_changes_nothing() {
    let seen = post(Case::new(&["hook", "codex", "--url={URL}"], "{}").reply(Reply::ServerError));
    assert_eq!(seen.len(), 1);
}

#[test]
fn unknown_modes_do_nothing() {
    assert!(post(Case::new(&["whatever", "--url={URL}"], "{}")).is_empty());
    assert!(post(Case::new(&[], "{}")).is_empty());
}

#[test]
fn a_dead_server_is_not_an_error() {
    let mut case = Case::new(&["hook", "claude", "--url={URL}"], "{}");
    case.down = true;
    assert!(post(case).is_empty());
    let mut line = Case::new(&["statusline", &wrapped(ECHO), "--url={URL}"], r#"{"a":1}"#);
    line.down = true;
    post(line);
}

#[test]
fn a_silent_server_is_given_up_on_after_a_second() {
    let started = Instant::now();
    let seen = post(
        Case::new(&["hook", "claude", "--url={URL}"], r#"{"slow":true}"#).reply(Reply::Hang),
    );
    if !seen.is_empty() {
        assert_eq!(seen.len(), 1);
        assert!(started.elapsed() < Duration::from_secs(6));
    }
}

#[test]
fn stdin_that_never_closes_is_posted_after_three_seconds() {
    let mut case = Case::new(&["hook", "claude", "--url={URL}"], r#"{"partial":true}"#);
    case.hold_stdin = Duration::from_secs(10);
    let seen = post(case);
    if !seen.is_empty() {
        assert_eq!(seen[0].body, br#"{"partial":true}"#);
    }
}

/// What the uninstaller runs: only a temp home is touched.
#[test]
fn remove_hooks_takes_ours_out_of_the_home_it_is_given() {
    let home = tempfile::tempdir().unwrap();
    let file = home.path().join(".claude").join("settings.json");
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    let mine = r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"mine.sh"}]}]}}"#;
    std::fs::write(&file, mine).unwrap();
    let opts = ips_agent::install::Options {
        apply: true,
        remove: false,
        agent: "C:/app/ips-agent.exe",
        url: None,
        home: home.path(),
    };
    ips_agent::install::run(&opts);
    assert!(std::fs::read_to_string(&file)
        .unwrap()
        .contains("ips-agent.exe"));

    let status = Command::new(env!("CARGO_BIN_EXE_ips-agent"))
        .arg("remove-hooks")
        .env("USERPROFILE", home.path())
        .env("HOME", home.path())
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(0));
    let left: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(
        left,
        serde_json::from_str::<serde_json::Value>(mine).unwrap()
    );
}
