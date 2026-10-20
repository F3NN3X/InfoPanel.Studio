# Settings inventory (Phase 0 of the studio redesign)

Every setting the studio edits today, read from the code at commit `6c465bf`. It is the checklist
the Phase 2 registry must cover: **each row appears exactly once in the new inspector, with the same
key and default.** The prototype was not used as a source.

Companion docs: `docs/redesign/DATA_MODEL.md` (what exists), `docs/redesign/FEATURE_MAP.md` (where
it lives), `docs/redesign/IMPLEMENTATION_PLAN.md` (Phase 2).

> **Superseded in part by widget settings v2** (config v6-v9; see
> [widget-settings.md](widget-settings.md) and
> [redesign/widget-settings-v2/STATUS.md](redesign/widget-settings-v2/STATUS.md)). This file is the
> Phase 0 snapshot. What changed since: the zone inspector has four tabs (Show · Style · Data ·
> Behaviour) of shared sections, **More** replaces Advanced, `styleMode` became per-section
> `Placement.follow`, `style` / `styleEnforce` became `widgetTheme` (values and locks, per profile
> and page), the Global style tab became the theme editor, and the standard keys were renamed
> (`variant` + `compactView` → `compact`, `layout` → `sizeTier`, `alignX` + `alignY` → `align`,
> thresholds → `warn.<q>` / `crit.<q>`, device keys → `device`, `autoScale` dropped). Rows below use
> the old names; the migrations in `src/lib/settings-migrate.ts` map them.

## How to read this

**Stored at** (the "Level" column):

| Level | Where it is stored |
|---|---|
| **Zone** | `Placement.settings[key]` (a widget's or panel's look and content settings) |
| **Zone field** | A field of the `Placement` itself, outside `settings` (`visible`, box, `design`, `styleMode`, `module`) |
| **Panel** | `Placement.panel` (`PanelDef`) |
| **Panel widget** | One entry of `Placement.panel.widgets` (`Widget`) |
| **Profile** | `MonitorProfile` (`profiles[]`) |
| **Dashboard** | `DashboardConfig` top level |
| **General** | `DashboardConfig.general` (`GeneralSettings`, only changed keys stored) |
| **Browser** | `localStorage`, not in the config (studio UI preferences) |

**Target** = tab › section in the redesigned inspector, per DATA_MODEL §2–3 and §7 and FEATURE_MAP
§9–12. Tabs: **C** Content, **S** Style, **D** Data (zone inspector); **Dash** = nothing selected
(tabs Profile · Appearance · Global style · General). **Adv** = hidden until "Advanced settings" is
on. A target marked **(proposed)** is not stated in the spec; those are repeated in "Open placement
questions" at the end.

**Controls** follow `setting-control.tsx`: `boolean` Toggle; `number` Slider with value box (min /
max / step); `select` Segmented when it has 1–4 options, otherwise Select; `select` + `multiple`
checkbox list (stored as a comma-separated string, `""` = none); `color` color field (`""` = unset);
`text` single-line field (or textarea when multiline); `icon` icon grid; `image` URL field with
upload, drop and library; `align` one 3×3 grid that writes two keys.

**Defaults**: `auto` for px/enum selects means "the widget's own value"; `""` means unset. A setting
at its default is normally *not stored* (sparse); `effectiveSettings` fills defaults at read time.

