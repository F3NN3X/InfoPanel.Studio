# InfoPanel profile import: implementation plan (P0.8)

Status: **approved** (2026-10-16), with decision 1 as written and the lab-first order under "Phases". Phase 0
(the lab) is done on `feat/infopanel-import`; this plan grows the lab into the complete feature, then moves it into
`src/`.

## What Phase 0 established

- **Parsing is solved.** The lab reads every corpus export and installed profile into a typed model that mirrors
  InfoPanel's C# fields, defaults and setter checks, and reports unknown fields instead of dropping them
  (`lab/infopanel/src/{schema,parse,archive}.ts`).
- **Faithful drawing is possible in the browser.** Positioned DOM plus SVG, ported from PanelDraw, GraphDraw and
  SkiaGraphics, matches InfoPanel's own render on all four screenshot profiles; the remaining pixels are ClearType
  vs grayscale text, live values, time and animation phase (`lab/infopanel/FINDINGS.md`).
- **Text formatting matches .NET** to the digit, checked against .NET 8 itself (`dotnet-format.ts`).
- **Sensors map exactly with `ref`.** With PR #173's `ref`, 434 of 659 corpus bindings and 83 of 84 in the user's
  own ARCv2 WIDE resolve to a Data API key with no guessing. Plugin keys also map by their id; Libre and HWiNFO
  without `ref` fall back to names, which is lossy.
- **Fonts are the hard part.** What InfoPanel draws depends on DirectWrite's family and style names on the
  InfoPanel machine (localized style names, legacy family names, variable fonts named "Nunito Sans Normal"),
  so it cannot be derived from font files alone. The lab gets it from InfoPanel's own `CreateTypeface`.
- **The zone model cannot hold the items.** Panels have no x/y, rotation, z-order or nesting, and lack a dozen
  InfoPanel features (`research-dashboard-targets.md`). Converting items to panel widgets would lose fidelity.

## Decisions

### 1. Where imported profiles live: a canvas zone with two render modes per item

A new zone kind, alongside widget, panel and blank: the sentinel module id `infopanel` with a `canvas` field on the
placement (`Placement.canvas`, optional and additive, so no config version bump). The canvas is an absolutely
positioned surface at the InfoPanel profile's size, scaled to the zone with its aspect ratio kept. It holds the
parsed profile (size, background, font defaults, the item tree) and per-item import data (sensor key, asset ids).

Each item renders in one of two modes (the user's "hybrid, optional, either or both"):
- **InfoPanel** (faithful): drawn as InfoPanel draws it, by the ported renderer, untouched by the dashboard theme.
- **Dashboard widget** (native): converted to the nearest panel widget kind (text, value, bar, gauge, sparkline,
  image, clock, shape, table) at the item's position and size, styled by the dashboard theme and edited with the
  widget inspector. Items with no native equivalent (image-sequence gauges, donuts, marquee, glow, gradients,
  rotation) stay in InfoPanel mode, and the item says why.

The import asks for a default: **Faithful** (all InfoPanel), **Native where possible**, or **Both** (two canvas
zones on two pages of the new profile, one per mode, to compare and pick). Any item can be switched later, and the
canvas zone has a "switch all" action. The stored item keeps its InfoPanel fields in both modes, so switching back
is lossless.

- Import creates a new dashboard profile sized like the InfoPanel one (W×H, 1×1 grid, fit `fill`) with the canvas
  zone filling it. A canvas zone can also sit next to widgets in an existing profile.
- Everything zone-level (pages, save, undo, kiosk, desktop app) works unchanged.

Not chosen as the only model:
- **Absolute layout in panel JSON** for everything: lossy until panels gain rotation, z-order, nesting and about a
  dozen widget features. It survives as the native mode, item by item.
- **A widget template** holding the items: the settings kit and the 110/150 px fit checks do not suit a 1920 px
  canvas and a 600 KB item tree.

### 2. Model and code layout

- Move the lab's model and logic into `src/lib/infopanel/` (schema, parse, archive, xml, zip, dotnet-format,
  sensor-text, sensors, fonts, sfnt, geometry, scene); the lab then imports them from there. Their tests move along.
- The renderer (`Paint`, `Text`, `ProfileView`) becomes `src/components/infopanel/`, drawn inside the zone. It
  reads sensors through `sensor-store` (never one EventSource per item) and graph history through
  `sample-history`, which needs a per-key capacity (graphs use up to `Width / Step` samples, InfoPanel keeps 4096).
- Stored form: the parsed item tree as JSON, field names as in InfoPanel's XML, unknown fields kept, so an export
  back to `.infopanel` stays possible. Theme and studio styling never touch canvas items: they are drawn as
  InfoPanel draws them (the "chrome vs theme" rule).

### 3. Sensor remapping

