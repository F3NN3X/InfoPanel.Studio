# InfoPanel import lab

Phase 0 of the `.infopanel` import (`docs/infopanel-import/PHASE0_PLAN.md`): parse InfoPanel exports and redraw
them at native size, then compare against InfoPanel's own render. Nothing here is imported by `src/`, and nothing
here reaches `npm run build`, `desktop:build` or the app's `tsc -b`.

| Command | What it does |
|---|---|
| `npm run lab:extract -- [folder]` | Extracts every `.infopanel` in `folder` into `corpus/` (gitignored) |
| `npm run lab` | Lab page on <http://localhost:5174> |
| `npm run lab:test` | The lab's Vitest suite |
| `npm run lab:typecheck` | `tsc` over `src/` with the lab's own tsconfig |

The default corpus folder is `G:\win_user-folders\Downloads\infopanel-profiles`; override it with the argument or
`INFOPANEL_CORPUS`. Tests that read the corpus skip when it has not been extracted.

Layout: `src/` holds the lab code and its tests, `scripts/` the Node tools (run with Node's built-in type
stripping, so they can import `src/*.ts`).

## Parser (P0.2)

| File | Role |
|---|---|
| `src/zip.ts` | Read-only zip reader (`DecompressionStream`) |
| `src/xml.ts` | Minimal XML reader for XmlSerializer output, no DOM needed |
| `src/schema.ts` | Every serialized field per item type, with C# defaults and setter checks; the types derive from it |
| `src/parse.ts` | `Profile.xml` / `DisplayItems.xml` → typed items plus an issue report |
| `src/archive.ts` | Opens a `.infopanel` or extracted folder; assets stay lazy |

Parsing follows XmlSerializer: a missing element keeps the C# default, a value a setter rejects keeps the default,
and the first occurrence of an element wins. Where InfoPanel would refuse the whole file (a bad number, an unknown
enum or item type) the lab keeps going and reports it. Fields from other InfoPanel versions are kept in
`item.unknown` and reported.

`src/corpus.test.ts` checks every corpus profile against `src/__fixtures__/corpus-expected.json`, an independent
survey written by `python -I lab/infopanel/scripts/corpus-expected.py`. Re-run it after the corpus changes.

## Sensors and text (P0.4)

| File | Role |
|---|---|
| `src/dotnet-format.ts` | .NET number and date formatting (en-US), checked against real .NET 8 output |
| `src/sensor-text.ts` | Sensor, Clock and Calendar text and threshold colour, ported from `SensorDisplayItem.cs` |
| `src/sensors.ts` | Binding → Data API key: exact `ref`, plugin key, HWiNFO name fallback; Data API value → reading |
| `src/SensorPanel.tsx` | Lab panel: every bound item with its match and text, live from :3921 or from mock sliders |

`npm run lab:map` maps every corpus profile against the live Data API and prints how each binding matched.
`dotnet run lab/infopanel/scripts/dotnet-reference.cs` regenerates `src/__fixtures__/dotnet-reference.json`.

Two .NET rules worth knowing: the custom patterns InfoPanel formats values with (`0.00`) round 15 significant
digits half away from zero (`2.675` → `2.68`), while the standard `N2` used for the thousands separator rounds the
exact binary value half to even (`2.675` → `2.67`). A negative value that rounds to zero prints `-0`.

## Fonts (P0.5)

InfoPanel picks typefaces through Skia and DirectWrite, whose family and style names cannot be derived from font
files alone (style names are localized: Arial's styles are "Normal", "Negreta", "Cursiva" here). So the ground
truth comes from InfoPanel itself:

1. `npm run lab:fonts` extracts the font packs (only font files) to `fonts/packs/`, indexes installed and pack
   fonts, and collects every font request in the corpus into `fonts/requests.json`.
2. `dotnet run --project lab/infopanel/tools/skia-fonts -p:Platform=x64 -- lab/infopanel/fonts/requests.json lab/infopanel/fonts/skia-reference.json`
   runs InfoPanel's own `SkiaGraphics.CreateTypeface` for each request and copies the exact font file Skia draws
   with to `fonts/faces/`. It builds against an InfoPanel checkout that is not running (default: the
   `infopanel-pr173` worktree; override with `-p:InfoPanelProject=...`).

`fonts/` is machine-specific and gitignored. `src/fonts.ts` ports the selection logic over Skia's font list and is
tested against `skia-reference.json` when it exists; `src/font-loader.ts` gives the browser the exact face files.
The lab page's Fonts panel lists each request with the face InfoPanel draws, how it got there, and missing fonts
with the pack that has them.

### Missing fonts

`npm run lab:font-get -- --missing` lists the corpus fonts not installed here and where to get them free;
`npm run lab:font-get -- "<family>" [--install | --uninstall]` downloads to `fonts/downloads/` and optionally
installs or removes it for the current user. The Fonts panel shows the same candidates with a preview. Sources and
caveats: `docs/infopanel-import/research-font-sources.md`.

## Renderer (P0.6)

The lab page draws the chosen profile under its summary: positioned DOM at the profile's size, in InfoPanel's
draw order. Pick the sensor source in the Sensors panel: **Unbound** (InfoPanel with no sensors), **Live** (the
Data API on 127.0.0.1:3921, graphs fill as it polls) or **Mock** (sliders).

- `src/render/geometry.ts`: C# numerics, shape paths, bar, graph, donut, gauge frame and gradients (pure, tested).
- `src/render/scene.ts`: items to draw nodes; sensors, images and time come from the caller (tested).
- `src/render/Paint.tsx`, `Text.tsx`, `ProfileView.tsx`: SVG and DOM output, fonts via `font-loader`, images from
  the export's assets or their URLs.

Checked against InfoPanel's screenshots of ARCv2_WIDE, Catppuccin_Mocha, Dashboard and Umbrella_V.2 in Live mode:
layout, fonts, charts, gauges, images and placeholders match. Plugin bindings are portable, so those screenshots
show plugin values; compare in Live, not Unbound. Notes:

- Text: RichTextKit's line height is ascent + descent + leading, as CSS `line-height: normal`. Wrap (one line)
  with Ellipsis trims characters ("Moderate R..."); missing glyphs fall back to Segoe UI.
- The view is nudged onto whole device pixels; at a fractional offset half-pixel strokes blur and overlapping
  frames stop covering each other.
- Not modelled: the gradual contraction of AutoValue ranges, bar/donut/gauge smoothing between frames, video and
  RTSP images (drawn as the placeholder), the FPS overlay. Glow blend modes CSS lacks draw normally.
- Tables from the Data API are approximate: it flattens a plugin table to text, without column names, and a cell
  holding ", " splits. A structured table in the Data API would fix both (input for P0.8).
- No corpus profile turns on a shape gradient; all six types were checked with a synthetic profile.
