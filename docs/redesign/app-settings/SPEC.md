# InfoPanel Studio — App Settings redesign

Implementation spec for the settings window. The reference design is `App Settings.dc.html` in this folder (open it in a browser; the `serverState` / `updateState` props switch the demo states). Copy is final unless marked *placeholder*.

Replaces the current single-scroll settings page (Server, Startup, Updates, Save button, Coding agents, Debug mode + diagnostics table, Log).

---

## 1. Goals

1. Organise settings into sections with a sidebar instead of one long scroll page.
2. **Autosave.** Remove the Save button. Each control saves when you change it. Settings that need a server restart are queued behind a restart bar.
3. New capabilities: app zoom, server start/stop, start the server on launch, auto-restart after a crash, release channel, background download, a full log viewer, an About page, and a full changelog reader.
4. Every setting can be found from search (Ctrl K).

## 2. Window layout

```
┌ title bar (native / 36px custom) ───────────────────────────────┐
│ sidebar 236px │ [restart bar — sticky, only when pending]       │
│  search       │  content column (max 780px; 1040px for          │
│  nav groups   │  Diagnostics and Logs), centered, padding 32px  │
│  ───────────  │   H1 title + one-line subtitle                  │
│  server pill  │   section body                                  │
└───────────────┴─────────────────────────────────────────────────┘
```

- Window min size: 760 × 520. Content scrolls; sidebar is fixed.
- **App zoom** applies to the whole window under the title bar (and to the studio window — see §4.1).
- When you change section, the content scroll position resets to the top.
- A toast at the bottom right says "Saved" for 1.4 s after any autosaved change (one toast, which restarts its timer on each change).

### 2.1 Sidebar

**Search box**: placeholder "Search settings", shows a `Ctrl K` hint while empty, and an × button to clear it.
- Ctrl/Cmd + K focuses it from anywhere in the window.
- While the query is not empty, the nav is replaced by a result list. Each result shows the setting label plus its section icon and name. Clicking a result opens that section and clears the query. Shows "N results" or "No matches".
- Matching: a case-insensitive substring match on `label + section name` against the index in §8.

**Nav groups** (uppercase 10.5px group labels):

| Group | Items (icon) |
|---|---|
| App | General (`tune`), Server (`dns`), Coding agents (`smart_toy`), Updates (`system_update`) |
| Troubleshoot | Diagnostics (`monitoring`), Logs (`article`) |
| InfoPanel Studio | About (`info`), Changelog (`history`) |

Item indicators:
- Server: a status dot in the server-state colour (§5.1).
- Diagnostics: an amber dot while debug mode is on.
- Updates: a "1" badge when an update is `available` or `ready`.

**Footer**: a status dot with a 3px halo, the server label ("Server running"), the address in mono (or the state word when not running), and the app version.

Icons are Material Symbols Rounded. Fonts are Geist (UI) and Geist Mono (numbers, paths, URLs, logs).

### 2.2 Restart bar

The bar appears at the top of the content, sticky and amber, when any **restart-required** setting differs from what the running server was started with:

- `server.port`
- `server.listen`
- `debug.enabled`

Text: `Restart the server to apply: <list>.` The list items are:
- `port 3923`
- `local network access` or `local-only access`
- `debug mode on` or `debug mode off`

Buttons:
- **Undo**: puts those values back to what the running server uses.
- **Restart server**: see §5.2.

The bar is hidden while the port is invalid and while a restart is in progress.

Restart-required values are **saved to disk right away**, like everything else. The bar only means the server hasn't picked them up yet. If the app quits before a restart, the server starts with the new values next time.

---

## 3. Settings model

Proposed keys. Map these to the existing settings file; keep compatibility for old keys (read old → write new once).

