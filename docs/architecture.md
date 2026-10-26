# Architecture

How sensor data reaches a zone, how a zone is rendered, and how the layout
config is stored and synced. Everything here is read from the code; file
paths are given so you can check.

```
InfoPanel Data API  (default http://127.0.0.1:3921)
   /events?prefix=…   /api/sensors   /api/sources   /api/images/…
        │  read straight from the browser (CORS)
        ▼
 browser page ──── /api/config, /events/config, /api/image-proxy, /api/assets ────▶ dashboard server
 (kiosk or studio)                                                                   (ips-server, 127.0.0.1:3922)
```

Sensor data never passes through the dashboard server. `ips-server` serves
the build, stores the config and uploaded media, and proxies cover-art
images; the page talks to the Data API directly.

## 1. The InfoPanel Data API

The base URL is the `dataApiUrl` setting of the config, default
`http://127.0.0.1:3921` (`src/lib/data-api.ts`). `normalizeApiBase` accepts
only http(s) URLs and trims trailing slashes; anything else falls back to the
default. `App` applies the saved value before the first connection and
follows later changes (`setApiBase`), so changing the URL in the studio
reconnects without a reload.

| Endpoint | Used for | Code |
|---|---|---|
| `/events?prefix=<ns>&interval=1000` | Live sensor values (one stream per namespace) | `sensor-store.ts` |
| `/events` | The unfiltered stream, a full snapshot every second (fallback, see below) | `sensor-store.ts` |
| `/events?prefix=plugins.wavelink-plugin.wavelink.&interval=100` | Wave Link meters, their own stream | `wavelink.ts` |
| `/api/sensors` | Discovery of top-level sources; one snapshot for the studio's pickers | `sensor-store.ts`, `catalog.ts` |
| `/api/sources` | Plugin, container and entry names and types for the studio's pickers | `catalog.ts`, `sources.ts` |
| `/api` | "Test connection" (`testApiBase` expects status 200) | `data-api.ts` |
| `/api/images/{pluginId}/{imageId}` | Images a plugin hands to InfoPanel | `image.ts` |

### Prefix streams (`src/lib/sensor-store.ts`, `sensor-stream.ts`)

`sensorStore` is the page's one connection to sensor values. It does not poll
and does not read the full snapshot; it opens a filtered change stream per
namespace that mounted widgets read.

- **Namespace.** `namespaceOf` maps a key prefix to its stream prefix:
  `plugins.<first id segment>.` for plugin keys (`plugins.spotify-plugin.`),
  otherwise the top-level source (`libre.`, `system.`, `hwinfo.`, `spotify.`).
- **Messages.** Each message is `{ timestamp, sensors?, removed? }`. The first
  message after every (re)connect is the full set under the prefix; later
  ones carry only changed keys and removed keys. `mergeEvent` merges them
  copy-on-write: unchanged readings keep their old object, and a message that
  changes nothing returns the previous map itself. After a (re)connect, keys
  under the prefix that the full set does not carry are dropped.
- **Reference counting.** `retain(prefixes)` returns a release function.
  A stream opens (in a microtask, so a grid mounting many zones is planned
  once) with its first reader and closes 2 s after its last reader goes
  (`CLOSE_DELAY_MS`), so a quick re-mount reuses it. When a stream closes,
  values only that stream kept current are dropped.
- **Connection limit.** Browsers allow six connections per host over plain
  HTTP. `MAX_STREAMS` is 4, leaving room for the Wave Link stream.
  `planStreams` handles more namespaces than that: first it folds all plugin
  namespaces into one `plugins.` stream; if that is still too many, it uses
  the single unfiltered `/events` stream. A `plugins.` stream already covers
  every plugin namespace, so narrower plugin streams are dropped when it is
  wanted.
- **Reconnection.** `EventSource` reconnects on its own after a dropped
  connection, and the next message is a full set again. If the server refuses
  a stream and the `EventSource` closes for good, the store reopens it after
  5 s while it is still wanted. The last values stay on screen meanwhile;
  `useSensorsConnected` is true only while every open stream is open (and
  vacuously true with none), which drives the header badge.
- **Discovery ("every sensor").** The "Other sensors" catch-all zone reads
  every key (`useSensors(null)`). While it is mounted the store opens the
  base namespaces `plugins.`, `libre.` and `system.`, fetches `/api/sensors`
  to list the top-level sources that exist, and re-lists every 30 s to catch
  sources that start late (retrying after 5 s on failure).
- **URL change.** `setBase` closes every stream, clears all values, notifies
  subscribers and reconnects against the new base.

### The studio's catalog (`src/lib/catalog.ts`)

The studio's pickers (the Data Explorer, the bind picker, a widget's source
select) do not use the streams. `useSensorCatalog` fetches `/api/sources` and
one `/api/sensors` snapshot together, reuses a copy younger than 10 s, shares
one in-flight fetch, and starts over when the Data API URL changes.

### Images

`isImageUrl` decides which text sensor values are images (a URL with an image
extension, a sensor key naming an image field, a known image CDN, or a Data
API image path). `resolveImageUrl` resolves a root-relative
`/api/images/…` path against the Data API URL rather than the dashboard
server. To sample colors from cover art, the Now Playing widget fetches it
(`src/widgets/NowPlaying/art-tint.ts`) through `/api/image-proxy?url=` on the
dashboard server (https anywhere, http only on loopback), except same-origin
images, which it loads directly. The proxy relays only images (`src-tauri/crates/ips-server/src/proxy.rs`):
`image/*` except SVG, or `application/octet-stream` / no type when the bytes are
png, jpeg, gif, webp or avif (served with the sniffed type); anything else is 406.
Responses carry `X-Content-Type-Options: nosniff`.

## 2. Per-zone rendering

A zone only re-renders when one of the keys it reads changes.

- A module declares `prefixes` (keys it owns) and optionally `reads` (further
  prefixes it reads without owning). `moduleReads(mod)` is both
  (`src/modules/index.ts`). The "Other sensors" catch-all skips the keys of
  the plugins a built-in widget covers (`isClaimed`, a fixed prefix list).
- `placementPrefixes(placement)` returns what a placement subscribes to
  (`src/components/studio/placement-content.tsx`): `[]` for a blank zone,
  the bound sensor keys of the visible widgets for a custom panel,
  `null` (every sensor) for the "cards" catch-all, and `moduleReads` for a
  module. A widget template that needs data but cannot name its keys up front
  (a bound sensor, discovered hardware: System overview, Vitals, Thermals,
  Sensor value, …) is marked `readsAll` by `templateModule` and gets `null`, so
  it subscribes to every stream. A module with no prefixes and no data need
  (Web Page; Wave Link, which reads its own stream)
  subscribes to nothing and opens no sensor stream.
- `LivePlacement` calls `useSensors(prefixes)` (`src/hooks/useSensors.ts`).
  That retains the namespaces for the lifetime of the component and wraps the
  store in `useSyncExternalStore`, notifying only when a changed key starts
  with one of its prefixes. The returned map holds every streamed key, so
  modules read it as a plain `SensorMap`.

The kiosk grid (`App.tsx`) and the studio canvas both render zones through
`LivePlacement`.

### Style resolution (`src/lib/theme-model.ts`, `src/lib/style-resolve.ts`)

Every zone's look is resolved before it renders. Only the themed keys
(`THEMED_KEYS`, grouped into the followable sections `SectionId`: `skin`,
`colors`, `palette`, `surface`, `type`, `spacing`, `border`, `css`,
`format`, `thresholds`, `motion`) are layered, lowest first:

```
THEME_DEFAULTS            (today's defaults; a panel: its legacy PanelDef accent / background)
  → all-profiles style    DashboardConfig.style (no locks)
  → profile theme         MonitorProfile.widgetTheme  { values, locks }
  → page theme            ProfilePage.widgetTheme     { values, follow }
  → the widget's own      Placement.settings, per section - skipped while
                          Placement.follow[section] !== false, or the profile locks it
```

A section of a widget follows the theme unless its flag is `false`, and
always while the profile locks it; a page's own values for a section apply
only if the page made the section its own (`follow[section] === false`) and
the profile does not lock it. Values a following section skips stay stored.
`resolveStyle({ moduleDefaults, levels, own, follow, defs })` returns the
settings (other keys always from `own`; with the schema `defs`, a `perWidget`
row keeps its own value and a colour row with a palette `role` reads the
role's colour) and a per-key `source` (`default` / `dashboard` / `profile` /
`page` / `own`) that the inspector's dots show. `appearanceOf(config,
profile)` (a `ProfileView` carries its page's theme) collects the levels into an `Appearance`; `App.tsx` and the
studio canvas pass it to `LivePlacement`, and `placementContent` resolves each
zone with `resolveWith(appearance, own, placement.follow, moduleDefaults)`.
Panel items follow the panel's resolved look (`src/lib/panel-item.ts`:
`Widget.follow` per item section, `Widget.thr`), which follows the same
levels. The Dynamic Island reads the resolved settings too
(`zoneResolver`, each zone under its own page's theme).

### Where each setting comes from

Every layered setting resolves the same way, lowest first; the first level
that sets a value wins from the right:

| Setting | App default | Dashboard (`DashboardConfig`) | Profile (`MonitorProfile`) | Widget (`Placement`) | Resolved by |
|---|---|---|---|---|---|
| Themed keys (surface, accent, font, units, thresholds, …) | `THEME_DEFAULTS` | `style` | `widgetTheme.values` (and per-section `locks`); a page's `widgetTheme` (`values`, `follow`) over it | `settings`, per section unless `follow[section]` is not `false` or the profile locks it | `resolveStyle` (style-resolve.ts) |
| Theme colours, corner radius | `DEFAULT_THEME`, 0.5 rem | `theme`, `radius` | `theme` (partial, over the dashboard's), `radius` | - | `resolveTheme` (theme.ts) |
| Page background | none (the theme's page colour) | `background` | `background` (`{ type: "none" }` turns it off) | - (a widget's own background image is a look key) | `resolveBackground` (appearance.ts) |
| Grid gap, padding | 12 px; padding per mode (`profilePadding`) | - | `gap`, `padding` | - | `profileGap` / `profilePadding` (profile-grid.ts) |
| General (font, clock, locale, motion, cursor) | `GENERAL_DEFAULTS` | `general` | - | - (a widget's Font look key beats the page font) | `resolveGeneral` (general.ts) |

### The render pipeline of a module zone

```
Placement.settings
  → resolveWith(appearance, settings, follow) dashboard → profile → page → own (see above)
  → mod.render(sensors, settings)
       → hasKeys(sensors, prefixes)               no key under the prefixes: null (no data)
       → <TemplateZone>                           src/widgets/module.tsx (templateModule)
            → toFlat(sensors), toNames(sensors)   the data adapter, memoised per map
            → useZoneLook(defs, settings)         effectiveSettings; a chosen skin brings its
                                                  surface; skin fonts are loaded
            → <Component data names {...shellProps(look)} {...toProps(look)} look>
                                                  the widget kind's own chunk (lazy-widget.tsx):
                                                  nothing until it is in
                 → <Widget {...shell(p)}>         the shell (below): chromeOf(look) → zoom,
                                                  surface box, text variables, header
                      → content / <CompactView> / <StudioView>
  → PlacementFrame                                grid position, the zone's re-scoped tokens
                                                  (PlacementRender.scope); studio chrome or kiosk plain
