# Implementation Plan: InfoPanel Studio, a self-contained Tauri 2 desktop app

Status: confirmed 2026-10-16; in progress on `feat/desktop-app`.

## Decisions taken (user, 2026-10-16)
- **Fully self-contained.** The app ships its own Node runtime, `server.mjs` and the built SPA, and
  runs the dashboard server itself. No repo, no system Node, no `start-dashboard.bat` needed.
- **In-app settings** for where the server listens (IP and port) and how the app behaves.
- **Unsigned NSIS installer** is fine (SmartScreen warns once).
- **The coding agent integration ships with the app** and is optional: the user turns it on or off
  in the app settings.
- **Start at login** is on by default.
- **A running `start-dashboard.bat` server:** the app offers to stop it (after a confirmation), then
  starts its own. Revised after testing: the app closes it automatically on startup (a `node.exe`
  answering as the dashboard or running `server.mjs`), since older servers have no `/api/health`.
- **Title bar (added later):** no native frame; the studio's top bar with the logo carries the window
  controls.
- **Name:** "InfoPanel Studio", identifier `dev.f3nn3x.infopanel-studio`.
- **Debug mode** with logging, to find errors and leaks (section below).

## Overview
A Tauri 2 app on Windows 11. On launch it reads its settings, starts the bundled server (a Node
sidecar running `server.mjs`) on the chosen host and port, waits for it to answer, then loads the
studio from it (`http://127.0.0.1:<port>/?studio=1`). The server keeps running while the app sits in
the tray, so the kiosk page InfoPanel displays keeps working when the window is closed. A local
settings window (a React page built by Vite from `src/settings/`, served by Tauri itself, so it
works even when the server can't start) holds the server, startup, update, agent and diagnostics
options.

The SPA is still loaded **from the server**, not bundled into the webview: saved configs hold
same-origin `/api/assets/<id>` links, request-guard refuses cross-origin writes by design, and the
kiosk and studio stay one build. "Self-contained" is met because the server and its dist ship inside
the app.

## Facts this plan rests on (read from the code)
- server.mjs and `server/*.mjs` import Node built-ins only, so the sidecar needs `node.exe` plus the
  files, no `node_modules`.
- Config: `PORT` (default 3922), `HOST` (default 127.0.0.1), `ALLOWED_HOSTS`, all from env. `DIST` is
  found via `import.meta.url`. Data lives in `%LOCALAPPDATA%\InfoPanel\Dashboard` (config.json,
  assets/, control.json, alerts.json, integrations.json), so an existing setup's config carries over
  to the app untouched. A taken port fails with EADDRINUSE.
- `server/request-guard.mjs`: 421 for a Host not allowed, 403 for cross-site or foreign-Origin
  writes; no CORS headers, by design.
- Relative same-origin URLs in src (`CONFIG_URL`, `CONFIG_EVENTS_URL`, `IMAGE_PROXY_URL`,
  `CONTROL_URL`, `CONTROL_EVENTS_URL`, `ASSETS_URL`, `EXTRAS_EVENTS_URL`, `INTEGRATIONS_URL`,
  `HISTORY_URL`) and stored `/api/assets/<id>` links.
- Sensor streams go straight to the InfoPanel Data API (`dataApiUrl`, default 127.0.0.1:3921) with
  CORS; unchanged.
- `/api/image-proxy` passes the upstream `Content-Type` through.
- Agents: `tools/agent-install.mjs` writes hooks into `~/.claude/settings.json` and
  `~/.codex/hooks.json` (each backed up first; `--apply`, `--remove`). The hook command is built as
  `node "<dir of agent-install.mjs>/agent-status.mjs"` (line 132-133), so it needs `node` on PATH and
  the repo on disk. `tools/agent-status.mjs` posts to `DASHBOARD_URL` (env, default
  `http://127.0.0.1:3922`). Our entries are recognised by the `agent-status.mjs` marker, so a
  re-install replaces the repo-based hooks instead of adding a second set.
- Config export uses a Blob and `<a download>`; pushes are debounced 400 ms with no unload flush.
- npm, Vitest, no linter.

## Architecture

```
Tauri app (Rust)
 ├─ settings.json  (%APPDATA%\dev.f3nn3x.infopanel-studio\settings.json)
 ├─ local pages (served by Tauri): start.html (status / errors), app/settings.html
 │    (the settings window: React, built by `vite.settings.config.ts` into the git-ignored pages/app/)
 ├─ sidecar: resources\node\node.exe resources\server\server.mjs
 │      env PORT, HOST, ALLOWED_HOSTS, DASHBOARD_DIST=resources\dist
 │      ──► http://<host>:<port>  (kiosk for InfoPanel, studio for the app window)
 ├─ tray: Open studio · Open kiosk in browser · Settings · Restart server · Quit
 └─ agents: resources\agents\agent-status.mjs + agent-install.mjs, run with the bundled node
```

### Startup sequence
1. Single instance: a second launch focuses the running app (and its window).
2. Read settings (create defaults on first run).
3. Probe `http://127.0.0.1:<port>/api/health` (1.5 s):
   - **Nothing listening** → start the sidecar, poll health every 250 ms for up to 10 s, then load
     the studio. If it exits early or times out, show start.html with its last log lines, Retry and
     "Open settings".
   - **A dashboard answers that the app did not start** (for example the old
     `start-dashboard.bat`) → show start.html: "Another InfoPanel Studio server is running on this
     port." with **"Stop it and start InfoPanel Studio's server"** (a confirmation names the process
     and PID first), "Use it for this session" and "Open settings" (change port). Stopping is only
     offered when the health answer says it is an InfoPanel Studio server and the PID that owns
     the port is a `node.exe`; anything else is never killed. The screen also says to remove the
     .bat from startup.
   - **Something else answers** (wrong body, 404, 421) → "Port <port> is used by another program",
     with "Open settings".