- On import every bound item gets a Data API key: exact `ref` first, then the plugin key, then the HWiNFO name
  fallback (the lab's `mapBinding`). The key is stored per item; the original binding stays for re-matching.
- A remap step lists the unresolved and name-matched bindings, grouped by sensor (one change fixes every item that
  shares it), with a searchable key picker and live values. It can be reopened from the canvas zone's inspector.
- Profiles from other machines will have unmatched hardware; the remap step is the expected path for them.

### 4. Minimum Data API: `ref` required for automatic hardware mapping

- With `ref` (PR #173, or the fork until it merges): Libre and HWiNFO bindings map exactly.
- Without it: plugin bindings still map; Libre and HWiNFO go to the remap step, pre-filled by name where possible.
  The import says which Data API it found (the `ref` field's presence in `/api/sensors`).
- **Tables (decided: yes):** the Data API flattens plugin tables to text, losing column names and splitting cells
  holding ", ". A follow-up to PR #173 in the fork adds a structured `table: { columns, rows }` to `/api/sensors`
  values. Without it, table sensors draw from the flattened text (headers "Column N").

### 5. Assets

- Import uploads every file the profile references from the export's `assets/` to the asset store
  (`POST /api/assets`) and stores the returned ids on the items; identical files dedupe by hash. The corpus uses
  png, gif, jpg, webp and mp4, all accepted; SVG (refused by the store) does not occur.
- URL images stay URLs. Absolute file paths from another machine draw InfoPanel's placeholder and are listed in
  the import report. For profiles installed on the same machine (decision 7) they can be read from disk.
- Large exports (Umbrella: 19 MB of assets) upload with progress; the asset store's 2 GB cap applies.

### 6. Fonts

- **Resolution (decided: Data API endpoint):** the canvas needs, per (Font, FontStyle, Bold, Italic), the face
  InfoPanel draws. The fork's Data API gets a resolve endpoint (requests in; out, the typeface InfoPanel's own
  `CreateTypeface` picks: family, weight, slant and a face id) and a file endpoint serving that face, as the lab's
  `tools/skia-fonts` does. Exact by construction, and it reflects the fonts installed where InfoPanel runs. Without
  the endpoint, the import falls back to the ported `createTypeface` over the browser's fonts and says so.
  (Not chosen: a Rust port in the desktop app; browser-only resolution.)
- **Delivery:** resolved faces, uploaded fonts and fonts from an export's font pack go to the asset store
  (extend it to ttf/otf/woff2, each checked as a font by the sfnt parser) and load through `@font-face`, so a
  kiosk on another device draws the same faces.
- **Missing fonts:** the import lists them with the lab's free-source finder (Fontsource search in the browser,
  Google download server-side) and offers an upload. Installing into Windows (for InfoPanel itself) belongs to
  the desktop app, with a check that Skia then sees the family under the requested name (the Nunito Sans
  variable font installs as "Nunito Sans Normal" and does not help).

### 7. Import sources

- **File:** "Import InfoPanel profile" in the studio takes a `.infopanel` file (browser upload, parsed client-side).
- **Installed profiles:** when the server runs on the InfoPanel machine (desktop app, or `server.mjs` locally), a
  read-only endpoint lists `%LOCALAPPDATA%\InfoPanel` profiles, as the lab's `local-data-plugin.ts` does, and the
  import reads profile, items and assets from there.
- The import is one undo step and one save.

### 8. Editing scope (decided: item editing from the start)

- The canvas zone is editable in the studio: select an item on the canvas or in an item tree (as in the lab's
  compare panel), move and resize it by drag, nudge it with the arrow keys, hide, show, reorder, group and delete.
- The inspector edits InfoPanel-mode items through **one registry of InfoPanel item kinds**, generated from the
  schema tables (field kind, default, setter checks), with hand-written groups and labels on top: no hand-built
  panel per kind (the inspector rule). Native-mode items use the existing widget inspector.
- Studio rules apply: one drag or one inspector change is one undo step; shortcuts never fire in inputs; edits
  auto-push like the rest of the config.
- Edits keep the stored form valid for an export back to `.infopanel`; the export itself is out of scope for now.

## Phases

**Lab first** (user, 2026-10-16): every feature is built and working in `lab/infopanel/` before anything moves
into `src/`. The lab is also where new features are tried out (custom gauges, profile asset management and
others). Each phase ends with the lab tests passing; `src/` stays untouched until the app phases.

### Lab phases

| Phase | Content |
|---|---|
| L1 | Canvas editing: selection, item tree, drag, resize and nudge, undo, the InfoPanel item-kind inspector registry |
| L2 | Sensor remap: unresolved and name-matched bindings grouped by sensor, key picker with live values |
| L3 | Fork follow-ups to PR #173: structured tables, font resolve and file endpoints; the lab uses them |
| L4 | Fonts end to end: faces from the endpoint, uploaded and pack fonts, missing-font report |
| L5 | Native mode: item to panel widget conversion, rendered with the app's widget components, per-item toggles |
| L6 | Profile asset management: browse and preview (thumbnails, size, type, which items use each); add, replace everywhere, remove; cleanup (unused, duplicate bytes, oversized) and optimising; fonts managed the same way (bundled, uploaded, missing, licences) |
| L7 | Custom gauges: vector gauges drawn live as SVG; a gauge library to save and reuse gauges, fed by the image-sequence gauges in imports; editing imported gauges (recolour, retime, swap frames). Prior art: the user's gauge creator, `E:\GitHub\MyRepos\v0-themely-resource-creator` |
| L8 | The import flow end to end: mode choice, import report, and the stored form the app will save |
| L9 | SVG template gauges: the user's own SVG, animated or not, driven by the value through CSS custom properties; live in the studio, baked for InfoPanel |
| L10 | Gauge creator parity, the basics and groundwork, shaped for the app's widgets: theme colours, threshold fill, scale, value text, tick labels and minor ticks, needle styles, background, glow and shadow, presets, spec files. Later: liquid fill, grid matrix, multi-ring, bar icons and patterns, centre icons |
| L11 | Native mode coverage: studio prototypes for what the app's widgets lack (rotation and flip, marquee text, vertical bars, donuts, capsule and polygon shapes, image-sequence gauges, natural-size images); each conversion names the app feature it needs, and the import report sums them up |
| L12 | Asset and font polish: image optimising (resize, recompress, WebP; kept only when 5 % smaller), font licence review (fonts table and the export's save note), bulk replace by name |
| L13 | The later gauge parts: liquid and grid shapes, decorative rings around an arc, bar patterns (moving live), a row of icons instead of a bar, a centre icon (the app's widget icons); liquid bubbles and shine, diamond and hexagon containers, random and radial grid fills, cell borders |
| L14 | Native mode closer to InfoPanel: text items (text, sensors, clocks, dates, tables) in InfoPanel's font, size, colour, placement and text format; every bar (horizontal and vertical) from the bar generator with frame, background, corner radius and gradient; graphs (line and histogram) from InfoPanel's own geometry; images stretched under their colour layer, empty while a URL image has none; threshold images; shapes with frames, corner radii, transparency and gradients |

### App phases (after the lab is complete)

The studio design for these phases is `docs/infopanel-import/studio/SPEC.md` (Library page, Import and Export
dialogs, sensor remap, Gauges page, canvas zone editing), with the concept `Studio Lab.dc.html` beside it. Where
it differs from the decisions above, the spec wins: **Both** is one canvas whose items keep both forms (not two
canvas zones), and the user's reusable content lives in a server-side **My library** with copy semantics. The lab
stays as a dev tool, importing the model and logic from `src/`. Each phase ends with the app built and tests
passing, and is reviewed before the next starts.

| Phase | Content |
|---|---|
| A1 | Move the lab's model and logic into `src/lib/infopanel/`; the lab imports from there (done) |
| A2 | Canvas zone kind: `Placement.canvas`, normalization, the renderer in a zone, kiosk and desktop bundles |
| A3 | Server: My library store (items, copy counts, files by SHA-256), the asset store for fonts and SVG, installed profiles, the font proxy |
| A4 | Import dialog (spec §4), sensor remap (§5), Export dialog (§9); Import / Export in the top bar, the Add panel card |
| A5 | Canvas zone editing (§7): item tree, toolbar, modes, compare, mock sensors; the inspector registry extended with InfoPanel kinds |
| A6 | Library page (§3): My library, profile assets, fonts, drag to the canvas (§8) |
| A7 | Gauges page (§6): browse and editor, presets, image-sequence tools, bake |
| A8 | The states in §10, responsive rules, docs and `FEATURE_MAP.md` rows |

## Risks

| Level | Risk | Mitigation |
|---|---|---|
| HIGH | Fonts differ where the dashboard is viewed | Serve InfoPanel's resolved faces as assets (decision 6) |
| MEDIUM | Large canvases (600 KB item files, 19 MB of assets) slow the studio | Render only the active page; measure in P2 |
| MEDIUM | Upstream may not take the fork's Data API additions | Keep them small and optional; degrade as in decision 4 |
| LOW | ClearType vs grayscale text | Accepted; a viewing device's text settings apply anyway |

## Answers (2026-10-16)

1. **Placement:** "a 1 and 2 hybrid, maybe make it optional or a setting toggle between either or both". Written
   up as decision 1: one canvas zone, each item in InfoPanel or native widget mode, chosen at import (Faithful,
   Native where possible, Both) and switchable per item. Confirmed with the approval.
2. **Fonts:** the Data API endpoint in the fork.
3. **Tables:** yes, structured tables as a follow-up PR.
4. **Editing:** item editing from the start.
