# Desktop Studio: WebView2 memory and CPU

Why the desktop Studio got slow over long sessions, what was measured, what 1.3.0-beta.10 changed, how to check it
overnight and what is still open. The kiosk page's own performance work (Max FPS, Motion, the shared ticker) is in
[performance.md](../performance.md). The security review done at the same time is in [security.md](../security.md).

The work shipped in 1.3.0-beta.10 (PR #111):

| Commit (on the branch) | Change |
|---|---|
| 9e53ad1 | Suspend the hidden or minimized Studio webview, WebView2 task manager, opener ACL, devtools gate, remote-edit setting |
| df09914 | Remote edits opt-in, security headers on the Studio pages, image-proxy SSRF guard |
| 48f9093 | Widget motion on the compositor; the frame loop sleeps between capped frames |
| faefd44, d8f5fdf | Review fixes: PowerDraw stack, slide/scale clamps, flush before suspend, suspend/show races |

## Symptom

After a night of running, beta.8's Studio window was slow to register clicks and felt unresponsive. The kiosk
(InfoPanel's own WebView2) was fine.

## Evidence

### The app's own metrics (debug mode)

`%LOCALAPPDATA%\dev.f3nn3x.infopanel-studio\logs\metrics.csv`, one line every 30 s (columns: `CSV_COLUMNS` in
`src-tauri/src/debug.rs`). `node tools/perf/metrics-trend.mjs "" 120 2026-10-21T22:00` (times in UTC):

| time (UTC) | webview MB | JS heap MB | DOM | streams | server MB |
|---|---|---|---|---|---|
| 10-21 22:00 | 859 | 41 | 2043 | 4 | 86 |
| 10-22 00:00 | 1257 | 60 | 1500 | 4 | 102 |
| 10-22 02:00 | 1657 | 56 | 1491 | 4 | 107 |
| 10-22 04:00 | 1793 | 48 | 1496 | 4 | 103 |
| 10-22 06:01 | 1932 | 41 | 1491 | 4 | 107 |
| 10-22 08:01 | 2116 | 53 | 1487 | 4 | 103 |

- `webview.privateMb` grew about 110 MB an hour. The JS heap, DOM nodes, event streams and the server stayed flat, so
  the growth is **native renderer/GPU memory, not app objects**.
- The Studio's renderer had used about 42,300 CPU-seconds over about 39,400 s of uptime (about one core on average),
  the GPU process another 13,400 s.
- A 15 s sample while the window sat in the tray showed 0 CPU, so the hidden window is throttled at least some of the
  time; the cost came from when it rendered.

### Reproduction (Chromium, a copy of the real config)

A scratch server on a copy of the dashboard data, the Studio in headed Playwright Chromium 1193, Design view, idle.

- **No JS leak.** Ten minutes with a forced GC each minute: heap 12.5 → 14.3 MB, then flat; DOM and listeners flat.
  Clicks on a fresh page took 16–128 ms (Event Timing API).
- **No native growth in 15 min of Chromium** (renderer ~270 MB, GPU ~165 MB, flat). The overnight growth is either
  WebView2-specific or needs hours.
- **Idle CPU is the sluggishness.** Design view: renderer ~0.5 core + GPU ~0.55 core. Help and Library: ~0.
- **What drives it** (3 s devtools trace with invalidation tracking): ~713 main-frame updates a second and thousands
  of style recalcs from CSS transitions on paint/layout properties that restart at every sensor update:
  `transition-colors duration-700` heatmap cells (9,851 recalcs), SVG ring `stroke-dashoffset` (1,262),
  `transition-all` markers (748), `transition-[width]` bars (394 recalcs + 394 layouts).
- Per-widget ablation (hide one at a time) showed no single culprit; System Overview was the biggest (GPU
  0.61 → 0.40).

### What the research says

Sources: Microsoft's [WebView2 performance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)
guide, the [ICoreWebView2_3](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_3)
(TrySuspend) and [ICoreWebView2_19](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19)
(MemoryUsageTargetLevel) references, wry's source, and these issues:

| Issue | Status | What it says |
|---|---|---|
| WebView2Feedback #3207 | closed, by design | A hidden window with a running CSS animation costs 0.3–0.5 core; set `IsVisible=false` |
| WebView2Feedback #4879 | open | `visibilitychange` doesn't fire when the host is minimized or covered |
| WebView2Feedback #3263 | closed | Microsoft: use `TrySuspend` or `MemoryUsageTargetLevel` |
| WebView2Feedback #4851 | open | `TrySuspendCompleted` may not fire with a custom scheme (Tauri uses one for app pages) |
| WebView2Feedback #5138 | open | Renderer non-heap growth with a `WebResourceResponseReceived` handler (we don't use one) |
| WebView2Feedback #1172 | open | No rAF background throttling for WebView2 on Windows |
| tauri#5250 | open | Tauri doesn't hide the webview on minimize; `background_throttling` is unsupported on Windows |

- wry 0.57 calls `controller.SetIsVisible` only at creation and in the webview's `set_visible`, never on window hide
  or minimize.
- `additionalBrowserArgs` replaces wry's defaults (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`);
  re-include them if it is ever set. Don't ship `--disable-gpu`.
- Microsoft also recommends reloading long-running pages periodically and testing newer runtimes.

## What 1.3.0-beta.10 changed

### The hidden or minimized Studio is suspended

`src-tauri/src/webview2.rs`, called from `src-tauri/src/windows.rs`:
- **Hide to tray** (`close_main`): flush the page, hide, then `SetIsVisible(false)` + `ICoreWebView2_3::TrySuspend`.
  If TrySuspend refuses, `MemoryUsageTargetLevel` goes to Low instead (and back to Normal on resume).
- **Minimize** (the `Resized` event with `is_minimized()`): the same, on a thread that flushes first. One flush at a
  time.
- **Show** (`show_main`, restore): `Resume` + `SetIsVisible(true)` before the window shows. `SetIsVisible(true)` always
  runs, so a failure can't leave a black window.
- **Ordering.** WebView2 calls run on the UI thread via `with_webview`. Resume requests are counted when they're made,
  and a suspend asked for before a later show is dropped, so a quick hide-then-show never ends visible-but-suspended.
- **Flush** (`flush_studio`: quit, stop, restart) wakes the page first and re-suspends only a window nobody sees.
- A visible window, including Kiosk view, is never suspended. The Settings window isn't suspended (it is destroyed on
  close).

### WebView2 task manager

Settings › Diagnostics › **Open WebView2 task manager** (`open_webview_task_manager`, `ICoreWebView2_6::
OpenTaskManagerWindow`, granted to the Settings window only). Shows memory and CPU per WebView2 process, so a growth
can be pinned on the renderer or the GPU process.

### Widget motion

- Bars and fills animate `transform` (`scaleX`/`scaleY`, or `slideX`/`slideY` inside an `overflow-hidden` track to
  keep rounded ends): `src/widgets/core/motion.ts`, exported from `src/widgets/kit.ts`. Fractions clamp to [0, 1].
  Stacked bars (PowerDraw, DiskIO) use `stackX`.
- Hold markers (`HoldMark` in `primitives.tsx`) move by transform only.
- Heatmap cells, LED segments, blocks and StatusTracker step their colour with the data.
- Rings (`Ring`, `RingStack`, AudioMeter) step; with Smooth on they glide 300 ms linear (was 1 s).
- The ticker (`src/lib/ticker.ts`, `wakeDelay`) sleeps on a timeout between capped frames instead of requesting a
  frame every vsync. Uncapped (`maxFps` 0) stays plain rAF.
- Kept on purpose: `.wp-bar-fill` (`WidgetView.tsx`) still transitions `width`, because user custom CSS targets it;
  Achievements, Gauge, bottom sheet and PlaytimeShare keep their own transitions.

Measured on the same page (3 s trace, before → after): layouts 711 → 194, paints 4,285 → 2,394, animation frames
714 → 179, heatmap recalcs 5,248 → 0. Renderer CPU fell 10–30%; GPU about unchanged. On main after the release:
renderer 0.39 + GPU 0.41 cores on first load (`tools/perf/studio-cpu.cjs`, 10 s).

## What 1.3.0-beta.15 changes

Overnight, a Studio window left visible but unfocused still grew its renderer to ~2 GB private memory (JS heap
28–53 MB, so native memory). Suspension only covers hidden or minimized windows, so:

- **Low memory target while unfocused** (`webview2::set_unfocused`, from the main window's `Focused` event in
  `windows.rs`): `ICoreWebView2_19::SetMemoryUsageTargetLevel` Low on losing focus, Normal on focus and in resume.
  Shares `MEMORY_LOWERED` with the suspend fallback; a suspended webview is left alone.
- **Studio refresh** (`src-tauri/src/refresh.rs`, app setting `studioRefresh`: `idle` default, `daily`, `off`, in
  Settings › General › Window). A thread checks once a minute; the decision is the pure `refresh::due`. `idle`: window
  visible, not minimized, not suspended, unfocused for 30 minutes, once per unfocused stretch. `daily`: once per
  local day at or after 04:00, while unfocused (an app started after 04:00 skips that morning). A refresh flushes
  the page (`flush_studio`), then `location.reload()`, only on the Studio page and only if the window is still
  unfocused. Logged as `studio refresh: <reason>` at info.
- **Renderer crash recovery** (`webview2::watch`): `add_ProcessFailed` on the main webview; a render process exit or
  hang logs a warning and calls `Reload()`, other kinds are only logged.
- **Runtime update notice**: `ICoreWebView2Environment::add_NewBrowserVersionAvailable`, registered once per run;
  the main window gets the Tauri event `webview-runtime-updated` with `{ "version": "<new version or empty>" }`.

Not verified without the real app: the memory effect, the crash reload and the runtime event (needs a runtime
update while the app runs). Watch `app.log` for `studio refresh:` lines and compare `metrics.csv` overnight.

## Releasing the hidden Studio

A hidden, suspended webview still holds its renderer and GPU memory, so after a while in the tray the page is closed
(`src-tauri/src/release.rs`, app setting `releaseHiddenStudio`: `after1m`, `after10m` default, `after60m`, `never`, in
Settings › General › Window). `close_main` marks the time it hid the window (`release::hidden`), `show_main` clears it
(`release::shown`). A thread checks every 10 s with the pure `release::due`; when due it confirms the window is still
hidden, flushes the page (`flush_studio`), destroys the window and resets the suspend state (`webview2::forget`). The
tray's Show rebuilds the window like a first launch. Edits are saved by the flush; the page's undo history is lost.
The window-state plugin keeps the geometry in memory, so the rebuilt window opens where it was.
- Logged at info: `studio released after <n>m hidden` and, when the window is shown again, `studio rebuilt (<n> ms)`.

## Overnight check (to do)

1. Update to beta.10 and turn on debug mode (Settings › Diagnostics) so `metrics.csv` is written.
2. Note the time, use the Studio a little, then leave it in the tray overnight (and, another night, open and visible).
3. In the morning: `node tools/perf/metrics-trend.mjs "" 60 <start time, UTC>`.
   - **Fixed** if `webview MB` stays roughly flat while hidden.
   - Still growing while hidden: suspension isn't taking. Check `app.log` for `webview suspend:` lines (debug level)
     and WebView2Feedback #4851.
   - Growing only while visible: it's the page. Open the WebView2 task manager to see which process grows.
4. Also check by hand: the window comes back live (not black or frozen) from the tray and from minimized; a
   `target=_blank` link opens the browser; the task manager button opens.

## Open items

1. **The overnight result** above. Nothing has confirmed yet that suspension stops the native growth.
2. **First-load cost with Smooth on.** The Design canvas still costs ~0.3–0.4 renderer + ~0.4–0.5 GPU cores in
   Chromium on first load. With every transition forced off it drops to ~0.28 + 0.25; the rest is compositor
   transform animations and the 300 ms ring glides.
3. **The hot/cold mystery.** On first load the Studio is "hot" (the ticker requests ~257 frames a second, ~0.5 + 0.55
   cores). After Design → Help → Design, or a reload after that, it is "cold" (~1 frame a second, ~0.07 + 0.02
   cores) with the same widgets and live values; in the cold state the transitions barely run and the Now Playing
   spectrum is flat. Cause not found. Ruled out: media playback, the first user gesture (AudioContext), localStorage,
   sessionStorage (unused), `data-lite-motion`, resize loops outside widgets, the marquee, PulseDot's box-shadow,
   capping rAF at 60 Hz. Next idea: compare which ticker subscribers exist in each state (instrument `subscribeTick`
   in a debug build) — the cold state may be the bug (smoothing and visualisers not re-subscribing after a remount).
4. **Periodic reload while hidden** (Microsoft's advice for long-running pages), if suspension alone isn't enough.
5. `msWebView2SimulateMemoryPressureWhenInactive` and similar flags are undocumented; only with evidence.

## How to measure

Never measure on the live data or the running installed app.

1. Copy `%LOCALAPPDATA%\InfoPanel\Dashboard` to a scratch folder and start a server on it:
   `PORT=39601 DASHBOARD_DATA_DIR=<copy> node server.mjs` (add `DASHBOARD_DIST=<folder>` to serve another build; an
   unminified build, `npx vite build --minify false --outDir <folder>`, gives readable function names in profiles).
2. `PW_CORE=<path to playwright-core> CHROME=<chrome.exe> node tools/perf/studio-cpu.cjs "http://127.0.0.1:39601/?studio=1" cpu 15`
   for renderer/GPU cores, or `trace` for frame and invalidation counts. It uses a throwaway browser profile, so
   every run is a first load (the "hot" state).
3. For the installed app, read `metrics.csv` with `tools/perf/metrics-trend.mjs` (read-only), and use Process
   Explorer or the WebView2 task manager. WebView2 DevTools can't be attached to a running app;
   `INFOPANEL_STUDIO_CDP_PORT` in a debug build (never a release build) adds a debugging port at launch, but the port did not open on the
   WebView2 build tested before ([README](README.md#testing-without-touching-the-live-setup)).
4. Other probes used in the investigation (kept in the session notes, not the repo): post-GC heap snapshots over 10
   minutes, Event Timing for click latency, per-widget `visibility: hidden` ablation, and wrapping
   `requestAnimationFrame` in an init script to count callers.
