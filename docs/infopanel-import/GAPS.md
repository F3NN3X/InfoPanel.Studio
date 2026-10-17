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
| G2 | Import with the Data API unreachable goes ahead, its sensors left unresolved | decide | Spec §10's offline row doesn't say whether to block. Settle in A8 with the other §10 states. |
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

## Tests and tooling

| # | Gap | Status | Notes / likely fix |
|---|---|---|---|
| G18 | `server/server.test.mjs` "serves /api/debug/stats…" fails now and then with `fetch failed` | risk | It picks a free port, then starts the server on it: a race under load. Listen on port 0 and read the bound port. |

## Still to come

A7 (Gauges page, spec §6) and A8 (§10 states, responsive rules, docs, `FEATURE_MAP.md` rows) are not
started; rows from them land here as they are found.
