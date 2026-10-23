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
