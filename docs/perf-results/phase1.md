# Phase 1 (harness and quick wins)

`PERF_LABEL=phase1 npm run perf:all` after 1.2 and 1.3, same machine and method as [baseline.md](baseline.md);
`npm run perf:compare baseline phase1`. Medians of 3, range in brackets; "noise" = the ranges overlap.

## What changed

| Item | Result |
|---|---|
| 1.2 release the hidden studio | Done. No WebView2 process 60–70 s after close to tray (`after1m`), rebuilt in 294 ms, interactive 446 ms after Show (desktop spec, debug build) |
| 1.3 react-dom/server out of the kiosk | Done. Kiosk closure −205 KB raw / −63 KB gzip, budget now forbids it |
| 1.4 Node heap flags | Measured, not kept: RSS −3.8% (needed −15%), 25% more GCs ([performance.md](../performance.md)) |
| 1.5 clouds as WebP | Skipped: palette PNGs already; lossless WebP saves ~6% on two and grows the third |

## Bundles (deterministic)

| Metric | baseline | phase1 | Δ |
|---|---|---|---|
| Kiosk closure JS raw | 1,239,258 B | 1,033,906 B | −205,352 B (−16.6%) |
| Kiosk closure JS gzip | 386,480 B | 323,071 B | −63,409 B (−16.4%) |
| Studio closure JS raw | 2,206,637 B | 2,001,285 B | −205,352 B (−9.3%) |
| Studio closure JS gzip | 711,023 B | 647,615 B | −63,408 B (−8.9%) |
| react-dom/server in kiosk / studio | yes / yes | no / no | |
| Settings window | 401,526 B | 401,526 B | 0 |

## Kiosk idle

| Metric | baseline | phase1 | Δ |
|---|---|---|---|
| heavy: JS transferred | 1,331,321 B | 1,125,942 B | −15.4% |
| heavy: parse/compile | 23.7 ms (23.3–25.3) | 21.7 ms (21.2–22.6) | −8.7% |
| light: parse/compile | 21.7 ms (21.4–22.9) | 19.5 ms (19.3–21.0) | −10.2% |
| heavy: first zone | 159 ms (156–172) | 153 ms (150–3,066) | noise (one cold outlier) |
| heavy: task ms/s | 141 (135–143) | 135 (132–142) | noise |
| heavy: script ms/s | 88 (82–88) | 84 (80–88) | noise |
| heavy: JS heap | 18.5 MB (14.6–21.9) | 11.7 MB (9.7–17.9) | noise |
| heavy: rAF/s | 60.1 | 60.1 | 0 |

## Studio idle (headless)

| Metric | baseline | phase1 | Δ |
|---|---|---|---|
| Design: JS transferred | 2,213,819 B | 2,008,440 B | −9.3% |
| Design: parse/compile | 44.9 ms (42.3–46.2) | 46.9 ms (46.0–49.9) | noise |
| Design: task ms/s | 156 (144–162) | 165 (164–168) | +6.1%, within the ~20% drift between runs |
| Design: script ms/s | 82 (73–83) | 88 (86–90) | +7.3%, same |

Phase 1 changes nothing the idle studio runs (Phase 2 is the studio's idle work).

## Studio in the real WebView2 (`studio-idle-webview2`, phase1 only)

Desktop debug build, Design view, 10 s windows: renderer 0.236 cores (0.222–0.248), GPU 0.143 (0.121–0.195), task
131 ms/s, rAF 72/s (the display's rate, above 60). No baseline: the desktop harness did not attach before
(`docs/desktop/README.md`).

## Server

RSS 57.4 MB (56.7–63.3) → 57.1 MB (56.3–62.6): noise, as expected (Phase 1 doesn't touch the server).

## Disk

The baseline's `src-tauri/resources/app` (3.8 MB) was a leftover from an earlier `desktop:prepare`, not the
baseline build, so the +1.5 MB in `perf:compare` is not a change. Prepared from the current build, `app/` is 5.1 MB:
the build minus Vite's manifest (left out by `desktop:prepare`). `node/` is unchanged at 89.5 MB.
