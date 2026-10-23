# Phase 4 (frozen Design preview, studio in a browser)

Same machine and method as [phase2.md](phase2.md). Medians of 3, range in brackets unless noted. The memory runs are
two separate runs of `studio-in-browser` (one sample each, after 20 s settled), shown side by side because they
differ by more than the effect in places.

## What changed

| Item | Result |
|---|---|
| 4.1 frozen Design preview | **Design preview data**: `live` (default), `frozen`, `frozenWhenUnfocused`. Frozen renders Design and the Add list from a snapshot, closes the studio's Data API stream while nothing live is open (everything outside the canvas and Add list stays live: the Data view, the sensor picker, alert previews), and stills continuous effects. Zoom bar chip `Frozen · HH:MM` with Refresh (Shift+F) and Go live for this session; F toggles |
| 4.2 open the studio in a browser | **Open the studio in**: `appWindow` (default), `edgeApp`, `defaultBrowser`. Every opener goes through `studio_target`; the browser targets start the server first, run no WebView, and ask before opening a second studio |
| Security check | Cross-origin and form-post writes to `/api/config`, `/api/control`, `/api/assets` and `/api/integrations` are refused (403, state unchanged): `tests/e2e/cross-origin-writes.spec.ts`. No change needed |

## Frozen vs live, Design on the heavy profile (Chromium, headless; `studio-frozen`)

| Metric | live | frozen | Δ |
|---|---|---|---|
| rAF callbacks/s | 35.4 (35.3–35.4) | 0.1 (0.1–0.1) | −99.7% |
| task ms/s | 147 (137–149) | 4.4 (4.3–4.4) | −97.0% |
| style recalcs/s | 38.4 (37.1–38.6) | 0.4 (0.4–0.5) | −99.0% |
| bytes received, KB/min | 15,443 | 3.2 | −99.98% |

The first frozen measurement still received 1.9 MB/min: the Profiles drawer's thumbnails, drawn offscreen with the
live renderer, reopened the Data API streams. They now draw from the snapshot too. What is left (0.4 recalcs/s) is probably the
once-a-second clock ticks (status bar, Clock widget): a frozen clock looks broken, so clocks keep ticking.

## Frozen vs live in WebView2 (desktop debug build; `studio-idle-webview2`)

| Metric | live | frozen | Δ |
|---|---|---|---|
| rAF callbacks/s | 31.1 (30.8–31.3) | 0.1 (0.1–0.3) | −99.7% |
| task ms/s | 114 (111–117) | 3.8 (3.5–7.0) | −96.7% |
| renderer cores | 0.095 (0.023–0.101) | 0.005 (0–0.008) | −94.7% |
| GPU cores | 0.003 (0.002–0.005) | 0.002 (0–0.003) | noise |
| renderer + GPU | 0.098 | 0.007 | **−93%** (target −80%: met) |

## App window vs a browser studio, private memory (`studio-in-browser`)

App: the exe, its server and any WebView2. Browser: the scratch Edge profile's processes (Edge stands in for the
default browser too, so a spec never opens yours). "Warm": Edge was already running on that profile; the browser
column is what the studio added to it.

| Case | run 1 total (app + browser) | run 2 total (app + browser) |
|---|---|---|
| App window | 681 MB (681 + 0) | 573 MB (573 + 0) |
| Edge app, Edge not running | 650 MB (85 + 565) | 603 MB (81 + 521) |
| Edge app, Edge already running | 360 MB (81 + 279) | 382 MB (85 + 297) |
| Default browser (normal window), not running | 818 MB (281 + 537) | 627 MB (83 + 545) |

- With Edge not running, a browser studio saves nothing: a fresh Edge costs about what the app's WebView2 does.
- With Edge already running, app plus studio is about 360–380 MB against 575–680 MB: roughly 40% less.
- The app itself drops to about 80–85 MB with no WebView2 (zero WebView2 processes asserted in every browser case).
  Run 1's 281 MB app in the default-browser case is an outlier I can't explain from this data (run 2: 83 MB).
- Every case was opened by Open the studio on launch; the log line `studio opened in <target>: <url>` and a studio
  client on the server (`studios` in `/api/server/stats`) were asserted.

Not measured: a Settings window opened from the tray with the studio in a browser (the spec can't click the tray).
