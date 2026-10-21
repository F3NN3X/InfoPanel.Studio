# Settings & navigation IA: status

Phases follow `IMPLEMENTATION_PLAN.md`; the owner decisions in `PLAN.md` win over `SPEC.md`. Phase 0 (the audit) is
`IA_AUDIT.md`.

## Phase 1: shared building blocks

Built, not yet placed in the shell (Phase 2 mounts them). The checkpoint is the dev page **`?ia-preview`** (a lazy
chunk like `?ui-preview`, never linked): every chip state, the chips resolved live over a sample config (Lock /
Unlock and the chip menus edit it), LinkRows and the status bar in each state plus one live instance.

Checked by tests, a production build and by eye in headless Chromium at 1000 px (`?ia-preview`: chips, chip menu
opened with Enter, LinkRows, status bars; `?studio=1` still renders, no console errors).

| Piece | State |
|---|---|
| `InheritChip` (SPEC §5) | Done: `src/components/studio/inherit-chip.tsx`. Pure; props `state`, `from` (All screens / Screen / Page), `fromName`, `parentText`, `onReset`, `onJump`, `onCustomise`, `onMakeTheme`. Each state has its own icon, wording and border (dashed for inherited and built-in). Tooltips are the spec's copy; base and built-in take the prototype's. The menu is Base UI's: click, Enter or Space opens, Esc closes, 220 px. First line is the parent's value ("Without it: #3D8BFF from Page · Gaming"); then custom: Reset to inherited (⌫ hint) · Edit ‹level› ↗ · Make this the theme for… ▸ (widget only); inherited: Customise here · Edit ‹level› ↗; locked: Edit lock in Theme ↗; base: Reset to built-in. `InheritLockNote` / `keptOverrideText` give the amber kept-override note. |
| Inheritance resolution | Done: `src/lib/inheritance.ts` (`resolveInheritance`, `styleInheritance`, `dataInheritance`, `valueText`), on `theme-model.ts` (`themeVal`, `pageCustom`, `isLocked`) and the two-level resolvers (`resolveTheme`, `resolveBackground`, the performance layering, `resolveFont`). Covers the 11 widget-style sections at All / Screen / Page / Widget (locks, kept overrides) and tokens + radius, background, performance and the page font at All / Screen. A level "sets" a section when it holds a value for one of its keys (a page or widget: when it customises it); `from` is the nearest level above that sets it, else All screens. |
| `useInheritance(path, scope, ctx)` | Done: `src/components/studio/use-inheritance.ts`, a thin hook over the resolver and `inheritance-actions.ts` (`resetInheritance`, `customiseInheritance`, `inheritanceJump`, on the existing writers `withScopeValues`, `withPageFollow`, `withFollow`, `withScope`). `ctx` carries `config`, the history `setConfig` and `navigateTo`. |
| Page font per screen (PLAN decision 10) | Done: optional `MonitorProfile.font`, normalised in `layout.ts` (an unknown font is dropped), `resolveFont` in `general.ts`, `"font"` in `PROFILE_KEYS` and in the profile-scope switch (`ScopedSection`). The three readers (`App.tsx`, `profile-page.tsx`, `studio-canvas.tsx`) use `resolveFont`. No migration; nothing writes `profile.font` yet, so rendering is unchanged. |
| `LinkRow` (SPEC §4.1) | Done: `src/components/studio/link-row.tsx`. Label, read-only value (mono option) with "· from X", an optional lead-in note and the accent `↗` link calling `onNavigate`. |
| Navigation targets | Done: `src/components/studio/studio-nav.ts` (`NavTarget {view, tab, section, control, themeScope, profileId}`, `focusNavTarget`, `useNavFocus`) and `navigateTo` in `use-studio-ui.ts`. Views mark targets with `data-nav-section` / `data-nav-control`; the focus helper retries for about 30 frames so a lazy view can render first. Until the new views exist, `navigateTo` maps to today's places (Data → Sources, Alerts & Island / Screens → their drawers, Settings › App → the desktop window, other Settings → the profile inspector's Behaviour tab). |
| `StatusBar` (SPEC §3.4) | Done, not mounted: `status-bar.tsx` (pure) and `use-status-bar.ts` (live data). Data API connected / slow / unreachable from the sensor streams plus a timed `GET {base}/api` every 15 s (`pingApiBase`, `dataApiState`, `SLOW_API_MS` 300 in `data-api.ts`); server (desktop `Server · :port · LAN`, browser `Served by ‹host›`); kiosk count; update (desktop only); "Restart server to apply"; save state (Unsaved / All changes saved / Offline · edits kept locally, AUDIT A5). Below 960 px only the dots show. |
| Kiosk registry (PLAN decision 7) | Done: `server/control.mjs` keeps the open control streams that report `?profile=` (internal `connect` / `disconnect` actions, never POSTable), runtime only, published as `kiosks: [{id, profile, page, address, since}]`. `page` is the kiosk's `?page=` pin while the profile has it, else the profile's current page. `server.mjs` registers in `handleControlEvents` and drops it on close. Typed `ControlKiosk` in `src/lib/control.ts`; kiosks now send their `?page=` pin (`controlEventsUrl`); `kiosksOf(control)` reads the list from the page's one `useControl`. |