```

- Each widget kind's component is its own chunk. The registry (`src/widgets/registry/`) keeps the catalog entry
  (`src/widgets/meta/`), the settings and `toProps` in the entry and wraps the component in `lazyWidget`
  (`src/widgets/lazy-widget.tsx`): a zone draws nothing until its chunk is in, then the widget on the next frame
  (no Suspense, whose reveal throttle would hold it back). `useWidgetPreload` (`src/widgets/preload.ts`) fetches the
  shown page's kinds together as soon as the profile is known, then, when idle, the other pages', so a page switch
  draws at once. On a screen change a kiosk keeps the old screen up until the new one's kinds are in
  (`useLoadedProfile`, at most 3 s), so it draws at once too; a kiosk never loads the kinds of screens it doesn't show. Sensor Value and Custom Gauge stay in the entry (the
  fallback grid and the canvas gauges use them). The island and the Status Bar read their helpers
  (`NowPlaying/track.ts`, `friends-data.ts`, `WaveLink/fader.ts`) apart from the widgets. Vitest renders with
  `renderToString`, which cannot wait for a chunk, so there the groups load their widgets first (a plugin in
  `vite.config.ts`; a top-level await in the source would split the kiosk entry).
- `effectiveSettings` is in `src/modules/types.ts`,
  `chromeOf` in `src/modules/standard-settings.ts`, `surfaceBox`, `tokenScope`
  and the `--wp-*` helpers in `src/components/widget-style.ts`, and the
  shared materials (`makeSurface`, the theme surface, `surfaceColors` /
  `surfaceTokens`) in `src/components/surfaces.ts`. The keys and their effects
  are in [widget-settings.md](widget-settings.md).
- Every zone type that is a module goes this way: the library templates and the
  "Other sensors" catch-all (`src/modules/other-sensors.tsx`, one `SensorValue`
  per unclaimed key). Only custom panels take the other pipeline (below).
- `ModernChrome` (`src/components/modern-chrome.tsx`) is now the root of
  panel zones; library widgets get the same `chrome` object from the shell.
- A `render` that returns `null` means "no data": the studio shows a
  placeholder, the kiosk leaves the zone empty (`PlacementFrame` renders
  nothing when `hasData` is false or the zone is blank). A template renders
  nothing only while no key under its prefixes exists; `SENSORLESS` ids
  (Clock, Calendar, Web Page, Wave Link) always render.
- `Placement.design` (accent, background, title header) is applied by
  `PlacementFrame` around the content, separately from the widget settings.
- **Errors.** `PlacementFrame` wraps each zone in a boundary
  (`src/components/zone-error-boundary.tsx`): a widget that throws shows a
  small error tile and the other zones keep rendering.

### The widget shell

`src/widgets/` is the widget library: 54 templates, each a component over flat
string data, drawn inside one `<Widget>` (`src/widgets/core/Widget.tsx`).
`src/widgets/kit.ts` re-exports what a widget file needs from `core/`.

- **Measuring.** `useBox` observes the shell's outer size and returns a
  `Box`: `w`, `h`, a size tier (`xs` < 220×140 ≤ `sm` < 340×210 ≤ `md` <
  500×320 ≤ `lg`) and a shape from the zone's aspect (`tile` under
  240×240, `strip` at ratio ≥ 2.6 and under 160px tall — one row of a square
  grid — `column` at ratio ≤ 0.62 and under 260px wide, else `box`). On a
  grid of short rows (a 1920×550 strip profile, ~156×42px cells) a wide zone
  of several rows is therefore a `box` and shows the widget, not the
  one-line summary. The standard `sizeTier` option (Density) forces the tier. The
  content callback receives the *inner* size (after padding and header) too,
  so a widget counts its rows from the room that exists.
- **Views.** Besides its normal layout a widget gives the shell a `compact`
  descriptor (a tile, strip or column summary, the **Summary card**) and a
  `studio` descriptor (the dense view). `summaryShape` (`core/layout.ts`)
  picks the card's form from `compact` (Small zones, read by `compactOf`):
  `auto` for a tile, strip or column zone, `full` never, `card` always (a box
  becomes a strip when wide, a column when tall, else a tile), `dense` the
  dense view. `CompactView` and `StudioView` (`core/views.tsx`) draw them.
- **The look.** The shell maps the standard look keys onto the zone
  (`core/look.ts`): `chromeVars`, the surface box with border, glow, opacity and
  blur (`lookBox`), text colors, font and weight (replacing the skin's), label
  case, padding and gap (overriding the tier padding), `stroke` (scaling ring
  and graph strokes), the background image with a scrim, the scoped custom CSS
  and the header icon and title. A zone past the widget's design size
  (`design`, default 500×320) zooms the content box with it (1–2.5×), Size %
  on top; the tier and shape are measured after the zoom.
- **Text colors.** The shell sets `--w-fg`, `--w-muted`, `--w-faint` and
  `--w-track` from the surface's tone (dark, light or theme), so text stays
  legible on matte-light and on a light theme. Widgets use these variables, not
  fixed greys; the fixed colors are `STATE` (ok, warn, crit).

### Skins and surfaces

A skin (`core/skins/<name>.ts`, 14 of them, registered in `SKIN_PACKS` in
`core/theme.ts`) is a bundle of tokens: surface, radius, accent, fonts (UI and
numerals), numeral weight and glow, graph and meter style, header style and ring
thickness, plus `numWide` (the numeral face's width against a normal sans, for
wide faces such as Orbitron, so fitted numbers still fit). `skinContext` merges it with the look into the `SkinCtx` that the
primitives (`Num`, `Bar`, `Spark`, `Ring`, `LedLadder`, …) read, so a widget
draws the same data in every skin. `resolveSurface` picks the surface:
the `surface` setting, else the skin's, else `glass`. The app's four
materials (`glass`, `matte-light`, `matte-dark`, `theme`) are registered in the
same table beside the skins' own, so a stored surface keeps its meaning.

Skin and surface overlap only in the card: the skin owns type, numerals,
graphs, meters, header and decorations and brings a card; the surface replaces
just the card. The `surface` setting offers `auto` (the skin's card; same as
unset), the four materials and the generic cards of `BASE_SURFACES`; panels and
plain cards keep the four. Picking a skin sets `surface: "auto"` (the skin
option's `applies`), so a skin shows whole until a surface is chosen again.
The other look keys that override a skin token when set: accent, font,
value weight, graph, meter, stroke. The card's corner is the look's `radius`,
else the screen's (`var(--radius)`, Theme › Shape & spacing › Corners at the screen scope, falling back to
the dashboard `radius`), like panels;
the skins' `radius` token no longer reaches the shell. Theme › Surface & effects
also sets the global `surfaceOpacity` and `blur` (Opacity and Blur), which let a page image or video show
through the cards. `smoothing` (Graph updates: Stepped / Smooth) sets `SkinCtx.smooth`; `Spark` then
draws line / area / step graphs through `SmoothGraph`, which scrolls them by time: each sample
sits at its arrival time and the right edge moves at real-time speed about two measured intervals
(`FeedClock`) behind the feed (`SmoothScroll`), drifting at most ±5 % to keep that lag, so readings
that arrive early, late or repeated never jump it back or stop it; the lag's interval is eased
twice (~4 s) and the window width's far slower (~30 s), because uneven feeds (2–3 s apart) move the
measured interval on every reading and a width that followed it would shift every point; the window keeps the full history's width (`HISTORY_LEN`) while a
history fills, so the graph fills in from the right instead of rescaling per sample; React writes
the path only on mount (the loop owns it after), so a new sample never flashes the static layout;
the auto range eases (`core/smoothing.ts`, after the widget
sampler, whose per-sample glide stalled on jitter). `Bar` / `Ring` glide linearly; reduced
motion keeps graphs stepped.

Throughput sensors (`libre.*_download_speed`, `_upload_speed`, `_read_rate`, `_write_rate`) are
**bytes per second**, although the source labels them "KB/s" (an Ethernet max of 107,450,768
would be 102 GB/s; as bytes it is 860 Mb/s, and only bytes match the adapter's
`network_utilization` of its link). `fmtRate` (`core/data.ts`) formats them with decimal prefixes,
`auto` or a fixed `RateUnit` (MB/s, Mb/s, KB/s, Kb/s, Mbps; Network Traffic's `rateUnit`), and `toMBps`
gives the number for widgets that print the unit apart.
`compact` (Small zones, with `dense` the dense view) is a layout mode
under Fit, not a style, and no theme sets it. In the studio, Theme › Start from lists
every skin beside the palettes and the user's saved Themes (`theme-start-from.tsx`), and the Surface & effects
card holds the surface and skin rows.
A skin's accent applies only when no accent is set and the surface is not
light. Skin fonts load lazily (`ensureSkinFonts`). Custom panels use the skin
through `components/widgets/panel-skin.tsx` when a skin is set; with `auto`
they render as before.

### Data adapter (`src/widgets/data-adapter.ts`)

Templates read `Record<string, string>`, the app has `SensorMap`
(`{ value, text, unit, name }` per key). `toFlat(map)` turns a reading into its
text, else the number plus its unit, and leaves out keys with neither. It
also leaves out a power, temperature or clock (W, °C, MHz) that has read 0
with min and max 0 (`neverReported`): the source has never read it (for
example no low-level CPU access), so widgets show "–" instead of a real-looking
0. `toNames(map)` carries the sensors' display names for auto-discovered rows. Both
are memoised per map identity. The data is the page's shared stream (the zone's
`useSensors`); the adapter never opens another connection. Image URLs go
through `resolveImageUrl`. Plugins whose containers are dynamic (files, device
serials) are looked up with `entryText` and `containers`
(`src/widgets/entries.ts`).

### QA harness

`?widget-qa` (a lazy chunk, `src/widgets/widget-qa/`, never linked) renders
every module at a set of spans through `placementContent` from fixture sensors
(`src/widgets/__fixtures__/`), in both variants, any skin and surface, and on a
light theme (`theme=paper`). `window.__qaOverflow()` reports, per zone, what
pokes out of it (`exceeds`), leaf text that overlaps (`overlaps`) and content
cut off by `overflow: hidden` (`clipped`); the geometry is pure
(`qa-geometry.ts`, unit-tested). Parameters, the screenshot recipe and the
probe are in [redesign/phase9/qa.md](redesign/phase9/qa.md). It is a
development tool only.

### Audio visualiser (`src/widgets/core/viz/`)

One engine draws every visualiser (NowPlaying through `MediaProgress`,
GameSpotlight's music card, the Visualizer widget); it replaces `MiniViz`, `BarVisualizer` and
`LiveWaveform` and their sources (`sensor-visual-source`, `bar-levels`, `history-playback`).

- `use-viz-input.ts`: per row, the live source in order capture (Web Audio, `useMediaVisualSource`,
  bands on the plugin's -80..0 dBFS scale) > the AudioMeter plugin's `spectrum` > its level > none.
  `input.ts` (pure) shapes the bands with `dynamics.ts` (back to dB, a treble tilt in dB/oct around
  1 kHz, floor..ceiling to 0..1, a slow auto-gain that never lifts silence), eases them by time and
  keeps a 50 ms level history for `scroll`. It runs in the frame loop's update phase while an engine
  reads it.
- `engine.ts`: a canvas painted in the paint phase, DPR-aware, asleep off-screen and while hidden;
  `palette.ts` resolves the Follow / Custom colours through a probe at most every 500 ms, so a theme
  or skin change repaints live; `draw.ts` has one drawing per style. Reduced motion jumps the easing
  and the peak caps. Nothing is synthesised: every pixel comes from the bands, the waveform or the
  level history.
- `?viz-gallery` (a lazy dev page, `viz-gallery.tsx`) draws every style under four skins and three
  Custom looks from a deterministic test signal.
- Capture: `getSharedAudioContext` starts suspended until a user gesture; `resumeOnGesture` resumes it
  on the first pointerdown / keydown / touchstart, and `useMediaVisualSource` reports `"blocked"`
  (with `GESTURE_HINT`) until then instead of waiting on `resume()`.
- In dev, `window.__vizInputs()` lists every live input (device, source, raw and shaped peak band,
  bands), for checking a test tone against the bands.

### The render pipeline of a canvas zone

A canvas zone (`module: "infopanel"`, `CANVAS_ID`) holds an imported
InfoPanel profile in `Placement.canvas`: the stored form
(`src/lib/infopanel/import/stored.ts`, `infopanel-canvas` v1), with
InfoPanel's own field names, unknown fields kept, and the import's
decisions per item under `$` (mode, Data API key; the studio-only fields
below). `placementContent`
subscribes the zone to the keys its items read (`canvas-keys.ts`, read
straight from the JSON) and lazy-loads `CanvasZone`
(`src/components/infopanel/`), so the InfoPanel renderer is its own chunk.
`openCanvas` (`src/lib/infopanel/canvas.ts`) checks the stored form
against the schema once per stored object; the zone draws the profile at
its own size, scaled to fit with its aspect kept: faithful items through
`ProfileView` (InfoPanel's draw order, untouched by the dashboard theme),
native items through the app's widgets (`native.tsx`). Assets load from
the asset store by SHA-256 (`/api/assets/<hash>.<ext>`), fonts from the
Data API's resolve endpoint when InfoPanel offers it, graph history from a
per-zone `KeyHistory` (InfoPanel's 4096 samples per key).

Only the page holds `Placement.canvas`. The server's config keeps a
`canvasRef` in its place (config v5), so it stays under its 5 MB cap and
its push to every kiosk stays small: each canvas is a file in
`DATA_DIR/canvases`, named by the SHA-256 of its bytes
(`src-tauri/crates/ips-server/src/canvases.rs`; POST `/api/canvases` from this machine,
GET `/api/canvases/<id>` from any). `src/lib/canvas-store.ts` swaps the
two at the edge: `fetchConfig` loads the refs (cached by ref), `pushConfig`
saves each new or edited canvas and then the config with its refs, on the
config's own debounced cadence. An edit is a new file and a new ref, so
the config event stream brings it to the kiosks. A config saved before the
store still holds its canvases inline; the studio's first push after it
loads moves them, files first, so a push that fails half-way leaves the
inline copy (retried next push; the file written is simply reused). A v4
build is then refused by the version guard. A config export carries the
canvases inline and an import is lifted on its first push; a canvas that
can't be loaded keeps its ref (logged; an import names the zones, an export
refuses to write a file without it), and `POST /api/config` answers 422 for
a ref with no file. The browser's own copy (`saveConfig`) keeps canvases
inline, falling back to refs only when that is over the storage quota. A
studio on another machine, whose canvas writes are refused (asked once per
session), keeps the refs it has and inlines only canvases never stored. Files the
stored config no longer references (an earlier edit, a deleted zone) are
swept at server start and after config saves, at most every 10 minutes and
only once an hour old, so a canvas saved just before its config is never
caught in between; a config that does not parse sweeps nothing. A studio
sends a canvas again (renewing its file) when its ref is over 10 minutes
old or was loaded rather than sent, so undo never points at a swept file.

### Importing and exporting an InfoPanel profile

Import (top bar Import, the "⋯" menu, or the Add panel's "Canvas zone ·
Import .infopanel" card) is a five-step dialog,
`src/components/infopanel/import/`, loaded on first open so neither the
kiosk nor the studio's first paint carries the parser. Nothing reaches the
config until the last step:

- **Source** (`src/lib/infopanel/import/session.ts`): an `.infopanel` or a
  saved `.canvas.zip` (told apart by `canvas.json`), an extracted folder
  (entries relative to the folder holding `Profile.xml`), a profile
  installed in InfoPanel (`/api/infopanel/installed`), or a canvas from My
  library (`openStored`, every file read back from the asset store and
  checked against its SHA-256). As soon as a source opens, its files upload
  to the asset store in the background, two at a time (the server's
  `MAX_IN_FLIGHT`; `uploadBytes` asks again after a 429). Continue waits
  for the upload; a refused file is listed and its items draw without it.
- **Mode**: Faithful, Native where possible, or Both (starts native);
  `withMode` (`native/modes.ts`) sets the flag on every item that converts.
- **Review**: `buildReport` (`import/report.ts`) as tiles and rows.
- **Sensors**: `RemapPanel` (`src/components/infopanel/remap-panel.tsx`)
  over the studio's sensor catalog (`useSensorCatalog`). Continue waits
  while a group is unresolved; with the Data API unreachable the import goes
  on and the groups stay unresolved.
- **Save**: `buildCanvas` writes the stored form (the remapped keys, the
  store's extension where it differs, e.g. a WebM video), and
  `src/components/studio/import-actions.ts` lands it in one `setConfig` (one
  undo step): a new profile the InfoPanel size (2 × 1 cells, fill, the zone
  spanning both), or a canvas zone in the free box of the current page that
  draws it largest. "Also save … to the Library" posts it to
  `/api/library` as a `canvas` item whose files are the uploaded asset ids.

Export (`src/components/infopanel/export-dialog.tsx`, helpers in
`src/lib/infopanel/export/studio-export.ts`) writes the selected canvas
zone, else the page's first: the stored form as `<name>.canvas.zip` (with
the supplied fonts the canvas still draws with, after the licence review),
or an `.infopanel` for InfoPanel, which carries no fonts. Baking stale
vector gauges first uploads the new frames and puts them on the zone as one
undo step. Both download through the browser.

### The Library page

The rail's Library opens a full page (`src/components/library/`, lazy-loaded, studio mode
`library`) in place of the canvas, drawer and inspector; the studio's zone shortcuts are held back
while it is open.

- **My library** (`use-my-library.ts`): the server's items (`/api/library`, `src/lib/library.ts`)
  plus the config's saved panels and style presets shown as items (ids `cfg-panel:` / `cfg-style:`,
  read-only stand-ins). Uploads run two at a time behind the tray: each file is classified from
  its bytes (`src/lib/my-library/intake.ts`: refuses a bad font, an SVG over 256 KB or with
  scripts), read in the browser (`decode.ts`: size, video length, a 64 px pixel sample for the
  stats and the perceptual hash, a font's faces and licence), uploaded to the asset store and
  saved as an item; identical bytes keep the existing item. An `.infopanel` opens the Import dialog.
- **Model** (`src/lib/my-library/model.ts`, pure): the auto tags, the sidebar collections (an item
  can sit in several), search (every word must match name, kind, type, pixel size or a tag),
  duplicates (identical SHA-256, or the same size and a dHash within 4 bits), the cleanup counts and
  the sort orders. `theme-suggest.ts` ranks backgrounds for the profile's theme (text contrast at
  the median luminance ≥ 4.5:1, then hue closeness to the accent, then low detail) with a reason.
- **Actions** (`library-actions.ts`): Set as background, Add to profile / canvas (a saved panel, or
  an image as a panel zone with one image widget), Apply to selection (a style), Open canvas and
  Re-import (the Import dialog with the saved canvas), Export (the Export dialog on the stored
  form), Duplicate as variant, Optimise (WebP, kept only when 5 % smaller), Merge duplicates. Each
  placement is one `setConfig` and counts a copy on the item (`copies`; "jump to" selects it).
- **Profile assets** (`profile-assets.tsx`, `profile-assets/`, logic in
  `src/lib/infopanel/assets/stored-doc.ts`): a canvas zone's files as the lab's table, with the
  findings, Add files, Replace by name, Optimise and Clean up, each one `withCanvas` change.
- **Fonts** (`fonts-view.tsx`, `fonts/`): the requests of the page's canvas zones, My fonts, Add
  fonts and Get a font (Fontsource, Font Squirrel through `/api/font-proxy`).
- **Drag** (spec §8, `src/lib/my-library/drag.ts`): a card carries `{ libraryItemId, kind }` under
  `application/x-infopanel-library`. Dragged over "Drag here to place it on the canvas", the page
  makes way and the drag goes on to the canvas, which sizes its ghost from the card being dragged
  (`library-drop.ts`): an image or panel becomes a zone at the ghost, a style applies to the zone
  under the pointer, a video becomes the background. Over an imported canvas zone (found by
  `CanvasZone`'s `data-ip-canvas` mark, `canvasPointAt`) or in the canvas editor, an image, SVG or
  video becomes an InfoPanel Image item at the pointer (`withDroppedImage`); on Page background it
  sets the background. The inspector keeps its hand-opened sections while the Library page
  replaces it, so the drag can reach that slot.

### The Gauges page

The rail's Gauges item opens a full page (`src/components/gauges/`, lazy-loaded, spec §6). The model is
`src/lib/gauge-studio/`: a gauge lives in one of four places (`GaugeSource`): a preset (read-only;
customising makes a copy), a My library item (`kind: "gauge"`, `data` = `{ vector?, frames?, min, max,
animationSpeed }`, frames by asset id), a Gauge item in an imported canvas zone (its spec in the item's `$.vector`,
its frames the item's Images), or a **Custom gauge** widget zone (`src/widgets/CustomGauge.tsx`, the spec as a JSON
string in its hidden `gauge` setting, bound to any one sensor).

- **Browse:** Presets, In <profile> (`profileGauges`), My library; a right pane with a live preview, Customise a copy
  / Edit, Add to canvas (`addGaugeZone`), Duplicate, Export (`.gauge.json`, the lab's `VectorGauge`).
- **Editor:** a preset strip, the parts list (Core · Indicator · Scale · Text · Decor · Effects · Liquid; parts that
  don't apply to the shape are hidden), a stage with play and a scrubber, and an inspector for the selected part.
  A profile gauge writes through (`withGauge`, one `setConfig` per committed change, slider drags coalesced by key,
  studio undo). Anything else is a working copy with its own undo (`working-copy.ts`), kept while the page is closed
  (`session.ts`); back with unsaved changes asks Save to library / Discard / Cancel.
- **Image sequences:** a filmstrip with Reverse, Resample, Duplicate, Replace and Remove, frames per second, Recolour
  (previewed with a CSS filter, applied to every frame at once) and Convert to vector (a preset closest in shape,
  scaled to the frame size; the frames stay). A canvas gauge's frame edits go through the zone's asset `Doc`
  (`profile-doc-io.ts`, shared with Profile assets), so each is one undo step.
- **Bake bar:** a canvas gauge with a spec shows whether its frames match it (`$.vectorBaked`) and bakes them for the
  `.infopanel` export; the dashboard always draws the spec live.
- "Edit gauge…" in a Custom gauge zone's inspector, on a canvas Gauge item and on a library card opens the editor
  (`openGauge` in `studio-view.tsx`). Uploads run at most two at once (`uploadBytes`), the server's limit.

### Narrow screens and edge states (A8)

Below 900 px (`NARROW_PAGE_WIDTH`, `useViewportBelow`) the Library and Gauges detail panes open as a bottom sheet
(`pane-sheet.tsx`, over the shared `BottomSheet`) and the gauge editor stacks parts, stage and inspector. The canvas
editor's inspector follows the studio inspector's modes (`inspectorMode`): docked from 1100 px, a floating card from
640 px, a sheet below. A push the server never answered (`isUnreachable` in `dashboard-server.ts`, not a refusal)
shows "Offline · edits kept locally" in the top bar until the next push lands. A canvas image whose file can't load
draws a hatched tile with a broken-image icon (`MissingImage.tsx`); with the Data API unreachable the canvas editor's
Live sensor source is disabled. The rest of spec §10 is listed in `docs/redesign/FEATURE_MAP.md` §20.

### Editing a canvas zone: Edit

There is one editor view, Edit (rail item `design`). On a grid screen it shows the grid; on a screen whose page is
one free canvas zone (`freeCanvasOf` in `lib/screens/list.ts`) it hosts the canvas editor
(`src/components/infopanel/edit/canvas-editor.tsx`, lazy-loaded) in the same studio shell: the rail, the left panel
frame (`LeftPanelFrame`, Layers and Add tabs), the page tabs and the inspector column. Double-clicking a canvas zone
on a grid, or the canvas zone inspector's "Edit items", opens the editor on that zone; there Done or Esc (with
nothing selected) goes back to the grid with the zone selected. Both edit the config through the studio's one
history, so one Ctrl+Z undoes grid and canvas edits in order. The Library covers the editor without unmounting it,
so a Library drag can land in it. InfoPanel profiles are listed in Screens (All, Studio, InfoPanel filter;
`lib/screens/list.ts`); the old `infopanel` view is a route alias in `use-studio-ui.ts` that opens Screens on the
InfoPanel filter, or Edit on a named profile.

The Export check (`lib/infopanel/export-check.ts`) classifies each item and, on a screen with widgets, each widget,
as exports as is, approximated, becomes a picture or left out, and names the studio-only looks it loses. The editor
shows it on a screen made for InfoPanel (`madeForInfoPanel`): the toolbar pill, the check panel in the inspector
column (`export-check-panel.tsx`), marks in Layers, on the canvas and on inspector fields. The Export window reads
the same check, so the two can't disagree.

- **Document model**: the page edits one canvas zone's stored form (`Placement.canvas`), the single source of
  truth for that document; the zone is on the screen and page Design shows, so `withCanvas` writes it back. A
  Library canvas item is a saved copy and is never edited in place: Edit canvas opens the first zone made from it
  (`findCanvasUse`, by source name and import time), else places it as a new screen and opens that zone.
- **New profile** (`templates/new-page.tsx` on the profile kind, `newStored` in `import/stored.ts`): a stored form
  from scratch (InfoPanel's `PROFILE` defaults, a #FF0A0A0C background, white Segoe UI text, `source.origin:
  "new"`), placed by `importAsProfile` as a new screen and opened on the page. `openNewInfoPanel` (`file-doors.ts`)
  opens the page over Screens from the Add panel, the Import door, the Library and the command palette.
  New screen and New InfoPanel profile are one page (`templates/new-page.tsx`, the shell in
  `templates/new-wizard.tsx`), held by `studio-view.tsx` over Screens for either kind, so the kind switch doesn't
  remount it. The page and its gallery (`wizard-gallery.tsx`,
  `gallery-sections.ts`) carry no catalog: each kind's templates, thumbnails, preview, sensor fit and making come
  in a chunk of their own (`templates/wizard-kit.ts` loads `screen-kit.tsx` or `infopanel/profile-kit.tsx`), and
  the gallery is a skeleton until it arrives. The size rule is `templates/use-size-choice.ts`: the selection's
  size (the size its card was drawn at, else its own) until the size is set there. Recently used is
  `templates/recent-templates.ts` (`studio.newWizard.recent.{screen|ip}`).
- **Add palette** (`add-palette.tsx`, `editor/create.ts`): the 14 kinds with InfoPanel's creation defaults
  (`newItem`), styled from the profile (`editor/look.ts`: text in the profile's Color; Bar, Graph and Donut on a
  track 14 % from the background toward the text colour, filled with `ACCENT` #FF3B82F6, no frame; a Gauge as a
  vector ring in the same accent, baked to frames on export; a Shape as a 12 px rounded card 7 % off the
  background, no frame or gradient). All are ordinary InfoPanel fields, so the export is unchanged. Inserted by
  `AddDisplayItem`'s rules (`insertItem`), centred on a click or on the drop point of a drag onto the canvas
  (`placed`, snapped as a move). Sensor kinds then open the sensor picker; Image and Sensor image first take a
  My library file (`withNewFileItem`, as a Library drop).
- **Native bindings** (`editor/bind.ts`, `bindingFromRef` in `sensors.ts`): a chosen sensor's Data API `ref`
  becomes SensorType and its id fields, plus SensorName, so the `.infopanel` export reads it. The sensor picker
  (`sensor-picker.tsx`) does this, and so does a Remap choice, in the editor (`withGroupKeys`) and at import
  (`rebindChosen` in `buildCanvas`). A sensor with no ref binds the preview only. A bound Table takes its plugin's
  `TableFormat` from the Data API's `table.format` (the fork's `IPluginTable.DefaultFormat`), else keeps the default.
- **Remap reset** (`withRemap` in `canvas-edit.ts`): the first choice that rewrites an imported item's binding keeps
  the binding as imported under `$.original` (studio-only; `readStored` checks it against the kind's schema).
  Reset to automatic puts it back, then the group resolves as usual. Older stored forms have no original and
  resolve from the binding they have.
- **Profile settings** (`profile-settings.tsx`): the inspector with nothing selected; every field InfoPanel's
  export carries, checked by `checkValue` over `PROFILE`, committed with the items unchanged.
- **Studio elements** (`src/lib/infopanel/elements/`): Ring, LED bar, Card, Glow, Divider, Icon, Cores and Sparkline.
  Each is an ordinary InfoPanel item carrying a spec in the studio-only `$.element` (`spec.ts`, checked by
  `normalizeElement` in `readStored`, and only on the kinds it can be). `applyElement` (`apply.ts`) derives the
  item's InfoPanel fields from the spec and the item's box, and the editor runs it over the tree on every commit
  (`syncElements`), so a resize, a moved group or a spec edit lands as one step:
  - Ring and LED bar are Gauges whose `$.vector` is derived (`ringVector`, `ledVector`; the vector spec gained an
    optional end `dot`). They bake to frames like any vector gauge (`$.vectorBaked`).
  - Card and Divider are a Shape while one colour, a stroke and corners say it all (Native), else an Image (Baked).
    A baked card's image is grown by its shadow and glow; the margin is kept as `pad` in the spec.
  - Glow and Icon are Images (Baked). The icons are a curated lucide set, generated as markup
    (`icons.generated.ts`, `tools/gen-element-icons.mjs`), loaded as their own chunk on first use (`icons.ts`):
    a kiosk with no Icon element never fetches them.
  - Cores is a Group of Bars, each bound natively to a per-core load sensor (`cores.ts` reads Libre refs
    `/<cpu>/<n>/load/<i>` named "Core #n"), laid out from the group's X and Y (`coresLayout`).
  - Sparkline is a Graph (Native, or Approximated when its end dot or gradient fill is on).

  Static elements are drawn live from the spec (`svg.ts`, the `element` scene node, `ElementSvg`), in both draw
  modes and on the kiosk. **Baking runs on export**, as for vector gauges: the Export dialog bakes every stale
  vector gauge to frames and every stale static element to one PNG (`elements/raster.ts`), content-addressed by
  SHA-256 in the canvas's assets, and records what it baked (`$.elementBaked`: spec and size); the old files
  become unused and the export's unused-files cleanup leaves them out. `badgeOf` gives each element's export
  badge (Native, Baked or Approximated, with a reason and what is lost), shown on Layers rows, in the inspector
  header and, for approximations, in the Export dialog.
- **Palette** (`elements/palette.ts`): the stored form's studio-only `palette` (accent 1–3, text, sub-text, track,
  card, warn, crit; without one, `defaultPalette` from the profile, accent 1 being the styled defaults' accent).
  An element's colours are inks (`{ color, slot? }`) and a styled native field records its slot in `$.slots`
  (`{ Field: { slot, alpha? } }`), so the colour InfoPanel exports is always a plain field. `recolour` carries a
  slot change into every ink and slot field, then re-derives the elements, which marks the baked ones stale.

- **State** (`use-canvas-editor.ts`): the zone's stored form opened
  (`openCanvas`) and its items as edited (`editItems`,
  `src/lib/infopanel/canvas-edit.ts`). Each bound item carries its import
  record (Data API key, how it was found) on the item under `$import` while
  edited, so duplicate, group and reorder keep it. Every commit writes the
  zone's new stored form (`storeItems`, through `withCanvas`) with one
  `setConfig`, so the studio's undo, redo and auto-save cover it: one drag,
  one field, one bulk action (Draw all as, a remap choice) is one step;
  typing in a field and arrow nudges coalesce by key.
- **Canvas** (`edit-canvas.tsx`, `edit-layer.tsx`): `ProfileView` and
  `nativeLayer` as the zone draws, with the edit layer over it. The layer
  finds items through the drawn `data-path` attributes, previews a drag and
  commits once. A click picks the topmost item the mouse takes
  (`editor/arrange.ts` `hitTest`: locked and hidden items let it through, a
  full-canvas background wins only alone). A move or resize snaps within 4
  screen pixels to the canvas's and the other items' edges and centres
  (`editor/snap.ts`), drawing the guides; Alt turns it off, Shift keeps a
  move on one axis and a resize in proportion. The selection shows its size.
  Several selected items get the multi inspector (`multi-inspector.tsx`):
  align, distribute and their shared fields, one step each. Show modes tints
  each item (native, InfoPanel, can't convert); Compare lays a chosen
  InfoPanel screenshot over the render with a difference blend.
- **Live on the screen**: no separate path. Every commit is a config change,
  which the studio pushes to the server 400 ms later (`pushConfig` in
  `App.tsx`, as any edit); the server's config stream tells each kiosk and
  desktop panel, which pulls the config and redraws the zone. A drag's
  preview is not pushed; its commit on release is.
- **Sensors**: Unbound, Live or Mock (`sensorView`). Live subscribes to
  the items' keys through `useSensors`; Mock gives each binding group one
  slider value. Remap (`src/components/infopanel/remap-dialog.tsx`) wraps
  the import's `RemapPanel`; `withGroupKeys` rewrites only the groups whose
  choice changed, and with the Data API offline it takes no choices.
- **Inspector** (`item-inspector.tsx`): `InspectorView` with the
  `infopanel` context of `inspector-model.ts`. The kind's field groups come
  from the InfoPanel schema registry (`inspector/infopanel-defs.ts`, no
  panel per kind); Draw as, Position (with `checkGeometry`'s refusals),
  Sensor and the unknown fields are its special sections. A value
  InfoPanel's setter would refuse is shown with its message and not stored.
- **Keys** (`canvas-keys.ts`, capture phase; the cheat sheet's "InfoPanel
  editor" group): Ctrl+D, Ctrl+G, Ctrl+Shift+G, Del, arrows (Shift: 10 px),
  Esc. Nudges never snap. The studio's other zone
  shortcuts are held back while the editor is open; undo, redo, save, the
  palette and the cheat sheet pass through. Nothing fires while typing or
  with a dialog open.

### The render pipeline of a panel zone

A custom panel (`module: "panel"`) carries its own widget tree in
`Placement.panel`; there is no module `render`. The model is
`src/lib/panel-model.ts`: `PanelDef` (the arrangement - `layout` stack /
grid / overlay, `direction`, `wrap`, `justify`, `align`, `gap`, `padding`,
`columns` / `gridCols` / `gridRows`, `overlayAlign`, `scrim`,
`bottomGridCols`, `fit` fill / hug, `css` - and the ordered `widgets`),
`Widget` (one bindable item of a `WidgetKind`, with a `box` for its size
and placement), the pure list edits the studio uses (`moveWidget`,
`insertAfter`, `duplicateWidget`, `convertKind`, `withLayout`) and the Code
view's guard (`parsePanelJson`).

```
Placement.panel + Placement.settings
  → panelOwnSettings(placement)                  own settings; legacy title as the label fallback
  → resolveWith(appearance, …, follow, panelLegacyLook(placement))
                                                 legacy accent / background as the lowest layer
  → <PanelView enforced>                         src/components/widgets/PanelView.tsx; Colors locked:
                                                 enforcedPanel drops the widgets' own colors
       → chromeOf(cfg) → <ModernChrome>          no design size: Size %, --wp-* variables,
                                                  custom CSS + panel.css, background image
            → div                                 places a hugging panel (fit: "hug") by the zone's alignment
                 → .wp-panel                      panelCardStyle (surface box, padding, radius),
                                                  panelVars (--panel-*); the tokens are re-scoped
                                                  on the ModernChrome root
                      → <PanelStack>              stack or grid: panelLayoutStyle, widgetBoxStyle per cell
                      → <PanelOverlay>            overlay: background image, scrim, three bands
                           → <WidgetCell>         .wp-widget.wp-widget--{kind}, data-widget-*, scoped
                                                  widget CSS, studio selection outline
                                → <WidgetView>    the kind's renderer (studio: "pick a sensor" when unbound)
