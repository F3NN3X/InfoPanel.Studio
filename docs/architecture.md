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
 (kiosk or studio)                                                                   (server.mjs, 127.0.0.1:3922)
```

Sensor data never passes through the dashboard server. `server.mjs` serves
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
images, which it loads directly. The proxy relays only images (`server/proxy.mjs`):
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

### Style resolution (`src/lib/style-resolve.ts`)

Every zone's look is resolved before it renders. Only the look keys
(`PROFILE_STYLE_KEYS`) are layered, lowest first:

```
module default            (a panel: its legacy PanelDef accent / background)
  → dashboard style       DashboardConfig.style
  → profile style         MonitorProfile.style
  → the widget's own      Placement.settings - skipped when Placement.styleMode is
                          "follow" or the global style is forced
```

`resolveStyle({ moduleDefaults, dashboard, profile, own, mode, enforce })`
returns the settings (content keys always from `own`) and a per-key
`source` (`default` / `dashboard` / `profile` / `own`) that the
inspector's dots show. `appearanceOf(config, profile)` collects the two
style layers and the force switch (`profile.styleEnforce ?? config.styleEnforce`)
into an `Appearance`; `App.tsx` and the studio canvas pass it to
`LivePlacement`, and `placementContent` resolves each zone with
`resolveWith(appearance, own, placement.styleMode, moduleDefaults)`. A
`styleMode` of `"custom"` or none keeps the per-key order; `"follow"`
ignores the widget's own look values but keeps them stored.

### Where each setting comes from

Every layered setting resolves the same way, lowest first; the first level
that sets a value wins from the right:

| Setting | App default | Dashboard (`DashboardConfig`) | Profile (`MonitorProfile`) | Widget (`Placement`) | Resolved by |
|---|---|---|---|---|---|
| Look keys (surface, accent, font, …) | the module's defaults | `style` | `style` | `settings` (unless `styleMode: "follow"` or forced) | `resolveStyle` (style-resolve.ts) |
| Force global style | off | `styleEnforce` | `styleEnforce` | - | `isEnforced` |
| Theme colours, corner radius | `DEFAULT_THEME`, 0.5 rem | `theme`, `radius` | `theme` (partial, over the dashboard's), `radius` | - | `resolveTheme` (theme.ts) |
| Page background | none (the theme's page colour) | `background` | `background` (`{ type: "none" }` turns it off) | - (a widget's own background image is a look key) | `resolveBackground` (appearance.ts) |
| Grid gap, padding | 12 px; padding per mode (`profilePadding`) | - | `gap`, `padding` | - | `profileGap` / `profilePadding` (profile-grid.ts) |
| General (font, clock, locale, motion, cursor) | `GENERAL_DEFAULTS` | `general` | - | - (a widget's Font look key beats the page font) | `resolveGeneral` (general.ts) |

### The render pipeline of a module zone

```
Placement.settings
  → resolveWith(appearance, settings, styleMode) dashboard → profile → own (see above)
  → mod.render(sensors, settings)
       → hasKeys(sensors, prefixes)               no key under the prefixes: null (no data)
       → <TemplateZone>                           src/widgets/module.tsx (templateModule)
            → toFlat(sensors), toNames(sensors)   the data adapter, memoised per map
            → useZoneLook(defs, settings)         effectiveSettings; a chosen skin brings its
                                                  surface; skin fonts are loaded
            → <Component data names {...shellProps(look)} {...toProps(look)} look>
                 → <Widget {...shell(p)}>         the shell (below): chromeOf(look) → zoom,
                                                  surface box, text variables, header
                      → content / <CompactView> / <StudioView>
  → PlacementFrame                                grid position, the zone's re-scoped tokens
                                                  (PlacementRender.scope); studio chrome or kiosk plain
