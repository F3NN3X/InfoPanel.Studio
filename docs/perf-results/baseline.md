# Baseline (before the footprint work)

`PERF_LABEL=baseline npm run perf:all` on `main` at 4c846ab plus the harness, 2026-10-23. Windows 11, headless
Chromium (Playwright 1.64.1, Chrome Headless Shell 156), the perf fixture (`tests/fixtures/perf`) and the fake Data
API at 1 Hz. Medians of 3 runs, range in brackets. The raw JSON is in `.cache/perf/baseline/` (not committed).

## Bundles (`tools/perf/bundle-report.mjs`)

| Entry | JS raw | JS gzip | Chunks | react-dom/server inside |
|---|---|---|---|---|
| Kiosk (`index.html`) | 1,239,258 B | 386,480 B | 2 | yes |
| Studio (kiosk + `studio-view`) | 2,206,637 B | 711,023 B | 25 | yes |
| Settings window (`settings.html`) | 401,526 B | 122,534 B | 2 | no |

Largest chunk: `layout-*.js`, 1,131,886 B raw (348,648 B gzip).

## Kiosk idle (`kiosk-idle`, 1920×550)

| Case | Task ms/s | Script ms/s | Layouts/s | Style recalcs/s | rAF/s | Animations | JS heap MB | First zone ms | Compile ms | Requests |
|---|---|---|---|---|---|---|---|---|---|---|
| heavy | 141 (135–143) | 88 (82–88) | 11.0 (10.1–11.1) | 47.2 (45.8–47.6) | 60.1 | 1 | 18.5 | 159 | 23.7 | 17 |
| heavy, `&fps=60` | 136 (132–138) | 82 (80–85) | 10.6 (10.4–11.0) | 47.3 (46.2–47.8) | 60.1 | 1 | 11.9 | 157 | 24.2 | 17 |
| light | 3.8 (3.8–4.1) | 1.8 (1.7–1.9) | 1.0 | 0.3 | 0 | 0 | 10.0 | 149 | 21.7 | 9 |
| light, `&fps=60` | 4.0 (4.0–4.0) | 1.9 | 1.0 | 0.3 | 0 | 0 | 10.0 | 148 | 21.9 | 9 |

JS transferred: heavy 1,331,321 B, light 1,239,976 B (the canvas zone adds four lazy chunks).

## Studio idle (`studio-idle`, `studio-hot-cold`, 1440×860)

| Case | Task ms/s | Script ms/s | Layouts/s | Style recalcs/s | rAF/s | JS heap MB |
|---|---|---|---|---|---|---|
| Design, first load | 156 (144–162) | 82 (73–83) | 10.2 | 45.1 | 60.1 | 29.4 |
| hot (first load) | 167 (162–169) | 88 (84–91) | 10.7 | 45.7 | 60.0 | 27.5 |
| cold (after Design → Help → Design) | 166 (162–166) | 85 (83–87) | 10.6 | 46.2 | 60.0 | 29.9 |

Studio load: 2,213,819 B of JS, 32 requests, first zone 217 ms, compile 45 ms.

Headless Chromium keeps the studio tab visible while Help is open (`studioHiddenDuringHelp` 0), so the cold state of
`docs/desktop/webview-performance.md` open item 3 does not reproduce here: hot and cold are the same. Run
`HEADED=1 npm run perf:studio` to reproduce it.

## Server (`server-idle`, Node sidecar)

Two kiosks and a studio open (5 SSE clients at the end), 60 s: RSS 57.4 MB (56.7–63.3), private 61.8 MB (60.6–71.1).
The docs' 86–107 MB were the desktop sidecar on the real config with live sensors and alerts; the fixture has no
alert rules and no integrations.

## Disk (`tools/perf/disk-report.mjs`)

| What | Size |
|---|---|
| `src-tauri/resources/` | 93.2 MB: `node/` 89.5 MB, `app/` 3.6 MB (a leftover from an earlier `desktop:prepare`, not this build; see [phase1.md](phase1.md#disk)) |
| Installed (`%LOCALAPPDATA%\InfoPanel Studio`) | 148.3 MB: `node/` 89.5 MB, `app/` 45.7 MB, exe 12.9 MB |
| Installer (local, stale: 1.3.0-beta.1) | 26.8 MB |

The installed `app/` is 45.7 MB against 3.6 MB freshly prepared: probably old hashed chunks left behind by earlier
updates (unconfirmed).

## Repeatability

A second run (`baseline-2`) gave identical deterministic metrics (bundle bytes, JS bytes, requests, chunk counts).
The kiosk and server metrics stayed within their ranges or a few percent outside. The studio's Script and Task ms/s
were about 20% lower in the second run, outside both runs' ranges: three repeats underestimate the drift between runs,
so treat a studio CPU change under ~20% as noise.
