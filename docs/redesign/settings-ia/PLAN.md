# Settings & navigation IA: plan and decisions

This adapts `SPEC.md` (the Claude Design handoff) to the app. `IMPLEMENTATION_PLAN.md` gives the phase order. The control-by-control inventory with file:line references is in `IA_AUDIT.md` (phase 0). Progress is in `STATUS.md`.

The design did not see the code. Where it guesses a key, a component or a limit, the app's own wins. Stay faithful to the design's structure, labels, copy and behaviour everywhere else.

## Owner decisions (2026-10-21)

1. **Library keeps its side menu and sorting.**
   - The left collections sidebar stays, and so do the sort order and the Grid | Shelves view.
   - The spec's seven tabs (§10.4) become the sidebar's type collections, with the new names: Themes · Styles · Panels · Gauges · Media · Fonts · Canvases. Media keeps its sub-kinds (Images, Videos, Backgrounds, Icons, SVG templates) under it.
   - The smart collections stay in the sidebar as well (Recent, Unused, Large files, Duplicates, Suggested for theme), with "Used by ‹screen›" replacing the My library | Profile assets tabs.
   - Gauges moves in as a collection, and its editor opens from an item.
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