```

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

`src/widgets/` is the widget library: 50 templates, each a component over flat
string data, drawn inside one `<Widget>` (`src/widgets/core/Widget.tsx`).
`src/widgets/kit.ts` re-exports what a widget file needs from `core/`.

- **Measuring.** `useBox` observes the shell's outer size and returns a
  `Box`: `w`, `h`, a size tier (`xs` < 220×140 ≤ `sm` < 340×210 ≤ `md` <
  500×320 ≤ `lg`) and a shape from the zone's aspect (`tile` under
  240×240, `strip` at ratio ≥ 2.6 and under 160px tall — one row of a square
  grid — `column` at ratio ≤ 0.62 and under 260px wide, else `box`). On a
  grid of short rows (a 1920×550 strip profile, ~156×42px cells) a wide zone
  of several rows is therefore a `box` and shows the widget, not the
  one-line summary. The standard `layout` option forces the tier. The
  content callback receives the *inner* size (after padding and header) too,
  so a widget counts its rows from the room that exists.
- **Views.** Besides its normal layout a widget gives the shell a `compact`
  descriptor (a tile, strip or column summary, the **Summary card**) and a
  `studio` descriptor (the dense variant). `summaryShape` (`core/layout.ts`)
  picks the card's form from `compactView`: `auto` for a tile, strip or column
  zone, `off` never, `on` always (a box becomes a strip when wide, a column
  when tall, else a tile). `CompactView` and `StudioView` (`core/views.tsx`) draw them.
- **The look.** The shell maps the standard look keys onto the zone
  (`core/look.ts`): `chromeVars`, the surface box with border, glow, opacity and
  blur (`lookBox`), text colors, font and weight (replacing the skin's), label
  case, padding and gap (overriding the tier padding), `stroke` (scaling ring
  and graph strokes), the background image with a scrim, the scoped custom CSS
  and the header icon and title. Size % zooms the content box; the tier and
  shape are measured after the zoom.
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
else the profile's (`var(--radius)`, Profile › Corner radius, falling back to the
dashboard `radius`), like panels;
the skins' `radius` token no longer reaches the shell. Appearance › Theme &
surface also sets the global `surfaceOpacity` and `blur` (Background opacity
and blur), which let a page image or video show through the cards. `smoothing` (Graph updates: Stepped / Smooth) sets `SkinCtx.smooth`; `Spark` then
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
`variant` (Dense summary) is a layout mode
under Size & alignment, not a style. In the studio, Appearance › Skins draws
every skin live (`skin-gallery.tsx`) above the user's saved looks, and Theme &
surface shows surface and theme swatches (`surface-picker.tsx`,
`theme-panel.tsx`) over the editable theme colours.
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

`?widget-qa` (a lazy chunk, `src/widgets/widget-qa.tsx`, never linked) renders
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
decisions per item under `$` (mode, Data API key). `placementContent`
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
  → resolveWith(appearance, …, styleMode, panelLegacyLook(placement))
                                                 legacy accent / background as the lowest layer
  → <PanelView enforced>                         src/components/widgets/PanelView.tsx; forced:
                                                 enforcedPanel drops the widgets' own colors
       → chromeOf(cfg) → <ModernChrome>          no design size: Size %, --wp-* variables,
                                                  custom CSS + panel.css, background image
            → div                                 places a hugging panel (fit: "hug") by alignX / alignY
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

- `DashboardConfig` - `version: 4` (`CONFIG_VERSION`), `activeProfile` (a profile id or `"auto"`),
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
  `design`, `panel`, `styleMode?` (`"follow"` / `"custom"`, see [Style
  resolution](#style-resolution-srclibstyle-resolvets)).
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
over the global style (not following, not forced); `countProfileOverrides`
counts, for "all", profiles with their own look (style, theme or radius).
`clearOverrides` sets those widgets to `styleMode: "follow"` (their values
stay) and, for "all", drops the profiles' styles, themes and radii.
`presetFromCurrent` captures the resolved theme of the scope (a profile's
own colours over the dashboard's). `saveAppearancePreset`, `renameAppearancePreset` and
`deleteAppearancePreset` manage the user's list. The studio wires them through `useAppearancePresets`
(`src/components/studio/use-appearance-presets.ts`); the palette's
**Apply appearance: …** commands apply to "all".

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
  (`server/config-guard.mjs`), so a v3 build cannot write back over v4;
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

`server.mjs` writes the file as `<data dir>\config.json`, where the data
directory is `%LOCALAPPDATA%\InfoPanel\Dashboard`. If `LOCALAPPDATA` is not
set it uses `$HOME/.local/share/InfoPanel/Dashboard` (`./.local/share/…` when
`HOME` is unset too). It writes a temp file and renames it. A body must be a
JSON object and at most 5 MB, otherwise the server answers 400 or 413.
`GET /api/config` answers 404 until a config has been saved.
`DASHBOARD_DATA_DIR` replaces that directory and `DASHBOARD_DIST` the folder
served (default `dist/` beside `server.mjs`).

Two small routes beside the config: `GET /api/health` answers
`{ app: "infopanel-dashboard", version, configVersion }` (`version` is
`package.json`'s, "0.0.0" when that file is missing), so a client can tell this
server from another one on the port. With `DASHBOARD_DEBUG=1` the server logs
each request (method, path, status, ms) and every SSE connect and disconnect
per channel (`config`, `control`, `extras`) with the current count, and
`GET /api/debug/stats` (404 otherwise, 403 from other machines;
`server/debug.mjs`) returns the memory use, uptime, SSE clients per channel,
active resources by type and the event-loop delay (p50, p99, max in ms).

### Uploaded media (`server/assets.mjs`, `src/lib/assets.ts`)

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

### For the InfoPanel import (`server/library.mjs`, `infopanel-local.mjs`, `font-proxy.mjs`)

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

#### Request gate (`server/request-guard.mjs`)

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

### Sync (`src/App.tsx`, `src/lib/dashboard-server.ts`, `server.mjs`)

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
  (`versionRefusal`, `server/config-guard.mjs`) when the stored config's
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

### Control channel (`server/control.mjs`, `src/lib/control.ts`)

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
the studio's **Kiosk view** button leaves it and clears the query string.

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
motion (`use-reduced-motion.ts`: the OS setting unless General > Motion
overrides it), where `posterBackground`
swaps in the poster as an image background (or only the fill without a
poster) and no video is loaded; `pause` while the page is hidden
(`use-document-hidden.ts`, the `visibilitychange` event); `play` otherwise.
`rate` is applied as `playbackRate` (also `defaultPlaybackRate`, so it
survives a reload of the source). With `muted: false` the element tries to
play with sound and falls back to muted when the browser refuses
(`NotAllowedError`).

**Studio shell** (`src/components/studio/studio-view.tsx`). The studio is a
top bar over the studio body, which `studio-shell.tsx` assembles: the icon
rail (`left-rail.tsx`), the open left panel (`studio-drawers.tsx`: Layers,
Add or Profiles in a 256 px column), the canvas (`studio-canvas.tsx`, or the
Data Explorer in Sources mode) with the floating zoom bar over it
(`zoom-toolbar.tsx`) and the inspector, docked, floating or in a bottom
sheet by the studio width, see Studio layout below. `studio-view.tsx` only
composes; the state lives in hooks beside it: `use-studio-selection.ts` (the
zone selection and the selected panel widget), `use-studio-ui.ts` (mode, open
panel, grid and ruler flags, zoom, dialogs, inspector search and jump
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
`document-inspector.tsx`, `studio-inspector.tsx`). One registry drives every
inspector. `inspector-model.ts` is pure: given an `InspectorContext` (a
widget zone with its module's `settings`, a panel, a blank zone, several
zones, or the dashboard) it returns the tabs (`inspectorTabs`: Content /
Style / Data for a widget or panel; Profile / Appearance / Global style /
General for the dashboard; none for a blank or multi selection) and the
ordered `InspectorSection`s of each (`allSections`, `sectionsFor`). A section
is a list of `ModuleSetting`s, optional `extras` (the widget picker, Visible,
Follow / Custom, the style tools, the zone frame) and optionally a `special`
marker for custom UI (the panel editor, Bound data, the presets gallery, the
theme editor, ...). `searchAll` searches every tab at once;
`applyAdvanced` hides advanced settings and counts them for "Show N advanced
settings"; `sourceState` and `changedCount` give each row's source dot and
the "N changed" counts. Sections come from `inspector-categories.ts`:
`GENERAL_CATEGORIES` (Widget, Size & alignment, Typography, Spacing & shape,
Colors & surface, Border & effects, Advanced) own the standard keys,
`categorize(defs)` returns them in that order and then the module's own
categories in first-appearance order, and `categoryTab` / `ModuleSetting.tab`
decide the tab (see [Adding a setting](#adding-a-setting-to-a-module)).
`inspector/inspector-view.tsx` renders the result as one column (header,
search with the "Changed" toggle, the tabs pill, the sections as an accordion
with sticky headers, the Advanced footer with the dot legend) in the docked
and floating placements; `inspector/sheet-view.tsx` is the bottom sheet's
peek / half body (a tool strip of Quick plus one tile per section, then that
section's fields). Search runs across every tab and hides the tabs; "Changed"
lists only the values set here, across every tab. `source-dot.tsx` draws the
dots; `inspector-prefs.ts` keeps the Advanced flag and the open tab per
context in localStorage (`studio.inspectorAdvanced`, `studio.inspectorTabs`)
and the accordion mode (`studio.accordion`, one open or many open, default
one). The open section is plain component state; there is no scroll-spy.

*Quick bar* (`quick-bar.tsx`, `quick-sets.ts`). A floating pill centred at the
top of the canvas, below the page tabs and over the canvas only (docked and floating placements; Dashboard › General ›
Studio › "Quick bar", `studio.quickBar`, default on): identity, the pinned
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
written to every selected zone).

*Dashboard inspector* (`document-inspector.tsx`, nothing selected, over
`use-document-props.ts` for its data and edits). Profile
(`inspector/profile-sections.tsx`: profile fields, This profile
Inherit / Custom, Auto-pick), Appearance (`appearance-panel.tsx`'s scope and
Force switch, the presets gallery `appearance-gallery.tsx`, `theme-panel.tsx` /
`profile-theme-panel.tsx`, and the page background `background-panel.tsx`,
`background-editor.tsx`, `background-video.tsx`; background edits go through
`withBackground`, undo-keyed per scope by `backgroundKey`), Global style (the
look sections over `PROFILE_STYLE_SETTINGS`, written at the dashboard or
profile level) and General (`general-panel.tsx`: Type, Clock & date, Display,
Studio = the Quick bar and Inspector sections switches, Connection = the Data API URL). See the
[customization guide](customization-guide.md).

**Data Explorer and binding** (`sources-panel.tsx`, `explorer/`,
`src/lib/data-points.ts`, `data-usage.ts`, `data-live.ts`,
`sample-history.ts`). Sources mode swaps the canvas and the inspector for
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
summary, the Kiosk view label and Undo / Redo (they move into the "..." menu).

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

**Studio left rail and panels** (`left-rail.tsx`). A 52 px icon rail opens
one panel at a time, remembered in localStorage (`studio.drawer`): **Add**
(`insert-panel.tsx`: search, category chips, widget / layout / panel cards
that drag (HTML5 drag, MIME in `studio-modules.ts`) or click to place;
`filterInsertables` searches and filters, `InsertList` is reusable with an
`onPick` callback), **Layers** (`layers-panel.tsx`, zones in `sortZones`
order, Shift / Ctrl-click to multi-select) and **Profiles**
(`profiles-panel.tsx`: profile list with a thumbnail, the Auto entry via
`resolveProfile`, Auto-pick). **Sources** is not a panel: it swaps the canvas
for the Data Explorer. The keyboard icon opens `shortcuts-dialog.tsx`.

**Studio top bar.** `studio-top-bar.tsx` holds the profile switcher (a Base UI
menu), the Design | Sources switch, Undo / Redo, Kiosk view, Save (a dot while
edits are not pushed yet) and a "..." menu: Export / Import
(`config-file.ts`), Copy profile JSON, Command palette, Keyboard shortcuts,
Reset everything (behind `reset-config-dialog.tsx`), "Desktop app settings" (only
in the desktop app) and the build id. In the desktop app the bar is also the
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
profile inspector's Auto-rotate section writes `rotate` through `updateStored`; rotation itself runs
on the kiosk (a later phase).

### Alerts

Rules are config (`config.alerts`, types and `normalizeAlerts` in `src/lib/alerts.ts`); active alerts and
the history are server state. The engine (`server/alerts.mjs`, started from `server.mjs`) subscribes to
the Data API keys the rules use, evaluates thresholds (duration, hysteresis, cooldown), `changes`,
`contains` and notification filters, and publishes the active list as `alerts` in the control state
(`/events/control`, `src/lib/control.ts`). Acknowledge, dismiss and test go through
`POST /api/control/alert`; `GET /api/alerts/history` returns the last 200. Nothing here enters undo.

The studio's Alerts panel (rail item "Alerts", `src/components/studio/alerts-panel.tsx`) shows the
master switch, the live active list (`alerts-live.tsx`, history refetched when the list changes), the
rules and the global defaults (`alerts-defaults.tsx`). A rule opens in `alerts-rule-editor.tsx` with the
outputs in `alerts-outputs.tsx`. Edits are pure functions on the config (`alerts-model.ts`) run through
`setConfig` with a key per rule and field, so a burst of typing is one undo step; add, delete, duplicate
and preset each are one step. New rules come from `src/lib/alert-presets.ts`: a preset's regex picks the
first live numeric point of the catalogue, and leaves the key empty when none matches. Test fires the
rule through the real path and waits while edits are not pushed yet. The palette has "Open alerts" and
"New alert rule".

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

The server's extras (`server/extras.mjs`) hold one OBS connection (`obs.mjs`, obs-websocket 5 over
Node's WebSocket) and fetch the calendar links (`calendar.mjs`, parsed by `ical.mjs`) for every kiosk.
It also holds the coding agents (`agents.mjs`): `tools/agent-status.mjs`, run by Claude Code's and
Codex's hooks and Claude's statusline (installed by `tools/agent-install.mjs`), posts each event to
`POST /api/agents/event` or `/api/agents/statusline`. Only loopback requests with a JSON body and the
`X-Agent-Event: 1` header are taken (`agentWriteRefusal`, so a web page cannot forge one). The reducer
keeps a session per hashed id and publishes only the state, tool, folder name, context and plan
percentages. `agent-usage.mjs` adds tokens per day from the transcripts, read incrementally in 8 MB steps.
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

- `group` names the section (category) it joins; settings that share a group
  render together, placed where the group first appears.
- `tab` (`"content" | "style" | "data"`) picks the inspector tab. Unset, a
  setting follows its category: the general categories by their kind, a
  widget's own categories in Content, those made only of colour pickers in
  Style. Put a data-related category in Data explicitly.
- `advanced: true` tucks it away until the Advanced toggle is on (a category
  can be advanced as a whole).
- `hint` is the one-line explanation behind the row's info icon, and is
  searched.
- `visibleIf(values)` shows the row only while it holds for the zone's
  effective values (for example the glow colour only when glow is not none).

`inspector-categories.test.ts` checks every module resolves to a known
category. Keys that are look settings (`PROFILE_STYLE_KEYS`) take part in the
dashboard / profile / own layering and get source dots; never rename a key or
change a default without a migration, since saved configs hold them.

## 5. Desktop app (InfoPanel Studio)

Full reference: [desktop/README.md](desktop/README.md); design, decisions and the
IPC contract: [desktop/TAURI_PLAN.md](desktop/TAURI_PLAN.md).

`src-tauri/` is a Tauri 2 shell around the same server and the same studio. The
shell starts a bundled `node.exe` running `server.mjs` (the sidecar, `sidecar.rs`)
with `PORT`, `HOST`, `ALLOWED_HOSTS` and `DASHBOARD_DIST` set, waits for
`/api/health`, then loads the studio from the server origin
(`http://127.0.0.1:<port>/?studio=1`), so stored `/api/assets/<id>` links and the
same-origin request guard keep working. The server joins a kill-on-close job
object (no server outlives a killed app), is restarted after a crash (3 times a
minute) and writes `server.log`; the app writes `app.log`.

