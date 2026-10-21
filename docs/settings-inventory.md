# Settings inventory

Every setting the studio edits today, read from the code at commit `a51bd17` (config v9,
`CONFIG_VERSION` at `src/lib/layout.ts:226`). It began as the Phase 0 snapshot of the studio redesign
(commit `6c465bf`, config v4) and is kept in step with the code. Other docs cite it by section number
(`redesign/DECISIONS.md` cites §8, `redesign/FEATURE_MAP.md` cites §3.3 and questions 2, 5 and 7), so
the numbering and headings 1 to 8 stay. The prototype was not used as a source.

Companion docs: `docs/redesign/DATA_MODEL.md` (what exists), `docs/redesign/FEATURE_MAP.md` (where
it lives), `docs/redesign/DECISIONS.md` (the answers to §8), `docs/redesign/IMPLEMENTATION_PLAN.md`.

> **Per-widget keys are in [widget-settings.md](widget-settings.md)** (the schema, the standard block,
> the themed sections) and [module-catalog.md](module-catalog.md) (what each widget reads). They are
> the settings of widget settings v2 (config v6 to v9; [STATUS](redesign/widget-settings-v2/STATUS.md)).
> The v2 names: `variant` + `compactView` → `compact`, `layout` → `sizeTier`, `alignX` + `alignY` →
> `align` (+ `alignSpread`), thresholds → `warn.<q>` / `crit.<q>`, device keys → `device`, `autoScale`
> dropped, `styleMode` → `Placement.follow` per section, `style` / `styleEnforce` → `widgetTheme`
> (values and locks), `general.hour12` → the themed `clock`. `src/lib/settings-migrate.ts` maps the old
> names on load. §1 to §3 below list the shared and panel keys as the inspector shows them today.

## How to read this

**Stored at** (the "Level" column):

| Level | Where it is stored |
|---|---|
| **Zone** | `Placement.settings[key]` (a widget's or panel's look and content settings) |
| **Zone field** | A field of the `Placement` itself, outside `settings`: `visible`, the box (`colStart`, `rowStart`, `colSpan`, `rowSpan`), `design`, `follow` (per section: `false` = custom), `module` |
| **Panel** | `Placement.panel` (`PanelDef`) |
| **Panel widget** | One entry of `Placement.panel.widgets` (`Widget`), with its own `follow` (`type`, `colors`, `format`, `thresholds`) |
| **Page** | A `ProfilePage` (`MonitorProfile.pages[]`): `name`, `icon`, `placements`, `widgetTheme` (`values` and per-section `follow`) |
| **Profile** | `MonitorProfile` (`profiles[]`): size, grid, `rotate`, `island`, `performance`, and its own `widgetTheme` (`values`, `locks`), `theme`, `radius`, `background` |
| **Dashboard** | `DashboardConfig` top level, including `style`, the all-profiles widget style |
| **General** | `DashboardConfig.general` (`GeneralSettings`, only changed keys stored) |
| **Browser** | `localStorage`, not in the config (studio UI preferences, §7) |
| **Server / live** | Runtime state the server holds (`src/lib/control.ts`, §7b); not config, not in undo |
| **Desktop** | The desktop app's `settings.json` (§7a); not in the config |

**Target** = where the setting lives in today's studio, as tab › section. A zone (widget or panel) has
four tabs: **Show**, **Style**, **Data**, **Behaviour** (`TAB_LABELS`, `src/components/studio/inspector-model.ts:50`).
With nothing selected the Profile settings inspector has three: **Layout**, **Look**, **Behaviour**
(`DASHBOARD_TABS`, `inspector-model.ts:60`; sections at `inspector-model.ts:389`, rendered by
`src/components/studio/document-inspector.tsx`). A section's rows behind its **More (n)** link are
marked **(More)**. The old tab names Content, Profile, Appearance and General are stored-tab aliases
only (`RENAMED_TABS`, `src/components/studio/inspector/inspector-prefs.ts:15`). The rail's **Theme**
page is a third home of the widget style (§5.2); **Rail** names other rail destinations.

**Controls** follow `setting-control.tsx` and the schema table in [widget-settings.md](widget-settings.md):
`boolean` Toggle; `number` Slider with value box (min / max / step; a number field when it has no
range); `select` Segmented when it has 1 to 4 options, otherwise Select, `multiple` a checkbox list
(comma-separated string, `""` = none); `color` color field (`""` = unset); `text` single-line field
(textarea when multiline); `icon` icon grid; `image` URL field with upload, drop and library; `align`
one 3×3 grid that writes two keys; `thresholds` a zone bar with Warning and Critical.

**Defaults**: `auto` for px/enum selects means "the widget's own value"; `""` means unset. A setting
at its default is normally *not stored* (sparse); `effectiveSettings` fills defaults at read time.

**Visibility**: a row can carry `visibleIf(values)` (a row shows only while it holds; for example
`glowColor` only while `glow` is not none), `more` (behind More), `perWidget` (never themed, editable
while the section follows) and `hidden` (in the schema, not listed). Conditions in the tables below
are the ones the schema sets.

**Theme resolution** (`src/lib/theme-model.ts:8-20`; `resolveStyle`, `src/lib/style-resolve.ts`). The
themed keys (`THEMED_KEYS`, 11 sections: `skin`, `colors`, `palette`, `surface`, `type`, `spacing`,
`border`, `css`, `format`, `thresholds`, `motion`) resolve lowest first:

1. `THEME_DEFAULTS` (today's defaults, so nothing repaints);
2. `DashboardConfig.style`, the all-profiles base (no locks);
3. `MonitorProfile.widgetTheme.values`, plus its per-section `locks`;
4. `ProfilePage.widgetTheme.values`, only for the sections where the page's `follow[section] === false`
   and the profile does not lock the section;
5. the widget: its own `settings` for a section where `Placement.follow[section] === false`; a widget
   section follows the theme otherwise, and always while the profile locks it.

A following section keeps its own values stored but does not apply them. A locked section is the
profile's on every page and widget. Panel widgets follow their panel the same way (`Widget.follow`,
`type`, `colors`, `format`, `thresholds`; `src/lib/panel-model.ts:42-49`). Color tokens and corner
radius have two levels only (dashboard, profile; `resolveTheme`, `src/lib/theme.ts:254`); the page
font is global (§5.6). Source-dot states on a row (`src/components/studio/inspector/source-dot.tsx:6-31`):
default, dashboard (all-profiles style), profile, here (set here), overriding (set here over a global
value), ignored (set here, its section follows the theme).

---

## 1. Shared general settings (`src/modules/standard-settings.ts`)

Which block each zone type spreads (the inspector builds the shared sections from it):

| Zone type | Settings it gets |
|---|---|
| Template widgets | `STANDARD_SETTINGS` (§1.1 to §1.4), then the widget's own sections. Web Page takes only the sections its `styleSubset` names (`colors:accent`, `spacing:scale,radius`, `border`; `src/widgets/registry/inspector-meta.ts:80`) |
| **Other sensors** (`cards`) | `CARD_SETTINGS`: `surface` (default **Theme**), `accent`, all of `STYLE_SETTINGS`, all of `SURFACE_SETTINGS`. No `showTitle`, `label`, `icon`, `preset`, `compact`, `sizeTier`, `background`, `backgroundOn` |
| Custom panel | `PANEL_SETTINGS` (§1.6) |
| Blank zone | none; the Show tab has a Widget section (pick a widget) and Zone frame (`blankSections`, `inspector-model.ts`) |
| Canvas zone (`infopanel`, an imported InfoPanel profile) | no `settings`; the selected item's fields come from the InfoPanel schema (`kind: "infopanel"` context) |

The shared sections and their tab (`SHARED_SECTIONS`, `src/components/studio/inspector-categories.ts:30`):
Show: Header, Fit. Style: Skin & graphics, Colors, Widget colors, Surface, Typography, Size & spacing,
Border & glow, Custom CSS. Data: Units & format. Behaviour: Thresholds, Dynamic Island, Motion.

### 1.1 Widget identity (`STANDARD_SETTINGS`, not look keys)

| Key | Label | Control | Options | Default | Visible when | Level | Target |
|---|---|---|---|---|---|---|---|
| `showTitle` | Show title | toggle | | `true` | not on panels (an empty title hides theirs) | Zone | Show › Header |
| `label` | Custom title | text | | `""` | `showTitle` is not off (panels: "Title (empty = hidden)") | Zone | Show › Header |
| `icon` | Icon | icon grid | none + 18 icons: activity, bluetooth, brain, cpu, gauge, gamepad, headphones, heart, leaf, monitor, moon, music, radio, snowflake, sun, thermometer, wifi, zap (`src/lib/widget-icons.ts:29`) | `""` | every widget | Zone | Show › Header (More) |
| *(zone field)* `visible` | Visible | toggle | | `true` | every widget and panel | Zone field | Show › Header (the first Show section on a widget with no header), header eye, `H` |
| *(zone field)* `module` | Widget type (button opens the widget picker; "Change keeps the general settings") | picker button | the template widgets, Other sensors, Custom panel | n/a | every widget zone | Zone field | Show › Header › Widget type |

A widget with `header: none` (`InspectorMeta`; Calendar, Game spotlight, KPI tiles, Menu bar, OSD strip,
Steam game, Vitals, Web page) moves its Title and Icon into Fit, and its picker and Visible into its
first Show section (`withIdentity`, `inspector-model.ts`).

### 1.2 Look, size, alignment, spacing, typography (`STYLE_SETTINGS`; look keys)

All are themed (§1.5) and show a Follow bar per section. Defaults are `THEME_DEFAULTS`.

