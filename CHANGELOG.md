# Changelog

All notable changes to InfoPanel Studio. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). A release takes the section headed with its
version as its notes, so move **Unreleased** under a new `## [X.Y.Z] - YYYY-MM-DD` heading before tagging.

## [Unreleased]

### Added
- The `.canvas.zip` font licence review offers "Swap for <font>" for a font that may not be shared: same-category
  fonts from My library replace it in the exported package only, and the package carries the alternative's file (#41).
- Library › Fonts reads the licence column from the font file itself (name table, as declared: "OFL (declared)" or the
  declared text in a tooltip) for Data API and supplied fonts, not only those also in My library (#41).
- Import › Save has "Keep InfoPanel's screenshot for Compare" (off by default): the chosen screenshot is stored as an
  asset and the canvas remembers it, so Compare starts on it and "Change screenshot…" still picks another. The
  `.canvas.zip` carries neither the screenshot nor its id, and a screenshot whose file is gone falls back to choosing one (#43).

- Image-sequence gauges export from the Gauges page as `<name>.gauge-frames.zip` (PNG frames plus a `manifest.json`)
  and import back with "Import frames (.zip)", validated and capped like the other importers (#49).

### Changed
- The studio spec now says `.gauge.json` is the lab's `VectorGauge` shape, and the concept's `GaugeRender` object is
  internal (#49).
- Component tests run in happy-dom per file (`// @vitest-environment happy-dom`, with a `setViewport` helper), and the
  Gauges page and the narrow-layout sheet now have them (#50).

### Fixed
- The canvas editor at narrow widths: when the toolbar no longer fits, the sensor source and Compare move into a "More"
  menu instead of being clipped, and the inspector docks, floats or becomes a sheet at the studio's own viewport
  breakpoints, so opening it no longer flips the mode back (#45).
- Library copies made on the Page background or inside the canvas editor now record the real profile, so "jump to
  copy" reaches them; older copies recorded without one are still listed but can't be jumped to (#46, part A: G12).
- Dragging a Library image, video or gauge over a canvas zone no longer shows the red "No room" grid ghost, since the
  zone takes the drop as an item (#46, part A: G14).
- After an import lands, the canvas editor opens on the new zone, as the spec says (#43).
- Opening the Library no longer closes the canvas editor: it stays mounted but hidden (keys off, size kept) and
  returns, with its selection and undo history, when the Library closes, so a Library drag can land in it (#43).
- A font added through Get a font is uploaded once, not once for the canvas and again for My library (#41).
- Exports (`.canvas.zip`, `.infopanel`) save through a native Save As dialog in the desktop app instead of a silent
  browser download; cancelling the dialog does nothing (#42).
- Profile import's XML errors for a bad entity point at its `&`, in text and in attribute values, and a character
  reference beyond Unicode is reported instead of crashing the parser (#52).
- The server accepts `PORT=0` (a free port, logged on start); its test uses it, so it no longer races another process
  for the port it picked (#51).
- Imported canvases no longer count against the config's 5 MB cap, so several imports save again: each is stored as
  its own file under `canvases/` in the data folder and the config holds a reference. An existing config moves its
  canvases on the studio's first save; older builds then refuse to overwrite it (#44).

## [1.1.0] - 2026-10-19

### Changed
- The project is now **InfoPanel Studio** (formerly InfoPanel Dashboard): the repo, the package name, the page
  title and the desktop app's messages. Config, its folder (`%LOCALAPPDATA%\InfoPanel\Dashboard`), the browser
  storage key and the server's `/api/health` app id are unchanged, so existing setups keep working.
- A config export is saved as `infopanel-studio-config.json`; older exports still import.
- The island shows the agent activity beside the waiting badge (`15:17 · Codex · api · ● 1`) instead of dropping it;
  the activity text shortens first when the pill is narrow, the time and the badge never do (#17).

### Added
- In-app updates: the desktop app checks GitHub releases shortly after it starts (a setting turns it off), the tray
  offers `Update to vX.Y.Z…`, and Settings has an Updates card to check now and install. Installing stops the
  app's server, runs the installer and restarts the app. Updates are verified against the project's updater key (#29).
- Coding Agents shows each session's cost and model, dims limits the agent has not reported lately and resets
  expired windows, projects when a window would fill at its pace so far, and this week's tokens by model and
  project with today's by type (#18).
- Coding Agents reads per-project and per-model token shares and lists live Claude Code sessions from
  `~/.claude/sessions`, all from local files.
- CI builds and tests every pull request and `main`; pushing a `vX.Y.Z` tag builds the Windows installer and
  publishes a GitHub release.
- InfoPanel profile import: a canvas zone that draws `.infopanel` profiles as InfoPanel does, with live sensors,
  a sensor remap step, and export back to `.canvas.zip` or `.infopanel`.
- Canvas zone editor with an item tree, a toolbar and an InfoPanel inspector.
- Library page: My library on the server (images, fonts, gauges, panels, canvases), profile assets and fonts,
  Get a font, and drag to the canvas.
- Gauges page with a gauge editor, image-sequence tools and a **Custom gauge** widget.
- Desktop app (InfoPanel Studio): a Tauri installer with its own Node and server, a tray, start at login and a
  debug mode.
- Studio logo and favicon; resizable left panel; widget editing with a quick bar, one-column inspector and a
  bottom sheet on narrow screens.
- Coding Agents widget (rings, heatmap, wide layouts) with Claude Code and Codex session status.
- Dynamic Island on profiles, with more sources, dashboard notices, look options and a Timer widget.
- Steam Friends widget; summary card, content-aware widget fit and drive labels.
- Network speed units, smooth graphs, show title, skin gallery, surface and theme swatches, profile radius.
- Alerts for sensor thresholds and Windows notifications.
- Profile pages, a control channel and kiosk page navigation.
- The studio redesign: rail, top bar, tabbed inspector, the template widget library and a real audio visualiser;
  panels on the style system with a visual panel editor; the System widget and shared style options.
- A standalone server, the Data API URL setting, and Wave Link and forecast data from the native InfoPanel
  plugins.

### Fixed
- The image proxy follows redirects by hand and checks every hop, so an https image URL can no longer
  redirect it to plain http on the LAN or a metadata address (#26).
- Coding Agents draws its full layout in 2x2 and 2x4 cells instead of only the summary card (#21).
- Coding Agents rings beside the sessions keep their reset times, in a line under each ring when there is no room
  beside them (#22).
- Token usage appears as soon as the server's first scan finishes, instead of up to 30 seconds after a restart.
- "Use it for this session" is only offered for, and only adopts, a node.exe owned by the current user, so
  another user on the machine cannot squat the port and be loaded with the studio's IPC capability (#27).

### Removed
- The legacy widget modules; zones that still name one are migrated to its template on load.