- **Takeover.** If the port is held by an older `node server.mjs` or
  `start-dashboard.bat` (a `node.exe` that answers `/api/health` as the dashboard or
  runs `server.mjs`), the app stops it and starts its own. Anything else on the port
  is left alone and the local start page offers the settings.
- **Local pages** (`src-tauri/pages/`: start, settings) are served by Tauri, so they
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
  native Save and Open dialogs there, and the `⋯` menu gains "Desktop app settings".
- **Flush on hide and quit.** Before the window hides or the app quits, Rust emits
  `studio://flush`; `App.tsx` pushes the pending config (the push is otherwise
  debounced 400 ms; the studio gives up after 1200 ms) and calls `flush_done`. Rust
  waits at most 1500 ms.
- **Debug mode** (the setting, `--debug` or `INFOPANEL_STUDIO_DEBUG=1`). The sidecar
  gets `DASHBOARD_DEBUG=1` (request and SSE log, `/api/debug/stats`).
  `src/lib/desktop-debug.ts` forwards the studio's errors, warnings and unhandled
  rejections (rate limited) with `log_frontend` and, every 30 s, sends the JS heap,
  DOM node count and open EventSources with `report_metrics`. Rust adds the memory
  of the app, the server and WebView2 plus the server stats and writes one
  `metrics.csv` line per sample; the settings page flags growing series.
