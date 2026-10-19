# Dashboard targets for an InfoPanel import — reference

Compiled 2026-10-16 from a read-only sweep of this repo. Citations are `file:line` at `47b691c`.

## Prior art (retired)

The dashboard once had a 1:1 InfoPanel model and free canvas. Commit `506c1d4` (2026-10-08, "One zone-based studio:
retire the free-canvas editor") deleted it with "No import path". To recover the files:
`git show fffb966:<path>`.

| Commit | What |
|---|---|
| `ea1a63f` | IP model plus an XML importer (`tools/ip-import.cjs`, which still exists) |
| `1a2b45d` | Free-canvas renderer: `src/lib/ip/{history,format}.ts`, `src/components/ip/{items,ip-canvas}.tsx`, .NET AARRGGBB colors |
| `a57b220` | Free-canvas studio editor |
| `88acd2a` | `.infopanel` round-trip: `src/lib/ip/xml.ts` (C# element order), `zip.ts` (STORE writer, deflate-raw reader) |
| `fffb966` | C# render parity fixes: ShowName, inverted Wrap, precision table, thresholds, gauge size, bar, donut, graph |

What was removed at `506c1d4`:
- `src/lib/ip/`: types 372 lines, xml 771, zip 206, format 150, libre 183, defaults 257, ops 243, history 55.
- `src/components/ip/`: items 724 lines, ip-canvas 91.

What survives:
- `tools/ip-import.cjs` (483 lines, line-based XML; its target `src/lib/ip/imported/` is gone).
- `src/lib/__fixtures__/arcv2-profile.ts` (arcv2 rebuilt as a 3x3 grid of overlay panels).

## Layout model

- dashboard → profile → page → zone (`docs/redesign/DATA_MODEL.md:5-23`).
- A profile (`layout.ts:112-167`) has width, height, cols, rows, fit (`scroll`, 120 px rows, or `fill`), pages,
  gap, padding, style, theme and background.
- A zone (`Placement`, `layout.ts:65-94`) has module, colStart/rowStart/colSpan/rowSpan, settings, design, panel and
  styleMode.
- There is no free or absolute positioning; zones sit on a uniform grid.
- **Panel JSON** (`src/lib/panel-model.ts`):
  - `PanelDef` (126-189) has layout stack/grid/overlay/wrap, direction, justify, align, gap, padding, fit, css and
    widgets.
  - `Widget` (54-114) has the kinds stat, value, bar, gauge, sparkline, table, text, image, clock and shape, plus
    sensor, unit, decimals, scale, color, max, fontSize, align, a box (41-52) and css.
  - Panels have no x/y, rotation, z-order or nesting.
  - Panels have no per-widget weight, italic, uppercase, marquee or glow, no image-sequence gauge, and no bar frame
    or gradient.
- `normalizePanel` (220) keeps unknown keys. `parsePanelJson` (445) rejects unknown kinds, so a new kind must be
  added to `WIDGET_KINDS` (340).

## Sensor data

- The browser reads InfoPanel's Data API directly (`data-api.ts:7`, default `http://127.0.0.1:3921`). `server.mjs`
  does not proxy sensors.
- Endpoints: `/events?prefix=<ns>` (SSE), `/api/sensors`, `/api/sources`, `/api/images/{plugin}/{image}`.
- The store is `sensor-store.ts` (MAX_STREAMS = 4). A widget reads `sensorAt(sensors, key)` (`WidgetView.tsx:608`).
  The value shape is `{value|text, unit, name, min, max, source}`.
- Key formats:
  - `system.*`
  - `libre.<slug of display name>`, e.g. `libre.amd_ryzen_9_9950x3d_core__15`
  - `plugins.<pluginId>.<container>.<entry>`, e.g. `plugins.yr-weather-plugin.brevik-norway.weather_desc`
  - `spotify.*`
- Live check, 2026-10-16: `/api/sensors` has 378 libre, 341 plugins, 6 spotify and 5 system keys.
  **Libre entries do not carry the Libre identifier** (`/gpu-nvidia/0/load/3`), only the name. HWiNFO keys do not
  occur.

## Assets

- `POST /api/assets` with raw bytes and the header `X-Dashboard-Asset: 1`. Writes are loopback only.
- Stored as `<sha256>.<ext>` and referenced as `/api/assets/<id>`.
- Limits: 25 MB per image, 300 MB per video, 2 GB total. Formats: png, jpeg, gif, webp, avif, mp4, webm.
  **SVG is refused.**
- Client: `src/lib/assets.ts` (`uploadAsset`, `ASSET_LIMITS`). Server: `server/assets.mjs`.

## Import / export and config

- `src/components/studio/config-file.ts`: `importConfigText` (28) replaces the whole config through `mergeConfig`.
  There is no per-profile import.
- `CONFIG_VERSION = 4` (`layout.ts:179`). `mergeConfig` (442) runs `migrateAssetUrls`, `normalizeProfile` and
  `migrateProfileZones`. The server rejects a version downgrade (409).
- Optional additive keys need no version bump.

## Fonts

- `src/lib/fonts.ts:23-81` holds `FONT_CATALOG`: 5 system stacks plus about 25 Google fonts, loaded lazily by
  `ensureFont` (106).
- There is no custom or local font support and no `@font-face`.
- InfoPanel font family names need a mapping or a new "custom family" option.
