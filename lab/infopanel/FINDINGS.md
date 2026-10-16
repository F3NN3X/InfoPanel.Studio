# P0.7 findings: lab render vs InfoPanel's own

Compared 2026-10-16 on the four profiles with a screenshot of InfoPanel's render (supplied by the user, InfoPanel
1.4.x with PR #173, en-US, 100% scaling). The lab ran in **Live** mode against the same machine's Data API:
plugin bindings are portable, so the screenshots show plugin values and Unbound would not match them.

## Method

1. `npm run lab:extract` attaches each screenshot to its profile (name match allowing one typo, same size).
2. In the lab page's compare panel, the screenshot lies over the render with an opacity slider and a difference
   blend; clicking an item outlines it and lists its fields; items and groups can be hidden.
3. For the numbers below, the render was captured with Playwright (Chrome, device pixel ratio 1) and compared with
   the screenshot per item box (from the DOM): the share of pixels whose difference exceeds 40 of 255.

Sensor values, the clock and animations moved between the screenshot and the capture, so items showing them
differ by design. Those were checked by eye for position, font, size and colour instead.

## Whole canvas

| Profile | Size | Pixels off by > 40 |
|---|---|---|
| ARCv2_WIDE | 1920×550 | 4.4% |
| Catppuccin_Mocha | 1920×1280 | 0.7% |
| Dashboard | 1920×480 | 3.1% |
| Umbrella_V.2 | 515×1920 | 3.7% |

## By profile and type

Median and worst share of pixels off within the item's box. **Pass** = same position, size, font, colour and shape;
remaining pixels are explained by the cause listed.

| Profile | Type | Items | Median | Worst | Result |
|---|---|---|---|---|---|
| ARCv2_WIDE | Text | 3 | 20.8% | 26.8% | Pass. Two sit on bars whose value changed; text antialiasing (see below) |
| ARCv2_WIDE | Sensor | 31 | 12.5% | 35.3% | Pass. Live values changed (weather, fans, loads) |
| ARCv2_WIDE | TableSensor | 3 | 11.6% | 13.6% | Mismatch: Data API tables (headers, split cells), see below |
| ARCv2_WIDE | Bar | 6 | 14.1% | 17.2% | Pass. Live values changed |
| ARCv2_WIDE | Gauge | 7 | 6.9% | 8.4% | Pass. Values changed by a few frames |
| ARCv2_WIDE | Graph | 1 | 0.4% | 0.4% | Pass |
| ARCv2_WIDE | Image, HttpImage | 10 | 3.5–5.8% | 15.8% | Pass. Album art and game art from the live sensors |
| ARCv2_WIDE | Clock, Calendar | 2 | | 26.4% | Pass. Time differs |
| Catppuccin_Mocha | Text | 32 | 1.2% | 4.6% | Pass |
| Catppuccin_Mocha | Sensor | 30 | 0.3% | 4.4% | Pass (mostly unbound, "-") |
| Catppuccin_Mocha | Shape | 11 | 0.2% | 5.6% | Pass |
| Catppuccin_Mocha | Bar | 8 | 0.0% | 0.0% | Pass |
| Catppuccin_Mocha | HttpImage | 1 | 0.0% | 0.0% | Pass (the placeholder) |
| Catppuccin_Mocha | Clock, Calendar | 5 | 1.2–14.9% | 14.9% | Pass. Time differs |
| Dashboard | Text | 26 | 9.6% | 16.9% | Pass. Thin Arial: text antialiasing only, glyphs line up |
| Dashboard | Sensor | 39 | 5.2% | 32.5% | Pass. Live values changed |
| Dashboard | Shape | 13 | 3.1% | 61.6% | Pass. The worst three are fans with an animated Spiral gradient (phase) |
| Dashboard | Donut | 15 | 2.8% | 8.3% | Pass. Values changed |
| Dashboard | Graph | 6 | 5.3% | 11.7% | Pass. History length differs (see below) |
| Dashboard | Bar | 3 | 0.0% | 5.7% | Pass |
| Dashboard | Clock | 3 | 1.2% | 20.4% | Pass. Time differs |
| Umbrella_V.2 | Text | 16 | 6.1% | 14.4% | Pass. Text antialiasing over a textured background |
| Umbrella_V.2 | Sensor | 17 | 10.7% | 45.1% | Pass. Live values changed (track, loads) |
| Umbrella_V.2 | Image | 8 | 1.9% | 17.4% | Pass. The worst is an animated GIF (frame) |
| Umbrella_V.2 | Gauge | 4 | 5.3% | 5.8% | Pass |
| Umbrella_V.2 | Graph, Bar | 3 | 2.0–5.8% | 5.8% | Pass |
| Umbrella_V.2 | HttpImage | 3 | 1.7% | 18.1% | Pass. Live art |
| Umbrella_V.2 | Clock, Calendar | 2 | | 16.5% | Pass. Time differs |

Group items draw nothing themselves; their children are counted under their own types.

## Causes that remain

- **Text antialiasing.** Skia draws grayscale-antialiased text; Chrome draws ClearType (LCD) text on an opaque
  background, which leaves coloured fringes. Glyph positions and widths match. Putting text on its own transparent
  layer (which makes Chrome fall back to grayscale) made the measured difference worse (median 1.8% → 8.1%), so it
  was dropped. A dashboard on another device renders with that device's text settings anyway.
- **Data API tables.** InfoPanel's table sensors show the plugin's column names and whole cells; the Data API
  flattens a table to text (`", "` between cells, no header), so the lab shows "Column N" headers and splits cells
  holding `", "`. Fix at the source: a structured table in the Data API (P0.8).
- **Graph history.** InfoPanel's graphs hold the samples since the profile loaded; the lab's Live mode holds the
  samples since the page opened. Same drawing, different window.
- **Animations.** Spiral fans, GIFs, marquees and clocks are compared for placement only.

## Fixes made during P0.7

- The view snaps to whole device pixels: at a fractional offset, half-pixel strokes blurred and a black frame no
  longer covered the teal frame under it (Dashboard, C:\ graph).
- Earlier, from the first comparison (P0.6): one-line ellipsis by character, Segoe UI glyph fallback.
- The conic gradient layer no longer takes clicks or inflates the selection outline.
