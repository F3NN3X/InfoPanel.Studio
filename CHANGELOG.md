# Changelog

All notable changes to InfoPanel Studio. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). A release takes the section headed with its
version as its notes, so move **Unreleased** under a new `## [X.Y.Z] - YYYY-MM-DD` heading before tagging.

## [Unreleased]

### Changed
- The project is now **InfoPanel Studio** (formerly InfoPanel Dashboard): the repo, the package name, the page
  title and the desktop app's messages. Config, its folder (`%LOCALAPPDATA%\InfoPanel\Dashboard`), the browser
  storage key and the server's `/api/health` app id are unchanged, so existing setups keep working.
- A config export is saved as `infopanel-studio-config.json`; older exports still import.

### Added
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