4. When started at login (autostart), skip the window: run the server and sit in the tray.

### Lifecycle
- Closing the window hides it to the tray; the server keeps serving the kiosk. Before hiding, flush
  pending edits (see Phase 3).
- Tray "Quit" flushes, stops the sidecar (only if the app started it) and exits.
- "Restart server" and any change to host or port stop the sidecar, start it with the new env and
  reload the window. If the agent hooks are on, they are rewritten with the new URL.
- The sidecar's stdout/stderr go to `%LOCALAPPDATA%\dev.f3nn3x.infopanel-studio\logs\server.log`
  (rotated at 1 MB, 3 files). The settings page shows the tail and an "Open logs folder" button.
- If the sidecar crashes while running, restart it up to 3 times in a minute, then show the error in
  the window and tray tooltip.

## App settings

Stored by the Rust side in `settings.json`; the settings page reads and writes them through
commands. Defaults match today's server, so nothing changes for a fresh install.

| Setting | Default | Notes |
|---|---|---|
| `listen` | `local` | "This computer only" (127.0.0.1) or "Local network" (0.0.0.0, shown with the machine's LAN IP). The network choice shows a warning that other devices can reach the studio and edit the dashboard. Replaces the version 1 `host`. |
| `port` | `3922` | 1024–65535; validated, and checked as free before saving (unless our own server already holds it). |
| `allowedHosts` | empty | Extra host names for request-guard (`ALLOWED_HOSTS`), shown only when `listen` is `lan`. |
| `startAtLogin` | on | `tauri-plugin-autostart`; starts hidden in the tray so the kiosk has a server after a reboot. |
| `openStudioOnLaunch` | on | A manual launch opens the window; login autostart never does. |
| `startServer` | on | Off = the app launches with the server stopped; the tray and the Server page offer Start. |
| `autoRestart` | on | Restart a crashed server up to 3 times a minute. |
| `rememberBounds` | on | Remember the studio window's size and position. |
| `zoom` | 100 | 80, 90, 100, 110, 125 or 150 percent, applied to the studio and settings windows (never the kiosk). The studio keeps Ctrl + `=` / `-` for canvas zoom; app zoom changes from the settings window. |
| `checkForUpdates`, `updateChannel`, `autoDownload` | on, `stable`, off | The Updates page (Stable or Beta feed, background download). |
| `closeToTray` | on | Off = closing the window quits the app and stops the server (with a one-time warning that the kiosk will stop). |
| `agents.enabled` | off | Installs or removes the Claude Code / Codex hooks (see below). |
| `debug` | off | Debug mode (see below). Also forced on for one run by `--debug` or `INFOPANEL_STUDIO_DEBUG=1`. |

The window always loads the studio through `127.0.0.1:<port>` when the host is loopback or
`0.0.0.0`, and through the chosen IP otherwise.

Entry points to the settings window: the tray, the Settings cogwheel at the bottom of the studio's left
rail (only shown when `isTauri()`), and the start page's error screens. Every change saves at once
(`set_setting`); port, listen, allowed hosts and debug mode are read by the server at start, so the
window shows a restart bar until the server is restarted with them.

## Coding agent integration (optional)

- **Bundled:** `tools/agent-status.mjs` and `tools/agent-install.mjs` ship as resources.
- **Script changes (small, tested):**
  - `agent-install.mjs` gains `--node=<path>` (the hook runs `"<node>" "<script>"` instead of
    `node "<script>"`) and `--url=<base>` (passed through to the hook command as
    `--url=<base>`). Defaults keep today's behaviour, so the repo workflow is unchanged.
  - `agent-status.mjs` accepts `--url=<base>`, falling back to `DASHBOARD_URL`, then the default.
  - A `--json` flag on agent-install prints a machine-readable result (per agent: installed /
    skipped / not found / error, plus backup paths) for the settings page.
- **Turning it on** runs, with the bundled node:
  `agent-install.mjs --apply --node=<bundled node.exe> --url=http://127.0.0.1:<port> --json`.
  The settings page shows what was changed for Claude Code and Codex, the backup file paths, and the
  reminder that Codex asks to review new hooks (`/hooks` once).
- **Turning it off** runs `--remove --apply`.
- **Keeping it correct:** after an app update (the install path or bundled node can change) and after
  a port change, the app re-runs the install when `agents.enabled` is on. The NSIS uninstaller runs
  `--remove --apply` in a `NSIS_HOOK_PREUNINSTALL` hook, so no hook is left pointing at a deleted
  node.exe.
- **Before turning it on, the page explains what it edits** (`~/.claude/settings.json`,
  `~/.codex/hooks.json`, with backups) and that the statusline is wrapped, not replaced.

## Security
- **Remote IPC.** Capability `studio.json` with `"remote": { "urls": ["http://127.0.0.1:<port>/*"] }`
  (generated from the current port at startup via the runtime capability API). It grants only:
  open the settings page, and the dialog-scoped `save_text_file` / `open_text_file` commands. Every
  other command (settings, server control, agent install) is available only to the Tauri-served
  local pages through `default.json`.
- **Image proxy hardening** (Phase 0): only `image/*` responses (406 otherwise) plus
  `X-Content-Type-Options: nosniff`, because a same-origin HTML response would now be able to reach
  the remote IPC commands.
- **Navigation guard:** allow the server origin (not `/api/*`) and the local pages; open everything
  else, including `target="_blank"`, in the system browser with `tauri-plugin-opener`.
- **CSP:** strict CSP on the local pages via `app.security.csp`; server pages unchanged.
- **LAN exposure** is opt-in, warned about, and still filtered by request-guard.

## Build and packaging
- **Toolchain:** Rust stable (MSVC), VS 2022 Build Tools (Desktop C++, Windows SDK), WebView2
  runtime (present on Windows 11). devDependencies `@tauri-apps/cli@^2`, `@tauri-apps/api@^2`.
  Scripts: `desktop:dev`, `desktop:build`, `desktop:prepare` (see below).
- **Layout:** `src-tauri/` with `Cargo.toml`, `tauri.conf.json`, `src/{main,lib,settings,sidecar,
  probe,agents,tray}.rs`, `capabilities/`, `icons/`, `pages/{start,settings}.html`.
- **Bundled runtime:** `desktop:prepare` (a Node script in `tools/`) downloads the official Node LTS
  `win-x64` zip pinned by version and SHA-256 (checked), extracts `node.exe` to
  `src-tauri/resources/node/`, and copies `server.mjs`, `server/` (without `*.test.mjs`), `dist/` and
  the two agent scripts into `src-tauri/resources/`. These are gitignored build outputs. Node runs as
  a plain resource started by `std::process::Command` with `CREATE_NO_WINDOW` (or the shell plugin's
  sidecar API; either works, the Rust side owns the child handle).
  - Node SEA and pkg are rejected: SEA needs a CommonJS bundle and an `import.meta.url` rewrite for
    no size gain; pkg is archived.
- **server.mjs:** add `DASHBOARD_DIST` (default unchanged).
- **Installer:** NSIS only, per-user (`currentUser`, no admin), WebView2 `downloadBootstrapper`,
  unsigned. Expected size about 35–45 MB compressed (node.exe dominates).
- **Icons:** `npx tauri icon` from the studio logo (`public/favicon.svg`), via a 1024 px PNG if the
  small sizes look soft. Tray icon from the same mark.
- **Versioning:** app version = `package.json` version; `/api/health` reports it so a mismatch
  (attached to a foreign older server) can be shown.
- **Later:** updater plugin with a GitHub Releases feed, code signing, CI on windows-latest.

## Testing
- **Vitest** (JS): `/api/health` shape; `isAllowedProxyType`; `DASHBOARD_DIST` resolution;
  agent-install `--node` / `--url` command building and `--json` output (extend
  `tests/server/agent-install.test.mjs`); agent-status `--url` precedence; `src/lib/desktop.ts`
  (`isTauri()`, export/import branch with mocked IPC).
- **Rust** (`cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check`): settings
  load/validate/defaults/migration, `classify_probe`, `is_allowed_nav`, sidecar env building, port
  validation, agent-install argument building.
- **Manual checklist** on the installed build:
  1. Clean machine profile (no system Node): install, launch, the studio opens; the kiosk URL works in
     a browser and in InfoPanel.
  2. Close the window: the kiosk keeps updating; tray "Open studio" brings it back.
  3. Reboot with start at login on: the server runs, no window.
  4. Change port in settings: the server restarts on it, the studio reloads, the kiosk works on the
     new URL, agent hooks (if on) point at the new port.
  5. Host 0.0.0.0: warning shown; another device on the LAN can open the kiosk.
  6. Port taken by another program, and by `start-dashboard.bat`: the right screen each time.
  7. Agents on: hooks in both files, backups made, an agent session shows on the island; agents
     off: hooks gone; uninstall: hooks gone.
  8. Second launch focuses the window; window state is remembered.
  9. Native export/import; edit then close within 400 ms: the change is saved.
  10. External links open in the default browser; WebView2 doesn't swallow studio shortcuts
      (Ctrl+F, Ctrl+P, Ctrl+R, F5).
  11. Kill the node process: the app restarts it.

## Phases (each ends with `npm test` and `npm run build` passing; from Phase 1 also `cargo test`,
`cargo clippy` and `npm run desktop:build`)

