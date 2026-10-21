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

## Phase 5a: Screens and Settings

The Screens view and Settings replace their interim views, and the old profile inspector is gone. Checked by typecheck,
tests, build, `npm run desktop:settings` and `cargo test`, and by eye in headless Chromium at 1440 px (Screens with
the launch rule, a card's ⋯ menu, the performance chip going Custom, Settings › Dashboard / Studio / App in a browser,
the Reset confirm) and, with a stubbed `__TAURI_INTERNALS__`, Settings › App on desktop (General, Server with the
restart bar, Updates with the amber dot, the status bar's Server, Update and restart items); no page errors.

| Piece | State |
|---|---|
| Screens (§8) | `screens-view.tsx`: header (**Import a screen…** = the existing profile-file import until Phase 6's door, **New screen**), **When the app opens** (radio cards writing `config.activeProfile`: "auto" / an id + a screen picker; `launchRule`, `withLaunch` in `screens-model.ts`), the card grid (snapshot thumbnail in a 110 px well, tag **Best fit now** / **Opens on launch**, mono meta `1920×550 · 3 pages · grid 8 × 3`, selected = white border, ⋯ Rename (inline) · Duplicate · Always open this one · Export screen · Delete with confirm, off for the last screen). A card click selects the screen being edited (`studio.pinnedProfile`, PLAN decision 1). |
| Detail panel (340 px) | `screen-detail.tsx`: SIZE & FIT and GRID (the old Layout controls, `screen-layout.tsx`), ROTATION (Rotate pages, Every, "Pause it for now from Live ↗" opens the Live popover), PERFORMANCE (`InheritChip` over `inheritanceApi("performance")`: From All screens / Custom here; editing a row customises first, `withScreenPerformance`), LINKED — EDITED ELSEWHERE (Look: N own sections → Theme at that screen; Dynamic Island On/Off → Alerts & Island), PAGES · ORDER & ROTATION (`screen-pages.tsx`: drag handle, icon, name, in-rotation toggle, Open → Design on that page; `+ Add page` in the header). Groups carry `data-nav-section` (`size`, `grid`, `rotation`, `performance`, `linked`, `pages`); Frame-rate cap is `data-nav-control="fps"`. |
| Settings (§10.1) | `settings-view.tsx`: tabs with subtitles (Dashboard `every screen`, Studio `this browser`, App `this PC` / `desktop only`), 560 px column. **Dashboard** (`settings-dashboard.tsx`): Performance (the All screens default, plus "‹screen› uses its own (30 fps). Screens ↗" when the edited screen has its own), Clock & date, Kiosk (Page dots & swipe, Hide cursor), Danger zone (Reset everything…, whose confirm now says **Back up first**; the ⋯ menu entry is gone). **Studio** (`settings-studio.tsx`): Quick bar, Inspector sections, Default zoom (the canvas zoom, which is remembered), Show grid, Show rulers, Left panel width (`studio.drawerWidth`, 232 to 440). **App**: desktop = the ported pages; browser = the notice card with Server (read-only), Kiosk URL (Copy) and Desktop version (the studio's build id; the browser cannot read the app's version). |
| App tab (PLAN decisions 2, 5) | `src/settings/embedded.tsx`: a lazy chunk (`lazy(() => import("@/settings/embedded"))`, only when `isTauri()`), so `@tauri-apps/api` stays out of the studio chunks (checked in `dist/assets`: only `core-*` and `event-*`). It reuses the settings pages, store and restart bar as they are, with a 180 px sub-nav of the eight real pages (General, Server, Coding agents, Updates with an amber dot while an update is available, Diagnostics, Logs, About, Changelog). The pages list moved to `src/settings/pages.ts`; `StoreProvider` takes `initialSection`. CSS: the `s-*` color tokens moved to `src/settings/tokens.css` (imported by `settings.css` and by `index.css`), and `embedded.css` holds what `settings.css` sets on html and body, scoped to `.s-scope`. |
| Shell | `STUDIO_PERMISSIONS` (`src-tauri/src/control.rs`) gained exactly the commands `src/settings/ipc.ts` calls: `get_settings`, `set_setting`, `server_status`, `start_server`, `stop_server`, `restart_server`, `server_stats`, `foreign_server_info`, `use_foreign_server`, `stop_foreign_server`, `list_local_addresses`, `set_agents`, `agents_status`, `repair_agents`, `open_agent_backups`, `update_state`, `check_for_update`, `download_update`, `cancel_update`, `install_update`, `get_diagnostics`, `open_logs_folder`, `open_devtools`, `read_log`, `reveal_path`, `app_info`, `changelog`, `open_external` (`set_zoom` and `open_help` were there). `allow-open-settings` left the list: nothing in the studio opens the window. Tray **Settings** and **Update…** call `windows::show_settings_in_studio`: show the main window and, when it holds the studio, emit `studio://open-settings` (payload the section or null), which `use-studio-ui.ts` turns into `navigateTo` Settings › App (`onOpenSettingsRequest` in `desktop.ts`). The separate window is still `windows::show_settings`, reached from `start.html`'s buttons (`open_settings` is in the default capability). |
| Status bar | The first reads (`server_status`, `update_state`, `get_settings`) are now permitted, so Server `:port · LAN`, the update item and "Restart server to apply" show on desktop without waiting for an event. |
| `navigateTo` | Screens (`profileId` selects the screen: `screenRequest` applied in `studio-view.tsx`, so the zoom bar's size link and the Page inspector's Rotation link now pass it), Settings (`tab` dashboard / studio / app, `section` an App page). `performance` targets from the chips land on the Settings Performance group and the Screens PERFORMANCE group with Frame-rate cap focused. |
| Retired | `document-inspector.tsx`, `inspector/profile-behaviour.tsx` (`ScopeSwitch`, `ScopeDot`, the Pages, Clock and Display bodies), `inspector/profile-header.tsx`, `inspector/app-settings-footer.tsx`, `profiles-panel.tsx` (`RenameInput` moved to `rename-input.tsx`), the interim Screens and Settings views, the Page inspector's "More settings for this screen" block and `ScreenSettingsTab`, the `dashboard` inspector context with its Layout / Behaviour tabs and sections (`inspector-model.ts`, `section-icons.ts`), `ui.screenSettingsOpen`, `documentTabRequest`, `renameRequest`, `openDocumentTab`, the title bar's ⋯ › Reset everything…, `openSettings` in `desktop.ts`, every "Applies to all profiles" note. `use-document-props.ts` became `use-style-edits.ts` (the palette's scope style writer and the saved Themes; the clock and performance writers moved into Settings). Palette: "General settings…" → **Settings**, "Connection…" → **Data › Connection**. Help: `profiles.md`, `performance.md`, `kiosk.md`, `problems.md`, `sensors.md`, `studio.md`, `quickstart.md`, `widget-settings.md`, `panel-widgets.md` name the new homes. |

Tests: `screens-model.test.ts` (the launch rule reads and writes, including a stale id and an unknown id; the card tag;
the meta line; a screen's own performance starting from All screens' values and patching one key; the Settings note's
text; which pages the rotation includes and refusing to switch out the last one); `onOpenSettingsRequest` in
`desktop.test.ts`; in `control.rs` a test that `STUDIO_PERMISSIONS` has no duplicates, leaves out `open-settings` and
has the commands the pages need. Tests changed because the retired code went: `inspector-model.test.ts` (the dashboard
context, its tabs, sections, search and `DOCUMENT_CARD` cases removed), `desktop.test.ts` (`openSettings` swapped for
`onOpenSettingsRequest`).

### Checkpoint

- **Pause rotation or reorder pages:** Screens (title bar switcher › Manage screens…) → PAGES · ORDER & ROTATION.
- **Cap one screen's frame rate:** Screens → PERFORMANCE → click a value (the chip turns Custom here). For every
  screen: Settings › Dashboard › Performance.

### Deviations

- **Size preset stays** as a row above Width and Height (SIZE & FIT lists Width, Height, Match this window, When it
  doesn't fit); dropping it would have lost the preset list and its "not a preset" handling.
- **Rotation has no interval preset buttons**: "Every" is the number field the spec lists; the 10 s / 30 s / 1 min /
  5 min shortcuts and the old list's delete-page button are gone (deleting a page stays in the page tabs and the Page
  inspector).
- **The card ⋯ menu keeps Always open this one** and drops Copy profile JSON (it is still in the title bar's ⋯ and the
  palette). "Export screen" is the existing profile-file export until Phase 6's sheet.
- **Rename is inline on the card**, not a field in the detail panel (the old Name field went with the inspector).
- **Default zoom is the remembered canvas zoom** (`studio.zoom`): picking a value zooms the canvas now, and the zoom you
  leave it at is what the studio opens with. There is no separate stored default.
- **The Desktop version row in a browser shows the studio's build id** ("build 2026-10-09a"), the only version a browser
  can know.
- **Connection (the Data API URL) sits in a collapsible strip above the Data view** until Phase 5b gives Data its own
  card (`ConnectionStrip` in `interim-views.tsx`, `data-nav-section="connection"` so the status bar's Data item still
  lands on it and opens it).
- **No search in the App sub-nav**: the settings window's search and found-row outline are not carried (the sub-nav is
  the spec's plain list), and F1 inside the App tab opens the studio's own Help target, not the page's.
- **Back up first is the existing Export config**, as before under the old name.

### Unverified

- **The desktop app itself.** Settings › App was run in headless Chromium against a stubbed `__TAURI_INTERNALS__`; the
  real capability grant (`add_studio_capability`), the tray entries and `studio://open-settings` were not run.
- **A tray click while the studio window does not exist yet** (the app started hidden): `show_main` builds it and the
  event goes out before the page can listen, so Settings does not open. A window that is open or hidden to the tray
  receives it.
- Widths below 1000 px for Screens (the 340 px panel stays beside the grid) and Settings.
- Dragging a page row in Screens and the in-rotation toggle were not clicked through (the drag is the old list's code).

### Follow-ups

- Phase 5b: Data's own Connection card replaces `ConnectionStrip`; Alerts & Island replaces the interim panels (the
  island card there still serves the Dynamic Island link).
- Phase 6: Import a screen… and Export screen use the Import door and the Export sheet.
- Phase 7: the Help window's "Open settings" links (`src/help/env.tsx`) still open the separate window; they should ask
  the studio for Settings › App when it is up. `scopeOf` and `LookScope` in `profile-scope.ts` are now used only by
  `withScope` and its tests.

## Phase 5b: Data, Alerts & Island, Library

The last three interim views are real. Checked by typecheck, tests and build, and by eye in headless Chromium at 1440 px
(Data, the status bar's Data item focusing the URL, Alerts & Island in all four tabs with a new rule and its editor,
the island's Theme ↗ link and an Open widget ↗ landing on Send to island, Library › Themes / Styles / Gauges and the
gauge editor, Theme › All themes in Library ↗); no page errors beyond the dev server's missing API.

| Piece | State |
|---|---|
| Data (§10.2) | `sources-panel.tsx`: a 300 px left column with the **Connection card** (`connection-card.tsx`: pill `Connected · 18 ms` / `Slow · 640 ms` / `Can't reach the Data API` from the status bar's `dataApi`, Data API URL, Test connection, API index Open ↗; `data-nav-section="connection"`, URL `data-nav-control="url"`) above the source tree; main area point table **Sensor · Now · Display name · Used in** with "Display names apply to every screen." The status bar's Data item and the palette's Data › Connection now focus the URL. The point inspector, Endpoints and Add source stay. `ConnectionStrip` and the header's status pill are gone. |
| Display name | Per PLAN decision 8 a row edits its source container's existing `sourcePrefs[key].displayName` (a plugin's container; any other source as a whole), shown on every row of that group, with the source's own name as the placeholder (`pointDisplayName`, `prefKeyOf` moved to `explorer-model.ts`; the write is `withSourcePref`, which drops an emptied name). |
| Used in | `screensUsing` (`data-usage.ts`) runs `computeUsage` over every screen: names up to two, then "N screens", a dash for none. The old widget-level "Used by" is in the point inspector as before. |
| Alerts & Island (§10.3) | `alerts-view.tsx`: header, tabs **Rules · Island · Defaults · History**, **New rule** menu (`NewRuleMenu`: Blank sensor / Blank notification / Presets) on Rules. Rules (`alerts-rules.tsx`, was `alerts-panel.tsx`): "Alerts on", rows with the severity icon, name, the condition in mono, `‹severity› · shows as ‹style›`, the enabled toggle (plus last fired and hover Duplicate / Delete); a rule opens the existing editor in a 640 px column. Defaults (`alerts-defaults.tsx`): Default style, Position, Size, **Dim the page behind**, **Show for**, Quiet hours, **During quiet hours still show**. History: **Active now** (acknowledge / dismiss) on top, then the list, uncapped. |
| Island tab | `island-tab.tsx` over `inspector/island-section.tsx` (now two columns): "Island for" screen chips (any screen's island, not only the edited one), a preview pill, Show Dynamic Island, Shape, When idle, Look (Font is a LinkRow `‹font› · from Theme`, Theme ↗ → Theme › Typography at that screen), Clock format LinkRow (`24 h · from Dashboard`, Settings ↗ → Clock & date), Motion, alerts collapse and grouping; second column Dashboard notices, **Widgets sent to the island** (each with Open widget ↗: selects the screen, page and zone and opens Send to island in Behaviour; the note "Turn this on per widget: Behaviour › Send to island.") and "Alert rules" as a link to Rules (`N rules show here`). The "As General" Seconds / Hours rows, the Font select and the dead "Dashboard › General › Clock" path are gone. |
| Retired | `interim-views.tsx`, `AlertsPanel`'s drawer chrome, `IslandPanel`'s sections mode and its Widgets toggles and Alert rules list (`setZoneSetting`), `ConnectionStrip`. |
| Library (§10.4, PLAN decision 1) | Sidebar kept: **Smart** (All items, Recent, Unused, Large files, Duplicates, Suggested for theme), then **By type**: Themes · Styles · Panels · Gauges · Media (Images, Videos, Backgrounds, Icons, SVG templates under it) · Fonts · Canvases, each with a count and its §10.4 hint line under the title. Header: `Library`, "Everything you've saved, beside the built-ins.", search, Grid / Shelves, **Used by ‹screen›** filter, **Canvas files · ‹screen›**, **Add files…**. Cards: auto-fill 160, 4:3 thumb, name and a tag (**Built-in** muted, else accent: Saved, Image, Video, Icon, Imported …). Sort, tags, item actions, drag onto the canvas, Merge and the remove safety are unchanged. |
| Themes and Styles | `lib/my-library/config-items.ts` (moved out of `use-my-library.ts`): saved Themes (`config.appearancePresets`), the six built-in palettes, saved Styles (`config.stylePresets`) and the five built-in Styles, as read-only items (`cfg-theme:`, `builtin-theme:`, `builtin-style:` ids). New `LibraryKind` `theme` (config-only, never stored by the server) with a swatch thumbnail; its action is **Apply in Theme** (opens Theme; the scope is picked there). A Style applies to the selection as before. `isConfigItem` covers every stand-in, so none can be renamed or removed here. |
| Gauges | A Library collection: `GaugesPage` renders inside the Library (lazy) with the Library's list shared (`library` prop; `useMyLibrary(config, load)`), keeping presets, In ‹screen›, My library, the editor, Save as new / Save to library, Import .gauge.json / frames and New gauge. "Edit gauge…" from a zone or canvas item opens it there (`ui.openLibrary("gauges")`, `gaugeInitial`). The rail's separate Gauges mode, the "Gauges →" strip and `StudioMode` `gauges` are gone. |
| Links | `navigateTo({view: "library", tab})` takes a collection id (`ui.libraryRequest`): Theme's **All themes in Library ↗** opens Themes, the Background editor's library link opens Media. `navigateTo({view: "alerts", tab})` takes rules / island / defaults / history; the palette's Alerts and Dynamic Island drawers open Rules and Island. |

Tests: `config-items.test.ts` (Themes and Styles from the config plus the built-ins, swatches, every stand-in read-only and never
Unused, card tags, Themes / Media counts, the hint lines, `usedByScreen` ignoring the stand-ins), `island-panel-model.test.ts`
(the Font and Clock links, an island's own font / hours / seconds kept readable and handed back), `withSourcePref`, `pointDisplayName`,
`prefKeyOf` and `usedInCell` cases in the explorer tests, `screensUsing` in `data-usage.test.ts`. No existing test changed.

### Deviations

- **An island's own font, hours or seconds are kept, not migrated.** Clearing them would change what a kiosk renders. The
  rows show them as `from this island` with a small **Follow Theme** / **Follow the Dashboard** button that hands them back
  (the only way to clear them now); a fresh island has none. No stored key changed.
- **Island keeps its other rows** (Scale, Offset, Reserve space, Rotate, Stats, Color / Opacity / Border / Shadow / Weight,
  Collapse after, Group notices, calendar and OBS cards): the spec lists the main ones, and dropping the rest would lose settings.
- **Widgets sent to the island lists only those that send** and has no toggle (the toggle is the widget's Behaviour › Send to
  island: one home). A widget not yet sending is reached from the widget itself.
- **Profile assets became a button, not a filter.** "Used by ‹screen›" filters the library's items by their placed copies;
  the edited screen's canvas files (replace, optimise, uses) stay one click away as **Canvas files · ‹screen›**.
- **Shelves and the smart collections stay** as PLAN decision 1 says; the cleanup banner and Needs attention are as before.
- **Saved Themes and Styles are read-only here**: renaming and deleting stay in Theme's gallery and the Style toolbar.
- **The Library upload tile shows only where uploads belong** (All items and Media); Themes, Styles, Panels and Canvases start with their items.
- **Add files…** is the existing upload path; `.infopanel` files still route to the import dialog until Phase 6's door. The old
  header "Import profile" button is gone (the title bar's Import has it).
- **The Data header keeps Endpoints and Add source** above the two columns.

### Unverified

- Open widget ↗ from the chip of a screen other than the edited one: it switches the screen and page but was only clicked
  on the edited screen.
- Library › Used by with a real library (the dev server has no library API; items came from the config only), and Canvas files.
- Dragging a Theme or Style card onto the canvas, and Apply in Theme from the detail pane with a selection.
- Widths below 1000 px for Data, Alerts & Island and Library.

### Follow-ups

- Phase 6: Add files… and the Library's `.infopanel` routing use the Import door; the gauge editor's Import / Export route through §9.
- Phase 7: help articles (`gauges.md`, `library.md`, `sensors.md`, alerts and island) still describe the old Gauges page, "Style
  presets" and the drawers; the palette's "Dynamic Island" / "Alerts" drawer labels; comments that say "the Gauges page"; the
  Library's narrow layout (sidebar 216 px beside the grid) and the Data left column on narrow widths.

## Phase 6: Import door, Export sheet, Live

One door in, one sheet out, and Live with its controls. Checked by typecheck, tests, build and `cargo test` (112 pass),
and by eye in headless Chromium at 1440 px (the drop cover, the empty door, a mixed batch, a config backup with its
backup checkbox, a drop onto the open door, the Export sheet and its gauge chooser, Live, and the door opening from
Add widget, Screens, Library, Fonts and Gauges); no page errors beyond the dev server's missing API.

| Piece | State |
|---|---|
| Sniffer (PLAN 14) | `src/lib/import-sniff.ts`, pure: `sniffFile(name, type, bytes)` reads content, not the name. JSON by shape: a Studio profile (the envelope, or the bare profile "Copy profile JSON" used to give), a gauge spec (`format`), a config (a non-empty `profiles`). A zip by its entries: `canvas.json` = stored canvas, `manifest.json` with the frames format = frames zip, `Profile.xml` = InfoPanel export, any font file = font pack. `.infopanel` by extension. Images, videos, fonts and SVG by `classify` (magic bytes, size limits, unsafe-SVG scan); an SVG that reads `var(--value)` / `var(--percent)` is a gauge template, any other SVG an image. Anything else is unknown (a refused file keeps its reason). `destinationsOf(kind, current)` gives the radio cards, default first. |
| Import door (§9.1) | `import-door.tsx` (the 560 px dialog: header copy, Detected card with icon, mono name and green "Detected: …", Destination radio cards per group, the backup and background checkboxes, footer hint, Cancel, primary), `use-import-door.tsx` (state, the window-wide drop and the full-window "Drop to import" cover; a drop onto the open door adds to it; a field that takes the file itself, like a background picker, keeps it), `import-door-actions.ts` (`restoreConfig`, `runImport`), `import-door-library.ts` (gauges, frames zips, images, videos, fonts and font packs into My library). Opened from the title bar, the palette (**Import…**), Screens (**Import a screen…**), the Library (**Add files…**, the upload tile), Fonts (**Add fonts**), Gauges (**Import…**), the gauge editor (**Import**) and Add widget (**Canvas from an .infopanel file → Import**, which opens with Canvas zone chosen) through `file-doors.ts`. |
| What each kind does | Config: **Replace everything** (default) writes the backup file first when "Back up the current dashboard first" is on (it stops, replacing nothing, if the backup cannot be written), then replaces in one undo step; **Add its screens only** adds each screen with fresh ids and a free name. Profile: a new screen, then Screens. `.infopanel` / stored canvas: the existing wizard with the destination chosen in the door and no "Lands in" step (`lockDest`). Gauge / SVG / frames zip: saved to Library › Gauges and opened in the editor. Image / video / font / font pack: saved to Library › Media or Fonts (a file already there is reported, not added twice), with "Also use ‹file› as the background for ‹screen›". Several files: grouped, one row each; a file it does not recognise says "We don't recognise this file." and the rest go on; one config and one InfoPanel file per run. |
| Export sheet (§9.2) | `export-sheet.tsx`, 520 px: Back up everything (**Save backup**, primary), Export this screen, Export a page for InfoPanel (**Export…**; disabled with its reason when the page has no canvas zone, PLAN 11), Export a gauge (**Choose…** lists Library › Gauges; the gauge editor's Export opens it with that gauge chosen). Each row has a **Copy JSON** link that copies `FilePayload.text`, the very text the file writer gets (`configPayload`, `screenPayload`, `gaugePayload`, PLAN 12; the page row copies the canvas's stored JSON). A Screens card's **Export screen** opens it on that screen. |
| Live (§3.3) | `live-popover.tsx` + `live-model.ts`, all on the control API: **Show on ‹screen› kiosks** (the screen's pages, segmented), **Rotation** (toggle plus the two notes: "Following the saved setting: every 20 s." and "Paused for now. Saved setting: every 20 s — resumes on reload."; flipping back to the saved value clears the override), **Dim screens** (slider, 10 % steps, Off at 0), **Mute alerts for 1 h**, **Dynamic Island** (runtime), **Reload all kiosks**. Offline it says so and disables the controls. Nothing writes the config. The interim rotation toggle (`rotate-toggle.tsx`) is gone; the tab-row chip already read the runtime pause. |
| Tauri | `windows.rs`: the main window is built with `disable_drag_drop_handler()`. On Windows Tauri's handler takes file drops from the page and HTML5 `drop` never fires, so the door's drop (and the Library's old one) needed it off. Settings and Help windows keep it. |
| Retired | The title bar's Import / Export menus, ⋯ › Export config, Import config…, Import InfoPanel profile…, Export InfoPanel canvas…, Copy profile JSON (title bar, Screens menu, palette), the hidden config input, `startConfigImport` / `importConfigFile` / `importConfigText` / `copyProfileJson`, `startProfileImport` / `importProfileFile` / `loadProfileText`, Screens' own import, the Library's `fileDrop` and header input and the `onProfile` hand-off of `addFiles`, Fonts' file input and zip unpacking, `ImportGaugeButton` / `ImportFramesButton`, the gauge editor's in-place import. The ⋯ menu stays for the palette, shortcuts and the build id (their Phase 7 homes), and on a phone for Undo / Redo, Import and Export. |

Tests: `import-sniff.test.ts` (every type from its bytes, a zip as frames / stored canvas / InfoPanel export / font pack / none,
an unrelated manifest, a truncated zip, the unknown message, a refusal that keeps its reason, the destinations),
`import-door-actions.test.ts` (replace backs up first by default and not when off, nothing replaced when the backup fails or the
file is not a config, add-screens keeps what is there with fresh ids and free names, the door restoring with the backup written
before the replace, a profile envelope through the door as a new screen with its contents intact, names within a batch, an
unknown file reported while the rest go on, one config / InfoPanel file per run, the wizard's destination), `live-model.test.ts`
(each Live action posts to its own control route and to nothing else, so the config and the undo history are never touched; the
saved-value toggle rule; both rotation notes; the mute deadline), and the Copy JSON = file payload cases in `config-file`,
`profile-file` and `gauge-studio/import-file` tests. Tests changed because the retired code went: `config-file.test.ts` (the
native-dialog and file-input import cases and the `importConfigText` callback API replaced by `readConfigText` cases),
`commands.test.ts` (no `copy-profile` command), `use-my-library.test.tsx` (`addFiles` lost its `onProfile` argument).

### Deviations

- **The page row's options live in the export dialog.** "Bake vector gauges first", "Leave unused assets out" and Stored form /
  .infopanel are the existing Export dialog's controls (with the font licence review), and **Export…** opens it; the sheet
  names them and does not repeat the switches.
- **Copy JSON on the page row copies the canvas's stored JSON** (`canvas.json`): an `.infopanel` is a zip, so there is no JSON
  file to copy.
- **A gauge SVG is told from an image SVG by `var(--value)` / `var(--percent)`.** The spec says "extension / shape"; an SVG
  without those is a Library image.
- **The gauge editor's Import no longer replaces the working copy**: a gauge file lands in Library › Gauges and opens in the editor.
- **The saved-canvas paths keep "Lands in".** Library › Open canvas / Re-import… reopen a library item (not a file) in the wizard
  with its own destination choice; only a file from the door has the choice made already.
- **A restore does not wait for the native Save As.** The backup is started first (and a failed one stops the restore), but on
  desktop the Save As dialog is async, so the replace may happen while it is still open. Undo brings the old dashboard back.
- **Binary imports stay on `<input type=file>`.** The desktop `open_text_file` returns text only, so the door's Choose files… is
  the browser input in both builds.
- **Reset everything's "Back up first" keeps calling `exportConfigFile`** (it is the same payload as Save backup).
- **A file over 64 MB is sniffed from its first 64 KB**, so a zip or JSON that big reads as unknown (a video that big is fine).

### Unverified

- **The desktop app itself**: that `disable_drag_drop_handler()` lets a real OS file drop reach the page was not run (cargo test only
  builds it). The drop was simulated in headless Chromium with synthetic `DragEvent`s.
- A real restore, a frames zip, a font pack and an `.infopanel` through the door end to end (the logic is tested; the dev server had no
  library or asset store, and running a restore would have replaced a live dashboard).
- Live against a connected kiosk (the dev server's control state showed the controls enabled; no kiosk was connected).
- Phone widths: the ⋯ menu's Import and Export items were not looked at.

### Follow-ups

- Phase 7: Help copy for the door and the sheet (`import.md`, `profiles.md`, `library.md`, `gauges.md` still describe the old entry
  points; the sheet borrows the `profiles` article for F1); the palette's remaining "Open drawer: …" labels; Keyboard shortcuts and the
  build id leave ⋯ when they have homes in Help and Settings.
- The Export dialog could take its three options from the sheet if the owner wants them there.

## Phase 7a: clean-up and correctness

The first half of Phase 7: the data-loss and tray fixes, the label sweep, the palette, the ⋯ menu, the last Follow bars, F1 targets and the test runtime. (7b: narrow and phone layouts, first-run, the §15 pass.) Checked by typecheck, tests, build and `cargo test` (114 pass), and by eye in headless Chromium at 1440 px and 560 px (title bar without ⋯, ⋯ at 560, the palette's destination entries, `?` opening the shortcuts, the zone header's Help icon, the multi-select chips); no page errors.

| Piece | State |
|---|---|
| Restore race | `saveFilePayload` and `exportConfigFile` are async and resolve to whether a file was written (the native Save As is awaited; a cancel or a failed write is `false`; a browser download is `true`). `restoreConfig` awaits `backup` and stops with "…could not be backed up first (the Save As was cancelled or failed), so nothing was replaced. Untick the backup box to replace without one", which the door shows under the file. `DoorContext.backup` is `Promise<boolean>`. The Export sheet toasts "saved" only after the write. |
| Tray › Settings before the studio loaded | `AppState.pending_settings` (`PendingSettings` in `state.rs`: `set` / `take` / `clear`, 15 s TTL). `windows::show_settings_in_studio` stores the request, shows or builds the window, emits `studio://open-settings` only when the window already existed, and clears the request when the window holds the start page. The studio asks for it when `useStudioUi` mounts (`takePendingSettings` in `desktop.ts`, command `take_pending_settings`, in `STUDIO_PERMISSIONS`), so a window the tray just built, or one still loading, opens Settings › App. |
| Native drag-drop | Nothing in `src/` or `src-tauri` uses `onDragDropEvent` or `tauri://drag-*` (grepped); the Import door's HTML5 drop is the only drop. Nothing to fix. |
| Help's "Open settings" | New command `open_settings_in_studio` (default capability, so Help can call it) → `show_settings_in_studio`; `src/help/env.tsx` uses it (`ipc.openSettingsInStudio`). `ipc.openSettings` had no caller left and went; `start.js` keeps calling `open_settings` for the separate window (start.html rescue states only). |
| Labels (SPEC §2.2) | Counts over `src/` (`.ts`, `.tsx`, `.md`, tests excluded), before → after: Appearance 97 → 94 (all identifiers such as `AppearancePreset`, comments aside; the retired Settings group "Appearance" is now "Zoom"), Global style 1 → 0, Widget theme 0, Widget style 0, Saved looks 1 → 0, Style presets 4 → 2 (code comments on the v10 migration), General settings 6 → 1 (a comment), `Dashboard ›` 5 → 6 (all now valid `Settings › Dashboard ›` paths; the retired `Dashboard › General` is gone), Use as global 1 → 0, Follows the profile theme 3 → 0, Background opacity 1 → 1 (the island's own code comment), Edit widget style 0, Applies to all profiles 0, Profiles drawer 0, Gauges page 23 → 0, Kiosk view 12 → 11 (the desktop Kiosk view is a real feature, reached from Live › Open kiosk view; the button is gone), Open drawer 1 → 0, Data sources 5 → 0. User-facing "profile" where §2.1 says Screen: about 25 UI strings and 40 of 67 help lines moved to "screen"; kept in code, keys, file formats, errors about a profile file, InfoPanel's own profiles and the "screen (profile)" in Screens and the glossary. Widget Surface & effects labels are now "Opacity (%)" and "Blur" (Theme's label override is gone). The source-dot legend reads "From All screens" and "From the screen's theme". |
| Help articles | Rewritten for the new places: `studio.md` (rail, title bar, Live, status bar), `profiles.md` (now "Screens and the grid"), `import.md` ("Importing and exporting": the door, the sheet), `library.md`, `gauges.md`, `island-alerts.md`, `sensors.md`, `concepts.md`, `glossary.md`, `quickstart.md`, `welcome.md`, `themes.md` ("Themes"); every `Settings › X` link is now `Settings › App › X`. |
| Command palette (§13) | Added **Open Live**, **Manage screens…**, **Help**, **Design › Add widget** and **Layers**, and one entry per destination (Design, Library, Data, Alerts & Island with its four tabs, Settings › Dashboard / Studio / App; Theme already had its own). Gone: "Open drawer: …", "Open alerts", "Open Sources / Back to Design". "Edit profile: ‹x›" → "Edit screen: ‹x›" (group Screens), "Follow the theme" → **Make it follow**. |
| ⋯ menu | Phone only (`sm:hidden`): Undo, Redo, Import, Export & back up. Keyboard shortcuts left it (Help › Shortcuts, `?`, the palette); the build id is a "Studio build" row in Settings › App › About (the browser notice already had it). |
| Follow bars | `FollowBar`, `FollowPill`, the `ThemeScopeBar` type, `FieldsApi.follow`, `followFields`, `followSection` and the `FollowInfo` strings are gone. The multi-select inspector has the zone inspector's chips over the primary zone's state (`sectionInherit`'s `alsoScopes`: Reset and Customise apply to every selected zone). A panel widget has no level of its own in the theme, so its chip names its panel: `InheritLevel` gained `panel` ("From Panel · ‹panel›", "Custom here", "Locked by Screen"; Reset = Use panel, Customise here = Customize), built by `itemSectionInherit` over `itemFollow`; no "Edit Panel ↗" (only the lock's "Edit lock in Theme ↗"). The phone sheet's tool view shows no chip (7b). Also deleted: `countOverrides`, `clearOverrides`, `countProfileOverrides`, `saveAppearancePreset` and their tests. `scopeOf`, `LookScope` and `withScope` stay: `inheritance-actions.ts` and `screens-model.ts` still use `withScope`. |
| Help targets | `studioHelpTarget` takes the view and the Settings tab: Theme → themes, Library → library, Data → sensors, Alerts & Island → island-alerts, Screens → profiles, Settings Dashboard → performance, Studio → studio, App → the page's article (startup for General); in Design the selected zone's article, else studio. An open dialog still wins (`data-help-article`): the Import door and the Export sheet name `import`, Live names `kiosk`. The zone inspector's header has a Help icon (F1). |
| Library canvases | **Open canvas** lands as a new screen and **Add to this page…** (was **Re-import…**) as a canvas zone; both pass the destination to the wizard with `lockDest`, so no "Lands in" step shows. |

Tests: a slow Save As is awaited and a cancelled one replaces nothing (`import-door-actions`), `exportConfigFile` is false on cancel and on a failed write (`config-file`), `PendingSettings` is taken once and stale or cleared requests are dropped (`state.rs`), the new permission (`control.rs`), `studioHelpTarget` always names an existing article (`tests/help/context.test.ts`), the new palette entries (`commands`). Existing tests changed because the code went or a label moved: `appearance-presets.test.ts` (the overrides block), `inspector-model.test.ts` (`followSection` cases removed, `followInfo` is mode only), `item-model.test.ts` (the Follow bar cases now call `itemFollow`), `loose-review-dialog.test.tsx` ("Used by a screen").

### Test runtime

`npm test` was 14.4 s at Phase 6 and measured 10.9 s at the start of this phase (under other load); after the changes below it runs 8.8 to 9.1 s (Vitest's own duration, three runs) over the same 220 files. Per file: `syntax.test.mjs` 1.34 s → 0.01 s (parses with rollup's `parseAst` in-process instead of 14 `node --check` children; rollup is Vite's own dependency), `agent-install.test.mjs` 1.62 s → 0.29 s (the three forwarder runs go side by side), `shared-controls.test.tsx` 1.19 s → 0.27 s (the Small zones sweep checks Card and Dense, the two choices that change the shell; Auto and Full draw the default), `loose-review-dialog` 0.77 s → 0.29 s, `help.dom` 0.32 s → 0.08 s, `settings-app.dom` 0.38 s → 0.17 s (`userEvent.setup({ delay: null })`). What is left is module collection (about 130 s summed over 32 workers, mostly the widget registry and studio imports); `--no-isolate` did not help (8.3 s, and it broke a test). `gauges-page.test.tsx` (1.4 s, four renders of the editor) is the slowest file left.

### Deviations

- **A pending tray request lives 15 s and is taken once**; an open window gets the event and the request also stays for the next mount, which only matters if the page reloads within 15 s.
- **"Re-import…" became "Add to this page…"**: with the destination chosen up front the two Library rows would have been the same action.
- **The phone sheet keeps no chip** (it showed the old Follow bar before).
- **The palette has no "Theme scope: …" entries**: "Make this the theme for all screens / this screen" (Phase 3) already does that job.

### Unverified

- **The desktop app.** The tray request after a cold start, Help's Open settings and the permission grant for `take_pending_settings` were not run (cargo test covers the state type and the permission list only).
- **A real restore with the native Save As cancelled** (the logic is tested with a stubbed save; a browser download never cancels).
- The multi-select chips' Reset and Customise were looked at with two zones, not three.
- Help articles were read for the new names, not walked link by link in the Help window (the content check passes).

### Follow-ups

- 7b: the phone sheet's chip, narrow layouts, first-run, the §15 pass; the phone ⋯ has no Live item (the Live button is in the bar).
- Comments that still say "profile" for code about screens were left alone as code.

## Phase 7b: narrow and phone layouts, first-run setup, acceptance

The last phase. Checked by typecheck, tests (222 files, 2570 tests, 8.3 s) and build, and by eye in headless Chromium at 1279, 900 and 390 px (every rail view, Screens, the Import door, the Export sheet, Live, a selected zone's inspector, the floating card dragged and closed, the phone sheet at half height, the first-run setup at 1440 and 390 px) and, with a stubbed `__TAURI_INTERNALS__`, the §15 script again as the desktop app (Update item, `open_help` and `save_text_file` calls, Settings › App at 900 and 390 px). `src-tauri/` was not touched, so `cargo test` was not run.

| Piece | State |
|---|---|
| Breakpoints (§3.5) | `studio-layout.ts`: the inspector's mode now follows the **window's** width (`windowWidth` in `computeLayout` and `useStudioLayout`): docked from 960 px, floating from 600 px, sheet below (was 1100 / 640 on the body width, which jumped when the rail changed width). `PHONE_MAX` / `isPhone` / `railWidth` (72 px, 48 px under 960, none on a phone) in `use-studio-layout.ts`. Tailwind's `sm` is 600 px (`--breakpoint-sm` in `index.css`), so the title bar's `max-sm:` rules switch with the layout. Fit may go to 10 % (`FIT_MIN`): a 1920 px page on a 390 px canvas needs 16 %, below the lowest zoom stop. |
| < 1280 px | The left panel starts closed (it already did) with the toggle in the page-tab row; checked at 1279 (closed) and 1280 (open). |
| < 960 px | Rail 48 px with tooltips, title bar icon-only Import / Export and an icon for the palette, status bar dots (already there). The inspector is `floating-inspector.tsx`: 280 px, inset 10 px from the canvas's right, dragged by its header (`[data-inspector-header]`, not its buttons and fields), closed with ✕ or Esc, still mounted while closed. `FLOAT_WIDTH` / `FLOAT_MARGIN` / `FLOAT_INSET` in `studio-layout.ts`. |
| < 600 px | `phone-tab-bar.tsx`: a 52 px bottom bar, Design · Theme · Library · More (Data, Alerts & Island, Settings, Help; More is highlighted when one of them is open). The side rail is not rendered. The bottom sheet (handle, 44 px rows) was there; its tool view now shows the section's `InheritChip`, its note and its action line (`SheetView` takes `inherit`). Live: the title bar's Live button is a green dot (still the popover's anchor) and **Live control…** is in ⋯. |
| Views on a phone | Theme: the 360 px column and the preview/exceptions stack and the view scrolls, the scope bar scrolls sideways without its sub-lines. Library: the sidebar is a strip of chips above the grid, the header wraps. Data: the connection card and source tree sit above the table. Alerts & Island: the tabs take their own row. Settings: tab subtitles hidden. Screens: cards and detail panel stack. Settings › App (desktop): the sub-nav is 112 px. No view scrolls the page sideways (the shell clips each one, so this was judged from screenshots as well as an overflow probe). |
| First-run (§10.5) | `first-run.tsx` (a 720 px Base UI dialog; stepper `1 Connect — 2 Screen — 3 Start — 4 First page`; footer Skip setup · Back · Continue / Open Studio) over `first-run-model.ts` (pure). Connect: the URL is prefilled and tested on open, on blur, on Enter and on **Test** (`GET {base}/api/sources`): "Connected — 163 sensors from Clock, Steam Data and 12 more", or the help block with **Set up the Data API ↗** (Help › Sensors). Screen: "This window is W×H — that looks like a bar display." with the detected size preselected, Panel 1024×600, Strip 480×1920, Phone or tablet 1080×1920 and a Custom size. Start: template / Import from InfoPanel (opens the Import door when the setup ends) / Blank. First page: a name, and on Blank the five widget cards (CPU temperature, GPU temperature, Fans, Clock, Now playing) ticked from what the sensors offer and laid out on the grid by `layoutWidgets`; on Template and Import a note. It runs when the browser had no config of its own and the server returned 404 for it (`hasStoredConfig`, `serverEmpty` in `App.tsx`), and from **Help › Run setup again** (a button in Help's sidebar footer, both builds; `setup-request.ts` passes it through a storage key, which the studio hears from another tab or window or finds when it opens). One undo step (`first-run`); a changed Data API URL is saved with it. |
| What it writes | `applyFirstRun`: a fresh install (one screen, no zones) sets up that screen: size, the grid `newProfile` makes for it (12×4 and fill for a bar, 6×6 and scroll for a strip), the first page's name and its zones (a `SensorValue` zone per temperature card with `sensor` and `label`, `Fans`, `Clock`, `NowPlaying`, or the sample layout, scaled onto the grid unless the screen is a bar). With screens already there (Run setup again) it **adds** a screen named `W×H` and touches nothing else. Checked by `first-run-model.test.ts`. |
| Also fixed | The Page inspector's Name field now follows a rename made elsewhere (undo, the setup). A zone with a panel is "Panel", not "Custom panel". Inspector search for "connection", "rename", "display name" or "data api" finds the Bound data card with its Data ↗ LinkRow. Text fields and selects show a focus ring beside their accent border. F1 inside a Theme card opens Help › Themes › "Follow theme, section by section" (`data-help-section`, `focusedSection`). |
| Docs | `README.md` (the studio, Theme, Screens, Settings, Data, Import and Export paragraphs), `docs/desktop/README.md` (where Settings opens), `quickstart.md` (the setup and Run setup again), `CHANGELOG.md` (Unreleased: the whole change set for users). |

Tests: `first-run-model.test.ts` (the window's shape and its boundaries, the screen cards and valid sizes, the Data API sentence, which cards the sensors offer and which sensor a temperature binds, the layout: inside the grid, no overlap, card order, a narrow grid, what does not fit, fresh ids, and `applyFirstRun`: a fresh install, a tall screen, the template on a bar and on a panel, Import, Run again adding a screen and leaving the rest, a config that round-trips a save), `studio-layout.test.ts` (modes from the window's width, Fit below the lowest stop), `context.test.ts` (F1 in a section, the heading exists, `focusedSection`). Existing tests changed for the intended breakpoints: `studio-layout.test.ts` (the 1100 / 640 thresholds became 960 / 600 and the floating case uses a 900 px body; the "no room" and "unmeasured" fits are `FIT_MIN`, not 25 %); `context.test.ts` now runs under happy-dom (its new case reads `document`).

### Deviations

- **The empty-layout card stays.** It shows on any empty page (a new page, a cleared one), which is not only the first-run moment; on a fresh install the setup opens over it.
- **The first run starts for a fresh browser against a server with no config**, not for "no config" in the server alone: a second browser on a server that has one never sees it, and an offline server (the fetch fails) does not start it. Help › Run setup again covers the rest.
- **Import in the setup opens the Import door as the setup ends**, after the screen is sized; it does not open it inside the modal.
- **Help cannot raise the studio window.** Run setup again asks through storage; the setup opens in the studio the next time it is looked at (a browser tab does not come forward, the desktop Help window is a separate window).
- **Phone sheet: a chip, not the whole card.** The tool view has the section's name and chip and its action line; the chip menu is the same Base UI menu.
- **F1 deep-links to a heading only in Theme's cards.** The zone inspector's sections use the zone's article (widget settings, panels, canvas), as before, because those articles have no heading per section.
- **The Add widget chip is still "My panels"** (SPEC §6.1 lists it, §2.1 retires the term).
- **The left panel's open state is read once**, when the studio opens (open from 1280 px, closed below): resizing the window later does not move it.

### Unverified

- **The desktop app itself.** The desktop run is a stub: `open_help` and `save_text_file` were seen to be called; the tray, `take_pending_settings`, the OS file drop, the Help window sharing the studio's storage (for Run setup again) and the real status-bar values were not run.
- **A real kiosk**: Live's pause resetting on a kiosk reload, the page-tab chip with a kiosk connected, the kiosk registry's addresses. The dev server has no control stream.
- **Touch.** The phone width was driven with a mouse in a 390 px viewport; a real phone's drag of the sheet handle was not tried with a finger.
- **Settings › App's restart bar at 390 px** still overflows (its text wraps to a narrow column beside two buttons); it is the settings pages' own component.
- **The first run's Import path** (the door opening after Open Studio) and a template on a tall screen were not clicked through; the model is tested.
- **Quick tips** (the first-run tips card) overlaps the phone sheet's peek until dismissed.

### Follow-ups

- Nothing blocks the branch. Possible polish: a heading per inspector section in the widget articles so F1 can deep-link there; the restart bar's narrow layout; clearing the quick-tips card on phones.

## Acceptance (SPEC §15)

Walked in the browser build and in the stubbed-desktop run (`__TAURI_INTERNALS__` stubbed as in Phase 5a) against the dev server's sample config. Done = checked; Deviation = checked and different from the SPEC on purpose; Unverified = could not be checked here.

| §15 line | Result |
|---|---|
| No retired label (§2.2) in the UI, the palette or help | **Done.** Counts in Phase 7a; this pass grepped every term again over `src/` and the help articles. What is left is code (`Appearance*` types and presets, comments) and valid paths (`Settings › Dashboard › …`, the tab). Fixed "Custom panel" in the zone header. Deviation: the Add widget chip "My panels" (SPEC §6.1 names it). |
| Every §13 row reachable at its new home; every ↗ opens its home with the control focused | **Done** for the rows walked across Phases 2 to 7a, and spot-checked again: a zone's **Edit Screen ↗** opens Theme at that card, the Data tab's **Data ↗** opens Data, the status bar's Data API item lands on the URL field, the palette's destinations. **Unverified:** each of the §13 rows was not clicked through again in this pass. |
| No setting has two editors; searching for a linked setting shows the LinkRow | **Done.** Searching the zone inspector for "connection" or "rename" now shows the Bound data card with its LinkRow and no control (the search terms were added this pass). |
| Chips on every inheritable section and none on single-scope settings; correct state and level; readable without color | **Done.** Chips are on the widget-style sections, tokens, radius, background, performance and the page font, and on nothing else (they come from `sectionInherit` / `THEME_CARDS`; single-scope settings are plain rows or LinkRows). Every state and level has a test (`inheritance.test.ts`) and `?ia-preview` shows them. **Greyscale:** with `filter: grayscale(1)` on the page, Theme's chips still read apart by icon (link, pencil, lock), wording (From All screens / Custom here / Locked) and border (dashed for inherited and built-in, solid for custom and locked); screenshots of Theme and the zone Style tab checked. |
| Locks disable a section for every widget and page of the screen and show `Locked by Screen`; unlocking restores kept overrides | **Done** (`theme-cards.test.ts`; Phase 4 by eye; the chip reads Locked by Screen on the sample zone). |
| Exceptions: Make it follow removes exactly one; Make all follow respects the scope | **Done** (`theme-exceptions.test.ts`, including Page scope leaving the page's own sections). |
| Page scope cannot customise Colors or Background; the reason is shown | **Deviation** (PLAN decision 13): Background is disabled with "Set per screen" and shared sections say "Locked by Screen" / "Spacing only" (checked at Page scope); the widget-style Colors section stays editable at a page, and the color tokens there are a link to the screen. |
| Page-font migration: the existing global font shows as All screens › Typography and the kiosk renders the same | **Done.** The key is unchanged (`general.font`), no migration; `resolveFont` (screen font, then `general.font`) feeds all three readers. Tests in `general.test.ts` and `profile-file.test.ts`. **Unverified** on a real kiosk. |
| Style-preset migration: Dark, Light, Vivid and Mono zones render identically | **Done** (`settings-migrate.v10.test.ts`: zones resolve the same bar the dropped `preset` key). |
| Import detects config, profile, `.infopanel`, gauge, frames zip, image, video and font; Replace everything backs up first; `.infopanel` runs the wizard without "Lands in" | **Done** by `import-sniff.test.ts`, `import-door-actions.test.ts` and Phase 6's eye checks. **Unverified:** a real OS drop in the desktop app, and a real restore. |
| Export: four rows work; Copy JSON copies the file's payload | **Done.** The payload tests; **Save backup** downloads `infopanel-studio-config.json` in the browser and calls `save_text_file` in the desktop run. |
| Live: every control acts on the kiosks, nothing marks the document dirty, a pause shows in the tab-row chip and resets on kiosk reload | **Done** for the controls (`live-model.test.ts`: each posts to its own route, none touches config or history) and the chip. **Unverified:** the reset on a kiosk reload (needs a real kiosk and server). |
| Status bar: each item reflects live state and opens its target; browser: Update hidden, Server opens the read-only notice | **Done.** Browser: no Update item, Server opens Settings › App with the notice, Data API opens Connection. Desktop stub: the Update item shows. **Unverified:** real server, update and kiosk values on desktop. |
| Settings › App works on desktop; the separate window no longer opens; tray › Settings opens Settings › App | **Done** in the stub for Settings › App (General, Server, Updates; also at 900 and 390 px) and by search: nothing in the studio opens the separate window (`open_settings` is called only by `start.html`). **Unverified:** the tray and a cold start. |
| Browser build: no desktop-only control is clickable, each explained | **Done.** Settings › App is the notice (Server, Kiosk URL, build), no window controls, no Update item, Help's "Open Settings" is not shown, the Import door's file picker is the browser's. |
| Responsive: 1279 left panel closed; 900 inspector floats; 390 bottom bar and sheet with rows ≥ 44 px | **Done.** 1279 closed and 1280 open; 900: a closed 280 px card that opens 10 px from the right, drags and closes with Esc; 390: a 52 px bottom bar, a sheet whose rows measure ≥ 50 px, and every view and overlay fits. **Unverified:** real touch. |
| Keyboard: every control reachable, focus ring visible, chip menus open with Enter and Space, Esc closes popovers, F1 for the focused section | **Done.** The first 16 Tab stops from a selected zone (Change widget, Hide, More, Dismiss, Density, Accent color, the zone's own quick settings, Hide, the zoom bar, the Screen size link, Zone name) all show a ring (text fields and selects got one beside their accent border this pass); a chip menu opens with Enter and with Space and closes with Esc; Esc closes Live, the palette and the floating inspector; F1 in a Theme card opens Help › Themes › its heading, on a selected widget it opens widget settings. Deviation: F1 deep-links per section only in Theme. |
| Existing strengths unchanged: Ctrl K, undo/redo, right-click zone menu, quick bar pins, inspector search, per-section Reset with "N changed", F1 | **Done:** Ctrl+K opens the palette; Undo / Redo are in the title bar (Ctrl+Z reverted an edit); the zone menu opens on right-click; the quick bar shows at 900 and 1440 px; inspector search finds rows; a section with changes shows "N changed" and its Reset. |

### Task paths (§14)

| Path | Clicks |
|---|---|
| Change colors for everything | **2**: **Theme** (rail), **All screens**; Colors is open with the tokens. |
| Give one screen its own look | **1** (Theme opens at the edited screen, `MyDefault · 1920×550`), then edit any card: a following card turned **Custom here** on the first edit (checked on Units & format: "From All screens" → "Custom here"). 2 when Theme was last left at another level. No switch to flip; Lock is optional. |
| Back up | **2**: **Export**, **Save backup** (a file is written). |
| Change the API URL | **1**: the status bar's **Data API** item opens Data with the URL field focused. |