| Key | Label | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `skin` | Skin | select | Auto + the 14 skins: default, tui, macos, fluent, hud, ink, retro, ios, android, synth, brutal, cyber, nixie, instrument (`SKIN_PACKS`, `src/widgets/core/theme.ts:23`); picking one writes `surface = auto` | `auto` | Zone, themed | Style › Skin & graphics |
| `stroke` | Ring / bar thickness (%) | slider 50 to 250 step 10 | | `100` | same | Style › Skin & graphics |
| `graph` | Graph style | select | auto, area, line, step, bars, dots, braille | `auto` | same | Style › Skin & graphics (More) |
| `meter` | Meter style | select | auto, bar, pill, segments, blocks, hair, wave, square | `auto` | same | Style › Skin & graphics (More) |
| `textColor` | Text color | color | | `""` | same | Style › Colors |
| `mutedColor` | Secondary text color | color | | `""` | same | Style › Colors |
| `font` | Font | select | Theme (`auto`) + the 25 fonts of `FONT_CATALOG` except System (`src/lib/fonts.ts`: sans, rounded, serif, mono and 21 web fonts) | `auto` | same | Style › Typography |
| `fontWeight` | Value weight | select | auto, 400 Regular, 500 Medium, 600 Semibold, 700 Bold, 800 Heavy | `auto` | same | Style › Typography |
| `labelCase` | Label case | select | auto, UPPERCASE, As written (`none`), Capitalized | `auto` | same | Style › Typography |
| `scale` | Size (%) | slider 50 to 200 step 5 | | `100` | same | Style › Size & spacing |
| `align` + `alignSpread` | Alignment | 3×3 align grid (cell codes `tl` to `br`) + Spread | `auto` or a cell; Spread on/off | `auto` / `false` | same | Style › Size & spacing |
| `padding` | Inner padding | select | auto, 0, 4, 8, 12, 16, 20, 24, 32, 48 px | `auto` | same | Style › Size & spacing |
| `gap` | Gap between items | select | auto, 0, 4, 8, 12, 16, 24, 32, 48 px | `auto` | same | Style › Size & spacing |
| `radius` | Corner radius | select | auto, 0, 4, 8, 12, 16, 20, 28 px, Pill (`999`) | `auto` | same | Style › Size & spacing |
| `customCss` | Custom CSS (@scope, :scope = root) | textarea | | `""` | same | Style › Custom CSS (More; in the theme editor not behind More) |
| `smoothing` | Graph updates | select | stepped (Stepped), smooth (Smooth) | `stepped` | same | Behaviour › Motion |

### 1.3 Surface and edge (`SURFACE_SETTINGS`; look keys, surfaced widgets)

| Key | Label | Control | Options | Default | Visible when | Level | Target |
|---|---|---|---|---|---|---|---|
| `borderWidth` | Border width | select | auto, 0, 1, 2, 3, 4, 6 px | `auto` | surfaced widgets | Zone, themed | Style › Border & glow |
| `borderColor` | Border color | color | | `""` | same | same | Style › Border & glow |
| `glow` | Edge glow | select | none (None), soft (Soft), strong (Strong) | `none` | same | same | Style › Border & glow |
| `glowColor` | Glow color (hint: Auto uses the accent) | color | | `""` | `glow` is not none | same | Style › Border & glow |
| `surfaceOpacity` | Surface opacity (%) | slider 0 to 100 step 5 | | `100` | surfaced widgets | same | Style › Surface |
| `blur` | Background blur | select | auto, 0, 4, 8, 16, 24, 40 px | `auto` | same | same | Style › Surface |

### 1.4 Preset, fit, surface, accent, background (`STANDARD_SETTINGS`)

| Key | Label | Control | Options | Default | Level | Themed | Target |
|---|---|---|---|---|---|---|---|
| `preset` | Style preset | select | default; dark (applies `surface=matte-dark`, `tint=false`); light (`matte-light`, `tint=false`); vivid (`glass`, `tint=true`); mono (`matte-dark`, `tint=false`, `accent=#fafafa`) | `default` | Zone | no | Style › Colors (More) |
| `compact` | Small zones | select | auto, full (Full), card (Card), dense (Dense); the registry drops what a widget cannot draw (`fitSettings`) | `auto` | Zone | no | Show › Fit |
| `sizeTier` | Density | select | auto, lg (Roomy), md (Standard), sm (Compact), xs (Minimal) | `auto` | Zone | no | Show › Fit (More) |
| `surface` | Surface | select | auto (Auto, the skin's card), glass, matte-light (Matte (light)), matte-dark (Matte (dark)), theme (Theme), and 12 skin surfaces: solid, outline, flat, tinted, aurora, neon, holo, mesh, carbon, inset, studio, terminal (`BASE_SURFACES`, `src/widgets/core/surfaces.ts:21`) | `glass` (Other sensors and the plain card widgets: `theme`) | Zone, themed | yes | Style › Surface |
| `accent` | Accent color | color | | `""` | Zone, themed | yes | Style › Colors |
| `background` | Background image | image field | | `""` | Zone | no | Style › Surface (More) |
| `backgroundOn` | Use as background | toggle | | `false` | Zone | no | Style › Surface (More) |
| `island`, `island*` | Send to island, and the source's own keys (shown while on; `islandSettings`, `src/lib/island/sources.ts:94`) | toggle + rows | | per widget (`defaultOn`) | Zone | no | Behaviour › Dynamic Island |

`applies` bundles: choosing a `preset` also writes the listed extra keys (`surface`, `tint`, `accent`)
into the zone's settings. Standard colour rows with a palette `role` (`s1` to `s6`, `ok`, `warn`,
`crit`, `accent`) sit in Style › Widget colors; see widget-settings.md. The Units & format rows
(`tempUnit` Temperature c / f, `rateUnit` Speed units, `decimals` Decimals auto / 0 / 1 / 2, `clock`
Clock Locale / 24 h / 12 h; Data › Units & format), the thresholds (`warn.<q>` / `crit.<q>`,
Behaviour › Thresholds) and `meterBallistics` (Meter response, Behaviour › Motion) are themed and
declared per widget (`fmt`, `thr` in `InspectorMeta`); the defaults are `THEME_DEFAULTS`
(`theme-model.ts:159`; quantities `load` 80/92, `temp` 80/90, `full` 85/95, `db` -9/-2, `value`
70/90).

### 1.5 The look-key sets

- **`PROFILE_STYLE_KEYS`** (`standard-settings.ts`): `surface`, `accent`, every key of §1.2 and §1.3
  (`skin`, `graph`, `meter`, `smoothing`, `scale`, `align`, `alignSpread`, `padding`, `gap`, `radius`,
  `textColor`, `mutedColor`, `font`, `fontWeight`, `labelCase`, `stroke`, `customCss`, `borderWidth`,
  `borderColor`, `glow`, `glowColor`, `surfaceOpacity`, `blur`; 25 keys). Copy style, Paste style and
  saved style presets carry exactly these (`styleOf`, `replaceStyle`). `preset`, `compact`, `sizeTier`,
  `showTitle`, `label`, `icon`, `background`, `backgroundOn` and all content keys are per zone only.
- **`THEMED_KEYS`** (`theme-model.ts:127`, `SECTION_KEYS`): the keys a theme can set, by section.
  `skin`: `skin`, `stroke`, `graph`, `meter`. `colors`: `accent`, `textColor`, `mutedColor`. `palette`:
  `s1` to `s6`, `ok`, `warn`, `crit`. `surface`: `surface`, `surfaceOpacity`, `blur`. `type`: `font`,
  `fontWeight`, `labelCase`. `spacing`: `scale`, `align`, `alignSpread`, `padding`, `gap`, `radius`
  (and the legacy `alignX`, `alignY`). `border`: `borderWidth`, `borderColor`, `glow`, `glowColor`.
  `css`: `customCss`. `format`: `tempUnit`, `rateUnit`, `decimals`, `clock`. `thresholds`: `warn.<q>`,
  `crit.<q>` for `load`, `temp`, `full`, `db`, `value`. `motion`: `smoothing`, `meterBallistics`. Saved
  looks (§6.1) keep only these.

### 1.6 Custom panel look (`PANEL_SETTINGS`)

`STANDARD_SETTINGS` minus `preset`, `compact`, `sizeTier`, `stroke` and `showTitle`
(`NOT_FOR_PANELS`), with two changes. Stored in the panel zone's `settings` like any widget; the
shared sections are the same (Show › Header, Style, Behaviour).

| Key | Change for panels | Target |
|---|---|---|
| `label` | Label becomes "Title (empty = hidden)"; empty hides the title | Show › Header |
| `surface` | Default `panel`; options none (None), panel (Card), bordered (Bordered card), then glass, matte-light, matte-dark, theme (no skin cards) | Style › Surface |

All other keys (`icon`, `accent`, `background`, `backgroundOn`, §1.2 and §1.3 minus the removed ones)
behave as in §1.2 to §1.4. Legacy fallback: `PanelDef.title`, `titleVisible`, `accent` and
`background` are read when the matching setting is absent (`panelOwnSettings`, `panelLegacyLook`,
`src/lib/panel-model.ts`), never written by the UI.

### 1.7 Zone-level fields handled outside `settings`

