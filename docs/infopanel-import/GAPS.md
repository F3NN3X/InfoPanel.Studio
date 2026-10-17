# InfoPanel import: open gaps

Gaps, deviations from `studio/SPEC.md` and unchecked paths left by the app phases (A1–A8 in
[PLAN.md](PLAN.md)), kept here so they can be picked up later. Add a row when a phase leaves
something out; remove it in the commit that closes it.

Status: **open** (not done), **decide** (needs a product decision), **unverified** (built, not
checked live), **risk** (works, may not hold).

## Import and export (A4)

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G1 | Export's font licence review has no "Swap for <alternative>" | open | Needs a picker of My library fonts (A6 has them now): offer same-category library fonts, rewrite the requests on export. |
| G2 | Import with the Data API unreachable goes ahead, its sensors left unresolved | decided | Settled in A8: the import proceeds (§10 asks only for "Not reachable" and Live disabled, both done); remap later from the canvas editor. |
| G3 | Exports download through the browser; never tried in the desktop app | unverified | 💡 A native save-file command for binary files (the existing one writes JSON only) would make it reliable. |
| G4 | The font licence review shows only for `.canvas.zip` | decide | An `.infopanel` carries no font files, so there is nothing to review; confirm that is the intent. |

## Canvas zone and editor (A2, A5)

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G5 | Compare asks for a screenshot each time | open | Saved canvases don't keep InfoPanel's screenshot; store it as an asset on import (opt-in, it can be large). |
| G6 | "Edit gauge…" in the item inspector | open | Comes with A7 (Gauges page). |
| G7 | The editor doesn't open after an import; the new zone is only selected | open | Open the editor when the import lands in an existing profile? Check with the spec's flow first. |
| G8 | The canvas editor closes when the Library page opens | open | A drag from the Library then lands on the canvas zone (same result: an Image item), not in the editor. Keep the editor mounted behind the Library page to spring back into it. |
| G9 | A canvas lives inside the config, capped at 5 MB by the server | risk | About 310 kB per ARCv2 canvas. Several large imports could hit the cap; raise it or move canvases to their own files. |

## Library page and drag (A6)

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G10 | Profile assets: "Use for selection", collapsing animation frame series, "Tiled" | open | Left out of the files table (spec §3). |
| G11 | Fonts: the licence column shows "—" unless the family is also in My library | open | Read the licence from the Data API's font files, or from the supplied face. |
| G12 | Copies made on Page background or inside the canvas editor record no profile | open | They carry `profileId: "*"`, so "jump to copy" can't go to them. Pass the profile id down to both. |
| G13 | Gauge items: open, export, drop | open | Comes with A7. |
| G14 | Hovering a library image over a canvas zone probably shows the red "no room" ghost, though the drop works | unverified | Hide the ghost while the pointer is over a canvas zone's profile (`canvasPointAt`). |
| G15 | Merge of near-duplicate images | unverified | Unit-tested (`duplicateGroups`); not tried live, the test data has no near-duplicates. |
| G16 | Dropping a style preset on a zone | unverified | Not tried live: no saved style presets in the test data. |
| G17 | Faces supplied through Get a font upload twice | risk | The asset store dedupes by hash, so only time is lost. |

## Gauges (A7)

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G19 | The Custom gauge widget is a zone only; it can't go inside a custom panel | open | Add a panel-widget kind that draws a `VectorGauge`, sharing the widget's drawing. |
| G20 | A library gauge with both a spec and frames, dropped on the grid, becomes a widget from the spec; its frames are dropped | decide | Fine for the dashboard (it draws live); say so in the drop toast, or keep the frames on the item. |
| G21 | A vector gauge dropped into a canvas zone has no frames until baked | open | InfoPanel draws nothing for it until the bake bar's Bake frames runs; bake on drop, or flag it in the canvas. |
| G22 | `.gauge.json` is the lab's `VectorGauge`, not the concept's flat `GaugeRender` object (§6) | decide | The lab format is richer and already round-trips; reading the concept's object too would need a converter. |
| G23 | Gauge cards on the Gauges page can't be dragged to the canvas (§8 lists gauge thumbnails as drag sources) | open | Library cards drag; presets and profile gauges need the same `LIBRARY_MIME`-style drag and the spring-load pill. |
| G24 | SVG-template gauges show only the Shape part: no scale (min, max, unit) fields | open | Add the Scale part for `shape: "svg"`; `templateVars` already reads the scale. |
| G25 | A profile gauge's name can't be edited on the Gauges page | open | A canvas item's name is its `Name`; a widget's is its label. Write them through `withGauge`'s siblings. |
| G26 | The Gauges page UI has no component tests; only its pure logic in `src/lib/gauge-studio/` is tested | risk | Add render tests for the editor's part toggles and the unsaved-changes dialog. |
| G27 | "Edit gauge…" while another gauge's working copy has unsaved changes replaces it silently | open | Ask Save / Discard / Cancel first, as back does. |
| G28 | The filmstrip has no keyboard shortcuts (select, move, delete frames) | open | Arrows / Shift+arrows / Delete, never while typing. |
| G29 | "Add to canvas" for an image sequence only says it goes into a canvas zone | open | Offer the profile's canvas zones to insert it into (`withDroppedGauge`). |
| G30 | Image sequences can't be exported from the Gauges page (`.gauge.json` holds a spec only) | decide | Export the frames as a zip with a manifest, or convert to vector first. |
| G31 | The editor header shows only "Vector" for a library gauge (no "· My library") | open | Cosmetic: show `entry.where` for library sources too. |

## States and narrow screens (A8)

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G32 | The canvas editor toolbar is clipped on the right below about 1100 px | open | Move the less used groups (Compare, Sensors) into an overflow menu when the toolbar is narrow. |
| G33 | The canvas editor's inspector modes switch on the editor's own width, about 52 px (the rail) later than the studio's | risk | Measure the studio body instead, or accept it. |
| G34 | The bottom sheets and stacked layouts have no component tests (the suite has no DOM / matchMedia environment) | risk | Add a jsdom project for these, or cover them in a Playwright check. |
| G35 | XML entity errors point at the start of the text node, not at the `&` | open | Track the entity offset in `xml.ts`. |

## Tests and tooling

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G18 | `server/server.test.mjs` "serves /api/debug/stats…" fails now and then with `fetch failed` | risk | It picks a free port, then starts the server on it: a race under load. Listen on port 0 and read the bound port. |

## After A8

A1–A8 are done. Gaps found later are added here the same way.
