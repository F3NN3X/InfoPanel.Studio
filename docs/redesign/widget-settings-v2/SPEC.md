# Widget settings v2: model, inspector, theme, panel items

Implementation spec for Claude Code. Concept file: `Widget Settings v2.dc.html` (data in `widget-settings-data.js`). It builds on `handoff_widget_editing/SPEC.md` (quick bar, one-column inspector, docked / floating / sheet). Everything in that spec stays unless this one replaces it.

Source of truth for today's settings: `uploads/widgets.md` (registry dump). Section refs like "§6.1" point there.

---

## 1. Goals

1. **One vocabulary.** The same concept gets the same key, label, control and place in every widget: thresholds, device, units, decimals, layout of the island toggle, colour roles.
2. **Global first.** A profile theme sets the look **and** the content preferences (units, thresholds, motion). Widgets follow it by default.
3. **Override per section, not per key.** A widget section either follows the theme or is custom. This replaces `styleMode` and the per-row source dots for themed keys.
4. **Show only what works.** No rows that do nothing (`autoScale`), no Header rows on widgets without a header, no Small-zone options a widget cannot draw.

## 2. Tabs and sections

Four tabs, task-based. Order inside a tab is fixed: widget-specific sections first, then shared ones.

| Tab | Question | Sections (in order) |
|---|---|---|
| **Show** | What is on the widget? | Header · widget content sections · Fit |
| **Style** | How does it look? | Skin & graphics · Colors · Widget colors · Surface · Typography · Size & spacing · Border & glow · Custom CSS |
| **Data** | Where do values come from, how are they written? | widget source sections (Device, Sensors, Source…) · Units & format |
| **Behaviour** | How does it react and what does it tell you? | Thresholds · widget behaviour sections (History, Dynamics…) · Dynamic Island · Motion |

Rules:
- A tab with no sections renders disabled (35% opacity) and is skipped by default selection.
- A section whose `if` is false is not rendered. A section with one row is fine; no "one-setting category" workarounds.
- **Header** section: `header: 'yes'` → Show title, Title (if shown), Icon (More). `'title-only'` (Clock, SystemOverview) → Title (hint: "draws a header only when a title is set"), Icon (More). `'none'` (Calendar, GameSpotlight, KpiTiles, MenuBar, OsdStrip, SteamGame, Vitals, WebPage) → no section. These eight still apply `label`/`icon` to the summary views: Title/Icon move into **Fit** for them when the widget has a card or dense view.
- **Fit** section: Small zones (`compact`) + Density (`sizeTier`, More). Omitted for WebPage.

### 2.1 Followable sections (theme-backed)

`skin`, `colors`, `palette` (Widget colors), `surface`, `type`, `spacing`, `border`, `css`, `format`, `thresholds`, `motion`.

Non-followable: Header, Fit, all widget-specific sections, Dynamic Island.

### 2.2 Section membership of standard keys

| Section | Keys |
|---|---|
| Skin & graphics | `skin`, `stroke`; More: `graph`, `meter` |
| Colors | `accent`, `textColor`, `mutedColor`; More: `preset` |
| Widget colors | widget colour roles (§4.3) + per-widget look toggles (`tint`, `artBackground`, `heatRamp`, `unifiedColor`, viz colour mode) |
| Surface | `surface`, `surfaceOpacity`, `blur`; More: `background`, `backgroundOn` (per-widget) |
| Typography | `font`, `fontWeight`, `labelCase` |
| Size & spacing | `scale`, `align`, `padding`, `gap`, `radius` |
| Border & glow | `borderWidth`, `borderColor`, `glow`, `glowColor` (if glow ≠ none) |
| Custom CSS | More: `customCss` |
| Units & format | `tempUnit`, `rateUnit`, `decimals`, `clock` — only those the widget declares (`fmt`) |
| Thresholds | `warn.<q>`, `crit.<q>` for each quantity the widget declares (`thr`) |
| Motion | `smoothing`; `meterBallistics` for audio meters |

`smoothing` moves from Look to Behaviour > Motion.

## 3. Inheritance

### 3.1 Chain

```
THEME_DEFAULTS → Profile theme → Dashboard theme (per section: follow profile | custom) → Widget section (follow | custom)
```

