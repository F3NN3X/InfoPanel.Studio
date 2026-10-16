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
