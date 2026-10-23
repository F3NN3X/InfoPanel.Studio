# Phase 2 (the studio's idle rendering)

Same machine and method as [phase1.md](phase1.md); `npm run perf:compare phase1 phase2`. Medians of 3, range in
brackets unless noted. The heavy and light fixtures are unchanged; the new `perf-viz` profile is used only by the
hot/cold round trip and its e2e check.

## What changed

| Item | Result |
|---|---|
| 2.1 instrument the ticker | Labels on every subscriber; `window.__tickerStats()` in the dev server, Vitest and `npm run build:stats` only; `perf:budgets` fails if it reaches a release closure |
| 2.2 hot/cold | Doesn't reproduce on this build: the same subscribers and frame rate on first load and after a hide and remount, and the visualiser keeps moving. The "hot" frames were waste ([webview-performance.md](../desktop/webview-performance.md#hot-and-cold-footprint-phase-2)) |
| 2.3 idle ticker | Subscribers settle or sleep a set time; clocks sleep to their next boundary; the loop sleeps until the earliest subscriber is due; the visualiser loop runs at its listeners' 30 fps |
| 2.4 unfocused studio | 60 s unfocused: 5 fps, ambient effects paused; hidden: stopped. `studio-focus` event and the **Reduce studio animation when unfocused** setting (on) |

## Kiosk idle (Chromium, headless)

| Metric | phase1 | phase2 | Δ |
|---|---|---|---|
| heavy: rAF callbacks/s | 60.0 (60.0–60.1) | 35.5 (35.3–35.8) | −40.8% |
| heavy: style recalcs/s | 48.5 (47.7–48.6) | 34.5 (33.6–34.7) | −28.9% |
| heavy: task ms/s | 143 (142–145) | 131 (130–133) | −8.6% |
| heavy at fps=30: rAF/s, task ms/s | 35.9, 131 | 36.3, 129 | noise |
| light: rAF/s, task ms/s | 0, 3.93 | 0, 3.97 | noise |
| JS transferred (heavy) | 1,125,985 B | 1,127,458 B | +0.1% |

The kiosk is better or unchanged in every case. What is left on the heavy kiosk is script reacting to data: the fake
Data API moves every reading every second and the audio meter's at 10 Hz.

## Studio idle, Design view (Chromium, headless)

| Metric | phase1 | phase2 | Δ |
|---|---|---|---|
| rAF callbacks/s | 60.1 (60.0–60.1) | 35.4 (34.9–37.7) | −41.1% |
| style recalcs/s | 46.1 (44.0–47.2) | 37.0 (36.5–40.2) | −19.7% |
| task ms/s | 165 (164–168) | 156 (150–177) | noise |

## Studio idle in WebView2 (desktop debug build, first load, focused)

| Metric | phase1 | phase2 | Δ |
|---|---|---|---|
| rAF callbacks/s | 71.9 (71.0–98.3) | 41.6 (41.4–55.6) | −42.1% |
| renderer cores | 0.236 (0.222–0.248) | 0.144 (0.106–0.146) | −39.0% |
| GPU cores | 0.143 (0.121–0.195) | 0.134 (0.075–0.169) | noise |
| renderer + GPU | 0.379 | 0.278 | **−27%** (target −50%: not met) |
| task ms/s | 131 (125–131) | 106 (104–108) | −19.4% |

The focused first load keeps the heavy profile's weather effect at 30 fps (continuous, by design) and the
data-driven transitions; those set the floor. The ticker's own waste is gone.

## Unfocused studio

| | rAF/s | task ms/s | Note |
|---|---|---|---|
| Chromium, focused | 35.2 | 200 | `studio-unfocused`, 1 run |
| Chromium, 65 s blurred | 5.2 | 101 | at most 6 required |
| Chromium, 1 s after focus | 36 | | back within a second |
| WebView2, minutes 2–30 unfocused | 5.5 (5.3–5.7) | | renderer 0.170, GPU 0.117 cores (median of 29 one-minute samples) |

WebView2 memory over the 30-minute unfocused run (`studio-unfocused-webview2`, slope first to last minute): renderer
+9 MB/h, GPU −19 MB/h, browser +6 MB/h, Node sidecar +22 MB/h. Thirty minutes on the fixture is not the overnight
answer; the [overnight protocol](../desktop/webview-performance.md#visible-and-unfocused-after-the-phase-2-ticker) is.
The spec's check that the studio had lost focus (`document.hasFocus()`) read true, yet the rate dropped to 5 fps a
minute in, so the shell's `studio-focus` event did arrive: WebView2's `hasFocus` doesn't follow the native window.

## Hot and cold (stats build, headed, 1 run each)

| Profile | rAF/s hot → cold, before 2.3 | after 2.3 | Visualiser moves |
|---|---|---|---|
| heavy | 72 → 69 | 41 → 41 | |
| `perf-viz` | 75 → 72 | 38 → 38 | hot and cold |