| Key | Type | Default | Restart | Section |
|---|---|---|---|---|
| `app.zoom` | 80\|90\|100\|110\|125\|150 | 100 | no | General |
| `startup.startAtLogin` | bool | true | no (OS login item) | General |
| `startup.openStudio` | bool | true | no | General |
| `startup.startServer` | bool | true | no | General |
| `window.closeToTray` | bool | true | no | General |
| `window.rememberBounds` | bool | true | no | General |
| `server.listen` | `"local"` \| `"lan"` | `"local"` | **yes** | Server |
| `server.port` | int 1024–65535 | 3922 | **yes** | Server |
| `server.autoRestart` | bool | true | no | Server |
| `agents.enabled` | bool | true | no (installs or removes hooks) | Coding agents |
| `updates.checkAtStartup` | bool | true | no | Updates |
| `updates.channel` | `"stable"` \| `"beta"` | `"stable"` | no | Updates |
| `updates.autoDownload` | bool | false | no | Updates |
| `debug.enabled` | bool | false\* | **yes** | Diagnostics |

\* The current build ships with it on in dev. Production default is off.

Notes:
- `server.listen`: `local` binds `127.0.0.1`; `lan` binds `0.0.0.0`. The UI shows the machine's primary LAN IPv4 for `lan`.
- If `startup.startServer` is false, the app launches with the server stopped. The tray and the Server page offer Start.
- If `window.closeToTray` is false, closing the window quits the app and stops the server.

---

## 4. Sections

Common row pattern: a card (`#111114`, 1px `#1f1f24`, radius 12) holds rows (padding 14×18, 1px `#1c1c21` dividers). Each row has a label (13.5/500) and an optional hint (12.5, `#8a8a94`) on the left, and the control on the right. Group headings sit above cards (12px, `#8a8a94`).

Toggle switch: 38×22, on = accent `oklch(0.72 0.15 255)`, off = `#2e2e35`, white 16px knob, 150 ms slide.

### 4.1 General — "How the app starts, closes and scales."

**Appearance**
- **App zoom**. Hint: "Scales the studio and this window. Doesn't change the kiosk."
  - The current value is shown in mono, between − and + buttons.
  - A segmented row offers 80% · 90% · 100% · 110% · 125% · 150%.
  - Shortcut legend: `Ctrl +` Zoom in, `Ctrl −` Zoom out, `Ctrl 0` Reset.
  - Shortcuts (Ctrl/Cmd + `=`/`+`, `-`, `0`) work in **both** the settings window and the studio window. They step through the list and clamp at the ends.
  - Apply with `webContents.setZoomFactor()` (Electron) or the WebView2 `ZoomFactor`, on every app window. **Never** apply it to the kiosk page.

**Startup**
- **Start at login**: "Starts in the tray so the kiosk has a server after a reboot." Registers or unregisters the OS login item.
- **Open the studio on launch**: "Off: the app starts quietly in the tray."
- **Start the server on launch**:
  - On: "The kiosk works as soon as the app is up."
  - Off: "Off: start it yourself from Server. The kiosk can't connect until then."

**Window**
- **Close to tray**. The hint is dynamic:
  - On: "Closing the window keeps the server running for the kiosk."
  - Off: "Closing the window quits the app and stops the kiosk server."
- **Remember window size and position**

### 4.2 Server — "The local server the kiosk and studio load from."

**Status card**: a 44px icon tile tinted by state, a title, a detail line, and actions (see §5.1 for per-state values). Below it is a four-cell stats strip (mono values):

| Address | Uptime | Clients | Memory |
|---|---|---|---|
| `host:port` | `2h 14m` | `server.sseClientsTotal` | `server.memory.rss` |

Show `—` for each value while the server is not running (Clients shows `0`). Refresh every 5 s while the page is visible.

In the **error** state, an inline red callout appears inside the card. Example: "Port 3922 is already in use by another app. Pick a free port, then start the server." It has a **Use 3923** button, which suggests the first free port above the current one. Clicking it sets the port and starts the server.

**Network**
- **Who can connect**: two option cards (radio behaviour), with the selected card in an accent border and tint.
  - `computer` icon: "This computer only", `127.0.0.1`
  - `lan` icon: "Local network", `0.0.0.0 · <LAN IP>`
  - When `lan` is selected, show an amber note with a `shield` icon: "Anyone on your network can open the kiosk and the studio. Windows may ask to allow it through the firewall."