- **Profile theme** holds a value for every themed key. Each section can be **locked** (`locks[sectionId] = true`): widgets then always follow it, and their toggle is replaced by "Locked by the profile theme". Replaces `styleEnforce`.
- **Dashboard theme** stores partial values plus `follow[sectionId]` (default true). Following → profile values, own values ignored but kept.
- **Widget section**: `placement.follow[sectionId]` (default true = follow).
  - Following → rows show theme values, dimmed and not editable. Rows with `perWidget: true` (no theme value, e.g. Tint from cover art, Background image) stay editable.
  - **Customize** → rows unlock; their starting value is the theme value; edits store own keys.
  - **Use theme** → `follow = true`; own keys are kept (Customize brings them back). Section reset (`restart_alt`) clears them.

### 3.2 Resolution

```ts
themeVal(key, sec) = dash.follow[sec] !== false ? profile[key] ?? DEFAULTS[key] : dash[key] ?? profile[key] ?? DEFAULTS[key]
following(zone, sec) = profile.locks[sec] || zone.follow[sec] !== false
value(zone, key) =
  row.perWidget || !sec.follow ? zone.settings[key] ?? row.default
  : following(zone, sec)       ? themeVal(themeKey(row), sec)
  :                              zone.settings[key] ?? themeVal(themeKey(row), sec)
themeKey(row) = row.role ?? row.key        // colour roles, §4.3
```

`visibleIf` / `if` functions receive the **resolved** value getter, so a row gated on `glow` works whether glow comes from the theme or the widget.

### 3.3 Data shapes

```ts
type SectionId = 'skin'|'colors'|'palette'|'surface'|'type'|'spacing'|'border'|'css'|'format'|'thresholds'|'motion'

interface Theme {                       // profile and dashboard
  values: Partial<Record<ThemedKey, string|number|boolean>>
  follow?: Partial<Record<SectionId, boolean>>  // dashboard only: false = custom for this dashboard
  locks?: Partial<Record<SectionId, boolean>>   // profile only
}
interface Placement {                   // existing, plus:
  settings: ModuleSettings
  follow?: Partial<Record<SectionId, boolean>>   // replaces styleMode
}
```

`ThemedKey` = the old `PROFILE_STYLE_KEYS` minus `autoScale`, `variant`, `compactView`, plus `tempUnit`, `rateUnit`, `decimals`, `clock`, `meterBallistics`, `warn.*`, `crit.*`, palette roles `s1…s6`, `ok`, `warn`, `crit`.

`compact` (Small zones) is **not** themed any more: it depends on the zone shape, not the look.

## 4. Shared controls

### 4.1 Follow bar (section header + bar)

- Header pill: `Theme` (link icon, muted) · `Custom` (tune, accent 18%) · `Locked` (lock) · `Profile` (dashboard scope).
- Bar (first line inside an open section): icon + text + button.
  - Widget following: "Follows the profile theme · Desk" or "Follows the dashboard theme · Gaming" + **Customize** (accent outline).
  - Widget custom: "Custom for this widget" (accent text, accent 10% bg) + **Use theme**.
  - Profile scope: "Default for all widgets · N custom" + **Lock / Unlock**.
  - Dashboard scope: "Follows the profile theme" + Customize, or "Custom for Gaming" + Use profile; plus Lock.
- Changed count / reset only counts own values that apply (not stored-but-ignored ones).

### 4.2 More (replaces Advanced)

- Rows flagged `more: true` render after a `More (n)` link at the end of their section; the expanded rows get bg `#0f0f12`. `Less` collapses.
- State per section per zone type (session). Search and Changed always include More rows, expanded.
- The global "Advanced settings" switch and `advanced` flag are removed; `advanced: true` maps to `more: true`. Colour-only groups no longer become "Style + advanced" automatically: colours go to Widget colors (§4.3).

### 4.3 Widget colors and roles

Every widget colour row declares a `role` from the theme palette: `s1…s6` (series), `ok`, `warn`, `crit`, `accent`. Following → the role's colour, labelled with the role name ("Series 1"). Custom → own colour, Auto = the role.

Default role assignments (examples): SystemOverview cpu s1, gpu s2, ram s3, vram s4, disk s5, net s6 · AudioMeter / MeterBridge / VolumeMixer / WaveLink level ok, hot crit · SensorGroup temp crit, fan s3, power s5 · Bluetooth battery mid warn, low crit · NowPlaying / Visualizer viz colour 1–3 s1–s3, peak crit · PlaytimeShare slices s1…, SteamFriends statuses ok/s2/s5 · FpsMonitor ring accent, spark s1 · NetworkThroughput download s1, upload s2 · DiskIO read s1, write s2 · GpuRings rings s1…

