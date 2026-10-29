# Settings inventory

Every setting the studio edits today, read from the code (config v11, `CONFIG_VERSION` at
`src/lib/layout.ts:233`). Other docs cite it by section number (`redesign/DECISIONS.md` cites §8,
`redesign/FEATURE_MAP.md` cites §3.3 and questions 2, 5 and 7), so the numbering and headings 1 to 8 stay. The
prototype was not used as a source.

> **Where things are edited:** a screen's size, grid, rotation, pages and performance in Screens; a zone and
> the page in Design; the look every level inherits in Theme; saved Themes, Styles and Panels in Library;
> sensors and the Data API URL in Data; alerts and the island in Alerts & Island; global preferences in
> Settings (Dashboard, Studio and the App pages). Where each setting sat in the older surfaces is mapped in
> [`redesign/settings-ia/IA_AUDIT.md`](redesign/settings-ia/IA_AUDIT.md) and
> [`redesign/settings-ia/STATUS.md`](redesign/settings-ia/STATUS.md). Zones have no `preset` key (dropped in
> config v10); a sensor alert's checks are a `conditions` list (v11, see §5, `alerts`).
> `MonitorProfile.font` (the screen's page font) is optional.

Companion docs: `docs/redesign/DATA_MODEL.md` (what exists), `docs/redesign/FEATURE_MAP.md` (where
it lives), `docs/redesign/DECISIONS.md` (the answers to §8), `docs/redesign/IMPLEMENTATION_PLAN.md`.

> **Per-widget keys are in [widget-settings.md](widget-settings.md)** (the schema, the standard block,
> the themed sections) and [module-catalog.md](module-catalog.md) (what each widget reads). They are
> the settings of widget settings v2 (config v6 to v9; [STATUS](redesign/widget-settings-v2/STATUS.md)).
> The v2 names: `variant` + `compactView` → `compact`, `layout` → `sizeTier`, `alignX` + `alignY` →
> `align` (+ `alignSpread`), thresholds → `warn.<q>` / `crit.<q>`, device keys → `device`, `autoScale`
> dropped, `styleMode` → `Placement.follow` per section, `style` / `styleEnforce` → `widgetTheme`
> (values and locks), `general.hour12` → the themed `clock`. `src/lib/settings-migrate.ts` maps the old
> names on load. Config v12: the audio widgets' single `device` (Volume Mixer, Visualizer, Now Playing's
> visualizer) becomes the multi-device `devices` (`vizDevices`), and every audio widget gets `flow`
> (Show: all / output / input), see [widget-settings.md](widget-settings.md#audio-devices-inputs-and-outputs-config-v12).
> §1 to §3 below list the shared and panel keys as the inspector shows them today.

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

**Target** = where the setting lives in the studio, as view › tab › section. A zone (widget or panel) has four
inspector tabs in Design: **Show**, **Style**, **Data**, **Behaviour** (`TAB_LABELS`,
`src/components/studio/inspector-model.ts:50`). With nothing selected the inspector is the page's
(`page-inspector.tsx`, §4); a screen's own settings are in **Screens**, the look every level inherits in
**Theme**, and preferences in **Settings** (§5.6, §7). A section's rows behind its **More (n)** link are
marked **(More)**. The old tab names Content, Profile, Appearance and General are stored-tab aliases only
(`RENAMED_TABS`, `src/components/studio/inspector/inspector-prefs.ts:15`). **Theme** is the home of the widget
style at every level (§5.2).

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
`type`, `colors`, `format`, `thresholds`; `src/lib/panel-model.ts:44-49`). Color tokens and corner
radius have two levels only (dashboard, profile; `resolveTheme`, `src/lib/theme.ts:254`); the page
font has the same two (`resolveFont`, §5.6). Source-dot states on a row (`DOT_MEANING`,
`src/components/studio/inspector/source-dot.tsx:15`):
default, dashboard (all-profiles style), profile, here (set here), overriding (set here over a global
value), ignored (set here, its section follows the theme).

---

## 1. Shared general settings (`src/modules/standard-settings.ts`)

Which block each zone type spreads (the inspector builds the shared sections from it):

| Zone type | Settings it gets |
|---|---|
| Template widgets | `STANDARD_SETTINGS` (§1.1 to §1.4), then the widget's own sections. Web Page takes only the sections its `styleSubset` names (`colors:accent`, `spacing:scale,radius`, `border`; `src/widgets/registry/inspector-meta.ts:82`) |
| **Other sensors** (`cards`) | `CARD_SETTINGS`: `surface` (default **Theme**), `accent`, all of `STYLE_SETTINGS`, all of `SURFACE_SETTINGS`. No `showTitle`, `label`, `icon`, `compact`, `sizeTier`, `background`, `backgroundOn` |
| Custom panel | `PANEL_SETTINGS` (§1.6) |
| Blank zone | none; the Show tab has a Widget section (pick a widget) and Zone frame (`blankSections`, `inspector-model.ts`) |
| Canvas zone (`infopanel`, an imported InfoPanel profile) | no `settings`; the selected item's fields come from the InfoPanel schema (`kind: "infopanel"` context) |

The shared sections and their tab (`SHARED_SECTIONS`, `src/components/studio/inspector-categories.ts:31`):
Show: Header, Fit. Style: Skin, Colors, Widget colors, Typography, Shape & spacing, Surface & effects,
Border & glow, Advanced · CSS & locks. Data: Units & format. Behaviour: Thresholds, Motion, Send to island.

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
| `skin` | Skin | select | Auto + the 14 skins: default, tui, macos, fluent, hud, ink, retro, ios, android, synth, brutal, cyber, nixie, instrument (`SKIN_PACKS`, `src/widgets/core/theme.ts:23`); picking one writes `surface = auto` | `auto` | Zone, themed | Style › Skin |
| `stroke` | Ring / bar thickness (%) | slider 50 to 250 step 10 | | `100` | same | Style › Skin |
| `graph` | Graph style | select | auto, area, line, step, bars, dots, braille | `auto` | same | Style › Skin (More) |
| `meter` | Meter style | select | auto, bar, pill, segments, blocks, hair, wave, square | `auto` | same | Style › Skin (More) |
| `textColor` | Text color | color | | `""` | same | Style › Colors |
| `mutedColor` | Secondary text color | color | | `""` | same | Style › Colors |
| `font` | Font | select | Theme (`auto`) + the 25 fonts of `FONT_CATALOG` except System (`src/lib/fonts.ts`: sans, rounded, serif, mono and 21 web fonts) | `auto` | same | Style › Typography |
| `fontWeight` | Value weight | select | auto, 400 Regular, 500 Medium, 600 Semibold, 700 Bold, 800 Heavy | `auto` | same | Style › Typography |
| `labelCase` | Label case | select | auto, UPPERCASE, As written (`none`), Capitalized | `auto` | same | Style › Typography |
| `scale` | Size (%) | slider 50 to 200 step 5 | | `100` | same | Style › Shape & spacing |
| `align` + `alignSpread` | Alignment | 3×3 align grid (cell codes `tl` to `br`) + Spread | `auto` or a cell; Spread on/off | `auto` / `false` | same | Style › Shape & spacing |
| `padding` | Inner padding | select | auto, 0, 4, 8, 12, 16, 20, 24, 32, 48 px | `auto` | same | Style › Shape & spacing |
| `gap` | Gap between items | select | auto, 0, 4, 8, 12, 16, 24, 32, 48 px | `auto` | same | Style › Shape & spacing |
| `radius` | Corner radius | select | auto, 0, 4, 8, 12, 16, 20, 28 px, Pill (`999`) | `auto` | same | Style › Shape & spacing |
| `customCss` | Custom CSS (@scope, :scope = root) | textarea | | `""` | same | Style › Advanced · CSS & locks (More; in Theme not behind More) |
| `smoothing` | Graph updates | select | stepped (Stepped), smooth (Smooth) | `stepped` | same | Behaviour › Motion |