- **Port**: a 96px right-aligned mono input that accepts digits only, max 5 characters.
  - Hint: "1024 – 65535".
  - When invalid: red border and the hint "Use a number from 1024 to 65535." An invalid value is **not saved** and never triggers the restart bar.
  - Optional nice-to-have: an inline check that the port is free before saving.
- **Restart automatically if it crashes**: "Up to 3 tries a minute, then it stays stopped and logs why."

**Kiosk**
- Hint: "Paste this into InfoPanel. It has to use the same port as the server."
- A read-only mono field shows `http://<host>:<runningPort>/?kiosk=1`. It reflects the **running** config, not unsaved edits.
- **Copy** (the button label shows "Copied" for 1.5 s) and **Open** (opens in the default browser).

### 4.3 Coding agents — "Claude Code and Codex on your dashboard."

One card:
- Header row: a `terminal` tile, **Connect coding agents** ("Shows Claude Code and Codex sessions on the dashboard."), and a toggle.
- A file list headed "Edited files" when on, "Files that will be edited" when off. Each row shows the agent, its path in mono, and a status chip:
  - Claude Code: `~/.claude/settings.json`
  - Codex: `~/.codex/hooks.json`
  - Chip states: `Hooks installed` (green), `Not connected` (neutral). Recommended extras: `Needs repair` (amber) when hooks are missing or changed while enabled, and `Agent not found` (neutral) when the folder doesn't exist.
- Explainer: "Adds hooks that run InfoPanel Studio's own Node, and wraps your Claude Code statusline so it keeps printing as before. Each file is backed up first. Turning this off removes them."
- Buttons:
  - **Open backups**: opens the backup folder.
  - **Repair hooks**: re-runs the install for files whose status isn't `Hooks installed`.

Toggling runs the install or uninstall right away (same logic as today). On failure, set the toggle back and show an error toast with the reason.

### 4.4 Updates — "Get new versions of InfoPanel Studio."

**Status card**: the state machine is in §5.3. The card has two buttons:
- **What's new**: goes to the Changelog section.
- A primary action that changes with the state.

**Options card**
- **Release channel**: a segmented control (Stable | Beta). Hint: "Beta gets features a few weeks early." Changing it triggers a check.
- **Check for updates at startup**
- **Download in the background**: "Installs on the next restart. The kiosk is down for a few seconds."

### 4.5 Diagnostics — "Find errors and memory leaks."

**Debug card**
- **Debug mode** toggle. Hint: "Logs every server request and samples memory every 30 s to find errors and leaks. Needs a server restart." The change is restart-required (§2.2).
- Actions row: **View logs** (goes to Logs), **Open logs folder**, **Open DevTools**, **Copy diagnostics summary** (shows "Copied" for 1.5 s; the clipboard gets the same text summary as today).

**When debug is off**: a dashed empty state with a `monitoring` icon, "No samples", and "Turn on debug mode and restart the server to sample memory and event-loop delay."

**When debug is on**
- Summary line: "N samples, latest HH:MM:SS · covers X min. A series is flagged when it rose in 80% of samples over the last hour and by more than 20%." This is the existing flag rule; keep the server-side computation.
- Filter (segmented):
  - **Notable (n)**, the default: flagged series plus series that fell by 20% or more.
  - **All N**
- Table columns: Series · Latest · Δ 30 min · Δ 60 min. Values are mono, numbers right-aligned.
  - Rows are grouped by the first dotted segment (`app`, `server`, `sidecar`, `studio`, `webview`). Each group gets a small uppercase heading, and the row shows the series name without that prefix.
  - A 6px leading dot on each row: amber = flagged, grey = not.
  - Delta colour: amber = flagged, green `#7fd1a4` = fell ≥20%, muted = everything else.
  - Delta format: `+371.3k (+74%)`. Drop the repeated "over 2 min" suffix and put the sample span in the summary line instead.
- Refresh as each new sample arrives (30 s), or poll `GET /api/debug/stats`.

