# Settings & navigation IA: plan and decisions

This adapts `SPEC.md` (the Claude Design handoff) to the app. `IMPLEMENTATION_PLAN.md` gives the phase order. The control-by-control inventory with file:line references is in `IA_AUDIT.md` (phase 0). Progress is in `STATUS.md`.

The design did not see the code. Where it guesses a key, a component or a limit, the app's own wins. Stay faithful to the design's structure, labels, copy and behaviour everywhere else.

## Owner decisions (2026-10-21)

1. **Library keeps its side menu and sorting.**
   - The left collections sidebar stays, and so do the sort order and the Grid | Shelves view.
   - The spec's seven tabs (§10.4) become the sidebar's type collections, with the new names: Themes · Styles · Panels · Gauges · Media · Fonts · Canvases. Media keeps its sub-kinds (Images, Videos, Backgrounds, Icons, SVG templates) under it.
   - The smart collections stay in the sidebar as well (Recent, Unused, Large files, Duplicates, Suggested for theme), with "Used by ‹screen›" replacing the My library | Profile assets tabs.
   - ~~Gauges moves in as a collection, and its editor opens from an item.~~ Reversed by decision 18: Gauges is a rail item again.
   - The spec's header, hint lines, card grid and "Add files…" still apply.
2. **App settings are the real desktop settings.** The design's App tab content is illustrative. Settings › App ports `src/settings/` as it is:
   - every page (General, Server, Coding agents, Updates, Diagnostics, Logs, About, Changelog);
   - its keys, limits, callouts and restart bar.

   Only the shell around it follows the spec (sub-nav, browser notice). The design's sub-nav list is replaced by the real pages.
3. **The launch rule keeps `config.activeProfile`.** `"auto"` means Best fit, and an id means Always the same screen (see the profiles PLAN, decision 1). No `autoProfile` or `launchProfileId` key is added, which supersedes SPEC §8 and §11.2.
4. **Work happens on branch `feat/settings-ia`, with one commit per phase.**
5. **Settings › App is ported into the studio, and the window stays only as a rescue.**
   - The App tab is a lazy chunk that loads only when `isTauri()` is true. It keeps the `s-*` scoped CSS.
   - `STUDIO_PERMISSIONS` (`src-tauri/src/control.rs`) grows by exactly the commands the settings pages call.
   - Tray › Settings shows the main window and emits an event that the studio listens for to open Settings › App.
   - The separate Settings window opens only from the start page (`src-tauri/pages/start.html`), when the server is stopped, has failed, finds its port in use, or finds a foreign server. Nothing in the studio opens it.

## Decisions on the audit's findings (IA_AUDIT.md §5–6)

6. **Kiosk view** (renders the kiosk in this window) becomes the Live popover's header action, "Open kiosk view".
7. **The kiosk list and count are new server work.**
   - `server.mjs` keeps a registry of the open control streams: the profile (`?profile=`), the shown page and the remote address.
   - The control state reports it, and the status bar and Live read it.
   - Data API latency is measured on the client from the existing poll, which enables the `slow` state and "18 ms".
