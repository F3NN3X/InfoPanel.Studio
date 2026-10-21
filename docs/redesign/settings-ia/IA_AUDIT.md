# Settings & navigation IA: audit (Implementation plan, phase 0)

Read-only audit of the code on `feat/settings-ia` (base `e2749b4`, config v9). Paths are relative to the repo root.
`docs/settings-inventory.md` is the key/scope inventory; a `†` after a line number means the line comes from its §9
and was not re-read here. Scope codes: **G** `DashboardConfig` global, **P** `MonitorProfile` (screen), **Pg**
`ProfilePage`, **Z** zone (`Placement`), **S** desktop `settings.json`, **L** browser `localStorage`, **R** live
server state (`control.json` / runtime), **C** no store (code or UI only). "Screen" = profile, "Dashboard" = G.

## Findings that change the spec (read first)

1. **Retiring the Settings window removes the recovery path.** `src-tauri/pages/start.html:24,46,53,62` (with
   `start.js:74`) shows "Open settings" when the server is stopped, failed, the port is taken, a foreign server
   runs, or it is restarting. That is when the studio, which the server serves, cannot load. Settings › App inside
   the studio is unreachable then. Keep a window (or a start-page port form) for the server-down states.
2. **The studio webview is Tauri, but with a small permission set.** Settings › App cannot port as is: the studio
   origin lacks `get_settings`, `set_setting`, `server_status`, `update_state` and about 25 other commands (§5.3).
3. **Settings is a separate build.** `src/settings/` builds with `vite.settings.config.ts` into
   `src-tauri/pages/app/settings.html`, served by the app, not by the Node server (`package.json:14`). Its
   `ipc.ts:1` imports `@tauri-apps/api` statically, and `src/lib/desktop.ts:2-5` forbids that in the studio bundle.
   The App tab has to be a lazy `isTauri()`-guarded chunk and needs the `s-*` tokens (`settings.css`) scoped.
4. **The "Kiosk view" button is not Live.** `studio-top-bar.tsx:309` → `App.tsx:362` `exitStudio` renders the
   kiosk inside this window (desktop: `kioskWindow`, `desktop.ts:53`). SPEC §13 maps it to "Live › kiosk list",
   which is the remote kiosks. It needs its own home (§2 flags).
5. **Kiosk count, list and IP do not exist.** `ControlState` (`src/lib/control.ts:18`) has no clients. The server
   only counts SSE connections in aggregate (`server/debug.mjs:32`, `serverStats()` loopback-only). Needs new work
   in `server.mjs:200` `handleControlEvents` (§5.2).
6. **`preset` retirement is not a copy.** The zone's `preset` is `standard-settings.ts:272` (default / dark / light /
   vivid / mono). Its `applies` bundle (`surface`, `tint`, `accent`) is already persisted into `settings` when it is
   picked (`setting-control.tsx:158-160`). `tint` is a widget-own key (Weather `registry/b.ts:140`, NowPlaying), not
   one of the 25 `PROFILE_STYLE_KEYS`, so a built-in Style cannot carry it (§6).
7. **Page scope cannot disable Colors without a loss.** A page can already set the widget-style `colors` and
   `palette` sections (`ProfilePage.widgetTheme.follow`, `theme-model.ts:56`). Only the color tokens are two-level
   (`resolveTheme`, `theme.ts:254`). Spec §7.2 disables the merged Colors section at Page scope.
8. **Export "a page for InfoPanel" does not exist.** Export works on an imported canvas zone only
   (`infopanel-io.tsx:95`, `export-dialog.tsx`, top bar disabled without one, `studio-top-bar.tsx:329`).
9. **"Copy JSON copies the same payload as the file" is false today.** `copyProfileJson` (`config-file.ts:8`) copies
   the bare profile; the file is an envelope with `type`, `version`, `configVersion` (`profile-file.ts:20`).

---

## 1. Component map

| Surface | File(s) |
|---|---|
| Top bar | `src/components/studio/studio-top-bar.tsx:263` `StudioTopBar` (switcher `:81`, ⋯ `MoreMenu :144`, Kiosk view `:309`, Import `:317`, Export `:325`, Save `:334`); window caption `window-controls.tsx:34`; mounted `studio-view.tsx:647` (48 px, `h-12` at `:271`) |
| ⋯ menu | `studio-top-bar.tsx:144-251` (items `:209-243`); `ResetConfigDialog` `reset-config-dialog.tsx:15` |
| Rail | `left-rail.tsx:52` `RAIL` (Profiles, Theme / Layers, Widgets / Gauges, Library / Alerts, Dynamic Island / Data sources), bottom Help `:165`, Shortcuts `:166`, Settings (Tauri only) `:167`; 52 px `:146`; click logic `use-studio-ui.ts:143` `onRail`; mode state `:22` (`StudioMode` `studio-top-bar.tsx:34`); `Drawer` / `RailItem` `left-rail.tsx:48-49` |
| Drawers | host `studio-drawers.tsx:27`: Add `insert-panel.tsx:313`, Layers `layers-panel.tsx:30`, Profiles `profiles-panel.tsx:337`, Island `island-panel.tsx:34`, Alerts `alerts-panel.tsx:156`; width `left-rail.tsx:8-9` (280-440) |
| Page tabs | `page-tabs.tsx:187` `PageTabs` (menu `pageMenuEntries :61`, kiosk marker `:301`, `RotateToggle :338` → `rotate-toggle.tsx:26`); mounted `studio-view.tsx:482` |
| Profile inspector (nothing selected) | `document-inspector.tsx:112` `DocumentInspector` / `DocumentSheet :116`; registry `inspector-model.ts:389` `dashboardSections`, `DASHBOARD_TABS :60`; Layout `inspector/profile-layout.tsx:87` (Screen), `:240` (Grid); Look `inspector/profile-look.tsx:85` (Theme), `:174` (Widget style), `:235` (Background); Behaviour `inspector/profile-behaviour.tsx:158` (Pages), `:224` (Performance), `:284` (Clock), `:320` (Display), Island `inspector/island-section.tsx:198`, Studio prefs inline `document-inspector.tsx:~312`, Connection `data-api-panel.tsx:15`; header `inspector/profile-header.tsx:6`; footer `inspector/app-settings-footer.tsx:4`; All/This switch `inspector/profile-scope.ts:30-102` |
| Zone inspector | `zone-inspector.tsx:150` (Zone frame `:274-283` → `zone-design-section.tsx`; style tools `:298` → `style-tools.tsx:63`); header `zone-inspector-parts.tsx:~250`; tabs/search `inspector/inspector-view.tsx`; Follow bars `inspector/follow-bar.tsx:84`; wrapper `studio-inspector.tsx:41` (mounted `studio-view.tsx:296`); panel widgets `item-inspector.tsx`; multi `inspector/multi-inspector.tsx` |
| Rail Theme page | `theme-editor.tsx:85` `ThemeEditor` (scopes `:59`, chips `:52`); data `theme-editor-model.ts` (`ThemeScope :42`); rows `theme-editor-settings.ts`; mounted `studio-view.tsx:602` |
| Library | `src/components/library/library-page.tsx` (tabs My library / Profile assets `:85`, header Import profile `:384`, Upload `:392`); sidebar `library-views.tsx:55` `LibrarySidebar`; collections `src/lib/my-library/model.ts:112-167`; items `use-my-library.ts`; mounted `studio-view.tsx:558` |
| Gauges | `src/components/gauges/gauges-page.tsx` (editor `gauge-editor.tsx`, header `editor-header.tsx`, files `gauge-files.tsx`); mounted `studio-view.tsx:590` |
| Data sources | `sources-panel.tsx:66` + `explorer/*` (`group-summary.tsx:75`, `source-tree.tsx:67-91`, `point-table.tsx`); Connection `data-api-panel.tsx:15` |
| Alerts | `alerts-panel.tsx:156` (sections Active now `:218`, History `:221`, Rules `:224`), `alerts-defaults.tsx:24`, `alerts-live.tsx`, `alerts-rule-editor.tsx:90`, `alerts-model.ts` |
| Island | `island-panel.tsx:34` (Widgets `:60`, Alert rules `:111`), rows `inspector/island-section.tsx:198`, notices' OBS / calendar `inspector/integrations-card.tsx` (`island-section.tsx:378`) |
| Import InfoPanel dialog | `src/components/infopanel/import/import-dialog.tsx` (`ImportDialog :498`, `SourceStep :80`), `import-steps.tsx` (Mode, Review, Save: `Dest :21`, "Lands in" `:304`), `use-import.ts`; opened by `studio/infopanel-io.tsx:26` `useInfoPanelIo` (`openImport :91`) |
| Export dialog | `src/components/infopanel/export-dialog.tsx` (stored `.canvas.zip` or `.infopanel`); `infopanel-io.tsx:95` `openExport` |
| Desktop Settings window | `src/settings/` (`app.tsx` pages, `shell.tsx` sidebar, `store.tsx`, `ipc.ts`, `sections/*`, `model/*`); entry `main.tsx`, `settings.html`, `vite.settings.config.ts`; backend `src-tauri/src/windows.rs:308` `show_settings`, `commands.rs:598` `open_settings`, `settings.rs` |
| Tray | `src-tauri/src/tray.rs:44` `create`; "Settings" and "Check for updates" → `windows::show_settings(app, None)` `:88`; Open studio / kiosk / Help / Start-Stop / Restart / Quit |
| Command palette | registry `studio/commands.ts:343` `buildCommands` (`generalCommands :120`, `pageCommands :166`, `styleCommands :214`, `settingCommands :264`); UI `command-palette.tsx:96`; runner `use-studio-commands.ts:46` |
| Help window opening | `src/lib/desktop.ts:39` `openHelp` (Tauri: `open_help`; browser: tab `help.html`); F1 `studio-view.tsx:184` + `help/context.ts:15` `studioHelpTarget`; window `windows.rs:317` `show_help`, `commands.rs:604`; Help app `src/help/*` (its `:::open settings/<section>` links call `ipc.openSettings`: `help/env.tsx:17`, `help/ui/blocks.tsx:143`) |
| Kiosk control API (client) | `src/lib/control.ts:65` `postControl`, `:88` `useControl` (SSE `/events/control`), `:160` `islandEffective`; consumers `studio-view.tsx:125,499-505`, `alerts-live.tsx:55` |
| Kiosk control API (server) | `server.mjs:166` `handleControl` (`POST /api/control/<page|profile|rotate|touch|alert|kiosk>`), `:200` `handleControlEvents`, `server/control.mjs:115` `reduce`, `:301` `createControl`, guard `server/request-guard.mjs:98` `controlWriteRefusal` |

