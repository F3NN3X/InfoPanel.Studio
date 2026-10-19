# Status

Implemented (see `SPEC.md`), in PRs #67-#71, #72 and the docs PR that adds this file. Config versions 6-9. The docs describe the shipped behaviour: `docs/widget-settings.md` (schema, standard block, shared sections, the theme, shared controls), `docs/architecture.md` (Style resolution, Studio inspector, Adding a setting), `docs/customization-guide.md` (Where the options are, Widget theme, Theme editor, Thresholds, Editing widgets).

| PR | What |
|---|---|
| #67 | Schema metadata and the four tabs (Show · Style · Data · Behaviour), More replaces Advanced |
| #68 | Theme model, follow / customize / locks, config v6 |
| #69 | Shared controls (thresholds, device, small zones, units & format, align) and key migrations, config v7 |
| #70 | All 54 widgets refiled, config v8 |
| #71 | Theme editor with per-section locks and previews |
| #72 | Panel items get the four-tab inspector and thresholds, config v9 |
| docs | Docs, this file, the Gauge panel widget's own ring size (still v9, unreleased) |

## Deviations from the spec

- **Levels:** the spec's Profile is `MonitorProfile.widgetTheme` and its Dashboard is a page (`ProfilePage.widgetTheme`). The existing all-profiles `DashboardConfig.style` stays as a base layer under the profile, with no locks; the theme editor lists it as "All profiles".
- **`THEME_DEFAULTS` is today's defaults**, not the concept's mockup values, so nothing repaints on upgrade (rows fall back to their own default before `THEME_DEFAULTS`).
- **Threshold defaults shift** to the spec's: load 80 / 92, temperature 80 / 90, fullness 85 / 95, audio level -9 / -2 dB. Unstored defaults moved for System status and CPU monitor load, Drive space (and its island source), GPU monitor temperature, System overview VRAM, Meter bridge and Status tracker tracks 1-2 (listed in the CHANGELOG); stored levels are kept.
- **SensorValue and SensorGroup value thresholds are off** by default, not the theme's 70 / 90 (render parity). SensorValue always uses the `value` quantity: the spec's degree-unit to `temp` split needs the bound sensor's unit.
- **Lone-axis align is kept:** `alignX` / `alignY` migrate to `align` only when exact (both axes, or a lone "between" as `alignSpread`). A single axis stays under the old keys, still themed in Size & spacing.
- **Clock row default is 24** (parity); the theme's `clock` default is auto (locale). General's 12-hour setting migrated into the theme's `clock` and is gone.
- **`accent` is not a palette role:** the `accent` role maps to the Colors accent, so such a row follows Colors, not Widget colors, and the editor edits it in Colors.
- **Locks are per profile:** the old All-profiles Force, which locked every profile at once, has no one-click equivalent. A locked section is the profile's on every page too.
- **Panel items:** thresholds are off until a theme level sets the quantity's levels (not the theme default 80 / 92); temperatures compare raw, without a °F conversion. A panel item section is custom when the widget already has own values there. The Custom gauge kind chip shows only on a widget that already is one.
- **Extra rows kept** beyond the data file because stored values stay editable: System overview `netLabel`, Now playing `vizFadeWidth` / `vizGradient` / `vizColor3` / `vizGlow` / `vizTilt` / capture `devices` / shape "segments", panel items' table columns and header, image max height, shape thickness, height, grid start column and row, overlay band and background, decimals above 2.
- **Row-less keys:** Now playing's `vizMinPx` and `vizScrollAs` are read by the renderer but have no row.
- **Uptime's Data tab** lists no sources and is disabled; Steam profile's Data tab shows a read-only status row.
- **Thermals** gets "Use sensor limits" (on); a pair with one level set migrates to fixed levels (the other the CPU sensor's old limit).
- **Audio meter** has `warn.db` / `crit.db` (defaults 20 log10 of 0.72 and 0.9 relative to full scale).
- **Panel Gauge size:** the plain `gauge` kind has its own `size` field (the spec leaves it on Font size); config v9 moves `fontSize` to it.

## Left for after the next release

- **Old-key readers and fallbacks:** `src/modules/setting-readers.ts` (`compactOf`, `sizeTierOf`, `alignOf`, `thresholdsOf`, `deviceOf`, `devicesOf`, `tempUnitOf`, `decimalsOf`, `clockOf`) still falls back to `variant`, `compactView`, `layout`, `alignX`, `alignY`, `warn`, `crit` and the device keys; `PROFILE_STYLE_KEYS` and the v6-v9 migrations stay with them. Remove them together once a tagged release contains PRs #67-#72, so configs from that release are migrated first.
- **One-axis align:** decide how a lone `alignX` or `alignY` is represented (the 9-cell has no half-auto) before dropping the keys and `alignOf`'s fallback.
- **Multi-select quick bar:** takes follow state from the primary zone only; an edit is also written to following zones (no visible effect).
- **Smaller:** `resolveStyle` honours `perWidget` only through the schema (`defs`); `appearance-actions` `isForced` / `enforceKey` are used by tests only; the e/d schema tests pin props, not groups.
