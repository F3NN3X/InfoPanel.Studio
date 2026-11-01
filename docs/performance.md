# Kiosk performance

How the kiosk page (`/?kiosk=1`, the page InfoPanel shows on the panel) keeps its frame cost down. This covers the
Max FPS and Motion settings, what each animation runs on, what was measured in 1.3.0-beta.6 and what is still open.
The desktop Studio window's memory and CPU (1.3.0-beta.10: suspending the hidden webview, widget motion on the
compositor, the ticker sleeping between capped frames) are in [desktop/webview-performance.md](desktop/webview-performance.md).

The work shipped in 1.3.0-beta.6:

| PR | Change |
|---|---|
| #98 | One shared, capped animation ticker, with the Max FPS and Motion settings |
| #99 | Our own marquee, clock format and scrolling text, with the InfoPanel import remap |
| #100 | Animated gradients turn through refs, without React renders |
| #101 | Visualizers, Ken Burns and pulse dots run on the capped ticker; widget CSS motion off below 60 fps |

## Settings

Two settings decide how much the page animates.

- **Max FPS:** 5, 15, 30, 60 or 0 (unlimited, every display frame). The default is 60.
  - It is stored as `general.maxFps` in `config.json`.
  - A profile can override it with `performance.maxFps`.
- **Motion:** `system` (follow the OS's `prefers-reduced-motion`), `reduce` or `full`. The default is `system`.
  - It is stored as `general.motion`.
  - A profile can override it with `performance.motion`.
- **Refresh kiosk pages:** `daily` (reload at 04:00 local plus up to 5 min of jitter, to give back the memory a long run holds) or `off`. The default is `daily`. It is stored as `general.kioskRefresh`.
- **Rendering** (Settings › Dashboard › Performance), four switches that trade a little polish for a page that rests between readings:
  - **Ring glides** (`general.ringGlide`, default off): rings ease to each reading; off, they step.
  - **Limit blur** (`general.blurLimit`, default on): caps a widget's blur at 12 px.
  - **Blur inside widgets** (`general.innerBlur`, default off): small badges and cards inside a widget blur what is behind them; off, they keep their tint.
  - **Live graph glow** (`general.liveGlow`, default off): a graph's glow is a filter redrawn with the line; off, a static glow is drawn under it.

**URL overrides** apply to kiosk pages only:
- `&fps=5|15|30|60|0`;
- `&motion=reduce|full|system`;
- `&animations=0`, which is the same as `motion=reduce`. When both are given, `motion` wins.

An invalid value is ignored.

**Precedence:** URL > profile > general > default (`resolvePerformance` in `src/lib/performance.ts`). `PerformanceProvider`
(`src/hooks/use-performance.tsx`) resolves the values and does two things:
- points the shared ticker at the resolved Max FPS;
- sets `data-lite-motion` on `<html>` when Motion resolves to reduce or Max FPS is below 60 (and not 0).

Below 60 fps or with Reduce, the page does much less work. **At the default of 60 it saves little.** On a panel,
30 or 15 is usually enough.

## What each kind of motion runs on

### The shared ticker
`src/lib/ticker.ts` has one `requestAnimationFrame` loop for the whole page.

- It calls its subscribers only at the Max FPS interval. `nextTick` steps by whole intervals, so the rate doesn't drift, and it restarts after a stall.
- Each subscriber may have its own, lower cap (`subscribeTick(cb, capFps, label)`; ambient motion uses `AMBIENT_FPS`, 30).
- **It goes idle.** A callback returns nothing to keep going, `SETTLED` to sleep until woken, or a number of ms to
  sleep for (a clock returns the time to its next second or minute). The loop asks for the frame the earliest
  subscriber wants, no sooner than Max FPS allows, and sleeps on a timer in between instead of waking every vsync.
  With every subscriber asleep it asks for nothing.
- **Waking.** `wakeTicker()` wakes every settled subscriber: a sensor-store change, a config change (`App.tsx`) and a
  window resize call it. A subscriber sleeping for a set time keeps its time. `useTick` also wakes its own subscription
  on every render, since new props may move it again; `subscribeTick` returns the unsubscribe with a `wake()`.
- It runs only while something is subscribed and the page is visible.
- A subscriber that unsubscribes earlier in the same tick is not called.
- Components subscribe with `useTick` (`src/hooks/use-tick.ts`) or `subscribeTick`.
- **Throttle** (`setTickerThrottle`): `slow` caps the loop at 5 fps and pauses the ambient subscribers (those capped at
  `AMBIENT_FPS`); `stop` asks for no frames. The studio uses it when unfocused (below); kiosks never do.
- **Debug stats.** In the dev server, Vitest and a `npm run build:stats` build (unminified, `.cache/dist-stats`),
  `window.__tickerStats()` lists the subscribers by label and cap (the audio frame loop's listeners with
  `via: "frame-loop"`), the frames asked for and run per second since the last call, how many sleep, and whether the
  loop is idle. Release builds leave it out; `npm run perf:budgets` fails if `__tickerStats` is in either entry closure.

#### What each subscriber does when idle

| Subscriber (label) | Cap | When idle |
|---|---|---|
| `statusbar:clock`, `countdown:clock` | Max FPS | Sleeps until the next second or minute boundary. |
| `graph:smooth` (`SmoothGraph`) | Max FPS | Unsubscribes once the curve has converged; a new sample resubscribes. |
| `infopanel:gauges` (`ProfileView`) | Max FPS | Subscribed only while a gauge is still moving. |
| `infopanel:paint-turn` (turning gradient) | Max FPS | Continuous while the gradient turns. |
| `marquee` | Max FPS | Continuous while text overflows and is on screen. |
| `pulse-dot` | Max FPS | Sleeps through each period's rest (the last 30 %). |
| `weather-fx`, `weather-icon`, `kenburns` | 30 | Continuous ambient motion; paused when the studio is throttled. |
| `frame-loop` with `viz:input`, `viz:paint`, `media:analyser` | 30 | Runs at its listeners' cap; the visualiser input stops 1 s after the last paint read, the engine unsubscribes off screen and while hidden. |

### The unfocused studio
`src/lib/studio-focus.ts` (`useStudioFocusThrottle`, mounted in the studio only): 60 s after the studio window loses
focus, the ticker throttles to `slow`; while the page is hidden it stops. Focus or visibility restores it at once.
In the app, focus comes from the shell's `studio-focus { focused, reduce }` event (`src-tauri/src/windows.rs`), where
`reduce` is the **Reduce studio animation when unfocused** setting (Settings › General › Window, on by default); in a
browser, from the window's `blur` and `focus` (focus moving into the studio's own frame doesn't count), always on.

The rAF itself still fires at the display rate while a tick is due soon. That costs almost nothing, because it only
compares timestamps until a tick is due.

### On the ticker, capped at Max FPS
- **Smooth graphs and value glides** that are driven by script (`smoothing.ts`, `SmoothGraph`). A frame gap is clamped at 250 ms, so 5 fps still moves in real time.
- **Marquees and scrolling text** use `src/components/ui/marquee.tsx` and `src/lib/marquee.ts`. These replace InfoPanel's native marquee, and imports remap to them (`native/convert.ts`).
- **The clock colon blink** and the clock and date formats (`src/lib/clock-format.ts`).
- **Animated gradients.** `paintAt` in `scene.ts` and `writePaint` in `Paint.tsx` write the angle straight to the DOM, so a turning gradient causes no React render. `ProfileView` keeps a frame state only while a gauge moves.
- **The audio frame loop** (`src/lib/audio/frame-loop.ts`). It feeds the visualizers and runs its update phase, then its paint phase, inside one ticker subscription, and it sleeps with no subscribers. `subscribeFrame(listener, phase, label, capFps)` caps a listener; the loop subscribes at its listeners' cap (every frame while any is uncapped). `MAX_FRAME_GAP_MS` is 250.
- **Ken Burns** (GameSpotlight, `KenBurns` in `src/widgets/core/primitives.tsx`) writes its transform through a ref. It keeps the old look: 22 s, alternate, ease-in-out. The curves are in `src/lib/curves.ts`.
- **The pulse dot** (`src/components/pulse-dot.tsx`) is the 1.4 s ease-out ring on the island's activity dot and the CodingAgents session dot. It replaced the `island-pulse` CSS animation.

### Reduced motion
- **The ticker-driven animations** above stop.
- **A visualizer** (`src/widgets/core/viz/engine.ts`) paints one still frame and doesn't subscribe. The frame is painted again after a resize, because resizing a canvas clears it. Capture sampling stops (`use-viz-input.ts`).
  - The still frame shows the input as first read, which is usually silent. It is not live audio.

### CSS transitions and animations
CSS motion runs at the display rate, whatever the cap. A `width` or `height` transition also lays the page out
every frame while it runs. The "smooth" skin's 1 s glides run almost all the time, because readings arrive about once a second.

Under `data-lite-motion`, `src/index.css` turns `transition` and `animation` off for everything inside the widget
shell (`[data-wp-tier]`). This covers:
- bar and ring glides;
- heat tiles;
- NowPlaying's EQ and vinyl;
- the Fans spinner;
- the retro title cursor.

Readings then step at the data rate. At 60 fps the rule is off and widgets look as before.

Left running, because they are short or outside the widget shell:
- the island's enter, critical and level-bar motion;
- the alert ring (it already honours reduced motion);
- the `Loader2` spinners in the upload tray, media field and settings;
- the gauge preset `.glow` pulse.

## Measurements

All tests used the owner's real profile "MyDefault" at 1920x550. It is a widget grid with:
- NowPlaying with a visualizer;
- WaveLink meters;
- GameSpotlight;
- Clock;
- Weather;
- SystemOverview;
- SteamFriends;
- CodingAgents;
- the island.

### Headless probe (Chromium, 6 s window after a 5 s warm-up)
This is page-side work from `Performance.getMetrics` deltas, with `requestAnimationFrame` wrapped to count callers.

| Build and setting | layouts/s | style recalcs/s | task ms/s | frames/s | rAF chains at display rate | infinite animations |
|---|---|---|---|---|---|---|
| before #101, fps=15 | 45 | 67 | 78 | 60 | 2 (ticker and audio frame loop) | 3 |
| after #101, fps=15 | 16 | 23 | 34 | 16 | 1 (ticker only) | 0 |
| before #101, fps=15, reduce | 11 | 66 | 67 | 60 | 1 | 3 |
| after #101, fps=15, reduce | 1.3 | 1 | 9 | 1.5 | 0 | 0 |
| before #101, fps=60 | 50 | 57 | 94 | 50 | 2 | 3 |
| after #101, fps=60 | 60 | 68 | 96 | 60 | 1 | 0 |

The three infinite animations before #101 were Ken Burns (WAAPI) and two `island-pulse` CSS animations.

An earlier probe on #98 to #100 at fps=15 found about 107 layouts/s and 247 style recalcs/s. Instrumenting
`getBoundingClientRect`, `offsetWidth`, `clientWidth` and similar showed no JavaScript layout reads, apart from
the viz palette's `getComputedStyle` (about 7/s, style only). The layouts came from the widget CSS transitions above.
Hiding every `svg` dropped layouts from 50/s to 11/s, which points at the `stroke-dashoffset` ring transitions.

### Headed Edge (GPU and renderer CPU, 120 s after a 20 s warm-up)
This is an Edge `--app` window at 1920x550 with its own profile, and with occlusion and background throttling
turned off. CPU is summed per Chromium process type and given in cores (1.0 = one core).

The first matrix ran on #98 to #100, before #101:

| Build and setting | GPU process | renderer |
|---|---|---|
| beta.5 | 0.694 | 0.394 |
| Max FPS 60, full | 0.686 | 0.330 |
| Max FPS 30 | 0.718 | 0.325 |
| Max FPS 15 | 0.713 | 0.354 |
| Max FPS 5 | 0.663 | 0.343 |
| Max FPS 60, reduce | 0.683 | 0.325 |
| beta.5, control | 0.742 | 0.443 |

No setting changed anything: the audio loop, the infinite animations and the CSS transitions were outside the cap.

The second matrix ran on the beta.6 code (#101 merged), as a debug build:

| Build and setting | GPU process | renderer |
|---|---|---|
| beta.5, control | 0.836 | 0.494 |
| Max FPS 60, full | 0.651 | 0.426 |
| Max FPS 30, full | 0.149 | 0.199 |
| Max FPS 15, full | 0.105 | 0.152 |
| Max FPS 5, full | 0.059 | 0.114 |
| Max FPS 60, reduce | 0.016 | 0.064 |
| Max FPS 15, reduce | 0.019 | 0.071 |

Against the control:
- Max FPS 30 cuts the GPU process by about 82%.
- Reduce cuts it by about 98%.
- 60 fps saves about 22%.

### InfoPanel's own WebView2
CPU, as a percentage of one core:

| Run | GPU process | renderer |
|---|---|---|
| beta.5, 120 s | 111.8 | 18.4 |
| debug server at Max FPS 15, with InfoPanel still on the old page | 111.5 | 13.1 |
| before beta.6, 20.7 h average | 111 | 14.3 |
| beta.6 at the default settings (Max FPS 60, Motion full), 2 min after an InfoPanel restart | 107 | 18.0 |

During the beta.6 sample, the plugin hosts (11) used 11.8% and InfoPanel's main process 4.5%. Studio's app and
node server used 0.5%.

Notes:
- The beta.6 sample ran at 60 fps, where the page is expected to save only about 20%. Max FPS 30 and Reduce have not been measured inside InfoPanel yet.
- The same beta.5 page used about 0.7 to 0.8 cores in Edge, against 1.1 cores in InfoPanel's WebView2. So probably part of the GPU cost comes from how InfoPanel hosts or captures its WebView, not from the page. This is unconfirmed.
- An InfoPanel WebView does not reload by itself after Studio updates. Restart InfoPanel to load a new kiosk build.

## Open items

1. **Measure inside InfoPanel at Max FPS 30 and with Reduce**, 60 s each. Check the profile has no `performance`
   override that puts it back to 60.
   - If the GPU process drops a lot, the page is doing its job. Consider 30 as the kiosk default.
   - If it stays near 1.1 cores even with Reduce (Edge: 0.02), the remaining cost is in InfoPanel's WebView hosting, not in the page.
2. **Glides at the cap.** Below 60 fps the "smooth" skin's bar and ring glides are off. Since 1.3.0-beta.10 bars
   glide as a `transform` (no layouts; `src/widgets/core/motion.ts`), but `data-lite-motion` still turns them off
   below 60. A ticker-driven glide would bring them back at the cap.
3. **Kiosk auto-reload.** A kiosk page that reloads when the server build changes would remove the manual InfoPanel restart.
4. **Smaller leftovers.**
   - A text widget with no explicit width gets an inert marquee.
   - Uppercase is listed as lost when importing Clock and Calendar.
   - The island level bar still animates `width`, but it's short and only shows during a notice.

### Widgets on demand (bundle footprint, 2026-10-26)

Each widget kind's component is its own chunk (`src/widgets/lazy-widget.tsx`, the design in
[architecture.md](architecture.md#the-render-pipeline-of-a-module-zone)). Measured with `npm run perf:budgets` and
`npm run perf:kiosk` (3 runs, median), before and after:

| | Before | After |
|---|---|---|
| Kiosk entry closure, gzip | 350,222 B | 254,377 B (−27 %) |
| Studio entry closure, gzip | 672,923 B | 577,460 B (−14 %) |
| JS the heavy / light fixture kiosk loads (raw) | 1,224 / 1,116 KB | 1,001 / 782 KB |
| Load requests, heavy / light | 16 / 8 | 34 / 15 |
| First contentful paint, heavy / light | 204 / 184 ms | 188 / 196 ms (noise) |
| Idle task time, heavy | 112 ms/s | 110 ms/s (noise) |

The requests rise because each kind and the code its kinds share are chunks of their own, fetched in parallel from
the local server; first paint and the first zone didn't move. Six of them are small shared chunks Rollup splits off
the entry because the Help page also reaches the registry (`help/generated.ts` → `studio-modules.ts`).

## The harness

A committed, reproducible harness (Playwright, `playwright.config.ts`). It never touches the real data folder: every
spec starts its own scratch server on a temp copy of `tests/fixtures/perf/data`.

- **Fake Data API** (`tools/perf/fake-data-api.mjs`): `/api`, `/api/sources`, `/api/sensors`, `/events` and the
  filtered `/events?prefix=&interval=` stream, in the shapes `src/lib/sensor-store.ts` reads. It serves the widget
  fixtures' sensors (`src/widgets/__fixtures__`) with numeric values on a seeded wave: `RATE_HZ` (1), `AUDIO_HZ`
  (10, the audio meter keys), `SEED` (1), `PORT=0`.
- **Fixture** (`tests/fixtures/perf/`): built through the server's own API by `node tools/perf/make-fixture.mjs`.
  - `perf-heavy`: StatusBar, SystemOverview with rings and heatmap, CoreHeatmap, GpuRings (RingStack), AudioMeter,
    Weather with fx, an imported canvas with a gauge icon, the island, an image background.
  - `perf-light`: Clock and two SensorValue zones, plus a second page.
  - `perf-viz`: Now Playing with its visualiser and a Visualizer, for the hot/cold round trip. Its own profile, so the
    heavy and light numbers stay comparable across phases. The fake Data API gives each audio device a moving
    32-band `spectrum` and holds `*-state` enums, so the player stays playing.
  - `fixture.json` names the profiles, zones and selectors the specs use.
- **Scratch runner** (`tools/perf/scratch.mjs`): copies the fixture, starts the fake Data API and the server
  (the `ips-server` debug build, or the binary `SERVER_CMD` names), points `dataApiUrl` at the fake API, and gives the server an
  empty home and InfoPanel folder. `node tools/perf/scratch.mjs` starts one by hand.
- **Functional specs** (`tests/e2e/`, `npm run test:e2e`): kiosk render, live config update, control page switch,
  studio edit/save/undo, image-proxy rules, request guard, and the kiosk request budget.
- **Perf specs** (`tests/perf/`, `npm run perf:kiosk`, `npm run perf:studio`): each page measurement is a fresh
  context, a load under a short trace (JS bytes, parse/compile ms, first zone, FCP, requests), a 5 s warm-up and a
  10 s window (`Performance.getMetrics` deltas, rAF callbacks/s, running animations), repeated 3 times (median and
  range). `kiosk-idle` (heavy and light, at the default 60 fps and at `&fps=30`), `studio-idle`, `studio-hot-cold`
  (heavy and `perf-viz`: Design, then Help with the studio window minimized, then Screens → Design; records the rAF
  callers, the ticker's subscribers with a stats build, and whether the visualiser canvas moves), `studio-unfocused`
  (blurred for 65 s: at most 6 rAF/s, back within 1 s on focus) and `server-idle` (server RSS with two kiosks and a
  studio open, every 5 s for 60 s). For the ticker's subscribers, run `npm run build:stats` and set
  `DASHBOARD_DIST=.cache/dist-stats`.
- **Desktop specs** (`tests/desktop/`, Windows): the debug build on scratch folders, attached over CDP
  (`INFOPANEL_STUDIO_CDP_PORT`, debug builds only), sampled with `tools/perf/process-sampler.mjs`:
  `tray-close-releases-webview`, `studio-idle-webview2` and `studio-unfocused-webview2` (a small window of its own
  takes the focus without covering the studio; the app's tree every minute for `PERF_SAMPLER_MS`, 30 min). Setup in
  [desktop/README.md](desktop/README.md#testing-without-touching-the-live-setup). `PERF_REPEATS`, `PERF_WARMUP_MS`,
  `PERF_WINDOW_MS` and `PERF_SERVER_MS` shorten a trial run.
- **Reports**: `tools/perf/bundle-report.mjs` (entry closures from Vite's build manifest), `tools/perf/disk-report.mjs`
  (installer, installed folder, `src-tauri/resources/`). Results land in `.cache/perf/<label>/` (`PERF_LABEL`, else
  the git short SHA).
- **`npm run perf:all`** builds and runs all of it; **`npm run perf:compare <A> <B>`** prints a markdown table, flagging
  differences whose ranges overlap as noise.
- **Budgets** (`tools/perf/budgets.json`, `npm run perf:budgets`, in CI): kiosk and studio entry gzip bytes (CI's
  measured bytes, with `entryGzipSlack`, 0.1 %, on top: the same build gzips a few bytes apart per platform), kiosk load
  requests (in `tests/e2e/kiosk-budget.spec.ts`), whether React's server renderer may be in the kiosk closure, and no
  debug-only global (`__tickerStats`) in either closure.
  CPU, memory and frame counts are report-only.

Results: [perf-results/](perf-results/).

### Node server heap flags (tried, not kept; the Node server is gone)

`--max-old-space-size=96 --max-semi-space-size=2` on the sidecar, measured on the heavy fixture with three alert
rules firing and clearing (36 alerts in each run), two kiosks and a studio open, 10 minutes each, `--trace-gc` on
both (2026-10-23, Node 24.6, Windows):

| | RSS median | Private median | Event-loop p99 | GCs (scavenges + mark-compacts) | GC pause total |
|---|---|---|---|---|---|
| no flags | 63.6 MB | 64.8 MB | 16.6 ms | 103 (101 + 2) | 19.8 ms |
| flags | 61.1 MB | 62.1 MB | 16.6 ms | 129 (126 + 3) | 24.8 ms |

RSS fell 3.8%, short of the 15% that would justify the flags, and GC ran 25% more often, so the Node server was
left unchanged. The heap is ~10 MB of the ~62 MB: the rest is Node's own runtime, which no heap flag reaches. The p99
is Windows' ~15.6 ms timer resolution (see `docs/desktop/README.md`), not a stall.

## How to measure by hand

The method behind the harness, for a real profile:

1. **Never measure on the live data.** Copy `%LOCALAPPDATA%\InfoPanel\Dashboard` and start a server on the copy with:
   - `DASHBOARD_DATA_DIR=<copy>`;
   - `INFOPANEL_DATA_DIR=%LOCALAPPDATA%\InfoPanel` for live sensors;
   - `PORT=0`, or a spare port.

   For a desktop debug build, set `INFOPANEL_STUDIO_CONFIG_DIR` to a scratch folder holding a settings copy, so the installed app's settings and startup entry stay untouched.
2. **Headless page work.** Open `/?kiosk=1` at 1920x550 in Playwright Chromium and warm up for 5 s.
   - Take `Performance.getMetrics` deltas over 6 s: `LayoutCount`, `RecalcStyleCount`, `TaskDuration` and `Frames`.
   - Record `document.getAnimations()`.
   - Count rAF callers by wrapping `requestAnimationFrame` in an init script and recording the top stack frame.
   - Vary the settings with `&fps=` and `&motion=`.
3. **Headed GPU cost.** Start `msedge --app=<url> --window-size=1920,550` with:
   - `--user-data-dir=<scratch>`;
   - `--disable-features=CalculateNativeWinOcclusion`;
   - `--disable-backgrounding-occluded-windows`;
   - `--disable-renderer-backgrounding`;
   - `--disable-background-timer-throttling`.

   Warm up for 20 s. Then snapshot `TotalProcessorTime` for every `msedge.exe` whose command line has the scratch profile, wait 120 s and snapshot again. Group by `--type=` (gpu-process, renderer) and divide by the elapsed seconds to get cores.
4. **Set Max FPS and Motion between runs** with a `POST /api/config` that carries the `x-dashboard-config: 1` header and the changed `general` block. Restore `config.json` from a backup afterwards.

### Over a long run (installed app)

Run the app as you normally would (kiosk shown, Studio open or closed), then in a terminal at the repo root:

1. `node tools/perf/process-sampler.mjs`: one line a minute to `.cache/perf/processes-<date>.csv` with CPU (% of one core) and private MB for the app, its server process (none now: the server runs in the app) and each WebView2 role (browser, renderer, GPU, utility). Debug mode is not needed. Leave it running; Ctrl+C stops it.
2. Optionally turn on debug mode (Settings › Diagnostics) too: `metrics.csv` adds the JS heap, DOM nodes and event streams inside the page and the server's own heap.
3. Next day: `node tools/perf/process-sampler.mjs --report .cache/perf/processes-<date>.csv` prints hourly averages and the per-hour trend; `node tools/perf/metrics-trend.mjs` does the same for `metrics.csv`. A renderer or server MB that keeps climbing hour after hour is a leak; a flat line after the first hour is the working set.
