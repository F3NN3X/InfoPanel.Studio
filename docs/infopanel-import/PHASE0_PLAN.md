# InfoPanel profile import — Phase 0: test bench

Status: **approved** (2026-10-16), in progress on `feat/infopanel-import`. See "Answers" at the end.

## Goal

Import profiles exported from InfoPanel (`.infopanel` files) into the dashboard, with full compatibility. Before
touching `src/`, build a standalone **lab** that parses an export and redraws it in the browser at its native size,
then compare it item by item against InfoPanel's own render. Phase 0 changes nothing in `src/`.

## Inputs

- `research-infopanel-format.md`: the file format and C# render rules, taken from the source.
- `research-dashboard-targets.md`: the dashboard model, sensors, assets and fonts, plus the retired prior art.
- `corpus.md`: a survey of the 14 sample exports in `G:\win_user-folders\Downloads\infopanel-profiles\`.
- InfoPanel source, the user's fork: `E:\GitHub\PublicRepos\infopanel` (`F3NN3X/infopanel`, `d3fe32c`).
- Prior art in this repo: commits `ea1a63f`, `1a2b45d`, `88acd2a` and `fffb966` hold the old `src/lib/ip/*` and
  `src/components/ip/*` code, which `506c1d4` deleted. `tools/ip-import.cjs` still exists.

## What the corpus showed

- **Everything is per profile.** Size, background (which can be transparent), font defaults and FontScale all come
  from each profile's file. FontScale is 1.33 in all 14, but it is applied per profile.
- **All 14 item types occur.** HWiNFO bindings appear in 6 profiles.
- **Fonts:** 18 families, mostly not installed here. Some put the weight in the family name. Seven FontStyle names
  occur. The user supplied font packs in the corpus folder.
- **Schema drift between InfoPanel versions:** `AutoScale`, `SeparateUnitWithSpace`, `RefreshInterval`, and
  `Threshold` on bars.
- **Images:** gif, webp and mp4 appear.
- **Priority from usage:**

  | Feature | Items |
  |---|---|
  | text Width>0 | 259 |
  | multi-line | 71 |
  | thresholds | 45 |
  | rotation | 29 |
  | AutoValue | 20 |
  | FlipX | 20 |
  | marquee | 18 |
  | glow, image layers, histogram graphs | 0 |

- **Sensor keys:** the Data API's plugin keys map exactly (`SensorSnapshotBuilder.cs:113`). Libre and HWiNFO keys
  are name slugs, so they are lossy.

## Phases

Each phase ends with its own tests passing, plus `npm test` and `tsc -b`.

### P0.1 Scaffold
- `lab/infopanel/` gets a README, a lab page served by Vite (a separate HTML entry) and a Vitest project.
- Keep it out of `npm run build`, `desktop:build` and the app tsconfig, so no lab code reaches any bundle.
- `lab/infopanel/scripts/extract-corpus` extracts every `.infopanel` into `lab/infopanel/corpus/`, which is
  gitignored because some exports are 18 MB.

### P0.2 Parser
- **Done.** Written fresh from the C# models (`schema.ts`, `parse.ts`, `archive.ts`). XML uses a small reader
  (`xml.ts`) instead of DOMParser, which neither Node nor the Vitest setup has.
  `fffb966` is a reference for the C# quirks, not a source to copy.
- Input is a `.infopanel` file or an extracted folder. Entry names are matched case-insensitively, and both `assets/`
  and `assets\` are accepted.
- Cover all 14 types. Missing fields get the C# default. Unknown fields are kept and reported.
- Tests, per corpus profile:
  - item counts by type and sensor type, matching `corpus.md`
  - gauge frame lists
  - group nesting
  - the unknown-field report

### P0.3 Data API: native ids (InfoPanel fork, on PR #173)
- **Done** in `F3NN3X/infopanel` `pr/databridge-export` (`9a8b0ee`), the head of upstream
  [PR #173](https://github.com/habibrehmansg/infopanel/pull/173), on the user's direction instead of a new branch.
  Libre's ref is the `LibreMonitor.SENSORHASH` key: of two sensors sharing an identifier, the one InfoPanel reads
  keeps `libre:{identifier}` and the other gets `libre:{identifier}/{name}`. Not yet checked against a live build.
- Add an optional `Ref` to `DataApiValue` holding InfoPanel's native binding:
  - `libre:/gpu-nvidia/0/load/3`
  - `hwinfo:<remote>/<id>/<instance>/<entry>`
  - `plugin:/<plugin>/<container>/<entry>`
- Put it in `/api/sensors` (the catalog) only, not in the SSE stream. It is additive, so existing clients are
  unaffected.
- Tests go in `InfoPanel.Tests`.

### P0.4 Sensor mapping and value formatting
- Mapping order:
  1. exact `ref`
  2. plugin id converted to a key
  3. name match (InfoPanel's own HWiNFO import fallback)
  4. unmapped, listed in a report
- Profiles from other machines need a manual remap; the lab shows the unmapped list.
- Formatting follows the C# rules:
  - modifiers, AbsoluteAddition, and precision by override or by unit
  - thousands separator, unit, ShowName, ValueText and thresholds
  - .NET date formats converted to JS (every format seen in `corpus.md`)
- Two sources: mock values with per-sensor sliders, and live values from :3921.

### P0.5 Fonts
- Load fonts from a local folder (the user's font packs) through `@font-face`, with system fonts as a fallback.
- Resolve faces the way InfoPanel does: family plus FontStyle name, weight words in the family name, then the
  fallback chain.
- Report the missing fonts per profile.

### P0.6 Renderer
- Positioned DOM at the profile's size, in document order.
- Order of work:
  1. text, sensor, clock, calendar
  2. bar, graph, donut, gauge, image, httpImage, sensorImage
  3. shape, table, group
  4. marquee, then animated shape gradients
- Geometry tests for bar, graph, donut, gauge frame choice (banker's rounding) and shape paths.

### P0.7 Comparison view
- Choose a profile and lay a screenshot of InfoPanel's own render over ours, with an opacity slider and a
  difference blend.
- Clicking an item shows its parsed fields. Items and groups can be toggled.
- Record the results per profile and per type in `lab/infopanel/FINDINGS.md`: a pass, or a mismatch with its cause.

### P0.8 Decision record
- Write `docs/infopanel-import/PLAN.md` for the real implementation. It covers:
  - where imported profiles live (an `absolute` panel layout, or a revived free-canvas profile type)
  - font upload
  - asset upload
  - the sensor remap UI
  - the minimum Data API version
- The plan gets its own approval.

## Risks

| Level | Risk | Mitigation |
|---|---|---|
| HIGH | The zone/panel model cannot hold pixel-positioned, rotated items | Decide in P0.8 from the lab results |
| HIGH | Profiles from other machines reference hardware the user does not have | Remap UI; exact `ref` only helps for the user's own profiles |
| MEDIUM | Browser text metrics differ from Skia/RichTextKit (about 1 px) | Measure in P0.7 and document |
| MEDIUM | Commercial fonts may be unavailable | Fallback chain and a missing-font report |
| LOW | Schema drift between InfoPanel versions | Keep and report unknown fields; check upstream history as needed |

## Answers (2026-10-16)

1. **Screenshots:** supplied in the corpus folder: `arcv2_wide.png`, `dashboard.png`, `catppuccin_mocha.png` and
   `unbrella_v2.png` (sic, Umbrella_V.2). The user did not bind their own sensors first, so sensor items show
   InfoPanel's unbound output. P0.7 compares layout, fonts and static items; sensor values are compared only for
   how an unbound item renders.
2. **Data API:** yes, create `feat/data-api-ref` in the fork (P0.3).
3. **Location:** `lab/infopanel/`, committed, with the extracted corpus gitignored.
4. **Prior art:** rewrite. `fffb966` is read as a reference only.

**Complexity:** medium to high, about 2–3 sessions.
