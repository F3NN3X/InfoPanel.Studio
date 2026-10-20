# Help content audit

Verified against `main` at v1.3.0-beta.1. Code wins over the draft, the README and the guides.

Status: ✅ true as drafted. ✏️ changed to match the code. 🚧 not shipped, kept and marked coming soon. ➕ added coverage.
Evidence paths are relative to the repo root.

Notes that apply to every article:

- The UI mixes spellings. Prose uses US spelling; bold UI labels are quoted exactly (the **Behaviour** tab, **Customise a copy** in Gauges, **Check licence** for fonts).
- Every article is stamped `verified: 1.3.0-beta.1`.
- Registry lists are generated (`:::generated`), not hand-listed. Requested extra key: `presets.skins` (source `SKIN_PACKS` in `src/widgets/core/theme.ts`, fields name and description), because the built-in appearance presets no longer exist. `profiles.table` and `presets.appearance` are not used: there is one bundled blank profile, and appearance presets are gone.

## welcome

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| welcome | Sensor, studio, server, kiosk flow | ✅ | `README.md` | None |
| welcome | "Nothing is uploaded anywhere" | ✏️ | Fonts and plugins use the network (`font-requests.ts`) | Softened to say dashboards stay on this PC |
| welcome | Import, themes, agents bullets | ✅ | `src/components/infopanel/import/import-dialog.tsx` | None |
| welcome | Library and Gauges as bullets | ➕ | `left-rail.tsx` | Added |
| welcome | Help "?" on the rail, `F1`, tray Help | 🚧 | `left-rail.tsx` (no Help button), `src-tauri/src/tray.rs` (no Help item) | `:::soon` block |

## quickstart

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| quickstart | Status pill says Server running | ✅ | `src/settings` server status | None |
| quickstart | Pick a shipped profile such as "Kiosk strip 1920×550" | ✏️ | `src/lib/layout.ts` `firstProfile`: one blank "Main display" 1920×1080 | Rewritten around New profile, Design size and Use sample layout |
| quickstart | Drawer tabs Add/Layers/Profiles | ✏️ | `left-rail.tsx` | Now the left rail |
| quickstart | Appearance presets Dark, Glass, Neon | ✏️ | `SKIN_PACKS` in `src/widgets/core/theme.ts`; Appearance tab has a Skins gallery | Uses Skins |
| quickstart | InfoPanel step: "add a web or browser item" | ✏️ | `README.md`: Web Page mode on a desktop profile | Reworded |
| quickstart | Kiosk URL default `http://127.0.0.1:3922/?kiosk=1` | ✅ | Settings Server card | None |
| quickstart | Same port in InfoPanel and Settings | ✅ | Settings Server card | None |
| quickstart | Browse widgets, Use sample layout cards | ➕ | `canvas-cards.tsx` | Mentioned |

## concepts

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| concepts | Dashboard, profile, zone, widget, panel model | ✅ | `src/lib/layout.ts` | None |
| concepts | Auto picks the closest profile | ✏️ | `profiles-panel.tsx`: toggle **Auto-pick by window size** | Named the control |
| concepts | Zone holds widget, panel, canvas or nothing | ✅ | `zone-inspector-parts.tsx` | None |
| concepts | Widgets have settings in four tabs | ✅ | `inspector-categories.ts` | None |

