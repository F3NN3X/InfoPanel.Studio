# InfoPanel Studio (desktop app)

A Tauri 2 app that runs the dashboard server itself (a bundled Node and `server.mjs`) and opens the
studio in its own window. The kiosk page InfoPanel shows keeps working while the app sits in the tray.
The design and decisions are in [TAURI_PLAN.md](TAURI_PLAN.md).

## Build

Prerequisites: Rust stable (MSVC), Visual Studio 2022 Build Tools with "Desktop development with C++"
and the Windows SDK, Node 20+. WebView2 ships with Windows 11.

| Command | What it does |
|---|---|
| `npm run desktop:web` | Type-checks and builds the studio into `.cache/desktop/dist` (never `dist/`, which a running dashboard server may be serving) |
| `npm run desktop:prepare` | Downloads the pinned Node (checked by SHA-256, cached in `.cache/desktop/`) and fills `src-tauri/resources/` |
| `npm run desktop:build` | All of the above, then `tauri build`: `src-tauri/target/release/bundle/nsis/InfoPanel Studio_<version>_x64-setup.exe` |
| `npm run desktop:dev` | The same, then `tauri dev` |

Checks for the Rust side, run in `src-tauri/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test`.

The installer is NSIS, per user (no admin) and unsigned, so SmartScreen warns on first run.

## Where things live

| What | Where |
|---|---|
| App settings | `%APPDATA%\dev.f3nn3x.infopanel-studio\settings.json` |
| Logs (`app.log`, `server.log`, `metrics.csv`) | `%LOCALAPPDATA%\dev.f3nn3x.infopanel-studio\logs\` |
| Dashboard config, assets, alerts | `%LOCALAPPDATA%\InfoPanel\Dashboard\` (the same folder `server.mjs` always used) |
| Bundled runtime | `<install dir>\node\node.exe`, `<install dir>\app\` |

## Settings

Open them from the tray or the Settings item at the bottom of the studio's rail (**Settings › App**). The start screen opens them in their own window when the server is stopped or in trouble.

Every change saves at once; there is no Save button. They have a sidebar (the separate window also has search with Ctrl K) and eight
sections.

- **General:** app zoom (80 to 150 percent; Ctrl +, Ctrl - and Ctrl 0 in the settings window; the studio keeps
  Ctrl + `=` / `-` for canvas zoom), start at login (default on, starts hidden in the tray), open the studio on
  launch, start the server on launch, close to tray, remember window size and position, refresh the Studio
  (reload it now and then while unfocused), release the hidden studio (close its page after 1 minute, 10 minutes
  (default), an hour or never in the tray), reduce studio animation when unfocused (default on: after a minute
  unfocused the canvas runs at 5 fps and ambient effects pause), open the studio in (the app window, Microsoft Edge
  in app mode, or the default browser) and Design preview data (live, frozen, or frozen when unfocused).
- **Server:** start, stop and restart; who can connect (this computer only on 127.0.0.1, or the local network on
  0.0.0.0 with the LAN IP shown); the port (default 3922); extra allowed host names for LAN access;
  restart automatically after a crash; the kiosk URL. The port, who can connect, the allowed host names and debug
  mode are read when the server starts, so changing one shows a restart bar (Undo or Restart server).
- **Updates:** the installed version, the Stable or Beta channel, "Check for updates at startup" (default on; one
  check about 15 seconds after launch, in the background), background download, and Check now / Download /
  Restart and update. A found update also shows in the tray as `Update to vX.Y.Z…`. Installing stops the app's
  server, runs the installer and relaunches the app.
- **Coding agents:** off by default. Turning it on writes the Claude Code and Codex hooks (backing up
  `~/.claude/settings.json` and `~/.codex/hooks.json`), pointing at the app's own Node and the current
  port. They are rewritten after a port change or an app update, and removed when you turn it off or
  uninstall the app.
- **Diagnostics, Logs, About and Changelog:** debug mode (see below), the server (experimental: Node, the bundled
  `server.mjs`, or Native, `ips-server` running inside the app; read when the server starts, so a change shows the
  restart bar), the live logs of the server, app and studio, versions and file locations, and the bundled changelog.

## Releases and updates

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds the installer and publishes it with its
`.sig` and `latest.json` (the manifest the app reads from `releases/latest/download/latest.json`). Update packages
are signed with Tauri's updater key, not a Windows code-signing certificate: the public half is in
`tauri.conf.json` (`plugins.updater.pubkey`), the private half is the repository secret
`TAURI_SIGNING_PRIVATE_KEY` (the workflow fails early without it). Never commit the private key. Losing it means
installed apps can no longer verify updates, so keep a copy outside the repository. A local `npm run desktop:build`
does not make updater artifacts and needs no key.

## Another server on the port

If `start-dashboard.bat` (or any `node server.mjs`) already holds the chosen port, the app closes it
on startup and starts its own server. It only stops a `node.exe` that owns the port and either answers
`/api/health` as the dashboard or runs `server.mjs` (older builds have no health route). Any other
program is left alone, and the start screen says the port is in use and offers the settings. If the
stop fails, the start screen offers it again, or "use it for this session". The .bat's console window
then shows "The dashboard failed to start" because its server was stopped: close it, and remove the
.bat from Windows startup once the app is installed.

## Window

The windows have no native frame. The studio's top bar is the main window's title bar: drag it by
its empty space, double-click to maximize, and use the minimize, maximize and close buttons at its
right end (close hides to the tray). The start and settings pages have a matching bar with the logo.

While the studio window is hidden to the tray or minimized, its webview is suspended (WebView2 `TrySuspend`, else a
Low memory target) after the page is flushed, and resumed before it shows again. Kiosk view on screen is never
suspended. A window hidden to the tray for long enough (**Release the hidden studio**, 10 minutes by default) is
destroyed after a flush, and rebuilt when the tray shows it. A minute after the visible studio loses focus, the shell's
`studio-focus` event slows its animation (**Reduce studio animation when unfocused**). Why and how: [webview-performance.md](webview-performance.md).

**Open the studio in** a browser instead (Edge in app mode, or the default browser) and the app runs no studio
window at all: the tray, a second launch, Open the studio on launch and Settings' links open
`http://127.0.0.1:<port>/?studio=1` there, after starting the server if it is stopped (if it can't start, the app
window's start page shows why). Edge is found from the registry (`App Paths\msedge.exe`); without it the default
browser opens, with a warning in the log. A browser can't be told to focus a tab, so while a studio is connected to
the server another open asks first (Open another / Cancel). Help follows the setting; Settings and Kiosk view stay
app windows (in the browser studio, Kiosk view opens the kiosk in a popup). The browser studio saves when its tab is
hidden and asks before closing while a change is unsaved. A non-Chromium default browser may render the preview a
little differently from InfoPanel's WebView2; Settings says so when it can tell. A Dashboard or Studio setting changed
in the app's Settings window reaches a browser studio through the server's config stream (it fetches the patches it
missed), and Design preview data is kept on the server (`studio-prefs.json`), so both windows share it.

