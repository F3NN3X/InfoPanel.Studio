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

`npm run lab:map` maps every corpus profile against the live Data API and prints how each binding matched,
plus the remap step's result per profile (`-- --suggestions` lists each suggested key).
`dotnet run lab/infopanel/scripts/dotnet-reference.cs` regenerates `src/__fixtures__/dotnet-reference.json`.

Two .NET rules worth knowing: the custom patterns InfoPanel formats values with (`0.00`) round 15 significant
digits half away from zero (`2.675` → `2.68`), while the standard `N2` used for the thousands separator rounds the
exact binary value half to even (`2.675` → `2.67`). A negative value that rounds to zero prints `-0`.

## Fonts (P0.5)

InfoPanel picks typefaces through Skia and DirectWrite, whose family and style names cannot be derived from font
files alone (style names are localized: Arial's styles are "Normal", "Negreta", "Cursiva" here). So the ground
truth comes from InfoPanel itself.

When InfoPanel runs the fork's `feature/data-api-tables-fonts` build (L3), the lab asks it live:
`POST /api/fonts/resolve` returns the face InfoPanel draws each request with (and whether it is a fallback, i.e.
the font is missing), and `GET /api/fonts/{id}` serves that face's file. The Fonts panel's "Via" then reads
`data-api`. Without the endpoints, the reference file below is used:

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

### Font library and the canvas (L4)

The Fonts panel and the canvas share one plan (`src/useFontPlan.ts`, `src/font-supply.ts`):

- Per request, InfoPanel's answer first. A font InfoPanel draws with another family is listed under **Missing
  fonts** (a legacy or variant name it resolves to its family, such as "Spotify Mix Extrabold", is not).
- For a missing font, the canvas draws a face from the **library** when one fits: the corpus packs
  (`fonts/packs`), files added with **Add fonts** (ttf, otf, ttc, or a zip pack; every file is checked by the sfnt
  parser, anything else is listed as skipped), and **Get from Fontsource** downloads (with their license). The
  match is the one InfoPanel would make if the library were installed, then, for badly named files, faces whose
  names start with the requested family. Each such row can be switched back to InfoPanel's fallback.
- Fontsource's static Nunito Sans files are instanced from the variable font and named "Nunito Sans 12pt
  ExtraLight 12pt", so installing them would not fix InfoPanel either; the canvas uses them fine.

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
- Tables use the Data API's structured `table` (column names, whole cells as InfoPanel draws them) when InfoPanel
  runs the fork's `feature/data-api-tables-fonts` build (L3); otherwise the flattened text, without column names,
  where a cell holding ", " splits.
- Dashboard's fans use animated Spiral gradients; all six types were also checked with a synthetic profile.

## Comparison (P0.7)

Corpus profiles with a screenshot of InfoPanel's own render (`npm run lab:extract` attaches a `.png` from the
corpus folder whose name matches the profile, allowing one typo, and whose size matches) are marked in the
picker. The compare panel lays the screenshot over the render with an opacity slider and a difference blend
(any other screenshot can be loaded from a file). Results: `FINDINGS.md`.

## Editing (L1)

The compare panel is also the editor (`src/editor/`). Edits stay in the page; nothing is written back yet.

- Click an item on the canvas or in the tree to select it; Shift or Ctrl adds (Shift in the tree selects a
  range). Drag to move, drag a handle to resize (one unrotated, unlocked, non-group item). Locked items select
  but do not move.
- Toolbar and keys: Undo `Ctrl+Z`, Redo `Ctrl+Y`/`Ctrl+Shift+Z`, Duplicate `Ctrl+D`, Group `Ctrl+G`, Ungroup
  `Ctrl+Shift+G`, Delete, Up/Down (draw order), arrows nudge 1 px (Shift 10). Keys never fire while typing in a
  field. A drag, a nudge, or a field change is one undo step.
- The tree's checkboxes set InfoPanel's own `Hidden` field (undoable).
- The inspector lists every schema field of the item's kind, grouped (`registry.ts`); text fields commit on
  Enter or leaving the field. A value InfoPanel's setter would ignore is shown as an error and not stored.
  Fields the lab does not know are kept and shown read-only.
- Resizing writes InfoPanel's fields: images and gauges divide by `Scale`; text keeps an automatic (0) height.

## Installed profiles

The picker's "Installed in InfoPanel" group lists the profiles of the InfoPanel on this machine. The dev server
(`local-data-plugin.ts`) reads them live and read-only from `%LOCALAPPDATA%\InfoPanel` (or `INFOPANEL_DATA_DIR`):
`profiles.xml`, `profiles/<guid>.xml` and `assets/<guid>/`, served in the corpus layout so everything else works
the same. Images with absolute paths outside that folder draw the placeholder, as on any other machine.

## Sensor remap (L2)

**Remap sensors** (live mode) lists the profile's bindings grouped by the sensor they read (`src/remap/`); one
choice fixes every item in the group, and the item count selects those items on the canvas.

- Each group resolves in order: your choice, then the automatic mapping (exact `ref`, plugin key, HWiNFO name),
  then a suggestion when exactly one candidate is strong. Strong means the same Libre reading type and hardware
  family with the same sensor name (an AMD GPU's "GPU Core" temperature → the NVIDIA one's), or the same plugin
  and reading under another instance (another drive letter, network adapter or weather location).
- Name matches and suggestions are shown as "check" until confirmed (one by one or all at once); groups with no
  candidate are "unresolved". A group can also be left unbound on purpose, or reset to the automatic result.
- The key picker shows suggestions ranked for the group, or searches keys, names and refs (every word must
  match, the group's best fits first), with live values; arrows and Enter pick.
- Choices live in the page for now; the stored form (a key per item, the original binding kept) is L8.