## 2. Spec §13 rows (before → after)

Every row of §13, in order. "Key · scope" is the store the control writes today.

### Top bar

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Profile name / Edit profile switcher | `studio-top-bar.tsx:81-131` (name opens Profiles `:93`, chevron menu `:99`) | `studio.pinnedProfile` L, the *edited* profile (`pinned-profile.ts:7,30`), not `activeProfile` | Switcher → Manage screens… (still edits, never sets the launch rule) |
| Undo, Redo, Save | `:290-344`; `ui.handleSave` `use-studio-ui.ts:~118` | history C; Save pushes G to `/api/config` | Stay. "Saved" flash `:343` and the unsaved dot `:340` map to the status bar Save state |
| Kiosk view | `:309` → `App.tsx:362` | C (renders the kiosk in this window; desktop `kioskWindow`) | **Flag A1.** Not Live's remote kiosks. Keep a button in the title bar or Live ("Preview here") |
| Import (InfoPanel) | `:317` → `io.openImport("new")` `infopanel-io.tsx:91` | none (dialog) | Import door |
| Export (InfoPanel canvas) | `:325`, off without a canvas zone (`io.canExport`) | none | Export sheet row 3 (see finding 8) |
| ⋯ Export config | `:209` → `config-file.ts:21` `exportConfigFile` | G | Export › Back up everything |
| ⋯ Import config… / Import InfoPanel profile… | `:212` → `config-file.ts:82`; `:215` → `openImport("new")` | G / none | Import door |
| ⋯ Export InfoPanel canvas… | `:218` → `io.openExport` | none | Export sheet |
| ⋯ Copy profile JSON | `:221`, `copyProfile :177` | P (bare, no envelope) | Export rows › Copy JSON (payload decision: §6) |
| ⋯ Command palette | `:225` → `ui.setPaletteOpen` | C | Title bar command entry |
| ⋯ Keyboard shortcuts | `:230` → `shortcuts-dialog.tsx:12`; also rail `left-rail.tsx:166`, canvas menu `zone-menu.ts:116` | C | Help › Shortcuts and `?` (the rail and canvas-menu entries must go too) |
| ⋯ Reset everything… | `:236` → `reset-config-dialog.tsx:15`; `studio-view.tsx:666` `setConfig(defaultConfig())` | G (whole config; one undo step) | Settings › Dashboard › Danger zone (dialog offers export → "Back up first") |
| ⋯ menu itself | `:144` | | Retired. Not in §13: build id `:240` (`BUILD_ID`), phone Undo/Redo `:200`. Give them Settings › App › About (desktop) / Settings › Studio footer (browser), and the phone ⋯ per §3.5 |

### Rail

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Profiles | `left-rail.tsx:54`, drawer `profiles-panel.tsx:337` | | Switcher + Screens (Screens has no rail slot, §16-1) |
| Theme | `:55`, `theme-editor.tsx:85` | | Theme |
| Layers, Widgets | `:58-59`, `layers-panel.tsx:30`, `insert-panel.tsx:313` | `studio.drawer`, `studio.drawerWidth` L | Design › left panel. Both L keys retire; spec's 232 px fixed panel vs today's 280-440 resizable |
| Gauges | `:62`, `gauges-page.tsx` | | Library › Gauges |
| Library | `:63` | | Library |
| Alerts, Dynamic Island | `:66-67` | | Alerts & Island |
| Data sources | `:69` (toggles `ui.toggleSources`) | | Data |
| Help, Shortcuts | `:165-166` | | Help (Help opens at the article for the view) |
| Settings (desktop only) | `:167` → `openSettings()` | | Settings, both platforms |

### Zoom bar and page tabs

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Grid, rulers, zoom, Fit, left-panel toggle | `zoom-toolbar.tsx:38`; `use-studio-ui.ts` | `studio.grid`, `studio.rulers` L (`:39-40`†), `studio.zoom` L (`zoom-pref.ts:2`†) | Stay. Spec's Settings › Studio repeats Default zoom / grid / rulers: same keys, so make one a LinkRow |
| Resolution button | `zoom-toolbar.tsx:93` → `studio-view.tsx:195` `openProfileSettings` | | Link → Screens |
| + Add page | `page-tabs.tsx` `onAdd` → `use-studio-mutations.ts` `addNewPage` | P `pages` | Stays |
| Rename, Icon…, Duplicate, Delete | `pageMenuEntries :61`; `use-studio-mutations.ts:331,339-340` | Pg `name`, `icon`; P `pages` | Page inspector; tab right-click keeps shortcuts, double-click renames |
| Theme… | `page-tabs.tsx:65` → `ui.openTheme({kind:"page"})` `studio-view.tsx:492` | Pg `widgetTheme` | Page inspector › Edit in Theme |
| Show on kiosk | `page-tabs.tsx:77` → `studio-view.tsx:499` | R `page` `{profile,page}` | Live |
| Cycling Play/Pause, Back to the saved setting | `rotate-toggle.tsx:26`; `studio-view.tsx:500-505` | R `rotate` `on|off|toggle|saved` (`server/control.mjs:134`) | Live › Rotation |
| Kiosk-page marker | `page-tabs.tsx:301` (`kioskPage` from `control.profiles[id].page`) | R | Stays; opens Live |
| *(not in §13)* tab drag reorder | `page-tabs.tsx` `dropIndex :55`, `onMove` | P `pages` | Closest: Screens › Pages order. Spec says Screens owns order, but the tab drag exists. Decide: keep as the same writer or retire |