### 1.3 Surface and edge (`SURFACE_SETTINGS`; look keys, surfaced widgets)

| Key | Label | Control | Options | Default | Visible when | Level | Target |
|---|---|---|---|---|---|---|---|
| `borderWidth` | Border width | select | auto, 0, 1, 2, 3, 4, 6 px | `auto` | surfaced widgets | Zone, themed | Style › Border & glow |
| `borderColor` | Border color | color | | `""` | same | same | Style › Border & glow |
| `glow` | Edge glow | select | none (None), soft (Soft), strong (Strong) | `none` | same | same | Style › Border & glow |
| `glowColor` | Glow color (hint: Auto uses the accent) | color | | `""` | `glow` is not none | same | Style › Border & glow |
| `surfaceOpacity` | Opacity (%) | slider 0 to 100 step 5 | | `100` | surfaced widgets | same | Style › Surface & effects |
| `blur` | Blur | select | auto, 0, 4, 8, 16, 24, 40 px | `auto` | same | same | Style › Surface & effects |

### 1.4 Fit, surface, accent, background (`STANDARD_SETTINGS`)

| Key | Label | Control | Options | Default | Level | Themed | Target |
|---|---|---|---|---|---|---|---|
| `compact` | Small zones | select | auto, full (Full), card (Card), dense (Dense); the registry drops what a widget cannot draw (`fitSettings`) | `auto` | Zone | no | Show › Fit |
| `sizeTier` | Density | select | auto, lg (Roomy), md (Standard), sm (Compact), xs (Minimal) | `auto` | Zone | no | Show › Fit (More) |
| `surface` | Surface | select | auto (Auto, the skin's card), glass, matte-light (Matte (light)), matte-dark (Matte (dark)), theme (Theme), and 12 skin surfaces: solid, outline, flat, tinted, aurora, neon, holo, mesh, carbon, inset, studio, terminal (`BASE_SURFACES`, `src/widgets/core/surfaces.ts:21`) | `glass` (Other sensors and the plain card widgets: `theme`) | Zone, themed | yes | Style › Surface & effects |
| `accent` | Accent color | color | | `""` | Zone, themed | yes | Style › Colors |
| `background` | Background image | image field | | `""` | Zone | no | Style › Surface & effects (More) |
| `backgroundOn` | Use as background | toggle | | `false` | Zone | no | Style › Surface & effects (More) |
| `island`, `island*` | Send to island, and the source's own keys (shown while on; `islandSettings`, `src/lib/island/sources.ts:94`) | toggle + rows | | per widget (`defaultOn`) | Zone | no | Behaviour › Send to island |

A skin option carries `applies` (`surface = auto`): picking it also writes that key into the zone's settings. Standard colour rows with a palette `role` (`s1` to `s6`, `ok`, `warn`,
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
  saved style presets carry exactly these (`styleOf`, `replaceStyle`). `compact`, `sizeTier`,
  `showTitle`, `label`, `icon`, `background`, `backgroundOn` and all content keys are per zone only.
- **`THEMED_KEYS`** (`theme-model.ts:127`, `SECTION_KEYS`): the keys a theme can set, by section.
  `skin`: `skin`, `stroke`, `graph`, `meter`. `colors`: `accent`, `textColor`, `mutedColor`. `palette`:
  `s1` to `s6`, `ok`, `warn`, `crit`. `surface`: `surface`, `surfaceOpacity`, `blur`. `type`: `font`,
  `fontWeight`, `labelCase`. `spacing`: `scale`, `align`, `alignSpread`, `padding`, `gap`, `radius`
  (and the legacy `alignX`, `alignY`). `border`: `borderWidth`, `borderColor`, `glow`, `glowColor`.
  `css`: `customCss`. `format`: `tempUnit`, `rateUnit`, `decimals`, `clock`. `thresholds`: `warn.<q>`,
  `crit.<q>` for `load`, `temp`, `full`, `db`, `value`. `motion`: `smoothing`, `meterBallistics`. Saved
  Themes (§6.1) keep only these.

### 1.6 Custom panel look (`PANEL_SETTINGS`)

`STANDARD_SETTINGS` minus `compact`, `sizeTier`, `stroke` and `showTitle`
(`NOT_FOR_PANELS`), with two changes. Stored in the panel zone's `settings` like any widget; the
shared sections are the same (Show › Header, Style, Behaviour).

| Key | Change for panels | Target |
|---|---|---|
| `label` | Label becomes "Title (empty = hidden)"; empty hides the title | Show › Header |
| `surface` | Default `panel`; options none (None), panel (Card), bordered (Bordered card), then glass, matte-light, matte-dark, theme (no skin cards) | Style › Surface & effects |

All other keys (`icon`, `accent`, `background`, `backgroundOn`, §1.2 and §1.3 minus the removed ones)
behave as in §1.2 to §1.4. Legacy fallback: `PanelDef.title`, `titleVisible`, `accent` and
`background` are read when the matching setting is absent (`panelOwnSettings`, `panelLegacyLook`,
`src/lib/panel-model.ts`), never written by the UI.

### 1.7 Zone-level fields handled outside `settings`

| Field | Label (today) | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `Placement.colStart`, `rowStart`, `colSpan`, `rowSpan` | COL / ROW / W / H | 4 number fields (min 1, max = grid size) | | set when drawn or added | Zone field | the zone header's placement row (`src/components/studio/zone-inspector-parts.tsx:261`) |
| `Placement.design.accent` | Frame accent | color | | unset | Zone field | Style › Border & glow › Zone frame (More) |
| `Placement.design.background` | Frame background | segmented | none (None), panel (Panel), bordered (Bordered) | `none` | Zone field | same; hidden for panels (their Surface covers it) |
| `Placement.design.header` | Frame title header | toggle | | `false` | Zone field | same |
| `Placement.follow` | Inheritance chip per themed section: "From ‹level›" / "Custom here" / "Locked by ‹level›"; Customise here, Reset to inherited, Edit ‹level› ↗; with Advanced off a following section is one line, "Follows theme · Customise" | chip + menu per section | per section: follow or custom | unset (follows) | Zone field | the top of each themed Style, Data and Behaviour section (`inherit-chip.tsx`, `section-inherit.tsx`, `inspector/follows-theme.tsx`) |
| `Placement.visible` | Visible / eye | toggle | | `true` | Zone field | §1.1 |

### 1.8 Zone style tools (actions, not stored settings)

On the Style tab, one toolbar (`style-toolbar.tsx`): Start from a Style ▾ (the built-in Styles and the saved
ones; applying writes their sections as the widget's own), Save as Style (into Library › Styles,
`DashboardConfig.stylePresets`, §6.2), Update ‹name› when the look is built on a saved Style, and Make this the
theme for… ▾ (All screens / This screen / This page; writes the widget's custom sections to that level's
style, `makeTheme`). Copy style and Paste style (zone context menu, command palette, Ctrl+Alt+C / Ctrl+Alt+V)
replace the zone's look keys and turn the sections they set custom (session clipboard). Also per section: the
"N changed" badge and Reset; and the context menu (FEATURE_MAP §9).

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

The panel header's "…" menu has **Save as Panel** (name input; writes `DashboardConfig.panelPresets`,
§6.3).

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

