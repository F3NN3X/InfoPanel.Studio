# InfoPanel profile import: implementation plan (P0.8)

Status: **draft for approval** (2026-10-16). Phase 0 (the lab) is done on `feat/infopanel-import`; this plan turns it
into a feature in `src/`. Decisions marked **Open** wait for the user.

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

### 1. Where imported profiles live: a canvas zone (recommended)

A new zone kind, alongside widget, panel and blank: the sentinel module id `infopanel` with a `canvas` field on the
placement (`Placement.canvas`, optional and additive, so no config version bump). The canvas holds the parsed
profile: size, background, font defaults and the item tree, plus per-item import data (sensor key, asset ids).

- Import creates a new dashboard profile sized like the InfoPanel one (W×H, 1×1 grid, fit `fill`) with one canvas
  zone filling it. The canvas draws at its native size and scales to the zone, keeping the aspect ratio.
- Because it is a zone, a canvas can also sit next to widgets in an existing profile, and everything zone-level
  (pages, save, undo, kiosk, desktop app) works unchanged.
- The studio stays one zone-based editor (the decision of `506c1d4`); nothing revives the free-canvas editor.

Alternatives considered:
- **Absolute layout in panel JSON**, one panel widget per item: fits the inspector registry, but needs x/y,
  rotation, z-order and nesting in panels plus about a dozen new widget features; lossy until all exist.
- **A widget template** ("InfoPanel") with the items in its settings: the settings kit, Library fields and the
  110/150 px fit checks do not suit a 1920-px canvas and a 600 KB item tree.

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
- **Tables (Open):** the Data API flattens plugin tables to text, losing column names and splitting cells holding
  ", ". Proposal: add a structured `table: { columns, rows }` to `/api/sensors` values in the fork, as a follow-up
  to PR #173. Until then table sensors draw from the flattened text (headers "Column N").

### 5. Assets

- Import uploads every file the profile references from the export's `assets/` to the asset store
  (`POST /api/assets`) and stores the returned ids on the items; identical files dedupe by hash. The corpus uses
  png, gif, jpg, webp and mp4, all accepted; SVG (refused by the store) does not occur.
- URL images stay URLs. Absolute file paths from another machine draw InfoPanel's placeholder and are listed in
  the import report. For profiles installed on the same machine (decision 7) they can be read from disk.
- Large exports (Umbrella: 19 MB of assets) upload with progress; the asset store's 2 GB cap applies.

### 6. Fonts

- **Resolution (Open):** the canvas needs, per (Font, FontStyle, Bold, Italic), the face InfoPanel draws. Options:
  1. **Data API endpoint in the fork** (recommended): InfoPanel runs its own `CreateTypeface` and serves the result
     and the face file (`/api/fonts/resolve`, `/api/fonts/file`). Exact by construction, and it reflects the fonts
     installed where InfoPanel runs, wherever the dashboard is viewed.
  2. The desktop app resolves on the InfoPanel machine with DirectWrite (Rust), porting `CreateTypeface` there.
  3. Browser only: the ported `createTypeface` over the browser's fonts. Approximate; wrong for localized style names.
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

### 8. Editing scope

- **Open:** first release = read-only canvas plus remap, per-item hide/show and an import report? Or item editing
  (position, text, colours) in the inspector from the start, as a registry of InfoPanel item kinds? Recommendation:
  read-only first; editing follows as its own phase, driven by the same schema tables.
- Export back to `.infopanel` (round trip) is out of scope for now; the stored form keeps it possible.

## Phases

Each ends with `tsc -b`, `npm test` and the lab tests passing.

| Phase | Content |
|---|---|
| P1 | Move model, parser, formatting, sensor mapping, fonts and geometry into `src/lib/infopanel/`; lab imports from there |
| P2 | Canvas zone kind: `Placement.canvas`, normalization, the renderer in a zone, kiosk and desktop bundles |
| P3 | Import flow: file picker, asset upload, import report, new profile; one undo step |
| P4 | Sensor remap step and inspector entry; `sample-history` capacity per key |
| P5 | Fonts: resolution (per decision 6), font assets and `@font-face`, missing-font report |
| P6 | Installed-profile import through the server; fork follow-ups (structured tables, font endpoint) |
| P7 | (If chosen) item editing in the inspector |

## Risks

| Level | Risk | Mitigation |
|---|---|---|
| HIGH | Fonts differ where the dashboard is viewed | Serve InfoPanel's resolved faces as assets (decision 6) |
| MEDIUM | Large canvases (600 KB item files, 19 MB of assets) slow the studio | Render only the active page; measure in P2 |
| MEDIUM | Upstream may not take the fork's Data API additions | Keep them small and optional; degrade as in decision 4 |
| LOW | ClearType vs grayscale text | Accepted; a viewing device's text settings apply anyway |