### Profiles drawer

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Import | `profiles-panel.tsx:375`, hidden input `:473` → `profile-file.ts:157` | P (new) | Import door |
| New, cards, Opens now / On launch | `:~337-460`, `LaunchTag :427`, `profile-preview.tsx` | P list; best fit `studio-view.tsx:348` `resolveProfile({…activeProfile:"auto"})` | Screens |
| Card ⋯ Rename, Duplicate, Export profile, Delete | `RowMenu :69-145`; `DeleteDialog :158` | P | Screen card ⋯ (Rename today hands the cursor to the inspector Name field: `studio-view.tsx:201`) |
| Always open this one | `:125`, `use-studio-mutations.ts:405` `activateProfile` | `activeProfile` G (id) | Screens › When the app opens (no new key: owner decision 3) |
| Copy profile JSON | `:134-140` | P | Export › Copy JSON |
| Inline pages + Add page | `profiles-panel.tsx` (page rows via `onSelectPage`, `onAddPage`) | P `pages` | Screens › Pages |
| When the app opens | `LaunchChoice :299`, footer | `activeProfile` G (`"auto"` or id) | Screens |
| *(not in §13)* Pin for editing / card click | `profiles-panel.tsx` `onSelectProfile` | `studio.pinnedProfile` L | Screen card click selects the edited screen; same as the switcher |

### Profile inspector › Layout

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Screen: Name, Design size, Width, Height, Use this window's size, Fill / Scroll | `profile-layout.tsx:87` `ScreenSection` (Name `:46`, size `:18`) | P `name`, `width`, `height`, `fit` | Screens detail › SIZE & FIT |
| Grid: Columns, Rows, Gap, Edge padding | `profile-layout.tsx:240` `GridSection` (`Stepper :177`, `SpacingField :199`) | P `cols`, `rows`, `gap`, `padding` (refusal when a zone falls outside) | Screens detail › GRID |

### Profile inspector › Look

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Theme tokens, palettes | `profile-look.tsx:85` `ThemeBody` → `theme-panel.tsx:86` | `theme` G / P (`use-document-props.ts:50-57,82-83`†); presets `THEME_PRESETS` `theme.ts:68`† | Theme › Colors · Start from |
| Corners | `ThemeBody` radius slider | `radius` G / P (`profile-scope.ts:79` `withRadius`) | Theme › Shape & spacing. Distinct from the widget `radius` (px, themed `spacing`) |
| Font [global] | `ThemeBody` `font`; `document-inspector.tsx:234-235` | `general.font` G (always global) | Theme › Typography (model change §11.1) |
| Skins | `StyleBody` → `skin-gallery.tsx:34` | `style.skin` G / `widgetTheme.values.skin` P | Theme › Start from |
| Saved looks; Save current look as preset | `appearance-gallery.tsx:187`; `use-appearance-presets.ts:50` | `appearancePresets` G (`appearance-presets.ts`) | Library › Themes (**no such Library kind yet**: §5); Save as Theme |
| Replace the page background | `appearance-gallery.tsx` toggle | C (apply option) | Apply a theme › Include background (semantics differ: today "off" still sets a bg where there is none) |
| Surface, Background opacity, Background blur | `StyleBody` → `surface-picker.tsx`; keys `surface`, `surfaceOpacity`, `blur` | `style` G / P `widgetTheme.values` (`appearance-actions.ts:40`, `studio-actions.ts:448`) | Theme › Surface & effects |
| Apply to every widget | `StyleBody` `LockAllRow :158` | P `widgetTheme.locks` ×11 (`profile-scope.ts:102` `toggleLockAll`) | Section lock (Screen scope). Note `css` is lockable today; spec excludes Advanced (§6) |
| Edit widget style ↗ | `StyleBody` `onOpenTheme` | C | Retired |
| Background; Uploaded files popover | `profile-look.tsx:235` → `background-editor.tsx:60`, `background-library.tsx` | `background` G / P (`appearance.ts:184` `withBackground`) | Theme › Background; Library › Media |
| All profiles / This profile switches | `ScopeSwitch :33`, `ScopeDot :46`, `profile-scope.ts:30,74` | adds or drops P `theme`/`radius`, `widgetTheme.values`, `background`, `performance` | Retired (scope bar + chips). Migration of semantics: "This profile" with no own value ≡ inherited |