### 4.6 Logs — "Live output from the server, studio and sensor sidecar."

Toolbar (wraps when narrow):
- **Source**: a segmented control with Server | Studio | Sensor sidecar.
- **Level chips**: All · Errors · Warnings · Info · Debug. Each chip has a coloured dot and a count of lines in the current buffer. Only one is active at a time.
- **Filter box**: a case-insensitive substring match on the message.

Viewer:
- Background `#09090b`, height 420px (or fill the remaining height; your choice), Geist Mono 12/1.7, `white-space: pre`, horizontal scroll.
- Line layout: `HH:MM:SS.mmm` (dim) · `LEVEL` (40px column, coloured) · message.
- Level colours: error `oklch(0.7 0.18 25)`, warn `oklch(0.82 0.14 75)`, info `#7fa7ff`, debug `#6f6f79`. Error message text is tinted red and debug text is muted.
- When nothing matches: "No lines match."

Footer:
- **Follow new lines** (a small toggle): auto-scroll to the bottom when new lines arrive. Turn it off automatically when the user scrolls up, and back on when they scroll to the bottom.
- Count: "N of M lines". When debug is off, add " · debug lines hidden (debug mode off)".
- **Copy**: copies the visible (filtered) lines.
- **Open file**: reveals the current source's log file.

Data:
- Stream through SSE or IPC, using a tail of the last 2,000 lines per source as a ring buffer.
- Parse the level from the existing `[debug]`-style prefix. Lines without a prefix count as `info`.
- Timestamps: if the log line lacks one, stamp it on receipt.

### 4.7 About — "Version, system and file locations."

- **Hero card**: a 60px app tile, "InfoPanel Studio", "Version X · Channel · built <date>", and **Copy system info** (copies the System rows as `Key: Value` lines; shows "Copied" for 1.5 s).
- **System**: a key/value list with Version (incl. build), Channel, Node, WebView2/Electron runtime, Windows edition + build, and Sensors (the provider and its version). Values are mono.
- **Files**: Settings file, Dashboards and themes, Logs. Each row has its full path in mono (wraps) and a **Show** button that reveals the path in Explorer. Use the real resolved paths, not `%APPDATA%` tokens. The tokens in the mock are placeholders.
- **Links row**: **Changelog** (goes to that section), **Report an issue** (opens the issue tracker URL, prefilled with the system info), **Open-source licenses** (a bundled licenses file or page).

### 4.8 Changelog — "Everything that changed, newest first."

Source: bundle `CHANGELOG.md` with the app. Optionally fetch the latest from the update feed so "What's new" for an available update shows its notes.

Expected markdown shape:
```md
## 1.2.0 — 2026-10-12
Optional one-paragraph intro.
### Added | Changed | Fixed | (any)
- item with `code` and **bold**
```

Layout: a two-column flex.
- **Left rail** (172px, sticky):
  - A Read | Markdown segmented control.
  - A version list: the version in mono with a short date ("12 Oct 2026") underneath and a 2px left border. Clicking scrolls to that release.
  - Highlight the release currently in view (scroll-spy); the mock highlights the first entry only.
- **Read mode**: one `<article>` per release.
  - Header: the version (20px mono), the date, and an **Installed** chip on the running version.
  - Then the intro paragraph, then each `###` section as a small coloured label above a bullet list:
    - Added: green
    - Changed: accent blue
    - Fixed: amber
    - Others: neutral
  - Inline `code` is rendered as a mono pill.
  - Use a real markdown renderer (e.g. `marked` or `markdown-it`) and style its output to match. Don't reuse the mock's tiny parser.
- **Markdown mode**: the raw file in a `<pre>`, mono 12.5/1.7, wrapped.
- Links in the notes open in the default browser.
- *Placeholder*: the release entries in the mock are invented. Use the real file.

---

## 5. State machines

### 5.1 Server