### Phase 0: Server and script prerequisites (no Tauri; mergeable alone)
1. `/api/health` → `{ app: "infopanel-dashboard", version, configVersion }`.
2. Image proxy limited to `image/*` + nosniff (`server/proxy.mjs`); check Spotify, YT Music and other
   cover-art sources first.
3. `DASHBOARD_DIST` and `DASHBOARD_DATA_DIR` env overrides; `DASHBOARD_DEBUG` request/SSE logging
   and `/api/debug/stats`.
4. agent-install `--node`, `--url`, `--json`; agent-status `--url`.
5. Tests; docs (`docs/development.md` env table, `docs/architecture.md` routes, the CodingAgents doc).

### Phase 1: Shell that runs its own server
6. Scaffold `src-tauri/` (name "InfoPanel Studio", identifier `dev.f3nn3x.infopanel-studio`,
   icons, NSIS per-user).
7. `desktop:prepare` (pinned, checksummed Node; resources copy).
8. Settings store with defaults (no UI yet), probe, sidecar start/stop/restart with logs and crash
   restarts, start.html with the status and error screens.
9. Window loads the studio from the sidecar; single instance; window state.
10. Navigation guard and opener; capabilities.

### Phase 2: Tray, lifecycle and settings page
11. Tray menu; close to tray; Quit stops the owned server.
12. settings.html: host (with warning and address list), port (validated), allowed hosts, start at
    login, open studio on launch, close to tray, logs tail; apply restarts the server.
