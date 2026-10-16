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
caveats: `docs/infopanel-import/research-font-sources.md`. Font Squirrel sends no CORS headers, so the page reaches it
through the dev server (`font-proxy-plugin.ts`, Font Squirrel URLs only), which keeps its catalogue in
`fonts/fontsquirrel-list.json` for a week; while Font Squirrel throttles (an empty 202) the panel lists it as
unavailable.

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
- Gauges follow AnimationSpeed as InfoPanel does: the shown frame moves toward the value at that many frames a
  second, the next frame crossfaded over it (L7).
- Not modelled: the gradual contraction of AutoValue ranges, bar/donut smoothing between frames, video and
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

## Native mode (L5)

Any item can be drawn as a dashboard widget instead (`src/native/`): the item's **Draw as a dashboard widget**
switch in the inspector, or **All native where possible** / **All InfoPanel** in the toolbar (one undo step). The
widget is the app's own `WidgetView` (imported read-only through `@/`, with the app's CSS and default theme), at
the item's position and size and in its draw order, reading the remapped sensor key (live mode). The item keeps
all its InfoPanel fields, so switching back is lossless.

- Text → text, Sensor → value, Clock/Calendar → clock, Bar → bar, Graph → sparkline, TableSensor → table,
  Image/HttpImage → image, plain rectangles and circles → shape. The inspector lists what each conversion loses
  (font, thresholds, frames, formats, ...).
- Where the app's widgets fall short, the lab draws a **studio prototype** of the missing capability (L11) and the
  conversion names it under *needs in the app*; the import report sums these up as the app work native mode asks
  for. Rotation and flip turn the widget about its box (as InfoPanel does, flip first); marquee text scrolls when
  wider than its box; vertical bars and donuts are drawn by the custom gauge widget (a vector spec from the item);
  capsules, ovals and polygons by a shape widget from InfoPanel's own geometry; image-sequence gauges show the
  frame for the value (no AnimationSpeed easing); images at their natural size take the file's size. A vector
  gauge (L7) is the custom gauge widget too.
- **Text and bars as InfoPanel draws them** (L14). Text, Sensor, Clock, Calendar and TableSensor items keep their
  widget kind for the app, and are drawn meanwhile by a text prototype: InfoPanel's font (the lab's font plan),
  size × FontScale, colour with alpha, bold / italic / underline / strikeout, alignment, Width and wrapping, at
  X / Y, ending at X when right-aligned without a Width; the text is InfoPanel's own (a sensor's name, unit,
  precision, modifiers, value type and threshold colours; a clock's format; Uppercase only on clocks and dates,
  as InfoPanel does), and tables keep their column widths and row step. Every bar, horizontal or vertical, is the
  bar generator's bar (`barSpec`): the frame as a 1 px border that insets it, background, corner radius on both,
  and a gradient from Color (held to the middle) to GradientColor over the filled part. Still lost: a vertical
  bar's gradient direction (InfoPanel runs it across), colour transparency of bars, AutoValue.
- Stays InfoPanel, with the reason: glow, gradient shapes, threshold images, RTSP, images whose size is unknown
  (URL images at their natural size).
- Graphs are still the app's sparkline (it adds a label row and an area fill).

## Assets (L6)

The **Assets** panel (`src/assets/`) manages the profile's files. The export's `assets/` are read up front into a
table that lives in the editor's history with the items, so every asset edit, with the item fields it changes, is
one undo step. Nothing is written back yet.

- Each file with a preview, its type and pixel size (read from the file's header, not its name), size and uses (an
  image item or a gauge frame; the count selects them). Images loaded from URLs or absolute paths are listed apart.
- **Add files** stores files under a free name; bytes already in the profile are not stored twice. **Use for
  selection** points the selected image items at a file. **Replace…** puts new bytes under the same name, so every
  use follows; another type (a PNG replaced by a JPEG) takes the new extension and every use is repointed.
  **Remove** on a used file also clears its uses' FilePath.
- Cleanup: unused files, identical files (merged into the plainest name, uses repointed), files larger than drawn
  (1.5× the largest drawn size in both directions, when every use fixes a size; natural-size uses draw the whole
  file) or over 1 MB, and uses whose file is missing. **Downscale** re-encodes a still image at the drawn size
  (JPEG and WebP stay lossy at 0.92, others become PNG) and keeps it only when smaller. Animated files are not
  re-encoded.
