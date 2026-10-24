# Native server: workspace and dependencies

Footprint Phase 3 replaces the Node sidecar with `ips-server`, a Rust server the app runs in-process, and the Node
agent hooks with `ips-agent`. What it must do is [server-contract.md](server-contract.md); this is how it is built.

## Workspace layout

`src-tauri/Cargo.toml` becomes the workspace root **and** stays the app package (a root package with `[workspace]`):

```
src-tauri/
  Cargo.toml            # [package] infopanel-studio (the app) + [workspace] members = [".", "crates/*"]
  Cargo.lock            # one lock for all three
  src/                  # the app, unchanged layout
  crates/
    ips-server/         # lib + [[bin]] ips-server
      src/lib.rs        # ServerConfig, Server::bind, Bound::serve(shutdown)
      src/main.rs       # the standalone binary: env -> ServerConfig, stderr logging, Ctrl+C
      src/<module>.rs   # one per server/*.mjs (control, assets, canvases, library, alerts, ical, ...)
      tests/            # route tests, parity fixture tests (tests/fixtures/parity/*.json)
    ips-agent/          # console [[bin]] ips-agent: hook claude|codex, statusline [--wrap=]
```

Why a root package rather than a repo-root workspace:

- `tauri build`/`tauri dev` keep finding the app at `src-tauri/Cargo.toml`.
- CI (`working-directory: src-tauri`, rust-cache `workspaces: src-tauri`), the release workflow
  (`src-tauri/target/release/bundle/...`) and the desktop specs (`src-tauri/target/debug/infopanel-studio.exe`) keep
  their paths: the target dir stays `src-tauri/target`.
- `[profile.release]` already sits in this file, which is where Cargo reads profiles for a workspace. It stays as it is.
- Shared versions go in `[workspace.dependencies]`, so the app and `ips-server` can't drift on tokio, reqwest or
  serde.

CI change: `cargo test --workspace` (and the server suite with `SERVER_IMPL=native`) on ubuntu-latest and
windows-latest. The app crate builds only on Windows in practice (Tauri system deps on Linux). The ubuntu job therefore
runs `cargo test -p ips-server -p ips-agent` rather than the whole workspace. I'll confirm that at 3.1.

### `ips-server` API

```rust
pub struct ServerConfig {          // the same inputs as sidecar.rs's sidecar_env
    pub host: IpAddr, pub port: u16,          // port 0: the OS picks
    pub allowed_hosts: Vec<String>, pub allow_remote_edit: bool, pub allow_remote_upload: bool,
    pub dist: PathBuf, pub data_dir: PathBuf, pub infopanel_dir: PathBuf, pub debug: bool,
}
impl ServerConfig { pub fn from_env() -> Result<Self> }      // the env names server.mjs reads, same defaults
pub async fn bind(cfg: ServerConfig) -> Result<Bound, StartError>;   // binds, prints/logs the same start line
impl Bound { pub fn port(&self) -> u16; pub async fn serve(self, shutdown: impl Future<Output = ()>) }
```

- **Runtime.** The app runs it on `tauri::async_runtime`, with no second runtime. The binary uses `#[tokio::main]`.
- **Errors.** A bind failure maps to the existing `ErrorCode`s (port in use, permission).
- **Background tasks** (control tick, alerts reader, calendar, OBS, agents sweep, canvas sweep) start in `serve`. A
  supervisor logs, then restarts each one with backoff if it panics or ends. Handlers sit under `CatchPanicLayer`.
- **Logging.** Through `log` with target `server`. The binary logs to stderr.

## Dependencies