| State | Dot / tint | Title | Detail | Actions |
|---|---|---|---|---|
| `running` | green `oklch(0.78 0.16 150)` | Server running | `On <addr> · up <uptime>` | Stop, Restart |
| `stopped` | grey `#6f6f79` | Server stopped | The kiosk shows "can't connect" until you start it. | **Start server** (primary) |
| `error` | red `oklch(0.7 0.18 25)` | Server couldn't start | `Failed at HH:MM:SS` + callout with reason | **Start server**, fix-it button where possible |
| `restarting` | amber `oklch(0.82 0.14 75)` | Restarting… | `Coming back on <new addr>` | none |

- The server-state icons are `check_circle`, `pause_circle`, `error` and `autorenew`.
- Map known failures to callouts: `EADDRINUSE` → port in use + "Use <free port>"; `EACCES` → "Windows blocked this port", plus a link to the logs. Anything else shows the error message plus a **View logs** button.
- The state is pushed to the window (IPC event `server:state`) so the sidebar pill, nav dot and Server page stay in sync with the tray.

### 5.2 Restart

1. The state becomes `restarting`, and the restart bar hides.
2. Stop the server, then start it with the saved config.
3. On success the state becomes `running`, and the "running config" snapshot (port, listen, debug) is updated so the restart bar clears.
4. On failure the state becomes `error`. The new values stay saved, and the callout explains why.

Stop/Start go through the same code path. The tray menu items should call the same functions.

### 5.3 Updates

```
current ──Check now──▶ checking ──found──▶ available ──Download──▶ downloading ──done──▶ ready ──Restart and update──▶ (installer)
   ▲                      └──none──▶ current          ▲                └──Cancel───────────┘
   └──────────────────────────────────────────────────┘ (if autoDownload, available → downloading automatically)
```

| State | Icon | Title | Detail | Primary |
|---|---|---|---|---|
| current | `verified` green | You're up to date | `Version X · checked N min ago` | Check now (neutral) |
| checking | `sync` blue | Checking… | `Version X` | Check now (disabled) |
| available | `new_releases` blue | Version Y is available | `You have X · NN MB download` | **Download** (accent) |
| downloading | `downloading` blue | Downloading Y | `A of B MB` + 4px progress bar | Cancel (neutral) |
| ready | `restart_alt` green | Y is ready to install | The app and kiosk server restart; takes about 10 s. | **Restart and update** (green) |
| error | `error` red | Couldn't check for updates | the reason | Try again |

The `error` row isn't in the mock. Use the server error styling for it.

---

## 6. Backend / IPC surface

Suggested channels (adapt names to the existing preload bridge):

| Call | Returns / effect |
|---|---|
| `settings:get()` | full settings object |
| `settings:set(key, value)` | validates, persists, returns `{ok, restartRequired}` |
| `server:getState()` / event `server:state` | `{state, host, port, startedAt, error?, runningConfig:{listen,port,debug}}` |
| `server:start()` / `server:stop()` / `server:restart()` | promise resolving to the new state |
| `server:findFreePort(from)` | int |
| `server:stats()` | `{clients, rssBytes, uptimeMs}` |
| `agents:status()` | `[{agent, path, status}]` |
| `agents:setEnabled(bool)` / `agents:repair()` | status array |
| `updates:check()` / `updates:download()` / `updates:cancel()` / `updates:install()` | event `updates:state` |
| `debug:stats()` | existing diagnostics payload |
| `logs:tail(source, n)` / event `logs:line` | `{source, ts, level, msg}` |
| `app:info()` | version, build, channel, runtime versions, OS, paths |
| `app:openPath(path)` / `app:openExternal(url)` / `app:openDevTools()` | — |
| `app:setZoom(factor)` | applies to all app windows |
| `app:changelog()` | markdown string |

---

## 7. Visual tokens (from the mock)

