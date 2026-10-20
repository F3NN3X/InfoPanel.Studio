# App settings: status

The settings window is built (PR 3 of 3) on the backend from PR 2. Spec: `SPEC.md`; the reference design is
`App Settings.dc.html`. The code is `src/settings/` (React, its own Vite entry, `settings.html` at the repo root,
`vite.settings.config.ts`). It builds into `src-tauri/pages/app/` (git-ignored), which Tauri serves next to
`start.html`; `npm run desktop:web` runs it, so `desktop:dev`, `desktop:build` and the release workflow produce it.

Checked by tests and a production build. **Not yet checked by eye in the running app**: the layout items below are
written to the spec's sizes but need the desktop smoke test.

## Acceptance checklist (SPEC section 10)

| Line | State |
|---|---|
| No Save button; every change persists and the "Saved" toast shows | Done. Each control calls `set_setting` (zoom `set_zoom`); the toast lasts 1.4 s and restarts on each change. The agents switch runs `set_agents`. |
| Port, listen or debug show the restart bar; Undo restores; Restart applies and clears it | Done. The bar compares the saved settings with `status.runningConfig` (also allowed host names, listed as "allowed host names"). Undo saves the running values back; Restart calls `restart_server`. Tested (restart diff, and the port + Undo flow with `invoke` mocked). |
| An invalid port is red, not saved, and does not raise the bar | Done. A valid port saves 600 ms after typing stops, or on blur or Enter. Tested. |
| Start, Stop and Restart stay in sync with the tray and the sidebar pill | Done by the `server-status` event; the card, nav dot and pill all read the same status. Stop is hidden for a server the app did not start (the backend refuses it). |
| `EADDRINUSE` shows the callout; the fix button picks a free port and starts | Done: "Use <suggestedPort>" saves the port and calls `start_server`. EACCES and other errors have their own callouts with View logs. `foreign_dashboard` gets a fourth callout with Use it and Stop it (from `foreign_server_info`). |
| With "Start the server on launch" off the app launches stopped | Backend (PR 2). The switch and its dynamic hint are in General. |
| Zoom applies to the studio and settings windows, survives a relaunch, kiosk unaffected | Backend applies it to every app window and saves it. The segmented control, the minus and plus buttons, and Ctrl +, Ctrl - and Ctrl 0 in the settings window are done. **Deliberate deviation from SPEC 4.1:** the studio has no app-zoom shortcuts, because Ctrl `=` / `-` already zoom the canvas there (`use-studio-shortcuts.ts`). The studio's app zoom changes from the settings window. |
| The kiosk URL reflects the running config; Copy and Open work | Done. Built from `runningConfig` (the saved values while no server runs), with the LAN IP for a network server. |
| The agents toggle installs and removes hooks; chips are correct; Repair works | Done. Status chips come from `agents_status`; the toggle shows what the settings say after the call, so a failed install is rolled back with an error toast. Repair is enabled when the hooks are on and a file needs it. Open backups calls `open_agent_backups`. |
| The update flow covers every state, including error; "What's new" opens the Changelog | Done for current, checking, available, downloading (progress bar), ready, installing and error, from `update_state` and the `update-state` event. Tested as a state-to-card mapping. |
| Diagnostics groups by prefix, filters to Notable, colours, refreshes live | Done: grouped by first dotted segment, Notable (flagged, or fell 20% or more) and All, amber and green deltas, `+371.3k (+74%)` format, refresh every 30 s. The clipboard summary text is the old page's. |
| Logs stream with source, level and text filtering; Follow behaves | Done. Polls `read_log` every second while the page is open, 2000-line ring per source, cleared on `reset`. Follow turns off when the user scrolls up and on at the bottom. Tested (parsing, ring buffer, counts, filter). |
| About shows real versions and paths; Show and Copy system info work | Done from `app_info` and `reveal_path`. |
| The changelog renders the bundled file as headlines per category with Show all (newest release open, no Markdown view); the rail scrolls and highlights | Done: `changelog()` parsed by `parseChangelog` (`## [x.y.z] - date`, `## [Unreleased]` at the top without a date) and rendered with `marked` with raw HTML escaped and only http and https links. Scroll-spy is an IntersectionObserver. Tested against the real file. |
| Search finds every row in section 8 | Done for every row that exists: 26 of 27. The "Licenses" row is gone (see gaps). "Start / stop server" and "Restart server" both land on the server status card. The jump highlights the row for 1.5 s. Arrow keys and Enter work in the result list. |
| The layout holds at 760 px and 150% zoom, no wrapped buttons | Written for it (all buttons `nowrap`, toolbars wrap, 1040 px column for Diagnostics and Logs, 780 px otherwise). Zoom is the webview's zoom, not CSS. Checked in a browser at 1000 px and at 507 px (760 px at 150%): no button wraps, and General, Server, Updates and About fit. **Known limit:** at 507 px the Changelog section scrolls sideways; the 236 px sidebar takes almost half the width. |

## Gaps and deviations

- **Open-source licenses link dropped.** The repository has no LICENSE or third-party notices file, so the link (and its
  search entry) is not there.
- **Sensors row skipped** in About, as briefed.
- **Logs sources are Server, App and Studio.** There is no sensor sidecar, so the page subtitle reads "Live output from
  the server, the app and the studio."
- **Log times.** `app.log` lines carry a time to the second; `server.log` lines carry none (the wrapper's start lines
  are UTC and are shown in local time), so those are stamped when the page reads them. The first read of a source
  stamps its whole tail with that moment.
- **Icons** are lucide's closest equivalents of the Material Symbols names.
- **Forced debug mode.** When `--debug` or `INFOPANEL_STUDIO_DEBUG=1` forces debug on, the window learns that once,
  at load, from `get_diagnostics`. If the window is opened with debug already saved on and also forced, then turned
  off, the bar offers a restart the backend would not count.
- **Dev mode.** `npm run desktop:dev` still needs `npm run desktop:web` first (it runs it), because the settings
  window is a built page, not served by the Vite dev server.
