# Feature map: current app → redesigned studio

This is the **no-feature-loss checklist**. It is built from `reference/current-ui-before.png` and `reference/design-overview.md`. Tick every row before you call the redesign done, and paste the ticked list into the PR.

**Rules**
- Keep every setting's **key, default and behaviour**. Only its position in the UI changes.
- If you find a control in the code that is not listed here, add it. Place it like this:
  - what the widget shows or does → **Content**
  - how it looks → **Style**
  - where its values come from → **Data**
  - rarely used → mark it **Adv**
- The inspector is driven by **one registry**:
  - one general schema shared by all zones;
  - one schema per widget type;
  - the panel schema;
  - one schema per panel-widget kind.

  Do not hard-code panels for individual widgets.

Legend: **C / S / D** = the Content / Style / Data tab. **Adv** = hidden until "Advanced settings" is on. **Dash** = the Dashboard inspector (nothing selected).

**Status column (no-feature-loss audit).** Every row was traced from a rendered control, menu item or shortcut to the logic it calls, in the code at `198d7d3`; a name match alone did not count. Paths are relative to `src/components/studio/` unless they start with `src/`.
- `✅ file:line` is where the feature lives now and is reachable. `✅ (decision #N)` is a deliberate deviation recorded in `DECISIONS.md`.
- `⚠️ partial: …` works, but part of the row is missing (the gap list is in the audit notes of the PR).
- `❌ missing` is gone from the UI.

Rows marked **(+)** were added by the Phase 0 code inventory (`docs/settings-inventory.md`): they exist in the code today but were missing from this list. Their "New" column is a proposal that follows the rules above.

---