8. **There are no per-sensor display names.** §11 allows no new stores, so Data keeps the per-source display names it has today, and the point table shows the source name. The spec's "Display name (editable inline)" column edits the source's display name.
9. **The Style preset retirement is drop-only.** The preset values already sit in zone `settings`. The v10 migration drops the `preset` key and changes nothing else, so rendering stays identical. The built-in Styles Default / Dark / Light / Vivid / Mono carry only look keys; `tint` is dropped from them.
10. **The page font per screen** is a new optional `MonitorProfile.font`, resolved as profile then `general.font`. It is added to `PROFILE_KEYS`. It needs no migration.
11. **Export a page for InfoPanel** works on the page's canvas zones. The row is disabled, with its reason shown, when the page has none.
12. **Copy JSON copies exactly what the file contains** (the envelope).
13. **Page scope keeps the widget-style Colors section.** Only the color tokens and the background are two-level. In Theme's single Colors section, a page sees the widget-style colors, with the tokens shown as a LinkRow to its screen.
14. **Import sniffs content, not only the file extension.** A `.zip` is told apart by its manifest. The Tauri drag-and-drop handler is checked, and disabled if needed, so HTML5 drops reach the studio.
15. **Wording: the Studio is the app** (owner feedback round 1, 2026-10-21). "This browser" and "this PC" read wrong in the desktop app. The settings tabs read "every screen and kiosk", "editor preferences" and "startup, server and updates" (browser: "desktop app only"); the Studio group says it is saved with the Studio on this device, not in the dashboard. Elsewhere the copy says "the Studio", "the desktop app" or "the PC running InfoPanel Studio", the last only where the machine matters (server address, installed InfoPanel, sensors).
16. **An app notification alert is titled with its source app** (2026-10-21). The card and island title is the app's name and the body the notification's own title then body; the rule name stays in the rules list and History. Sensor alerts keep the rule name as the title. The `{app}` / `{title}` / `{body}` templates still work for text someone customised; only the default changed.
17. **A sensor alert holds several conditions** (2026-10-21). `source.conditions` is a list of `{ key, op, value, clearBelow? }` sharing the rule's `forSeconds`, cooldown, severity and outputs. The rule fires when any condition has held `forSeconds` (each is timed on its own), names the sensors that fired in its text, and clears when none is still on. Config v11 turns a rule's single `key` / `op` / `value` into a one-item list; the server reads the old shape too.
18. **Gauges is back on the rail** (2026-10-21). It sits after Library and opens the gauges list and editor as they were before phase 5b. Custom gauges still appear in Library's Gauges collection, and opening one there, or "Edit gauge…" from a zone or a canvas item, opens the Gauges view's editor. This reverses decision 1's "Gauges moves in as a collection, and its editor opens from an item".
19. **Library shows a Theme or Style in full, and edits it in place** (2026-10-21). A Theme's detail has its color swatches, corners, background, widget style, the screens using it, Apply to… (All screens, this screen, this page), Edit in Theme, Rename, Duplicate and Delete; a Style's has its keys, Apply to selection, Update from selection, Rename, Duplicate and Delete. The built-ins can be applied and duplicated. A saved Theme or Style is overwritten in place (same id and name) from a scope's look or the selected widget; Theme shows "Editing ‹name›" after "Edit in Theme" and an "Update ‹name›" button whenever the scope's look is, or started as, a saved Theme; the Style tab offers the same beside "Save as Style". Theme's Start from shows one "Current look" line and marks nothing as selected.
20. **A Library canvas opens its editor** (2026-10-21). Its primary action is "Edit canvas": the canvas editor on the first zone made from it (found by the source file's name and import time), else it comes in as a new screen and opens the editor on landing. "Add to this page…" and "Export…" stay secondary.

## Settings window and Screens (owner, 2026-10-22)

The owner hit a 30 fps cap set on one screen: below 60 fps the studio turns transitions off, so Smooth graphs stepped, and the cap sat at the bottom of a Screens view reachable only from the switcher. These decisions supersede decision 5 and SPEC §16's "Screens not on the rail".

21. **One Settings window holds everything that isn't design.** Pages: **App** (General, Server, Coding agents, Updates; desktop only), **Dashboard** (all-screens defaults: frame rate and animations, clock and date, kiosk behaviour, Reset everything…), **Studio** (editor preferences), then Diagnostics, Logs, About and Changelog. It opens from the rail's Settings (no longer a view), the tray's Settings and Update…, Help's "Open settings", the command palette and `Ctrl+,`. The in-studio Settings view and its App chunk go away. The window loads from the Studio's server (`/?settings`) so it shares the Studio's origin; `app/settings.html` (App pages only) stays as the rescue window from the start page.
22. **Dashboard settings apply instantly.** No Save button in Settings: each change is saved on the server (`PATCH /api/config/settings`) and reaches kiosks at once. The Studio takes the change into its working copy without disturbing its unsaved design edits, and its next save carries it.
23. **In a browser,** the rail's Settings opens the same Settings page in a new tab (one named tab). The App pages are absent there, with one line saying they live in the desktop app.
24. **Screens is a rail item** (after Theme), and a ⚙ button beside the screen switcher in the title bar opens Screens with the current screen selected. "Manage screens…" can stay in the switcher.
25. **Per-screen overrides stay, but are visible.** In Settings › Dashboard each default a screen can override (Frame-rate cap, Animations) lists the screens that override it ("MyDefault uses 30 fps") with Reset and a jump that opens Screens at that screen in the Studio window. Theme's Motion section warns that Smooth is off on a screen whose cap is below 60 fps or whose animations are reduced, with a link to it. The Frame-rate cap hint (Settings and Screens) says that below 60 fps transitions are off and graphs step at the data rate.