| Field | Label (today) | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `Placement.colStart`, `rowStart`, `colSpan`, `rowSpan` | COL / ROW / W / H | 4 number fields (min 1, max = grid size) | | set when drawn or added | Zone field | the zone header's placement row (`src/components/studio/zone-inspector-parts.tsx:249`) |
| `Placement.design.accent` | Frame accent | color | | unset | Zone field | Style › Border & glow › Zone frame (More) |
| `Placement.design.background` | Frame background | segmented | none (None), panel (Panel), bordered (Bordered) | `none` | Zone field | same; hidden for panels (their Surface covers it) |
| `Placement.design.header` | Frame title header | toggle | | `false` | Zone field | same |
| `Placement.follow` | Follow bar per themed section: "Follows the profile theme" / "Custom for this widget" / "Locked by the profile theme"; buttons Customize, Use theme | bar per section | per section: follow or custom | unset (follows) | Zone field | the top of each themed Style, Data and Behaviour section (`src/components/studio/inspector/follow-bar.tsx`) |
| `Placement.visible` | Visible / eye | toggle | | `true` | Zone field | §1.1 |

### 1.8 Zone style tools (actions, not stored settings)

On Style › Colors (the section's actions, `styleTools` in `inspector-model.ts`; `style-tools.tsx`):
Copy style, Paste style (replaces the zone's look keys and turns the sections it sets custom; session
clipboard), and a "…" menu with Use as global… (All profiles / This profile; writes
`DashboardConfig.style` or the profile's `widgetTheme.values`), Apply preset, Save as preset… and
Delete preset (`DashboardConfig.stylePresets`, §6.2). Also per section: the "N changed" badge and
Reset; and the context menu (FEATURE_MAP §9).

---

## 2. Widget-own settings

Each widget's own keys are declared by its template and listed in [widget-settings.md](widget-settings.md)
and [module-catalog.md](module-catalog.md); the schema tests in `src/widgets/registry/` guard them. The
inspector files them by task: what is shown in Show, sensors and devices in Data, levels, history,
sorting and click behaviour in Behaviour, colors in Style › Widget colors (with a palette `role`), the
less-used rows behind **More**. A tab with no sections is disabled.

The zone types that used to carry their own keys were retired in config v4. A stored zone with one of
those ids is rewritten on load to its template (`src/lib/legacy-zones.ts`, `LEGACY_MODULE_IDS`),
keeping the keys the template reads. The mapping table is in module-catalog.md ("Retired ids"); it
matches the rules at `legacy-zones.ts:172` (`systemmodern`, `spotifymodern`, `mediamodern`,
`steammodern`, `hardwaremodern`, `weathermodern`, `fpsmodern`, `audiomodern`, `wavelinkmodern`,
`bluetoothmodern`, `networkmodern`, `vbz`, `notifications`, `textfile`, `streamdeck`, `webpage`).

### 2.1 Other sensors (`cards`, no module settings)

Zone type for every sensor no module claims (`src/modules/other-sensors.tsx`, one `SensorValue` card
per key). Block: `CARD_SETTINGS` (surface default `theme`, `accent`, all of §1.2, all of §1.3). No own
keys. No `showTitle`, `label`, `icon`.

---

## 3. Custom panels (`Placement.panel`, `src/lib/panel-model.ts`)

The panel's look (title, accent, surface, spacing, colors, CSS) is `PANEL_SETTINGS` in the zone's
`settings` (§1.6). Its arrangement is `PanelDef`, below. Field edits coalesce per field into one undo
step (`panel:<field>`). The panel's sections are Show › Panel, Layout, Background (overlay only),
Widgets, and Panel JSON (Code view), then the shared Style, Data and Behaviour sections
(`panelSections`, `inspector-model.ts`).

### 3.1 Panel fields (`PanelDef`)

| Field | Label | Control | Options / range | Default | Visible when | Target |
|---|---|---|---|---|---|---|
| view toggle (UI only) | Editor: Visual / Code | segmented | visual, code | visual | always | Show › Panel |
| *(whole panel as JSON)* | Panel JSON | textarea; Apply or Ctrl+Enter applies (one undo step); parse errors inline and as a toast | | | Code view | Show › Panel JSON |
| `fit` | Size: Fill / Hug | segmented | fill, hug | `fill` (unset) | always | Show › Panel |
| `gap` | Gap | number, empty = auto | 0 to 200 | unset (auto: the Style gap, else the layout's own) | always | Show › Panel |
| `padding` | Padding | number, empty = auto | 0 to 200 | unset (auto) | always | Show › Panel |
| `layout` | Layout | segmented | stack (Stack), grid (Grid), overlay (Overlay); legacy `wrap` loads as a wrapping row stack | `stack` | always | Show › Layout |
| `direction` | Direction | segmented | row (Row), column (Column) | `row` | stack | Show › Layout |
| `wrap` | Wrap | toggle | | `true` | stack | Show › Layout |
| `justify` + `align` | Alignment (stack) / Cell alignment (grid) | one 3×3 grid. Stack: along the axis start/center/end/Spread (`between`); across start/center/end/stretch. Grid: cell alignment | `justify`: start, center, end, between. `align`: start, center, end, stretch | unset (stack `align` start, grid `stretch`) | stack, grid | Show › Layout |
| `columns` | Columns | stepper | 1 to 12 | `3` | grid | Show › Layout |
| `gridCols` | Column sizes | track chips (any CSS track: `1fr`, `auto`, `120px`, `minmax(0, 1fr)`) + add/remove | | unset (equal split of `columns`) | grid | Show › Layout |
| `gridRows` | Row sizes | track chips | | unset (equal rows) | grid | Show › Layout |
| `overlayAlign` | Band alignment (Top / Middle / Bottom) | 3 segmented | start (Start), center (Center), end (End), between (Spread) | `start` each | overlay | Show › Layout |
| `bottomGridCols` | Bottom band columns | number, empty = a flex row | 1 to 12 | unset | overlay | Show › Layout |
| `scrim` | Dim the image (dark scrim) | toggle | | `true` (stored only when `false`) | overlay | Show › Background |
| background image | Background image (select of the panel's image widgets; writes `asBackground` on the chosen one) and Image URL (writes that widget's `text`) | select + media field | First image widget / the image widgets | first image widget | overlay | Show › Background |
| `css` | (panel CSS, scoped to the zone; travels with the panel in presets) | no dedicated control: the Code view, and the zone's Custom CSS joins it | | | | Show › Panel JSON |
| `title`, `titleVisible`, `accent`, `background`, `visible`, `id` | legacy / identity | not edited directly; kept in step with the Title / Accent / Surface settings, and editable in Code | | | | none |

The panel header's "…" menu has **Save as panel preset…** (name input; writes
`DashboardConfig.panelPresets`, §6.3).

### 3.2 Widget list (the "Widgets" section)

| Action | Control | Notes | Target |
|---|---|---|---|
| Add widget | "+ Add panel widget…" select of the 11 kinds (`WIDGET_KINDS`) | added after the selected widget; new widget = `{ id, kind, visible: true }`, a shape gets `shape: vbar`, `thickness: 4` | Show › Widgets |
| Select | row click; Up/Down arrows with the list focused | | Show › Widgets |
| Reorder | drag a row; Alt+Up/Down; Move up | | Show › Widgets |
| Hide / show | eye (`Widget.visible`) | | Show › Widgets |
| Row buttons | Duplicate widget, Delete widget | | Show › Widgets |
| Row "…" menu | Copy, Paste after, Change kind (submenu) | Change kind keeps the shared fields (`id`, `kind`, `visible`, `label`, `sensor`, `unit`, `color`, `span`, `rowSpan`, `overlayZone`, `box`, `css`, `className`, `follow`) and the fields the new kind reads (`convertKind`, `panel-model.ts:521`) | Show › Widgets |
| Delete key on the list | removes the selected widget | | Show › Widgets |

### 3.3 Panel-widget fields, by section (`Widget`, `src/components/studio/inspector/item-model.ts`)

A selected panel widget has its own inspector (`kind: "item"`): the same four tabs over the widget's
fields, only the sections and rows its kind reads. Rows edit virtual keys (`boxW`, `thr.warn`, ...)
mapped onto the `Widget`. Typography, Color, Units & format and Thresholds follow the panel unless the
widget makes the section custom (`Widget.follow`, `ITEM_SECTIONS`). The kinds: `stat`, `value`,
`bar`, `gauge`, `customGauge`, `sparkline`, `table`, `text`, `image`, `clock`, `shape`
(`KIND_INFO`, `src/components/studio/widget-kinds.ts`).

**Show tab**

| Section | Field | Label | Control | Range / options | Default | Applies to |
|---|---|---|---|---|---|---|
| Kind | `kind` | Kind chips (Stat, Value, Bar, Gauge, Sparkline, Table, Text, Image, Clock, Shape; Custom gauge only on a widget that already is one) | radio chips | | | all |
| Content | `label` | Label | text | | unset | all but shape |
| Content | `clock` | Show | select | both (Time + date), time (Time), date (Date) | `both` | clock |
| Content | `format` | Format | text | a .NET format, e.g. `hh:mm:ss tt`; empty = the General settings' own | unset | clock, while Show is time or date |
| Content | `text` | Static text (text) / Image URL (image) | text | | unset | text, image |
| Content | `height` | Max height (px) | number | 0 to 600 step 4 (0 = auto) | unset | image |
| Content | `shape` | Shape | select | vbar (V-bar), hbar (H-bar), rect (Rect), circle (Circle) | `vbar` | shape |
| Content | `thickness` | Thickness (px) | number | 1 to 120 | `4` | shape |
| Content | `rows` | Rows | number | 1 to 20 | `7` | table |
| Content | `columns` | Columns (More) | number | 0 to 12 (0 = a head and the rest) | unset | table |
| Content | `header` | Header (More) | text | comma-separated column titles | unset | table |
| Content | `gauge` | Gauge | select | the starters (`STARTERS`, `src/lib/infopanel/gauges/presets.ts:27`), Custom | the default spec | customGauge |
| Content | `width` | Width (px) | number | 8 to 600 step 4 | `120` | customGauge |
| Size & placement | `boxW` / `boxWpx` | Width, Width (px) | select: Hug / Fill / Fixed (grid: Cell / Fixed); px min 1 | | stack: `fill` for bar, table, image, sparkline, else `hug`; grid `fill`; px `120` | stack, grid |
| Size & placement | `self` | Align self | select | auto, start, center, end, stretch | `auto` | stack, grid |
| Size & placement | `boxH` / `boxHpx` | Height, Height (px) (More) | same | | `hug` (stack) / `fill` (grid) | stack, grid |
| Size & placement | `span`, `rowSpan` | Column span, Row span (More) | number | 1 to 12, 1 to 6 | `1` | grid |
| Size & placement | `col`, `row` | Start column, Start row (More) | number | 0 to 24 (0 = auto-placed) | `0` | grid |
| Size & placement | `asBackground` | Use as panel background | toggle | | `false` | image, in overlay |
| Size & placement | `band` (`overlayZone`) | Band | select | top (Top), middle (Middle), bottom (Bottom) | `top` | overlay |

**Style tab**

| Section | Field | Label | Control | Range / options | Default | Applies to |
|---|---|---|---|---|---|---|
| Typography | `fontSize` | Font size (px) | number | 0 to 200 (0 = the kind's own) | unset | stat, value, table, text, clock |
| Typography | `size` | Ring size (px) | number | 0 to 200 | unset (config v9: was `fontSize`) | gauge |
| Typography | `align` | Text alignment | select | left, center, right | `left` | stat, value, table, text, clock |
| Color | `color` | Color (palette role `accent`) | color | | unset | stat, value, bar, gauge, sparkline, text, clock, shape |
| Custom CSS | `className` | Class names (More) | text | hooks for the panel's CSS | unset | all |
| Custom CSS | `css` | CSS (More) | multiline text | `:scope` = the cell; `.wp-label`, `.wp-value`, `.wp-unit`, `.wp-bar-fill` | unset | all |

**Data tab**

| Section | Field | Label | Control | Range / options | Default | Applies to |
|---|---|---|---|---|---|---|
| Bound data | | the panel's bound-data block (a picker that binds the selected widget) | | | | all |
| Binding | `sensor` | Sensor | sensor picker | | unset | stat, value, bar, gauge, customGauge, sparkline, table, text, image |
| Binding | `subSensor` | Sub sensor (More; shown below the value) | sensor picker | | unset | stat, value |
| Units & format | `unit` | Unit | text | empty = the sensor's | unset | stat, value, bar, gauge, sparkline, text |
| Units & format | `decimals` | Decimals | select | auto, 0 to 6 | `auto` | same |
| Units & format | `max` | Maximum | number | min 0; 0 = the value is a percent | `100` | bar, gauge |
| Units & format | `scale` | Multiply by (More) | number | min 0 | `1` | stat, value, bar, gauge, sparkline, text |

**Behaviour tab**

| Section | Field | Label | Control | Range / options | Default | Applies to |
|---|---|---|---|---|---|---|
| Thresholds | `thr.warn` + `thr.crit` | the bound sensor's quantity (Load, Temperature, Fullness, Audio level, Value) | thresholds | a level or off | off, off (absent: the panel's) | stat, value, bar, gauge |
| Scrolling | `scroll` | Scroll when too long | toggle | | `false` | text |
| Scrolling | `scrollSpeed` | Speed (px/s) | number | 1 to 1000 step 5 | `50` | text, while on |
| Scrolling | `scrollSpacing` | Spacing (px) | number | 0 to 1000 step 5 | `40` | text, while on |
| History | `history` | Samples | number | 5 to 200 step 5 | `40` | sparkline |
| Fill | `inverted` | Invert fill | toggle | | `false` | bar, gauge |

---

## 4. Profile (`MonitorProfile`)

The profile inspector (nothing selected) edits the profile being edited, chosen in the Profiles panel
(§7 `studio.pinnedProfile`). Layout holds the screen and grid; Look and Behaviour hold the scoped
sections (§5); a section with an "All profiles / This profile" switch stores the profile's own value
only while the switch says This profile (`scopeOf`, `inspector/profile-scope.ts:30-71`).

| Field | Label | Control | Range / options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `name` | Name | text (a blank name is never saved) | | first profile `Main display`; new: `<window W>×<H>` | Profile | Layout › Screen |
| `width`, `height` | Design size (select of 1920×550, 1920×1080, 2560×720, 1280×400, 1024×600, 800×480, or the current size) + Width, Height; "Use this window's size (W × H)" when it differs | select + 2 number fields | whole px, min 1 | first profile 1920×1080; new: the window size | Profile | Layout › Screen |
| `fit` | When it doesn't fit: Fill / Scroll | segmented | fill, scroll | new: fill when height ≤ 700 and width ≥ 1600, else scroll; first profile scroll | Profile | Layout › Screen |
| `cols` | Columns | stepper −/+ | 2 to 24; a smaller grid is refused while a zone, on any page, would fall outside | first profile 12; new: 6 when width ≤ 1280, else 12 | Profile | Layout › Grid |
| `rows` | Rows | stepper −/+ | 1 to 24 (same refusal) | first profile 6; new: 4 when height ≤ 700, else 6 | Profile | Layout › Grid |
| `gap` | Gap (px field + slider) | number, empty = default | 0 to 200 | `12` (`DEFAULT_GRID_GAP`) | Profile | Layout › Grid |
| `padding` | Edge padding (px field + slider) | number, empty = default | 0 to 200 | 0 for a fill kiosk page, 12 for fill in the studio, 24 for scroll | Profile | Layout › Grid |
| `widgetTheme.values` | Look › Widget style, switch This profile | skins, saved looks, Surface, opacity, blur (§5.2); the rest in the rail Theme page | themed keys | unset (inherits `DashboardConfig.style`) | Profile | Look › Widget style; Theme page › Profile theme |
| `widgetTheme.locks` | Apply to every widget (Look › Widget style); per-section Lock / Unlock and Lock all / Unlock all (Theme page) | toggle / buttons | per section of the 11 | none locked | Profile | same |
| `theme`, `radius` | Look › Theme, switch This profile (colors and Corners) | theme editor (§5.4) | | unset (inherits) | Profile | Look › Theme |
| `background` | Look › Background, switch This profile | background editor (§5.5) | | unset (inherits; `{ type: "none" }` = none for this profile) | Profile | Look › Background |
| `performance` | Behaviour › Performance, switch This profile | `maxFps`, `motion` (§5.6) | | unset (inherits `general`) | Profile | Behaviour › Performance |
| `rotate` | Cycle through pages; Switch every (10 s, 30 s, 1 min, 5 min); Seconds (3 to 3600); Pages (none ticked = every page) | toggle, segmented, number, checklist | `enabled`, `seconds`, `pages` | off; 15 s; every page | Profile | Behaviour › Pages |
| `island` | Show Dynamic Island and its sections (see below) | toggle + rows | | unset (no island; first toggle creates it with `enabled: true`) | Profile | Behaviour › Dynamic Island; the rail's Dynamic Island drawer (same rows) |
| `pages` | the page list: drag to reorder, Delete, Add page | list | at least one page | one page `Main` | Profile | Behaviour › Pages; page tabs; Profiles card |
| `id`, `sampleVersion` | identity; sample-layout version (old configs only, no longer read) | not editable | | | Profile | none |

Pages (`ProfilePage`): `name` (page tab ⋯ › Rename, default `Page N`), `icon` (⋯ › Icon…; none by
default), `widgetTheme` (⋯ › Theme… opens the Theme page at that page; values and per-section `follow`,
§5.2), `placements` (the zones). Page tab ⋯ menu: Rename, Icon…, Theme…, Duplicate, Show on kiosk
(live, §7b), Delete (off on the only page; `pageMenuEntries`, `src/components/studio/page-tabs.tsx:61`).

**Dynamic Island** (`IslandConfig`, `src/lib/island/config.ts`; rows in
`src/components/studio/inspector/island-section.tsx`). Defaults are `ISLAND_DEFAULTS`.

| Section | Key | Label | Control / options | Default |
|---|---|---|---|---|
| (top) | `enabled` | Show Dynamic Island | toggle | off while absent |
| Shape | `shape` | Style | Pill, Notch | `pill` |
| Shape | `size` | Size | S, M, L | `m` |
| Shape | `scale` | Scale | slider 80 to 150 % | `100` |
| Shape | `offsetY` | Offset from top | 0 to 64 px | `8` |
| Shape | `reserve` | Reserve space | toggle | `false` |
| Idle | `idle` | When idle | Time, Time and date, Time and values, Line, Hidden | `time` |
| Idle | `stats` | values (Label, Orange at, Red at; at most 3) | list | none |
| Idle | `rotate` | Rotate every | 0 to 60 s (0 = side by side) | `0` |
| Look | `tint` | Color | Black, Theme, Custom | `black` |
| Look | `bgColor`, `fgColor` | Background, Text (Custom) | colors | `#000000`, `#ffffff` |
| Look | `opacity` | Opacity | percent, min 30 | `100` |
| Look | `border` | Border | None, Subtle, Accent | `none` |
| Look | `shadow` | Shadow | toggle | `true` |
| Look | `font` | Font | the font catalog | `system` |
| Look | `weight` | Weight | Regular, Medium, Semibold, Bold | `semibold` |
| Clock | `seconds` | Seconds | As General, Show, Hide | `general` |
| Clock | `hours` | Hours | As General, 24 h, 12 h | `general` |
| Motion | `motion` | Animation | Lively, Smooth, Off | `lively` |
| Alerts | `collapseAfter` | Collapse alerts after | 0 to 600 s (0 = until tapped) | `0` |
| Alerts | `group` | Group notices | toggle | `false` |
| Dashboard notices | `notices.page`, `.layout`, `.plugins`, `.onAir`, `.calendar`, `.agents` | Page name, Layout updated, Plugin back, On air (OBS), Calendar countdown, Coding agents | toggles | all `false` |
| Dashboard notices | `calendarLead` | Count down from | minutes, up to 120 | `10` |

The "As General" tooltips still say "Dashboard › General › Clock" (`island-section.tsx:62,67`), a path
that no longer exists; the rows follow `general.showSeconds` and the themed `clock` (§5.6).

Profile actions: New profile, Import (a profile JSON), card ⋯ (Rename, Duplicate, Always open this
one, Export profile, Copy profile JSON, Delete), the "When the app opens" radio group (Best fit for
the window / Always the same profile; `DashboardConfig.activeProfile` holds `"auto"` or the profile
id). Delete is off with one profile left. Target: the rail's Profiles drawer
(`src/components/studio/profiles-panel.tsx`), where the selected card is the profile edited.

---

## 5. Dashboard config (`DashboardConfig`)

### 5.1 Overview

| Field | What | Default | Target |
|---|---|---|---|
| `version` | config schema, currently `9` (older clients are refused) | `9` | none |
| `activeProfile` | the profile displays open on: a profile id or `auto` | `auto` | Profiles drawer › When the app opens (§4) |
| `profiles` | see §4 | one blank profile (`main`, "Main display", 1920×1080, 12×6, scroll, one page) on a fresh install | Profiles drawer |
| `theme`, `radius` | dashboard theme colors and corner radius (§5.4) | `DEFAULT_THEME`, `0.5` rem | Look › Theme (All profiles) |
| `style` | the all-profiles widget style: the base layer of the theme (§5.2) | unset | Look › Widget style (All profiles); Theme page › All profiles |
| `background` | page background (§5.5) | unset (the theme background shows) | Look › Background (All profiles) |
| `general` | §5.6 | unset (defaults) | Look › Theme (font); Behaviour › Pages, Performance, Clock and date, Display |
| `dataApiUrl` | §5.7 | unset (`http://127.0.0.1:3921`) | Behaviour › Connection |
| `sourcePrefs` | §5.8 | unset | Data sources (rail) |
| `stylePresets`, `appearancePresets`, `panelPresets` | §6 | unset | see §6 |
| `alerts` | `enabled` (Alerts on, default on), `rules`, `quietHours` (`from` `23:00`, `to` `07:00`, `minSeverity` `critical` once set), `defaults` (`style` `toast`, `position` `top-right`, `backdrop` `none`, `size` `m`, `seconds` `8`; `src/lib/alerts.ts:143`) | unset | Alerts drawer (rail; `src/components/studio/alerts-panel.tsx`, `alerts-defaults.tsx`) |

The server's copy is `/api/config` (`src/lib/dashboard-server.ts:10`); the browser keeps an offline
copy under `infopanel-dashboard:config:v1` (`layout.ts:284`).

### 5.2 Widget style (`style`, `widgetTheme`; Look › Widget style and the rail Theme page)

The widget style is edited in two places that write the same stores.

**Look › Widget style** (`StyleBody`, `inspector/profile-look.tsx:174`), with an All profiles / This
profile switch: Skin (14 skins; picking one writes `surface = auto`), Saved looks (§5.3), Surface (17
materials, as swatches), Background opacity (`surfaceOpacity`, 0 to 100 %), Background blur (px)
(`blur`: Off, 4, 8, 16, 24, 40), Apply to every widget, and Edit widget style (opens the Theme page).

**Rail Theme page** (`theme-editor.tsx`, `theme-editor-settings.ts`, `theme-editor-model.ts`): a Scope
list and the same sections at that scope, in a 320 px inspector with the tabs Style · Data · Behaviour
(`THEME_TABS`, `inspector-model.ts:62`). Rows are `THEME_EDITOR_SETTINGS`: every themed standard row
(§1.2 and §1.3 themed keys, `accent`, `surface`), the palette roles, the four Units & format rows, the
thresholds of every quantity and `meterBallistics`. Sections: Style: Skin & graphics, Colors, Status &
series colors (the palette; rows Series 1 to 6, OK, Warning, Critical, default `""` = each widget's
own colour), Surface, Typography, Size & spacing, Border & glow, Custom CSS; Data: Units & format;
Behaviour: Thresholds, Motion. The middle column shows previews and "Who doesn't follow the theme"
(per section, the widgets of the page that are custom, with Reset to theme).

| Scope | Writes | Per-section control | Level |
|---|---|---|---|
| All profiles (Look switch; Theme page "All profiles", sub "Base layer · no locks") | `DashboardConfig.style` (`withScopeTheme` base, `theme-editor-model.ts:103`; `withScopeStyle`, `appearance-actions.ts:40`) | none (no locks) | Dashboard |
| This profile (Look switch; Theme page "Profile theme") | `MonitorProfile.widgetTheme.values` (`setProfileStyle`, `studio-actions.ts:448`) | Lock / Unlock per section (`widgetTheme.locks`); Lock all / Unlock all (`withLockAll`, `theme-editor-model.ts:142`); Look: Apply to every widget | Profile |
| A page (Theme page, one entry per page; page tab ⋯ › Theme…) | `ProfilePage.widgetTheme.values` and `follow` | Customize / Use profile per section (`withPageFollow`, `theme-editor-model.ts:146`) | Page |
| A widget (zone inspector Follow bars) | `Placement.follow`, `Placement.settings` | Customize / Use theme per section | Zone |

Default scope of a Look switch: All profiles, This profile when the profile already holds its own
value (`scopeOf`). Switching to This profile starts the profile's own values empty over the shared
style (`profileInScope`, `profile-scope.ts:52`); switching back drops them.

### 5.3 Saved looks (Appearance presets; Look › Widget style › Saved looks)

See §6.1.

### 5.4 Theme (`ThemeTokens`, `src/lib/theme.ts`; Look › Theme, `theme-panel.tsx`, `theme-rows.ts`)

All values are `"h s% l%"` triplets edited with a native color input (converted to hex and back).
Defaults are `DEFAULT_THEME` (the Zinc preset). Stored at **Dashboard** (`theme`, `radius`) with the
switch All profiles, or per **Profile** (`theme` partial, `radius`) with This profile (starting as a
copy of the dashboard's). Six tokens are shown, seven more behind **More** (`VISIBLE_TOKENS`,
`ADVANCED_TOKENS`, `theme-rows.ts:7,16`; DECISIONS #8).

| Key | Label in the editor | Shown | Default (Zinc) |
|---|---|---|---|
| `primary` | Primary | yes | `0 0% 98%` |
| `accent` | Accent | yes | `240 3.7% 15.9%` |
| `background` | Background | yes | `240 10% 3.9%` |
| `foreground` | Foreground | yes | `0 0% 98%` |
| `card` | Card | yes | `240 10% 3.9%` |
| `card-foreground` | Card text | yes | `0 0% 98%` |
| `primary-foreground` | Primary text | More | `240 5.9% 10%` |
| `secondary` | Secondary | More | `240 3.7% 15.9%` |
| `muted` | Muted | More | `240 3.7% 15.9%` |
| `muted-foreground` | Muted text | More | `240 5% 64.9%` |
| `destructive` | Destructive | More | `0 62.8% 30.6%` |
| `border` | Border | More | `240 3.7% 15.9%` |
| `ring` | Ring | More | `240 4.9% 83.9%` |
| `popover`, `popover-foreground`, `secondary-foreground`, `accent-foreground`, `destructive-foreground`, `input` | not in the editor (set only by theme presets) | no | `240 10% 3.9%`, `0 0% 98%`, `0 0% 98%`, `0 0% 98%`, `0 0% 98%`, `240 3.7% 15.9%` |

| Control | Label | Control type | Range / options | Default |
|---|---|---|---|---|
| `radius` | Corners (rem; hint: a widget's own Corner radius wins) | slider | 0 to 1.5 step 0.05 | `0.5` |
| theme preset | swatches (`THEME_PRESETS`, `theme.ts:68`) | 6: Zinc, Neutral, Slate, Ocean, Forest, Paper (light); changes colors only, not corners | | Zinc |
| `general.font` | Font (also in Look › Theme, but global; §5.6) | select | `FONT_CATALOG` (26 incl. System) | `system` |

An "edited" tag shows when the tokens match no preset. The switch's note reads "Shared by all N
profiles" or "Only <name> uses this".

### 5.5 Page background (`PageBackground`, `src/lib/appearance.ts`; Look › Background; `background-editor.tsx`, `background-video.tsx`)

Stored at **Dashboard** (`background`, switch All profiles) and per **Profile** (`background`, switch
This profile; `{ type: "none" }` = explicitly none; unset = inherit; `withBackground`,
`appearance.ts:184`). Sparse; unset fields use the defaults below. Fit, Position, Fill, Tint, Tint
opacity and Blur (and the video options) are behind **More**.

| Field | Label | Control | Options / range | Default | Visible when |
|---|---|---|---|---|---|
| scope | All profiles / This profile | segmented (section header) | | All profiles (This profile when the profile has its own) | always |
| `type` | Type | segmented | none (None), color (Color), gradient (Gradient), image (Image), video (Video) | `none` | always |
| `color` | Color / Fill (behind the image) / Fill (behind the video) | color | | `#0b0b0f` | color; image, video (letterbox fill, More) |
| `gradient.from`, `gradient.to` | From, To | 2 colors | | `#1e1b4b`, `#0b0b0f` | gradient |
| `gradient.angle` | Angle (°) | slider 0 to 359 | | `160` | gradient |
| `src` | Image / Video | media field: URL, Upload, drop, Library, preview | http(s), server path, `data:` image | unset (an image/video with no file shows its fill color) | image, video |
| `poster` | Poster image | media field (More) | | unset | video |
| `loop` | Loop | toggle (More) | | `true` | video |
| `muted` | Muted | toggle (More) | | `true` | video |
| `rate` | Speed | segmented (More) | 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2× (a stored other rate is added) | `1` | video |
| `fit` | Fit | segmented (More) | Cover, Contain, Stretch, Center, Tile (video: no Tile) | `cover` | image, video |
| `position.x`, `position.y` | Position | 3×3 align grid (More) | start / center / end | `center` / `center` | image, video, when `fit` is not stretch |
| `dim` | Dim | slider 0 to 100 % | | `0` | gradient, image, video |
| `tint` | Tint | color (More) | setting it sets `tintOpacity` to 30 when it is 0 | `#000000` | gradient, image, video |
| `tintOpacity` | Tint opacity | slider 0 to 100 % (More) | | `0` | same |
| `blur` | Blur | slider 0 to 40 px (More) | | `0` | same |

Behaviours that are not settings: a video pauses when the page is hidden and shows only its poster
under reduced motion (Behaviour › Performance › Animations).

### 5.6 General (`DashboardConfig.general`; `src/lib/general.ts`)

Only changed keys are stored (`withGeneral`). Every one is global: the Look and Behaviour tabs show
it with a note "Applies to all profiles" (the Font under the Theme switch included), except the
Performance pair, which a profile can override.

| Key | Label | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `font` | Font | select | `FONT_CATALOG` (26): System, Sans, Rounded, Serif, Mono and 21 web fonts | `system` | General | Look › Theme (always global, whatever the switch says) |
| `showSeconds` | Show seconds | toggle | | `true` | General | Behaviour › Clock and date |
| `locale` | Date locale | select | System (`""`), plus 14 locales (`COMMON_LOCALES`, `general.ts:128`: en-US, en-GB, de-DE, de-CH, fr-FR, it-IT, es-ES, nl-NL, sv-SE, nb-NO, pl-PL, pt-BR, ja-JP, zh-CN), shown as `<name> · <tag>`; a saved unknown locale is added | `""` | General | Behaviour › Clock and date |
| `maxFps` | Frame rate limit | segmented | 5, 15, 30, 60, No limit (`0`) | `60` | General (profile `performance.maxFps` overrides) | Behaviour › Performance |
| `motion` | Animations | segmented | system (Follow system), reduce (Reduced), full (Full) | `system` | General (profile `performance.motion` overrides) | Behaviour › Performance |
| `hideCursor` | Hide cursor in kiosk mode | toggle | | `false` | General | Behaviour › Display |
| `kioskPageNav` | Page dots and swipe | toggle | | `false` | General | Behaviour › Pages |
| *(themed `clock`, in `DashboardConfig.style`)* | Clock | segmented | auto (Locale), 24 (24 h), 12 (12 h) | `auto` (unset) | Dashboard (all-profiles style; was `general.hour12` before v7) | Behaviour › Clock and date |

Resolution of the performance pair (`src/lib/performance.ts:54`): kiosk URL (`&fps=`, `&animations=0`,
`&motion=`) over the profile's `performance`, over `general`, over the default. This profile on the
Performance switch starts from the shared values (`profile-scope.ts:60`).

The "Studio" section (Quick bar, Inspector sections) has no stored setting in the config: see §7.

### 5.7 Connection (`dataApiUrl`; Behaviour › Connection; `data-api-panel.tsx`)

| Field | Label | Control | Notes | Default | Level | Target |
|---|---|---|---|---|---|---|
| `dataApiUrl` | Data API URL (hint: where the dashboard reads sensor data from) | text; commits on Enter or blur; red text "Enter an http(s) URL." when invalid | `normalizeApiBase`; stored only when changed | `http://127.0.0.1:3921` | Dashboard | Behaviour › Connection |
| (action) | Test connection | button, shows testing / connected / not reachable | | | UI | same |
| (link) | Open API index | link to `<base>/` | | | UI | same |

### 5.8 Source preferences (`sourcePrefs`; the Data explorer, `sources-panel.tsx`, `explorer/`)

Key = `{plugin}::{container}` (`""` container for flat sources). Stored at **Dashboard**. Nothing
outside the Data explorer reads `sourcePrefs` (no kiosk or widget consumer; open question 12).

| Field | Label | Control | Default | Target |
|---|---|---|---|---|
| `enabled` | Show in dashboard (group summary: one Toggle per container; the source tree menu: Show in dashboard / Hide in dashboard) | toggle | `true` (stored only when changed) | Data sources › group summary (`explorer/group-summary.tsx:75`), tree row menu (`explorer/source-tree.tsx:91`) |
| `displayName` | Display name (placeholder = the container's title) | text | unset | same |
| bind / unbind | Bind / Unbind in the point inspector and the point table | button | n/a | Data sources › point inspector; Data tab › Bound data |

Bind (`bindPoint`, `src/lib/data-usage.ts:160`) writes a panel widget's `sensor`, or, on a widget zone
whose module has a source select for the key's plugin, that setting (a `multiple` one gains the
container in its comma-separated list); any other module has no per-key binding and nothing changes.

---

## 6. Presets and saved items

### 6.1 Appearance presets (Saved looks; `appearancePresets`, `src/lib/appearance-presets.ts`)

Shape: `{ id, name, description, theme (tokens or preset name), radius, style (themed keys),
background? }`. All are the user's: the built-in looks were removed (the skin gallery replaced them);
the `builtin:` id prefix stays reserved (`isBuiltinPreset`, `appearance-presets.ts:35-39`). Stored:
**Dashboard** (`DashboardConfig.appearancePresets`).

| Control | Label | Control type | Default | Target |
|---|---|---|---|---|
| Gallery card | (preview, name) | click applies to the section's scope (All profiles or This profile): the theme, corners, style and (optionally) background | | Look › Widget style › Saved looks |
| Replace the page background | toggle (hint: otherwise a preset's background is only set where there is none) | | off | same |
| Save current look as preset | name input (label "Look name"), Enter saves | | | same |
| Saved look menu | Rename…, Delete | | | same |
| Overrides banner | "N widgets keep their own style · N profiles have their own look", Make them follow, Dismiss | | | same |

An apply is one undo step (`useAppearancePresets`, `use-appearance-presets.ts:50-55`). A profile
apply writes the profile's `theme`, `radius`, `widgetTheme.values` and `background`
(`applyAppearancePreset`, `src/lib/appearance-preset-apply.ts:69`).

### 6.2 Style presets (`stylePresets`: `{ id, name, settings }`)

Look keys only (`PROFILE_STYLE_KEYS`, §1.5). Stored: **Dashboard**. Controls: zone Style › Colors "…"
menu: Apply preset (submenu), Save as preset… (name input), Delete preset (submenu). Target: Style ›
Colors.

### 6.3 Saved panels (`panelPresets`: `UserPanelPreset`)

`{ id, name, panel (PanelDef), settings? (the panel look), colSpan?, rowSpan? }`. Stored:
**Dashboard**; shared by all profiles; exported with the config; each use is a fresh copy. Controls:
Save as panel preset… (the panel header's "…"), zone menu "Save to My panels"
(`zone-menu.ts:84`), the Widgets drawer's My panels (Rename…, Delete on each row; `insert-panel.tsx`).

### 6.4 Built-in panel presets and layout starters (code, not config)

Panel presets (`src/lib/panelPresets.ts`): Blank panel, System, RAM, CPU, GPU, FPS gauges, Steam,
Weather, Network, Clock. Layout starters (`src/lib/panel-starters.ts`): Row of stats, 2×2 stats, Hero
overlay, Gauge row, Clock + date, Label / value list. Theme token presets: §5.4. Skins: §1.2.

---

## 7. Studio UI preferences (Browser, `localStorage`, not exported)

| Key | What | Values | Default | Target |
|---|---|---|---|---|
| `studio.dockCollapsed` | Docked inspector collapsed (Ctrl+\) (`use-studio-layout.ts:15`) | `1` / unset | expanded | the inspector's collapse tab; Ctrl+\ |
| `studio.quickBar` | Quick bar shown (`inspector-prefs.ts:110`) | `true` / `false` | `true` | Behaviour › Studio › Quick bar |
| `studio.accordion` | Inspector sections: one open or many (`inspector-prefs.ts:111`) | one, many | `one` | Behaviour › Studio › Inspector sections |
| `studio.quickPins` | Pinned quick-bar settings per widget type, max 6 (`inspector-prefs.ts:112`) | map | unset (a default set applies) | Pin button on each inspector row |
| `studio.inspectorTabs` | The open inspector tab per context (`inspector-prefs.ts:9`) | map | the first tab | the tab strip |
| `studio.drawer` | Open left drawer (`left-rail.tsx:73`) | add, layers, profiles, island, alerts, none | `add` | Rail |
| `studio.drawerWidth` | Dragged left drawer width (`left-rail.tsx:23`) | px | the least | the drawer's edge |
| `studio.pinnedProfile` | The profile the studio edits: the selected card (`pinned-profile.ts:7`) | profile id | the profile the window size picks | Profiles drawer |
| `studio.grid`, `studio.rulers` | Canvas grid and rulers shown (`use-studio-ui.ts:39-40`) | `1` / `0` | `1` | zoom bar |
| `studio.zoom` | Canvas zoom: `fit` or a factor 0.25 to 2 (`zoom-pref.ts:2`) | | `fit` | zoom bar |
| `studio.tipDismissed` | First-run tips card dismissed (`quick-tips.ts:2`) | `1` | unset | the tips card |
| `infopanel.studio.profile-shots` | Profile thumbnail cache (`src/lib/profile-shot-cache.ts:13`) | map | unset | Profiles drawer (automatic) |
| `infopanel-dashboard:config:v1` | The offline copy of the config (`layout.ts:284`) | config JSON | | automatic |
| session only | Style clipboard (Copy style), widget clipboard (Copy), settings search text | | | Not persisted |

Retired: `studio.layout` (inspector position; DECISIONS #15), `studio.inspectorAdvanced` (dropped on
load, `inspector-prefs.ts:97`).

---

## 7a. Desktop app settings (InfoPanel Studio; `settings.json`, not in the config)

Kept by the desktop app, not by the studio: `%APPDATA%\dev.f3nn3x.infopanel-studio\settings.json`
(see [desktop/README.md](desktop/README.md); layout version 2, `SETTINGS_VERSION`,
`src-tauri/src/settings.rs:10`). Edited in the app's Settings window (`src/settings/`; the rail's
Settings button, desktop only, and the profile inspector's footer "Server, updates and startup are in
App settings"). The window's sections: General, Server, Coding agents, Updates, Diagnostics, Logs,
About, Changelog. Missing or invalid keys fall back to their default (`load_from_str`,
`settings.rs:286`); each write is validated (`with_setting`, `settings.rs:185`); a v1 `host` becomes
`listen` on load.

| Key | Label | Values | Default | Target |
|---|---|---|---|---|
| `zoom` | App zoom (steps; Ctrl + / Ctrl − / Ctrl 0) | 80, 90, 100, 110, 125, 150 % | `100` | Settings › General › Appearance |
| `startAtLogin` | Start at login | boolean | `true` | Settings › General › Startup |
| `openStudioOnLaunch` | Open the studio on launch | boolean | `true` | Settings › General › Startup |
| `startServer` | Start the server on launch | boolean | `true` | Settings › General › Startup |
| `closeToTray` | Close to tray | boolean | `true` | Settings › General › Window |
| `rememberBounds` | Remember window size and position | boolean | `true` | Settings › General › Window |
| `listen` | Who can connect (becomes `HOST`: `127.0.0.1` or `0.0.0.0`) | `local` (This computer only), `lan` (Local network) | `local` | Settings › Server › Network |
| `port` | Port (becomes `PORT`) | 1024 to 65535 | `3922` | Settings › Server › Network |
| `allowedHosts` | Allowed host names (`ALLOWED_HOSTS`; request guard) | list, or a comma-separated string; letters, digits, `.`, `-`, `:`, `[`, `]` | empty | Settings › Server › Network (only while `listen` is `lan`) |
| `autoRestart` | Restart automatically if it crashes (3 tries a minute) | boolean | `true` | Settings › Server › Network |
| `updateChannel` | Release channel | `stable` (Stable), `beta` (Beta) | `stable` | Settings › Updates |
| `checkForUpdates` | Check for updates at startup | boolean | `true` | Settings › Updates |
| `autoDownload` | Download in the background | boolean | `false` | Settings › Updates |
| `agents.enabled` | Connect coding agents (Claude Code and Codex hooks installed by the app) | boolean | `false` | Settings › Coding agents |
| `debug` | Debug mode (debug logging and leak sampling; also `--debug`, `INFOPANEL_STUDIO_DEBUG=1`) | boolean | `false` | Settings › Diagnostics |
| `version`, `agents.installed`, `closeWarningShown` | Bookkeeping: file layout, what the hooks were last written for, the one-time close warning | | | Not edited by hand |

The server's own environment variables (`PORT`, `HOST`, `ALLOWED_HOSTS`, `DASHBOARD_DIST`,
`DASHBOARD_DATA_DIR`, `DASHBOARD_DEBUG`) are in [development.md](development.md); the app sets
`PORT`, `HOST`, `ALLOWED_HOSTS` and `DASHBOARD_DEBUG` from these keys (`src-tauri/src/sidecar.rs:36-40`).

---

## 7b. Live state (server, not config)

Runtime state the server holds (`server/control.mjs`, `src/lib/control.ts`): kiosks and the studio read
it over one SSE stream (`/events/control`) and write it with `POST /api/control/<action>`. None of it
is config, so none of it enters undo or the exported config. The durable part is saved to
`control.json`: `mutedUntil`, the dim levels, `islandOverride` (`control.mjs:30`); the rest is
runtime only.

| State | What | Actions (`ControlAction`) | Studio UI |
|---|---|---|---|
| page shown per profile (`pages`) | the page a kiosk shows | `page` (id, `next`, `prev`) | yes: page tab ⋯ › Show on kiosk (`studio-view.tsx:499`); the kiosk's page dots and swipe |
| profile override (`profile`) | a profile every kiosk shows regardless of the window | `profile` | none |
| profile shown (`shown`) | the profile a kiosk last reported | `shown` (kiosk only) | none |
| rotation override (`override`) | page cycling on or off over the saved `rotate` | `rotate` (`on`, `off`, `toggle`, `saved`), `touch` (a touch pauses it 30 s) | yes: the page strip's Play / Pause with "Back to the saved setting" (`studio-view.tsx:503-504`); long-press the kiosk dots |
| active alerts (`alerts`) | what the alert engine holds, with acknowledge | `alert` (`ack`, `dismiss`, `test`) | yes: Alerts drawer › Active now (`alerts-live.tsx:55`); tap on the kiosk |
| alert mute (`mutedUntil`) | alerts muted until a time (0 to 1440 minutes) | `alert` `{ action: "mute", minutes }` | none |
| reload counters (`reload`, `reloads`) | a kiosk reloads when its counter grows | `kiosk` `reload` | none |
| dim (`dim`, per profile) | a black veil over the page and island (0.1 to 0.9, default 0.6) | `kiosk` `dim` (`on`, `off`, `toggle`, `level`) | none (the kiosk renders it) |
| island override (`islandOverride`) | show or hide the island over the saved `island.enabled` | `kiosk` `island` (`on`, `off`, `toggle`, `saved`) | none |

The Stream Deck plugin and the server's HTTP API are the other writers (`docs/redesign/streamdeck/`).

---

## 8. Open placement questions

Kept as the historical record of the Phase 0 inventory. The answers are in
[redesign/DECISIONS.md](redesign/DECISIONS.md) (its numbers 1 to 15 are these questions).

1. **`preset` (Default / Dark / Light / Vivid / Mono).** A per-widget quick look that bundles
   `surface`, `tint` and `accent`. FEATURE_MAP lists "Style preset" (the saved named styles), not
   this key. Proposed: S › Colors & surface, next to Surface. It is not a look key, so it is not
   available in Global style. *Answered: DECISIONS.md #1.*
2. **`layout` on non-adaptive widgets.** The spec says Layout appears only for adaptive widgets
   (Spotify, Media, Hardware, Audio, Bluetooth). In the code all 11 modern widgets declare it and all
   11 read `cfg.layout`. Either keep it on all 11 (no feature loss) or restrict it (a behaviour change).
   *Answered: DECISIONS.md #2.*
3. **Audio `source` and Wave Link `source`.** They are data selections (device, meters), but
   FEATURE_MAP puts Audio "Content (device, ...)" and Wave Link "Content (meters to show, ...)". Sources
   mode also writes Audio's `source` through Bind. Candidates: C › Content, or D › Bound data. The
   inventory follows FEATURE_MAP (C) and flags it. *Answered: DECISIONS.md #3.*
4. **Colour pickers inside a Content category.** Audio's Meter colours (`levelColor`, `hotColor`) and
   Wave Link's (`liveColor`, `muteColor`) sit in the same "Meter" group as non-colour settings.
   FEATURE_MAP says "Meter (...; colours Adv) → C"; DATA_MODEL §2 says colour-picker categories go to
   S (Adv). The five other colour groups (Device, Dot, Gauge, Battery, Speed) are unambiguous.
   *Answered: DECISIONS.md #4.*
5. **Web Page style.** The spec says the style tab is reduced to Colors & surface, Border & effects
   and Advanced. The code exposes `scale` (Size & alignment), `radius` (Spacing & shape), `accent`,
   and the four edge keys, and no `customCss` (so no Advanced section). Decide whether Size and
   corner radius stay (no feature loss) and whether to add `customCss`. *Answered: DECISIONS.md #5.*
6. **Panel `css`, `PanelDef.title`/`titleVisible`/`accent`/`background`/`visible`.** There is no
   dedicated field for `PanelDef.css` today; it is only reachable in the Code view, and panel CSS is
   scoped with the zone's `customCss` otherwise. The legacy fields are kept for old builds. Proposed:
   leave them to the Code view; expose a panel CSS field under S › Advanced only if wanted.
   *Answered: DECISIONS.md #6.*
7. **Theme tokens not in the editor.** `popover`, `popover-foreground`, `secondary-foreground`,
   `accent-foreground`, `destructive-foreground`, `input` are in the config and presets but have no
   editor row. Keep unreachable (as today) or add them under Adv. *Answered: DECISIONS.md #7.*
8. **Which theme tokens are Adv.** The spec says "primary/accent visible, other tokens under
   Advanced". The inventory marks `background`, `foreground`, `card`, `card-foreground`, `primary`,
   `accent` as visible and the rest of the 13 as Adv; adjust if "Background" and "Foreground" should
   also be Adv. *Answered: DECISIONS.md #8.*
9. **Zone frame for panels.** `design.background` is hidden for panels; accent and title header
   remain. Panels already have `accent`, `title` and `surface`, so the zone frame accent and header may
   duplicate them. Kept (no feature loss), under S › Border & effects › Zone frame (Adv).
   *Answered: DECISIONS.md #9.*
10. **Follow vs edit.** DATA_MODEL says editing a look value on Follow switches the zone to Custom.
    The code locks the rows (read-only) and offers "Customize" / the Custom segment instead. The
    registry needs to pick one. *Answered: DECISIONS.md #10.*
11. **`glowColor` visibility.** Spec: shown only when glow is not none. Code: always shown. Treat as
    a `visibleIf` added in Phase 2. *Answered: DECISIONS.md #11.*
12. **`sourcePrefs`.** `enabled` ("Show in dashboard") and `displayName` are stored but nothing outside
    the Sources panel reads them today (no kiosk or widget consumer). The redesign keeps them in
    Sources mode; confirm whether they should start to take effect. *Answered: DECISIONS.md #12.*
13. **Hide when idle.** Removed from every widget (a stored `hideWhenIdle` is ignored).
    *Answered: DECISIONS.md #13 (superseded: removed from every widget).*
14. **Magic wand.** FEATURE_MAP §5 lists a zoom-bar "Magic wand" with "same action". The only wand in
    the code is the **Auto** layout-mode icon (and the Auto profile entry); there is no canvas
    auto-arrange action. Confirm the intended action before building it. *Answered: DECISIONS.md #14.*
15. **"Studio" settings.** DATA_MODEL §7 puts "Studio" under General. Its switches (Quick bar,
    Inspector sections) are `localStorage` preferences (`studio.quickBar`, `studio.accordion`), not
    config fields: keep them Browser-level. The old inspector position (`studio.layout`) is gone.
    *Answered: DECISIONS.md #15 (superseded: `studio.layout` removed).*

---

## 9. Where each surface writes

UI surface (exact label) → the scope it writes → the code that writes it. The label is the one the
studio shows; "All profiles / This profile" is the section's own switch.

| UI surface | Scope written | Code |
|---|---|---|
| Look › Theme › color rows, theme swatches (All profiles) | `DashboardConfig.theme` | `use-document-props.ts:82-83`, `:50-53` |
| Look › Theme › color rows, theme swatches (This profile) | `MonitorProfile.theme` | `use-document-props.ts:56-57` |
| Look › Theme › Corners (rem) | `DashboardConfig.radius`, or `MonitorProfile.radius` | `use-document-props.ts:64-65`, `profile-scope.ts:79` |
| Look › Theme › Font (either switch value) | `general.font` (global) | `document-inspector.tsx:235`, `use-document-props.ts:75-76` |
| All profiles / This profile switch of Theme, Widget style, Background, Performance | adds or drops the profile's own `theme` + `radius`, `widgetTheme.values`, `background`, `performance` | `use-document-props.ts:60-61`, `profile-scope.ts:74` |
| Look › Widget style (Skin, Surface, Background opacity, Background blur) | `DashboardConfig.style`, or `MonitorProfile.widgetTheme.values` | `use-document-props.ts:39-40`, `appearance-actions.ts:40`, `studio-actions.ts:448` |
| Look › Widget style › Apply to every widget | `MonitorProfile.widgetTheme.locks` (all 11 sections) | `use-document-props.ts:72`, `profile-scope.ts:102` |
| Look › Widget style › Saved looks (card, Save current look as preset, Rename…, Delete) | applies theme, radius, style, background to the scope; saves `DashboardConfig.appearancePresets` | `use-appearance-presets.ts:50-55` |
| Look › Background | `DashboardConfig.background`, or `MonitorProfile.background` | `use-document-props.ts:45-48`, `appearance.ts:184` |
| Layout › Screen (Name, Design size, Width, Height, When it doesn't fit) | `MonitorProfile` fields | `profile-layout.tsx:101` |
| Layout › Grid (Columns, Rows, Gap, Edge padding) | `MonitorProfile.cols`, `rows`, `gap`, `padding` | `profile-layout.tsx:251-258` |
| Behaviour › Pages (drag, Add page, Delete) and the page tab strip | `MonitorProfile.pages` | `use-studio-mutations.ts:311-340` |
| Behaviour › Pages (Cycle through pages, Switch every, Seconds, Pages) | `MonitorProfile.rotate` | `use-studio-mutations.ts:366` |
| Behaviour › Pages › Page dots and swipe | `general.kioskPageNav` (global) | `document-inspector.tsx:285` |
| Behaviour › Dynamic Island, and the rail's Dynamic Island drawer | `MonitorProfile.island` | `document-inspector.tsx:298`, `island-panel.tsx:43`, `island/config.ts:204` |
| Behaviour › Performance (Frame rate limit, Animations): All profiles | `general.maxFps`, `general.motion` | `profile-behaviour.tsx:254,261` |
| Behaviour › Performance: This profile | `MonitorProfile.performance` | `use-document-props.ts:68-69` |
| Behaviour › Clock and date › Clock | `DashboardConfig.style.clock` (all-profiles style) | `document-inspector.tsx:186-187` |
| Behaviour › Clock and date › Show seconds, Date locale | `general.showSeconds`, `general.locale` | `profile-behaviour.tsx:306,312` |
| Behaviour › Display › Hide cursor in kiosk mode | `general.hideCursor` | `document-inspector.tsx:323` |
| Behaviour › Studio › Quick bar, Inspector sections | Browser `studio.quickBar`, `studio.accordion` | `inspector-prefs.ts:158-159` |
| Behaviour › Connection › Data API URL | `DashboardConfig.dataApiUrl` | `use-document-props.ts:99` |
| Rail › Theme: Scope All profiles | `DashboardConfig.style` | `theme-editor-model.ts:103` |
| Rail › Theme: Scope Profile theme (rows, Lock, Lock all) | `MonitorProfile.widgetTheme` (`values`, `locks`) | `theme-editor-model.ts:103,138,142` |
| Rail › Theme: a page scope (rows, Customize, Use profile); page tab ⋯ › Theme… | `ProfilePage.widgetTheme` (`values`, `follow`) | `theme-editor-model.ts:103,146` |
| Rail › Theme › Reset to theme | `Placement.follow` (the zones follow again) | `theme-editor-model.ts:155` |
| Zone inspector rows (Show, Style, Data, Behaviour) | `Placement.settings` | `use-studio-mutations.ts:84-90`, `studio-inspector.tsx:121` |
| Zone inspector Follow bar: Customize, Use theme | `Placement.follow[section]` | `zone-fields.ts:62` |
| Zone Style › Colors "…" › Use as global… (All profiles / This profile) | `DashboardConfig.style`, or `widgetTheme.values` | `studio-inspector.tsx:125` |
| Zone Style › Colors "…" › Save as preset…, Delete preset | `DashboardConfig.stylePresets` | `use-studio-mutations.ts:407-415` |
| Zone Style › Border & glow › More › Frame accent, Frame background, Frame title header | `Placement.design` | `zone-inspector.tsx:274-283` |
| Zone Show › Panel, Layout, Background, Widgets; panel widget rows | `Placement.panel` | `panel-layout-section.tsx`, `inspector/item-model.ts` |
| Panel "…" › Save as panel preset…; zone menu › Save to My panels | `DashboardConfig.panelPresets` | `use-studio-mutations.ts:169-178` |
| Page tab ⋯ › Rename, Icon… | `ProfilePage.name`, `ProfilePage.icon` | `use-studio-mutations.ts:339-340` |
| Page tab ⋯ › Show on kiosk; Play / Pause | live: control channel `page`, `rotate` | `studio-view.tsx:499,503` |
| Profiles drawer › When the app opens, card ⋯ › Always open this one | `DashboardConfig.activeProfile` | `use-studio-mutations.ts:405`, `profiles-panel.tsx:451` |
| Profiles drawer › card click | Browser `studio.pinnedProfile` | `pinned-profile.ts:30` |
| Data sources › Show in dashboard, Display name | `DashboardConfig.sourcePrefs` | `sources-panel.tsx:171-175` |
| Data sources › Bind, Unbind | a zone's source setting, or a panel widget's `sensor` | `sources-panel.tsx:138-153`, `data-usage.ts:160` |
| Alerts drawer (Alerts on, Global defaults, rules) | `DashboardConfig.alerts` | `alerts-model.ts:34-70` |
| Alerts drawer › Active now (Acknowledge, Dismiss) | live: control channel `alert` | `alerts-live.tsx:55-60` |
| Rail, zoom bar, inspector collapse, first-run tips | Browser `studio.drawer`, `studio.drawerWidth`, `studio.grid`, `studio.rulers`, `studio.zoom`, `studio.dockCollapsed`, `studio.tipDismissed` | `left-rail.tsx:73,23`, `use-studio-ui.ts:39-40`, `zoom-pref.ts:2`, `use-studio-layout.ts:15`, `quick-tips.ts:2` |
| Settings window (App zoom, Start at login, Port, Release channel, ...) | Desktop `settings.json` | `src/settings/store.tsx:162`, `src-tauri/src/settings.rs:185` |