## 1. Top bar
| Current | New | Status |
|---|---|---|
| Dashboard/config name dropdown ("MyDefault ▾") and its menu | Top-bar **profile switcher** shows the active profile; the config-level items (switch/new/rename/duplicate/delete/import/export) stay in this menu or in `⋯` | ✅ `studio-top-bar.tsx:113` (profile switcher); switch/new/rename/delete in `profiles-panel.tsx:146`; import/export in `⋯` `:176`. A duplicate-profile action never existed in the code (old or new) |
| Meta "1920×550 · 12×6 · 10 zones" | Top-bar meta `W × H · cols × rows · Fit · N zones` | ✅ `studio-top-bar.tsx:167` (hidden below the md breakpoint) |
| Design / Sources | Segmented control, centre | ✅ `studio-top-bar.tsx:71` (radio group, arrow keys) wired in `studio-view.tsx` `onMode` |
| Undo / Redo | Top bar right, plus ⌘Z / ⇧⌘Z | ✅ `studio-top-bar.tsx:270,279`; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y `use-studio-shortcuts.ts:64` |
| Save | Primary button with an unsaved-changes dot | ✅ `studio-top-bar.tsx:297` → `use-studio-ui.ts:75` handleSave → `App.tsx` handleStudioSave; unsaved dot `studio-top-bar.tsx:308` |
| Kiosk view | Secondary button | ✅ `studio-top-bar.tsx:252` (`onExitStudio`) |
| `⋯` overflow | Last item on the right | ✅ `studio-top-bar.tsx:176` (MoreMenu) |
| (+) `⋯` › Export config / Import config… | Keep in `⋯` (config-level items) | ✅ `studio-top-bar.tsx:210` Export → `config-file.ts:9`; Import → file input in `studio-view.tsx` → `config-file.ts:22` |
| (+) `⋯` › Copy profile JSON | Keep in `⋯`; also in the Profiles panel row menu | ✅ `studio-top-bar.tsx:216` → `config-file.ts:4` (also `profiles-panel.tsx:57` row menu) |
| (+) `⋯` › Reset everything… (confirm dialog with "Export first") | Keep in `⋯`, last item before the build id; same confirm dialog | ✅ `studio-top-bar.tsx:231` → `reset-config-dialog.tsx:15` ("Export first") → `studio-view.tsx` `setConfig(defaultConfig())` |
| (+) `⋯` › Command palette… (Ctrl+K) and Keyboard shortcuts (?) | Keep in `⋯`; the palette is also on Ctrl+K and is unchanged (see §14) | ✅ `studio-top-bar.tsx:221` palette (`command-palette.tsx:96`), shortcuts → `shortcuts-dialog.tsx:28`; Ctrl+K `use-studio-shortcuts.ts:64` |
| (+) `⋯` › Desktop app settings (desktop app only; opens the app's settings window) | Keep in `⋯`, after Reset everything, only when `isTauri()` | ✅ `studio-top-bar.tsx` → `desktop.ts` `openSettings` |
| (+) Window controls: the top bar is the title bar (drag, double-click maximizes, minimize / maximize / close at the right end; close hides to the tray) | Desktop app only; no change in the browser | ✅ `window-controls.tsx`, drag regions in `studio-top-bar.tsx` |
| (+) `⋯` › build id (disabled item) | Keep as the last line of `⋯` | ✅ `studio-top-bar.tsx:236` |
| (+) Save button shows "Saved" for a moment after saving; Save pushes to the dashboard server | Keep: primary button, checkmark flash; the dot means "edits not pushed yet" | ✅ `use-studio-ui.ts:75` ("Saved" 1.5 s), `App.tsx:124` (400 ms push, `pushPending` → dot) |
| (+) Profile switcher menu: Auto (match window) entry with a check, profile size on each row | Keep inside the profile switcher | ✅ `studio-top-bar.tsx:145` (Auto + check), sizes `:153` |

## 2. Rail and drawers
| Current | New | Status |
|---|---|---|
| Add / Layers / Profiles drawer (was the first column of the bottom dock) | Rail `add_box` / `layers` / `devices` → left panel | ✅ `left-rail.tsx`, `studio-drawers.tsx` (the left panel stays beside the canvas in every inspector placement; the bottom dock is gone) |
| Grid/apps rail icon | Check what it opens today; keep it (layouts/templates → Add › Layouts) | ✅ The old grid icon was only the brand glyph (no action). Layouts live in Add › Layout starters `insert-panel.tsx:173` |
| Monitor rail icon | Check what it opens today; keep it (kiosk/display settings → `⋯` or Dash › General › Display) | ✅ The old monitor icon was Profiles `left-rail.tsx:13`; display settings are Dash › General › Display `inspector-model.ts:333` |
| Database rail icon | Rail `database` → Sources mode | ✅ `left-rail.tsx:14` → `use-studio-ui.ts:onRail` → `SourcesPanel` in `studio-view.tsx` |
| — | Rail `keyboard` → Shortcuts sheet | ✅ `left-rail.tsx:105` → `shortcuts-dialog.tsx:28` |

## 3. Profiles
| Current | New | Status |
|---|---|---|
| Profiles list and switching | Profiles panel rows; top-bar switcher | ✅ `profiles-panel.tsx:146`, `studio-top-bar.tsx:113` |
| New profile (6 or 12 cols, 4 or 6 rows by size) | "+" in the Profiles panel | ✅ `profiles-panel.tsx:166` → `use-studio-mutations.ts:275` → `src/lib/layout.ts:509` |
| Auto: pick the profile closest to the window | Profiles panel footer toggle; Dash › Profile › Profile selection | ✅ `profiles-panel.tsx:232`; `inspector/profile-sections.tsx:273` |
| Size, grid cols × rows, Fill / Scroll, gap (default 12), padding | Dash › Profile › Profile | ✅ `inspector/profile-sections.tsx:93` (Fill / Scroll, gap, padding `:64`) |
| Profile theme / style / background: Inherit / Custom (/ None for the background) | Dash › Profile › This profile | ✅ `inspector/profile-sections.tsx:212` |
| Shipped profiles (Sample 1920×550, ARCv2, Main display, Kiosk strip, Small 1024×600) | No longer shipped: a fresh install has one blank profile; the sample layout is a template on the empty-layout card (Use sample layout). Stored copies of the old profiles stay | ✅ `src/lib/layout.ts` (`defaultConfig`: one blank profile; `mergeConfig` adds none), `src/lib/sample-layout.ts` (`sampleLayout`, template ids only) → `studio-actions.ts` `withSampleZones` |
| (+) Delete a profile (never the last one; Auto afterwards when it was the edited or pinned one) | Profiles panel: Delete profile in any row's menu, behind a confirm dialog; Dash › Profile deletes the edited one | ✅ `profiles-panel.tsx:103` (every row, hidden when one is left; confirm `DeleteDialog`), `inspector/profile-sections.tsx:168`; `profile-actions.ts` `withoutProfile`, one undo step |
| (+) Profile name | Dash › Profile › Profile (editable name) | ✅ `inspector/profile-sections.tsx:93` (Name); Rename… `profiles-panel.tsx:57` |
| (+) Design size W / H (free number fields) | Dash › Profile › Profile; the zoom-bar resolution button jumps here | ✅ `inspector/profile-sections.tsx:93`; zoom-bar jump `zoom-toolbar.tsx:118` → `studio-view.tsx` openProfileSettings |
| (+) Grid Cols (2–24) and Rows (1–24) −/+ steppers; zones are clamped into the grid | Dash › Profile › Profile | ✅ `inspector/profile-grid.ts:13` (README §5: a shrink that would cut a zone is refused with a toast, instead of the old clamp) |
| (+) Gap and padding empty = default (placeholder shows it; padding default is 0 in a fill kiosk, 24 in scroll) | Dash › Profile › Profile; keep "empty = default"; a 0–64 px slider beside each box rests on the default while unset (the box still takes up to 200) | ✅ `inspector/profile-sections.tsx:64` (placeholder "N (default)") |
| (+) Profile theme (Inherit / Custom colours), profile corner radius (0–1.5 rem slider in Dash › Profile › Profile after Gap and Padding; unset shows the dashboard radius; rounds every widget's outer card, a widget's own Corner radius wins), profile Force global style (Inherit / On / Off) | Dash › Profile › This profile; editors in Dash › Appearance when the scope is This profile | ✅ `inspector/profile-sections.tsx:212`; Force Inherit / On / Off `appearance-panel.tsx:14`; colours `profile-theme-panel.tsx:31` |

## 4. Canvas
| Current | New | Status |
|---|---|---|
| Pixel rulers | Kept; Rulers toggle in the zoom bar | ✅ `rulers.tsx:43`; toggle `zoom-toolbar.tsx:89` |
| Grid / dot background | Kept; Grid toggle in the zoom bar | ✅ `studio-canvas.tsx:450` (dots), grid lines `:505`; toggle `zoom-toolbar.tsx:86` |
| Click a zone to select | Kept, plus multi-select, drag to move, corner resize, context menu, shortcuts | ✅ `placement-frame.tsx:94`, `use-studio-selection.ts:12`; context menu `studio-canvas.tsx:98` → `zone-context-menu.tsx` |
| Selection toolbar: type dropdown | C › Widget › Widget type; also the chip's More menu | ✅ `selection-chip.tsx:24` → `widget-picker-dialog.tsx:79`; inspector `zone-inspector-parts.tsx:324` |
| Selection toolbar: size readout | Selection chip and the placement row | ✅ `selection-chip.tsx:76`; placement row `zone-inspector-parts.tsx:291` |
| Selection toolbar: 4 align/expand icons | Chip **More** menu and the canvas context menu; **keep the exact current actions** | ✅ `zone-menu.ts:53` via chip More `selection-chip.tsx:96` and right-click; runs `resize-step` in `use-studio-commands.ts` |
| Selection toolbar: hide / duplicate / delete / Style / close | Chip, context menu, inspector header, H / ⌘D / ⌫, Esc | ✅ hide `selection-chip.tsx:81`; Edit style / Duplicate / Delete / Deselect `zone-menu.ts:71`; inspector header `zone-inspector-parts.tsx:35`; keys `use-studio-shortcuts.ts:56` |
| Edge resize handles | Corner handle and ⇧arrows; **keep the edge handles too** if they exist today | ✅ `placement-frame.tsx:26` (4 edges + 4 corners); Shift+arrows `use-studio-shortcuts.ts:56` |
| Minimum zone sizes per widget | Enforced on resize, on the W/H fields and on type change | ✅ `studio-canvas.tsx:253`; W/H fields `use-studio-mutations.ts:247`; type change `:259` (`canGrowTo`) |
| Blank zone ("Pick a widget") | Dashed tile; inspector Widget › Pick a widget plus Zone frame | ✅ `placement-frame.tsx:344` ("+ Pick a widget"); inspector `inspector-model.ts:276` |
| (+) Draw-to-create: drag across empty grid cells to draw a blank zone (clamped to the grid; nothing is added when there is no room) | Keep on the canvas; the new blank zone is selected; the empty-canvas card reads "Draw a zone, or drag a widget from Add" | ✅ `studio-canvas.tsx:275` → `use-studio-mutations.ts:155`; empty card `canvas-cards.tsx:10` |
| (+) Selection toolbar: four span-step buttons (Narrower / Wider / Shorter / Taller by one cell, disabled when blocked; Shift+arrows) | These are the "4 align/expand icons" above: chip More menu and context menu, keep the exact actions | ✅ `zone-menu.ts:53` (disabled when blocked, `canStep`), Shift+arrows `use-studio-mutations.ts:237` |
| (+) Selection toolbar: widget-type crumb with Change widget, second crumb for the selected panel widget | Chip name (opens Widget type) plus a widget crumb for panels | ✅ `selection-chip.tsx:24` (name + crumb) |
| (+) Selection toolbar "Style" button (jumps to Colors & surface) | Chip action → opens the Style tab at Colors & surface | ✅ chip More › Edit style `zone-menu.ts:71` → `use-studio-commands.ts` edit-style (Colors & surface + Style tab); no standalone button on the chip |
| (+) Arrow keys nudge a zone one cell; Shift+arrows resize it | Keep (README §5.4) | ✅ `use-studio-shortcuts.ts:56` → `use-studio-mutations.ts:224,237` |
| (+) Drag a widget or panel from Add and drop on the canvas (auto-placed at its minimum size) | Keep, with a drop ghost | ✅ `insert-row.tsx:101` → `studio-canvas.tsx:329` → `use-studio-mutations.ts:97` (drop ghost `drop-ghost.ts`) |
| (+) Move / resize ghost with a size label while dragging; 4 px drag threshold; hover size chip | Keep | ✅ `studio-canvas.tsx:518` (label), `placement-frame.tsx:184` (4 px), hover chip `:298` |
| (+) Click inside a selected panel zone selects the panel widget under the pointer | Keep (Esc steps widget → zone → none) | ✅ `placement-frame.tsx:94`, `studio-canvas.tsx:581`; Esc steps `use-studio-commands.ts:61` |
| (+) Hidden zones stay selectable and editable on the canvas but do not show in the kiosk | Keep; Layers row dims them | ✅ `placement-frame.tsx:254` (35 %), `layers-panel.tsx:82`; hidden in kiosk (unchanged) |

## 5. Bottom bar → zoom bar
| Current | New | Status |
|---|---|---|
| Grid toggle | Zoom bar | ✅ `zoom-toolbar.tsx:86` |
| Zoom − / % / + / fit | Zoom bar (Fit = ⌘0) | ✅ `zoom-toolbar.tsx:93-110`, Ctrl+0 / Ctrl+= / Ctrl+- `use-studio-shortcuts.ts:64` |
| "1920 × 550" | Zoom bar resolution button → Dash › Profile | ✅ `zoom-toolbar.tsx:118` → `studio-view.tsx` openProfileSettings |
| Magic wand | Zoom bar; same action | ✅ (decision #14) not built |
| Panel layout toggles (Side / Bottom / Auto) | Removed: the placement is automatic from the studio width (docked from 1100 px, floating from 640 px, bottom sheet below); no setting, no zoom-bar button, no "cycle inspector layout" command | ✅ `studio-layout.ts` (`inspectorMode`), `studio-shell.tsx`; `studio.layout` removed (`widget-editing/SPEC.md` §5) |
| Dock splitter | Removed with the bottom dock (`studio.dockHeight` is gone); the docked column is a fixed 320 px | ✅ `dock-splitter.tsx` deleted; `studio-shell.tsx` |
| Ctrl+\\ collapse | Ctrl+\\ "Show / hide the inspector": collapses the docked column to a slim strip, opens / closes the floating card, toggles the sheet between peek and half | ✅ `use-studio-shortcuts.ts` → `use-studio-commands.ts`, `dock-toggle.tsx`, `studio.dockCollapsed` |
| (+) Click the zoom % to reset to 100%; Ctrl+wheel zooms; Fit is "sticky" (stays fitted on resize) | Zoom bar % button and canvas; keep | ✅ reset `zoom-toolbar.tsx:99`; Ctrl+wheel `use-canvas-zoom.ts:60`; sticky fit `:80` |
| (+) Rulers are always on today (no toggle) | The Rulers toggle in the row above is new; default on | ✅ `zoom-toolbar.tsx:89`; default on, remembered `use-studio-ui.ts:23` |
| (+) The "Magic wand" in the table above was the **Auto** inspector-position icon (no canvas auto-arrange action exists) | Auto is gone with the inspector position setting; confirm before building a separate auto-arrange action | ✅ (decision #14) nothing left to cover |
| (+) Dock collapse button at the left end of the zoom strip (bottom dock) | Keep as the docked inspector's collapse strip | ✅ `dock-toggle.tsx` in `studio-shell.tsx` (the zoom bar's left end is the left-panel toggle `zoom-toolbar.tsx`) |

## 6. Layers
| Current | New | Status |
|---|---|---|
| Rows with icon and name | Same; the icon shows the zone type | ✅ `layers-panel.tsx:85-86` (`zone-icons.ts`) |
| Position label "C1·R1 3×2" | Size `3×2` in the row; full position in the tooltip and the placement row | ✅ `layers-panel.tsx:90` (size) and tooltip `:60`; placement row `zone-inspector-parts.tsx:291` |
| Eye | Same | ✅ `layers-panel.tsx:93-102` |
| Trash | Delete button in the row, context menu, ⌫ | ✅ `layers-panel.tsx:103-112`; context menu `zone-menu.ts:71`; Del / Backspace |
| Hint text | Footer note | ✅ `layers-panel.tsx:118` |
| (+) Click a row selects the zone and scrolls it into view on the canvas | Keep | ✅ `layers-panel.tsx:63` → `use-studio-commands.ts:51` focusZone |
| (+) Rows are in grid reading order (top to bottom, left to right) | Keep | ✅ `layers-panel.tsx:52` (`sortZones`, `zone-geometry.ts`) |
| (+) Hidden zones dimmed in the list | Keep | ✅ `layers-panel.tsx:82` |

## 7. Library (Add drawer)
| Current | New | Status |
|---|---|---|
| Chips: All, Layouts, My panels, System, Media, Network, Info, Other | Same chips; "Other" is replaced by Hardware, Storage, Audio, Gaming and Generic (decision D2 in `PHASE9_PLAN.md`) | ✅ `insert-panel.tsx:12,260` |
| 16 widgets | Widget cards with "min W×H"; the Library lists the template widgets (§16); the 16 legacy ids are retired, their zones migrated to the templates on load | ✅ `insert-panel.tsx:93`, min W×H `insert-row.tsx:81`; library §16; migration `src/lib/legacy-zones.ts` (config v4) |
| Layout starters (6) | Layouts › Layout starters, plus "Blank zone" | ✅ `insert-panel.tsx:99,173` (Blank zone + 6 starters, `src/lib/panel-starters.ts`) |
| Panel presets (10) | Layouts › Panel presets | ✅ `insert-panel.tsx:173` (`src/lib/panelPresets.ts`, 10) |
| My panels (saved from the panel "…" menu; shared by all profiles; exported; each use is a fresh copy) | My panels; save via the context menu "Save to My panels" | ✅ `insert-panel.tsx:173`; save via `zone-menu.ts:77` → `use-studio-mutations.ts:144` → `panel-preset-actions.ts:33` |
| Drag onto the grid | Drag with a drop ghost, or click to auto-place; a click fills a selected blank zone | ✅ `insert-row.tsx:101`, `studio-canvas.tsx:329`; click `use-studio-mutations.ts:104`; fill blank `:117` |
| (+) Search box (matches title, id and description, every word) | Library search; Esc clears it | ✅ `insert-panel.tsx:146,260` (Esc clears) |
| (+) Usage count badge on each widget row (how many zones of the profile use it) | Keep on the widget cards | ✅ `insert-row.tsx:129` |
| (+) Section notes (minimum size, "sensor-free starters", panels note) | Keep as the section footers | ✅ `insert-panel.tsx:173` (notes), card line `insert-row.tsx:81` |
| (+) My panels rows: Rename… / Delete in the row's "⋯" | Keep in the My panels group | ✅ `insert-row.tsx` saved menu → `use-studio-mutations.ts:152` |
| (+) Widget picker dialog for a zone (Change widget / Pick a widget) with the same search, chips and list | Keep: opened by the chip's name, Widget type, and Ctrl+K "Pick widget…" | ✅ `widget-picker-dialog.tsx:79`; opened from `selection-chip.tsx:24`, `zone-inspector-parts.tsx:324`, palette "Pick widget…" `commands.ts`, blank tile `placement-frame.tsx:344` |

## 8. Inspector header and navigation
| Current | New | Status |
|---|---|---|
| Zone name | Editable name input | ✅ `zone-inspector-parts.tsx:100` (read-only for widgets without a Title setting: Departures, Notifications, Text File, Stream Deck, Other sensors) |
| "11 live sensors" | Meta: `W×H · min · N data points` / `Panel · layout · N widgets` / `Blank zone` | ✅ `inspector/zone-meta.ts:19` |
| Hide / duplicate / remove / close | Header icon buttons; close = Esc or click on empty canvas | ✅ `zone-inspector-parts.tsx:35`; Esc / empty-canvas click `studio-canvas.tsx:439` |
| Zone box (column, row, width, height) | Placement row COL / ROW / W / H | ✅ `zone-inspector-parts.tsx:291` → `use-studio-mutations.ts:247` |
| Search | Search across all tabs | ✅ `zone-inspector-parts.tsx:350`, `inspector-model.ts:383` |
| Category list that jumps to a card | Tabs plus collapsible sections plus search | ✅ tabs `inspector/inspector-view.tsx:87`, sections `setting-card.tsx:44` |
| "N changed" per card; reset of only that card | "N changed" plus Reset on every section; changed-count badge on each tab | ✅ `setting-card.tsx:93` (+ Reset), tab pills `inspector/inspector-view.tsx:117` |
| Setting dots (default / set here / dashboard / profile / overriding; hover a set dot to reset) | Source dots (README §5.6), legend behind `help` in the footer; click a set-here dot to reset | ✅ `inspector/source-dot.tsx:28` (click to reset), legend `:45` in the footer `inspector/inspector-view.tsx:129` |
| Inspector side / bottom dock, 300 px columns | One column: docked 320 px / floating 320 px card / bottom sheet (peek, half, full), chosen by the studio width | ✅ `studio-inspector.tsx`, `studio-layout.ts`, `bottom-sheet.tsx`, `inspector/sheet-view.tsx`, `inspector/inspector-view.tsx` |
| (+) Esc clears the search first, then steps out (panel widget → zone → none), then closes the left drawer | Keep this order | ✅ `use-studio-commands.ts:61` |
| (+) Palette entries "Go to setting: …" and "Go to Widget settings / Colors & surface" scroll to and flash the card | Keep: the registry feeds the palette; the jump now switches tab and opens the section | ✅ `commands.ts:227` (`settingCommands`, from `allSections` of the current context: widget, panel, Dashboard) → `use-studio-commands.ts:155` (`jumpInspector(section, key)` switches the tab, opens, flashes and focuses the field, `inspector/inspector-view.tsx:218`) |
| (+) Section open/closed state is remembered (`studio.sections`) | Accordion: one open or many open (Dashboard › General › Studio › Inspector sections, `studio.accordion`, default one); the open section itself is not remembered | ✅ `inspector/inspector-prefs.ts`, `inspector/inspector-view.tsx`, `setting-card.tsx`; `use-section-state.ts` deleted, scroll-spy removed |
| (+) Quick bar: a floating pill at the top of the canvas with identity, pinned settings, visibility and (floating) "All settings" | New: Dashboard › General › Studio › Quick bar (`studio.quickBar`, default on) | ✅ `quick-bar.tsx`, `quick-sets.ts` |
| (+) Pin a setting to the quick bar (per widget type, max 6) | New: pin button on each inspector row; before any pin a rule-based default set applies; multi-select shows the shared pins | ✅ `quick-sets.ts`, `setting-rows.tsx`, `studio.quickPins` |
| (+) Changed filter: lists only the values set here across every tab, with Reset all | New: "Changed N" toggle beside the search | ✅ `inspector/inspector-view.tsx`, `inspector-model.ts` |
| (+) Colour swatches (Auto, Blue, Violet, Teal, Green, Amber, Rose, White, custom) | New on colour rows and in the quick bar | ✅ `inspector/color-swatches.tsx` |
| (+) Hidden zones show at 35% with a dashed border and an eye-off badge; double-click a zone opens all settings | New on the canvas | ✅ `placement-frame.tsx`, `studio-canvas.tsx` |
| (+) Changed count, Reset and the info-tooltip hint on every card | Already listed; keep the hint tooltip too | ✅ `setting-card.tsx:93`, info icon on the section header |
| (+) Rows are locked (read-only) while the zone follows the global style or Force is on | Keep; shown as the amber "ignored" dot plus the Customize link | ✅ (decision #10) rows stay editable; Follow banner + "Edit global theme" `inspector-model.ts:548`, `zone-inspector.tsx` |
| (+) Zone-header breadcrumb "Panel › Widget" (crumbs select the panel / show the widget editor) | Keep above the tabs when a panel widget is selected | ✅ `zone-inspector-parts.tsx:69` |

## 9. General cards (all zones)
| Current field | Tab › Section | Notes | Status |
|---|---|---|---|
| Widget type + Change | C › Widget | select of the registered types | ✅ `zone-inspector.tsx:240` → `zone-inspector-parts.tsx:324` (the list is the 50 templates and the catch-all) |
| Custom title | C › Widget | | ✅ `standard-settings.ts:368` |
| Show title (on / off) | C › Widget | switch | ✅ `standard-settings.ts:367`, `Widget.tsx` (header + summary title line) |
| Icon (grid of about 20, including none) | C › Widget | icon grid | ✅ `standard-settings.ts:275`, `setting-control.tsx:134` (20 icons + none) |
| Hide when idle | C › Widget | only Spotify, Media, Steam, FPS, Notifications | ✅ (decision #13) removed from every widget at the user's request; a stored `hideWhenIdle` is ignored and the widget stays shown |
| Visible | C › Widget, plus header eye | | ✅ `zone-inspector.tsx:242` + header eye `zone-inspector-parts.tsx:35` |
| Layout auto/card/standard/compact/simple | S › Size & alignment | adaptive widgets only | ✅ `standard-settings.ts:249` (decision #2: all 11 modern widgets; now every template widget: the value forces the shell's size tier, `core/look.ts` `LAYOUT_TIERS`) |
| Scale with the zone | S › Size & alignment | Adv | ✅ `standard-settings.ts:59` (Adv) |
| Size % | S › Size & alignment | | ✅ `standard-settings.ts:67` |
| 3×3 alignment (+ Auto / Spread) | S › Size & alignment | alignment grid | ✅ `standard-settings.ts:78` → `align-grid.tsx:43` |
| Text color, secondary color | S › Typography | | ✅ `standard-settings.ts:110` |
| Font, value weight | S › Typography | | ✅ `standard-settings.ts:113,124` (catalog `src/lib/fonts.ts` keeps sans / rounded / serif / mono) |
| Label case: Auto / UPPERCASE / As written / Capitalized | S › Typography | | ✅ `standard-settings.ts:139` |
| Inner padding, gap, corner radius (Auto + values) | S › Spacing & shape | | ✅ `standard-settings.ts:87` (a profile's Corner radius, `MonitorProfile.radius`, rounds the outer card; the widget's own value wins) |
| Ring / bar thickness | S › Spacing & shape | | ✅ `standard-settings.ts:152` |
| Follow global / Custom | S › Colors & surface › Look | | ✅ `zone-inspector.tsx:244` → `style-mode-bar.tsx` |
| Style preset | S › Colors & surface | | ✅ `style-tools.tsx:63` (Apply preset) |
| Surface: Auto (the skin's card; same as unset), Glass / Matte (light) / Matte (dark) / Theme, plus 12 generic cards (Solid, Outline, Flat, Tinted, Aurora, Neon, Holo, Mesh, Carbon, Inset, Studio, Terminal). Panels and plain cards keep the four materials. A skin pick sets Auto | S › Colors & surface | | ✅ `standard-settings.ts` (`surface`); swatches `surface-picker.tsx` |
| Accent | S › Colors & surface | | ✅ `standard-settings.ts:276` |
| Background image (upload / URL / drop), use as background | S › Colors & surface | Adv | ✅ `standard-settings.ts:277` (Adv) → `setting-control.tsx:141` → `media-field.tsx:30` (upload / URL / drop) |
| Surface opacity, background blur | S › Colors & surface | | ✅ `standard-settings.ts:203,213` |
| Copy / paste / save style | Context menu (⌘⌥C / ⌘⌥V) + Style preset "Save" | | ✅ `style-tools.tsx:63`; context menu `zone-menu.ts:87`; keys `use-studio-shortcuts.ts` (Ctrl+Alt+C / V) |
| Border width, border color | S › Border & effects | | ✅ `standard-settings.ts:174` |
| Glow none/soft/strong, glow color | S › Border & effects | the colour shows only when glow ≠ none | ✅ `standard-settings.ts:183,195` (decision #11) |
| Zone frame: accent, background, title header | S › Border & effects | Adv | ✅ `zone-inspector.tsx:268` → `zone-design-section.tsx:33` (Adv) |
| Custom CSS (`@scope`, `:scope` = root) | S › Advanced | Adv | ✅ `standard-settings.ts:162` (Adv) |
| (+) Preset (Default / Dark / Light / Vivid / Mono quick look; writes surface, tint, accent) | S › Colors & surface, next to Surface (not a look key: absent from Global style) | | ✅ `standard-settings.ts:232` (decision #1) |
| (+) Use as global… (All profiles / This profile) | Colors & surface "…" menu and the context menu | ✅ Colors & surface "…" menu `style-tools.tsx:134`; zone context menu rows `zone-menu.ts:94` → `use-studio-commands.ts:209`; palette "Use as global style: …" `commands.ts` |
| (+) Style presets: Apply preset, Save as preset…, Delete preset | S › Colors & surface "…" menu (already named above as "Style preset"; Delete is also needed) | | ✅ `style-tools.tsx:63` (Apply / Save as preset… / Delete submenus) |
| (+) Frame background hidden on panels (they have their own surface) | S › Border & effects › Zone frame; keep the panel exception | | ✅ `zone-inspector.tsx:270` (`frameFields(!zone.panel)`, decision #9) |
| (+) Layout appears in the code for all 11 modern widgets, not only adaptive ones | See `settings-inventory.md` open question 2; default: keep on all 11 | | ✅ (decision #2) |
| (+) Departures, Notifications, Text File, Stream Deck and Other sensors have no title, icon, preset, layout or background image, and their Surface defaults to Theme | Their Widget section shows only the type and Visible; Style shows the rest | | ✅ `standard-settings.ts:322` (CARD_SETTINGS: Surface default Theme, no title / icon / preset / layout / background image) |

## 10. Widget-own categories
| Widget | Section → tab | Status |
|---|---|---|
| System | Devices, CPU, GPU, Memory, Drives, Trends, Thresholds, Units & labels → C; Device colors → S (Adv) | ✅ the SystemOverview template (`src/widgets/SystemOverview.tsx`, keys `src/widgets/registry/system-overview.ts`): sections and thread view in its System Overview group; zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`), devices / VRAM → `sections`, threads → `coreView`, the old colours and defaults written out |
| Spotify / Media | Now playing (times, progress), Cover art (tint, blurred bg), Visualizer (style, device, timeline, gain, count, alignment · resting · orientation = Adv), Visualizer shape (line width, edge fade, fade width = Adv; shape, gap, peaks) → C; Audio source (live capture, capture devices checklist, microphone access) → D | ✅ the NowPlaying template (`src/widgets/NowPlaying.tsx` through `<AudioViz>`, keys `src/widgets/NowPlaying/settings.ts`, `registry/c.ts`; mic button `setting-pickers.tsx`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) with `source` spotify / media, `progress` visualizer and `vizEngine` from the old waveform / visualizer switches. Idle animation, loading sweep and `waveformActive` were synthesised and are dropped |
| Visualiser look (NowPlaying template, Visualizer widget) | One style picker (bars, mirror, wave, line, dots, radial, blob, scroll); Follow / Custom colours (solid, gradient, ramp; colours 1–3, peak colour, opacity, glow) → S (Adv); bar shape, gap, peak caps, line width, edge fade → C; dynamics (floor, ceiling, tilt, auto gain, attack, release) → C (Adv) | ✅ `src/widgets/registry/viz-settings.ts` (Visualizer colors / shape / dynamics groups), `src/widgets/registry/c.ts`; drawn by `src/widgets/core/viz/` (replaces `MiniViz`, `BarVisualizer`, `LiveWaveform`); dev check `?viz-gallery` |
| Steam | Content (stats, news; scrim) → C | ✅ the GameSpotlight template, composite layout (`src/widgets/GameSpotlight.tsx`, keys `src/widgets/spotlight-settings.ts`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`): `spotlightLayout: composite`, no motion, Dim banner off → `scrim: 0` |
| Hardware | Content (rows, dot colours) → C, Dot colors → S (Adv); the temp gauges view → Thermals | ✅ the SensorGroup template in auto-discovery mode (`src/widgets/SensorGroup.tsx`, keys `src/widgets/registry/hardware-settings.ts`); the temps view is Thermals (`src/widgets/Thermals.tsx`, `view: gauges`, every sensor); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) by its view |
| Weather | Display (full/now/forecast/minimal, tint), Current conditions, Forecast (days) → C | ✅ the Weather template (`src/widgets/Weather.tsx`, settings `registry/b.ts`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) |
| FPS | Content (gauge/trend, metrics, sparkline) → C; Gauge colors → S (Adv) | ✅ the FpsMonitor template (Gauge colors Adv; `src/widgets/FpsMonitor.tsx`, keys `src/widgets/fps-settings.ts`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) with `view: gauge` |
| Audio | Content (device, meter/volume) → C; Meter (style, orientation, ballistics; colours Adv) → C | ✅ the AudioMeter, MeterBridge and VolumeMixer templates (`registry/c.ts`, shared keys `registry/audio-settings.ts`, decisions #3, #4: meter colours Adv); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`): the view picks the template, the meter style / orientation / source map onto its keys |
| Wave Link | Content (meters to show, dB readout, fader, mixes) → C; Meter (incl. level colour, Adv) → C | ✅ the WaveLink template (`src/widgets/WaveLink.tsx`, keys `registry/audio-settings.ts`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) with the old teal as `levelColor` |
| Bluetooth | Content (full/devices/status) → C; Battery colors → S (Adv) | ✅ the Bluetooth template (Battery colors Adv; `src/widgets/Bluetooth.tsx`, options `src/widgets/registry/e.ts:73`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) |
| Network | Content (session totals, sparkline; the speeds/totals view was only a preset for them and was removed) → C; Speed colors → S (Adv) | ✅ the NetworkThroughput template (Speed colors Adv; `src/widgets/NetworkThroughput.tsx`, settings `registry/b.ts`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) with the old speed colours written out |
| Departures | Content (status) → C | ✅ the Departures template (`src/widgets/Departures.tsx`, options `src/widgets/registry/e.ts:63`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) (`vbz`, on the Theme surface) |
| Notifications | Content (history, max lines) → C | ✅ the Notifications template (`src/widgets/Notifications.tsx`, options `src/widgets/registry/e.ts:46`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) (on the Theme surface) |
| Text File | Content (meta) → C | ✅ the TextFile template (`src/widgets/TextFile.tsx`, options `src/widgets/registry/e.ts:37`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) (on the Theme surface) |
| Stream Deck | Content (profile, labels) → C | ✅ the StreamDeck template (`src/widgets/StreamDeck.tsx`, options `src/widgets/registry/e.ts:105`); zones with the legacy id load as it (config v4, `src/lib/legacy-zones.ts`) (on the Theme surface) |
| Web Page | Page (URL) → C; Style reduced to Colors & surface, Border & effects, Advanced. **Code today:** also `scale` (Size & alignment) and `radius` (Spacing & shape), accent and the four border/glow keys, and no Custom CSS: keep what exists, see `settings-inventory.md` question 5 | ✅ (decision #5) the WebPage template (settings `src/widgets/registry/e.ts:22`; legacy `webpage` zones migrate to it, config v4); drawn by `src/widgets/WebPage.tsx`; note `inspector-model.ts:577` |
| Other sensors | no own settings; it still has the card style (Surface default Theme, accent, size, spacing, typography, border and effects) | ✅ `standard-settings.ts:322`; drawn by `src/modules/other-sensors.tsx`, one `src/widgets/SensorValue.tsx` per key |

Enter each widget's **exact** current fields from its settings component. The prototype's fields are representative only.

## 11. Panels
| Current | New | Status |
|---|---|---|
| Panel card: Visual / Code | C › Panel › Editor; Code = JSON textarea, Apply / Ctrl+Enter, one undo step | ✅ `panel-sheet.tsx:50`, Editor `panel-layout-section.tsx:229`, JSON `panel-code-view.tsx:22` (Ctrl+Enter, one undo step) |
| Fill / Hug, gap 0–200 / auto, padding 0–200 / auto | C › Panel (keep the **auto** option for gap and padding) | ✅ `panel-layout-section.tsx:229` (auto placeholders) |
| Layout Stack: direction, wrap (on), 3×3 alignment (along: start/center/end/spread; across: start/center/end/stretch) | C › Layout | ✅ `panel-layout-section.tsx:55` |
| Layout Grid: columns 1–12, column sizes, row sizes, 3×3 cell alignment | C › Layout | ✅ `panel-layout-section.tsx:97`, `track-editor.tsx:27` |
| Layout Overlay: scrim, band alignment, bottom band columns 1–12, title top-right | C › Layout | ✅ `panel-layout-section.tsx:194` (scrim `:153`); "title top-right" is a render rule, no control existed |
| Background card (Overlay) | C › Background | ✅ `panel-layout-section.tsx:153` |
| Widgets list: drag reorder, hide, duplicate, copy/paste, change kind, delete | C › Widgets | ✅ `panel-layers.tsx:34` (drag `:107`, menu `:163`) |
| Selected widget: kind card (kind-specific fields) | C › Selected · … | ✅ `widget-editor/index.tsx:29`, `widget-editor/display-section.tsx:16` |
| Selected widget: Display (label, sensor, sub sensor, unit, decimals, scale) | C › Display, plus the kind card | ✅ `widget-editor/data-section.tsx:13` |
| Selected widget: Size & placement (Hug / Fill / Fixed · span / start · band) | C › Size & placement | ✅ `widget-editor/layout-section.tsx:104` |
| Selected widget: Typography, Colors | C › Typography & colors | ✅ `widget-editor/style-section.tsx:37,54` (grouped by `inspector/panel-cards.ts:9`) |
| Selected widget: Advanced (class names, CSS scoped to the cell) | C › Selected · Advanced (Adv) | ✅ `widget-editor/style-section.tsx:68` |
| Panel surfaces None / Card / Bordered card | S › Colors & surface (panels show these options) | ✅ `standard-settings.ts:298` (PANEL_SETTINGS surface None / Card / Bordered card) |
| Save panel to My panels (panel "…" menu) | Context menu "Save to My panels" | ✅ `zone-menu.ts:77`, `panel-preset-tools.tsx:7`, palette "Save panel as preset…" |
| CSS hooks (`.wp-panel`, `.wp-widget--{kind}`, parts, variables, `@scope`) | Unchanged | ✅ (decision #6) render path untouched; `css` in Code view only |
| (+) Code view: Revert (drops the draft), inline parse errors, panel title change also updates the shown title | C › Panel › Code | ✅ `panel-code-view.tsx:22` (Revert `:74`); title sync `panel-sheet.tsx` applyCode |
| (+) Widget list keyboard: Up/Down select, Alt+Up/Down reorder, Delete removes; row menu Duplicate / Copy / Paste after / Change kind / Remove | C › Widgets; keep (README §5.4 shortcuts also apply) | ✅ `panel-layers.tsx:70,163` |
| (+) Panel widget shortcuts: Del, Ctrl+D, Ctrl+C, Ctrl+V, Alt+Up/Down; palette "Select widget: …" for each widget | Keep | ✅ `use-studio-shortcuts.ts` (widget scope), `commands.ts` widgetCommands / selectWidgetCommands |
| (+) Grid track editor: chips accept any CSS track (`1fr`, `auto`, `120px`, `minmax(0, 1fr)`), +/− add or drop the last track, Equal | C › Layout (Column sizes / Row sizes) | ✅ `track-editor.tsx:27` |
| (+) Overlay Background: choose which image widget fills it; dark scrim toggle | C › Background | ✅ `panel-layout-section.tsx:153` |
| (+) Panel widget: width/height Fixed px (1–4000), Align self, Column/Row start (1–24), Column/Row span (1–12) | C › Size & placement | ✅ `widget-editor/layout-section.tsx:26,104` |
| (+) Panel widget table: Rows 1–20 (7), Columns, Header; sparkline history 5–200 (40); image Max height; clock Show; shape Shape and Thickness | C › Display (per kind, `settings-inventory.md` §3.3) | ✅ `widget-editor/display-section.tsx:16`, `widget-editor/data-section.tsx:13` |
| (+) "Not in the live sensor list" warning on a bound sensor | Keep under the Sensor field | ✅ `widget-editor/sensor-field.tsx:76` |
| (+) Panel Gap and Padding empty = auto | Already noted in this section; keep the "auto" placeholder | ✅ `panel-layout-section.tsx:229` |
| (+) Saved panels: Rename… / Delete in Add › My panels | Library (§7) | ✅ `insert-row.tsx`, `use-studio-mutations.ts:152` (see §7) |

## 12. Nothing selected → Dashboard inspector
| Current | New | Status |
|---|---|---|
| Appearance: scope All profiles / This profile | Dash › Appearance › Scope | ✅ `appearance-panel.tsx:41` (`document-inspector.tsx:198`) |
| Force global style (Inherit / On / Off; dashboard or per profile) | Dash › Appearance › Scope | ✅ `appearance-panel.tsx:14,41` |
| Presets gallery (saved looks, one undo step; background only where none is set unless "Replace the page background"). The 9 built-ins are replaced by the skin gallery (14 live skins, a pick sets surface Auto) and the surface / theme swatches | Dash › Appearance › Skins; Theme & surface | ✅ `skin-gallery.tsx`, `appearance-gallery.tsx` (saved looks), `surface-picker.tsx`, `theme-panel.tsx` (theme swatches) |
| Save the current look as a preset | Same section | ✅ `appearance-gallery.tsx:267` |
| Global style (general cards at dashboard or profile level) | Dash › Global style (scope-aware note) | ✅ Global style tab `inspector-model.ts:305`, note `:548` |
| Page › Theme colors (19 tokens, 6 presets; corner radius moved to Dash › Profile › Profile) | Dash › Appearance › Theme & surface › Theme (6 swatches, then the editable tokens; Surface, Background opacity and Background blur sit above) | ✅ `theme-panel.tsx:6,72` (13 editable tokens; decisions #7, #8) |
| Page › Background (none/color/gradient/image/video, fit, position, dim, tint, blur; video rules) | Dash › Appearance › Page background | ✅ `background-panel.tsx:51`, `background-editor.tsx:40` |
| General › Type (font) | Dash › General › Type | ✅ `general-panel.tsx:67` |
| General › Clock & date (12/24 h, seconds, locale) | Dash › General › Clock & date | ✅ `general-panel.tsx` (doc:clock) |
| General › Display (motion, hide cursor in kiosk) | Dash › General › Display | ✅ `general-panel.tsx:119` |
| Connection (Data API URL) | Dash › General › Connection | ✅ `data-api-panel.tsx:15` |
| (+) Connection: Test connection (testing / connected / not reachable) and the "Open API index" link | Dash › General › Connection | ✅ `data-api-panel.tsx:60,73` |
| (+) Appearance gallery: Rename… / Delete on saved looks; image badge on looks that bring a background | Dash › Appearance › Skins › Saved looks | ✅ `appearance-gallery.tsx:59` (Rename… / Delete), image badge on the card |
| (+) After applying a preset: banner "N widgets keep their own style · N profiles have their own look" with **Make them follow** and Dismiss | Dash › Appearance › Skins › Saved looks | ✅ `appearance-gallery.tsx:150` |
| (+) Commands "Make all widgets follow global style", "Force global style…" and "Apply appearance: …" | Palette entries; also an action row in Dash › Appearance | ✅ palette entries `commands.ts` → `use-studio-commands.ts`; action row "Make all widgets follow" in Dash › Appearance › Scope `appearance-panel.tsx:90` (`presets.clearOverrides`, `document-inspector.tsx`) |
| (+) Page background media: Upload… (drop a file on the field too), typed URL (Enter or blur), Library popover (delete a file, clean up unused files after a confirm), live preview, poster image | Dash › Appearance › Page background | ✅ `media-field.tsx:30` (Upload, drop, typed URL), library `media-library.tsx:36` (delete, clean up `:121`), preview, poster `background-video.tsx:13` |
| (+) Video options: Loop, Muted, Speed (0.5×–2×), Poster, performance hint | Dash › Appearance › Page background | ✅ `background-video.tsx:13` |
| (+) Background Effects: Dim, Tint colour + opacity, Blur (0–40 px) | Dash › Appearance › Page background | ✅ `background-editor.tsx:120` |
| (+) Page background, All profiles scope: when the active profile has its own background the editor warns, with **Use this one** (profile inherits) and **Edit <profile>'s** (switch scope); Appearance opens on This profile when the profile has its own style, force setting or background | Dash › Appearance › Page background | ✅ `background-panel.tsx` (`background-panel.test.tsx`), `document-inspector.tsx` |
| (+) Per-profile background modes Inherit / Custom / None; Custom starts from the dashboard background | Dash › Profile › This profile | ✅ `inspector/profile-sections.tsx:212`, `background-panel.tsx:51` |
| (+) Theme: six colour-only swatches that leave the radius alone; "edited" tag when tokens match no preset; Custom starts from the dashboard theme for a profile | Dash › Appearance › Theme & surface | ✅ `theme-panel.tsx`, `profile-theme-panel.tsx` |
| (+) Six theme tokens (`popover`, `popover-foreground`, `secondary-foreground`, `accent-foreground`, `destructive-foreground`, `input`) are in the config and presets but not editable | Keep unreachable, or Adv (`settings-inventory.md` question 7) | ✅ (decision #7) no row |
| (+) General › Clock & date locale list (14 locales plus System; an unknown saved locale is kept as an option) | Dash › General › Clock & date | ✅ `general-panel.tsx:35` |

## 13. Data
| Current | New | Status |
|---|---|---|
| Sources tab | Sources mode: tree, health, table, point inspector, endpoints | ✅ `sources-panel.tsx:54` + `explorer/*` |
| Widgets claim sensors by key prefix | Unchanged; shown as "Bound data" and "Used by" | ✅ `src/lib/data-usage.ts:71`; Bound data `inspector/bound-data.tsx:36`; Used by `explorer/point-inspector.tsx` |
| Panel widget sensor field | Sensor field → picker in single mode | ✅ `widget-editor/sensor-field.tsx:29` → `inspector/data-picker.tsx:27` (item mode) |
| `/api/push`, `/api/clear` | Add source menu; Pushed via API category | ✅ `explorer/explorer-header.tsx:22-29` (Add source menu: copy push URL, clear pushed); "Pushed via API" `explorer/source-tree.tsx` |
| Data API URL | Dash › General › Connection | ✅ `data-api-panel.tsx:15` |
| (+) Sources mode: per-source show/hide (eye) and Display name (`sourcePrefs`, stored on the dashboard) | Sources mode, source row and detail; today nothing outside the Sources panel reads them | ✅ `explorer/source-tree.tsx:93` (eye + display name), `group-summary.tsx:29` (decision #12) |
| (+) Sources mode: Bind to widget / Unbind (writes the widget's `source` setting) | Sources mode "Used by" actions and Data tab › Bound data | ✅ `explorer/point-inspector.tsx:184` → `sources-panel.tsx:124`; Data tab `inspector/bound-data.tsx:36` |
| (+) Sources mode: filter box, refresh (reload from the Data API), "Open API index" link, live value chip on each source | Sources mode toolbar and rows | ✅ (decision #16): filter box and reload `explorer/explorer-header.tsx:58`, API index link; live values per point in the table and point inspector, sources show a count + health dot |
| (+) Audio source (live level source, live capture, capture devices, microphone access) | D › Audio source (already stated in §10; listed here for the data checklist) | ✅ `src/widgets/NowPlaying/settings.ts` (Data tab), `setting-pickers.tsx` |

## 14. Keyboard, command palette and persistence (+)
| Current | New | Status |
|---|---|---|
| (+) Command palette (Ctrl+K): Add, Profiles, Zones, selected zone/widget actions, Go to setting, drawers, document tabs, layout modes, zoom, appearance presets, export/import/copy profile/shortcuts | Keep every command; the registry supplies the setting and tab entries; palette stays on Ctrl+K and in `⋯` | ✅ `commands.ts:264`, `command-palette.tsx:96`, Ctrl+K `use-studio-shortcuts.ts:64` (Go to setting: see §8 partial) |
| (+) Shortcuts (cheat sheet `?`): Ctrl+S / Z / Shift+Z / Y / K / D / 0 / = / - / `\`, Esc, Del / Backspace, H, arrows, Shift+arrows; widget: Del, Ctrl+D, Ctrl+C, Ctrl+V, Alt+Up/Down | Keep (README §5.4); shortcuts never fire while focus is in an input | ✅ `use-studio-shortcuts.ts:64-145,173`, `shortcuts-dialog.tsx:28`; typing guard (Ctrl+S / Ctrl+K stay live while typing, undo / redo stay the field's own) |
| (+) Copy style / Paste style clipboards and the copied panel widget are session-only | Keep session-only | ✅ `use-studio-ui.ts:58-60` |
| (+) Autosave: the studio pushes the config to the server 400 ms after a change; Save flushes; the kiosk reloads from `/events/config` | Keep (CLAUDE.md "Save") | ✅ `App.tsx:124` (400 ms), kiosk reload unchanged |
| (+) Undo history: whole-config snapshots, limit 100, edits to one field within 500 ms coalesce | Keep; one drag / panel JSON apply / appearance preset = one step | ✅ `src/hooks/config-history.ts:7,10` |
| (+) Studio UI preferences in `localStorage`: `studio.dockCollapsed`, `studio.drawer`, `studio.quickBar`, `studio.accordion`, `studio.quickPins` (`studio.layout`, `studio.dockHeight` and `studio.sections` are removed) | Keep; README §5.9 | ✅ `left-rail.tsx`, `use-studio-layout.ts`, `use-studio-ui.ts`, `inspector/inspector-prefs.ts` |
| (+) Import config… runs the v1→v2 migration; invalid files are logged and ignored | Keep | ✅ `config-file.ts:22` (`mergeConfig`; errors logged and ignored) |

## 15. Found in the old studio code (`135d84f`), no row before
Features of the deleted or rewritten `zone-toolbar.tsx`, `settings-panel.tsx`, `setting-card-model.ts`, `sensor-picker.tsx`, `category-sheet.tsx`, `studio-drawers.tsx`, `profiles-panel.tsx`, `sources-panel.tsx`, `zoom-toolbar.tsx`, `studio-top-bar.tsx` and the pre-`135d84f` `panel-inspector.tsx`.

| Current | New | Status |
|---|---|---|
| Zone toolbar: deselect (X) and "Edit the zone's style" (Style) buttons | Chip More menu: Deselect, Edit style | ✅ `zone-menu.ts:71`, `selection-chip.tsx:96` |
| Click on the empty canvas around the page deselects | Keep | ✅ `studio-canvas.tsx:439` |
| Empty-layout card "Browse widgets" (opens Add) | Keep | ✅ `canvas-cards.tsx:10` |
| Sensor picker: searchable dropdown of the Data API catalog (50 results, current value, clear) | Sensor field → data picker in single mode (80 results, live values, Unbind, Open data explorer) | ✅ `widget-editor/sensor-field.tsx:29`, `inspector/data-picker.tsx:27` |
| Docked drawer "Close" button | Rail icon toggles the panel; zoom-bar left-panel toggle; Esc | ✅ `left-rail.tsx`, `zoom-toolbar.tsx:83`, `use-studio-commands.ts:61` |
| Colour row: "auto" text button ("Reset to auto") | Colour field "Auto" button plus the source-dot reset | ✅ `src/components/ui/color-field.tsx:36-42`, `inspector/source-dot.tsx:28` |
| Profiles panel: pin icon on the pinned profile; Auto entry | Check on the active row, "auto" tag in the top bar, Auto-pick toggle | ✅ `profiles-panel.tsx:146`, `studio-top-bar.tsx:113` |
| Rail brand glyph "Dashboard studio" (no action) | Accent square in the top bar | ✅ `studio-top-bar.tsx` (decorative) |
| Rail drawer titles (`DRAWER_TITLES`) | Each panel draws its own header | ✅ `insert-panel.tsx:328`, `layers-panel.tsx:30`, `profiles-panel.tsx:146` |
| Panel inspector: Title, Show title, Background (None / Panel / Bordered), Accent | Widget › Title (empty = hidden), Colors & surface › Surface and Accent | ✅ `standard-settings.ts:298-313` (legacy `titleVisible` / `background` / `accent` still read when the setting is absent) |
| Settings card: short toggles paired two to a line (`pairRows`) | One field per row | ✅ (decision #17): one field per row, as the spec's field rows; no setting lost |
| Settings card: dock category list on the left with per-category changed counts | Tabs with changed pills, sections with "N changed" | ✅ `inspector/inspector-view.tsx:87`, `setting-card.tsx:93` |
| Source detail pane: live value chip per source | Count + health dot per source | ✅ (decision #16): count + health dot per source; live values per point |

## 16. Widget library (Phase 9)
Rows from `docs/redesign/widgets/docs/CLAUDE_CODE.md` §3, plus the six templates written for the plugin cards and Other sensors. Plan and decisions: `PHASE9_PLAN.md`. Every widget renders inside one shell (`src/widgets/core/Widget.tsx`).

| Capability | Where | Status |
|---|---|---|
| 44 widget templates in the Library, by category (System 9, Hardware 8, Storage 3, Network 2, Media 1, Audio 5, Info 4, Gaming 10, Generic 2) | Add › Library, chips System · Hardware · Storage · Network · Media · Audio · Info · Gaming · Generic | ✅ registered in `src/widgets/registry/a.ts:25`, `b.ts:69`, `c.ts:35`, `d.ts:42`; chips `insert-panel.tsx:13`; each is `templateModule` (`src/widgets/module.tsx`), min size from `meta.minSize` |
| Departures template (replaces the plain VBZ card) | Library › Info; Content › Status line | ✅ `src/widgets/Departures.tsx`, `registry/e.ts:63`; legacy `vbz` zones migrate to it (config v4) |
| Notifications template | Library › Info; Content › History, Max history lines; Hide when idle | ✅ `src/widgets/Notifications.tsx`, `registry/e.ts:46`; legacy `notifications` zones migrate to it (config v4) |
| Text File template | Library › Info; Content › Size / lines / status header | ✅ `src/widgets/TextFile.tsx`, `registry/e.ts:37`; legacy `textfile` zones migrate to it (config v4) |
| Bluetooth template | Library › Generic; Content › Status, Devices, Battery, View; Style › Battery colors (Adv) | ✅ `src/widgets/Bluetooth.tsx`, `registry/e.ts:73`; legacy `bluetoothmodern` zones migrate to it (config v4) |
| Stream Deck template | Library › Generic; Content › Profile, Button labels | ✅ `src/widgets/StreamDeck.tsx`, `registry/e.ts:105`; legacy `streamdeck` zones migrate to it (config v4) |
| Web Page template | Library › Generic; Content › Page (URL); reduced Style | ✅ `src/widgets/WebPage.tsx`, `registry/e.ts:22`; legacy `webpage` zones migrate to it (config v4) |
| Other sensors on the shell (one Sensor card per unclaimed key) | Library › Generic; Style (card look, Surface default Theme) | ✅ `src/modules/other-sensors.tsx`, `src/widgets/SensorValue.tsx` |
| Sensor Group (auto-discovered rows) | Library › Generic; Content and Data per its options | ✅ `src/widgets/SensorGroup.tsx`, `registry/b.ts:69` |
| Skin (14) | Style › Look › Skin, Follow / Custom, source dot | ✅ `standard-settings.ts:69` (in `STYLE_SETTINGS`, so dashboard / profile / widget resolution, dots and presets apply); category `inspector-categories.ts:48`; skins `src/widgets/core/skins/*.ts` |
| Variant (default / studio) | Style › Size & alignment › Dense summary | ✅ `standard-settings.ts` (`variant`, key unchanged); drawn by `StudioView` in `core/views.tsx` |
| Graph updates: Stepped / Smooth (look key `smoothing`; also Global style; reduced motion keeps graphs stepped) | Style › Look | ✅ `standard-settings.ts` (`smoothing`), `src/widgets/core/smoothing.ts`, `core/primitives.tsx` |
| System Overview has no dividers between columns; KPI Tiles tiles have no borders | Widget look | ✅ `src/widgets/SystemOverview.tsx`, `src/widgets/KpiTiles.tsx` |
| Graph style (6), Meter style (7) | Style › Look (Adv) | ✅ `standard-settings.ts:90,100`; resolved in `core/look.ts` `skinContext` |
| Per-widget layout options (e.g. Now Playing layout and visualizer) | Content tab, per the widget's own sections; the standard Layout stays in Style › Size & alignment | ✅ Now Playing `src/widgets/NowPlaying/settings.ts:269` (`playerLayout`) and visualizer group `:71`; other widgets' options in `src/widgets/registry/a-settings.ts`, `registry/settings-kit.ts` and `registry/a.ts`–`e.ts` (a template prop named like a standard key is stored under another key, `PHASE9_PLAN.md` §3 rule 3) |
| Shape-aware compact views (tile / strip / column) | Automatic by zone shape; Style › Size & alignment › Summary card: Auto / Never keeps the full layout / Always shows the summary at any size | ✅ shape `src/widgets/core/layout.ts:14`; form `summaryShape` `core/layout.ts:30`; switch `core/Widget.tsx:99`; setting `standard-settings.ts:135` |
| Sensor and device pickers for widget settings | Data tab | ✅ `sensorSetting` / `deviceSetting` in `src/widgets/registry/settings-kit.ts`, rendered by `setting-pickers.tsx` |
| Skin-aware panel widgets (a skin set → Bar / Spark / Ring / Num) | Style › Look on a panel zone (Variant and Summary card are hidden) | ✅ `src/components/widgets/panel-skin.tsx`; `NOT_FOR_PANELS` `standard-settings.ts:358` |
| Per-zone error tile (a throwing widget does not blank the kiosk) | Automatic | ✅ `src/components/zone-error-boundary.tsx`, `placement-frame.tsx:154` |
| Widget QA page (every module at six spans, overflow / overlap / clipping probe) | Dev only: `?widget-qa` | ✅ `src/widgets/widget-qa.tsx`, `qa-geometry.ts`; `docs/redesign/phase9/qa.md` |

## 17. Pages (profile pages, P2)
Plan: `docs/redesign/pages/PLAN.md`. The studio edits one page of the active profile at a time; page ops are the pure helpers in `src/lib/pages.ts`.

| Capability | Where | Status |
|---|---|---|
| Page tabs above the canvas (switch; "+" to add; shown with a single page too) | Design mode, strip over the canvas | ✅ `src/components/studio/page-tabs.tsx`; mounted in `studio-view.tsx`; page shown = `studioPage` in `src/App.tsx` |
| Add, rename (double-click, Enter / Esc), duplicate, delete (confirm, not the last) | Tab, its "⋯" or right-click menu | ✅ `page-tabs.tsx` (`pageMenuEntries`); mutations `addNewPage`, `renamePageTo`, `duplicateCurrentPage`, `deletePage` in `use-studio-mutations.ts` |
| Reorder pages by dragging a tab | Tab strip | ✅ `page-tabs.tsx` (`dropIndex`, `trackPointer`); `movePageTo` in `use-studio-mutations.ts` |
| Page icon (searchable lucide set, None) | Tab menu › Icon… | ✅ `page-tabs.tsx` `IconDialog`, `src/components/studio/page-icons.ts` |
| Move selected zones to another page | Zone menu › Move to page ▸ | ✅ `moveZonesToPage` in `studio-actions.ts`; `moveSelectionToPage` in `use-studio-mutations.ts`; flyout rows `src/components/ui/context-menu.tsx`; `zone-menu.ts` |
| Page commands: Go to page, Add / Duplicate / Rename / Delete page, Next / Previous page | Command palette | ✅ `pageCommands` in `commands.ts`; run in `use-studio-commands.ts` |
| Ctrl+PageDown / Ctrl+PageUp next / previous page (wraps, not while typing) | Shortcut, listed in the shortcuts dialog | ✅ `use-studio-shortcuts.ts` |
| Page count next to the zone count | Profiles panel row, top bar profile line | ✅ `profileMeta` in `profiles-panel.tsx`, `profileSummary` in `studio-top-bar.tsx` |
| Auto-rotate: on / off, seconds (3 to 3600), page checklist | Dash › Profile › Auto-rotate | ✅ `AutoRotate` in `inspector/profile-sections.tsx`; `profileRotate` section in `inspector-model.ts`; write `setRotate` (`updateStored`, key `profile:rotate`) |
| Kiosk shows the profile's active page (`?page=<id>` pins one; first page when the server is unreachable) | Kiosk | ✅ `kioskPageId` in `src/lib/control.ts`; `src/App.tsx` |
| Cross-fade on a page switch (250 ms; instant with reduced motion) | Kiosk | ✅ `PageGrid` in `src/App.tsx`, `.page-fade-in` in `src/index.css`, `use-reduced-motion.ts` |
| Page dots (tap a dot; page name as label) when `kioskPageNav` is on and the profile has 2+ pages; the grid reserves their strip | Kiosk; Dash › General › Display › Page dots and swipe | ✅ `src/components/page-dots.tsx`; setting `general.kioskPageNav` (`src/lib/general.ts`, `general-panel.tsx`) |
| Swipe left / right for the next / previous page (60 px, mostly horizontal, under 600 ms) | Kiosk, same setting | ✅ `swipeDirection` in `src/lib/swipe.ts`; handlers in `src/App.tsx` |
| Rotate toggle: long-press the dots (pause glyph while a saved rotation is stopped) | Kiosk | ✅ `page-dots.tsx`; `postControl("rotate")` |
| Rotate toggle in the studio (Play / Pause, "Back to the saved setting", tooltip names runtime and saved) | Page-tab strip, right end, with 2+ pages | ✅ `src/components/studio/rotate-toggle.tsx`; mounted in `page-tabs.tsx` |
| Marker on the tab the kiosk shows; "Show on kiosk" in the tab menu | Page tabs | ✅ `page-tabs.tsx` (`kioskPage`, `pageMenuEntries`); wired in `studio-view.tsx` |
| Control API: `GET /api/control`, `POST /api/control/{page,profile,rotate,touch}`, SSE `/events/control`; a touch holds rotation 30 s | Server; Stream Deck plugin | ✅ `server/control.mjs`, `server.mjs`; client `src/lib/control.ts` (`postControl`, `useControl`) |

## 18. Alerts (A3)

| Capability | Where | Status |
|---|---|---|
| Alerts rail item and drawer | Left rail (bell) | done: `alerts-panel.tsx`; `left-rail.tsx`, `studio-drawers.tsx` |
| Master switch, live "Active now" list with Acknowledge / Dismiss | Alerts drawer top | done: `alerts-live.tsx` (`useControl().alerts`, `postControl("alert")`) |
| History (last 50; test / quiet / dismissed tags) | Alerts drawer disclosure | done: `useAlertHistory` in `alerts-live.tsx` (`GET /api/alerts/history`) |
| Rules list: on/off, severity dot, source summary, last fired, duplicate, delete with confirm | Alerts drawer | done: `alerts-panel.tsx`, `summarizeRule` / `lastFired` in `alerts-model.ts` |
| Add rule: blank sensor, blank notification, 11 presets that pick a sensor from the live catalogue | Alerts drawer "+" | done: `src/lib/alert-presets.ts` |
| Rule editor: sensor picker with live value, operator, value, for (s), clears below / above, live "would fire now" line | Alerts drawer sub-view | done: `alerts-rule-editor.tsx`, `previewSensor` |
| Notification source: apps (with suggestions), exclude, text contains | Rule editor | done: `alerts-rule-editor.tsx` |
| Cooldown, profiles (All / checklist) | Rule editor | done: `alerts-rule-editor.tsx` |
| Outputs: display (style, 3x3 position, backdrop, size, seconds, text), switch to page, highlight widget | Rule editor | done: `alerts-outputs.tsx` |
| Test button (disabled while edits are not pushed) | Rule editor | done: `postControl("alert", { ruleId, action: "test" })` |
| Global defaults and quiet hours | Alerts drawer, collapsed | done: `alerts-defaults.tsx` |
| One undo step per field burst, add / delete / duplicate / preset | Studio history | done: `ruleKey` / `alertsKey` in `alerts-model.ts` |
| Palette: Open alerts, New alert rule | Command palette | done: `commands.ts`, `use-studio-commands.ts` |

## 19. Dynamic Island

See `docs/redesign/island/PLAN.md`.

| Capability | Where | Status |
|---|---|---|
| Per-profile island: on/off, idle (time, + date, + sensor with label, hidden), size, colour (black / theme), offset, reserve space, collapse timer, Preview button | Dashboard › Profile › Dynamic Island | done: `inspector/island-section.tsx`; `MonitorProfile.island`, `src/lib/island/config.ts` |
| Island on the kiosk and the plain page (idle pill; alerts on the kiosk only) | Kiosk, top centre | done: `src/components/island/dynamic-island.tsx`, mounted in `App.tsx` |
| Island on the studio canvas, playing only test alerts | Canvas page box | done: `studio-canvas.tsx`, `islandTestAlerts` in `studio-view.tsx` |
| "Island" alert display style; a profile without an island shows it as a top toast | Rule editor, global defaults | done: `alerts.ts` (`ALERT_STYLES`), `splitIslandAlerts` in `src/lib/island/from-alerts.ts` |
| Notice bus: severity order, stronger preempts, sticky critical, de-duplication, cooldown, badge or end after the open time, tap to acknowledge, tap the badge to peek | Island | done: `src/lib/island/queue.ts`, `bus.ts` (`notify`, `useIsland`) |
| Data API disconnect warning (after 5 s) and reconnect notice | Kiosk island | done: `src/lib/island/system.ts`, `useConnectionNotice` |
| "Stops reporting" condition (server op `missing`) and the "Plugin stopped reporting" preset | Rule editor › Condition, + menu | done: `server/alerts.mjs` (`missing`), `src/lib/alert-presets.ts` |
| Widgets send to the island: "Send to island" on Now Playing (track activity, new track), Steam Friends (online, playing), Wave Link (mutes) | Widget inspector › Content | done: `island` on `templateModule`, `src/lib/island/sources.ts`, `src/widgets/island-sources.ts` |
| Live activity beside the time (the playing track, with cover and progress); tap opens it | Kiosk island | done: `IslandActivity`, `Activity` in `dynamic-island.tsx` |
| Quiet hours apply to the dashboard's own notices | Kiosk island | done: `src/lib/island/quiet.ts` (`quietGate`) |
| Island size fits the profile (open island ≤ 40 % of the height) | Kiosk, canvas | done: `fitIslandSize` in `island-model.ts` |
| Source options under "Send to island" (shown only while it is on) | Widget inspector › Content | done: `islandSettings`, `isIslandKey` in `src/lib/island/sources.ts` |
| More widgets send to the island: FPS Monitor (game and FPS, start, low FPS), Achievements, Steam News, Drive Space (thresholds), Network adapters (link, public IP), Network Throughput (download activity), Volume Mixer (level bar, output switch), Weather (rain or snow starting), Notifications (Windows toasts, apps allow-list), Wave Link fader moves | Widget inspector › Content | done: `src/widgets/island/` (`gaming.ts`, `hardware.ts`, `audio.ts`, `info.ts`), `island-sources.ts` |
| Notices with a level bar that stay open while they repeat (volume) | Kiosk island | done: `IslandNotice.progress`, `refresh`; `Expanded` in `dynamic-island.tsx` |
| Dashboard notices: page name, layout updated, plugin back, on air (OBS), calendar countdown with lead | Dashboard › Profile › Dynamic Island | done: `IslandConfig.notices`, `calendarLead`; `dashboard-notices.ts`, `use-dashboard-notices.ts` |
| OBS connection and calendar (ICS) links, secrets kept on the server | Dashboard › Profile › Dynamic Island (shown with On air or Calendar on) | done: `server/extras.mjs`, `integrations.mjs`, `obs.mjs`, `calendar.mjs`, `ical.mjs`; `inspector/integrations-card.tsx`, `src/lib/extras.ts`, `src/lib/integrations.ts` |
| Timer widget (presets, pomodoro) with its countdown on the island | Add › Info › Timer | done: `src/widgets/Timer.tsx`, `src/lib/timer.ts`, `src/widgets/island/timer.ts` |
| Island motion: open / close / morph springs (L4 NotchBar values) as CSS `linear()`, content cross-fade with lift and blur, Lively / Smooth / Off, `?slow=N` | Dynamic Island › Motion; kiosk | done: `src/lib/island/spring.ts`, `island-look.ts`, `.island-enter` / `.island-exit` in `index.css` |
| Island look: Pill or Notch (concave corners), scale, custom colours, opacity with blur, border, shadow, font, weight, seconds and 12/24 h | Dynamic Island › Shape, Look, Clock | done: `IslandConfig` (`shape`, `scale`, `bgColor`, `fgColor`, `opacity`, `border`, `shadow`, `font`, `weight`, `seconds`, `hours`); `islandSkin` |
| Island idle: up to three values coloured past their levels, idle rotation (date, values, next event), hairline idle | Dynamic Island › Idle | done: `IslandConfig.stats`, `rotate`, idle `line`; `idleViews`, `statLevel` (one stored `sensorKey` migrates to `stats`) |
| Grouped notices (one app's notifications stack with a count) | Dynamic Island › Alerts | done: `IslandNotice.group`, `IslandItem.count`, `setGrouping` in `queue.ts` |
| Dynamic Island panel: every island setting of the profile, its widgets' "Send to island" across pages (opens the zone), the alert rules shown as Island | Rail `PanelTop` → left panel; palette "Open drawer: Dynamic Island" | done: `island-panel.tsx`, `island-panel-model.ts`, `left-rail.tsx`, `studio-drawers.tsx` |

## 20. InfoPanel import, Library and Gauges (A1–A8)

New capabilities from the InfoPanel import (`docs/infopanel-import/PLAN.md`, spec
`docs/infopanel-import/studio/SPEC.md`). Open gaps are GitHub issues.

| Capability | Where | Status |
|---|---|---|
| Canvas zone: an imported InfoPanel profile drawn in a zone (faithful or native per item), on the canvas, kiosk and desktop | Canvas, kiosk | done: `Placement.canvas`, `src/components/infopanel/CanvasZone.tsx`, `ProfileView.tsx`, `native.tsx`; model `src/lib/infopanel/` |
| Import `.infopanel`, extracted folder, `.canvas.zip`, an installed InfoPanel profile or a saved canvas: Source, Mode, Review (parse notes), Sensors, Save; one undo step | Top bar Import, ⋯ menu, Add › Canvas zone · Import .infopanel | done: `src/components/infopanel/import/` (`import-dialog.tsx`, `import-steps.tsx`, `use-import.ts`), `src/components/studio/infopanel-io.tsx`, `import-actions.ts` |
| Sensor remap: filters, Confirm all, searchable picker, Leave unbound, Reset to automatic | Import › Sensors; canvas editor › Remap | done: `remap-panel.tsx`, `remap-dialog.tsx`, `src/lib/infopanel/remap/` |
| Export a canvas zone as `.canvas.zip` (font licence review) or `.infopanel` (bake stale gauges, leave unused files out) | Top bar Export | done: `export-dialog.tsx`, `src/lib/infopanel/export/` |
| Canvas zone editor: item tree, toolbar (draw all as, modes, compare, sensors Unbound / Live / Mock), item inspector from the registry, keys, one undo step per edit | Double-click a canvas zone, or inspector › Edit items | done: `src/components/infopanel/edit/`, `src/lib/infopanel/canvas-edit.ts`, `inspector/infopanel-defs.ts` |
| Server: My library store with copy counts, asset store for fonts / SVG / BMP / ICO, installed profiles, font proxy | Server | done: `server/library.mjs`, `server/assets.mjs`, `server/infopanel-local.mjs`, `server/font-proxy.mjs` |
| Library page: My library (16 collections, search, sort, Grid / Shelves, upload queue with dedupe and refusals, detail pane, duplicates and Merge, theme suggestions, copies with jump, optimise) | Rail › Library | done: `src/components/library/`, `src/lib/my-library/` |
| Library › Profile assets: a canvas zone's files with findings, Clean up, Optimise, Replace by name, Missing filter | Library › Profile assets tab | done: `profile-assets.tsx`, `profile-assets/`, `src/lib/infopanel/assets/stored-doc.ts` |
| Library › Fonts: requests per canvas zone and how each is drawn, My fonts, licence, Get a font (Fontsource, Font Squirrel), Use fallback; supplied faces drawn in zones | Library › Fonts | done: `fonts-view.tsx`, `fonts/`, `src/lib/infopanel/font-requests.ts`, `font-get.ts`, `src/components/infopanel/supplied-fonts.ts` |
| Drag from the Library: image / panel → zone, style → zone under the pointer, video → background, image or gauge onto a canvas zone → item at the pointer, Page background slot; spring-load to the canvas | Library cards → canvas | done: `library-drop.ts`, `src/lib/my-library/drag.ts`, `drop-ghost.ts` (`canvasPointAt`), `background-editor.tsx` |
| Gauges page: Presets, In <profile>, My library; detail with play / scrub, Customise a copy / Edit, Add to canvas, Duplicate, Export; Import `.gauge.json` / SVG, New gauge | Rail › Gauges | done: `src/components/gauges/` (`gauges-page.tsx`, `gauges-browse.tsx`, `gauge-detail.tsx`), `src/lib/gauge-studio/model.ts` |
| Gauge editor: preset strip, parts list (Core … Liquid), stage with play and scrubber, part inspector; working copies with their own undo, unsaved-changes dialog | Gauges › Editor | done: `gauge-editor.tsx`, `parts-list.tsx`, `inspector/`, `src/lib/gauge-studio/parts.ts`, `working-copy.ts`, `session.ts`, `unsaved-dialog.tsx` |
| Image-sequence gauges: filmstrip (Reverse, Resample, Duplicate, Replace, Remove), frames per second, Recolour, Convert to vector; bake bar | Gauges › Editor | done: `frame-strip.tsx`, `frames-inspector.tsx`, `bake-bar.tsx`, `src/lib/gauge-studio/frame-select.ts`, `convert.ts` |
| Custom gauge widget: a gauge spec drawn live from one sensor; "Edit gauge…" from its inspector, canvas Gauge items and library cards | Add › Generic › Custom gauge | done: `src/widgets/CustomGauge.tsx`, `registry/b.ts`, `zone-inspector.tsx` (`GaugeNote`), `item-inspector.tsx` |
| Edge states (spec §10): empty Library (wide upload tile, no Shelves), upload tray, no search results, parse failure with line and column, parse notes, Data API offline (Not reachable; Live disabled with a tooltip), missing asset (hatched tile with a broken-image icon), missing font (fallback, Get or Use fallback), server offline ("Offline · edits kept locally"), unsaved gauge on back | Library, Import, canvas, top bar, Gauges | done: `library-page.tsx`, `upload-tray.tsx`, `src/lib/infopanel/xml.ts`, `import-steps.tsx`, `canvas-toolbar.tsx`, `MissingImage.tsx`, `requested-table.tsx`, `studio-top-bar.tsx` + `src/lib/dashboard-server.ts` (`isUnreachable`), `unsaved-dialog.tsx` |
| Narrow screens: Library and Gauges detail panes become a bottom sheet below 900 px; the gauge editor stacks; the canvas editor's inspector docks ≥ 1100 px, floats 640–1099 px, is a sheet below 640 px | Library, Gauges, canvas editor | done: `src/components/studio/pane-sheet.tsx`, `src/hooks/use-viewport-below.ts`, `NARROW_PAGE_WIDTH` in `studio-layout.ts`, `canvas-editor.tsx` (`inspectorMode`) |