## Debug mode (errors and leaks)

Turn it on in the settings page, or for one run with `--debug` or `INFOPANEL_STUDIO_DEBUG=1`.

- `app.log` switches to debug level: probes, server start and exit, settings, IPC calls, window and tray
  events, and the studio's errors, warnings and unhandled rejections (rate-limited).
- `server.log` gets every request (method, path, status, ms) and SSE connects and disconnects;
  `GET /api/debug/stats` (loopback only) returns memory, open SSE clients, active handles and
  event-loop delay.
- Every 30 s a sample (the app's, the server's and the WebView2 processes' memory, the server stats, the
  studio's JS heap, DOM nodes and open EventSources) goes to `metrics.csv` and to the Diagnostics table in
  the settings window's Diagnostics page. A series is flagged "growing" when it rose in at least 80% of the samples over the
  last hour and by more than 20%.
- Open DevTools from the settings page (debug mode only).
- **Open WebView2 task manager** (Diagnostics, any mode) shows memory and CPU per WebView2 process (renderer, GPU
  and the rest), to tell which one grows. `node tools/perf/metrics-trend.mjs` summarises `metrics.csv` over time.

Event-loop delay figures on Windows sit around 15 ms at idle: that is the timer resolution, not a stall.

With the native server the server runs in the app's process: its lines (target `server`) still go to `server.log`,
with the app log's `[date][time][server][LEVEL]` prefix; the Server page's Memory is the app's; in `metrics.csv` the
`sidecar.*` columns stay empty (`app.rssMb` is the figure), `server.memory.rss` is the app's too, the V8 heap
columns are empty, and `server.eventLoopDelayMs.p99` is the runtime's scheduling delay.

## Testing without touching the live setup

| Variable | Effect |
|---|---|
| `INFOPANEL_STUDIO_CONFIG_DIR` | Where the app keeps `settings.json` and its logs, and the WebView2 profile (`EBWebView/`), so a test run never shares the installed app's profile or its running WebView2 |
| `INFOPANEL_STUDIO_DATA_DIR` | Passed to the server as `DASHBOARD_DATA_DIR` (its own config and assets) |
| `INFOPANEL_STUDIO_DEBUG=1` | Debug mode for this run |
| `INFOPANEL_STUDIO_CDP_PORT` | In debug builds only (never a release build), adds `--remote-debugging-port` to WebView2, so Playwright can attach (`connectOverCDP`) |
| `INFOPANEL_STUDIO_BROWSER_PROFILE` | In debug builds only: a `--user-data-dir` for the Edge (and stand-in browser) the browser studio opens, so a spec never opens your own browser profile |
| `INFOPANEL_STUDIO_BROWSER_EXE` | In debug builds only: a Chromium that stands in for the default browser (Open the studio in › Default browser) |

Seed the config folder with a `settings.json` that uses a spare port, `"startAtLogin": false` and
`"agents": { "enabled": false }`. Quit an installed InfoPanel Studio first: the app is single-instance, so a
running one takes the launch.

The debugging port opens only when WebView2 starts a browser process of its own: not while another app's process
holds the same profile (the reason for the profile under `INFOPANEL_STUDIO_CONFIG_DIR`), and not with `USERPROFILE`
pointed at another folder. To try the agent toggle with a temp `USERPROFILE` (the bundled Node then writes the hooks
there), leave `INFOPANEL_STUDIO_CDP_PORT` out.

The `desktop` Playwright project (`tests/desktop/`, Windows only) does all of this: build with
`npm run desktop:web && npm run desktop:prepare && npx tauri build --debug --no-bundle`, then
`npx playwright test --project=desktop`. `DESKTOP_SERVER=native` runs them against the native server (it writes
`"server": "native"` into the scratch settings).