Tests added: `tests/lib/inheritance.test.ts` (every state at every level, kept overrides, two-level data, page font),
`tests/components/studio/inheritance-actions.test.ts` (reset / customise effects, lock and unlock, jump targets),
registry cases in `tests/server/control.test.mjs` and a route case in `tests/server/server.test.mjs`, page-font
round-trip in `profile-file.test.ts`, `resolveFont` in `general.test.ts`, the ping and state in `data-api.test.ts`.
One existing test changed: `control.test.mjs` "survives a missing or broken control.json" pins the whole public
state, which now has `kiosks: []`.

### Deviations

- **Icons are lucide**, as in the rest of the studio (Link2, Pencil, Lock, CircleDot, Box for link, edit, lock,
  adjust, deployed_code), not Material Symbols.
- **Dev route is `?ia-preview`**, following the existing `?ui-preview` / `?widget-qa` pattern, not `?studio=1&dev=chips`.
- **Latency is a new 15 s ping.** Sensor data is SSE; there is no existing poll to time. The ping is the same request
  as Test connection and runs only while the page is visible.
- **Screen "Customise here" on a widget-style section copies only the keys All screens sets.** Writing the built-in
  values would override widget kinds' own defaults (a Clock's 24 h, the cards' surface). With nothing set above, the
  shortcut changes nothing and editing a control customises, as the spec allows.
- **Two-level data at Page / Widget scope** reads as `inherited` from the screen (or All screens) and has no
  Customise or Reset (SPEC §4.2: no page level).
- **Tokens at All screens** read `base` when the theme or radius differs from the defaults, else `builtin` (the
  config always stores a theme).
- **Restart needed leaves out debug mode**: telling a forced `--debug` from a pending change needs `get_diagnostics`.
- **The chip's ⌫ shortcut is only shown**; the section card (Phase 3) binds the key.

### Unverified

- **Desktop status bar values.** `server_status`, `update_state` and `get_settings` are not in `STUDIO_PERMISSIONS`,
  so the first read is refused and the bar falls back to the page's own port with no LAN flag, no update and no
  restart item until a `server-status` / `update-state` event arrives. The restart item needs `get_settings`, which
  no event carries. Not run in the desktop app.
- The chip menu's submenu and focus return were checked in the browser only by opening with Enter.

### Follow-ups

- Phase 2: mount `StatusBar` with `useStatusBar(control, saveState)` from `studio-view.tsx` (the studio's existing
  `useControl`), wire `onOpenLive` to Live, and add the `data-nav-*` markers to the views `navigateTo` opens.
- Phase 3: replace the Follow bars with `InheritChip` + `useInheritance` (+ `InheritLockNote`); bind ⌫ on a focused
  section; implement `onMakeTheme`.
- Phase 4: the Typography section edits `profile.font` (Screen) and `general.font` (All screens); decide whether a
  saved Theme (`appearance-preset-apply.ts`) carries the font.
- Phase 5 (Settings › App): add `allow-server-status`, `allow-update-state` and `allow-get-settings` to
  `STUDIO_PERMISSIONS`; the status bar then has its first values without waiting for an event.
- Panel widgets ("Follows panel", AUDIT A4) have no chip level yet.

## Phase 2: shell

The studio is now a column: title bar 40, body row (labelled rail, view), status bar 26. Checked by typecheck, tests
and build, and by eye in headless Chromium at 1440 and 1000 px (design, Layers tab, switcher popover, Live popover,
every rail view, Screens, the status bar's Data item; no console errors beyond the dev server's missing API).