| Crate | New to the lockfile? | For |
|---|---|---|
| `axum` 0.8 | **new** | Routing, extractors, SSE responses. Built on hyper 1, tower 0.5 and tokio, all already present. |
| `tower-http` 0.6 | present | `CatchPanicLayer`, `TimeoutLayer`. `ServeDir` only if it can match today's static rules exactly; see note 1. |
| `tokio` 1 | present | Runtime features: net, fs, time, sync, macros, signal (binary). |
| `reqwest` 0.13 | present | Calendar fetch, image and font proxies, Data API SSE. Same TLS setup as the updater (rustls on `ring` with the platform verifier). A custom `dns::Resolve` returns only vetted addresses. |
| `tokio-tungstenite` | **new** | OBS obs-websocket v5 client, plain `ws://` (OBS has no TLS). |
| `serde`, `serde_json` | present | Needs `serde_json`'s `preserve_order` feature; see note 2. |
| `sha2` | present | Asset naming. |
| `base64` 0.22 | present | `obsAuth`, `ips-agent --wrap=`. |
| `chrono` | present | Dates, calendar and alerts. |
| `chrono-tz` | **new** | IANA zones for ICS `TZID`. It compiles the tz database in, so expect a binary-size cost (I'll report it; `filter-by-regex` can trim it). |
| `quick-xml` | present | InfoPanel's `profiles.xml`. |
| `sysinfo` | present | Agent pid liveness. |
| `futures-util` | present | SSE streams. |
| `log` | present | Logging. |

`ips-agent`: std, `serde_json` and `base64` only. HTTP goes over a raw `TcpStream` to loopback, as `src/http.rs` already
does, so there is no async runtime and no HTTP client crate; startup is the process start.

The release profile is unchanged (`opt-level = "s"`, LTO, strip). Today's release exe is 12.2 MB; the delta gets
reported at 3B.

## Notes for the gate

1. **Static files.** Today's handler 404s any dot segment, serves a 503 page when there's no build, sends the CSP on
   HTML only and `nosniff` everywhere, and uses its own MIME table. `ServeDir` differs on several of these (dotfiles,
   `index.html` redirects, `Last-Modified`/range handling). I plan a small hand-written handler (about 60 lines) unless
   `ServeDir` can be configured to match. Either way, the parity tests decide.
2. **Byte-identical JSON.** Node keeps object key order as inserted and writes `config.json`, `control.json` and the
   rest from it. `serde_json::Value` sorts keys unless `preserve_order` is on. Turning it on makes the files and API
   bodies match key for key; feature unification turns it on for the app crate too, which is harmless. Number formatting
   also differs at the edges (JS `1e+21` against serde `1e21`; `-0`). The parity fixtures include those cases, and the
   config passes through as stored text wherever the Node server passes it through.
3. **What can't be identical.** `/api/debug/stats` (no V8 heap or event loop; tokio scheduling delay instead) and the
   server's RSS (in-process, it's the app's). Both are listed as justified differences at 3B.

## Decisions (Gate 3A, approved)

- The layout and the three new crates as above.
- `serde_json` with `preserve_order`.
- A hand-written static handler, held to today's rules by the parity tests.
- The contract's oddities are kept as they are and pinned by tests. The two real bugs it found (iCal months without
  the day; non-atomic font cache and agent settings writes) were fixed in the Node server first (#122), so the port
  copies the fixed behaviour.

## Known differences from server.mjs (Gate 3B)

Every difference the port, the parity fixtures and `parity:servers` turned up, with why it stays. "Close" means the
native server answers with a status and `Connection: close` where Node resets the socket.

**HTTP layer**
- An HTTP/1.0 request gets an HTTP/1.0 status line (hyper echoes the version). `parity:servers` normalises it.
- Header names are lowercase and hyper places `date` itself; no `Connection: keep-alive` / `Keep-Alive: timeout=5`
  headers, no 5 s keep-alive idle timeout, and Node's 60 s header and 300 s request timeouts aren't mirrored. Clients
  don't depend on any of these; the kiosk loads 282 B lighter for it.
- Oversize bodies (config, control, canvas, library, calendar, hooks over 512 KiB): a status (400 or 413) and close,
  where Node resets the socket. A status is the better answer (decided in step 3).
- HEAD to an SSE route closes at once; Node keeps it open and counts it as a client.
- A handler panic answers 500 `internal error`; its log line has no method or path. I/O error texts are Rust's.
- `HOST` given as a name binds its first resolved address.
- The proxies' 200s and `send()` bodies are chunked (no `Content-Length`), as Node's are (contract corrected).
- Reason phrases use Node's wording where hyper's differ (418, 509, unknown codes).

**JSON**
- serde_json refuses nesting past 128, numbers like `1e400` and lone surrogate escapes (400) where `JSON.parse`
  accepts them; a hook body with `1e999` is a 400 (Node reads Infinity and answers 204). None of these come from a
  real client.
- A pathological PATCH (profiles with null or primitive entries, a key `"undefined"`) leaves the config unchanged where
  Node 500s or mangles it.
- Prototype keys (`constructor`, `toString`) are plain unknown values: a control action without `profile` is "not
  found", an alert severity `constructor` is unknown, a session file with status `toString` is idle.
- Strings cut mid surrogate pair (library names, calendar labels and passwords, agent fields) get U+FFFD or drop the
  half, where Node keeps a lone surrogate.

**Runtime-specific**
- `/api/debug/stats`: `memory` is `{ rss, virtual }` (no V8 heap), `resources` counts tasks, workers and SSE clients,
  and `eventLoopDelayMs` is the lateness of a 10 ms timer (p50, p99 over about 10 s, max since start). `uptimeSeconds`
  counts from bind. In the app, the server page's Memory is the app's own and the CSV's `sidecar.*` columns are empty.
- Machine name from `sysinfo::System::host_name` (`GetComputerNameExW`, where `os.hostname` uses `GetHostNameW`): the
  same name on an ordinary machine, not compared on this one.
- `[debug]` lines go to stderr (Node's to stdout). In the app, server log lines carry the app log's prefix
  (`[date][time][server][LEVEL]`).
- `ALLOW_REMOTE_EDIT` is read once at start (Node reads it per call; the app restarts the server on change anyway). The
  default `DASHBOARD_DIST` is `./dist` from the cwd and the version is embedded at build time (the app passes its own).
- A relative `INFOPANEL_STUDIO_DATA_DIR` resolves against the app's cwd (Node's sidecar resolved it against `app/`);
  only hand-run tests use one.

**Text and dates**
- Locale: BCP 47 grammar and the 452-language table from Node 24.6 / ICU 77.1; region aliases such as `sgn-BR` aren't
  modelled. `parity:check` runs on Node 24.6.0 so the table matches.
- `Date.parse`: ISO forms only (with V8's day overflow and `24:00`); legacy text and numeric strings are invalid (Node
  reads `"5"` as 2001). Only ISO timestamps reach it.
- `localeCompare` is approximated: ICU root order for ASCII, code point otherwise. The library sorts ISO `createdAt`
  by code point, the same order.
- Time zones from chrono-tz, case-insensitive plus offsets; its tz database may be newer or older than ICU's. Floating
  calendar times use the system zone and ignore `TZ` on Windows (Node honours `TZ`).

**Calendar and iCal**
- Fetch errors name the innermost cause with URLs stripped (`getaddrinfo ENOTFOUND host`, `The operation was
  aborted`); several feeds' errors join in link order (Node: completion order).
- A reconfigure cancels a refresh in flight (Node lets it finish and discards it).
- `INTERVAL` is truncated to an integer and clamped to 1..100000 (`1.5` differs).

**Alerts, agents, OBS**
- `alerts.json` is written only when the history changes (and once after the first pass); Node rewrites it about every
  second with the same bytes. A deleted `alerts.json` comes back on the next change.
- Alert streams: reqwest with no proxy, a 10 s connect timeout and redirects followed; no 300 s idle body timeout
  (undici reconnects after 300 s of silence).
- The agent-usage scan runs on a blocking thread, one at a time; Codex limits show at the end of a scan.
- A session's process counts alive while it exists, another user's included (Node: `kill(pid, 0)` and EPERM). Native
  asks with one `OpenProcess` per pid.
- `profiles.xml` is read by text scanning like Node's regexes (a strict XML parser would reject files Node lists).
- Upload slots are reserved before the size check (race-free, same answers). 507 quota, mid-stream 413 and 429 are
  unit-tested in Rust but not compared against Node.

**Proxies**
- The loopback http path sends reqwest's default headers (not undici's `user-agent: node`, `accept-language: *`,
  `sec-fetch-mode`, `accept-encoding`) and so gets no gzip. Node's fetch bad-ports list (82 ports) is reproduced.
- Font errors read `fetch failed` / `terminated`; an unreadable cache's 502 text is the Rust I/O error.
- The catalogue JSON check (serde_json, BOM stripped) also refuses lone surrogate escapes and nesting past 128.
- Both servers now give the font proxy a 60 s deadline (it had none).

**ips-agent** (against `tools/agent-status.mjs` and `agent-install.mjs`)
- HTTPS base URLs aren't supported (the POST is skipped; Node would try TLS). The server is plain HTTP.
- A refused connect on Windows fails fast, as libuv does (`SIO_TCP_INITIAL_RTO`); `localhost` tries IPv4 first.
- `--wrap`'s lenient base64url is mimicked; exotic malformed input may decode differently.
- Installer: serde's error text; a non-object settings root is an error (Node crashed); `1.0` stays `1.0` (JS writes
  `1`); a bare `statusLine` string counts as absent; the exe path uses forward slashes; no CLI text output or `--node`.