### Profile inspector › Behaviour

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Pages, Add page, cycle, switch every, which pages | `profile-behaviour.tsx:35,158`; `use-studio-mutations.ts:311-340,366` | P `pages`; P `rotate {enabled, seconds, pages}` | Screens › Pages, Rotation (seconds presets 10/30/60/300 `:~129` vs spec's number) |
| Page dots and swipe | `PagesBody` `onPageNav`; `document-inspector.tsx:285`† | `general.kioskPageNav` G | Settings › Dashboard › Kiosk |
| Dynamic Island (duplicate) | `document-inspector.tsx:~290` → `island-section.tsx:198` | P `island` | Retired (link in Screens). The editor stays in the Island drawer |
| Performance | `profile-behaviour.tsx:224` | `general.maxFps`, `general.motion` G; P `performance` (`use-document-props.ts:68-69`†) | Settings › Dashboard (base) + Screens › Performance (chip). Not in the style resolver (§3) |
| Clock, Show seconds, Date locale | `profile-behaviour.tsx:284` | `style.clock` G (themed `format` key, `document-inspector.tsx:186-187`†); `general.showSeconds`, `general.locale` G | Settings › Dashboard › Clock & date. **Clock is two-homed:** `clock` is in the themed `format` section, so Theme › Units & format (any scope) also writes it (flag A2) |
| Hide cursor in kiosk mode | `profile-behaviour.tsx:320` | `general.hideCursor` G | Settings › Dashboard › Kiosk |
| Studio: Quick bar, Inspector sections | `document-inspector.tsx:~312` | `studio.quickBar`, `studio.accordion` L (`inspector-prefs.ts:110-111`) | Settings › Studio |
| Connection: URL, Test, Open API index | `data-api-panel.tsx:15` | `dataApiUrl` G (`use-document-props.ts:99`†); live `setApiBase` `data-api.ts:28`; test `data-api.ts:43` | Data › Connection |
| "Server, updates and startup are in App settings ↗" | `app-settings-footer.tsx:4` | C | Retired (status bar) |

### Rail Theme page

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Scope list | `theme-editor.tsx:59` `ScopeItem`; `ThemeScope` `theme-editor-model.ts:42` | C (`ui.themeScope`) | Scope bar (adds the *screen* picker; today the editor edits the edited profile only) |
| Live preview, per-zone chips | `theme-editor.tsx`; `previewZones theme-editor-model.ts:275`, `sourceChips :296` | C | Preview with exception badges |
| Who doesn't follow + Reset to theme | `overridesOf :263`, `withZonesFollowing :155` | Z `follow` | Exceptions + Make it follow. Today covers widgets of the current page only; spec adds pages and screens |
| Style / Data / Behaviour tabs | `THEME_TABS inspector-model.ts:62` | C | One ordered section list |
| Lock, Unlock, Customize, Use profile | `themeFollowFields :201`, `withLock :138`, `withPageFollow :146` | P `widgetTheme.locks`; Pg `widgetTheme.follow` | Lock toggle, chip, Reset to inherited |
| Lock all / Unlock all | `theme-editor.tsx:~124`, `withLockAll :142`; palette `toggle-enforce` | P `widgetTheme.locks` | Lock all (Screen scope) |

### Zone inspector

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Header, Show tab | `zone-inspector-parts.tsx:~250`, `zone-inspector.tsx:150` | Z fields | Stay |
| Save as panel preset… | `panel-preset-tools.tsx:7`; `use-studio-mutations.ts:169-178` | `panelPresets` G | Save as Panel. Also the zone menu "Save to My panels" `zone-menu.ts:84` (not in §13) |
| Copy / Paste style | `style-tools.tsx`; menu `zone-menu.ts:91-92` | C session clipboard; `studio-actions.ts:471,496` | Right-click menu (+ palette `style:copy/paste`) |
| Use as global… ▸ | `style-tools.tsx:135`; `studio-inspector.tsx:125`†; menu `zone-menu.ts:96-97` ("Global style: …") | G `style` or P `widgetTheme.values` | Make this the theme for… ▸ |
| Apply / Save / Delete preset ▸ | `style-tools.tsx:159-163`; `use-studio-mutations.ts:407-415` | `stylePresets` G | Start from a Style · Save as Style · Library › Styles |
| Style preset select | `standard-settings.ts:272` | Z `settings.preset` (+ bundle `surface`, `tint`, `accent`) | Retired (§11.3, risks in §6) |
| Widget colors; Zone frame | `SHARED_SECTIONS inspector-categories.ts:35`; `zone-design-section.tsx`, `zone-inspector.tsx:274-283` | Z `settings` (palette roles); Z `design {accent, background, header}` | Colors; Border & glow. Zone frame is a Z field, not themed, so it gets no chip |
| Follows / Customize / Custom / Use theme / Locked bars | `follow-bar.tsx:7-71,84`; `followInfo inspector-model.ts:654` | Z `follow[section]` | InheritChip + action line |
| Data tab | `inspector/bound-data.tsx`; `format` section | Z | Stays, plus the link to Data |
| Send to island | `island` row (`islandSettings`, `lib/island/sources.ts:94`†) | Z `settings.island*` | Stays, plus the link to Alerts & Island |
| More (n), Reset, N changed, search, pin | `inspector-view.tsx`, `setting-card.tsx`, `quick-bar.tsx` | pins `studio.quickPins` L (`inspector-prefs.ts:112`) | Stay |
| Changed filter | `inspector-view.tsx:~388-412` | C | Retired |
| *(not in §13)* panel-widget Follow bars ("Follows panel…") | `follow-bar.tsx:65-66`, `item-inspector.tsx` | panel `Widget.follow` (`panel-model.ts:42`†) | Closest: InheritChip with level "Panel" (spec's levels stop at Page; add a fourth label) |
| *(not in §13)* zone menu rows Edit style, Bind data…, Change widget…, Move to page, canvas menu "Edit theme" | `zone-menu.ts:81-88,114` | | Stay; "Edit style" and "Edit theme" re-point to the Style tab and Theme |

### Drawers

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Add widget (search, categories, My panels) | `insert-panel.tsx:313`, `insertGroups :158` | `panelPresets` G | Design › Add widget |
| Canvas zone · Import .infopanel | `studio-view.tsx:329` `onImportCanvas` → `openImport("zone")` | none | Import door → Canvas zone |
| Layers (list, hide, delete, Add) | `layers-panel.tsx:30` | Z `visible`, removal | Design › Layers |
| Alerts (rules, Active now, History, defaults, editor) | `alerts-panel.tsx:156`; Alerts on `:212`; `alerts-defaults.tsx:24`; `alerts-live.tsx` | `alerts {enabled, rules, quietHours, defaults{style,position,backdrop,size,seconds}}` G (`alerts-model.ts:34-70`†); Active now = R `alert` | Alerts & Island › Rules, History, Defaults. "Alerts on" master toggle is not in the spec: put it in the Rules header |
| Island (all sections, notices, widgets) | `island-panel.tsx:34`, `island-section.tsx:198` | P `island` (`island/config.ts:204`†) | Alerts & Island › Island |
| Island › Alert rules | `island-panel.tsx:111` | | Link → Rules |
| Island "As General" font / clock | `island-section.tsx:62,67` (stale tooltip "Dashboard › General › Clock"); `seconds`, `hours` `'general'` | P `island.seconds`, `island.hours` follow `general.showSeconds` + `style.clock`; `island.font` is its own (default `system`), not "from Theme" | LinkRows → Theme, Settings. **Flag A3:** the island's Font is an own key, so "Geist · from Theme" does not describe it |

### Library and Gauges

| Today | Component | Key · scope | New home |
|---|---|---|---|
| My library / Profile assets | `library-page.tsx:85,321` | server library + config scan | One library + "Used by ‹screen›" filter (owner decision 1: sidebar stays) |
| Import profile, Upload | `library-page.tsx:384,392` | none | Add files… → Import door. Note "profile" here means an InfoPanel profile |
| Smart collections | `model.ts:136-141` (all, recent, unused, large, duplicates, suggested) | | Stay in the sidebar (owner decision 1) |
| Type collections | `model.ts:142-151`: images, videos, backgrounds, icons, svg, **fonts (under Media)**, gauges, panels, styles, canvases | | Sidebar entries Themes · Styles · Panels · Gauges · Media · Fonts · Canvases (Fonts leaves Media; Themes is new) |
| Add fonts | `fonts-view.tsx:131,140` | | Import door |
| Get a font | `fonts-view.tsx:138`, `fonts/get-font.tsx` | | Link in the Fonts view |
| Gauges / Editor tabs, presets | `gauges-page.tsx`, `preset-strip.tsx` | gauge library items | Library › Gauges (editor opens from an item) |
| Import .gauge.json / SVG / frames | `gauge-files.tsx` (`ImportGaugeButton`, `ImportFramesButton :65`) | | Import door |
| Editor Import / Export | `editor-header.tsx:~60-76`, `gauge-actions.tsx:56` | | Import door / Export › Export a gauge |
| *(not in §13)* loose uploads review, upload tray, remove dialog, Optimise, detail pane | `loose-uploads.tsx`, `loose-review-dialog.tsx`, `upload-tray.tsx`, `remove-item-dialog.tsx`, `optimise.ts`, `library-detail.tsx` | | Stay with the library (tests guard "never delete a used file") |
| *(not in §13)* Profile assets tab (canvas files, "uses") | `profile-assets.tsx` + `profile-assets/*` | | Folds into the "Used by ‹screen›" filter; its canvas-file table has no spec home. Keep as a filter view |

### Dialogs, windows and tray

| Today | Component | Key · scope | New home |
|---|---|---|---|
| Data sources page | `sources-panel.tsx:66` | `sourcePrefs` G (`enabled`, `displayName`, per source, not per sensor) | Data |
| Import InfoPanel dialog | `import-dialog.tsx` / `import-steps.tsx:304` | none | Step 2 of the Import door; "Lands in" step removed (its `Dest` becomes the door's destination radios) |
| Export dialog | `export-dialog.tsx` | none | Export › Export a page for InfoPanel (canvas zones only) |
| Desktop Settings window | `src/settings/*` | S (`settings.json`) | Settings › App (window retired: see finding 1) |
| Restart bar | `src/settings/shell.tsx` `RestartBar`; rows `model/restart.ts`; `store.tsx` `pending` | S vs running config | Settings › App banner + status bar |
| Help window | `desktop.ts:39`, `windows.rs:317` | | Stays; F1 / `?` open in context. `studioHelpTarget` (`help/context.ts:15`) keys on drawers, which go |
| Tray | `tray.rs:88` | | Stays; Settings and Check for updates → studio at Settings › App (§5.3) |
| Remote control: mute, reload, dim, island | `control.ts:47-57`; server `control.mjs:153-193` | R | Live |

### Command palette

| Old entry (real label) | Where | New |
|---|---|---|
| "Appearance…" | `commands.ts` `general("appearance")`, → `DOCUMENT_CARD.appearance` `inspector-model.ts:379` | Theme |
| "General settings…" | `general("general")` → `bh-clock` | Settings › Dashboard |
| "Connection…" | `general("connection")` → `bh-conn` | Data › Connection |
| "Background…" | `general("background")` → `lk-bg` | Theme › Background |
| "Font…" | `general("font")` → `lk-theme` | Theme › Typography |
| "Apply appearance: ‹x›" | `commands.ts:360` (`appearance:` ids) | Apply theme: ‹x› |
| "Follow global style" | `styleCommands` `style:follow` (also `follow-all` "Make all widgets follow the theme") | Make it follow |
| "Use as global style: all profiles / this profile" (spec calls it "Global style: …"; that label is the zone menu's `zone-menu.ts:96`) | `style:global-all`, `style:global-profile` | Theme scope: All screens / ‹screen› |
| *Not in spec:* "Open drawer: Add / Layers / Profiles / Dynamic Island / Alerts" (`DRAWERS :111`), "Open alerts", "New alert rule", "Theme editor…", "Lock / Unlock every theme section", "Open Sources", "Toggle inspector", grid, zoom, "Edit profile: ‹name›", "When the app opens: best fit", "Go to setting: …" in group "Dashboard" (`settingCommands :264`, built from `dashboardSections` terms, so it prints the retired paths) | | One entry per destination. The generated "Dashboard" group must be rebuilt from the new sections |

## 3. Style resolution

The order (built-in → All → Profile + locks → Page → Widget) is confirmed. Functions:

| Step | Function (file:line) | Behaviour |
|---|---|---|
| Layering | `resolveStyle` `src/lib/style-resolve.ts:105`; inner `layerOf :112` | Per themed key, first defined of: widget own (only where `ownApplies`), page (only if `pageCustom`), profile `values`, base `style`, `moduleDefaults` (a panel's legacy look). Returns `settings` plus `source[key]` = `own|page|profile|dashboard|default` (`StyleSource :40`) |
| Built-in layer | `THEME_DEFAULTS` `theme-model.ts:159`; applied at read time by `themeVal :217` and `valueOf :~240`, **not** inside `resolveStyle` | `valueOf`: row default, else `THEME_DEFAULTS` |
| Page gate | `pageCustom` `theme-model.ts:202` | `page.follow[sec] === false && !isLocked` (a lock beats a custom page; its values stay stored) |
| Lock | `isLocked :221`, `allLocked :224` | `profile.widgetTheme.locks[sec]`; keyed by the 11 `SectionId`s (`theme-model.ts:23-48`) |
| Widget gate | `following :227`, `ownApplies :~232` | `isLocked || follow[sec] !== false` |
| Level value | `themeSet :209` | page (if custom) ?? profile ?? base; no level reported |
| Levels object | `appearanceOf` `style-resolve.ts:74` → `Appearance` (`base`, `profile`, `page`, `profileName`, `pageName`) | Built from config + a `ProfileView` |
| Per zone | `zoneResolver :~176`, `resolveWith :~190` | Used by the island and renderers |
| Follow state for a bar | `followInfo` `inspector-model.ts:654` → `{mode: theme|custom|locked, from, level: profile|page}` | Closest thing to `useInheritance` |
| Scoped appearance | `scopeAppearance` `theme-editor-model.ts:56`, `themeOf :68` | Levels below a Theme-editor scope |
| Sections' keys | `SECTION_KEYS theme-model.ts:127`, `sectionOfKey :149` | `skin, colors, palette, surface, type, spacing, border, css, format, thresholds, motion` |

**What `InheritChip` / `useInheritance` needs per section** (the code has none of it as one call):

| Needs | Today | Gap |
|---|---|---|
| Which level sets it | per key via `resolveStyle().source`; per section only via `followInfo` (profile/page) | Aggregate keys of `SECTION_KEYS[sec]`; add the `dashboard` level ("All screens": `inherited`/`base`/`builtin` states need "is any key set in `config.style`") |
| Lock source | `isLocked` (profile only) | Fine. Locks are Screen-only, matching the chip |
| Parent value | `themeSet`/`valueOf` for the level below | Need "value without my level" (resolve with that level dropped). Not built |
| Widget `custom` | `Placement.follow[sec] === false` | Fine. A kept override under a lock: `following()` is true so own values are inert, as the spec wants |
| Page `custom` | `page.follow[sec] === false` | Same |
| Panel widgets | `Widget.follow` under the panel | Extra level (A4 in §2) |
| Row-level dot | `SettingState` `settings-model.ts:63` (`default|dashboard|profile|here|overriding|ignored`); `SourceDot` `inspector/source-dot.tsx` | Keep the 5 px dot; chips are per section |

**Not on the style resolver (two-level or global):**

| Data | Resolver | Levels |
|---|---|---|
| Color tokens + corner radius | `resolveTheme` `src/lib/theme.ts:254` | `config.theme/radius` ← `profile.theme/radius` (profile partial over the dashboard); no page, no lock |
| Background | `resolveBackground` `src/lib/appearance.ts:163` | `profile.background` ?? `config.background`; `{type:"none"}` = none; no page |
| Performance | `resolvePerformance` `src/lib/performance.ts:54` via `usePerformance` `hooks/use-performance.tsx:51`; layer built at `App.tsx:186` | URL ← `profile.performance` ← `general` ← default. No lock |
| General (clock, locale, cursor, page nav) | `resolveGeneral` `general.ts:85` | one level; `hour12` read from `style.clock` |
| Page font | `fontStack(useGeneral().font)` at `App.tsx:494`, `profile-page.tsx:25`, `studio-canvas.tsx:416` | `general.font` only (global) |

## 4. Import and export code paths

The "7 operations" are read as the seven detected import types of SPEC §9.1 plus the four export rows of §9.2.
Import ops: **I1** config backup, **I2** Studio profile, **I3** `.infopanel`, **I4** gauge / gauge SVG / frames zip,
**I5** image / video, **I6** font. Export ops: **E1** back up, **E2** screen, **E3** page for InfoPanel (canvas),
**E4** gauge; **CJ** Copy JSON.

| # | Path | File:line | Op |
|---|---|---|---|
| 1 | ⋯ Import config… → native `open_text_file` (desktop) or hidden input | `studio-top-bar.tsx:212` → `config-file.ts:82` `startConfigImport` → `importConfigText :44`; input `studio-view.tsx:734-744` → `importConfigFile :73` | I1 |
| 2 | Palette "Import config…" | `use-studio-commands.ts:155` | I1 |
| 3 | Profiles drawer Import (native dialog or input) | `profiles-panel.tsx:375,473` → `profile-file.ts:157,146` → `parseProfileFile :55` → `use-studio-mutations.ts:377` | I2 |
| 4 | Top-bar Import; ⋯ Import InfoPanel profile… | `studio-top-bar.tsx:317,215` → `infopanel-io.tsx:91` → `ImportDialog` | I3 |
| 5 | Add widget › Canvas zone · Import .infopanel | `studio-view.tsx:329` → `openImport("zone")` | I3 |
| 6 | Library Import profile | `library-page.tsx:384` → `p.onImport()` (`studio-view.tsx:563`) | I3 |
| 7 | Library Upload (input), drop, Upload tile; `.infopanel` is diverted to the dialog | `library-page.tsx:392-405,308`; `library-views.tsx:174,388` `fileDrop`; `use-my-library.ts:136-149` | I3 (`.infopanel`), I5, I6 (others) |
| 8 | Library Re-import… | `library-page.tsx:215` | I3 |
| 9 | Dialog sources: file `.infopanel,.zip`, folder, installed (`/api/infopanel/installed`), saved canvas; drop | `import-dialog.tsx:217-301,144` | I3 |
| 10 | Fonts › Add fonts (zip unpacked by `fontsInZip`) | `fonts-view.tsx:80,131-145` → `library.addFiles :93,113` | I6 |
| 11 | Gauges: Import `.gauge.json` / SVG | `gauge-files.tsx:~29-44`, `import-file.ts:16`; editor header `editor-header.tsx` `onImported` | I4 |
| 12 | Gauges: Import frames `.zip` | `gauge-files.tsx:65-85` `readFramesZip` (`gauge-studio/frames-zip.ts`) | I4 |
| 13 | Gauge editor SVG template, frame images | `gauges/inspector/shape.tsx:143`, `frame-strip.tsx:86` | I4 (inside the editor) |
| 14 | Media fields: background / image upload and drop | `media-field.tsx:83-93`, `background-editor.tsx:77`, `profile-assets/file-pick.tsx:24`, wizard image supply `import-steps.tsx:353` | I5 |
| 15 | Export config | `studio-top-bar.tsx:209`, palette `use-studio-commands.ts:154` → `config-file.ts:21` → `infopanel-studio-config.json` (desktop `save_text_file`, else download) | E1 |
| 16 | Card ⋯ Export profile | `profiles-panel.tsx:129,442` → `profile-file.ts:117` → `<name>.json` (envelope) | E2 |
| 17 | Copy profile JSON ×3 | `studio-top-bar.tsx:177`, `profiles-panel.tsx:134`, `use-studio-commands.ts:158` → `config-file.ts:8` (bare profile) | CJ |
| 18 | Top-bar Export; ⋯ Export InfoPanel canvas…; Library item Export | `studio-top-bar.tsx:325,218`; `studio-view.tsx:565` → `infopanel-io.tsx:95` → `export-dialog.tsx` (`.canvas.zip` or `.infopanel`; `saveBinaryFile` `desktop.ts:71`) | E3 |
| 19 | Gauge Export (`.gauge.json`), frames (`.gauge-frames.zip`) | `editor-header.tsx:71`, `gauge-actions.tsx:56`, `gauge-files.tsx:14,57`; library item action `library-page.tsx:48` | E4 |
| 20 | Reset dialog "Export first" | `reset-config-dialog.tsx:15` → `onExport` | E1 |
| 21 | Canvas drop of library cards / panels (internal DnD, not a file import) | `studio-canvas.tsx:338,433`, `library-drop.ts` | none |

**Type detection that exists today**

| Type | Rule | File:line |
|---|---|---|
| Config | JSON with non-empty `profiles` array; no marker field | `config-file.ts:50-52` |
| Studio profile | `type === "infopanel-studio-profile"` envelope (`version`, `configVersion`), or a bare profile with `pages`/`placements` plus name, size, grid limits; 5 MB cap | `profile-file.ts:9,55-95` |
| `.infopanel` | extension only (case-insensitive) | `my-library/intake.ts:64`, `use-my-library.ts:139` |
| `.canvas.zip` (stored canvas) | read by the dialog's `openZip`/`openStored`; no pre-detection | `infopanel/import/session.ts` |
| Image / video / SVG / font | magic bytes (`fontType :25`, `sniff`), limits 25 MB / 300 MB / 256 KB (SVG) / 30 MB, unsafe-SVG scan | `my-library/intake.ts:62` `classify` |
| Gauge spec / SVG | `.svg` extension → template; else `readSpecFile` JSON | `gauge-studio/import-file.ts:16` |
| Frames zip | `readFramesZip` manifest check; name `*.gauge-frames.zip` | `gauge-studio/frames-zip.ts` |

There is **no combined sniffer.** An unknown JSON is tried by each importer separately. Config vs profile is
distinguishable (`profiles` vs `pages`). `.zip` is ambiguous (stored canvas / frames / fonts zip), so the door needs a
manifest peek. Desktop `open_text_file` returns text only (`desktop.ts:81`), so binary imports must stay on `<input type=file>`.

## 5. Spec guesses vs reality

### 5.1 Names and keys

| Spec says | Real |
|---|---|
| `cfg.autoProfile`, `cfg.launchProfileId` (§8, §11.2) | Neither exists. `config.activeProfile: string` = `"auto"` or an id (`layout.ts:231`, default `:309`); writer `use-studio-mutations.ts:405`; best fit `resolveProfile layout.ts:573`. Superseded by owner decision 3 |
| "Best fit now" / "Opens on launch" tags | `LaunchTag profiles-panel.tsx:427`; auto id `studio-view.tsx:348` |
| "Style preset" key and values (§11.3) | Zone `settings.preset`, `standard-settings.ts:272`: `default`, `dark` (surface matte-dark, tint false), `light` (matte-light, tint false), `vivid` (glass, tint true), `mono` (matte-dark, tint false, accent #fafafa). Other `type:"preset"` rows (`registry/b.ts:114`, `d.ts:72`, `e.ts:69`) are widget view bundles and stay |
| Library "Styles" | `config.stylePresets` (`StylePreset {id,name,settings}`, `layout.ts:~259`): a saved set of the 25 look keys (`PROFILE_STYLE_KEYS`). Not the same thing as `preset` |
| Library "Themes" / "Saved looks" | `config.appearancePresets` (`appearance-presets.ts`). Library kinds are `image|video|font|svg|gauge|panel|style|canvas` (`lib/library.ts:10`). Config-backed items are merged in `use-my-library.ts` `configItems` (panels + styles only). **Themes does not exist as a collection**; needs appearance presets added there |
| "Panels" | `config.panelPresets` (`UserPanelPreset`) + built-ins `lib/panelPresets.ts`; collection `panels` ("Saved panels") |
| Page font key (§11.1) | `general.font` (`general.ts:106`); consumers `App.tsx:494`, `profile-page.tsx:25`, `studio-canvas.tsx:416`. No per-screen font: **needs** `MonitorProfile.font` (or a theme key) plus a `resolveFont` |
| Widget `Font` vs page font | Different keys: widget `font` is a themed `type` key (`theme-model.ts:127`) with a Theme (`auto`) default; page font is `general.font`. The spec's single Typography section holds both |
| Corner radius | Two: theme radius (rem, `config.radius`/`profile.radius`) and widget `radius` (px, themed `spacing`) |
| Colors (merged section) | Two stores: tokens `theme` (G/P) and widget style `colors` + `palette` sections (G/P/Pg/Z). Lock flags are per `SectionId`, so Lock on Colors must set both `colors` and `palette` |
| Page scope: Colors and Background disabled | Tokens and background: true (no page store). Widget-style colors: a page can customise them today (finding 7) |
| "Shape & spacing allowed on pages: spacing only" | `spacing` section (incl. widget `radius`) is page-customisable today; consistent |
| Advanced (css) not lockable | `css` is one of the 11 lockable sections (`SECTION_IDS`); `allLocked` counts it (`theme-model.ts:224`) |
| Kiosk count (status bar, Live list, IP) | Not in `ControlState`. See 5.2 |
| Data API `connected / unreachable / slow` | Live bool `sensorStore.isConnected()` `sensor-store.ts:113` (+ `statusListeners :99,125`); one-shot `testApiBase` `data-api.ts:43` (`GET {base}/api` 200). No latency, so no `slow` and no "18 ms" |
| Update state | Desktop only: `UpdateState` from `update_state` invoke or `update-state` event (`updater.rs:17,391`). Studio lacks `allow-update-state`. Browser: none (spec hides it) |
| Server state (desktop) | `server_status` invoke / `server-status` event (`control.rs:17`); studio lacks `allow-server-status` |
| Server state (browser) | No studio-side source. `GET /api/health` `server.mjs:407` (`app`, `version`, `configVersion` = config mtime). "Served by 192.168.1.12" = `location.host`. `/api/server/stats` is loopback only |
| Restart needed | Computed in the settings store from `settings.json` vs running config (`settings/model/restart.ts`, `store.tsx` `pending`); not available to the studio today |
| Data › Display name per sensor ("applies to every screen") | Display names are per **source/container** (`sourcePrefs["plugin::container"].displayName`, `layout.ts:276`, `group-summary.tsx:90`, `source-tree.tsx:74`), not per sensor, and nothing outside the explorer reads them (inventory §5.8, open question 12). Per-point names: **does not exist, needs a store and consumers** |
| "Used in (which screens)" | Exists: `lib/data-usage.ts` `UsageIndex` (`explorer/point-table.tsx:49`) |
| Island "Font · from Theme", "Clock format · from Dashboard" | `island.font` is its own key; `island.hours`/`seconds` follow `general` + `style.clock` (A3) |
| Alerts Defaults | `alerts.defaults {style, position, backdrop, size, seconds}`: "Dim the page behind" = `backdrop`, "Show for" = `seconds`; `quietHours {from,to,minSeverity}` ("still show" = `minSeverity`) |
| Live: Dim screens (all) | `kiosk dim` is per profile; no `profile` = the usual target (override / shown / pin), not every kiosk (`control.mjs:170-185`). Reload with no profile is global |
| Live: Mute 1 h toggle | `alert {action:"mute", minutes}` (0 unmutes), `mutedUntil` (global, durable) |
| Live: Rotation / page / island | `rotate` (`on|off|toggle|saved`), `page`, `kiosk island` (`on|off|toggle|saved`): all per profile, all exist |
| Export "a page for InfoPanel" | Canvas zone only (finding 8); options "Bake vector gauges first" and "Leave unused assets out" exist (`export-dialog.tsx:86,113`) |
| Settings › Studio: Default zoom, grid, rulers, Left panel width | `studio.zoom` (`fit` or 0.25-2: the last zoom, not a default), `studio.grid`, `studio.rulers`, `studio.drawerWidth` (drawers only) |
| Settings › App sub-nav (General, Server, Updates, Coding agents, Diagnostics & logs, About) | Real sections: general, server, agents, updates, diagnostics, logs, about, changelog (`settings/model/search.ts:1`); owner decision 2 replaces the sub-nav list |

### 5.2 Kiosk list, count and IP (needs server work)

`handleControlEvents` (`server.mjs:200`) knows `?profile=` and `req.socket.remoteAddress` per connection but keeps
neither. A kiosk is an SSE client with `?profile=` (`useControl(shownId, kiosk && …)`, `App.tsx:111`); the studio
connects without it (`studio-view.tsx:125`). Needs: a registry keyed by connection (profile, remote address, since),
published in `publicState` (`server/control.mjs:249`), plus `ControlState` typing and a test in
`tests/server/control.test.mjs`. `shown` today is only the last reported profile.

### 5.3 What the studio webview can call in Tauri

| Question | Answer |
|---|---|
| Is the studio a Tauri webview? | Yes. The `main` window is created in `windows.rs` and navigated to `…/?studio=1` (`state.rs:88`, `windows.rs:~190` `load_studio`). `isTauri()` is `__TAURI_INTERNALS__` (`desktop.ts:10`) |
| Which capability governs it? | A runtime remote capability per server origin: `control.rs:548-556` (`CapabilityBuilder::new("studio-<origin>").remote("{origin}/*").window("main")`) with `STUDIO_PERMISSIONS` `control.rs:18-39`. `src-tauri/capabilities/default.json` is `local: true` and only covers the app's own pages (windows `main`, `settings`, `help`: start.html, settings, help) |
| What the studio may invoke | `open_settings`, `open_help`, `kiosk_window`, `save_text_file`, `save_binary_file`, `open_text_file`, `log_frontend`, `report_metrics`, `get_debug`, `flush_done`, `set_zoom`; `core:event` listen / unlisten; window minimize, maximize, close, drag, `is_maximized` |
| What it may not (Settings › App needs it) | `get_settings`, `set_setting`, `server_status`, `start_server`, `stop_server`, `restart_server`, `find_free_port`, `server_stats`, `use_foreign_server`, `stop_foreign_server`, `foreign_server_info`, `list_local_addresses`, `set_agents`, `agents_status`, `repair_agents`, `open_agent_backups`, `update_state`, `check_for_update`, `download_update`, `cancel_update`, `install_update`, `get_diagnostics`, `open_logs_folder`, `read_log_tail`, `read_log`, `reveal_path`, `open_devtools`, `app_info`, `changelog`, `open_external`, `quit_app`, `open_studio` (all in `default.json`, not in `STUDIO_PERMISSIONS`) |
| How `src/settings` calls the backend | `src/settings/ipc.ts:1-60`: static `invoke` wrappers over those commands plus `listen` for `server-status`, `update-state`, `settings-section`, `help-open` (`:61`); store `settings/store.tsx:118-121` |
| Events | `app.emit` events (`server-status`, `update-state`) reach every window and `listen` is permitted, so the status bar can *listen* with no new permission, but it has no initial value without `update_state` / `server_status` (read-only: low-risk to add). `settings-section` is `emit_to(SETTINGS, …)` (`windows.rs:308-314`) and does not reach the studio |
| Widening the set is a security call | `STUDIO_PERMISSIONS` applies to every page of `{origin}/*` (studio and kiosk routes of the Node server), with write commands such as `set_setting`, `stop_server`, `open_external`, `use_foreign_server`. Add the read-only ones (`server_status`, `update_state`, `get_settings`, `app_info`) freely; gate the mutating ones consciously |
| Tray › Settings → studio at Settings › App | Feasible: `show_main` (`windows.rs:148`) then, if the studio is loaded, `emit` a new event the studio `listen`s to (the `studio://flush`, `kiosk-left` pattern, `desktop.ts:~96`); if it is not loaded (start.html), append a hash to `studio_url` (`state.rs:88`) or fall back to the window. `show_settings` / `open_settings` (`commands.rs:598`, `start.js:74`) stay for the server-down case (finding 1) |
| Browser build | `isTauri()` false: every `desktop.ts` wrapper is a no-op; the Settings rail button is already Tauri-only (`left-rail.tsx:167`). Settings › App must render the notice card and read-only rows (server from `location.host`; desktop version: `/api/health` `version`) |

## 6. Risks

### 6.1 Conflicts with existing behaviour and tests

| Risk | Where | Tests |
|---|---|---|
| Server-down recovery (finding 1) | `start.html`, `start.js:74`, `windows.rs:308`, `tray.rs:88` | Rust tests in `src-tauri` for window / tray; `tests/settings/settings-app.dom.test.tsx` (the Settings app mounts standalone) |
| Settings port: separate bundle, static `@tauri-apps/api`, `s-*` tokens | `vite.settings.config.ts`, `settings.css`, `settings/ipc.ts:1` | `tests/settings/**` need a happy-dom mount in the studio shell; `tests/lib/desktop.test.ts` guards the no-op wrappers |
| Help `:::open settings/<section>` and the Help sidebar link call the Settings window | `help/ui/blocks.tsx:143`, `help/env.tsx:17`, `help/ui/sidebar.tsx:68` | `tests/help/content.test.ts` runs `checkContent` over all articles; retired labels in articles (`themes.md`, `presets.md`, `profiles.md`, `quickstart.md` mention Saved looks / Global style / Appearance / Widget style) fail the §15 check only if you add one; spec says help must not use them: edit the four articles |
| Config tests pin version 9 | | `tests/lib/layout.test.ts:44,84` (literal), `:56` (const), `layout-pages.test.ts:103`, `canvas-store.test.ts:267`, `inspector/profile-scope.test.ts:32`, `appearance-presets.test.ts:50` |
| Palette tests | | `tests/components/studio/commands.test.ts:58` (`drawer:add`), rename entries |
| Inspector registry tests | `dashboardSections`, `DOCUMENT_CARD` (`lk-theme`, `bh-conn`, `ly-screen`) | `tests/components/studio/inspector-model.test.ts:604`, `:376` (`preset` absent from some section keys) |
| Theme editor model | `theme-editor-model.ts` | `tests/components/studio/theme-editor-model.test.ts`, `appearance-actions.test.ts` |
| Import / export modules | `config-file.ts`, `profile-file.ts`, `import-actions.ts` | `tests/components/studio/config-file.test.ts`, `profile-file.test.ts`, `import-actions.test.ts`, `tests/lib/infopanel/**`, `tests/components/library/*` |
| Control API | `control.ts`, `server/control.mjs` | `tests/lib/control.test.ts`, `tests/server/control.test.mjs` (kiosk registry needs cases) |
| Drag-and-drop anywhere | `src-tauri/src` has no `disable_drag_drop_handler`; Tauri's default file-drop handler is on, so HTML5 `drop` with files probably never reaches a WebView2 page (the Library's `fileDrop` may already not work on desktop; not verified). Verify before promising the "Drop to import" overlay on desktop |
| Spec status bar / title bar sizes vs code | Title bar is 48 px (`studio-top-bar.tsx:271`), rail 52 px (`left-rail.tsx:146`), drawers 280-440, inspector float modes in `use-studio-layout.ts` / `studio-layout.ts` | `tests/components/studio/studio-layout.test.ts`, `use-studio-layout.test.tsx` (size and mode math). Phase 2 resizes these |
| Copy JSON payload | bare profile vs enveloped file (finding 9) | `profile-file.test.ts` parses both; pick one payload and keep `parseProfileFile` accepting the other |
| "Replace everything makes a backup first" | no such step today | New. A backup = `exportConfigFile` before `setConfig` (one undo step already covers the restore) |
| Remove the Changed filter / "N changed" | `inspector-view.tsx:~388-412` | `inspector-model.test.ts`; spec keeps the N-changed count, drops only the filter |
| Locks UI excludes Background and Advanced | `css` lock exists (`SECTION_IDS`) and a stored lock on `css` must keep working | `theme-model.test.ts`, `style-resolve.test.ts`. Don't remove the key; just hide the toggle, or accept that Lock all sets it |
| Page chips for Colors/Background "Set per screen" | finding 7 | `theme-editor-model.test.ts` |
| Stream Deck / external writers of `/api/control` | | `docs/redesign/streamdeck/`; the registry change must stay additive |

### 6.2 Model change §11.1: page font per screen

| Item | Detail |
|---|---|
| Current | `general.font` (`GeneralSettings`, `general.ts:106`, validated by `normalizeGeneral :100`); read by `useGeneral()` at `App.tsx:494`, `profile-page.tsx:25`, `studio-canvas.tsx:416`; written `use-document-props.ts:75-76`†, `document-inspector.tsx:234-235` |
| Add | An optional per-screen value (e.g. `MonitorProfile.font`), plus `resolveFont(config, profile)` mirroring `resolveTheme`. Three readers switch from `useGeneral().font` to it (the kiosk gets `profile` there already) |
| Also touch | `normalizeProfile` / `PROFILE_KEYS` `profile-file.ts:43-46` (**an unlisted key is dropped on profile import and migration**), `appearance-preset-apply.ts` (decide whether a saved Theme carries the font), `Copy style` is unaffected |
| Migration | None needed: `general.font` stays as the All screens value, screens have no override. If the font moves into `style`, then v10 must copy `general.font` → `style.<key>` and `normalizeGeneral` stops reading it. Prefer not moving it |
| Version | Additive optional field: safe at v9 for new builds. Older v9 builds ignore it silently (no `version` bump = `server/config-guard.mjs:18` does not refuse their saves, and they would drop the field on save). A bump to v10 makes `versionRefusal` protect it |

### 6.3 Model change §11.3: Style preset retirement, and what a v10 migration touches

| Item | Detail |
|---|---|
| Current version | `CONFIG_VERSION = 9` (`layout.ts:226`); history comment `:211-225` |
| Migration home | `mergeConfig` `layout.ts:493-532`; per-version helpers in `src/lib/settings-migrate.ts` (`migrateProfileV6 :123`, `V7 :478`, `V8 :671`, `migrateWidgetV9 :694`, `migrateGeneralV7 :502`); each keyed on `parsed.version < N` (`layout.ts:503-510`). A v10 helper follows the same shape (`migrateProfileV10`, `legacy: version < 10`) and runs per placement over `pages[].placements` (and legacy `placements`) |
| What it touches | Every zone `settings.preset` on every page of every profile (plus profile files via `parseProfileFile`, which calls `mergeConfig`, and library canvases are not zones). `preset` is not on panels (`NOT_FOR_PANELS :356`) |
| The trap | The bundle values (`surface`, `tint`, `accent`) are already in `settings` (written at pick time), but they only render where the section is custom (`follow.surface` / `follow.colors === false`, or the key is per-widget like `tint`). "Write the preset's values as custom sections" (spec) would change the render of a zone where the section followed. To keep §15 ("render identically"), the safe migration is: **drop `preset`; touch `follow` only where the stored zone already rendered the bundle** (own values applying). Unverified: whether zone `onPatch` also flips `follow` (`settings-panel.tsx:141`, `zone-fields.ts:42`); read `withFollow` first |
| Built-in Styles | Need to be generated, not stored. They carry `surface` and `accent` (look keys) but also `tint`, which is not in `PROFILE_STYLE_KEYS` (`standard-settings.ts`), so `styleOf` / `replaceStyle` would drop it. Either extend the key set (affects Copy / Paste style and saved Styles) or make built-ins skip `tint`. Vivid (`tint:true`) is the only one that sets it true |
| Also remove | `preset` from `STANDARD_SETTINGS :272`, quick-bar sets (`quick-sets.ts`) and `inspector-model.ts:162` search terms; `presetChoice`/`presetDefaults` stay (other widgets use `type:"preset"`) |
| Tests to add | One per behaviour: a v9 zone with `preset:"dark"` loads without the key and renders the same; a zone with a following section keeps following; the migration is idempotent on a v10 input; bump the six version literals above |
| Version / server | Bump to 10 so `versionRefusal` stops a v9 build from pushing `preset` back; `tests/server/config-guard.test.mjs` covers the refusal |
| Library Styles | `stylePresets` keeps its key and shape (§11.4); only the UI name changes |

### 6.4 Smaller things to decide

| # | Item |
|---|---|
| A1 | Kiosk view (local preview) has no spec home (§2) |
| A2 | `clock` (12 / 24 h) is a themed `format` key and is also in Settings › Dashboard: two editors unless one becomes a LinkRow |
| A3 | Island `font` / `hours` / `seconds` are not "from Theme / Dashboard" the way the spec words them |
| A4 | Panel-widget level ("Follows panel") has no chip level |
| A5 | `Unsaved` and `Offline · edits kept locally` (`studio-top-bar.tsx:281`) are two states; the status bar lists one |
| A6 | Settings › Studio repeats zoom bar prefs; the left panel is 232 px fixed in the spec, resizable 280-440 today |
| A7 | First-run flow: today's empty-layout card ("Use sample layout", `studio-canvas.tsx` `onUseSample`), tips card (`studio.tipDismissed`) and `sample-layout.ts` are the nearest existing pieces |
| A8 | Library "Profile assets" has no spec tab; keep as the "Used by" filter view |