The studio calls a profile a **screen**. Screens (the rail's first item) lists the screens as cards and edits the
selected one in a detail column (`screen-detail.tsx`): SIZE & FIT, GRID, ROTATION, PERFORMANCE, LINKED — EDITED
ELSEWHERE and PAGES · ORDER & ROTATION. The selected card is the screen Design edits (§7
`studio.pinnedProfile`). A screen's look is edited in Theme at its scope (§5.2) and its island in Alerts &
Island › Island, both reached from the LINKED group.

| Field | Label | Control | Range / options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `name` | Name | text on the card, from its ⋯ › Rename (a blank name is never saved) | | first profile `Main display`; new: `<window W>×<H>` | Profile | Screens › card |
| `width`, `height` | Size preset (select of 1920×550, 1920×1080, 2560×720, 1280×400, 1024×600, 800×480, or the current size) + Width, Height; "Match this window" (Use W × H) when it differs | select + 2 number fields | whole px, min 1 | first profile 1920×1080; new: the window size | Profile | Screens › Size & fit |
| `fit` | When it doesn't fit: Fill / Scroll | segmented | fill, scroll | new: fill when height ≤ 700 and width ≥ 1600, else scroll; first profile scroll | Profile | Screens › Size & fit |
| `cols` | Columns | stepper −/+ | 2 to 24; a smaller grid is refused while a zone, on any page, would fall outside | first profile 12; new: 6 when width ≤ 1280, else 12 | Profile | Screens › Grid |
| `rows` | Rows | stepper −/+ | 1 to 24 (same refusal) | first profile 6; new: 4 when height ≤ 700, else 6 | Profile | Screens › Grid |
| `gap` | Gap (px field + slider) | number, empty = default | 0 to 200 | `12` (`DEFAULT_GRID_GAP`) | Profile | Screens › Grid |
| `padding` | Edge padding (px field + slider) | number, empty = default | 0 to 200 | 0 for a fill kiosk page, 12 for fill in the studio, 24 for scroll | Profile | Screens › Grid |
| `widgetTheme.values` | the screen's widget style: skins, surface, opacity, blur and every other themed row (§5.2) | Theme cards at the screen scope | themed keys | unset (inherits `DashboardConfig.style`) | Profile | Theme › the screen |
| `widgetTheme.locks` | a lock per Theme card (all 11 sections), Lock all / Unlock all | toggle / button | per section of the 11 | none locked | Profile | Theme › the screen |
| `theme`, `radius` | Color tokens and Corners (§5.4) | Theme › Colors, Shape & spacing | | unset (inherits) | Profile | Theme › the screen |
| `font` | Page font (§5.6) | select | `FONT_CATALOG` | unset (inherits `general.font`) | Profile | Theme › Typography |
| `background` | Background editor (§5.5) | Theme › Background | | unset (inherits; `{ type: "none" }` = none for this screen) | Profile | Theme › the screen |
| `performance` | Frame-rate cap, Animations (`maxFps`, `motion`; §5.6), with an inheritance chip | segmented | | unset (inherits `general`) | Profile | Screens › Performance |
| `rotate` | Rotate pages; Every (seconds, 3 to 3600); a switch per page for "in rotation" (none on = every page) | toggle, number, switches | `enabled`, `seconds`, `pages` | off; 15 s; every page | Profile | Screens › Rotation, Pages · order & rotation |
| `island` | Show Dynamic Island and its sections (see below) | toggle + rows | | unset (no island; first toggle creates it with `enabled: true`) | Profile | Alerts & Island › Island |
| `pages` | the page list: drag to reorder, + Add page | list | at least one page | one page `Main` | Profile | Screens › Pages · order & rotation; page tabs; Page inspector |
| `id`, `sampleVersion` | identity; sample-layout version (old configs only, no longer read) | not editable | | | Profile | none |

Pages (`ProfilePage`): `name` (page tab ⋯ › Rename, default `Page N`), `icon` (⋯ › Icon…; none by
default), `widgetTheme` (values and per-section `follow`, edited in Theme at the page scope, §5.2),
`placements` (the zones). Page tab ⋯ menu: Rename, Icon…, Duplicate, Delete (off on the only page), Page
settings (`pageMenuEntries`, `src/components/studio/page-tabs.tsx:60`). With nothing selected, Design's
inspector is the **Page inspector** (`page-inspector.tsx`): Name, Icon, Rotation (a link to Screens), This
page's look (the sections the page customises, Edit in Theme ↗, Customise a section…), Live › Show on
kiosks now (§7b) and Duplicate page / Delete page.

**Dynamic Island** (`IslandConfig`, `src/lib/island/config.ts`; rows in
`src/components/studio/inspector/island-section.tsx`, shown by Alerts & Island › Island, `island-tab.tsx`,
for the screen picked in "Island for"). Defaults are `ISLAND_DEFAULTS`.

| Section | Key | Label | Control / options | Default |
|---|---|---|---|---|
| (top) | `enabled` | Show Dynamic Island | toggle | off while absent |
| Shape | `shape` | Style | Pill, Notch | `pill` |
| Shape | `size` | Size | S, M, L | `m` |
| Shape | `scale` | Scale | slider 80 to 150 % | `100` |
| Shape | `offsetY` | Offset from top (Pill only) | 0 to 64 px | `8` |
| Shape | `reserve` | Reserve space | toggle | `false` |
| Idle | `idle` | When idle | Time, Time and date, Time and values, Line, Hidden | `time` |
| Idle | `stats` | values (Label, Orange at, Red at; at most 3; Time and values only) | list | none |
| Idle | `rotate` | Rotate every (Time and date, Time and values, or Calendar countdown on) | 0 to 60 s (0 = side by side) | `0` |
| Look | `tint` | Color | Black, Theme, Custom | `black` |
| Look | `bgColor`, `fgColor` | Background, Text (Custom) | colors | `#000000`, `#ffffff` |
| Look | `opacity` | Opacity | percent, min 30 | `100` |
| Look | `border` | Border | None, Subtle, Accent | `none` |
| Look | `shadow` | Shadow | toggle | `true` |
| Look | `font` | Font (a link to Theme; "Follow Theme" puts `system` back) | the font catalog | `system` |
| Look | `weight` | Weight | Regular, Medium, Semibold, Bold | `semibold` |
| Clock | `seconds`, `hours` | Clock format (a link to Settings › Dashboard › Clock & date; "Follow the Dashboard" puts both back) | As General / Show / Hide; As General / 24 h / 12 h | `general`, `general` |
| Motion | `motion` | Animation | Lively, Smooth, Off | `lively` |
| Alerts | `collapseAfter` | Collapse alerts after | 0 to 120 s in the slider (stored up to 600; 0 = until tapped) | `0` |
| Alerts | `group` | Group notices | toggle | `false` |
| Dashboard notices | `notices.page`, `.layout`, `.plugins`, `.onAir`, `.calendar`, `.agents` | Page name, Layout updated, Plugin back, On air (OBS), Calendar countdown, Coding agents | toggles | all `false` |
| Dashboard notices | `calendarLead` | Count down from | minutes, up to 120 | `10` |

The Font and Clock format rows are read-only: Font shows the page font (Theme) unless the island keeps its own
`font`, and Clock format shows the Dashboard's hours and seconds (`general.showSeconds` and the themed `clock`,
§5.6) unless the island keeps its own `hours` or `seconds`. A "Preview an alert" button plays a notice in the
preview only. The tab also lists the widgets that send to the island (Open widget ↗; each is switched on in its
own Behaviour › Send to island) and links to the alert rules that show on it.