```

`src/components/widgets/panel-layout.ts` turns a `PanelDef` into CSS. The
panel's own fields become `--panel-*` variables on `.wp-panel`
(`panelVars`); the stack / grid container and the cells read them as
`var(--panel-gap, <Spacing & shape --wp-gap>, <built-in px>)`, so a panel that sets
nothing keeps the old literal spacing, and panel CSS can set the variables
too. `widgetBoxStyle` maps a widget's `box` (hug / fill / px per axis,
`self`, grid `col` / `row`) and its `span` / `rowSpan` to flex or grid item
styles. The CSS hook tree is in the [customization
guide](customization-guide.md#styling-panels-with-css).

`placementPrefixes` subscribes a panel zone to the sensor keys of its
visible widgets, and a panel "has data" (renders in the kiosk) when at
least one widget is visible.

## 3. Config

### Types (`src/lib/layout.ts`)

- `DashboardConfig` - `version: 12` (`CONFIG_VERSION`; the steps are listed above it in `layout.ts`), `activeProfile` (a profile id or `"auto"`),
  `profiles`, `theme`, `radius`, `dataApiUrl?`, `stylePresets?`,
  `panelPresets?`, `sourcePrefs?`, `background?` (the page background),
  `style?` (the dashboard style, every profile), `styleEnforce?`
  (force the global style on every widget), `appearancePresets?` (the
  user's saved appearance presets) and `general?` (see below).
- `MonitorProfile` - `id`, `name`, design `width`/`height`, `cols`, `rows`,
  `fit` (`"scroll"` with fixed `SCROLL_ROW_H` = 120 px rows, or `"fill"` to
  fill the viewport; the studio fits its zoom to the design size in both modes
  (`pageSize`, `use-studio-layout.ts`) and marks where a scroll page's screen ends
  with `ScreenFold`), `pages` (at least one `ProfilePage`: `id`, `name`,
  `icon?`, `placements`), `rotate?` (`PageRotate`, auto-rotate), optional `style` (profile style, over
  the dashboard's), `styleEnforce` (overrides the dashboard's when set),
  `background` (replaces the dashboard's; `{ type: "none" }` turns it off
  for the profile), `theme` (a partial `ThemeTokens` over the dashboard's
  theme) and `radius` (rem), `gap` and `padding` (px, see `profile-grid.ts`)
  and `sampleVersion` (set on the profiles earlier versions shipped; kept, no
  longer read).
- `ProfileView` - one page of a profile as the studio and kiosk edit and draw it:
  the profile minus `pages`, plus that page's `placements` and `pageId`.
  `src/lib/pages.ts` converts (`profileWithPage`, `applyView`, `onPage`) and
  holds the whole-profile walkers (`allPlacements`, `mapPlacements`) and the
  page operations.
- `Placement` - `module` (a registry id, `cards`, `blank` or `panel`), the zone
  box (`colStart`, `rowStart`, `colSpan`, `rowSpan`), `visible`, `settings`,
  `design`, `panel`, `follow?` (per-section follow flags, see [Style
  resolution](#style-resolution-srclibtheme-modelts-srclibstyle-resolvets)).
  A profile has `widgetTheme?` (the widget theme: `values` and `locks`), a
  page has `widgetTheme?` (`values` and `follow`).
- `StylePreset` - `{ id, name, settings }`, a named set of look-only keys.
- `GeneralSettings` (`src/lib/general.ts`) - `font?` (`system`, `sans`,
  `rounded`, `serif`, `mono`), `hour12?` (unset = the locale's choice),
  `showSeconds?`, `locale?` (a BCP 47 tag, `""` = the system's), `motion?`
  (`system`, `reduce`, `full`), `hideCursor?` and `kioskPageNav?` (kiosk page dots and swipe). Stored sparse;
  `resolveGeneral` fills `GENERAL_DEFAULTS`.
- `PageBackground` (`src/lib/appearance.ts`) - `type` (`none`, `color`,
  `gradient`, `image`, `video`), `color` (the color, or the fill behind an
  image), `gradient` `{ from, to, angle }`, `src`, `fit` (`cover`,
  `contain`, `stretch`, `center`, `tile`), `position` `{ x, y }` (each
  `start` / `center` / `end`), `dim` and `tintOpacity` (0-100), `tint`,
  `blur` (px); for video also `poster` (an image URL), `loop` and `muted`
  (both default on) and `rate` (0.25-4, default 1).
  Stored sparse: unset fields use `BACKGROUND_DEFAULTS` when drawn.
- `UserPanelPreset` (`src/lib/panel-model.ts`) - a panel the user saved
  (Add > My panels): `{ id, name, panel, settings?, colSpan?, rowSpan? }`,
  where `settings` is the panel's look (its `PANEL_SETTINGS` keys). The
  built-in presets and the sensor-free layout starters are code
  (`src/lib/panelPresets.ts`, `src/lib/panel-starters.ts`);
  `allPanelPresets(config.panelPresets)` / `findPanelPreset` list and find
  all three, and `userPanelPreset` adapts a saved one (every use clones its
  panel with fresh ids). Saving, renaming and deleting are the pure config
  edits in `src/components/studio/panel-preset-actions.ts`.
- `AppearancePreset` (`src/lib/appearance-presets.ts`) - a whole look:
  `{ id, name, description, theme, radius, style, background? }`, where
  `theme` is a `ThemeTokens` object or a theme preset name (`"paper"`, …),
  `radius` the theme radius in rem, `style` look keys only
  (`PROFILE_STYLE_KEYS`) and `background` a complete `PageBackground`. The
  presets are the user's saved looks, in `config.appearancePresets` (the
  former built-ins are gone, replaced by the skin gallery; the `builtin:`
  id prefix stays reserved, `isBuiltinPreset`). Not to be confused with
  `StylePreset`, which restyles one widget.

### Appearance presets (`src/lib/appearance-preset-apply.ts`)

`applyAppearancePreset(config, preset, scope, { includeBackground })` is
pure config → config, and the studio sets its result in one `setConfig`
call without a coalescing key, so one undo step reverts a whole preset:

- scope `{ kind: "all" }` writes `theme` (the preset's tokens), `radius`
  and `style` (replaced wholesale);
- scope `{ kind: "profile" }` writes the profile's `theme` (the preset's
  full tokens), `radius` and `style`; the dashboard and the other profiles
  are untouched. Look keys the dashboard style sets but the preset doesn't
  are written as their setting defaults, so the profile shows the preset
  rather than a blend;
- the preset's `background` goes to the same scope when `includeBackground`
  is true or, when it is unset, only if the scope has none yet (unset, an
  empty media background, or the dashboard's `"none"`; a profile's `"none"`
  is a choice and stays). A preset without a background never clears one;
- placements (and with them all content keys) are never touched.

`countOverrides(config, scope)` counts the widgets whose own look keys show
over the theme (a section not following, not locked); `countProfileOverrides`
counts, for "all", profiles with their own look (style, theme or radius).
`clearOverrides` sets those widgets' sections to follow (their values
stay) and, for "all", drops the profiles' styles, themes and radii.
`presetFromCurrent` captures the resolved theme of the scope (a profile's
own colours over the dashboard's). `saveAppearancePreset`, `renameAppearancePreset` and
`deleteAppearancePreset` manage the user's list. The studio wires them through `useAppearancePresets`
(`src/components/studio/use-appearance-presets.ts`); the palette's
**Apply theme: …** commands apply to All screens.

`isValidStyleValue` / `invalidStyleKeys` check look values against the
options of `PROFILE_STYLE_SETTINGS` (select options, number bounds, CSS
colours); the tests run every built-in through it.

### Loading and migration

`mergeConfig` merges a stored or partial config over the defaults and is used
for both the local copy and the server copy:

- rewrites legacy asset URLs (`http://127.0.0.1:3921/assets/…`) and bindings
  to the retired DataBridge forecast keys to the yr plugin's forecast key;