13. Autostart plugin (hidden start).
14. A Settings button on the studio's left rail when `isTauri()` (it began as an item in the ⋯ menu).

### Phase 3: Studio integration
15. `src/lib/desktop.ts` with lazy `@tauri-apps/api` imports (kiosk bundle stays clean).
16. Native config export and import via dialogs (same `mergeConfig` and one undo step).
17. Flush pending edits before hide or quit (1500 ms cap).

### Phase 4: Coding agents
18. Bundle the agent scripts; settings toggle with explanation and result view.
19. Re-install on app update and on port change; NSIS pre-uninstall removal.
20. Update the CodingAgents doc: app toggle vs `node tools/agent-install.mjs` from the repo.

### Phase 5 (later): Distribution
21. Updater and release feed; code signing; CI build that uploads the installer.

## Risks
- **Antivirus flags node.exe** in the install folder or the unsigned installer. Mitigation: official
  signed node.exe (Node's own binary is signed), per-user install; app signing later.
- **Port conflict with an old `start-dashboard.bat` at login.** Mitigation: the start screen names it
  and the docs tell the user to remove it from startup once the app is installed.
- **Agent hooks pointing at a stale path** after update, move or uninstall. Mitigation: re-install
  on update, removal in the uninstaller, and the hook script never fails the agent anyway.
- **LAN exposure** if the user picks 0.0.0.0. Mitigation: explicit warning, request-guard, default
  stays loopback.
- **Same-origin page gets IPC.** Mitigation: the remote capability only exposes file dialogs and
  opening settings; proxy hardening; navigation guard.
- **Flush on hide/quit hangs** if the server is gone. Mitigation: hard timeout.
- **WebView2 shortcut clashes.** Checked early in Phase 1.

## Success criteria
- [ ] One installer, no prerequisites beyond Windows 11: the app runs the server, the studio and the
      kiosk work, and the existing config in `%LOCALAPPDATA%\InfoPanel\Dashboard` is picked up as-is.
- [ ] IP and port are set in the app; changes apply without reinstalling.
- [ ] The kiosk keeps working with the window closed and after a reboot.
- [ ] Coding agent hooks install and uninstall from the settings page, survive updates and port
      changes, and are removed on uninstall.
- [ ] Browser studio, kiosk and config format unchanged; all tests pass at every phase.

## Debug mode (errors and leaks)

Off by default; a switch in the settings page (applies on the next server restart, which the page
does for you), or `--debug` / `INFOPANEL_STUDIO_DEBUG=1` for one run.

- **App log** (`tauri-plugin-log`): `logs/app.log`, rotated at 5 MB, 3 files. Info level normally;
  debug level in debug mode (probe results, sidecar spawn/exit codes, settings changes, IPC calls,
  window/tray events).
- **Server log:** the sidecar runs with `DASHBOARD_DEBUG=1`, so server.mjs logs every request
  (method, path, status, ms), SSE connects and disconnects per channel, and errors with stacks.
- **Server stats:** `GET /api/debug/stats` (only when `DASHBOARD_DEBUG=1`, loopback only):
  `process.memoryUsage()`, uptime, open SSE clients per channel, `process.getActiveResourcesInfo()`
  counts by type, event-loop delay (`perf_hooks.monitorEventLoopDelay`) p50/p99/max.
- **Studio errors:** `window.onerror`, `unhandledrejection` and `console.error` / `console.warn` are
  forwarded to the app log (`log_frontend`), rate-limited (20 per 10 s, then a "suppressed N" line).
- **Studio samples** every 30 s in debug mode (`report_metrics`): JS heap (`performance.memory`),
  DOM node count, open EventSources (sensor-store and the config/control/extras streams), live
  timers registered through the app's own helpers where available.
- **Process samples** every 30 s in debug mode (Rust, `sysinfo`): sidecar node.exe RSS and CPU, the
  WebView2 processes' total private memory, the app's own RSS. Each sample (Rust + server stats +
  studio sample) is one line in `logs/metrics.csv`.
- **Leak check:** the settings page's Diagnostics section shows the latest sample, the growth over the
  last 30 / 60 minutes per series, and flags a series as "growing" when it rose in at least 80% of the
  samples over the last hour and by more than 20%. Buttons: Open logs folder, Open DevTools (the
  release build has the `devtools` feature; DevTools open only in debug mode), Copy diagnostics
  summary.
- Debug mode off: no sampling, no request log, `/api/debug/stats` answers 404, frontend forwarding
  only for uncaught errors.

## IPC contract (Rust commands and events)

Local pages (`start.html`, `app/settings.html`, capability `default.json`):
`get_settings`, `set_setting(key, value) -> { ok, error?, restartRequired, settings }`,
`set_zoom(factor)`, `server_status -> Status` (and the `server-status` event), `start_server`,
`stop_server`, `restart_server`, `find_free_port`, `server_stats`, `update_state` and the
`update-state` event, `check_for_update`, `download_update`, `cancel_update`, `install_update`,
`read_log(source, cursor) -> { lines, cursor, file, reset }`, `reveal_path`, `agents_status`,
`repair_agents`, `open_agent_backups`, `app_info`, `changelog`, `open_external`, `use_foreign_server`, `stop_foreign_server -> StopResult` (re-checks health and
the PID's image name before killing), `foreign_server_info -> { pid, exe }`, `open_studio`,
`open_logs_folder`, `read_log_tail(name: "app"|"server", lines) -> string`,
`get_diagnostics -> Diagnostics`, `set_agents(enabled) -> AgentResult`, `open_devtools`,
`list_local_addresses -> string[]`, `quit_app`.

Studio (remote capability, origin `http://127.0.0.1:<port>`):
`open_settings`, `save_text_file(defaultName, contents) -> bool`, `open_text_file -> string|null`,
`log_frontend(level, message)`, `report_metrics(sample)`, `get_debug -> bool`, `flush_done`.
Event `studio://flush`: emitted before the window hides or the app quits; the studio flushes pending
edits and calls `flush_done`; Rust waits at most 1500 ms.

## Test isolation

Testing the app must never touch the live dashboard or the user's agents:
- `INFOPANEL_STUDIO_DATA_DIR` (app) → `DASHBOARD_DATA_DIR` (server, new env override of
  `DATA_DIR`), so a test run has its own config, assets and logs.
- `INFOPANEL_STUDIO_CONFIG_DIR` overrides where the app keeps `settings.json` and its logs.
- A test settings file sets a spare port (e.g. 3942), `startAtLogin: false`, `agents.enabled: false`.
- Agent install tests use the pure functions and a temp HOME; they never write the real
  `~/.claude` or `~/.codex`.
- The live server on 3922 and InfoPanel on 3921 are never stopped by a test.