Screens actions: New screen, Import a screen…, card ⋯ (Rename, Duplicate, Always open this one, Export
screen, Delete), the "When the app opens" radio group (Best fit for the window / Always the same screen;
`DashboardConfig.activeProfile` holds `"auto"` or the profile id). Delete is off with one screen left.
Target: Screens (`src/components/studio/screens-view.tsx`).

---

## 5. Dashboard config (`DashboardConfig`)

### 5.1 Overview

| Field | What | Default | Target |
|---|---|---|---|
| `version` | config schema, currently `11` (older clients are refused) | `11` | none |
| `activeProfile` | the profile displays open on: a profile id or `auto` | `auto` | Screens › When the app opens (§4) |
| `profiles` | see §4 | one blank profile (`main`, "Main display", 1920×1080, 12×6, scroll, one page) on a fresh install | Screens |
| `theme`, `radius` | dashboard theme colors and corner radius (§5.4) | `DEFAULT_THEME`, `0.5` rem | Theme › Colors, Shape & spacing (All screens) |
| `style` | the all-profiles widget style: the base layer of the theme (§5.2) | unset | Theme (All screens) |
| `background` | page background (§5.5) | unset (the theme background shows) | Theme › Background (All screens) |
| `general` | §5.6 | unset (defaults) | Theme › Typography (font); Settings › Dashboard (the rest) |
| `dataApiUrl` | §5.7 | unset (`http://127.0.0.1:3921`) | Data › Connection |
| `sourcePrefs` | §5.8 | unset | Data |
| `stylePresets`, `appearancePresets`, `panelPresets` | §6 | unset | see §6 |
| `alerts` | `enabled` (Alerts on, default on), `rules` (a sensor rule's source is `{ kind: "sensor", conditions: [{ key, op, value, clearBelow? }], forSeconds }`, firing when any condition holds; v11), `quietHours` (`from` `23:00`, `to` `07:00`, `minSeverity` `critical` once set), `defaults` (`style` `toast`, `position` `top-right`, `backdrop` `none`, `size` `m`, `seconds` `8`; `DEFAULT_ALERT_DISPLAY`, `src/lib/alerts.ts:151`) | unset | Alerts & Island › Rules, Defaults (`src/components/studio/alerts-rules.tsx`, `alerts-defaults.tsx`) |

The server's copy is `/api/config` (`src/lib/dashboard-server.ts:11`); the browser keeps an offline
copy under `infopanel-dashboard:config:v1` (`layout.ts:291`).

### 5.2 Widget style (`style`, `widgetTheme`; Theme)

The widget style is edited in Theme (`theme-editor.tsx`, the rail's Theme view) at the scope the top bar names:
All screens › a screen › a page (`theme-scope-bar.tsx`). The 360 px column holds the scope's help, **1 · Start
from** (not on a page: saved Themes, palettes and skins) and ten section cards (`THEME_CARDS`, `theme-cards.ts`):
Colors, Typography, Shape & spacing, Surface & effects, Border & glow, Background, Units & format, Thresholds,
Motion and Advanced (custom CSS). Each card header carries an inheritance chip (Set here / From ‹level› / Custom
here / Locked by ‹level›), the count of changed rows and Reset; at a screen it also has a lock, and the top bar
has Lock all / Unlock all. The right area is the live preview of the page at that scope and its **Exceptions**
(the widgets and pages that keep their own value of a card, each with Follow, and Follow all).

Rows are `THEME_EDITOR_SETTINGS` (`theme-editor-settings.ts`): every themed standard row (§1.2 and §1.3 themed
keys, `accent`, `surface`), the palette roles, the four Units & format rows, the thresholds of every quantity and
`meterBallistics`. The cards hold:

| Card | Holds |
|---|---|
| Colors | Color tokens (§5.4; All screens and a screen only); Widget colors (`accent`, `textColor`, `mutedColor`); Status & series colors (the palette: Series 1 to 6, OK, Warning, Critical, default `""` = each widget's own colour) |
| Typography | Page font (§5.6); Font, Value weight, Label case |
| Shape & spacing | Corners (rem; §5.4); Size, Alignment, Inner padding, Gap between items, Corner radius |
| Surface & effects | Surface, Opacity, Blur; Skin (Skin, Ring / bar thickness, Graph style, Meter style) |
| Border & glow | Border width and color, Edge glow, Glow color |
| Background | the page background (§5.5; All screens and a screen only; not lockable) |
| Units & format | Temperature, Speed units, Decimals, Clock |
| Thresholds | the Warning and Critical levels of every quantity |
| Motion | Graph updates, Meter response (while it is Smooth, a note lists the screens where Smooth is off: a cap below 60 fps, or reduced animations) |
| Advanced (custom CSS) | Custom CSS (not behind More; not lockable) |

| Scope | Writes | Per-section control | Level |
|---|---|---|---|
| All screens (scope bar "All screens"; chip "Set here") | `DashboardConfig.style` (`withScopeTheme` base, `theme-editor-model.ts:82`; `withScopeStyle`, `appearance-actions.ts:40`) | none (no locks) | Dashboard |
| A screen | `MonitorProfile.widgetTheme.values` (`setProfileStyle`, `studio-actions.ts:456`) | a lock per card (`widgetTheme.locks`, `withCardLock`, `theme-cards.ts:243`); Lock all / Unlock all (`withLockAll`, `theme-editor-model.ts:121`) | Profile |
| A page | `ProfilePage.widgetTheme.values` and `follow` | Customise here / Reset per card (`withPageFollow`, `theme-editor-model.ts:125`; `customiseCard`, `resetCard`) | Page |
| A widget (zone inspector chips) | `Placement.follow`, `Placement.settings` | Customise here / Reset to inherited per section; Make this the theme for… ▾ (All screens / This screen / This page) | Zone |

A screen's own values sit over All screens'; Reset on a card drops them (`resetCard`). A locked card is the
screen's on every page and widget.

### 5.3 Saved themes (Appearance presets; Theme › Switch theme)

See §6.1.

### 5.4 Theme (`ThemeTokens`, `src/lib/theme.ts`; Theme › Colors › Color tokens, `theme-editor.tsx`, `theme-rows.ts`)

All values are `"h s% l%"` triplets edited with a native color input (converted to hex and back).
Defaults are `DEFAULT_THEME` (the Zinc preset). Stored at **Dashboard** (`theme`, `radius`) at the All screens
scope, or per **Profile** (`theme` partial, `radius`) at a screen's. On a page the card shows a link row
("Edit on ‹screen›") instead of editors. Six tokens are shown, seven more behind **More** (`VISIBLE_TOKENS`,
`ADVANCED_TOKENS`, `theme-rows.ts:6,15`; DECISIONS #8).

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
| `radius` | Corners (rem; hint: a widget's own Corner radius wins; Theme › Shape & spacing) | slider | 0 to 1.5 step 0.05 | `0.5` |
| palette | Theme card › Palette picker (`THEME_PRESETS`, `theme.ts`; the user's `palettes`; the template themes', `themePalettes`) | 6 built-in: Zinc, Neutral, Slate, Ocean, Forest, Paper (light); a palette sets the 19 tokens and its accent (`palettes.ts`), not corners | | Zinc |
| `general.font` / `MonitorProfile.font` | Page font (Theme › Typography; §5.6) | select | `FONT_CATALOG` (26 incl. System) | `system` |

On a page the Colors card reads "Custom" when the tokens match no palette.

### 5.5 Page background (`PageBackground`, `src/lib/appearance.ts`; Theme › Background; `background-editor.tsx`, `background-video.tsx`)

Stored at **Dashboard** (`background`, scope All screens) and per **Profile** (`background`, scope a
screen; `{ type: "none" }` = explicitly none; unset = inherit; `withBackgroundAt`, `theme-cards.ts:280`,
over `withBackground`, `appearance.ts:184`). A page has no background of its own. Sparse; unset fields use the defaults below. Fit, Position, Fill, Tint, Tint
opacity and Blur (and the video options) are behind **More**.

| Field | Label | Control | Options / range | Default | Visible when |
|---|---|---|---|---|---|
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
under reduced motion (Settings › Dashboard › Performance › Animations).

### 5.6 General (`DashboardConfig.general`; `src/lib/general.ts`)

Only changed keys are stored (`withGeneral`). Settings › Dashboard edits them and saves on the server at
once (`withSettingsPatch`). Every one is global, except the page font (a screen can set its own in Theme) and
the Performance pair, which a screen can override in Screens › Performance.

| Key | Label | Control | Options | Default | Level | Target |
|---|---|---|---|---|---|---|
| `font` | Page font | select | `FONT_CATALOG` (26): System, Sans, Rounded, Serif, Mono and 21 web fonts | `system` | General (`MonitorProfile.font` overrides) | Theme › Typography |
| `showSeconds` | Show seconds | toggle | | `true` | General | Settings › Dashboard › Clock & date |
| `locale` | Date locale | select | System (`""`), plus 14 locales (`COMMON_LOCALES`, `general.ts:164`: en-US, en-GB, de-DE, de-CH, fr-FR, it-IT, es-ES, nl-NL, sv-SE, nb-NO, pl-PL, pt-BR, ja-JP, zh-CN), shown as `<name> · <tag>`; a saved unknown locale is added | `""` | General | Settings › Dashboard › Clock & date |
| `maxFps` | Frame-rate cap | segmented | 5, 15, 30, 60, No limit (`0`) | `60` | General (a screen's `performance.maxFps` overrides) | Settings › Dashboard › Performance; Screens › Performance |
| `motion` | Animations | segmented | system (Follow system), reduce (Reduced), full (Full) | `system` | General (a screen's `performance.motion` overrides) | Settings › Dashboard › Performance; Screens › Performance |
| `kioskRefresh` | Refresh kiosk pages | select | daily (Daily at 04:00), off (Off) | `daily` | General | Settings › Dashboard › Performance |
| `ringGlide` | Ring glides | toggle | | `false` | General | Settings › Dashboard › Performance |
| `blurLimit` | Limit blur (caps a widget's blur at 12 px) | toggle | | `true` (stored only when `false`) | General | Settings › Dashboard › Performance |
| `innerBlur` | Blur inside widgets | toggle | | `false` | General | Settings › Dashboard › Performance |
| `liveGlow` | Live graph glow | toggle | | `false` | General | Settings › Dashboard › Performance |
| `hideCursor` | Hide cursor | toggle | | `false` | General | Settings › Dashboard › Kiosk |
| `kioskPageNav` | Page dots & swipe | toggle | | `false` | General | Settings › Dashboard › Kiosk |
| *(themed `clock`, in `DashboardConfig.style`)* | Clock | segmented | auto (Locale), 24 (24 h), 12 (12 h) | `auto` (unset) | Dashboard (all-screens style; was `general.hour12` before v7) | Settings › Dashboard › Clock & date |

Resolution of the performance pair (`src/lib/performance.ts:54`): kiosk URL (`&fps=`, `&animations=0`,
`&motion=`) over the profile's `performance`, over `general`, over the default. Settings › Dashboard lists the screens that set their own value of a
default there, each with Reset and a jump to Screens.

Settings › Studio (the Editor group) has no stored setting in the config: see §7.

### 5.7 Connection (`dataApiUrl`; Data › Connection; `connection-card.tsx`)

| Field | Label | Control | Notes | Default | Level | Target |
|---|---|---|---|---|---|---|
| `dataApiUrl` | Data API URL (hint: where the dashboard reads sensor data from) | text; commits on Enter or blur; red text "Enter an http(s) URL." when invalid | `normalizeApiBase`; stored only when changed | `http://127.0.0.1:3921` | Dashboard | Data › Connection |
| (action) | Test connection (button Test) | shows testing / connected / not reachable | | | UI | same |
| (link) | API index (Open ↗) | link to `<base>/` | | | UI | same |

### 5.8 Source preferences (`sourcePrefs`; Data, `sources-panel.tsx`, `explorer/`)

Key = `{plugin}::{container}` (`""` container for flat sources). Stored at **Dashboard**. Nothing
outside the Data explorer reads `sourcePrefs` (no kiosk or widget consumer; open question 12).

| Field | Label | Control | Default | Target |
|---|---|---|---|---|
| `enabled` | Show in dashboard (group summary: one Toggle per container; the source tree menu: Show in dashboard / Hide in dashboard) | toggle | `true` (stored only when changed) | Data › group summary (`explorer/group-summary.tsx:78`), tree row menu (`explorer/source-tree.tsx:81`) |
| `displayName` | Display name (placeholder = the container's title) | text | unset | same |
| bind / unbind | Bind / Unbind in the point inspector and the point table | button | n/a | Data › point inspector; Data tab › Bound data |

Bind (`bindPoint`, `src/lib/data-usage.ts:160`) writes a panel widget's `sensor`, or, on a widget zone
whose module has a source select for the key's plugin, that setting (a `multiple` one gains the
container in its comma-separated list); any other module has no per-key binding and nothing changes.

---

## 6. Presets and saved items

### 6.1 Appearance presets (Themes; `appearancePresets`, `src/lib/appearance-presets.ts`)

Shape: `{ id, name, description, theme (tokens or preset name), radius, style (themed keys),
background? }`. All are the user's; the `builtin:` id prefix is reserved (`isBuiltinPreset`,
`appearance-presets.ts:36-39`). Stored:
**Dashboard** (`DashboardConfig.appearancePresets`).

| Control | Label | Control type | Default | Target |
|---|---|---|---|---|
| Theme card › Switch theme | Switch theme | list of saved themes and template rows with variant chips (filters All, Saved, Templates, Light); a click applies the theme to the level | | Theme |
| Switch theme | Keep my background | check, off by default, kept until the studio closes | off | Switch theme |
| Switch theme | Apply to other screens… | checklist of screens (Select all), Apply | | Theme (screens only) |
| Switch theme | + Save current look as a theme | name input (label "Theme name") | | Theme; listed under Saved |
| Preview header | Update ‹name› / Save as new / Save as theme | the Update bar, once a part of the applied theme changed | | Theme |
| Theme card ⋯ | Reset to ‹name›, Rename, Duplicate, Delete | | | Theme |

An apply is one undo step (`useAppearancePresets`, `src/components/studio/use-appearance-presets.ts`). A pick
writes the level's palette, skin, corners and (unless kept) background, merges the theme's style values over what the
last theme wrote, and stores what it wrote as the level's snapshot (`appliedTheme`); see `applyTheme`,
`src/lib/theme-apply.ts`.

### 6.2 Style presets (Styles; `stylePresets`: `{ id, name, settings }`)

Look keys only (`PROFILE_STYLE_KEYS`, §1.5). Stored: **Dashboard**. Controls: the zone Style toolbar (§1.8):
Start from a Style ▾, Save as Style (name input), Update ‹name›; Library › Styles lists them. Target: Style
tab.

### 6.3 Saved panels (`panelPresets`: `UserPanelPreset`)

`{ id, name, panel (PanelDef), settings? (the panel look), colSpan?, rowSpan? }`. Stored:
**Dashboard**; shared by all profiles; exported with the config; each use is a fresh copy. Controls:
Save as Panel (the panel header's "…"), zone menu "Save as Panel" (`zone-menu.ts:84`), Library › Panels and
Add › My panels (Rename, Delete on each row; `add-catalog.ts`).

### 6.4 Built-in panel presets and layout starters (code, not config)

Panel presets (`src/lib/panelPresets.ts`): Blank panel, System, RAM, CPU, GPU, FPS gauges, Steam,
Weather, Network, Clock. Layout starters (`src/lib/panel-starters.ts`): Row of stats, 2×2 stats, Hero
overlay, Gauge row, Clock + date, Label / value list. Theme token presets: §5.4. Skins: §1.2.

---

## 7. Studio UI preferences (Browser, `localStorage`, not exported)

| Key | What | Values | Default | Target |
|---|---|---|---|---|
| `studio.dockCollapsed` | Docked inspector collapsed (Ctrl+\) (`use-studio-layout.ts:15`) | `1` / unset | expanded | the inspector's collapse tab; Ctrl+\ |
| `studio.quickBar` | Quick bar shown (`inspector-prefs.ts`) | `true` / `false` | `true` | Settings › Studio › Editor › Quick bar |
| `studio.accordion` | Inspector sections: one open or many (`inspector-prefs.ts`) | one, many | `one` | Settings › Studio › Editor › Inspector sections |
| `studio.inspector.advanced` | Show every inspector setting, including ones the theme controls (`inspector-prefs.ts`) | `true` / `false` | `false` | Settings › Studio › Editor › Advanced settings |
| `studio.quickPins` | Pinned quick-bar settings per widget type, max 6 (`inspector-prefs.ts`) | map | unset (a default set applies) | Pin button on each inspector row |
| `studio.inspectorTabs` | The open inspector tab per context (`inspector-prefs.ts`) | map | the first tab | the tab strip |
| `studio.editor.leftPanelWidth` | Design's left panel width (`add-prefs.ts`; the old `studio.drawerWidth` px value moves to the nearest option) | `narrow` (300 px), `default` (340), `wide` (380) | `default` | Settings › Studio › Editor › Left panel width |
| `studio.editor.addListDensity` | Add widget list (`add-prefs.ts`) | `comfortable`, `compact` | `comfortable` | Settings › Studio › Editor › Widget list |
| `studio.editor.addPreviewOnHover` | Add widget preview while hovering (`add-prefs.ts`) | boolean | on | Settings › Studio › Editor › Preview on hover |
| `studio.pinnedProfile` | The profile the studio edits: the selected card (`pinned-profile.ts:7`) | profile id | the profile the window size picks | Screens (card click) |
| `studio.grid`, `studio.rulers` | Canvas grid and rulers shown (`use-stored-flag.ts`) | `1` / `0` | `1` | zoom bar; Settings › Studio › Editor › Show grid, Show rulers |
| `studio.zoom` | Canvas zoom: `fit` or a factor 0.25 to 2 (`zoom-pref.ts`) | | `fit` | zoom bar; Settings › Studio › Editor › Default zoom |
| `studio.tipDismissed` | First-run tips card dismissed (`quick-tips.ts`) | `1` | unset | the tips card |
| `infopanel.studio.profile-shots` | Screen thumbnail cache (`src/lib/profile-shot-cache.ts:13`) | map | unset | Screens cards (automatic) |
| `studio.addPanel.recent` | Recently placed widgets in Add (`add-recent.ts:4`) | list | unset | Add (automatic) |
| `studio.runSetup` | Help › Run setup again: asks the studio to open first-run (`setup-request.ts:5`) | flag | unset | Help |
| `studio.previewData` | Design preview data (`preview-data-pref.ts`): frozen renders Design from a snapshot, closes the studio's Data API stream while nothing live is open, and stills continuous effects. Kept on the server too (`studio-prefs.json`, `/api/studio-prefs`), so it follows you between the app window and a browser studio; localStorage is this browser's copy | `live`, `frozen`, `frozenWhenUnfocused` (after the 60 s unfocused delay) | `frozenWhenUnfocused` | Settings › Studio, Settings › General › Window; the zoom bar's Frozen chip (Refresh, Go live for this session) |
| `infopanel-dashboard:config:v1` | The offline copy of the config (`layout.ts:291`) | config JSON | | automatic |
| session only | Style clipboard (Copy style), widget clipboard (Copy), settings search text | | | Not persisted |

Retired: `studio.layout` (inspector position; DECISIONS #15), `studio.inspectorAdvanced` (dropped on
load, `inspector-prefs.ts:107`).

---

## 7a. Desktop app settings (InfoPanel Studio; `settings.json`, not in the config)

Kept by the desktop app, not by the studio: `%APPDATA%\dev.f3nn3x.infopanel-studio\settings.json`
(see [desktop/README.md](desktop/README.md); layout version 4, `SETTINGS_VERSION`,
`src-tauri/src/settings.rs:10`). Edited in the Settings window (`src/settings/`; the rail's Settings
button). Its pages: Dashboard and Studio (Preferences, §5.6 and §7), then the App pages these keys belong to:
General, Server, Coding agents, Updates, Diagnostics, Logs, About, Changelog. Missing or invalid keys fall back to their default (`load_from_str`,
`settings.rs:349`); each write is validated (`with_setting`, `settings.rs:235`); a v1 `host` becomes
`listen` on load.

| Key | Label | Values | Default | Target |
|---|---|---|---|---|
| `zoom` | App zoom (steps; Ctrl + / Ctrl − / Ctrl 0) | 80, 90, 100, 110, 125, 150 % | `100` | Settings › General › Zoom |
| `startAtLogin` | Start at login | boolean | `true` | Settings › General › Startup |
| `openStudioOnLaunch` | Open the studio on launch | boolean | `true` | Settings › General › Startup |
| `startServer` | Start the server on launch | boolean | `true` | Settings › General › Startup |
| `closeToTray` | Close to tray | boolean | `true` | Settings › General › Window |
| `rememberBounds` | Remember window size and position | boolean | `true` | Settings › General › Window |
| `studioRefresh` | Refresh the Studio (reload the page after saving while unfocused) | `idle` (30 minutes), `daily` (04:00), `off` | `idle` | Settings › General › Window |
| `releaseHiddenStudio` | Release the hidden studio (close its page while hidden in the tray) | `after1m`, `after10m`, `after60m`, `never` | `after10m` | Settings › General › Window |
| `reduceUnfocusedAnimation` | Reduce studio animation when unfocused (after 60 s: the canvas at 5 fps, ambient effects paused; sent to the studio with the `studio-focus` event) | boolean | `true` | Settings › General › Window |
| `openStudioIn` | Open the studio in (every opener goes through `studio_target.rs`; the browser targets start the server first, open `http://127.0.0.1:<port>/?studio=1` and run no WebView; a second open while a studio is connected asks first) | `appWindow` (App window), `edgeApp` (Microsoft Edge in app mode, found in App Paths; the default browser if missing), `defaultBrowser` (Default browser) | `appWindow` | Settings › General › Window |
| `listen` | Who can connect (becomes `HOST`: `127.0.0.1` or `0.0.0.0`) | `local` (This computer only), `lan` (Local network) | `local` | Settings › Server › Network |
| `port` | Port (becomes `PORT`) | 1024 to 65535 | `3922` | Settings › Server › Network |
| `allowedHosts` | Allowed host names (`ALLOWED_HOSTS`; request guard) | list, or a comma-separated string; letters, digits, `.`, `-`, `:`, `[`, `]` | empty | Settings › Server › Network (only while `listen` is `lan`) |
| `allowRemoteEdit` | Allow editing from other devices (`ALLOW_REMOTE_EDIT` and `ALLOW_REMOTE_UPLOAD`; off: other devices only view, writes get a 403) | boolean | `false` | Settings › Server › Network (only while `listen` is `lan`) |
| `autoRestart` | Restart automatically if it crashes (3 tries a minute) | boolean | `true` | Settings › Server › Network |
| `updateChannel` | Release channel | `stable` (Stable), `beta` (Beta) | `stable` | Settings › Updates |
| `checkForUpdates` | Check for updates at startup | boolean | `true` | Settings › Updates |
| `autoDownload` | Download in the background | boolean | `false` | Settings › Updates |
| `agents.enabled` | Connect coding agents (Claude Code and Codex hooks installed by the app) | boolean | `false` | Settings › Coding agents |
| `debug` | Debug mode (debug logging and leak sampling; also `--debug`, `INFOPANEL_STUDIO_DEBUG=1`) | boolean | `false` | Settings › Diagnostics |
| `version`, `agents.installed`, `closeWarningShown` | Bookkeeping: file layout, what the hooks were last written for, the one-time close warning | | | Not edited by hand |

The server's own environment variables (`PORT`, `HOST`, `ALLOWED_HOSTS`, `DASHBOARD_DIST`,
`DASHBOARD_DATA_DIR`, `DASHBOARD_DEBUG`) are in [development.md](development.md); the app sets
`PORT`, `HOST`, `ALLOWED_HOSTS`, `ALLOW_REMOTE_EDIT` and `DASHBOARD_DEBUG` from these keys as a `ServerConfig` for `ips-server`, which runs inside the app (`src-tauri/src/native.rs`).

---

## 7b. Live state (server, not config)

Runtime state the server holds (`src-tauri/crates/ips-server/src/control.rs`, `src/lib/control.ts`): kiosks and the studio read
it over one SSE stream (`/events/control`) and write it with `POST /api/control/<action>`. None of it
is config, so none of it enters undo or the exported config. The durable part is saved to
`control.json`: `mutedUntil`, the dim levels, `islandOverride` (`control_store.rs`); the rest is
runtime only.

| State | What | Actions (`ControlAction`) | Studio UI |
|---|---|---|---|
| page shown per profile (`pages`) | the page a kiosk shows | `page` (id, `next`, `prev`) | yes: Page inspector › Show on kiosks now (`page-inspector.tsx`), the Live popover's Show on … (`live-popover.tsx`); the kiosk's page dots and swipe |
| profile override (`profile`) | a profile every kiosk shows regardless of the window | `profile` | none |
| profile shown (`shown`) | the profile a kiosk last reported | `shown` (kiosk only) | none |
| rotation override (`override`) | page cycling on or off over the saved `rotate` | `rotate` (`on`, `off`, `toggle`, `saved`), `touch` (a touch pauses it 30 s) | yes: the Live popover's Rotation (`live-popover.tsx`); long-press the kiosk dots |
| active alerts (`alerts`) | what the alert engine holds, with acknowledge | `alert` (`ack`, `dismiss`, `test`) | yes: Alerts & Island › History › Active now (`alerts-live.tsx:55`); tap on the kiosk |
| alert mute (`mutedUntil`) | alerts muted until a time (0 to 1440 minutes) | `alert` `{ action: "mute", minutes }` | yes: Live popover › Mute alerts for 1 h |
| reload counters (`reload`, `reloads`) | a kiosk reloads when its counter grows | `kiosk` `reload` | yes: Live popover › Reload all kiosks |
| dim (`dim`, per profile) | a black veil over the page and island (0.1 to 0.9, default 0.6) | `kiosk` `dim` (`on`, `off`, `toggle`, `level`) | yes: Live popover › Dim screens (the kiosk renders it) |
| island override (`islandOverride`) | show or hide the island over the saved `island.enabled` | `kiosk` `island` (`on`, `off`, `toggle`, `saved`) | yes: Live popover › Dynamic Island |

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

UI surface (exact label) → the scope it writes → the code that writes it. Labels are the ones the studio
shows; Theme's scope is the scope bar (All screens, a screen, a page).

| UI surface | Scope written | Code |
|---|---|---|
| Theme › Colors › Color tokens, the Palette picker (a screen) | `MonitorProfile.theme` (and, for a palette with an accent, `widgetTheme.values.accent` and the snapshot) | `withToken`, `withTokens` (`theme-cards.ts`) |
| Theme › Shape & spacing › Corners (rem) | `DashboardConfig.radius`, or `MonitorProfile.radius` | `withThemeRadius` (`theme-cards.ts:265`) |
| Theme › Typography › Page font | `general.font` (All screens), or `MonitorProfile.font` | `withPageFont` (`theme-cards.ts:274`) |
| Theme › Background | `DashboardConfig.background`, or `MonitorProfile.background` | `withBackgroundAt` (`theme-cards.ts:280`), `withBackground` (`appearance.ts:184`) |
| Theme › a widget-style row at All screens | `DashboardConfig.style` | `withScopeValues` (`theme-editor-model.ts:108`), `withScopeTheme` (`:82`), `withScopeStyle` (`appearance-actions.ts:40`) |
| Theme › a widget-style row at a screen | `MonitorProfile.widgetTheme.values` | `withScopeValues`, `setProfileStyle` (`studio-actions.ts:456`) |
| Theme › a widget-style row at a page; Customise here / Reset on a card | `ProfilePage.widgetTheme.values` and `follow` | `withScopeValues`, `withPageFollow` (`theme-editor-model.ts:125`), `customiseCard`, `resetCard` (`theme-cards.ts:232,226`) |
| Theme › a card's lock (screen scope), Lock all / Unlock all | `MonitorProfile.widgetTheme.locks` | `withCardLock` (`theme-cards.ts:243`), `withLock`, `withLockAll` (`theme-editor-model.ts:117,121`) |
| Theme › Exceptions › Follow, Follow all | `Placement.follow` (the zones follow again) | `makeFollow`, `makeAllFollow` (`theme-exceptions.ts:79,87`) |
| Theme › Switch theme, Save as theme, Update ‹name› | applies palette, skin, corners and background to the level and stores its snapshot; saves `DashboardConfig.appearancePresets` | `useAppearancePresets` (`use-appearance-presets.ts`), `applyTheme` / `saveAsTheme` / `updateThemeEverywhere` (`theme-apply.ts`) |
| Screens › When the app opens; card ⋯ › Always open this one | `DashboardConfig.activeProfile` | `withLaunch` (`screens-model.ts:19`) |
| Screens › card click | Browser `studio.pinnedProfile` | `pinned-profile.ts:30` |
| Screens › card ⋯ › Rename | `MonitorProfile.name` | `rename` (`screens-view.tsx`) |
| Screens › Size & fit (Size preset, Width, Height, When it doesn't fit) | `MonitorProfile` `width`, `height`, `fit` | `SizeFitSection` (`screen-layout.tsx`) |
| Screens › Grid (Columns, Rows, Gap, Edge padding) | `MonitorProfile.cols`, `rows`, `gap`, `padding` | `GridSection` (`screen-layout.tsx`) |
| Screens › Rotation (Rotate pages, Every), the pages' in-rotation switches | `MonitorProfile.rotate` | `setRotate` (`use-studio-mutations.ts:374`) |
| Screens › Performance (Frame-rate cap, Animations) | `MonitorProfile.performance` | `withScreenPerformance` (`screens-model.ts:39`) |
| Screens › Pages · order & rotation (drag, + Add page); the page tab strip | `MonitorProfile.pages` | `movePageTo`, `addNewPage` (`use-studio-mutations.ts`) |
| Design › page tab ⋯ and Page inspector › Name, Icon | `ProfilePage.name`, `ProfilePage.icon` | `renamePageTo`, `setIconOfPage` (`use-studio-mutations.ts`) |
| Design › Page inspector › Show on kiosks now; Live popover › Show on …, Rotation | live: control channel `page`, `rotate` | `live-popover.tsx`, `page-inspector.tsx` |
| Alerts & Island › Island | `MonitorProfile.island` | `patchIsland` (`island-tab.tsx`), `withIsland` (`island/config.ts:204`) |
| Alerts & Island › Rules (Alerts on, rules) | `DashboardConfig.alerts` | `alerts-model.ts:34-70` |
| Alerts & Island › Defaults | `alerts.defaults`, `alerts.quietHours` | `patchDefaults`, `setQuietHours` (`alerts-model.ts:38,42`) |
| Alerts & Island › History › Active now (Acknowledge, Dismiss) | live: control channel `alert` | `alerts-live.tsx:55-60` |
| Data › Connection › Data API URL | `DashboardConfig.dataApiUrl` | `connection-card.tsx`, `sources-panel.tsx:241` |
| Data › Show in dashboard, Display name | `DashboardConfig.sourcePrefs` | `explorer-actions.ts:49` |
| Data › Bind, Unbind | a zone's source setting, or a panel widget's `sensor` | `sources-panel.tsx:150-161`, `data-usage.ts:160` |
| Zone inspector rows (Show, Style, Data, Behaviour) | `Placement.settings` | `updateSelected` (`use-studio-mutations.ts:94`) |
| Zone inspector chip: Customise here, Reset to inherited | `Placement.follow[section]` | `withFollow` (`zone-fields.ts:62`), `customiseInheritance`, `resetInheritance` (`inheritance-actions.ts`) |
| Zone Style › Make this the theme for… | `DashboardConfig.style`, a screen's `widgetTheme.values` or a page's | `makeTheme` (`inheritance-actions.ts:164`) |
| Zone Style › Save as Style, Update ‹name› | `DashboardConfig.stylePresets` | `saveStylePreset`, `updateSavedStyle` (`use-studio-mutations.ts:415,422`) |
| Zone Style › Border & glow › More › Frame accent, Frame background, Frame title header | `Placement.design` | `frameFields` (`zone-inspector.tsx:283`) |
| Zone Show › Panel, Layout, Background, Widgets; panel widget rows | `Placement.panel` | `panel-layout-section.tsx`, `inspector/item-model.ts` |
| Panel header menu › Save as Panel; zone menu › Save as Panel | `DashboardConfig.panelPresets` | `savePanelAsPreset` (`use-studio-mutations.ts:177`) |
| Settings › Dashboard (Performance, Clock & date, Kiosk) | `general` keys, `style.clock`; saved on the server at once | `SettingsDashboard` (`settings-dashboard.tsx`), `withSettingsPatch` (`settings-patch.ts:34`) |
| Settings › Studio (Editor) | Browser `studio.*` keys (§7) | `SettingsStudio` (`settings-studio.tsx`) |
| Zoom bar, inspector collapse, first-run tips | Browser `studio.grid`, `studio.rulers`, `studio.zoom`, `studio.dockCollapsed`, `studio.tipDismissed` | `use-stored-flag.ts:9`, `zoom-pref.ts:2`, `use-studio-layout.ts:15`, `quick-tips.ts:2` |
| Settings window › App pages (App zoom, Start at login, Port, Release channel, ...) | Desktop `settings.json` | `save` (`src/settings/store.tsx:167`), `with_setting` (`src-tauri/src/settings.rs:235`) |