- fills explicit zone boxes and row counts on old auto-flow profiles and
  clamps every zone into its grid;
- v2 to v3: a profile with `placements` and no `pages` gets
  `pages: [{ id: "main", name: "Main", placements }]` (none of either: one
  empty Main page); stored pages get unique ids and names, and `rotate` is
  clamped (`normalizeRotate`). The output has no `placements` key;
- v3 to v4 (`src/lib/legacy-zones.ts`): every zone with a retired legacy
  module id (`systemmodern`, `spotifymodern`, `textfile`, … `LEGACY_MODULE_IDS`)
  becomes a zone of the template that rendered it, its settings rewritten so
  it renders the same: stored keys the template reads carry over, the old
  widget's defaults are written where the template's differ, its own keys
  are turned into the template's, the rest is dropped. The plain cards
  (`vbz`, `notifications`, `textfile`, `streamdeck`) get `surface: "theme"`
  unless the dashboard or the zone's profile style picks a surface. Unknown
  ids pass through. The server refuses a save from an older version
  (`src-tauri/crates/ips-server/src/config_guard.rs`), so a v3 build cannot write back over v4;
- no shipped profile is added: a fresh install (`defaultConfig`) has one
  blank profile, `main`. Stored copies of the formerly shipped Sample and
  ARCv2 profiles stay as they are;
- falls back to `activeProfile: "auto"` when the pinned id no longer exists;
- merges `theme` over the default theme, and keeps `dataApiUrl` only when it
  is a valid http(s) URL;