| Piece | State |
|---|---|
| Title bar (§3.1) | `studio-top-bar.tsx`: mark, `ScreenSwitcher` (`screen-switcher.tsx`: screens with size, the current screen's pages indented, Manage screens…), centred command entry (opens the palette, `Ctrl+K` cap), Undo / Redo, Import and Export, `LiveControl`, Save with the dirty dot, `⋯`, window controls (Tauri only). The bar and its empty space are the drag region. |
| Import / Export | Interim: each is one button opening a small menu over the existing paths (Import: InfoPanel profile…, Config file…; Export: Config file, InfoPanel canvas…). On a phone they live in `⋯` as before. Copy profile JSON, palette, shortcuts, reset and the build id stay in `⋯`. |
| Live (§3.3) | `live-popover.tsx`: green `Live · N` button (N from `kiosksOf`), the popover with "Live control" and its sub-line, the kiosk rows (screen · page, address) and the header action "Open kiosk view" (replaces the top-bar button, PLAN decision 6). The controls are Phase 6. The status bar's Kiosks item opens it (`ui.liveOpen`). |
| Rail (§3.2) | `left-rail.tsx` rewritten: 72 px, labelled Design · Theme · Library · Data · Alerts & Island · Help · Settings. Every item is a view; Help opens at the article for the current view (the F1 target). Under 960 px it is 48 px, icon only, with tooltips (`railWidth()` feeds the layout maths). Settings shows on both platforms. |
| Design left panel (§6.1) | `design-left-panel.tsx`: segmented Layers \| Add widget, 232 px (still drag-resizable up to 440, `studio.drawerWidth` kept). Open by default from 1280 px, toggle at the start of the page-tab row (`PageTabs`), gone from the zoom bar. Layers: the `edit` mark is a pencil on the existing `follow` data, size in mono, hide / delete on hover or focus, right-click opens the zone menu. Add widget: the existing groups and My panels, ending in the link "Canvas from an .infopanel file → Import". |
| Interim views | `interim-views.tsx`: Alerts & Island (the alerts and Dynamic Island panels, tabbed), Screens (the Profiles panel; reached from Manage screens… and the zoom bar's size link), Settings (desktop: a button to the existing Settings window at the linked section; browser: the §10.1 notice). Library keeps a "Gauges →" strip to the old Gauges page. |
| Status bar (§3.4) | Mounted with `useStatusBar(control, saveState)`; Data → Data view, Server and Update → Settings, Kiosks → Live popover. The title bar no longer shows "Offline · edits kept locally": the status bar's save state does. |
| `navigateTo` | Alerts & Island, Screens and Settings › App open the interim views. Other Settings tabs still open the profile inspector's Behaviour tab. |
| Retired | `studio-drawers.tsx`, the drawer state (`useStoredDrawer`, `Drawer` as state), `DrawerSplitter` / `LeftDrawer` (moved into the left panel), `ProfileSwitcher`, `profileSummary`. The palette's `drawer` command stays and maps: Add / Layers to the left panel, Profiles to Screens, Alerts / Island to Alerts & Island. |

No test changed or added: the shell is composition only (no new pure logic), and the suite passes unchanged.

### Deviations

- **Icons are lucide**, as in Phase 1.
- **Left panel keeps its resize splitter** and stored width (range now 232 to 440). The spec makes the width a Settings › Studio slider (Phase 5).
- **Left panel tab defaults to Add widget** (the old default drawer), not Layers.
- **The zoom bar's size link opens Screens but does not pass the screen**: the edited screen is already the selected one.
- **Settings › App on desktop no longer opens the window on a status-bar click**; it opens the interim Settings view, whose button opens the window.

### Unverified

- Desktop (Tauri): window controls, drag region and the Settings button were not run.
- A kiosk in the Live list (no server with a control stream was running).
- Phone widths (< 600 px): the rail is still the 48 px side rail (Phase 7 makes the bottom tab bar); not looked at.

### Follow-ups

- Phase 3: the page-tab row's kiosk marker and chip, the removal of Play/Pause and ⋯ › Theme…; the Screens view's size link should pass the screen.
- Phase 5: replace the three interim views; delete the "Gauges →" strip when Gauges is a Library collection; the left-panel width slider; the `navigateTo` fallback to Behaviour for Dashboard / Studio Settings tabs.
- Phase 6: the Import door and Export sheet replace the two menus; Live gets its controls.
- Phase 7: help copy still says "Kiosk view" in `src/help/articles/studio.md` and the palette still lists "Profiles"; the phone bottom tab bar; the narrow floating inspector.

## Phase 3: Design mode

Checked by typecheck, tests and build, and by eye in headless Chromium at 1440 px (Page inspector, page-tab menu, Style
tab toolbar and gallery, chip menu, Make this the theme dialog, Data and Behaviour tabs, ⌫ reset; no console errors beyond
the dev server's missing API).

| Piece | State |
|---|---|
| Page inspector (§6.4) | `page-inspector.tsx`, shown with nothing selected. Header (page icon, `Page · name`, `screen · N zones`, Help), Name (committed on Enter / blur), Icon (opens the icon dialog), Rotation LinkRow (→ Screens), THIS PAGE'S LOOK cards (one per section the page customises, each with the `Custom here` chip over `sectionInherit`), "Everything else follows ‹screen›." / "This page follows ‹screen› completely.", Edit in Theme ↗ and Customise a section… (Theme at page scope), LIVE · NOT SAVED "Show this page on kiosks now" (`postControl("page")`), Duplicate page, Delete page (confirm in the page tabs; disabled for the last page). |
| Old profile inspector | Kept reachable: a "More settings for this screen" block of three LinkRows (Layout, Look, Behaviour) opens the old Layout / Look / Behaviour tabs in place of the Page inspector (`ui.screenSettingsOpen`; `openDocumentTab` sets it, selecting a zone clears it), with a back arrow in its header. Phases 4–5 move the contents and delete it. |
| Zone inspector chips (§4.3, §6.3) | The Follow bars are gone from zones. Each Style / Data / Behaviour card with a theme section has the `InheritChip` in its header (`SettingSection.chip`, outside the toggle button), the action line under the rows (Reset to inherited · Customise here · Edit ‹level› ↗ · Edit lock in Theme ↗), the amber `InheritLockNote` for a kept override, and ⌫ to reset while the section holds focus (not in a field). `section-inherit.tsx` builds them over `inheritanceApi` (the non-hook core of `useInheritance`). The header shows `N changed` as muted text. |
| Editing customises | A row edit in a following section turns the section custom in the same undo step (`customised` in `zone-fields.ts`); a locked section's rows are read-only. |
| Style tab (§6.3) | Order Skin · Colors · Typography · Shape & spacing · Surface & effects · Border & glow · Advanced · CSS & locks (`SHARED_SECTIONS`, which the Theme editor shares). Widget colors merge into Colors (`mergeWidgetColors`; its chip covers `colors` and `palette`, `chipSections`). Zone frame was already inside Border & glow's More. The "Changed" filter and the Copy / Paste / Use as global / preset menus are removed. |
| Style toolbar | `style-toolbar.tsx`: Start from a Style ▾ (gallery: built-in Default / Dark / Light / Vivid / Mono from `lib/builtin-styles.ts`, plus `config.stylePresets`; applying uses `withPastedStyle`, so its sections turn custom), Save as Style (inline name, `config.stylePresets`), Make this the theme for… ▾ (All screens / This screen / This page). |
| Make this the theme | `makeTheme` / `makeThemeSections` in `inheritance-actions.ts`: the widget's custom, unlocked sections move into the scope (All screens = `config.style`, screen = its theme values, page = its theme values plus the page customising them), and the widget's own values for them are dropped so it follows again. `MakeThemeDialog` confirms with the list. The chip menu's "Make this the theme for… ▸" moves just that card's sections; the toolbar moves all. |
| Data / Behaviour | Data: a LinkRow "Rename sensors and change the connection in Data ↗" under Bound data. Behaviour: Thresholds, the widget's own, Motion, then the island card, renamed "Send to island", with the note "How the island looks is set in Alerts & Island ↗". |
| Config v10 | `CONFIG_VERSION` 10. `migratePlacementV10` / `migrateProfileV10` (`settings-migrate.ts`) drop the zone `settings.preset` key, nothing else, keyed on its presence. A profile file goes through `mergeConfig`, so imports are covered. The row is gone from `STANDARD_SETTINGS`. Nothing read the key (picking a preset wrote `surface` / `tint` / `accent` into the zone), so rendering is unchanged. |
| Page tabs (§6.2) | 38 px row; the kiosk page has a green cast icon; right side: dashed chip "Kiosks show ‹page› · rotation ‹paused or every N s›" opening Live ("No kiosk shows this screen" when the control state has none). The tab menu (right-click and ⋯): Rename, Icon…, Duplicate, Delete, Page settings (shows the page, deselects). Removed: ⋯ › Theme…, Show on kiosk, Play / Pause, "Back to the saved setting". Double-click rename was already there. |
| Live | The popover carries a minimal "Page rotation" Pause / Play (`RotateToggle`, with its "Back to the saved setting") for the edited screen, so the runtime pause is not lost until Phase 6. |
| Labels renamed | "Save as panel preset…" → "Save as Panel" (inspector, zone menu, palette); "Follow global style" → "Follow the theme"; "Use as global style…" / "Global style: …" → "Make this the theme for all screens / this screen" (menu and palette); "Style presets" → "Styles" and the copy-a-look section in two Help articles. |

Tests: `settings-migrate.v10.test.ts` (round trip: Dark / Light / Vivid / Mono zones resolve identically bar the dropped key,
only-preset zones, identity no-op, idempotence, a profile file); `makeTheme` / `makeThemeSections` cases in
`inheritance-actions.test.ts`; `customised` in `zone-fields.test.ts`; `chipSections` and `mergeWidgetColors` cases. Existing
tests changed because the intended names / order / merge moved: `inspector-model`, `inspector-categories`, `look-settings`
(section titles and order, Widget colors inside Colors, the styleTools extra gone, "Send to island"), the two widget schema
snapshots (titles and order only; checked by diffing the headings), and the version literals (`layout`, `layout-pages`,
`canvas-store`, `appearance-presets` 9 → 10).

### Deviations

- **The Style toolbar wraps** to a second line at the 320 px inspector: the three spec labels need about 330 px, and
  truncating them left "M…". Everything else is as written.
- **Style tab "Colors" keeps two theme sections.** Widget colors stay the `palette` flag in the data model (no change),
  so one chip drives both: custom if either is, Reset / Customise act on both.
- **Make this the theme drops the widget's own values** for the moved sections (a true move), where Reset to inherited keeps
  them stored.
- **Multi-select and panel-widget inspectors keep their Follow bars** (SPEC §6.3 is the zone inspector; panel widgets have
  no chip level, see Phase 1's follow-ups). Only the Changed filter went from them too.
- **No Help icon in the zone header** (the Page inspector has one); F1 and the rail still work.
- **`Edit in Theme ↗` / `Customise a section…`** open Theme at page scope; `section: "customise"` is a target Phase 4's
  list will mark. Rotation's `Screens ↗` passes `section: "rotation"` likewise.

### Unverified

- The kiosk chip with a kiosk connected (no control server ran), and the Live rotation toggle against a real server.
- The Page inspector in the narrow floating inspector and the phone sheet (it is a plain scroll column there; Phase 7).
- Right-click Rename / Icon… / Delete on a tab and the Page inspector's Delete confirm were not clicked through (the
  handlers are the existing ones).
- A real v9 file imported through the UI (covered by the migration test, not by hand).

### Follow-ups

- Phase 4: Theme's scope bar replaces `editGlobalTheme`; mark `data-nav-section="customise"`. The Theme editor's `FollowBar`
  and `ThemeScopeBar` can go with the Follow bar for panel widgets.
- Phase 5: delete the "More settings for this screen" block and `DocumentInspector` once Screens and Settings hold their
  contents.
- Phase 6: Live's rotation control replaces the interim Page rotation toggle.
- Phase 7: the zone header's Help icon; "Style presets" in `library.md`; "Appearance" in `presets.md`.

## Phase 4: Theme editor

One editor for the look at every scope replaces the rail Theme page and the profile inspector's Look tab. Checked by
typecheck, tests and build, and by eye in headless Chromium at 1440 and 1000 px (Screen, All screens and Page scopes,
lock toggle, Customise a section, Apply a theme here…, Save as Theme, a zone chip's Edit Screen ↗, the palette's
Theme › Background, Page inspector › Customise a section…; no page errors).

| Piece | State |
|---|---|
| Top bar (§7.1) | `theme-editor.tsx`: "Theme", "Editing for", the scope bar (`theme-scope-bar.tsx`: All screens · N screens › ‹screen› · W×H · N own › Page: ‹page› · N own, active on `#26262c`; the screen and page buttons have a dropdown for another screen or page, keeping the level), Lock all / Unlock all at Screen scope, Apply a theme here…, Save as Theme. It wraps below about 1200 px. The screen and page default to the Design selection (`ui.themeProfileId` / `themePageId` unset); the rail keeps the level it was left at. |
| Apply a theme here… / Save as Theme | `theme-gallery.tsx`: saved Themes (`config.appearancePresets`, with ⋯ Rename… / Delete as before) and the six built-in palettes, Include background, applied at the scope (`applyThemeAt`; a page takes the widget style only, its sections turn custom, locked ones are skipped; palettes and the background are disabled on a page: "Set per screen"). Save as Theme takes a name, Include background on by default, and saves the resolved scope (`themeFromScope`: tokens + radius, the widget style with a page's customised sections over its screen's, the background). |
| Left column (§7.2) | 360 px: the scope help line (verbatim per scope), **1 · Start from** (All / Screen only, `theme-start-from.tsx`: palettes, skins, saved Themes; 16:10 swatch, name, kind; white 2 px border on the current palette, skin and saved Theme; All themes in Library ↗), then the ten cards in order (`theme-cards.ts` `THEME_CARDS`). Each card (`theme-card-list.tsx`): step number, name, lock toggle at Screen scope except on Background and Advanced (Lock / Locked, the §7.2 tooltip), the chip, chevron; open: rows, then Reset to inherited · Customise here · N changed · "N widgets override this" (+ "— ignored while locked"); ⌫ resets a custom card. Colors is open by default; the accordion preference applies. |
| Stores per card | Colors = color tokens (`config.theme` / `profile.theme`) + widget colors and Status & series colors (`colors`, `palette`); Typography = page font (`general.font` / `profile.font`, PLAN decision 10) + widget type; Shape & spacing = corners (`config.radius` / `profile.radius`) + spacing; Surface & effects = surface (Opacity, Blur) + the skin section's rows; Background = `config.background` / `profile.background`; the rest one section each. Every control writes its own store. |
| Page scope | Only the cards the page customises, then **Customise a section for this page** (`data-nav-section="customise"`): Background "Set per screen", locked cards "Locked by Screen", Shape & spacing "Spacing only"; Colors allowed (PLAN decision 13). On a page the tokens, page font and corners are LinkRows "Edit on ‹screen› ↗" that switch the scope. |
| Right area (§7.3) | `theme-preview.tsx`: "Live preview · ‹screen› / ‹page›", the real page (`ProfilePage`, now with `pageId` and a `badge` slot) at the scope's resolved theme (`previewProfile`: All screens without the screen's and pages' own look, a screen without its pages'), scaled to fit, with the 16 px accent edit badge on widgets that don't follow. Exceptions (`theme-exceptions.ts`): All lists screens, pages and widgets; Screen pages and widgets; Page widgets. Rows have icon, who, kind, "‹Card› customised / set for this screen", the locked chip when the lock ignores it, the custom chip and Make it follow; then Make all follow and the empty-state copy. |
| Retired | `profile-look.tsx` (Look tab: Theme, Widget style, Background, the All profiles / This profile switches, Apply to every widget, Edit widget style ↗, Saved looks), `appearance-gallery.tsx`, `skin-gallery.tsx`, `surface-picker.tsx`, `theme-panel.tsx`; the old Theme page's Follow bars, preview chips and "Who doesn't follow" (`themeFollowFields`, `overridesOf`, …); the `look` dashboard tab and its `lk-*` sections; `globalStyleValues`, `lockState` / `toggleLockAll`, `withRadius`, `appliedMessage`, `themeRows`. |
| Links | Page inspector › Look → "Edit in Theme ↗" (Screen scope); Edit in Theme ↗ / Customise a section… (page scope, the list is focused); chips' Edit ‹level› ↗ open the card (Widget colors → Colors, Skin → Surface & effects in `inheritanceJump`); the palette's "Go to setting" opens the card and focuses the row. `focusNavTarget` now skips disabled controls. |
| Palette | Appearance… → **Theme**, Background… → **Theme › Background**, Font… → **Theme › Typography** (`open-theme`), "Theme editor…" merged into Theme, Apply appearance: ‹x› → **Apply theme: ‹x›** (group Themes, All screens). The empty-canvas menu's Edit theme opens Theme like the rail. |
| Help | `themes.md`, `presets.md`, `background.md`, `profiles.md`, `quickstart.md`, `widget-settings.md` describe Theme instead of the Look tab. |

Tests: `theme-cards.test.ts` (cards per scope and the page's disabled reasons, chip states, lock and unlock keep
overrides, page-font writes per scope, tokens and radius apart on a screen), `theme-exceptions.test.ts` (lists per
scope, ignored under a lock, Make it follow resets exactly one, Make all follow per scope with the page's own sections
untouched, preview levels), and Theme scope cases in `appearance-presets.test.ts` (apply at a page, Include background
off and on, save a page's resolved look, save a screen and apply it to All screens). Existing tests changed because
the retired code went: `theme-editor-model.test.ts` (the Follow-bar and "Who doesn't follow" cases removed),
`profile-scope.test.ts` (Corners `withRadius` and Apply to every widget removed), `appearance-actions.test.ts`
(`appliedMessage` removed), `inspector-model.test.ts` (dashboard tabs are Layout and Behaviour; the Look sections and
`globalStyleValues` cases removed).

### Checkpoint (SPEC §14)

- **Change colors for everything:** rail **Theme** (1) → **All screens** (2): Colors is open with the tokens. 2 clicks.
- **Give one screen its own look:** rail **Theme** (1) opens at the screen (Screen is the default level) → edit any
  card; it reads Custom here at once. 1 click, or 2 when Theme was last left at another level (Theme → ‹screen›).
  No switch to flip; Lock is optional.

### Deviations

- **A saved Theme does not carry the page font.** SPEC §7.1 lists tokens, widget style and background; adding the font
  would change the `appearancePresets` shape. Save keeps it out, Apply leaves the font alone.
- **Lock all locks all 11 sections, Advanced included** (as the palette's lock-all and the old Lock all did, IA_AUDIT
  §6.1); only the per-card toggle is absent on Advanced. Unlock all clears every lock.
- **Surface & effects also holds the skin section** (skin, ring / bar thickness, graph and meter style): its chip,
  lock, Reset and exceptions cover both. The skin is still picked in Start from.
- **Start from shows the current skin; the other 13 sit behind More (13).** All 20 built-ins pushed Colors below the
  fold at 900 px, against §14's two-click path.
- **"N changed" is on the card's action line**, not the header: at 360 px the header has no room beside the lock and
  the chip.
- **Include background is explicit**: off never writes the background, on always does (the old gallery's default
  wrote one where none was set). The palette's Apply theme keeps the old default.
- **Customise here on a screen copies All screens' values**: the color tokens, the radius, the font or background, and
  the widget-style keys All screens sets (Phase 1's rule). Colors and Shape & spacing split the old single Theme switch:
  the tokens and the corner radius reset separately.
- **The labels Opacity and Blur are Theme's only**; a widget's Surface & effects keeps "Surface opacity (%)" and
  "Background blur" (changing the shared labels would move the widget schema snapshots; left to Phase 7's label sweep).
- **Exceptions are one row per holder and card**, not per section (Widget colors and Colors make one Colors row).
- **Performance keeps its All profiles | This profile switch** in the old profile inspector's Behaviour tab (moved into
  `profile-behaviour.tsx`); it is Phase 5's (Screens › Performance chip).

### Unverified

- Desktop (Tauri) not run. A Library drag onto Theme's background editor was not tried.
- Widths below 1000 px: the 360 px column does not adapt yet (Phase 7).
- Rename / Delete of a saved Theme from Apply a theme here… was not clicked through (the handlers are the old ones).

### Follow-ups

- Phase 5: Library › Themes (All themes in Library ↗ opens the Library at its default view); Screens › Performance
  replaces the last scope switch, then `ScopeSwitch` / `ScopeDot` and the performance `scopeOf` can go; delete the
  "More settings for this screen" block.
- Phase 7: `FollowBar` / `ThemeScopeBar` (`follow-bar.tsx`, `settings-panel.tsx`) only serve the multi-select and panel
  widgets now; `countOverrides` / `clearOverrides` / `saveAppearancePreset` in `appearance-preset-apply.ts` are unused
  outside their tests; the label sweep (Opacity / Blur on widgets, "Lock every theme section", "Make all widgets follow
  the theme", "Theme scope: …" in the palette); the Theme column on narrow and phone layouts.