Fixes §6.3: colours never land on Content any more; `fanColor` has one home.

### 4.4 Thresholds

One control per quantity: a zone bar (green / amber / red, widths from the values) and two sliders, Warning and Critical; crit ≥ warn enforced.

| Quantity `q` | Label | Unit | Range | Theme default |
|---|---|---|---|---|
| `load` | Load | % | 0–100 step 5 | 80 / 92 |
| `temp` | Temperature | °C (shown in °F when tempUnit = f) | 30–110 step 5 | 80 / 90 |
| `full` | Fullness | % | 0–100 step 5 | 85 / 95 |
| `db` | Audio level | dB | −40–0 step 1 | −9 / −2 |
| `value` | Value | sensor unit | free (slider over the sensor's range) | 70 / 90 |

Keys: `warn.<q>`, `crit.<q>`. Absent = theme. `"off"` = that level disabled (add an Off chip at the slider end; not drawn in the concept). Per-sensor overrides (SensorGroup `items`) keep `{warn, crit}` per sensor, blank = the group value.

### 4.5 Device picker

Key `device` for every single-device select. Kind comes from the widget def (`deviceKind`). List: **Auto** first, with its rule and the current pick ("Loudest live device · now Wave Link · Stream Mix"), then live devices with a live reading. Stores `auto` (or absent) or the device id.

Auto rules (stated in the UI, not hidden in hints): cpu = first detected processor · gpu = first detected GPU · disk / drive = first detected drive · adapter = busiest adapter · audio = loudest live device. Multi-device pickers (MeterBridge `channels`, NowPlaying `liveSources`) use the same rows with checkboxes, `devices` key, empty = all.

### 4.6 Small zones (`compact`)

`auto` · `full` · `card` · `dense`. Replaces `variant` + `compactView`.
- auto = today's compactView auto (tile / strip / column zones show the card).
- full = compactView off, variant default.
- card = compactView on.
- dense = variant studio.
- `card` is omitted when the widget has no compact descriptor (Clock, CoreHeatmap, CustomGauge, GpuRings, MeterBridge, SystemOverview, Timer, Visualizer). `dense` is kept for "falls back" widgets (it shows the card descriptor). If only Auto/Full remain, the row is hidden and Density shows without More.

### 4.7 Units & format

`tempUnit` (c / f), `rateUnit` (auto, MB/s, Mb/s, KB/s, Kb/s), `decimals` (auto, 0, 1, 2), `clock` (24 / 12). A widget lists the ones it renders in `fmt`. Theme sets them once.

## 5. Inspector UI changes (vs `handoff_widget_editing`)

- Tabs: **Show · Style · Data · Behaviour** (was Content / Style / Data). Counts per tab as before.
- Search + Changed unchanged; results show the tab label next to each section title.
- Source dot: filled accent = own value that applies; click resets. Multi-source dot colours are no longer needed for themed keys (the section pill says it).
- Section header gains the pill and the follow bar (§4.1). `New` pill marks sections introduced by this change during rollout (panel Thresholds).
- Quick bar pins keep working; a pinned row inside a following section shows the theme value and opens the inspector at that section on click.
- Theme editor (§7) reuses the same inspector component with `scope = profile | dashboard`.

## 6. Key map and migration

Migration runs once on config load (bump config to v5), per placement. Keep readers for old keys for one release.

### 6.1 Standard block

| Old | New | Notes |
|---|---|---|
| `autoScale` | — | dropped |
| `variant` + `compactView` | `compact` | studio → dense; else compactView on → card, off → full, auto → auto |
| `layout` | `sizeTier` | auto / lg / md / sm / xs (card / standard / compact / simple) |
| `alignX` + `alignY` | `align` | 9-cell code `tl…br`; `between` kept as `alignSpread: true` |
| `smoothing` | `smoothing` | moves to Motion |
| `preset` | `preset` | More in Colors; still an applies-only bundle; not stored after applying |
| `showTitle`, `label`, `icon` | same | Header section, or Fit for no-header widgets |
| all other look keys | same | sections per §2.2 |
| `styleMode` | `follow` | `follow` → every section true · `custom` → every section with own keys false · unset → false for sections with any own key, else true |
| profile/dashboard `style` + `styleEnforce` | `Theme.values` + `locks` | enforce → lock every section |

### 6.2 Shared families

| Old | New |
|---|---|
| `warn`/`crit` (SystemStatus, MemoryUsage, CpuMonitor: %) | `warn.load` / `crit.load` |
| `warn`/`crit` (Thermals, SensorValue °C) | `warn.temp` / `crit.temp` (SensorValue: `warn.value` unless its unit is °) |
| `warn`/`crit` (DriveSpace) | `warn.full` / `crit.full` |
| `warnTemp`/`critTemp` (GpuMonitor) | `warn.temp` / `crit.temp` |
| `loadWarn`/`loadCrit`/`tempWarn`/`tempCrit`/`vramWarn` (SystemOverview) | `warn.load`/`crit.load`/`warn.temp`/`crit.temp`/`warn.full` (+ `crit.full` from theme) |
| `groupWarn`/`groupCrit` (SensorGroup) | `warn.value` / `crit.value` |
| `warnDb`/`clipDb` (MeterBridge), AudioMeter hot | `warn.db` / `crit.db` |
| `trackNWarn`/`trackNCrit` (StatusTracker) | `track.N.warn` / `track.N.crit` (per track, blank = theme `load`) |
| text thresholds, blank = off | number, `"off"` = off |
| own value equal to the **old widget default** | dropped (so the widget follows the theme) |
| `cpu`, `gpu`, `disk`, `adapter`, `drive`, `device`, `liveSource` | `device` (`""` → absent) |
| `channels` (MeterBridge), `liveSources` (NowPlaying) | `devices` |
| `units` (Weather, Forecast: C/F) | `tempUnit` (c/f) |
| `decimals` (SystemOverview "0"/"1", SensorValue "", 0–4), `groupDecimals` (text) | `decimals` (auto, 0, 1, 2; 3–4 kept for SensorValue) |
| `rateUnit` | same, now themed |
| `meterBallistics` | same, now themed (Motion) |
| `showSeconds` | same, label "Seconds" everywhere |
| `island` + options | same keys, always in Behaviour > Dynamic Island |

Dropping own values equal to the old default matters: CpuMonitor's 75/90 default would otherwise not follow the theme's 80/92. Do it only for keys that become themed.

### 6.3 Sample widgets (fully drawn in the concept)

| Widget | Renames | Placement changes |
|---|---|---|
| SystemOverview | thresholds per §6.2; `*Color` get roles | Sections, CPU, GPU, Memory, Drives in Show (each only for its section); labels → More of each section; Drives filter → Data; Trends → Behaviour; header = title-only |
| NowPlaying | `waveformVariant` → `vizStyle`, `liveSource` → `device`, `vizRamp` → `vizColor1`, `waveformSensitivity` → `vizGain`, `visualizerBarCount` → `vizBars`, `visualizerAlign` → `vizAlign`, `visualizerOrientation` → `vizOrientation`, `visualizerMinLevel` → `vizMinLevel`, `waveformLineWidth` → `vizLine`, `waveformFadeEdges` → `vizFade`, `waveformFadeWidth` → `vizFadeWidth` | Player + Visualizer (Show), viz colours (Widget colors), Player source + Visualizer audio (Data), dynamics + island (Behaviour). Viz rows only when Progress style = Visualizer. `LEGACY_ONLY` keys read once by the migration, then removed |
| SensorGroup | `auto` → `mode` (pick / auto); `groupDecimals` → `decimals`; `groupWarn/Crit` → `warn.value/crit.value`; `groupMax` keeps its key (Data > Bar scale, slider, 0 = Auto) | Sensors list with inline per-sensor override (tune button) in Data |
| AudioMeter | hot → `crit.db`; `device` unchanged | Meter + Details (Show), Level / Hot colours (Widget colors), Device (Data), Audio level threshold + Motion (Behaviour) |
| Weather | `units` → `tempUnit` | `view` preset sets the toggles in place and reads Custom when they diverge; `tint` → Widget colors; Source → Data; island → Behaviour |
| CpuMonitor | `cpu` → `device`; `warn/crit` → `warn.load/crit.load` | Threads (Show), heat ramp (Widget colors), Processor (Data) |
| Uptime | — | Time section in Show; Data disabled |
| SteamProfile | — | Show = Header + Fit; Data shows a read-only source status row |
| WebPage | `base: []` → `styleSubset: ['colors:accent', 'spacing:scale,radius', 'border']` | Page section only; no Header, no Fit |

### 6.4 Filing the remaining 45 widgets

Apply mechanically, then review the list in §6.3 of the reference:
1. `type: sensor | sensorItems` or a device kind → **Data**. Rows with `tab: 'data'` today → Data.
2. Colour rows → **Style > Widget colors** with a role (§4.3). Look-only toggles (tint, ramps, scrim) → Widget colors, `perWidget: true`.
3. Thresholds, history/sample length, sort order, ballistics, dynamics, intervals, click behaviour, island → **Behaviour** (sections: Thresholds, History, Dynamics, Interaction, Dynamic Island).
4. Everything else → **Show**, in a section named after what it controls ("Threads", "Forecast", "Tiles") — never "Content" and never the widget name.
5. `advanced` → `more`.
6. Preset bundles that write hidden keys (`Bluetooth.view`, `Weather.view`, `FpsMonitor.view=trend`) → type `preset`: show the toggles they write, highlight the matching preset, else "Custom".
7. Hidden schema rows (CustomGauge `gauge`) stay out of the schema list (`hidden: true`).

## 7. Theme editor

- Entry: Studio > Theme (profile), and dashboard settings > Theme. Same inspector component, no Show tab.
- Scope list: Profile theme (name, resolution) · each Dashboard.
- Style tab adds **Status & series colors** (palette roles) after Colors. Data = Units & format (all four rows). Behaviour = Thresholds (all quantities) + Motion.
- Middle column: live previews of three representative widgets resolved with the current values, each with its source chips (Theme / Custom / Locked per section), and **Who doesn't follow the theme**: per section, the widgets on this dashboard with a custom section, with **Reset to theme** (sets their follow back to true, keeps own values).
- Lock is profile-only.

## 8. Panel widget kinds

Panel items use the same tabs and the same row/section components, sourced from `KIND_TABS` (concept data):

| Tab | Sections |
|---|---|
| Show | Kind (10 chips) · Content (label, clock show, static text, shape, table rows) · Size & placement (width hug/fill/fixed, align self; More: span, row span) |
| Style | Typography (follow panel: font size, text align) · Color (follow panel; role accent) · Custom CSS (More: class names, CSS) |
| Data | Binding (sensor; More: sub sensor) · Units & format (follow theme: unit, decimals, maximum, More: multiply by) |
| Behaviour | Thresholds (**new**, follow theme, stat/value/bar/gauge) · History (sparkline) · Fill (invert) |

Follow chain: item → panel → dashboard → profile. Changing Kind keeps the `convertKind` fields; sections that don't apply to the new kind disappear.

New field: `thr?: {warn?: number|'off', crit?: number|'off'}` on numeric `Widget` items; colours the value / fill with theme warn / crit.

## 9. QA checklist

- [ ] Every one of the 54 widgets has the four tabs; empty tabs are disabled, never blank.
- [ ] No widget shows `autoScale`, `variant` or `compactView`.
- [ ] Header section absent on the 8 no-header widgets; title-only on Clock and SystemOverview.
- [ ] Small zones omits Card on the 8 widgets without a compact descriptor.
- [ ] Changing the profile accent repaints every following widget; a widget with Colors = Custom keeps its accent.
- [ ] Locking Thresholds in the profile replaces Customize with "Locked" in every widget and the theme preview ignores own values.
- [ ] Use theme then Customize restores the previous custom values.
- [ ] tempUnit = f in the profile turns Weather, Thermals, SystemOverview and SensorGroup temperatures to °F and the temperature threshold scale with them.
- [ ] Migration: a v4 config with `styleMode: 'follow'` and own accent loads with Colors following and the accent kept; CpuMonitor with stored warn 75 keeps 75 (custom), unstored follows 80.
- [ ] Search finds More rows and opens them; Changed counts only own values that apply.

## 10. Not covered / open

- Off chip on the threshold sliders and the multi-device checkbox list are specified but not drawn.
- The 45 other widgets are filed by rule (§6.4), not drawn.
- Whether `compact` should be a dashboard-level default (it is per zone here).
- Sheet (phone) tile labels for the new sections: `short` values Header, Fit, Skin, Colors, Widget, Surface, Type, Spacing, Border, CSS, Format, Alerts, Motion, Island.