- Fonts as assets: the library files that draw something, plus every added or downloaded one, with origin,
  faces, size, license (the source's, else the font's own name table, with its URL) and embedding permission
  (OS/2 fsType); missing families select their text items. Added and downloaded fonts can be removed. Re-run
  `npm run lab:fonts` for pack sizes and licenses.
- Polish (L12): **Optimise images** re-encodes every still image (same type, or WebP, at a quality; size kept,
  capped on the longest side, or a percent; never grown) in one undo step, keeping a file only when it is at
  least 5 % smaller. **Replace by name** matches picked files to the profile's by name (or by a unique stem when
  the type differs), lists matches, files already the same, unmatched and ambiguous names, and replaces the
  matches in one undo step. The fonts table reviews each licence (may share, check, do not share) and the
  export's save note names the supplied fonts to review before sharing it.
- Native image widgets load the lab server's URL of the export's own file; a file edited or added in the lab has
  none, so those items stay InfoPanel (the app phase serves them from the asset store).

## Gauges (L7)

The **Gauges** panel (`src/gauges/`) lists the profile's gauges; selecting one (there or on the canvas) opens it
with a preview at any value (slider or **play**), drawn as InfoPanel would: the frame for the value, moving at
AnimationSpeed with a crossfade. Every change is one undo step.

- **Retime**: AnimationSpeed (frames per second; 0 jumps at once). **Frames**: move, duplicate, remove or replace
  one frame, reverse all, resample to a frame count (picked evenly, first and last kept). **Recolour**: hue,
  saturation and brightness, previewed live, applied to every frame as new PNG files (animated frames are refused).
  Replaced frames stay in the assets until the cleanup removes them.
- **Vector gauges** (`vector.ts`): arc or bar, segments, solid / gradient / zone colours (placed over the whole
  range, not the filled part), track, needle or marker, ticks, reverse. Ideas from the user's gauge creator
  (`v0-themely-resource-creator`, Canvas 2D, 101 PNG frames); rewritten as pure SVG geometry. A new one starts from
  a starter; **Convert to vector** puts a spec on an imported gauge. The spec lives in the lab field `vector`.