- migrates every panel placement (`normalizePanelPlacement`): the panel is
  normalized (`normalizePanel`: the legacy `"wrap"` or a missing layout
  becomes a wrapping row stack, full-row kinds get `box.w: "fill"`;
  idempotent) and the legacy `title` / `titleVisible` are copied into the
  placement's settings as `label`. The legacy `accent` / `background`
  stay render-time fallbacks below the global style (`panelLegacyLook`);
  panels migrated by older builds keep the `accent` / `surface` copies
  they hold until they follow the global style (the PanelDef fields stay
  for older builds);
- keeps `style` when it is an object and `styleEnforce` when it is a
  boolean;
- keeps `general` through `normalizeGeneral` (known fonts and motion
  values, booleans, and a locale only when
  `Intl.DateTimeFormat.supportedLocalesOf` accepts it), and per profile a
  `theme` of token strings (`normalizeThemePatch`), a finite `radius`, and
  `gap` / `padding` rounded and clamped to 0-200 px (`normalizeSpacing`);
- keeps the dashboard's and each profile's `background` only when
  `normalizeBackground` accepts it (an object with a known `type`); invalid
  fields are dropped, numbers clamped, and a `src` must be http(s), a path or
  a `data:` image or video;
- keeps only usable saved panels (`normalizePanelPresets`, a hand-written
  guard: id, name, a panel with a widget list, object settings, whole-number
  spans) and normalizes their panels;
- keeps only usable appearance presets (`normalizeAppearancePresets`, a
  hand-written guard: a non-empty id that isn't `builtin:*`, a name, a
  known theme preset name or a token object (merged over the default
  theme, unknown tokens dropped); look values that aren't valid options are
  dropped, `radius` is clamped to 0-2 and `background` goes through
  `normalizeBackground`).

A panel added in the studio (`addPresetPlacement` / `assignPreset` in
`studio-actions.ts`) goes through the same `normalizePanelPlacement`, so it
has the current shape straight away; a saved panel brings its own settings.

### Where it is stored

| Copy | Location | Written by |
|---|---|---|
| Browser | `localStorage` key `infopanel-dashboard:config:v1` | every page, on each config change (`saveConfig`) |
| Server | `config.json` in the dashboard server's data directory | `POST /api/config` |

`ips-server` writes the file as `<data dir>\config.json`, where the data
directory is `%LOCALAPPDATA%\InfoPanel\Dashboard`. If `LOCALAPPDATA` is not
set it uses `$HOME/.local/share/InfoPanel/Dashboard` (`./.local/share/…` when
`HOME` is unset too). It writes a temp file and renames it. A body must be a
JSON object and at most 5 MB, otherwise the server answers 400 or 413.
`GET /api/config` answers 404 until a config has been saved.
`DASHBOARD_DATA_DIR` replaces that directory and `DASHBOARD_DIST` the folder
served (default `dist/` in the working directory).