| Token | Value |
|---|---|
| Window bg | `#0c0c0e` |
| Sidebar / title bar bg | `#0e0e11`, border `#1a1a1f` |
| Card | `#111114`, border `#1f1f24`, radius 12 (status/hero cards 14) |
| Row divider | `#1c1c21` |
| Input / secondary button | `#16161a`, border `#2a2a31`, radius 8, height 32–36 |
| Segmented track | `#0c0c0e`, border `#24242a`, radius 9, pad 3; active segment `#24242b` |
| Nav active | bg `#1c1c22`, text `#ededf0`, icon `oklch(0.84 0.12 255)` |
| Text | primary `#ededf0`, secondary `#c9c9cf`, muted `#8a8a94`, dim `#6f6f79`, faint `#55555e` |
| Accent | `oklch(0.72 0.15 255)`; accent text `oklch(0.84 0.12 255)`; tint `/ 0.14` |
| Green / Amber / Red | `oklch(0.78 0.16 150)` / `oklch(0.82 0.14 75)` / `oklch(0.7 0.18 25)` |
| Restart bar | bg `oklch(0.25 0.05 75)`, border `oklch(0.4 0.08 75)`, text `oklch(0.94 0.04 80)`, button `oklch(0.86 0.13 80)` |
| Type | Geist 400/500/600; H1 24/600 −0.015em; row label 13.5/500; hint 12.5; mono = Geist Mono |

All buttons use `white-space: nowrap`. Toolbars use `flex-wrap: wrap`.

---

## 8. Search index

| Label | Section |
|---|---|
| App zoom | General |
| Start at login | General |
| Open the studio on launch | General |
| Start the server on launch | General |
| Close to tray | General |
| Remember window size | General |
| Start / stop server | Server |
| Restart server | Server |
| Who can connect (listen on) | Server |
| Port | Server |
| Kiosk URL | Server |
| Restart automatically if it crashes | Server |
| Connect coding agents | Coding agents |
| Claude Code hooks | Coding agents |
| Codex hooks | Coding agents |
| Check for updates | Updates |
| Release channel | Updates |
| Download in the background | Updates |
| Debug mode | Diagnostics |
| Diagnostics / memory | Diagnostics |
| Open DevTools | Diagnostics |
| Copy diagnostics summary | Diagnostics |
| Logs | Logs |
| Version | About |
| Data folder | About |
| Licenses | About |
| Changelog | Changelog |

Nice-to-have: after you jump from a search result, highlight the target row for about 1.5 s (accent outline that fades).

---

## 9. Keyboard

| Keys | Action |
|---|---|
| Ctrl/Cmd K | focus search |
| Esc (in search) | clear query |
| Ctrl/Cmd + / − / 0 | zoom in / out / reset |
| ↑ ↓ / Enter in search results | move / open (nice-to-have) |

All controls are reachable by keyboard. Toggles are `role="switch"` with `aria-checked`. Segmented controls are `role="radiogroup"`. Nav items use `aria-current="page"`.

---

## 10. Acceptance checklist

- [ ] No Save button. Every change persists right away, and the "Saved" toast shows.
- [ ] Changing port, listen or debug shows the restart bar. Undo puts the values back. Restart applies them and clears the bar.
- [ ] An invalid port shows the red state, isn't saved, and doesn't show the restart bar.
- [ ] Start/Stop/Restart work and stay in sync with the tray and the sidebar pill.
- [ ] `EADDRINUSE` shows the callout, and the fix button picks a free port and starts the server.
- [ ] With "Start the server on launch" off, the app launches with the server stopped.
- [ ] Zoom changes apply to the studio + settings windows and survive a relaunch. The kiosk is unaffected.
- [ ] The kiosk URL reflects the running config, and Copy/Open work.
- [ ] The agents toggle installs/removes hooks, with backups. Status chips are correct and Repair works.
- [ ] The update flow covers every state, including error. "What's new" opens the Changelog.
- [ ] The diagnostics table groups rows by prefix, filters to Notable, colours flagged and shrinking series, and refreshes live.
- [ ] Logs stream live with source, level and text filtering. Follow behaves correctly when the user scrolls.
- [ ] About shows real versions and paths, and Show / Copy system info work.
- [ ] The changelog renders the bundled `CHANGELOG.md`, the Read/Markdown switch works, and the version rail scrolls and highlights the release in view.
- [ ] Search finds every row in §8.
- [ ] Layout holds at 760px width and at 150% zoom with no wrapped buttons.