- A vector gauge needs no frames: the canvas draws it live at the value, moving at AnimationSpeed percent of the
  range a second (what 101 baked frames would do in InfoPanel), and native mode draws it as the studio's custom
  gauge widget (a prototype; the app's widget is an app phase) with nothing lost. **Bake** is only for InfoPanel:
  it renders N PNG frames (frame i at i / (N − 1) of the range, the one InfoPanel picks); the list says when
  there are none or they are out of date. **Back to frames only** drops the spec and keeps the frames.
- **Gauge parts** (L10, `parts.ts`, `VectorParts.tsx`, shaped for the app's widgets): colours can be theme colours
  (accent, warning, critical, text, muted, track: the widgets' `--accent`, `--w-*` variables, live in the studio and
  their dark-surface values when baked); a threshold fill uses the ok colour below `warn`, then warning and critical,
  like the widgets' tone; a scale (min, max, unit, decimals: automatic is one decimal below 10) feeds tick labels,
  value text (`{value}{unit}`) and thresholds, independent of the item's MinValue / MaxValue. Also minor ticks,
  needle styles (taper, line, arrow, blade), a background (disc or rounded rect, with a border), glow around the
  fill, a drop shadow and track opacity. Text may use any installed font. Every part is optional: specs from before
  keep drawing (and their baked frames stay up to date). One renderer (`vector-svg.ts`) draws live and baked
  gauges. Presets in `presets.ts`; **Export spec** / *from a spec file* save and load one gauge as `.gauge.json`.
- **Later parts** (L13, `shapes.ts`, `VectorShapes.tsx`; the gauge creator's, as geometry): shape **liquid** (a
  round, rect, diamond or point-up hexagon container filled with the track, the liquid clipped to it at the value,
  a wave of a height and count that drifts live, an optional shine along the surface and bubbles rising to it;
  baked, the bubbles stay put, spread through the liquid) and shape **grid** (rows × columns of square, rounded or
  round cells with an optional border, lit from the bottom left along the rows or up the columns, or in a stable
  random order, or from the middle out; each cell coloured by its place in that order); **rings** outside an arc (decoration
  fading outwards, as in the creator: the value does not drive them); a **pattern** over a bar's continuous fill
  (stripes, dots or chevrons, optionally moving along the fill); a row of **icons** instead of a bar (each lit in
  turn, the one at the value partly when progressive); a **centre icon**. Icons are the app's widget icon set
  (lucide, `src/lib/widget-icons.ts`). Motion is live only; baked frames are still. Not ported: the creator's
  reflection (never drawn there) and its blinking "activity" and "wave" grid fills (not driven by the value alone).
- The lab draws gauges with the widget colour variables set as the app's Widget shell sets them: the lab page's
  own `--accent` is a shadcn HSL triple, which drew theme-coloured parts black.
- **SVG templates** (L9, `svg-template.ts`, `SvgTemplateView.tsx`): shape "SVG template" takes the user's own SVG file
  (starter: an animated dial). It reads `var(--value)` (0–1) and `var(--percent)` (0–100, whole), set on its root
  element (reverse applies). The studio draws it live in a frame sandboxed without scripts, so its CSS and SMIL
  animations run and the value changes without a reload; baking draws it as an image at each frame's value.
  Loading sanitizes it (again when drawn): scripts, foreign content, event handlers and references outside the
  file (links, `url()`, `@import`; embedded PNG, JPEG, GIF and WebP stay) are removed and listed. Up to 256 KB.
- **Library** (`library.ts`, `gauge-library-plugin.ts`): saved by the lab dev server in `gauges/` (gitignored):
  `library.json` and each frame once by SHA-256 (the server checks the hash, and every entry on write). **Save to
  the library** / **Save all** skip gauges already saved; an entry is used for the selected gauge (its sensor and
  range stay) or inserted as a new gauge with the saved range and AnimationSpeed. Deleting an entry removes the
  frames nothing else uses.

## Import flow (L8)

The **Import** panel (`src/import/`) runs the import end to end, as the app's canvas zone will.

- **Default mode**: Faithful (every item drawn as InfoPanel), Native where possible, or Both (the app makes one
  canvas of each). Faithful and Native set every item in one undo step.
- **Report** (`report.ts`): what the Data API offers (exact sensor refs, structured tables, font endpoints), items
  per kind, how many go native and why the rest stay, sensors by match status (**Check sensors** uses the live
  Data API), assets (unused, duplicates, missing, URLs, absolute paths), fonts, gauges and parse issues.
- **Stored form** (`stored.ts`): `infopanel-canvas` v1, the JSON the app saves: source, Data API, default mode,
  profile, items (unknown fields kept; lab state under `$`: mode, sensor key, vector spec), assets by SHA-256 and
  fonts with the supplied face's hash. Reading it back checks every field against the schema tables and reports
  what it drops. **Save stored form** downloads it with its files as `<name>.canvas.zip` (`bundle.ts`:
  `canvas.json`, `assets/<sha256>`, `fonts/<sha256>`, each checked against its hash on open); open it again under
  "or a saved canvas" and the mode, remap choices, fonts and assets come back.
- **Export .infopanel** (`src/export/write.ts`): writes `Profile.xml` and `DisplayItems.xml` in InfoPanel's field
  order (doubles and floats as .NET prints them, unknown fields kept, lab fields left out) and the assets. Stale
  vector gauges can be baked first (one undo step); unused assets can be left out. Every corpus profile round-trips
  through the writer in the tests.
- **Lab asset store** (`asset-store-plugin.ts`, `src/assets/store.ts`, on `hash-store.ts` shared with the gauge
  library): stands in for the app's asset store, so native images have a URL; files go to `asset-store/`
  (gitignored), raster images only, stored by hash and served with nosniff and a sandbox CSP.
- **import-check** (`tools/import-check/`): reads exports with InfoPanel's own `XmlSerializer` types and writes
  what InfoPanel then holds:

  ```
  dotnet run --project lab/infopanel/tools/import-check -p:Platform=x64 -- <out-folder> <a.infopanel> [...]
  ```

  It builds against the InfoPanel checkout at `E:\GitHub\PublicRepos\infopanel-pr173` (override with
  `-p:InfoPanelProject=...`). For ARCv2_WIDE, Dashboard,
  Umbrella_V.2 and [Import]_TheForeverWinter, the lab's export of the untouched profile reads back identical to
  the original.
