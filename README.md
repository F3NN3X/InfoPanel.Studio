# InfoPanel Studio

A studio for designing live sensor dashboards for [InfoPanel](https://github.com/habibrehmansg/infopanel), and the server that shows them. Build layouts from 54 widgets, panels and imported InfoPanel profiles, then show them full screen as a kiosk page — in InfoPanel's Web Page mode, a browser, or any screen on your network. The sensor data comes from InfoPanel's native Data API.

It started as a web dashboard and grew into a full editor: profiles and pages, a widget library with skins and a shared style system, a Dynamic Island, alerts, a canvas that imports and exports InfoPanel profiles, a gauge editor, and a Windows desktop app.

```
InfoPanel Data API (127.0.0.1:3921)  ◀──sensors / SSE──┐
                                                        │
Studio server (127.0.0.1:3922) ──studio, kiosk page, config──▶ desktop app / browser / InfoPanel web page profile
```

## Install

Download `InfoPanel Studio_<version>_x64-setup.exe` from [Releases](https://github.com/F3NN3X/InfoPanel.Studio/releases) and run it. It installs per user (no admin), runs the dashboard server inside the app, opens the studio in its own window (or in Edge or your browser), and keeps the server running from the tray so kiosk pages keep updating with the window closed; it can start at login. The installer is unsigned, so SmartScreen warns on first run. Settings and debug mode are in [docs/desktop/README.md](docs/desktop/README.md).

Your config lives in `%LOCALAPPDATA%\InfoPanel\Dashboard` and is shared by the desktop app and the server run from source, so switching between them keeps your layouts.

## Requirements

- InfoPanel with its Data API enabled (it provides `/api/sensors` and `/events`, by default on `http://127.0.0.1:3921`)
- To run from source: Node.js 20 or newer (builds the web app) and Rust stable (runs the server, `cargo`); the desktop app needs neither
- Optional: the `wavelink-plugin` for the Wave Link widget, the `yr-weather-plugin` for the weather forecast, and `InfoPanel.Notifications` 2.0+ for alerts on Windows notifications

## Run from source

```bash
npm install
npm run serve      # build, then start the server
```

Open http://127.0.0.1:3922. `npm start` runs the server (`ips-server`, built with `cargo run --release`, so the first start compiles it) and builds the web app first when `dist/` is missing.

On Windows you can double-click `start-dashboard.bat` instead. On the first run it installs the dependencies and builds the studio, then starts the server. Run `start-dashboard.bat rebuild` to build again after an update. It runs `src-tauri\target\release\ips-server.exe` when that is built, otherwise `cargo run --release -p ips-server`. The desktop app replaces it; it still works.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 with hot reload. Config and image-proxy requests are forwarded to the running server, so start that too. |
| `npm run build` | Type-checks and builds `dist/`. |
| `npm start` | Runs the server (`cargo run --release -p ips-server`) and serves `dist/` on port 3922. |
| `npm run serve` | Both of the above. |
| `npm run test:server` | Builds `ips-server` and runs the server suite (`tests/server`) against it. |
| `npm run desktop:build` | Builds the desktop installer (see [docs/desktop/README.md](docs/desktop/README.md)). |

The server listens on `127.0.0.1:3922`; set `PORT` or `HOST` to change it.

## Show it in InfoPanel

Create a desktop profile in InfoPanel, turn on **Web Page** mode, and set the URL to:

```
http://127.0.0.1:3922/?kiosk=1&profile=<profile id>
```

`?kiosk=1` shows the dashboard without the header or studio button. `?page=<page id>` pins one page of the profile (without it the kiosk follows the page the server is showing, or the first). `?profile=` picks one of the studio's profiles; without it, the profile pinned in the studio is shown, or — when that is "auto" — the one matching the window size.

## The studio

Click the wrench button (or open `/?studio=1`) to edit layouts. Changes save automatically, and the **Save** button (Ctrl+S) saves immediately. Every open kiosk page, including InfoPanel's web page profiles, picks up a saved change within about a second without reloading.

Every studio edit can be undone (Ctrl+Z, redo with Ctrl+Shift+Z), **Ctrl+K** opens a command palette for any action, and **?** lists the keyboard shortcuts. The studio is a title bar (the screen and page switcher, the palette, **Import**, **Export**, **Live**, **Save**), a labelled rail (**Design**, **Theme**, **Library**, **Data**, **Alerts & Island**, **Help**, **Settings**), the view itself and a status bar for the Data API, the server and the kiosks. **Design** has a left panel (**Layers**, **Add widget**), the canvas with a floating zoom bar, and the inspector beside it. Click a zone to select it (Shift- or Ctrl-click for several), drag to move or resize, drag widgets in from **Add widget**, and right-click for menus. The inspector's **Show / Style / Data / Behaviour** tabs, search and per-section **More** rows are driven by the widgets' settings, and a chip on each section says where its value comes from (**From All screens**, **From Screen**, **Custom here**, **Locked**) with a menu to reset it or edit it where it is set. On a narrow window the inspector floats over the canvas, and on a phone the rail is a bottom bar and the inspector a bottom sheet. The first time the studio opens with no saved config, a short setup connects the Data API, sizes the screen and builds a first page; **Help › Run setup again** repeats it. The [customization guide](docs/customization-guide.md) walks through the studio layout.

With nothing selected, the **Page** inspector shows the page (name, icon, what it customises). **Theme** is one editor for the look at every scope (**All screens**, a screen, a page): colours, typography, shape and spacing, surface, border, background and more, with a lock on each section so every widget follows it, and a list of the widgets and pages that do not follow. **Screens** (the switcher's **Manage screens…**) holds each screen's size, grid, page rotation and frame rate, and **Settings** holds what every screen shares (**Dashboard**: frame rate, clock, kiosk behaviour), the studio's own options (**Studio**) and, in the desktop app, the app settings (**App**). **Data** shows every data point, what uses it and the Data API connection.

Each screen can show a **Dynamic Island** (**Alerts & Island › Island**): a notch-style pill at the top centre with the time, the date or one live value. On kiosk pages it springs open for alerts with the Island display style, a Data API disconnect, widgets with **Send to island** on (Now Playing, Steam Friends, Wave Link, FPS Monitor, Achievements, Steam News, Drive Space, Network, Volume Mixer, Weather, Notifications, Timer), and the dashboard notices you switch on (page name, layout updated, plugin back, OBS on air, a calendar countdown, Claude Code and Codex sessions). Tap it to acknowledge or dismiss. See [the island in the customization guide](docs/customization-guide.md#dynamic-island).

## InfoPanel profiles, Library and Gauges

**Import** (title bar, or drop a file anywhere in the studio) is one door for every file: a config backup, a screen, an InfoPanel `.infopanel` profile, a gauge, a frame sequence, an image, a video or a font. It works out what the file is and asks only where it goes. An `.infopanel` comes in as a **canvas zone** that draws it as InfoPanel does, with live sensors; a remap step matches its sensors to your Data API. **Export** (title bar) backs up everything, exports a screen, writes a page's canvas back as a `.canvas.zip` or an `.infopanel`, or exports a gauge, and each row can copy its JSON. The **Library** keeps your images, fonts, gauges, panels, Themes and Styles and imported canvases on the server, and lets you drag items onto the canvas; its **Gauges** collection browses gauge presets and edits vector or image-sequence gauges, and a **Custom gauge** widget draws one live from any sensor. The import is described in [docs/infopanel-import/PLAN.md](docs/infopanel-import/PLAN.md) and [the architecture](docs/architecture.md#importing-and-exporting-an-infopanel-profile).

The studio config is stored by the server in `%LOCALAPPDATA%\InfoPanel\Dashboard\config.json`.

### Data API URL

The Dashboard inspector's **General** tab (with nothing selected) has a **Connection** section with a **Data API URL** setting, default `http://127.0.0.1:3921`. It is saved in the config, so kiosk pages follow it too, and changing it reconnects the live streams without a restart. **Test connection** checks that `{url}/api` answers, and **Open API index** opens the Data API's page listing every key.

### How the dashboard reads the Data API

- **Sensor values** come from filtered change streams, `{url}/events?prefix=<namespace>&interval=1000`: the full set under the prefix on connect, then only changed and removed keys. A page opens one stream per namespace its visible widgets read (`plugins.<plugin>.`, `libre.`, `system.`, …), folding the plugin streams into one `plugins.` stream past four, since browsers allow six connections per host. Each zone re-renders only when one of its own keys changes. Streams reconnect on their own, and a changed Data API URL drops the old values and reconnects.
- **Wave Link** has its own 100 ms stream, `{url}/events?prefix=plugins.wavelink-plugin.wavelink.&interval=100`, feeding the meters without React re-renders.
- **The studio's pickers** (the Data Explorer, the bind picker, a widget's source select) use `{url}/api/sources` for plugin, container and entry names and entry types, and one `{url}/api/sensors` snapshot for values, re-fetched when a picker opens.
- **Plugin images** (`/api/images/{pluginId}/{imageId}`) render as images; root-relative paths resolve against the Data API URL.

The weather forecast comes from the yr plugin (`plugins.yr-weather-plugin.<location>.forecast`). Saved layouts bound to the retired DataBridge forecast key are migrated automatically.

## Server endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | The dashboard (any unknown path also returns it) |
| GET / POST | `/api/config` | Read or save the studio config |
| GET | `/events/config` | Server-sent events: the config version on connect and after each save |
| GET | `/api/image-proxy?url=` | Fetches an image so the page can sample its colours (https anywhere, http only on loopback; images only, anything else is 406) |
| GET | `/api/health` | `{ app, version, configVersion }`, so a client can tell this server from another one on the port |
| GET | `/api/debug/stats` | Memory, SSE clients and timer-delay numbers; only with `DASHBOARD_DEBUG=1`, this machine only |
| GET / PUT | `/api/studio-prefs` | The studio's own preferences that follow you between the app window and a browser studio (Design preview data); this machine only, kept in `studio-prefs.json`, never in the config |
| GET / POST | `/api/assets` | List uploaded images and videos (`?unused=1`: those the saved config doesn't use), or upload one (header `X-Dashboard-Asset: 1`, loopback only unless `ALLOW_REMOTE_UPLOAD=1`) |
| GET / DELETE | `/api/assets/<id>` | Serve an uploaded file (immutable cache, `Range` support) or delete it |
| GET / POST / PUT / DELETE | `/api/library`, `/api/library/<id>` | My library items for the Library page (writes need header `X-Dashboard-Library: 1`) |
| GET | `/api/infopanel/installed`, `/api/infopanel/installed/<guid>/…` | Profiles of the InfoPanel installed on this machine, read-only; this machine only |
| GET | `/api/font-proxy?url=` | Fetches a Font Squirrel font for the Library's Get a font |

## Development and releases

Scripts, tests and the verification checklist are in [docs/development.md](docs/development.md). CI (`.github/workflows/ci.yml`) runs the checks a pull request's changes need, and `ci-ok` must pass before it merges; a nightly run (`.github/workflows/nightly.yml`) runs everything. Changes are recorded in [CHANGELOG.md](CHANGELOG.md). Pushing a tag `vX.Y.Z` that matches the `version` in `package.json` runs the release workflow (`.github/workflows/release.yml`): once CI has passed for that commit, it builds the InfoPanel Studio installer with `npm run desktop:build` on `windows-latest` and publishes a GitHub release with that version's changelog section as its notes.

## Documentation

The [docs index](docs/README.md) lists everything; the main entries:

- [Customization guide](docs/customization-guide.md) - the studio, the inspector, the Data Explorer, styling widgets, appearance and general settings
- [Widget catalog](docs/module-catalog.md) and [widget settings](docs/widget-settings.md)
- [System widget](docs/system-widget.md)
- [Architecture](docs/architecture.md) and [development](docs/development.md)
- [Desktop app](docs/desktop/README.md) (InfoPanel Studio) and its [design](docs/desktop/TAURI_PLAN.md)
- [Studio design](docs/redesign/README.md) (the redesign spec) and [zones and widgets](docs/studio-redesign-zones-widgets.md) (the grid model)
- [InfoPanel import](docs/infopanel-import/PLAN.md) - the plan, the studio [spec](docs/infopanel-import/studio/SPEC.md) and the open gaps are [GitHub issues](https://github.com/F3NN3X/InfoPanel.Studio/issues); `lab/infopanel/README.md` covers the lab (`npm run lab`).
- `tools/ip-import.cjs` imports an InfoPanel profile as a dashboard layout.
- `tools/gen-bg.mjs` regenerates the background image of the Glass and Frosted presets.