## studio

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| studio | Drawer tabs Add, Layers, Profiles | ✏️ | `left-rail.tsx` | Replaced by a rail table of all buttons |
| studio | Add chips All, Layouts, My panels, System, Media, Network, Info, Other | ✏️ | `insert-panel.tsx` | Chip list corrected (in widgets) |
| studio | Inspector Side, Bottom or Auto | ✏️ | `studio-layout.ts`: docked at 1100 px or more, floating 640 to 1099, bottom sheet below 640; no setting | Rewritten as a width table |
| studio | `Ctrl+\` collapses the inspector | ✅ | `use-studio-shortcuts.ts` | Reworded to "inspector" |
| studio | Save dot and `Ctrl+S` | ✅ | `studio-top-bar.tsx` | None |
| studio | Undo/redo, one step per action | ✅ | `use-studio-shortcuts.ts` | Added `Ctrl+Shift+Z` |
| studio | Dynamic Island and Alerts rail buttons | ➕ | `left-rail.tsx` | Added to rail table |
| studio | Library, Gauges, Theme, Data sources pages | ➕ | `left-rail.tsx` | Added to rail table |
| studio | Top bar: profile menu, Auto (match window), Kiosk view, Import, Export, More actions | ➕ | `studio-top-bar.tsx` | Added |
| studio | Right-click menus for zones and canvas | ➕ | `zone-menu.ts` | Added |
| studio | Hand tool: Space+drag or middle-drag pans the canvas, Fit resets | ➕ | `use-studio-shortcuts.ts` Canvas group | Added |
| studio | Zoom bar: panel, grid, rulers, zoom, Fit | ➕ | `zoom-toolbar.tsx` | Added |
| studio | Page tabs, page menu, rotation settings | ➕ | `page-tabs.tsx`, `inspector/profile-sections.tsx` | Added |
| studio | "Design | Sources" switch | ✏️ | Gone from `studio-top-bar.tsx` | Not mentioned |
| studio | Offline indicator in the top bar | ➕ | `studio-top-bar.tsx` | Added |

## profiles

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| profiles | Size, grid, fit, gap, padding settings | ✅ | `inspector/profile-sections.tsx` | Now named by control |
| profiles | New profiles get 6 or 12 columns, 4 or 6 rows | ✅ | `lib/layout.ts` `newProfile` | None |
| profiles | Fill stretches; Scroll rows are 120 px | ✅ | `SCROLL_ROW_H` | None |
| profiles | Gap default 12 px | ✅ | `profile-sections.tsx` | Added the 0 to 200 range |
| profiles | Pin a profile in the kiosk URL | ✏️ | Pins use internal ids (`?profile=`) | Dropped |
| profiles | Five shipped profiles table | ✏️ | `lib/layout.ts` `firstProfile`: one blank profile | Removed; `profiles.table` not used |
| profiles | Sample 1920×550 | ✏️ | `sample-layout.ts` via Use sample layout | Rewritten as the sample layout |
| profiles | New profile, Profile actions menu, Auto-pick toggle | ➕ | `profiles-panel.tsx` | Added |
| profiles | Pages share the grid | ➕ | `page-tabs.tsx` | Added, links to studio |

## zones

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| zones | Drag to move, corner handle to resize | ✅ | `use-studio-shortcuts.ts` | None |
| zones | Min size "2×1 for most widgets, 4×2 for Web Page" | ✏️ | Min sizes are per module (`minCols/minRows`) | Dropped the numbers |
| zones | Fields Col, Row, W, H | ✏️ | `zone-inspector-parts.tsx`: COL, ROW, W, H | Case fixed |
| zones | Zone kinds table | ✅ | `zone-inspector-parts.tsx` | Inspector column updated to the v2 tabs |
| zones | Header hide, duplicate, remove | ✏️ | Hide, Duplicate, Delete | Labels fixed |
| zones | "Change" on the Widget section | ✏️ | **Widget type** row; **Change widget…** in the menu | Fixed |
| zones | Keyboard moves and multi-select | ➕ | `use-studio-shortcuts.ts` | Added |

## widgets

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| widgets | 17-row widget table | ✏️ | `src/widgets/registry/*.ts` has about 50 widgets | Replaced by `widgets.table` |
| widgets | Filter chips | ✏️ | `insert-panel.tsx` | Corrected |
| widgets | Small zones Auto, Full, Card, Dense | ✏️ | `inspector-model.ts`: options differ per widget | Noted |
| widgets | Density options | ➕ | `inspector-model.ts` | Added |
| widgets | Hide when idle | ✏️ | Removed everywhere (`docs/widget-settings.md:172`, `DECISIONS.md`) | Removed |
| widgets | Tint for Spotify, Media, Steam | ✏️ | Only Weather has it (`src/widgets/registry/b.ts:140`) | Weather only |

## panels

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| panels | Stack, Grid, Overlay and their options | ✅ | `panel-layout-section.tsx` | Overlay options named |
| panels | Fill or Hug; gap and padding 0 to 200 | ✅ | `panel-layout-section.tsx` | None |
| panels | Add button in the Widgets list | ✏️ | **+ Add panel widget…** | Fixed |
| panels | Row actions | ✏️ | `panel-layers.tsx`: Move up, Hide, Duplicate, Delete, Widget actions menu | Fixed |
| panels | Change kind keeps label, sensor, unit, color | ✅ | `widget-kind-menu.tsx` | None |
| panels | Code mode with Apply or `Ctrl+Enter` | ✅ | `panel-layout-section.tsx` | None |
| panels | "Save panel" in the panel menu | ✏️ | `panel-preset-tools.tsx`: **Save as panel preset…** | Fixed |

## panel-widgets

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| panel-widgets | Ten kinds | ✏️ | `inspector/item-model.ts`: 11 kinds, adds customGauge | Replaced by `panel-widgets.table` |
| panel-widgets | History 5 to 200 samples | ✅ | `item-model.ts` | None |
| panel-widgets | Placement per layout | ✅ | `item-model.ts` | Added Cell/Fixed in grid, Align self |
| panel-widgets | "Theme forces global style, fills take accent" note | ✏️ | Global-style forcing was replaced by locks | Removed |

## presets

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| presets | Layout starters (six) | ✅ | `src/lib/panel-starters.ts` | Now `presets.layouts` |
| presets | Panel presets | ✅ | `src/lib/panelPresets.ts` | Now `presets.panels` |
| presets | Profiles as a preset kind | ✏️ | One blank profile ships | Row removed |
| presets | Nine built-in appearance presets | ✏️ | Gone; Skins gallery with 14 skins (`SKIN_PACKS`) | Replaced with Skins and Saved looks; key `presets.skins` requested |
| presets | Replace the page background toggle | ✅ | Appearance tab | None |
| presets | "N widgets keep their own style" banner | ➕ | Appearance tab | Added |

## themes

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| themes | Default, dashboard, profile, widget layers | ✅ | `theme-model.ts` | None |
| themes | Customize and Use theme keep values | ✅ | `follow-bar.tsx` | None |
| themes | Lock in the profile theme | ✅ | `follow-bar.tsx`: Lock/Unlock, Lock all/Unlock all | Added page scope Customize/Use profile |
| themes | 19 color tokens | ✅ | `lib/theme.ts` ThemeTokens | None |
| themes | Surfaces table of four | ✏️ | Surfaces include Auto, Solid, Outline, Flat, Tinted, Aurora, Neon, Holo, Mesh, Carbon, Inset, Studio, Terminal | Table expanded |
| themes | Panels None, Card, Bordered | ✅ | Surface section | Name "Bordered card" |
| themes | Theme page and Reset to theme | ➕ | Theme page | Added |
| themes | Follow bar pill Theme, Custom, Locked | ➕ | `follow-bar.tsx` | Added |

## widget-settings

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| widget-settings | Four tabs Show, Style, Data, Behaviour | ✅ | `inspector-categories.ts` | Contents corrected |
| widget-settings | A tab with nothing is greyed out | ✏️ | Tabs absent for blank zone, multi-select; theme editor has no Show | Replaced by the nothing-selected and theme editor lines |
| widget-settings | Search, Changed, More | ✅ | `inspector/inspector-view.tsx` | Added Reset all |
| widget-settings | Setting dots | ✏️ | `source-dot.tsx`: five meanings | Rewritten |
| widget-settings | Pill Theme, Custom, Locked | ✅ | `follow-bar.tsx` | None |
| widget-settings | Thresholds Warning and Critical | ✅ | `thresholds-control.tsx` | Added Off and quantities |
| widget-settings | Units & format | ✏️ | Temperature, Speed units, Decimals, Clock | Fixed |
| widget-settings | "Use as theme", "Copy style", "Save as preset" | ✏️ | `style-tools.tsx`: **Use as global…**, copy/paste icons, **Apply preset**, **Save as preset…**, **Delete preset** | Fixed |
| widget-settings | Quick bar and pins | ➕ | `general-panel.tsx`, `inspector-model.ts` | Added |
| widget-settings | Palette roles | ✅ | `theme-model.ts` PALETTE_ROLES | None |

## background

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| background | Types Color, Gradient, Image, Video | ✅ | `background-editor.tsx` | Added None |
| background | Gradient linear or radial with stops | ✏️ | From, To, Angle | Fixed |
| background | Video loops muted | ✏️ | Loop and Muted are switches; Speed 0.5 to 2× | Fixed |
| background | Dim, tint, blur | ✅ | `background-editor.tsx` | Added Tint opacity |
| background | Inherit, Custom, None per profile | ✅ | `background-panel.tsx` | None |
| background | Videos pause when hidden; poster on reduced motion | ✅ | `page-background.tsx` | None |

## custom-css

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| custom-css | Where to write it | ✏️ | Style › Custom CSS under More; "Panel card › More › CSS" does not exist | Fixed |
| custom-css | Selectors and variables | ✅ | `widget-style.ts` | Added more hooks |
| custom-css | Scoped with `:scope` | ✅ | `widget-style.ts:262` | None |

## sensors

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| sensors | Data API default port 3921 | ✅ | `lib/data-api.ts` DEFAULT_API_BASE | None |
| sensors | Prefix claims and Other sensors | ✅ | `src/modules/index.ts`, `other-sensors.tsx` | Dropped internal prefixes |
| sensors | Picker search | ✏️ | Search field reads "Search 650+ data points…"; **Open data explorer**, **Done** | Fixed |
| sensors | "Open Connection with nothing selected" | ✏️ | Dashboard › General › Connection, **Test connection** | Fixed |
| sensors | Data sources page | ➕ | `sources-panel.tsx` | Added |

## agents

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| agents | Connect coding agents switch | ✅ | `src/settings` Coding agents | None |
| agents | Files `~/.claude/settings.json`, `~/.codex/hooks.json` | ✅ | `src-tauri/src/agents.rs:203-204` | None |
| agents | Status chips and Repair hooks | ✏️ | Chips: Hooks installed, Not connected, Needs repair, Agent not found | Listed all four |
| agents | Codex hooks approval | ➕ | `tools/agent-install.mjs:16` | Added |
| agents | Open backups | ➕ | Coding agents page | Added |

## import

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| import | Steps Source, Mode, Report, Remap, Save | ✏️ | `import-steps.tsx`: Source, Mode, Review, Sensors, Save | Fixed |
| import | Sources | ✅ | `import-dialog.tsx` | Named the three sources |
| import | Both mode shows two canvases side by side | ✏️ | "One canvas; each item keeps both forms" | Fixed |
| import | Review contents | ✅ | `import-steps.tsx` | Named the tiles |
| import | Save into a new profile or canvas zone | ✅ | `import-dialog.tsx` | Named the choices |
| import | Export .infopanel and Save stored form | ✏️ | `export-dialog.tsx`: **Stored form** and **.infopanel for InfoPanel**, button **Export** | Fixed |
| import | Export dialog toggles | ➕ | `export-dialog.tsx` | Added |

## canvas

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| canvas | Selecting, moving, nudging | ✅ | `edit/canvas-keys.ts` | None |
| canvas | Item tree hidden flag | ✅ | `edit/*` items tree | Added lock toggle |
| canvas | "Draw as a dashboard widget" | ✏️ | **Draw as** InfoPanel / Native | Fixed |
| canvas | Sensors Unbound, Live, Mock | ✅ | canvas toolbar | None |
| canvas | Compare overlay | ✅ | canvas toolbar | None |
| canvas | Toolbar, Edit items entry | ➕ | `edit/*` | Added |
| canvas | `Ctrl+Y` redo | ✏️ | Shortcut table shows `Ctrl+Shift+Z` | Fixed |

## remap

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| remap | Statuses Matched, Check, Unresolved, Unbound | ✏️ | `remap-panel.tsx`: Matched, Confirmed, Your choice, Check, Unresolved, Left unbound | Fixed |
| remap | Match order | ✏️ | ref, plugin key, name, then a suggestion | Fixed |
| remap | Confirm all | ✏️ | **Confirm all N suggestions** | Fixed |
| remap | Filters, Leave unbound, Reset to automatic | ➕ | `remap-panel.tsx` | Added |

## assets

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| assets | Add files, Replace, Remove | ✏️ | Profile assets tab: Add files, Replace by name…, per-row Replace, Save a copy to My library, Use, Remove | Fixed |
| assets | **Downscale** button | ✏️ | The chip is "Larger than drawn"; no label confirmed | Removed |
| assets | Optimise: type, quality, size cap, 5 % | ✅ | Optimise images dialog | Named the options |
| assets | Fonts: ttf, otf, ttc, zip | ✏️ | `.woff` and `.woff2` also accepted | Fixed |
| assets | Verdicts "check", "do not share" | ✏️ | `font-requests.ts:19`: May share, Check licence, Do not share | Fixed |
| assets | Where to find it | ✏️ | Library › Profile assets and Library › Fonts | Fixed |

## library

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| library | Tabs, search, Grid and Shelves, Import profile, Upload | ➕ | `library-page.tsx` | New article |
| library | Collections list | ➕ | `lib/my-library/model.ts` | Added |
| library | Right-click menu, Rename, Remove from library… | ➕ | `library-page.tsx` ContextMenu | Added |
| library | Remove confirmation and file cleanup | ➕ | `remove-item-dialog.tsx` | Added |
| library | Banner for uploaded files not in My library | ➕ | `loose-uploads.tsx`: the button adds files directly; there is no review list | Added without a review step |

## gauges

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| gauges | Image-sequence tools | ✅ | `frames-inspector.tsx`, `frame-strip.tsx` | Named the tools |
| gauges | Vector shapes and fills | ✅ | `lib/gauge-studio/parts.ts` | Added Zones/Thresholds and Wave, Shine, Bubbles |
| gauges | SVG templates, 256 KB | ✅ | gauge import | Added `--value` 0 to 1, `--percent` 0 to 100 |
| gauges | "Animations are kept" | ✏️ | Scripts and outside links are removed | Removed the claim |
| gauges | Bake | ✅ | `bake-bar.tsx`: **Bake frames** | Named states |
| gauges | Gauges page, tabs, three sections, detail pane | ➕ | `gauges-page.tsx`, `gauge-detail.tsx` | Added |
| gauges | Save as new and Save to library | ➕ | `editor-header.tsx` | Added |
| gauges | Right-click menu on gauges | 🚧 | No ContextMenu in `src/components/gauges` | `:::soon` block |

## island-alerts

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| island-alerts | Island settings | ➕ | `island-panel.tsx`, `inspector/island-section.tsx` | New article |
| island-alerts | Alerts panel | ➕ | `alerts-panel.tsx` | Added |

## kiosk

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| kiosk | Default URL | ✅ | Settings Server card | Now `defaults.table` |
| kiosk | Start, Stop, Restart in Settings and tray | ✏️ | **Start server**, **Stop**, **Restart**; tray `tray.rs`: Start server, Stop server, Restart server | Fixed |
| kiosk | Who can connect | ✅ | Server page | Added LAN warning and Allowed host names |
| kiosk | Port 1024 to 65535 | ✅ | Server page | None |
| kiosk | Restart bar | ✏️ | Amber bar with **Undo** and **Restart server** | Fixed |
| kiosk | Crash restarts, up to 3 a minute | ✅ | Server page | None |
| kiosk | Server states and stats | ➕ | Server page | Added |
| kiosk | Tray menu | ➕ | `tray.rs` | Added |

## startup

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| startup | Recommended values | ✅ | General page | None |
| startup | Defaults | ✏️ | All on by default, including Open the studio on launch | Noted |
| startup | App zoom 80 to 150 % | ✏️ | `src/settings/app.tsx`; studio keys zoom the canvas | Scoped to the Settings window |
| startup | Remember window size and position | ➕ | General page | Added |

## updates

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| updates | Channel Stable or Beta | ✅ | Updates page | None |
| updates | Check at startup, Download in the background | ✅ | Updates page | Labels fixed |
| updates | About 10 seconds | ✅ | Updates page text | None |
| updates | Update card buttons | ➕ | Updates page | Added |
| updates | Changelog page | ✅ | Settings Changelog | Added Read/Markdown toggle |

## problems

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| problems | Can't connect steps | ✅ | Settings | None |
| problems | "Use 3923" for a port in use | ✅ | Server error callout: **Use <next free port>** | Added the other error cases |
| problems | Widgets show dashes | ✅ | Data API | None |
| problems | Save dot | ✅ | `studio-top-bar.tsx` | None |
| problems | "Assets › Fonts" | ✏️ | Library › Fonts | Fixed |
| problems | Switch items back to Faithful | ✏️ | Canvas editor **Draw as** | Fixed |

## diagnostics

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| diagnostics | Debug mode samples every 30 seconds | ✅ | Diagnostics page | None |
| diagnostics | Sidecar is the sensor reader | ✏️ | The sidecar is the bundled Node server process | Fixed |
| diagnostics | Flag rule 80 % and 20 % | ✏️ | `src-tauri/src/debug.rs:122`: not tied to "the last hour" | Fixed |
| diagnostics | Logs: Server, Studio, Sensor sidecar | ✏️ | Sources Server, App, Studio | Fixed |
| diagnostics | Buttons and chips | ➕ | Diagnostics and Logs pages | Added |
| diagnostics | Copy system info, Report an issue | ✅ | About page | None |

## shortcuts

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| shortcuts | `Ctrl+K` "Search (Settings and Help)" | ✏️ | Studio `Ctrl+K` is the command palette; Settings sidebar search also `Ctrl+K` | Fixed |
| shortcuts | `Ctrl+Y` redo | ✅ | `use-studio-shortcuts.ts` | None |
| shortcuts | `Ctrl+\` "bottom dock" | ✏️ | Inspector | Fixed |
| shortcuts | Studio list | ✏️ | Generated from `SHORTCUT_GROUPS` | `shortcuts.keys` |
| shortcuts | Canvas editor keys | ✅ | `edit/canvas-keys.ts` | `Esc` left out: its effect is unverified |
| shortcuts | Hand tool | ➕ | `SHORTCUT_GROUPS` Canvas | Via generated list |
| shortcuts | `F1` opens Help | 🚧 | Not bound anywhere | Listed under the welcome `:::soon` block |

## glossary

| Article | Statement | Status | Evidence | Change made |
|---|---|---|---|---|
| glossary | Sidecar is the sensor reader | ✏️ | Bundled Node server process | Fixed |
| glossary | Small zones, Lock, Follow theme | ✅ | `inspector-model.ts`, `follow-bar.tsx` | None |
| glossary | Skin | ➕ | `SKIN_PACKS` | Added |

## Planned (coming soon)

None at the moment. The two `:::soon` items from the first pass, the Help entry points and the Gauges right-click menu, shipped with this PR and #83, and are now documented in `welcome` and `gauges`.

No whole article is marked `status: coming-soon`.

## Added coverage

- Hand tool (`Space` + drag or middle-drag), in `studio`.
- Library: right-click menu, Remove from library… with file cleanup, and the loose-uploads banner with its **Review…** list, in `library`.
- Gauges page right-click menu (Open in editor, Add to canvas, Duplicate, Export, Rename, Delete from library…), in `gauges`.
- Help entry points: the rail **?**, the tray **Help** and context-sensitive `F1`, in `welcome`.
- Gauges page and editor, Save as new, Save to library, in `gauges`.
- Settings window: sections, restart bar, start and stop, release channel, logs, About and Changelog, in `kiosk`, `startup`, `updates`, `diagnostics`.
- Widget settings v2: Show, Style, Data, Behaviour, thresholds, quick bar, in `widget-settings`.
- Dynamic Island and Alerts, in the new `island-alerts`.
- Page tabs and page rotation, left rail, top bar, right-click menus, in `studio`.
- Library as a new article (`library`).

## Unverifiable or open

- Whether `Esc` in the canvas item editor clears the selection or does something else.
- The label of the image-shrink action in Profile assets (the chip is "Larger than drawn").
- The repo README and the guides still describe the removed "Design | Sources" switch, appearance presets and "Hide when idle". They were not edited here.
