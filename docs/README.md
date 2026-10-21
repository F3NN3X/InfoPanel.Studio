# Documentation

The project overview, install steps and server endpoints are in the
[top-level README](../README.md). The documents here go deeper.

## Using the dashboard

- [Customization guide](customization-guide.md) - the studio layout (top bar, icon rail and left panel, canvas with a floating zoom bar, inspector Side 340 / Bottom 320 / Auto, sticky fit zoom), selecting zones, context menus, undo, keyboard shortcuts and the command palette, the inspector (Show / Style / Data / Behaviour tabs, sections with More rows, source dots, the Follow bar, search), the Data Explorer and binding, panels (layout starters, saved panels, stack / grid / overlay layouts, alignment, the panel item inspector, canvas selection, the Code view and panel CSS hooks), and making a widget look the way you want: scaling, alignment, colors, borders, custom CSS, presets, network speed units; and the dashboard-wide settings (the Dashboard inspector): appearance presets, the theme editor (all profiles, profile and page themes, per-section locks), theme colours (per profile too), the page background (image or video, uploads), the font catalog, general settings (font, clock and locale, motion, kiosk cursor) and the grid gap and padding; and the Dynamic Island (the notch at the top of a profile: idle options, alerts, widgets that send to it, dashboard notices, OBS and calendar links, taps and quiet hours).

## Widgets

- [Widget catalog](module-catalog.md) - every widget, its picker name, size, data keys and options.
- [Widget settings](widget-settings.md) - the setting schema, the standard block every modern widget shares, view presets, profile style, the panel settings and the audio views.
- [Widget settings coverage](widget-settings-coverage.md) - where each widget's own settings take effect: the grid spans, and the setting or data each one needs.
- [System widget](system-widget.md) - full reference for the System (modern) widget: settings, layouts, thresholds, drives and known limits.

## Internals

- [Architecture](architecture.md) - how data flows from the InfoPanel Data API to a zone, how a zone (and a custom panel) is rendered, how the config is stored and synced (with a table of where each setting comes from: app default, dashboard, profile, widget), how the theme, page background, grid spacing and general settings reach the page, and how the studio is put together (shell and layout, chrome tokens and fonts, canvas, rail and left panels, top bar, the registry-driven inspector and how to add a setting, the Data Explorer and binding, undo history and drag transactions, shortcuts, selection model, saved panels).
- [Kiosk performance](performance.md) - the Max FPS and Motion settings and their precedence, the shared ticker and what each animation runs on, the lite-motion CSS rule, the 1.3.0-beta.6 measurements (headless, headed Edge, InfoPanel's WebView2), open items, and how to measure without touching live data.
- [Studio redesign](redesign/README.md) - the spec the studio was rebuilt from (layout, inspector, Data Explorer, tokens), with [decisions](redesign/DECISIONS.md) and the [feature map](redesign/FEATURE_MAP.md).
- [Dynamic Island](redesign/island/PLAN.md) - the island's design and internals: decisions, the config model, the notice queue and bus, the widget source contract (how to make another widget send to the island) and the QA checklist.
- [Studio design: zones and widgets](studio-redesign-zones-widgets.md) - the grid model that still holds (zones, no overlap, fluid fill, config v2); the rest is superseded by the redesign.

- [InfoPanel import](infopanel-import/PLAN.md) - the plan and phase status (lab L1–L14, app A1–A8, all done), the Library and Gauges [studio spec](infopanel-import/studio/SPEC.md) and the research notes (format, fonts, corpus). The architecture chapters on the canvas zone, the Import / Export dialogs, the Library and Gauges pages and the library routes are in [architecture](architecture.md); the lab is `lab/infopanel/README.md`.

## Development

- [Desktop app](desktop/README.md) - InfoPanel Studio, the Tauri installer that runs the server itself: building it, where its settings and logs live, taking over an old server, the window, debug mode and testing without touching the live setup. [TAURI_PLAN.md](desktop/TAURI_PLAN.md) holds the design, decisions and IPC contract.
- [Development](development.md) - scripts (including the InfoPanel lab), running dev and the standalone server, tests, typecheck, CI and the release workflow, adding a widget, and a verification checklist.
- `tools/ip-import.cjs` imports an InfoPanel profile as a dashboard layout (see the header of the file for usage).
- `tools/gen-bg.mjs` regenerates `public/assets/bg/aurora.png`, the page background of the Glass and Frosted appearance presets (`node tools/gen-bg.mjs`).