**Visibility**: today the inspector shows every setting a module declares, with no per-row
conditions (nothing is hidden by another setting's value). Conditions below are the ones the spec
adds or that come from which block a module spreads.

**Style resolution** (`src/lib/style-resolve.ts`): module default → `DashboardConfig.style` →
`MonitorProfile.style` → the zone's own `settings`. Only the look keys (`PROFILE_STYLE_KEYS`, §1.5)
are layered. `Placement.styleMode = "follow"` (or `styleEnforce` on the dashboard/profile) ignores
the zone's own look values but keeps them stored. Source-dot states today: default, dashboard,
profile, own, own-overriding-global; follow/enforce locks the rows (shown read-only).

---

## 1. Shared general settings (`src/modules/standard-settings.ts`)

Which block each zone type spreads (the inspector builds the general cards from it):

| Zone type | Settings it gets |
|---|---|
| Template widgets | `STANDARD_SETTINGS` (all of §1.1–1.4) |
| **Other sensors** (`cards`) | `CARD_SETTINGS`: `surface` (default **Theme**), `accent`, all of `STYLE_SETTINGS`, all of `SURFACE_SETTINGS`. No `label`, `icon`, `preset`, `layout`, `background`, `backgroundOn` |
| Custom panel | `PANEL_SETTINGS` (§1.6) |
| Blank zone | none (no settings; the Widget card has only the type picker and Visible) |

### 1.1 Widget identity (`STANDARD_SETTINGS`, not look keys)

| Key | Label | Control | Options | Default | Visible when | Level | Target |
|---|---|---|---|---|---|---|---|
| `label` | Custom title | text | | `""` | modern widgets (not CARD widgets, not Web Page) | Zone | C › Widget |
| `icon` | Icon | icon grid | none + 18 icons: activity, bluetooth, brain, cpu, gauge, gamepad, headphones, heart, leaf, monitor, moon, music, radio, snowflake, sun, thermometer, wifi, zap | `""` | modern widgets | Zone | C › Widget |
| *(zone field)* `visible` | Visible | toggle | | `true` | every zone | Zone field | C › Widget, plus header eye / `H` |
| *(zone field)* `module` | Type (Change / Pick a widget) | picker button (opens the widget picker) | the 16 modules + Other sensors + Custom panel | n/a | every zone; blank shows "Pick" | Zone field | C › Widget › Widget type |

### 1.2 Size, alignment, spacing, typography (`STYLE_SETTINGS`; all are look keys)

| Key | Label | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `autoScale` | Scale with the zone | toggle | | `true` | Zone, Profile style, Dashboard style | S › Size & alignment (Adv) |
| `scale` | Size (%) | slider 50–200 step 5 | | `100` | same | S › Size & alignment |
| `alignX` + `alignY` | Alignment | 3×3 align grid (+ Spread toggle: `alignX = between`) | X: auto, start, center, end, between. Y: auto, start, center, end | `auto` / `auto` | same | S › Size & alignment |
| `padding` | Inner padding | select | auto, 0, 4, 8, 12, 16, 20, 24, 32, 48 px | `auto` | same | S › Spacing & shape |
| `gap` | Gap between items | select | auto, 0, 4, 8, 12, 16, 24, 32, 48 px | `auto` | same | S › Spacing & shape |
| `radius` | Corner radius | select | auto, 0, 4, 8, 12, 16, 20, 28 px, Pill (`999`) | `auto` | same | S › Spacing & shape |
| `stroke` | Ring / bar thickness (%) | slider 50–250 step 10 | | `100` | same | S › Spacing & shape |
| `textColor` | Text color | color | | `""` | same | S › Typography |
| `mutedColor` | Secondary text color | color | | `""` | same | S › Typography |
| `font` | Font | select | auto (Theme), sans, rounded, serif, mono | `auto` | same | S › Typography |
| `fontWeight` | Value weight | select | auto, 400 Regular, 500 Medium, 600 Semibold, 700 Bold, 800 Heavy | `auto` | same | S › Typography |
| `labelCase` | Label case | segmented | auto, uppercase, none (As written), capitalize | `auto` | same | S › Typography |
| `customCss` | Custom CSS (scoped to this widget; `:scope` = its root) | textarea | | `""` | same (also editable as the global style) | S › Advanced (Adv) |

### 1.3 Surface and effects (`SURFACE_SETTINGS`; look keys, "surfaced" widgets only)

| Key | Label | Control | Options | Default | Visible when | Level | Target |
|---|---|---|---|---|---|---|---|
| `borderWidth` | Border width | select | auto, 0, 1, 2, 3, 4, 6 px | `auto` | surfaced widgets (not Web Page's non-edge keys) | Zone, Profile style, Dashboard style | S › Border & effects |
| `borderColor` | Border color | color | | `""` | same | same | S › Border & effects |
| `glow` | Edge glow | segmented | none, soft, strong | `none` | same | same | S › Border & effects |
| `glowColor` | Glow color (empty = accent) | color | | `""` | today always; spec: only when `glow` is not none | same | S › Border & effects |
| `surfaceOpacity` | Surface opacity (%) | slider 0–100 step 5 | | `100` | surfaced widgets | same | S › Colors & surface |
| `blur` | Background blur | select | auto, 0, 4, 8, 16, 24, 40 px | `auto` | surfaced widgets | same | S › Colors & surface |

### 1.4 Preset, layout, surface, accent, background (`STANDARD_SETTINGS`)

| Key | Label | Control | Options | Default | Level | Look key? | Target |
|---|---|---|---|---|---|---|---|
| `preset` | Preset | select | default; dark (applies `surface=matte-dark`, `tint=false`); light (`matte-light`, `tint=false`); vivid (`glass`, `tint=true`); mono (`matte-dark`, `tint=false`, `accent=#fafafa`) | `default` | Zone | no | S › Colors & surface (proposed, see questions) |
| `layout` | Layout | select | auto (Auto, fit to zone), card, standard, compact (Compact bar), simple | `auto` | Zone | no | S › Size & alignment |
| `surface` | Surface | segmented (modern: 4 options) | glass, matte-light, matte-dark, theme | `glass` (CARD widgets and Departures etc.: `theme`) | Zone, Profile style, Dashboard style | yes | S › Colors & surface › Surface |
| `accent` | Accent color | color | | `""` | Zone, Profile style, Dashboard style | yes | S › Colors & surface |
| `background` | Background image | image field (URL / upload / drop / library) | | `""` | Zone | no | S › Colors & surface (Adv) |
| `backgroundOn` | Use as background | toggle | | `false` | Zone | no | S › Colors & surface (Adv) |

`applies` bundles: choosing a `preset` also writes the listed extra keys (`surface`, `tint`,
`accent`) into the zone's settings.

### 1.5 The look-key set

`PROFILE_STYLE_KEYS` = `surface`, `accent`, and every key of §1.2 and §1.3: `autoScale`, `scale`,
`alignX`, `alignY`, `padding`, `gap`, `radius`, `textColor`, `mutedColor`, `font`, `fontWeight`,
`labelCase`, `stroke`, `customCss`, `borderWidth`, `borderColor`, `glow`, `glowColor`,
`surfaceOpacity`, `blur` (22 keys). Exactly these are copied by Copy style, saved in style presets
and appearance presets, and editable at dashboard / profile level (Dash › Global style). `preset`,
`layout`, `label`, `icon`, `background`, `backgroundOn` and all content keys are
per zone only.

### 1.6 Custom panel look (`PANEL_SETTINGS`)

`STANDARD_SETTINGS` minus `preset`, `layout`, `autoScale`, `stroke`, with two changes. Stored in the
panel zone's `settings` like any widget.

| Key | Change for panels | Target |
|---|---|---|
| `label` | Label becomes "Title (empty = hidden)"; empty hides the title | C › Widget |
| `surface` | Default `panel`; options none (None), panel (Card), bordered (Bordered card), then glass, matte-light, matte-dark, theme (7 options, so a Select) | S › Colors & surface |

All other keys (`icon`, `accent`, `background`, `backgroundOn`, §1.2 and §1.3 minus the removed
ones) behave as in §1.2 to §1.4. Legacy fallback: `PanelDef.title`,
`titleVisible`, `accent` and `background` are read when the matching setting is absent
(`panelSettings`, `panelLegacyLook`), never written by the new UI.

### 1.7 Zone-level fields handled outside `settings`

| Field | Label (today) | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `Placement.colStart`, `rowStart`, `colSpan`, `rowSpan` | Zone box Col / Row / W / H | 4 number fields (min 1, max = grid size) | | set when drawn or added | Zone field | placement row (COL / ROW / W / H) |
| `Placement.design.accent` | Frame accent | color | | unset | Zone field | S › Border & effects › Zone frame (Adv) |
| `Placement.design.background` | Frame background | segmented | none, panel (Panel), bordered (Bordered) | `none` | Zone field | S › Border & effects › Zone frame (Adv). Hidden for panels (they have their own card) |
| `Placement.design.header` | Frame title header | toggle | | `false` | Zone field | S › Border & effects › Zone frame (Adv) |
| `Placement.styleMode` | Follow global / Custom | segmented | follow, custom | unset (= custom, own values win key by key) | Zone field | S › Colors & surface › Look. Shown only when the zone has look keys |
| `Placement.visible` | Visible / eye | toggle | | `true` | Zone field | C › Widget and header |
| Custom CSS | `customCss` in `settings` (§1.2) | | | | Zone | S › Advanced (Adv) |

### 1.8 Zone style tools (actions, not stored settings)

Copy style, Paste style (replaces the zone's look keys; session clipboard), Use as global (All
profiles / This profile; writes `DashboardConfig.style` or `MonitorProfile.style`), Style presets
(Apply, Save as preset…, Delete; stored in `DashboardConfig.stylePresets`), the "N changed" badge and
Reset per card. Target: Colors & surface, plus the context menu (FEATURE_MAP §9).

---

## 2. Widget-own settings

Each widget's own keys are declared by its template and listed in `widget-settings.md` and
`module-catalog.md`; the schema tests in `src/widgets/registry/` guard them. The zone types that
used to carry their own keys were retired in config v4. A stored zone with one of those ids is
rewritten on load to its template (`src/lib/legacy-zones.ts`, `LEGACY_MODULE_IDS`), keeping the
keys the template reads:

| Retired id | Template |
|---|---|
| `systemmodern` | `SystemOverview` |
| `spotifymodern`, `mediamodern` | `NowPlaying` (`source` = spotify / media) |
| `steammodern` | `GameSpotlight` (composite) |
| `hardwaremodern` | `SensorGroup` (auto), or `Thermals` for the temps view |
| `weathermodern` | `Weather` |
| `fpsmodern` | `FpsMonitor` |
| `audiomodern` | `AudioMeter`, `MeterBridge` or `VolumeMixer`, by `view` |
| `wavelinkmodern` | `WaveLink` |
| `bluetoothmodern` | `Bluetooth` |
| `networkmodern` | `NetworkThroughput` |
| `vbz`, `notifications`, `textfile`, `streamdeck`, `webpage` | `Departures`, `Notifications`, `TextFile`, `StreamDeck`, `WebPage` |

### 2.1 Other sensors (`cards`, no module settings)

Zone type for every sensor no module claims. Block: `CARD_SETTINGS` (surface default `theme`,
`accent`, all of §1.2, all of §1.3). No own keys. No `label`, `icon`.

---

## 3. Custom panels (`Placement.panel`, `src/lib/panel-model.ts`)

The panel's look (title, accent, surface, spacing, colors, CSS) is `PANEL_SETTINGS` in the zone's
`settings` (§1.6). Its arrangement is `PanelDef`, below. Field edits coalesce per field into one
undo step (`panel:<field>`).

### 3.1 Panel fields (`PanelDef`)

| Field | Label | Control | Options / range | Default | Visible when | Target |
|---|---|---|---|---|---|---|
| view toggle (UI only) | Visual / Code | segmented | visual, code | visual | always | C › Panel › Editor |
| *(whole panel as JSON)* | Code | textarea; Apply, Revert, Ctrl+Enter applies; parse errors inline; one undo step | | | Code view | C › Panel › Code |
| `fit` | Fit in zone | segmented | fill, hug | `fill` (unset) | always | C › Panel (Size) |
| `gap` | Gap (px) | number, empty = auto | 0–200 | unset (auto: the Style gap, else the layout's own) | always | C › Panel |
| `padding` | Padding (px) | number, empty = auto | 0–200 | unset (auto) | always | C › Panel |
| `layout` | Layout | segmented | stack, grid, overlay (legacy `wrap` loads as a wrapping row stack; no value = stack) | `stack` | always | C › Layout |
| `direction` | Direction | segmented | row, column | `row` | stack | C › Layout |
| `wrap` | Wrap | toggle | | `true` | stack | C › Layout |
| `justify` + `align` | Alignment | one 3×3 grid. Stack: along the axis start/center/end/Spread (`between`); across start/center/end/stretch. Grid: cell alignment, no Spread | `justify`: start, center, end, between. `align`: start, center, end, stretch | unset (stack `align` start, grid `stretch`) | stack, grid | C › Layout |
| `columns` | Columns | stepper | 1–12 | `3` | grid | C › Layout |
| `gridCols` | Column sizes | track chips (any CSS track: `1fr`, `auto`, `120px`, `minmax(0, 1fr)`) + add/remove | | unset (equal split of `columns`) | grid | C › Layout |
| `gridRows` | Row sizes | track chips | | unset (equal rows) | grid | C › Layout |
| `overlayAlign` | Band alignment (Top / Middle / Bottom) | 3 segmented | start, center, end, between | `start` each | overlay | C › Layout |
| `bottomGridCols` | Bottom band columns | number, empty = a flex row | 1–12 | unset | overlay | C › Layout |
| `scrim` | Dark scrim over the image | toggle | | `true` (stored only when `false`) | overlay | C › Background |
| background image | Background image | select of the panel's image widgets; writes `asBackground` on the chosen one | first image widget / none | first image widget | overlay | C › Background |
| `css` | (panel CSS, scoped to the zone; travels with the panel in presets) | no dedicated control today (reached through the panel's Custom CSS, `customCss` §1.2, and the Code view) | | | | S › Advanced (Adv) |
| `title`, `titleVisible`, `accent`, `background`, `visible`, `id` | legacy / identity | not edited directly; kept in step with the Title / Accent / Surface settings, and editable in Code | | | | none (see questions) |

Also on the Panel card: **Save as panel preset…** (the card's "…" menu, name input, writes
`DashboardConfig.panelPresets`).

### 3.2 Widget list (the "Widgets" card)

| Action | Control | Notes | Target |
|---|---|---|---|
| Add widget | menu of the 10 kinds | new widget = `{ id, kind, visible: true }`, a shape gets `shape: vbar`, `thickness: 4` | C › Widgets |
| Select | row click; Up/Down arrows with the list focused | | C › Widgets |
| Reorder | drag a row; Alt+Up/Down | | C › Widgets |
| Hide / show | eye | `Widget.visible` | C › Widgets |
| Row menu | Duplicate, Copy, Paste after, Change kind (submenu), Remove | Change kind keeps `id`, `kind`, `visible`, `label`, `sensor`, `unit`, `color`, `span`, `rowSpan`, `overlayZone`, `box`, `css`, `className` and the fields the new kind reads | C › Widgets |
| Delete key on the list | removes the selected widget | | C › Widgets |

### 3.3 Panel-widget fields, by section (`Widget`, `src/components/studio/widget-editor/`)

The selected widget's cards appear after the panel cards. Section ids: widget:data, widget:display,
widget:layout, widget:typography, widget:colors, widget:advanced.

**Common to every kind (stored on the `Widget`):**

| Field | Label | Control | Default | Applies to | Target |
|---|---|---|---|---|---|
| `label` | Label | text | unset | all kinds with data (not shape) | C › Display (spec) / Selected · kind card |
| `sensor` | Sensor | sensor picker (single mode); warns "not in the live sensor list" | unset | stat, value, bar, gauge, sparkline, table, text, image (not clock, not shape) | C › Display (opens the data picker) |
| `visible` | (eye in the list) | toggle | `true` | all | C › Widgets |
| `box.w` | Width | segmented Hug / Fill / Fixed (+ px 1–4000); in a grid Cell / Fixed | stack: `fill` for bar, table, image, sparkline, else `hug`; grid: `fill` | stack, grid | C › Size & placement |
| `box.h` | Height | same | `hug` (stack) / `fill` (grid) | stack, grid | C › Size & placement |
| `box.self` | Align self | 3-cell align (cross axis; vertical in row stacks and grids, horizontal in column stacks) | unset (panel `align`) | stack, grid | C › Size & placement |
| `span`, `rowSpan` | Column span, Row span | number, empty = auto | 1–12, unset | grid | C › Size & placement |
| `box.col`, `box.row` | Column, Row (start) | number, empty = auto | 1–24, unset | grid | C › Size & placement |
| `overlayZone` | Band | segmented Top / Middle / Bottom | `top` | overlay | C › Size & placement |
| `asBackground` | Use as panel background | toggle | unset | image kind in overlay | C › Size & placement (also set by the panel's Background select) |
| `className` | Class names (hooks for panel CSS) | monospace text | unset | all | C › Selected · Advanced (Adv) |
| `css` | Custom CSS (scoped to this widget; `:scope`, `.wp-label`, `.wp-value`, `.wp-unit`, `.wp-bar-fill`) | monospace textarea | unset | all | C › Selected · Advanced (Adv) |

**Kind-specific fields:**

| Kind | Field | Label | Control | Range / options | Default | Target |
|---|---|---|---|---|---|---|
| stat, value | `subSensor` | Sub sensor (below the value) | sensor picker | | unset | C › Display |
| stat, value, bar, gauge, sparkline, text | `unit` | Unit | text | | unset (placeholder `%`) | C › Display |
| stat, value, bar, gauge, sparkline, text | `decimals` | Decimals | number | 0–6 | `0` | C › Display |
| stat, value, bar, gauge, sparkline, text | `scale` | Scale × | number (float), empty = 1 | | unset | C › Display |
| bar, gauge | `max` | Max (denominator) | number (float) | min 0 | `100` | C › Display |
| bar, gauge | `inverted` | Invert fill | toggle | | `false` | C › Display |
| stat, value, table, text, clock | `align` | Text alignment | segmented | left, center, right | `left` | C › Display |
| text | `text` | Static text | text | | unset | C › Display |
| image | `text` | Image URL | text (or bind a sensor with a URL) | | unset | C › Display |
| image | `height` | Max height (px) | number, empty = auto | 24–600 | unset | C › Display |
| table | `rows` | Rows | number | 1–20 | `7` | C › Display |
| table | `columns` | Columns (split on ", ") | number, empty = auto | 0–12 | unset | C › Display |
| table | `header` | Header (comma-separated) | text | | unset | C › Display |
| sparkline | `history` | History samples | number | 5–200 | `40` | C › Display |
| clock | `clock` | Show | segmented | both (Time + date), time, date | `both` | C › Display |
| shape | `shape` | Shape | segmented | vbar (V-bar), hbar (H-bar), rect (Rect), circle (Circle) | `vbar` | C › Display |
| shape | `thickness` | Thickness / diameter (px) | number | 1–120 | `4` | C › Display |
| stat, value, table, text, clock | `fontSize` | Font size (px) | number, empty = auto | 8–200 | unset | C › Typography & colors |
| gauge | `size` | Ring size (px) | number, empty = auto | 0–200 | unset (config v9: was `fontSize`) | Style › Typography |
| stat, value, bar, gauge, sparkline, text, clock, shape | `color` | Color | color | | unset (global style overrides it when Force global style is on; fills take the accent) | C › Typography & colors |

Kinds not listed for a field do not show it (`hasData`, `hasDisplay`, `hasTypography`, `hasColor`
in the editor): a shape has no data card (only a note), clock has no Sensor, image/table have no
Color.

---

## 4. Profile (`MonitorProfile`)

| Field | Label | Control | Range / options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `name` | Name | text | | new: `<window W>×<H>` | Profile | Dash › Profile |
| `width`, `height` | W, H (design size, px) | 2 number fields | whole px | new: the window size | Profile | Dash › Profile |
| `cols` | Cols | stepper −/+ | 2–24 (clamps zones into the grid) | new: 6 when width ≤ 1280, else 12 | Profile | Dash › Profile |
| `rows` | Rows | stepper −/+ | 1–24 | new: 4 when height ≤ 700, else 6 | Profile | Dash › Profile |
| `fit` | Scroll / Fill viewport | segmented | scroll, fill | new: fill when height ≤ 700 and width ≥ 1600, else scroll | Profile | Dash › Profile |
| `gap` | Gap px | number, empty = default | 0–200 | `12` (`DEFAULT_GRID_GAP`) | Profile | Dash › Profile |
| `padding` | Padding px | number, empty = default | 0–200 | 0 for a fill kiosk page, 12 for fill in the studio, 24 for scroll | Profile | Dash › Profile |
| `style` | This profile › Style | scope switch "This profile" on the global style cards (§5.2) | look keys | unset (inherits) | Profile | Dash › Profile › This profile, edited in Dash › Global style |
| `styleEnforce` | Force global style | Inherit / On / Off | | unset (= the dashboard's) | Profile | Dash › Appearance › Scope |
| `background` | Background | Inherit / Custom / None + editor (§5.5) | | unset (inherit) | Profile | Dash › Profile › This profile; editor in Dash › Appearance › Page background |
| `theme`, `radius` | Theme colors, corner radius | Inherit / Custom + theme editor (§5.4) | | unset (inherit) | Profile | Dash › Profile › This profile; editor in Dash › Appearance › Theme |
| `id`, `sampleVersion`, `placements` | identity, sample-layout version (old configs only), zones | not editable fields | | | Profile | none |

Profile actions: New profile, Delete active profile (disabled with one profile left), switch to a
pinned profile or **Auto (match window)**; `DashboardConfig.activeProfile` holds the pinned id or
`"auto"`. Target: Profiles panel, top-bar switcher, Dash › Profile › Profile selection.

---

## 5. Dashboard config (`DashboardConfig`)

### 5.1 Overview

| Field | What | Default | Target |
|---|---|---|---|
| `version` | config schema, currently `4` (older clients are refused) | `4` | none |
| `activeProfile` | pinned profile id or `auto` | `auto` | see §4 |
| `profiles` | see §4 | one blank profile on a fresh install | Profiles panel |
| `theme`, `radius` | dashboard theme (§5.4) | `DEFAULT_THEME`, `0.5` rem | Dash › Appearance › Theme |
| `style`, `styleEnforce` | dashboard style (§5.2) | unset, unset (off) | Dash › Global style, Appearance › Scope |
| `background` | page background (§5.5) | unset (the theme background shows) | Dash › Appearance › Page background |
| `general` | §5.6 | unset (defaults) | Dash › General |
| `dataApiUrl` | §5.7 | unset (`http://127.0.0.1:3921`) | Dash › General › Connection |
| `sourcePrefs` | §5.8 | unset | Sources mode |
| `stylePresets`, `appearancePresets`, `panelPresets` | §6 | unset | see §6 |

### 5.2 Global style (Dash › Global style; now the theme editor, see the note at the top)

Edits `DashboardConfig.style` (scope All profiles) or `MonitorProfile.style` (scope This profile)
with the look keys of §1.5, rendered from `PROFILE_STYLE_SETTINGS`: the same rows and categories as
a widget (Size & alignment, Typography, Spacing & shape, Colors & surface, Border & effects,
Advanced), without Follow/Custom, Preset, Layout and the title / icon / background-image rows.
Cards show "N changed" and a per-card Reset.

| Control | Key | Label | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|---|
| Scope | (UI) | All profiles / This profile | segmented | | All profiles (This profile if the profile already has its own style) | UI state | Dash › Appearance › Scope |
| Force global style (dashboard) | `styleEnforce` | Force global style on every widget | toggle | | `false` | Dashboard | Dash › Appearance › Scope |
| Force global style (profile) | `styleEnforce` | Force global style on every widget | segmented | Inherit, On, Off | Inherit (unset) | Profile | Dash › Appearance › Scope |
| Make all widgets follow global style | (action) | sets `styleMode = follow` on every zone of the profile | | | | Zone field | Dash › Appearance (also in the command palette) |

### 5.3 Appearance presets (Dash › Appearance › Appearance presets)

See §6.1.

### 5.4 Theme (`ThemeTokens`, `src/lib/theme.ts`; `src/components/studio/theme-panel.tsx`)

All values are `"h s% l%"` triplets edited with a native color input (converted to hex and back).
Defaults are `DEFAULT_THEME` (the Zinc preset). Stored at **Dashboard** (`theme`, `radius`), or per
**Profile** (`theme` partial, `radius`) when the profile is Custom.

| Key | Label in the editor | In the editor today | Default (Zinc) | Target |
|---|---|---|---|---|
| `background` | Background | yes | `240 10% 3.9%` | Dash › Appearance › Theme |
| `foreground` | Foreground | yes | `0 0% 98%` | same |
| `card` | Card | yes | `240 10% 3.9%` | same |
| `card-foreground` | Card text | yes | `0 0% 98%` | same |
| `primary` | Primary | yes | `0 0% 98%` | same (spec: primary/accent visible, other tokens Adv) |
| `primary-foreground` | Primary text | yes | `240 5.9% 10%` | same (Adv) |
| `secondary` | Secondary | yes | `240 3.7% 15.9%` | same (Adv) |
| `muted` | Muted | yes | `240 3.7% 15.9%` | same (Adv) |
| `muted-foreground` | Muted text | yes | `240 5% 64.9%` | same (Adv) |
| `accent` | Accent | yes | `240 3.7% 15.9%` | same |
| `destructive` | Destructive | yes | `0 62.8% 30.6%` | same (Adv) |
| `border` | Border | yes | `240 3.7% 15.9%` | same (Adv) |
| `ring` | Ring | yes | `240 4.9% 83.9%` | same (Adv) |
| `popover`, `popover-foreground`, `secondary-foreground`, `accent-foreground`, `destructive-foreground`, `input` | not in the editor | **no** (set only by theme presets) | `240 10% 3.9%`, `0 0% 98%`, `0 0% 98%`, `0 0% 98%`, `0 0% 98%`, `240 3.7% 15.9%` | none today (see questions) |
| `radius` | Corner radius | slider 0–1.25 rem step 0.25 | `0.5` | Dash › Appearance › Theme |
| theme preset | Colours only | 6 swatches: Zinc, Neutral, Slate, Ocean, Forest, Paper (light); changes colors only, not radius | Zinc | Dash › Appearance › Theme |

The editor shows 13 of the 19 tokens (the 6 others exist in the type and presets). The "Custom
colours" block is a collapsed section; an "edited" tag shows when the tokens match no preset. This
profile: **Inherit / Custom** (Custom starts as a copy of the dashboard theme); Inherit shows a
note.

### 5.5 Page background (`PageBackground`, `src/lib/appearance.ts`; `background-editor.tsx`, `background-panel.tsx`, `background-video.tsx`)

Stored at **Dashboard** (`background`) and per **Profile** (`background`; `{ type: "none" }` =
explicitly none; unset = inherit). Sparse; unset fields use the defaults below.

| Field | Label | Control | Options / range | Default | Visible when | Target |
|---|---|---|---|---|---|---|
| scope | All profiles / This profile | segmented | | All profiles (This profile when the profile has its own) | always | Dash › Appearance › Page background |
| profile mode | Inherit / Custom / None | segmented | | Inherit | This profile | same |
| `type` | (None / Color / Gradient / Image / Video) | segmented | none, color, gradient, image, video (a profile's Custom omits None) | `none` (dashboard) | always | same |
| `color` | Color / Fill (behind the image or video) | color | | `#0b0b0f` | color; image/video (letterbox fill) | same |
| `gradient.from`, `gradient.to` | From, To | 2 colors | | `#1e1b4b`, `#0b0b0f` | gradient | same |
| `gradient.angle` | Angle | slider 0–359 ° | | `160` | gradient | same |
| `src` | Image / Video | URL field with Upload…, drop, Library (uploaded files; delete; clean up unused) and a preview | http(s), server path, `data:` image/video | unset (an image/video with no file shows its fill color) | image, video | same |
| `poster` | Poster image | media field | | unset | video | same |
| `loop` | Loop | toggle | | `true` | video | same |
| `muted` | Muted | toggle | | `true` | video | same |
| `rate` | Speed | segmented | 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2× (any stored rate in 0.25–4 is added) | `1` | video | same |
| `fit` | Fit | segmented | cover, contain, stretch, center, tile (video: no tile) | `cover` | image, video | same |
| `position.x`, `position.y` | Position | 3×3 align grid | start / center / end | `center` / `center` | image, video, when `fit` is not stretch | same |
| `dim` | Dim | slider 0–100 % | | `0` | gradient, image, video (Effects) | same |
| `tint` | Tint | color | | `#000000`; setting it sets `tintOpacity` to 30 when it is 0 | same | same |
| `tintOpacity` | Tint opacity | slider 0–100 % | | `0` | same | same |
| `blur` | Blur | slider 0–40 px | | `0` | same | same |

Behaviours that are not settings: a video pauses when the page is hidden and shows only its poster
under reduced motion (General › Motion).

### 5.6 General (`DashboardConfig.general`; `src/lib/general.ts`; `general-panel.tsx`)

Only changed keys are stored; each card counts what it sets and resets only its own keys.

| Key | Label | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `font` | Font | select (5) | system (System), sans, rounded, serif, mono | `system` | General | Dash › General › Type |
| `hour12` | Clock | segmented | auto (Locale), 24 (24 h), 12 (12 h) | `auto` (unset) | General | Dash › General › Clock & date |
| `showSeconds` | Show seconds | toggle | | `true` | General | Dash › General › Clock & date |
| `locale` | Date & time locale | select | System (`""`), plus en-US, en-GB, de-DE, de-CH, fr-FR, it-IT, es-ES, nl-NL, sv-SE, nb-NO, pl-PL, pt-BR, ja-JP, zh-CN; a saved unknown locale is added as an option | `""` | General | Dash › General › Clock & date |
| `motion` | Motion | segmented | system (System), reduce (Reduce), full (Full) | `system` | General | Dash › General › Display |
| `hideCursor` | Hide cursor in kiosk | toggle | | `false` | General | Dash › General › Display |
| `kioskPageNav` | Page dots and swipe | toggle | | `false` | General | Dash › General › Display |

The "Studio" section (Quick bar, Inspector sections) has no stored setting in the config: see §7.

### 5.7 Connection (`dataApiUrl`; `data-api-panel.tsx`)

| Field | Label | Control | Notes | Default | Level | Target |
|---|---|---|---|---|---|---|
| `dataApiUrl` | Data API URL | text; commits on Enter or blur; red border and "Enter an http(s) URL." when invalid | `normalizeApiBase`; stored only when changed | `http://127.0.0.1:3921` | Dashboard | Dash › General › Connection |
| (action) | Test connection | button, shows testing / connected / not reachable | | | UI | same |
| (link) | Open API index | link to `<base>/` | | | UI | same |

### 5.8 Source preferences (`sourcePrefs`; `sources-panel.tsx`)

Key = `{plugin}::{container}` (`""` container for flat sources). Stored at **Dashboard**.

| Field | Label | Control | Default | Target |
|---|---|---|---|---|
| `enabled` | Show in dashboard (also the eye on each source row) | checkbox / icon toggle | `true` (stored only when changed) | Sources mode (source row and detail) |
| `displayName` | Display name | text, placeholder = the source label | unset | Sources mode (source detail) |
| bind / unbind | Bind to widget / Unbind | per-widget button; writes `settings.source` (value = the container id) on a placement whose module declares a `source` setting for this plugin | n/a | Sources mode; Data tab › Bound data |

---

## 6. Presets and saved items

### 6.1 Appearance presets (`appearancePresets`, built-ins in `src/lib/appearance-presets.ts`)

Shape: `{ id, name, description, theme (tokens or preset name), radius, style (look keys),
background? }`. User presets live in `DashboardConfig.appearancePresets`; the 9 built-ins (Dark,
Light, Glass, Frosted, Matte, Neon, Minimal, Ocean, Forest) ship in code (ids `builtin:*`) and
cannot be edited. Stored: **Dashboard**.

| Control | Label | Control type | Default | Target |
|---|---|---|---|---|
| Gallery card | (preview, name, description, image icon when it brings a background) | click applies to the current scope | | Dash › Appearance › Appearance presets |
| Replace the page background | checkbox | | off: the preset background is used only where none is set | same |
| Save current as preset… | name input, Enter saves | | | same |
| Saved look menu | Rename…, Delete | | | same |
| Overrides banner | "N widgets keep their own style · N profiles have their own look", Make them follow, Dismiss | | | same |

An apply is one undo step.

### 6.2 Style presets (`stylePresets`: `{ id, name, settings }`)

Look keys only (§1.5). Stored: **Dashboard**. Controls: zone Colors & surface › "…" menu: Apply
preset (submenu), Save as preset… (name input), Delete preset (submenu). Target: S › Colors &
surface.

### 6.3 Saved panels (`panelPresets`: `UserPanelPreset`)

`{ id, name, panel (PanelDef), settings? (the panel look), colSpan?, rowSpan? }`. Stored:
**Dashboard**; shared by all profiles; exported with the config; each use is a fresh copy. Controls:
Save as panel preset… (Panel card), Add › My panels (Rename…, Delete on each row). Target: context
menu "Save to My panels"; Add › My panels.

### 6.4 Built-in panel presets and layout starters (code, not config)

Panel presets (`src/lib/panelPresets.ts`): Blank panel, System, RAM, CPU, GPU, FPS gauges, Steam,
Weather, Network, Clock. Layout starters (`src/lib/panel-starters.ts`): Row of stats, 2×2 stats, Hero
overlay, Gauge row, Clock + date, Label / value list.

---

## 7. Studio UI preferences (Browser, `localStorage`, not exported)

| Key | What | Values | Default | Target |
|---|---|---|---|---|
| `studio.dockCollapsed` | Docked inspector collapsed (Ctrl+\) | boolean | `false` | Dock strip; Ctrl+\ |
| `studio.quickBar` | Quick bar shown | boolean | `true` | Dash › General › Studio |
| `studio.accordion` | Inspector sections: one open or many | one, many | `one` | Dash › General › Studio |
| `studio.quickPins` | Pinned quick-bar settings per widget type (max 6) | map | unset (a default set applies) | Pin button on each inspector row |
| `studio.drawer` | Open left drawer | add, layers, profiles, none | `add` | Rail |
| session only | Style clipboard (Copy style), widget clipboard (Copy widget), settings search text | | | Not persisted |

---

## 7a. Desktop app settings (InfoPanel Studio; `settings.json`, not in the config)

Kept by the desktop app, not by the studio: `%APPDATA%\dev.f3nn3x.infopanel-studio\settings.json`
(see [desktop/README.md](desktop/README.md); edited in the app's settings window, `src-tauri/src/settings.rs`).
Missing or invalid keys fall back to their default.

| Key | What | Values | Default | Target |
|---|---|---|---|---|
| `host` | Address the server listens on (becomes `HOST`) | `127.0.0.1`, `0.0.0.0` or a local IP | `127.0.0.1` | Settings page › Server |
| `port` | Server port (becomes `PORT`) | 1024-65535 | `3922` | Settings page › Server |
| `allowedHosts` | Extra host names for the request guard (`ALLOWED_HOSTS`) | list, or a comma-separated string | empty | Settings page › Server (when not loopback) |
| `startAtLogin` | Start at login, hidden in the tray | boolean | `true` | Settings page › Startup |
| `openStudioOnLaunch` | A manual launch opens the window | boolean | `true` | Settings page › Startup |
| `closeToTray` | Closing the window hides it; off quits and stops the server | boolean | `true` | Settings page › Startup |
| `agents.enabled` | Claude Code and Codex hooks installed by the app | boolean | `false` | Settings page › Coding agents |
| `debug` | Debug logging and leak sampling (also `--debug`, `INFOPANEL_STUDIO_DEBUG=1`) | boolean | `false` | Settings page › Debug mode |
| `version`, `agents.installed`, `closeWarningShown` | Bookkeeping: file layout, what the hooks were last written for, the one-time close warning | | | Not edited by hand |

The server's own environment variables (`PORT`, `HOST`, `ALLOWED_HOSTS`, `DASHBOARD_DIST`,
`DASHBOARD_DATA_DIR`, `DASHBOARD_DEBUG`) are in [development.md](development.md).

---

## 8. Open placement questions

1. **`preset` (Default / Dark / Light / Vivid / Mono).** A per-widget quick look that bundles
   `surface`, `tint` and `accent`. FEATURE_MAP lists "Style preset" (the saved named styles), not
   this key. Proposed: S › Colors & surface, next to Surface. It is not a look key, so it is not
   available in Global style.
2. **`layout` on non-adaptive widgets.** The spec says Layout appears only for adaptive widgets
   (Spotify, Media, Hardware, Audio, Bluetooth). In the code all 11 modern widgets declare it and all
   11 read `cfg.layout`. Either keep it on all 11 (no feature loss) or restrict it (a behaviour change).
3. **Audio `source` and Wave Link `source`.** They are data selections (device, meters), but
   FEATURE_MAP puts Audio "Content (device, ...)" and Wave Link "Content (meters to show, ...)". Sources
   mode also writes Audio's `source` through Bind. Candidates: C › Content, or D › Bound data. The
   inventory follows FEATURE_MAP (C) and flags it.
4. **Colour pickers inside a Content category.** Audio's Meter colours (`levelColor`, `hotColor`) and
   Wave Link's (`liveColor`, `muteColor`) sit in the same "Meter" group as non-colour settings.
   FEATURE_MAP says "Meter (...; colours Adv) → C"; DATA_MODEL §2 says colour-picker categories go to
   S (Adv). The five other colour groups (Device, Dot, Gauge, Battery, Speed) are unambiguous.
5. **Web Page style.** The spec says the style tab is reduced to Colors & surface, Border & effects
   and Advanced. The code exposes `scale` (Size & alignment), `radius` (Spacing & shape), `accent`,
   and the four edge keys, and no `customCss` (so no Advanced section). Decide whether Size and
   corner radius stay (no feature loss) and whether to add `customCss`.
6. **Panel `css`, `PanelDef.title`/`titleVisible`/`accent`/`background`/`visible`.** There is no
   dedicated field for `PanelDef.css` today; it is only reachable in the Code view, and panel CSS is
   scoped with the zone's `customCss` otherwise. The legacy fields are kept for old builds. Proposed:
   leave them to the Code view; expose a panel CSS field under S › Advanced only if wanted.
7. **Theme tokens not in the editor.** `popover`, `popover-foreground`, `secondary-foreground`,
   `accent-foreground`, `destructive-foreground`, `input` are in the config and presets but have no
   editor row. Keep unreachable (as today) or add them under Adv.
8. **Which theme tokens are Adv.** The spec says "primary/accent visible, other tokens under
   Advanced". The inventory marks `background`, `foreground`, `card`, `card-foreground`, `primary`,
   `accent` as visible and the rest of the 13 as Adv; adjust if "Background" and "Foreground" should
   also be Adv.
9. **Zone frame for panels.** `design.background` is hidden for panels; accent and title header
   remain. Panels already have `accent`, `title` and `surface`, so the zone frame accent and header may
   duplicate them. Kept (no feature loss), under S › Border & effects › Zone frame (Adv).
10. **Follow vs edit.** DATA_MODEL says editing a look value on Follow switches the zone to Custom.
    The code locks the rows (read-only) and offers "Customize" / the Custom segment instead. The
    registry needs to pick one.
11. **`glowColor` visibility.** Spec: shown only when glow is not none. Code: always shown. Treat as
    a `visibleIf` added in Phase 2.
12. **`sourcePrefs`.** `enabled` ("Show in dashboard") and `displayName` are stored but nothing outside
    the Sources panel reads them today (no kiosk or widget consumer). The redesign keeps them in
    Sources mode; confirm whether they should start to take effect.
13. **Hide when idle.** Removed from every widget (a stored `hideWhenIdle` is ignored).
14. **Magic wand.** FEATURE_MAP §5 lists a zoom-bar "Magic wand" with "same action". The only wand in
    the code is the **Auto** layout-mode icon (and the Auto profile entry); there is no canvas
    auto-arrange action. Confirm the intended action before building it.
15. **"Studio" settings.** DATA_MODEL §7 puts "Studio" under General. Its switches (Quick bar,
    Inspector sections) are `localStorage` preferences (`studio.quickBar`, `studio.accordion`), not
    config fields: keep them Browser-level. The old inspector position (`studio.layout`) is gone.