Two small routes beside the config: `GET /api/health` answers
`{ app: "infopanel-dashboard", version, configVersion }` (`version` is
`package.json`'s, "0.0.0" when that file is missing), so a client can tell this
server from another one on the port. With `DASHBOARD_DEBUG=1` the server logs
each request (method, path, status, ms) and every SSE connect and disconnect
per channel (`config`, `control`, `extras`) with the current count, and
`GET /api/debug/stats` (404 otherwise, 403 from other machines;
`src-tauri/crates/ips-server/src/debug.rs`) returns the memory use, uptime, SSE clients per channel,
active resources by type and the event-loop delay (p50, p99, max in ms).

### Uploaded media (`src-tauri/crates/ips-server/src/assets.rs`, `src/lib/assets.ts`)

Images and videos uploaded in the studio are stored by the dashboard server
in `<data dir>\assets`, next to `config.json` (created on the first upload).
A file is named by its content, `<sha256 hex>.<ext>`, so the same file
uploaded twice is stored once and an asset URL never changes meaning. The
config refers to an asset by its same-origin URL, `/api/assets/<id>`, in the
same fields that take any other URL (`background.src` / `poster`, a widget's
`background` setting). The kiosk loads it from the server like the page
itself, so InfoPanel's WebView2, which has its own browser storage, shows the
same files as the studio.

| Route | Answer |
|---|---|
| `POST /api/assets` | Raw file body with its `Content-Type`. `200 { id, url, type, size }` (also for a file already stored); 403, 413, 415, 400 for an empty or aborted body |
| `GET /api/assets` | `[{ id, url, type, kind, size, mtime }]`, newest first |
| `GET /api/assets?unused=1` | The same, minus every file whose hash the saved `config.json` or a library item mentions (in an asset URL, an asset id, or bare: a canvas zone names its assets by hash) |
| `GET` / `HEAD /api/assets/<id>` | The file: its sniffed type, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Accept-Ranges: bytes`; a `Range: bytes=…` header gets 206 with `Content-Range`, or 416 past the end |
| `DELETE /api/assets/<id>` | 204, or 404 when it is not there |

Rules the server enforces:

- **Type by content.** The first bytes decide the type (`sniffType`): PNG,
  JPEG, GIF, WebP, AVIF, BMP, ICO, MP4 (ISO-BMFF video brands), WebM, and
  the fonts TTF, OTF, TTC, WOFF and WOFF2 (for imported InfoPanel profiles
  and the library). Any Matroska EBML header counts as WebM (DocType `webm`
  or `matroska`: tools write the latter into `.webm` files, and Chromium
  plays both), and `video/x-matroska` is declared WebM. SVG is text: it is
  taken when its first element is `<svg>` (after an XML prologue, comments
  and a doctype, `isSvgText`), and always served with
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
  img-src data:; sandbox`, so opened on its own it runs nothing. HTML,
  HEIC, QuickTime and anything else are refused (415), and the declared
  `Content-Type` must name the same type.
- **Size.** Images up to 25 MB, SVG up to 256 KB, videos up to 300 MB, fonts
  up to 30 MB (413). A `Content-Length`
  over the limit is refused before reading; otherwise the body is streamed to
  a temp file while it is hashed (never held in memory) and the upload stops
  at the limit. The temp file is deleted on any refusal and renamed to the id
  on success; temp files left by a restart are removed when the server
  starts.
- **Paths.** A file path is only built from an id matching
  `^[a-f0-9]{64}\.(png|jpg|gif|webp|avif|bmp|ico|svg|mp4|webm|ttf|otf|ttc|woff|woff2)$`; anything else under
  `/api/assets/` is 404. There is no directory listing other than the JSON
  list.
- **Writes.** `POST` and `DELETE` need the header `X-Dashboard-Asset: 1`
  (403 without it). A custom header makes a browser preflight a cross-site
  request, and the server never answers preflights with CORS headers, so
  another website can't upload or delete through a visitor's browser. Writes
  are accepted from loopback addresses only, unless the server runs with
  `ALLOW_REMOTE_UPLOAD=1` (403 otherwise).
- **Quotas.** At most 2 uploads run at once (429), and the stored media
  (the whole `assets` folder, temp files included) plus the incoming
  `Content-Length` (the type's limit when it is missing) may not pass
  `ASSETS_MAX_BYTES`, default 2 GB (507). Both are checked before the body is
  read.
- **Read errors.** A file that vanishes while being streamed (a concurrent
  delete) destroys that response; it never crashes the server.

### For the InfoPanel import (`src-tauri/crates/ips-server/src/library.rs`, `infopanel_local.rs`, `font_proxy.rs`)

| Route | Answer |
|---|---|
| `GET /api/library` | My library: every item, newest first; `data` over 256 KB (an imported canvas) is left out and its size given as `dataSize` |
| `GET /api/library/<id>` | One item, whole |
| `POST /api/library` | JSON `{ kind, name, files?, meta?, data?, copies? }` → 201 with the item (id and stamps made here) |
| `PUT /api/library/<id>` | The fields to change → 200; `kind` cannot change |
| `DELETE /api/library/<id>` | 204, or 404 |
| `GET /api/infopanel/installed` | The profiles of the InfoPanel installed here: `[{ guid, name, bytes, assets }]` (this machine only) |
| `GET /api/infopanel/installed/<guid>/Profile.xml`, `DisplayItems.xml`, `assets/<name>` | Its files, read-only |
| `GET /api/font-proxy?url=` | A Font Squirrel URL fetched for the page (no CORS there); redirects stay on font hosts, 30 MB cap, the catalogue cached a week in `<data dir>\cache` |

A library item (`kind`: image, video, font, svg, gauge, panel, style,
canvas) is one JSON file in `<data dir>\library`, named by its id
(`lib_` + 12 characters, the only thing a path is built from). Its bytes
live in the asset store, named in `files` by asset id; `meta` (tags, sizes,
colours, at most 64 KB) is what the Library page filters by; `copies` lists
where it was placed (copy semantics: a profile never points back). Writes
need `X-Dashboard-Library: 1` and JSON, from loopback unless
`ALLOW_REMOTE_UPLOAD=1`; an item is at most 8 MB.

#### Request gate (`src-tauri/crates/ips-server/src/request_guard.rs`)

Every request passes this gate before routing:

- **Host allowlist (DNS rebinding).** A rebound page is same-origin with the
  server and arrives from loopback, so the peer address proves nothing; its
  `Host` still carries its own name. Only `localhost`, `127.0.0.1` and `[::1]`
  (any port, so the Vite dev proxy works), the configured `HOST` and the names
  in `ALLOWED_HOSTS` are served; anything else gets 421 on every route. When
  `HOST` is `0.0.0.0` or `::` any IP-literal Host and the machine's hostname
  are allowed too, since LAN clients use IPs.
- **Cross-site writes.** For `POST`, `PUT`, `PATCH` and `DELETE`, a
  `Sec-Fetch-Site` other than `same-origin` / `none`, or an `Origin` whose
  host differs from `Host`, gets 403. Two loopback names count as the same
  machine, because the dev proxy keeps the browser's `Origin` while the
  server sees another `Host`.
- **Config writes.** `POST /api/config` needs `Content-Type:
  application/json` (415) and the header `X-Dashboard-Config: 1` (403), so it
  can't be sent as a simple cross-site request.
- **Errors.** A 500 answers `internal error`; the details are logged on the
  server only.

Nothing is deleted automatically. The studio's library (see Studio
inspector) lists the files and offers **Clean up unused**, which deletes what
`?unused=1` reports after a confirm. The scan reads the saved config only, so
a file used by an edit that has not been saved yet, or only by the undo
history, counts as unused.

### Sync (`src/App.tsx`, `src/lib/dashboard-server.ts`, `src-tauri/crates/ips-server/src/config.rs`)

- **Load first.** A page that is not in kiosk mode first reads `/api/config`
  (`fetchConfig`). If the server has a config, the page adopts it (merged and
  stored in its `localStorage`). Only then does it start pushing, so a fresh
  browser or stale storage never overwrites the shared config with its own
  copy or the defaults. If nothing is saved yet (404), the page's own config
  is pushed. If the server can't be read (offline or an error), the page keeps
  its local copy and does not auto-push; the Save button still posts.
- **Push.** After that first read, a non-kiosk page posts its whole config to
  `/api/config` 400 ms after each change. The studio's Save button posts
  immediately.
- **Version.** Every save bumps a version on the server and sends it to all
  subscribers of `GET /events/config` (server-sent events). A new subscriber
  gets the current version straight away; a 15 s keep-alive comment keeps the
  stream open.
- **Downgrade guard.** `POST /api/config` is refused with 409
  (`versionRefusal`, `src-tauri/crates/ips-server/src/config_guard.rs`) when the stored config's
  `version` is above the posted one, so an older build cannot overwrite a
  config with pages it cannot read. The studio then stops auto-pushing and
  shows a banner asking for a reload.
- **Pull.** A kiosk page opens `/events/config`; every message, including
  the first, makes it fetch `/api/config`, run `mergeConfig`, store the result
  in its own `localStorage` (the offline fallback) and re-render. If the server
  is offline or has no config, the page keeps its local copy.

The Vite dev server (`npm run dev`) proxies `/api`, `/events/config` and `/events/control` to
`http://127.0.0.1:3922`, so a dev page shares the config of the running
dashboard server (`vite.config.ts`).

### Control channel (`src-tauri/crates/ips-server/src/control.rs`, `src/lib/control.ts`)

Runtime state that is not config (no undo, not in `config.json`): the page each
profile shows, a profile override, and page auto-rotation with its runtime
override. The server owns it (`createControl`), saves the durable part to
`control.json` and runs the rotation timer, so every kiosk and Stream Deck key
stays in step.

- **Write.** `POST /api/control/{page,profile,rotate,touch}` with a JSON body
  and the `X-Dashboard-Control: 1` header; the client is `postControl`, which
  resolves `null` when offline or refused. Writers: the kiosk's dots and swipe
  (`page`, `rotate`), any pointer-down while rotating (`touch`, at most every
  5 s; the server then holds rotation 30 s), the studio's "Show on kiosk" and
  rotate toggle.
- **Mute alerts.** `POST /api/control/alert` with `{ action: "mute", minutes }`.
  - `minutes` is an integer from 1 to 1440 and replaces any running mute; `0` unmutes.
  - The reply is `{ alerts, mutedUntil }`, and every alert action returns `mutedUntil`.
  - The state is `mutedUntil` (epoch ms or null). It is saved in `control.json` and cleared by the tick when it passes.
  - While muted, new alerts of every severity fire quiet: they go to the history and skip page outputs. Starting a mute also marks the active alerts quiet.
  - Test alerts and island notices that aren't alerts are unaffected.
- **Kiosk actions.** `POST /api/control/kiosk` with one of these bodies:
  - `{ action: "reload", profile? }` bumps that profile's `reload` counter, or the global `reload` counter when there's no profile. Counters live only at runtime, start at the server start time, and only grow. A reload within 2 s of the previous one, for any profile, is ignored: the request still returns 200 and the current state. A kiosk records a baseline on each new connection or profile switch, and reloads once when a later message carries a higher counter (`reloadCheck`). The studio never reloads.
  - `{ action: "dim", profile?, state?: "on" | "off" | "toggle", level?: 0.1–0.9 }`. The state defaults to toggle, and the level to 0.6, remembered per profile. A `null` level counts as not set, and the level isn't checked when dim turns off. The kiosk draws a black overlay that ignores clicks, with opacity `dim`, above the widgets and the island and below the alert layer.
  - `{ action: "island", profile?, state?: "on" | "off" | "toggle" | "saved" }` is a runtime override of the profile's island. It is cleared when the saved `island` changes, like the rotate override. A hidden island keeps its reserved space. "on" for a profile with no island settings shows the default island.

  Without a profile, dim and island act on the target profile, the same as rotate. Dim and the island override are saved in `control.json`.
- **State.** The top level of the state has `mutedUntil` and `reload`. Each profile entry has `page`, `rotating`, `override`, `dim` (0 when off), `island` (whether it shows), `islandOverride` and `reload`.
- **Read.** `GET /api/control`, and `GET /events/control` (SSE; the Vite dev
  server proxies both). `useControl` opens one stream per page. A kiosk adds
  `?profile=<id>` so the server learns which profile it shows (`shown`), which
  is what an action without a profile targets.
- **Kiosk resolution.** Profile: the URL `?profile=` pin, then
  `control.profile`, then `resolveProfile` (`kioskProfileId`). Page: the URL
  `?page=` pin, then the control page for that profile, then the first page
  (`kioskPageId`). A tap or swipe switches locally first and the stream
  confirms. With the server unreachable the kiosk keeps the first page or pin.
  The zone grid is keyed by page id and fades in over 250 ms (instant with
  reduced motion).
- **Navigation** (`general.kioskPageNav`, off by default). With 2+ pages and no
  valid `?page=` pin the kiosk shows `PageDots` (tap to switch, long-press 600 ms
  to toggle rotation, a pause glyph while a saved rotation is stopped) and
  switches on a horizontal swipe (`swipeDirection`: 60 px or more, mostly
  horizontal, under 600 ms). The grid's bottom padding is at least 20 px so the
  dots never cover a zone.

## 4. Kiosk and studio

`src/App.tsx` reads these URL parameters:

| Parameter | Effect |
|---|---|
| `kiosk=1` | Kiosk mode: no header, no studio button, no config push, and the layout is pulled from the server (see Sync). Only the value `1` counts. |
| `profile=<id>` | Pins that profile when it exists in the config; an unknown id is ignored. Applies on load and after every kiosk pull. It also wins over the control channel's profile. |
| `page=<id>` | Pins that page of the shown profile when it exists (without it: the control channel's page, else the first). A pinned kiosk has no dots or swipe. |
| `studio` (any value; the app itself writes `?studio=1`) | Opens the studio instead of the grid. |

The studio is loaded lazily (`React.lazy`), so kiosk pages that never open it
do not download it. The wrench button on a non-kiosk page enters the studio;
the Live popover's **Open kiosk view** leaves it and clears the query string.

**Profile selection** (`resolveProfile`): when `activeProfile` is a profile
id that exists, that profile is used. Otherwise (`"auto"`, or an unknown id)
the profile whose design size is closest to the window wins, with the score
`|width difference| + |height difference| / 4`, recomputed on window resize.
A `?profile=` parameter overrides `activeProfile` for that page.

The grid uses `profile.cols` equal columns and `profile.rows` rows. With
`fit: "fill"` the rows share the viewport height equally; with `"scroll"` each
row is `SCROLL_ROW_H` (120 px) and the page scrolls.

**Grid spacing** (`src/lib/profile-grid.ts`). `profileGap(profile)` (the
profile's `gap`, else `DEFAULT_GRID_GAP` = 12) is the one source of the gap
between zones: the kiosk grid, the studio canvas grid, its column guides
(`columnGuides`), drawing (`cellAt`), the drawing / drag ghost (`zoneBox`)
and the move / resize pitch in `placement-frame.tsx` (`trackPitch`) all read
it, scaled by the canvas zoom where they work in screen px. The track math
(`trackSize`, `trackPitch`) is pure and tested for gaps 0, 12 and 24.
`profilePadding(profile, kiosk)` is the space around the grid: the
profile's `padding`, else the page defaults (a `fill` kiosk page 0, a
`fill` page with the header 12, `scroll` 24). The studio draws a "page"
of the profile's design size with the kiosk padding and puts the grid inside
it; the selection chip re-measures when gap or padding change.

**Theme** (`src/lib/theme.ts`). `resolveTheme(config, profile)` lays a
profile's own `theme` / `radius` over the dashboard's; `themeVars` turns
tokens into `--background`, …, `--radius`. The kiosk and dashboard page
write the shown profile's theme to `:root` (`applyTheme`). The studio keeps
the dashboard theme on `:root` for its own chrome and, for a profile with its
own theme, sets the profile's variables on the canvas page element
(`data-theme-scope`, painted `bg-background`); `index.css` re-declares the
colours derived from tokens (meters, waveforms) under `[data-theme-scope]`,
since a `var()` inside a custom property resolves where it is declared.

**General settings** (`src/lib/general.ts`, `src/hooks/use-general.tsx`).
`App.tsx` resolves `config.general` and provides it through
`GeneralProvider` to the kiosk page and the studio; `useGeneral()` reads it
(defaults outside a provider).

- Font: the page root (kiosk) and the studio canvas page set
  `font-family` from `fontStack(general.font)` (`system` sets none). A
  widget's Font option on `auto` (labelled Theme) sets no `font-family`,
  so it inherits; the
  widget-style `FONTS` are the same `FONT_STACKS`.
- Clock: `formatClock(now, general)` formats the panel Clock widget
  (`WidgetView.tsx`) and the header's last-update time with the locale,
  `hour12` (unset = the locale's) and seconds.
- Motion: `useReducedMotion()` (`src/hooks/use-reduced-motion.ts`) returns
  the OS media query for `system` and the override for `reduce` / `full`,
  so its users - the page background's `videoPolicy`, the media field
  preview, the level meter and the audio visualiser - follow it.
- Cursor: with `hideCursor`, the kiosk root gets `kiosk-hide-cursor`
  (`cursor: none` on it and every descendant, in `index.css`).

**Page background** (`src/lib/appearance.ts`,
`src/components/page-background.tsx`). `resolveBackground(config, profile)`
picks the profile's own background, else the dashboard's; `none` at either
level resolves to no background. `backgroundLayers` turns it into CSS for
three layers: the fill (color, or the letterbox behind an image), the media
(gradient or image, with `filter: blur()` and a negative inset of twice the
radius so the clipped edges stay sharp) and the overlay (tint, then dim, as
stacked gradients). `PageBackground` renders them with
`pointer-events: none`. The kiosk (`App.tsx`) puts it `fixed inset-0 -z-10`
behind the grid and drops the root's `bg-background` while a background is
set (the body keeps the theme color under it). The studio canvas renders it
`absolute` inside the profile-sized page element around the grid (made
`isolate`, so the negative z-index stays inside it) with a copy of the
dotted grid above it.

A **video** background renders as a `<video autoplay muted playsinline
preload="auto">` between the fill and the overlay, styled by `videoStyle`:
fit and position as `object-fit` / `object-position` (`stretch` is `fill`;
`tile` can't repeat and centers), blur with the same edge bleed as an image.
`videoPolicy({ motion, hidden })` decides what it does: `poster` on reduced
motion (`use-reduced-motion.ts`: the OS setting unless Animations in Settings › Dashboard (or
the screen's) overrides it), where `posterBackground`
swaps in the poster as an image background (or only the fill without a
poster) and no video is loaded; `pause` while the page is hidden
(`use-document-hidden.ts`, the `visibilitychange` event); `play` otherwise.
`rate` is applied as `playbackRate` (also `defaultPlaybackRate`, so it
survives a reload of the source). With `muted: false` the element tries to
play with sound and falls back to muted when the browser refuses
(`NotAllowedError`).

**Studio shell** (`src/components/studio/studio-view.tsx`). The studio is a
top bar over the studio body, which `studio-shell.tsx` assembles: the labelled
rail (`left-rail.tsx`), in Design the left panel (`design-left-panel.tsx`: Layers
| Add), the canvas (`studio-canvas.tsx`) with the floating zoom bar over it
(`zoom-toolbar.tsx`) and the inspector, docked, floating or in a bottom
sheet by the studio width, see Studio layout below. The other views (Screens,
Theme, Library, Gauges, Alerts & Island, Data) take the canvas's place as a full page and have no
inspector column. `studio-view.tsx` only
composes; the state lives in hooks beside it: `use-studio-selection.ts` (the
zone selection and the selected panel widget), `use-studio-ui.ts` (the view (`mode`), the left panel's tab, grid and ruler flags, zoom, dialogs, inspector search and jump
requests, the style and widget clipboards), `use-studio-layout.ts`,
`use-studio-mutations.ts` (every control turned into a config change through
the pure profile mutations in `studio-actions.ts`), `use-studio-commands.ts`
(the one dispatcher the palette, shortcuts and context menus share) and
`use-studio-shortcuts.ts`. Zone boxes are clamped by `zone-geometry.ts`
(`fitZoneRect`, `resizeZone`, `nudgeZone`), which never lets zones overlap
and keeps the old box when there is no room. App.tsx still owns the config,
its persistence and the server push.

**Chrome tokens vs the dashboard theme.** The studio's own UI is styled with
the `--ui-*` tokens in `src/index.css` (backgrounds, borders, five text
levels, the fixed blue accent, success / warning / danger, the two source-dot
colours, inverse, shadows), exposed to Tailwind as `bg-ui-panel`,
`text-ui-2`, `border-ui-subtle`, `shadow-ui-menu` and so on, and set in
Geist / Geist Mono (`font-ui`, `font-ui-mono`). They never change with the
dashboard. The dashboard theme (`--wp-*` and the theme tokens of "Theme") only
colours the widgets on the canvas and the kiosk page; the page font comes from
`src/lib/fonts.ts`: `FONT_CATALOG` holds the five system stacks (their ids are
stored in configs and never change) and the Google fonts (`google` = the
css2 family spec). `ensureFont(id)` appends the stylesheet link once, on
demand, and every stack ends in a system fallback so an offline kiosk still
renders.

**Studio canvas** (`studio-canvas.tsx`, `placement-frame.tsx`,
`selection-chip.tsx`, `drop-ghost.ts`, `canvas-cards.tsx`,
`pointer-drag.ts`). The canvas draws the profile's page with rulers and the
dot grid; each zone is a `placement-frame.tsx` that renders the real widget
(`placement-content.tsx`) and owns the press: a plain press selects (and,
past a small threshold, starts a move), Shift / Ctrl / Cmd toggles, a press on
empty grid space (handled by `studio-canvas.tsx`) draws a new blank zone. `selection-chip.tsx` is the small
chip over the primary zone (name or "N selected", size, Hide, More); it is
rendered outside the page's CSS `zoom` so it keeps a constant size, and
`zone-toolbar-position.ts` places it above or below the zone. The right-click
menus come from `zone-menu.ts` (pure specs: `zoneMenu`, `canvasMenu`,
`menuAction`) rendered by `zone-context-menu.tsx`. A library drag from Add
shows the ghost from `drop-ghost.ts` (`dropSize`, `zoneFits`: a dashed
"Drop here" or a red "No room"). `canvas-cards.tsx` holds the empty-layout
card (Browse, or Use sample layout: the `sampleLayout()` template in
`src/lib/sample-layout.ts`, copied by `withSampleZones`) and the first-run quick tips (`quick-tips.ts`, flag `studio.tipDismissed`).
`trackPointer` (`pointer-drag.ts`) follows every drag: pointer move, release,
Esc or window blur cancel it.

**Studio inspector** (`inspector-model.ts`, `inspector/`, `zone-inspector.tsx`,
`studio-inspector.tsx`). One registry drives every
inspector. `inspector-model.ts` is pure: given an `InspectorContext` (a
widget zone with its module's `settings`, a panel, a blank zone, several
zones, a panel item, an imported InfoPanel item or a Theme scope) it returns
the tabs (`inspectorTabs`: Show / Style / Data / Behaviour for a widget or
panel, a tab with no sections disabled; Style / Data / Behaviour for Theme's rows; none for a blank,
multi or InfoPanel selection) and the ordered
`InspectorSection`s of each (`allSections`, `sectionsFor`). A section is a
list of `ModuleSetting`s, optional `extras` (the widget picker, Visible,
the style toolbar, the zone frame), the inheritance chip of a followable section
(`followInfo`) and optionally a `special` marker for custom UI (the panel
editor, Bound data, the presets gallery, ...). `searchAll` searches every tab
at once, More rows included; `splitMore` splits a section into its rows and
its More rows; `sourceState` and `changedCount` give each row's source dot and
the "N changed" counts (own values that apply only). Sections come from
`inspector-categories.ts`: `SHARED_SECTIONS` (Header, Fit, Skin,
Colors, Widget colors, Typography, Shape & spacing, Surface & effects, Border & glow,
Advanced · CSS & locks, Units & format, Thresholds, Motion, Send to island) own the
standard keys (`ModuleSetting.section`, or `sharedSectionOf` for a widget's
own row such as a colour or a threshold), each in its fixed tab and before
(`lead`) or after (`trail`) the widget's own sections; `categorize(defs)`
returns them with the module's own `group`s in first-appearance order
(see [Adding a setting](#adding-a-setting-to-a-module)). The module's
`InspectorMeta` (`widgets/registry/inspector-meta.ts`) says how a widget
fills the shared sections: `header` (`yes`, `title-only`, `none`), `compact`
(`{ card, dense }`), `fmt` (the units & format rows it draws), `thr` (the
threshold quantities) and `styleSubset` (Web page's reduced look).
`inspector/inspector-view.tsx` renders the result as one column (header,
search with the "Changed" toggle, the tabs pill, the sections as an accordion
with sticky headers, the dot legend in the footer) in the docked
and floating placements; `inspector/sheet-view.tsx` is the bottom sheet's
peek / half body (a tool strip of Quick plus one tile per section, then that
section's fields). Search runs across every tab and hides the tabs; "Changed"
lists only the values set here, across every tab. `source-dot.tsx` draws the
dots; `inspector-prefs.ts` keeps the open tab per
context in localStorage (`studio.inspectorTabs`)
and the accordion mode (`studio.accordion`, one open or many open, default
one). The open section is plain component state; there is no scroll-spy.

*Quick bar* (`quick-bar.tsx`, `quick-sets.ts`). A floating pill centred at the
top of the canvas, below the page tabs and over the canvas only (docked and floating placements; Settings › Studio ›
Editor › Quick bar, `studio.quickBar`, default on): identity, the pinned
settings as compact controls, visibility and, floating, "All settings". Pins
are set from the pin button on each inspector row, are kept per widget type (all
panels share one set), at most 6, in `studio.quickPins`. `quick-sets.ts` is
pure: before any pin a type gets the default set (Layout and Accent when
present, then its first two own compact settings, max 4), and a multi
selection shows only the pins every selected type shares and writes to all of
them. The canvas keeps its top room reserved while the bar is on
(`QUICK_BAR_INSET`), so selecting never refits the page.

*Source dots.* `settings-model.ts`'s `settingStateOf` classifies a row as
`default`, `dashboard`, `profile`, `here`, `overriding` (set here over a global
value) or `ignored` (set here but the widget follows the global style, or it
is forced). The inputs are the widget's stored settings and
`resolveStyle` (`src/lib/style-resolve.ts`), the same resolution the canvas
renders; clicking a dot that is set here resets the row (`dropKeys`).

*Zone inspector* (`zone-inspector.tsx`). The header holds the icon, the
editable name, the meta line and Hide / Duplicate / Delete, then the placement
row (validated by `zone-geometry.ts`) and the search. The body is
`inspector-view.tsx` fed by `widgetContext(module)` or a panel context.
Panels plug their own editor in through `panel-sheet.tsx`
(`usePanelSheet`: the Panel, Layout, Background, Widgets cards and, with a
widget selected, its cards from `widget-editor/`: kind, display, size &
placement, typography, colour, advanced); `inspector/panel-cards.ts` maps each
card to its special section, and the Code view swaps them for one JSON card.
The Data tab is `inspector/bound-data.tsx` over `bound-data-model.ts`: the
rows are `boundRows` (a panel's widgets' sensors, or the keys a widget zone
claims, from `data-usage.ts`), and `data-picker.tsx` is the bind dialog
(widget mode: multi-toggle; item mode: a panel widget's Sensor field).
Several zones use `inspector/multi-inspector.tsx` (the shared Style sections,
written to every selected zone; the inheritance chip shows the primary zone's state).

*Panel items* (`item-inspector.tsx` over `inspector/item-model.ts`). A selected
panel widget gets the same four tabs from the item sections
(`itemSections`, `itemFields`): Kind chips, Content, Size & placement,
Typography, Color, Custom CSS, Binding, Units & format, Thresholds, History,
Fill, built from the shared rows and written back by `withItemValues`.
`panel-item.ts` holds the follow rules (`ITEM_SECTION_FIELDS`: type, colors,
format, thresholds), so the renderer and the inspector agree.

*Theme* (`theme-editor.tsx`, the Theme view; `theme-cards.ts`, `theme-editor-model.ts`,
`theme-editor-settings.ts`, `theme-exceptions.ts`). The scope is All screens, a screen or a page
(`ThemeScope`: `base`, `profile`, `page`; `theme-scope-bar.tsx`). `THEME_CARDS` are the ten section cards: each
names the widget-style sections it covers and the two-level data it also holds (color tokens, corner radius,
page font, background). Pure scope edits: `withScopeValues`, `withLock` / `withLockAll` / `withCardLock`,
`withPageFollow`, `customiseCard`, `resetCard`, and `withToken`, `withThemeRadius`, `withPageFont`,
`withBackgroundAt`. The rows are `THEME_EDITOR_SETTINGS` (the `theme` inspector context), the preview is
`ThemePreview` over `previewProfile` (the page at that scope), and `exceptionsOf` finds the widgets and pages
that do not follow (`makeFollow`, `makeAllFollow`). Saved Themes: `theme-gallery.tsx`,
`theme-start-from.tsx`, `use-appearance-presets.ts`. The page background is `background-editor.tsx` and
`background-video.tsx`; its edits go through `withBackground`, undo-keyed per scope by `backgroundKey`.

*Page inspector* (`page-inspector.tsx`, nothing selected): the page's Name and Icon, a Rotation link to Screens,
the sections the page customises over its screen's theme with the way into Theme at the page scope, Live ›
Show on kiosks now, and Duplicate / Delete page.

*Screens* (`screens-view.tsx`, `screen-detail.tsx`, `screens-model.ts`): a card per screen with the launch rule
(the card menu's `withLaunch`; "When the app opens" is Settings › Dashboard › Startup screen), and for the selected screen Size & fit and Grid (`screen-layout.tsx`),
Rotation and the pages list (`screen-pages.tsx`), Performance (a per-screen override with an inheritance chip,
`withScreenPerformance`) and links to Theme and Alerts & Island.

*Settings* (the Settings window, `src/settings/`): Dashboard (`settings-dashboard.tsx`: Performance, Clock &
date, Kiosk and the danger zone; each change is saved on the server at once through `withSettingsPatch`) and
Studio (`settings-studio.tsx`: the editor's `studio.*` preferences) beside the App pages. The Data API URL is the
Connection card of Data (`connection-card.tsx`). See the [customization guide](customization-guide.md).

**Data Explorer and binding** (`sources-panel.tsx`, `explorer/`,
`src/lib/data-points.ts`, `data-usage.ts`, `data-live.ts`,
`sample-history.ts`). The Data view replaces the canvas and the inspector with
`sources-panel.tsx`. `data-points.ts` normalises the catalog (`/api/sources`
plus the `/api/sensors` snapshot, via `useSensorCatalog`) into
source → container → point: `buildDataModel` classifies each value
(`classifyValue`: empty, url, list, bool, number, text), maps a unit to a kind
(`kindOfUnit`), gives each source a category and a health (`healthOf`: off =
no points, warn = every point empty or zero, else ok), and `searchPoints` is
the multi-word AND search. `data-usage.ts` derives "Used by" from the config
(`computeUsage`: a panel widget claims its `sensor` and `subSensor`; a widget
zone claims its module's `prefixes`, narrowed to one container when the
module's `optionsFrom: "sources"` setting is set) and holds the writes behind
Bind and Unbind (`bindPoint`, `unbindPoint`): they only set the widget fields
and settings the zones already read, so no new field is stored and old configs
load unchanged. `data-live.ts`'s `useLiveData` reads the page's one
sensor store (`sensor-store.ts`) - never one stream per row - and feeds a
`SampleHistory` (24 samples, one per ~900 ms) for the point inspector's
sparkline and Min / Avg / Max. The pure parts of the view live in
`explorer/explorer-model.ts` (scopes, filters, the flattened rows the table
windows), `explorer-endpoints.ts` (the routes of `GET /api`),
`explorer-actions.ts` (`addStatZone`: "New widget from this value"); the
components are `source-tree.tsx`, `point-table.tsx`, `point-inspector.tsx`,
`group-summary.tsx` (which also keeps `sourcePrefs`, the show / display-name
preferences) and `explorer-header.tsx`.

**Studio layout** (`studio-layout.ts`, `use-studio-layout.ts`). The inspector's
placement is picked from the studio's width (`inspectorMode`), there is no
setting: **docked** from `DOCKED_MIN_WIDTH` (1100 px), **floating** from
`FLOATING_MIN_WIDTH` (640 px), else a **sheet**. Docked is a 320 px column
(`INSPECTOR_WIDTH`) that Ctrl+\ collapses to a slim strip
(`dock-toggle.tsx`; `studio.dockCollapsed`). Floating is a 320 px card with
12 px margins over the right of the canvas, closed by default; "All settings"
in the quick bar, a double-click on a zone or Ctrl+\ opens it, its X, Ctrl+\ or
clearing the selection closes it. The sheet (`bottom-sheet.tsx`) has three
snaps (`sheetHeight`): peek (150 px, 96 with nothing selected), half
(max(320, 56% of the canvas height)) and full (height - 8); a handle drag
snaps to the nearest (`nearestSnap`), a tap toggles peek / half. The pure
`computeLayout({ body, page, rail, drawer, inspector, collapsed, floatOpen,
quickBar, sheet })` returns `{ mode, canvasWidth, canvasHeight, inset,
fitZoom }`. `body` is the studio below the top bar; `page` the profile's
design size (`height` 0 for a scroll profile, then `naturalHeight` from its
grid). The left panel (`drawer`) is a column beside the canvas in every mode
(`leftPanelFits` lays it over the canvas when it would squeeze the canvas
below `MIN_CANVAS`). The `inset` is what the page keeps clear of inside the
canvas box: the open floating card (`FLOAT_INSET`), the quick bar's top room
(`QUICK_BAR_INSET`, reserved whenever the bar is on) and, in sheet mode, the
sheet up to its half snap plus the zoom bar. `fitZoomFor` is the largest zoom
(floored to 1%, within 0.25 .. 2) at which the page plus 32 design px of
padding fit a box minus the inset; a page without a height is fitted to the
width only. `useStudioLayout` measures the body with a ResizeObserver
(`bodyRef`) and keeps the collapsed flag in localStorage
(`studio.dockCollapsed`, in try/catch); `pageSize(profile)` gives the page as
the canvas draws it. `studio-shell.tsx` renders the mode: a row (rail, left
panel, canvas with the zoom bar floating over it, inspector column) when
docked, the same row with the card over the canvas when floating, and the
sheet over the canvas bottom on a phone, where the top bar also hides the
summary and Undo / Redo, Import and Export (they move into the "..." menu).

**Sticky fit** (`use-canvas-zoom.ts`, `zoom-pref.ts`). `useCanvasZoom(page)`
measures the canvas scroll container with a ResizeObserver; while `fitting`
(the default) the zoom is `fitZoomFor(box, page)` and follows the container
and the profile. Any manual zoom (`setZoom`, steps, Ctrl + wheel) turns
`fitting` off; `fitZoom()` turns it on. The mode is stored (`studio.zoom`).
`studio-canvas.tsx` centers the page (flex with `m-auto`) and offsets the
rulers by the page's origin.

**Inspector chrome** (`inspector-layout.tsx`, `inspector-scroll.ts`).
`InspectorChrome` is a React context that the inspector parts read
(`useInspectorChrome`): the placement (docked, floating or sheet), the
header's close (floating) or collapse (sheet) button and the sheet's snap
and tool strip state; `useInInspector` switches a row to its inline slider
and value box (left panels keep the stacked slider).
`inspector-scroll.ts` finds the scrolling element for scroll-to-top and the
widget-editor reveal.

**Studio left rail and views** (`left-rail.tsx`). A labelled rail (72 px, 48 px under 960 px) opens one full
view at a time: **Screens**, **Design**, **Theme**, **Library**, **Gauges**, **Alerts & Island** and **Data**,
with Help and Settings at the foot (each opens its own page or window). Design's left panel
(`design-left-panel.tsx`) is **Layers** (`layers-panel.tsx`, zones in `sortZones` order, Shift / Ctrl-click to
multi-select) | **Add** (`add-panel.tsx` over `use-add-panel.ts` and `add-catalog.ts`: search, category chips
and widget / layout / panel rows that drag (HTML5 drag, MIME in `studio-modules.ts`) or click to place;
`searchItems` and `categoriesOf` filter). `insert-panel.tsx` keeps `filterInsertables`, `InsertFilters` and
`InsertList` for the widget picker and the palette. Screens are the cards of `screens-view.tsx`: the
a card per screen (the launch rule, `resolveProfile`'s Auto, is Settings › Dashboard › Startup screen).

**Studio top bar.** `studio-top-bar.tsx` holds the screen / page switcher (`screen-switcher.tsx`, with a ⚙ to
Screens), the search field that opens the command palette, Undo / Redo, Import and Export (`file-doors.ts`:
the Import door and the Export & back up sheet, `config-file.ts` underneath), the Live popover
(`live-popover.tsx`: Show on a page, Rotation, Mute alerts, Dynamic Island, Dim screens, Reload all kiosks, Open
kiosk view), Save (a dot while edits are not pushed yet) and, on a phone, a "..." menu with the same actions.
Reset everything is in Settings › Dashboard (behind `reset-config-dialog.tsx`), the shortcut list in Help, the
build id in Settings › App › About. In the desktop app the bar is also the
window's title bar: its empty space carries `data-tauri-drag-region` and
`window-controls.tsx` adds minimize, maximize and close at the right end.
`widget-picker-dialog.tsx` reuses `InsertFilters` and `InsertList` to assign a
widget (`assignModule` / `assignPreset` / `clearWidget` in `studio-actions.ts`).

**Undo history** (`src/hooks/use-config-history.ts`, `config-history.ts`).
The studio wraps App's `setConfig` in `useConfigHistory`, so every studio
edit records the previous config snapshot; undo and redo write snapshots
back through the same setter, which means persistence, the debounced server
push and the kiosk event stream treat them like any other edit. A change
can carry a key (`<zone>:setting:<key>`, `theme:<token>`,
`<profile>:profile-theme:<token>`, `general:<key>`, `profile:gap` and so
on): same-key changes less than 500 ms apart coalesce into one step.
Panel field edits are keyed per field (`<zone>:panel:<field>`,
`<zone>:panel-widget:<widget>:<field>`); structural edits (add, remove,
reorder, duplicate, paste, change kind, Code view Apply, applying an
appearance preset) and the saved-panel edits carry no key, so each is its own
step. **Transactions** make a whole pointer drag one step however long it
takes: `begin()` snapshots the config when a move or resize really starts
(`placement-frame.tsx`'s drag-start callback), changes during it only move the
config (`recordChange` ignores them while `txn` is set), `commit()` records
start → current as one step (nothing if it ended where it began) and
`cancel()` (Esc, window blur) restores the start snapshot and records nothing.
Undo, redo and the shortcuts stand down while a transaction is open
(`dragging()`). The stacks hold 100 steps and live only while the studio is
open; a config replaced from outside (the server copy loaded on open) clears
them, but switching profile does not: a switch is itself a step. When an undo
removes the selected zone, the selection is cleared.

**Shortcuts and command palette.** `use-studio-shortcuts.ts` listens on the
window; the pure `shortcutAction` maps a key press to an action, ignoring
plain keys while focus is in a field or a dialog / menu is open and everything
but Esc while a drag is in flight; `SHORTCUT_GROUPS` there is the list the
cheat sheet shows (General, Selected zones, Selected panel widget, Canvas).
Ctrl+Alt+C / V read `event.code` (Alt changes `key` on some layouts). The
command palette (`command-palette.tsx`, Ctrl+K) lists `buildCommands` from
`commands.ts`, a pure function of the studio state whose entries carry an
action descriptor that `use-studio-commands.ts` carries out (the shortcuts and
the context-menu rows share that dispatcher); `rankCommands` orders matches
prefix > word start > substring.

**Selection model.** `use-studio-selection.ts` keeps the selected zones as an
ordered list - the last is the *primary* zone (chip, handles, keyboard resize,
inspector) - and, for a panel zone, the selected widget
(`{ zoneId, widgetId }`). `selection.ts` defines how a click changes it:
`only`, `toggle` (Shift / Ctrl / Cmd) and `primary` (a press on a selected
zone before a drag keeps the rest). The widget only counts while its zone is
the one selected zone and still holds it, so selecting another zone, an undo
or a delete drops it. The canvas selects it (a click inside the selected panel
zone, or a double-click on a widget of another panel; `placement-frame.tsx`
hit-tests `[data-widget-id]`), as do the layer list, the palette's *Select
widget* and the breadcrumbs. With a widget selected the shortcuts run in
widget mode (`ShortcutContext.widget`): Del, Ctrl+D, Ctrl+C / Ctrl+V and
Alt+Up / Down map to `widget-*` actions that `panel-widget-actions.ts` carries
out on the selected panel, while the arrow keys keep moving the zone; Esc steps
out widget > zone > nothing. Widget names in the layers, crumbs and palette
come from `widgetName` (`widget-kinds.ts`): the label, else the sensor's name
from the Data API catalog, else the key's last segment.

**Pages in the studio** (`page-tabs.tsx`, `use-studio-mutations.ts`, `src/lib/pages.ts`). The studio
edits one page of the profile at a time: `App.tsx` holds `studioPage` (view state, not in the undo
history, and it falls back to the first page when the page vanishes) and resolves the `ProfileView`
with `profileWithPage`, so every existing reader keeps working on that page. The `PageTabs` strip above
the canvas switches, adds, renames (double-click), reorders (pointer drag, one `movePage` per drop),
duplicates, deletes (confirmed, never the last) and sets the icon (`page-icons.ts`). Page edits go
through `updateStored` (the whole stored profile, same no-op identity rule as `updateProfile`); each is
one undo step. A page switch clears the selection, which never spans pages. "Move to page" in the zone
menu is `moveZonesToPage` (`studio-actions.ts`): a zone keeps its box when free on the target page,
else takes the first free spot at its size, and the whole move is refused when any zone has no room.
Ctrl+PageUp / PageDown step through the pages (wrapping) and the palette has the page commands. The
Screens' Rotation section writes `rotate` through `setRotate`; rotation itself runs
on the kiosk (a later phase).

### Alerts

Rules are config (`config.alerts`, types and `normalizeAlerts` in `src/lib/alerts.ts`); active alerts and
the history are server state. The engine (`src-tauri/crates/ips-server/src/alerts.rs`, started with the server) subscribes to
the Data API keys the rules use, evaluates thresholds (duration, hysteresis, cooldown), `changes`,
`contains` and notification filters, and publishes the active list as `alerts` in the control state
(`/events/control`, `src/lib/control.ts`). Acknowledge, dismiss and test go through
`POST /api/control/alert`; `GET /api/alerts/history` returns the last 200. Nothing here enters undo.

The studio's Alerts & Island view (`alerts-view.tsx`; tabs Rules, Island, Defaults, History) shows the
master switch and the rules (`alerts-rules.tsx`), the island's settings (`island-tab.tsx`), the global
defaults (`alerts-defaults.tsx`), and the live active list with the history (`alerts-live.tsx`, history
refetched when the list changes). A rule opens in `alerts-rule-editor.tsx` with the
outputs in `alerts-outputs.tsx`. Edits are pure functions on the config (`alerts-model.ts`) run through
`setConfig` with a key per rule and field, so a burst of typing is one undo step; add, delete, duplicate
and preset each are one step. New rules come from `src/lib/alert-presets.ts`: a preset's regex picks the
first live numeric point of the catalogue, and leaves the key empty when none matches. Test fires the
rule through the real path and waits while edits are not pushed yet. The palette has the Alerts & Island
destinations and "New alert rule".

The `missing` condition ("stops reporting") fires once a key the rule has seen has been absent for
`forSeconds`; the Data API drops a stopped plugin's keys, so this is "plugin stopped reporting".

### Dynamic Island

A per-profile pill at the top centre (`MonitorProfile.island`, `src/lib/island/`, the view in
`src/components/island/`; full description in `docs/redesign/island/PLAN.md`). Everything it shows goes
through one notice bus (`islandBus`, a pure queue in `queue.ts` driven by one timer):

- **Server alerts** whose display style is Island: `App.tsx` splits the shown alerts with
  `splitIslandAlerts` (to the island, or to the alert layer; a profile without an island shows them as a
  top toast) and the island syncs them in as the `alerts` source.
- **The dashboard's own notices** (kiosk only, mounted by `LiveSources`): the Data API disconnect
  warning (`system.ts`), and the widgets whose "Send to island" is on (`sources.ts`,
  `use-island-sources.ts`). A template opts in with `island` on `templateModule`, which adds the toggle
  and the source's own options. A data source's pure `derive(prev, next, settings)` runs once per new
  reading on one shared `useSensors` over the union of the sources' prefixes; a store source (Wave
  Link, the Timer) watches its client store (`storeSource`). The first data is a baseline. The
  definitions are in `src/widgets/island-sources.ts` and `src/widgets/island/`.
- **Dashboard notices** switched on per profile (`IslandConfig.notices`, `use-dashboard-notices.ts`): the
  page name, "Layout updated" (a config pull that changed something), a plugin back (`/api/sources`
  polled), OBS on air, the calendar countdown and the coding agents. The last three come from the
  server's extras (`src/lib/extras.ts`, SSE `/events/extras`). Quiet hours gate all of these notices (`quiet.ts`).
- **Live activities** (the playing track, the game and its FPS, a download, the timer, the next event,
  the OBS Live dot) show beside the time while nothing is open; the highest priority, then the newest,
  shows.

The server's extras (`src-tauri/crates/ips-server/src/extras.rs`) hold one OBS connection (`obs.rs`, obs-websocket 5) and fetch the calendar links (`calendar.rs`, parsed by `ical.rs`) for every kiosk.
It also holds the coding agents (`agents.rs`): `ips-agent`, run by Claude Code's and
Codex's hooks and Claude's statusline (installed by the app, or `ips-agent install`), posts each event to
`POST /api/agents/event` or `/api/agents/statusline`. Only loopback requests with a JSON body and the
`X-Agent-Event: 1` header are taken (`agentWriteRefusal`, so a web page cannot forge one). The reducer
keeps a session per hashed id and publishes only the state, tool, folder name, context and plan
percentages. `agent_usage.rs` adds tokens per day from the transcripts, read incrementally in 8 MB steps.
The Coding Agents widget and the island's *Coding agents* notice read the same state.

The OBS and calendar settings are in `integrations.json` beside the config, never in `config.json`: the studio writes
them with `PUT /api/integrations` and reads them back without the password or the links' URLs.

The studio canvas mounts the island inside the page box and plays only test alerts and the Preview
button's samples. "Reserve space" adds `islandReserve` to the page's top padding on the kiosk and the
canvas (whose row maths subtracts it).

### Adding a setting to a module

Settings are plain `ModuleSetting` entries in a module's `settings` array
(`src/modules/types.ts`); the inspector renders them with no UI code. Besides
the usual `key`, `label`, `type` and `default`:

- `group` names the section it joins in the widget's own part of a tab;
  settings that share a group render together, placed where the group first
  appears. A group must not be a shared section's title, a widget's name or
  "Content".
- `section` files the setting in a shared section (`SharedSectionId`)
  instead: the standard block's keys, and any widget row that belongs there.
- `tab` (`"show" | "style" | "data" | "behaviour"`) picks the inspector tab.
  Unset, a data setting (a sensor or device) goes to Data and the rest to
  Show; `style` files a colour or look toggle in Style › Widget colors.
- `more: true` lists it behind its section's "More (n)" link (`advanced` is
  read as the same).
- `role` (a colour row): the palette colour it stands for (`s1`…`s6`, `ok`,
  `warn`, `crit`). While the section follows, the row shows the role's colour;
  custom, its own colour, Auto = the role.
- `perWidget: true` marks a row that never comes from a theme (a tint, a
  background image): it stays editable while its section follows.
- `keyY` (+ `defaultY`) makes a row two-keyed: `align`/`alignSpread`,
  `warn.<q>`/`crit.<q>`.
- `hidden: true` keeps a row in the schema (default, stored value) without
  listing it (Custom gauge's `gauge`).
- `hint` is the one-line explanation behind the row's info icon, and is
  searched.
- `visibleIf(values)` shows the row only while it holds for the zone's
  effective values (for example the glow colour only when glow is not none);
  it reads the resolved values, so a themed row works either way.

`inspector-categories.test.ts` checks every module resolves to a known
category. Keys that are look settings (`PROFILE_STYLE_KEYS`) take part in the
dashboard / profile / own layering and get source dots; never rename a key or
change a default without a migration, since saved configs hold them.

## 5. Desktop app (InfoPanel Studio)

Full reference: [desktop/README.md](desktop/README.md); design, decisions and the
IPC contract: [desktop/TAURI_PLAN.md](desktop/TAURI_PLAN.md).

`src-tauri/` is a Tauri 2 shell around the same server and the same studio. The
shell runs the server (`ips-server`, `native.rs`) inside its own process, on the
port and with the host, allowed hosts and `dist` folder from the settings, waits for
`/api/health`, then loads the studio from the server origin
(`http://127.0.0.1:<port>/?studio=1`), so stored `/api/assets/<id>` links and the
same-origin request guard keep working. The server is restarted after a crash (3
times a minute) and logs to `server.log`; the app writes `app.log`. No Node ships
with the app.

- **Another server on the port.** If something already holds the port, the app
  probes `/api/health`. A server of this app (another copy, or an `ips-server` run
  from source by the same user) can be used from the start page; anything else is
  left alone and the start page offers another port.
- **Local pages** (`src-tauri/pages/`: start; the React settings window is built into `pages/app/`) are served by Tauri, so they
  work when the server can't start. They use the capability `default.json` (app
  settings, server control, agents, window controls).
- **Studio IPC.** The studio origin gets a smaller capability, added at runtime
  once the server answers (`control.rs`, `add_studio_capability`; remote URL
  `<origin>/*`, window `main`): `open_settings`, `save_text_file`, `open_text_file`,
  `log_frontend`, `report_metrics`, `get_debug`, `flush_done`, event listen and
  unlisten, and the window minimize, maximize and close commands. Hence the image
  proxy's images-only rule: a same-origin HTML response must not reach IPC.
- **Navigation guard** (`nav.rs`). Only the server origin (not `/api/*`) and the
  local pages load in the window; everything else, including `target="_blank"`,
  opens in the system browser.
- **Window.** No native frame: the studio top bar is the title bar (see above), and
  closing hides to the tray while the server keeps serving the kiosk.
- **Studio bridge** `src/lib/desktop.ts`. `isTauri()` gates everything and
  `@tauri-apps/api` is imported lazily, so the browser and kiosk bundles carry no
  Tauri code and every call is a no-op outside the app. `config-file.ts` uses the
  native Save and Open dialogs there, and the rail's Settings button opens the settings window.
- **Flush on hide and quit.** Before the window hides or the app quits, Rust emits
  `studio://flush`; `App.tsx` pushes the pending config (the push is otherwise
  debounced 400 ms; the studio gives up after 1200 ms) and calls `flush_done`. Rust
  waits at most 1500 ms.
- **Debug mode** (the setting, `--debug` or `INFOPANEL_STUDIO_DEBUG=1`). The in-app server
  runs with debug on (request and SSE log, `/api/debug/stats`).
  `src/lib/desktop-debug.ts` forwards the studio's errors, warnings and unhandled
  rejections (rate limited) with `log_frontend` and, every 30 s, sends the JS heap,
  DOM node count and open EventSources with `report_metrics`. Rust adds the memory
  of the app, the server and WebView2 plus the server stats and writes one
  `metrics.csv` line per sample; the settings page flags growing series.
- **Where the studio opens** (`studio_target.rs`, setting `openStudioIn`). Every path that opens the studio (the
  tray, a second launch, Open the studio on launch, Settings' links) asks it first: the app window, Microsoft Edge
  with `--app=<url>` (found in the registry) or the default browser. The browser targets start the server if it is
  stopped, open `http://127.0.0.1:<port>/?studio=1` and build no WebView. A browser studio is an ordinary page on the
  server origin with no IPC; it saves when its tab is hidden.
- **Giving memory back.** A hidden or minimized studio webview is suspended (`webview2.rs`). After `releaseHiddenStudio`
  in the tray the window is destroyed (`release.rs`) and rebuilt on Show; `studioRefresh` (`refresh.rs`) reloads a page
  left unfocused. A minute after the studio loses focus the shell sends `studio-focus` and `src/lib/studio-focus.ts`
  sets the ticker to `slow` (5 fps, ambient effects paused) when `reduceUnfocusedAnimation` is on.
- **Design preview data** (`src/lib/preview-data.ts`, `src/lib/preview-data-pref.ts`). In `frozen` mode the Design
  canvas renders from one `GET {url}/api/sensors` snapshot and opens no stream of its own, so the sensor store's
  reference counting closes the page's streams. Kiosks and the Data view stay live. The choice is kept on the server
  (`studio-prefs.json`, `GET`/`PUT /api/studio-prefs`, `src-tauri/crates/ips-server/src/studio_prefs.rs`) with a
  `localStorage` copy, so the app window and a browser studio share it.
- **Kiosk bundle.** The kiosk page doesn't carry React's server renderer: the gauge icons are markup generated by
  `tools/gen-gauge-icons.mjs` (`src/lib/infopanel/gauges/icon-markup.generated.ts`). The animation ticker sleeps
  between frames, see [performance.md](performance.md#the-shared-ticker).
