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

### Removed
- The legacy widget modules; zones that still name one are migrated to its template on load.
