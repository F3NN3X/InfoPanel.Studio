# InfoPanel profile format and rendering — reference

Source: `E:\GitHub\PublicRepos\infopanel` at `d3fe32c` (paths relative to `InfoPanel/`). Sample:
`G:\win_user-folders\Downloads\infopanel-profiles\ARCv2_WIDE-1792152340`. V = verified by reading code or sample,
I = inferred. Compiled 2026-10-16 from a read-only source sweep; not yet checked against rendered pixels.

## Top surprises

1. **Group X/Y/Rotation are ignored when rendering.** Children draw at their own absolute X/Y with no offset
   (`Drawing/PanelDraw.cs:192-199`). Groups only matter for Hidden (hides the subtree) and for order. V
2. **`Wrap` is inverted:** `MaxLines = wrap ? 1 : null` (`Drawing/SkiaGraphics.cs:258`). Wrap=true (the default)
   gives one line, with an ellipsis when Width>0. Wrap=false wraps to several lines at Width. V
3. **`FontStyle` overrides Bold/Italic.** When it is non-empty, the face is found by its exact style name, else
   `SKTypeface.CreateDefault()` (`SkiaGraphics.cs:309-328`). V
4. **`Uppercase` applies only to Clock and Calendar** (`Models/TextDisplayItem.cs:238,275`). V
5. **A static TextDisplayItem's text is its `<Name>`** (`TextDisplayItem.cs:169`). V
6. **Font px = `FontSize * Profile.FontScale`** (default 1.33; `SkiaGraphics.cs:274`). The profile's Font, FontSize
   and Color are defaults for new items only. V
7. **Text is anchored top-left.** RichTextKit `TextBlock.Paint(canvas,(x,y))` paints from the block top
   (`SkiaGraphics.cs:291`). With RightAlign and Width==0, x shifts left by the measured width. V
8. **Colors are `#AARRGGBB`** (`#ARGB` for the 4-digit form). Convert to CSS `#RRGGBBAA`. V
9. **The bar gradient** runs horizontally over the filled rect only, even on vertical bars, and never fully reaches
   GradientColor (see Gradients below). V
10. **Gauge frame index** is `round_half_even((v-min)/(max-min)*(N-1))`, clamped
    (`Models/GaugeDisplayItem.cs:286-290`). It uses ValueNow only. V
11. **Graph history is not stored in the file;** it comes from a runtime ring buffer (`Drawing/GraphDraw.cs:25-27,142-148`). V
12. **Sensor ids are machine-specific and no values are stored.** The sample has HwInfo 0, Libre 41, Plugin 43. V
13. **The shape gradient angle animates.** `GradientAnimationSpeed` defaults to 300 deg/s, and the base angle is not
    added (`Models/ShapeDisplayItem.cs:92-117`). Speed 0 gives the static angle. V
14. **Image Width/Height of 0** fall back to the intrinsic size, per axis. There is no aspect fit and no opacity,
    and Scale% is applied after. V
15. **The fonts are not in the archive.** The sample uses Barlow and Roboto Mono. V

## 1. Export / import

- **Container:** a plain ZIP. Export is `Models/SharedModel.cs:1007-1065`, import is `:861-1001`.
  - File name: `{Name_with_underscores}-{unixSeconds}.infopanel`.
  - The open dialog also accepts `.sensorpanel` and `.rslcd`. Those have separate importers
    (`SharedModel.SensorPanelImport.cs`, not read).
- **Entries.** Names are matched case-insensitively.

  | Entry | Content |
  |---|---|
  | `Profile.xml` | XmlSerializer output of a Profile copy with a new Guid |
  | `DisplayItems.xml` | Byte copy of `%LOCALAPPDATA%/InfoPanel/profiles/{guid}.xml`; root `<ArrayOfDisplayItem>` |
  | `assets/<file>` | Flat copy of `assets/{guid}/`. The name may be `assets\x.png`; the importer accepts both separators (`:877`) |

- **No path rewriting.** The XML stores `FilePath` plus `RelativePath=true`. Resolution is in
  `Models/ImageDisplayItem.cs:107-137`:
  - FILE with RelativePath resolves to `assets/{FilePath}`.
  - An absolute FILE path is not exported, so that image is missing.
  - URL resolves to `HttpUrl`, RTSP to `RtspUrl`.
- **Media:** jpg, jpeg, png, svg, gif and webp (animated); mp4, mkv, webm, avi and mov via FFmpeg; m3u/m3u8; rtsp(s).
- **Import:** only the 1.4.x format is accepted.
  - Assigns a new Guid and prefixes the name with "[Import] ".
  - HWiNFO items are remapped by SensorName when their id tuple is missing. Libre and Plugin ids are not remapped.
- **Profile.xml** (`Models/Profile.cs`):

  | Element | Default | Meaning |
  |---|---|---|
  | Width, Height | 600, 400 | Canvas px (`new SKBitmap(W,H)`) |
  | BackgroundColor | #FFFFFFFF | `canvas.Clear`; alpha honoured |
  | FontScale | 1.33 | Multiplies every text FontSize |
  | Font, FontSize, Color | system, 26, #FF000000 | Defaults for new items only |
  | WebViewEnabled/Url/... | false | When enabled, shows a WebView2 page instead of items |
  | Drag, Active, Topmost, WindowX/Y, Resize, StrictWindowMatching, OpenGL, ShowFps, IsSelected, Guid | | Window or UI state; not render-relevant |

## 2. DisplayItem classes

**Serialization:**
- XmlSerializer over `List<DisplayItem>`, with polymorphism through `xsi:type`.
- 14 types: Group, Bar, Graph, Donut, TableSensor, Sensor, Clock, Calendar, Text, SensorImage, Image, HttpImage,
  Gauge, Shape.
- Gauge frames are plain `<ImageDisplayItem>` elements.
- Enums serialize by name. `<_valueType>` duplicates `ValueType`.
- A missing element takes the C# default.
- Setters: colors auto-prefix `#`. FontSize<=0, chart Width/Height<=0, Thickness<=0 and Step<=0 are rejected.

**Order:** the list is drawn in order, so index 0 is at the bottom. Hidden skips the item, or the subtree for a
group. Rotation is in int degrees, clockwise.

**Base:** Name ("DisplayItem"), Hidden (false), X and Y (100, top-left px, may be negative), IsLocked, Rotation (0;
Donut 90).

### Text (`Models/TextDisplayItem.cs:10-209`)

| Element | Default | Meaning |
|---|---|---|
| Font | first installed family | |
| FontStyle | "" | Style name; overrides Bold/Italic |
| FontSize | 20 | px = FontSize*FontScale |
| Bold, Italic, Underline, Strikeout | false | |
| Color | #000000 | |
| RightAlign | false | Width 0: right edge at X. Width>0: right-aligned in [X, X+Width] |
| CenterAlign | false | Only when Width>0; wins over RightAlign |
| Uppercase | false | Clock and Calendar only |
| Wrap | true | Inverted (see surprise 2) |
| Ellipsis | true | |
| Width | 0 | 0 = auto; otherwise max width in raw px |
| Height | 0 | Rotation pivot and marquee clip only |
| Marquee, MarqueeSpeed, MarqueeSpacing | false, 50, 40 | Scrolls only if Width>0 and the text overflows |
| GlowEnabled, GlowRadius, GlowColor, GlowBlendMode | false, 8 (2..20), #000000, SrcOver | |

- **Clock:** Format (`hh:mm:ss tt`), rendered with `DateTime.Now.ToString(Format)`.
- **Calendar:** Format (`dd/MM/yyyy`), rendered from `DateTime.Today`.
- Both use .NET date formats in the current culture.

### Sensor : Text (`Models/SensorDisplayItem.cs`)

| Element | Default | Meaning |
|---|---|---|
| ValueType | NOW | NOW, MIN, MAX or AVERAGE |
| Threshold1/2, Threshold1/2Color | 0, #000000 | Active if either threshold is >0. >=T2 wins, then >=T1 |
| ShowName | false | Prefix `Name + " "` in the same run |
| Unit, OverrideUnit, ShowUnit | "", false, true | Unit appended with no space |
| OverridePrecision, Precision | false, 0 | 1, 2 or 3 decimals; any other value floors to an integer |
| ShowThousandsSeparator | false | `N{decimals}`, invariant culture |
| AdditionModifier, MultiplicationModifier, DivisionToggle | 0, 1, false | false: `v*M+A`. true: `v/M+A` (`v+A` if M==0) |
| AbsoluteAddition | **true** | Math.Abs after the modifiers |

**Pipeline** (`:388-509`):
1. No reading renders `"-"`.
2. A non-empty ValueText is used verbatim, plus the unit.
3. Otherwise pick the value by ValueType, then apply the modifiers and Abs.
4. Precision:
   - OverridePrecision as in the table.
   - Otherwise by lower-case unit: `gb` gives 1 decimal; `kb/s`, `mb/s`, `mbar/min` and `mbar` give 2; `v` gives 3;
     anything else gives 0.
5. Then the thousands separator, the unit, and the name prefix.
6. Thresholds use the modified value.

Libre's average is always 0 (`Models/SensorReader.cs:31`).

### TableSensor : Text (`Models/TableSensorDisplayItem.cs`, drawn `PanelDraw.cs:801-858`)

**Fields:** PluginSensorId, MaxRows (10), ShowHeader (true), and TableFormat (`0:10|1:10|...`), where each entry is
`colIndex:widthPx`.

**Layout:**
- Row height is the measured height of "A".
- Each cell is drawn at `x+tWidth`, with `tWidth += width+10`.
- RightAlign applies to every column except the first; CenterAlign applies to all.
- With no data, the cell reads "Invalid sensor".

### Charts (`Models/ChartDisplayItem.cs`)

**Shared fields:**
- The binding fields (see Sensor binding below).
- MinValue/MaxValue (0, 100), AutoValue (false), Width/Height (400, 50).
- FlipX (mirrors the chart).
- Frame (true, 1px) and FrameColor, Background (true) and BackgroundColor (#FFFFFF), Color (#808080).

Each chart renders into its own WxH bitmap, which is drawn at (X,Y) and rotated about its center.

- **Graph:** Type (LINE or HISTOGRAM), Thickness (2), Step (4), Fill (true), FillColor (#3C888DFF).
  - The window's **oldest** sample is at the right edge (`i = 0` is the oldest of the last `size` samples), so the
    newest sits furthest left. Corrected in P0.6 from `GraphDraw.cs`; an earlier note here had it reversed.
  - LINE: `x = W - i*Step`, `y = (int)(H - (round(norm*(H-Thickness)) + Thickness/2))`. The value is clamped
    against MaxValue rather than the span, so a raised MinValue can overshoot the top. The path starts and ends
    below the bitmap, is filled, then stroked.
  - A graph with no samples draws nothing, not even its frame. Unbound HWiNFO and Libre graphs still sample 0;
    unbound plugin graphs do not.
  - HISTOGRAM: bars Thickness wide with a Step gap and a 1px outline. Height is `round(norm*(H-3))`.
- **Bar:** CornerRadius (0), Gradient (**true**), GradientColor (#3B3B3B).
  - Height>Width means vertical, filled from the bottom.
  - Fill length is `round(clamp(norm)*max(W,H))`. Nothing is drawn at value 0.
  - With Frame, the inner area is inset 1px.
- **Donut:** Thickness (10), Span (360), Rotation 90.
  - Outer radius `W/2-1`; inner radius is outer minus Thickness.
  - The arc starts at 3 o'clock and runs clockwise, sweeping `value%*Span/100`. The track covers the full Span.

### Gauge (`Models/GaugeDisplayItem.cs`)

**Fields:** binding, FlipX, MinValue/MaxValue (0, 100), Scale (100%), AnimationSpeed (0), Width/Height (0).
`<Images>` holds an ordered list of `<ImageDisplayItem>` frames, and only each frame's FilePath is used.

**Frame choice:**
- N=0 draws nothing; N=1 draws frame 0; no reading draws frame 0.
- AnimationSpeed>0 cross-fades between floor(i) and ceil(i).

**Size:** `(Width||frameW, Height||frameH) * Scale/100`, floored and stretched. Rotation is about the center.

### Image (`Models/ImageDisplayItem.cs`)

**Fields:** Type (FILE, URL or RTSP), FilePath, RelativePath, HttpUrl, RtspUrl, Cache, Scale (100), Width/Height (0
= intrinsic per axis), Layer (false), LayerColor (#77FFFFFF), ShowPanel, Volume.

**Drawing:**
- Size is `(W||imgW, H||imgH)*Scale/100`, truncated to int, then floored. It is drawn stretched with linear
  filtering.
- Layer draws a solid rect over the dest rect, not masked by the image's alpha.
- An SVG rotates about `(x+w/2, y+w/2)`, a latent bug for non-square SVGs.
- A missing image draws a #FAFAFA placeholder.

**HttpImage:** binding fields. The URL is the sensor's text value; the stored `HttpUrl` is only the last value
seen. `plugin-image://{pluginId}/{imageId}` points at a plugin image.

**SensorImage:** binding plus Threshold1/2 (0, 100). It is drawn only when T1 <= value <= T2.

### Shape (`Models/ShapeDisplayItem.cs`, drawn `PanelDraw.cs:397-636`)

| Element | Default | Meaning |
|---|---|---|
| Type | Rectangle | Rectangle, Capsule, Trapezoid, Parallelogram, Ellipse, Triangle, Pentagon, Hexagon, Octagon, Star, Plus, Arrow |
| Width, Height | 100, 100 | |
| CornerRadius | 25 | Capsule only |
| ShowFrame, FrameThickness, FrameColor | true, 5, #FFFF0000 | Stroke centered on the edge |
| ShowFill, FillColor | true, #FFFF0000 | |
| ShowGradient, GradientColor, GradientColor2 | true, #FF00FF00, #FF0000FF | Stops 2 and 3; stop 1 is the fill or frame color |
| GradientType | Linear | Linear, Sweep, Radial, Diamond, Reflected, Spiral |
| GradientAngle, GradientAnimationSpeed | 0, 300 | See surprise 13 |

**Geometry:**
- Polygon vertex i is at `i*360/n - 90` degrees.
- Star: 10 points, alternating radius 1 and 0.382.
- Trapezoid: top inset 0.2w. Parallelogram: skew 0.25w.
- Plus: arm thickness `min(w,h)/3`.
- Arrow: head 0.4h, shaft from 0.25w to 0.75w.

### Group

`<DisplayItems>` holds the children. A group has base fields only, with no transform.

### Sensor binding XML

```xml
<SensorName>GPU Memory</SensorName>
<SensorType>Libre</SensorType>            <!-- HwInfo | Libre | Plugin -->
<HwInfoRemoteIndex>-1</HwInfoRemoteIndex>
<Id>0</Id><Instance>0</Instance><EntryId>0</EntryId>
<LibreSensorId>/gpu-nvidia/0/load/3</LibreSensorId>
<PluginSensorId />
```

| Type | Key and source |
|---|---|
| HwInfo | `(RemoteIndex, Id, Instance, EntryId)` into HWiNFO shared memory, with now/min/max/avg |
| Libre | `ISensor.Identifier`, e.g. `/gpu-nvidia/0/load/3`. Polled every 2 s. May be URL-encoded (`/nic/%7B...%7D/throughput/7`) |
| Plugin | `/{pluginId}/{containerId}/{entryId}`, or `/{pluginId}/{entryId}`. A reading is numeric, text or a table |

Libre units: Voltage V, Current A, Clock MHz, Temperature °C, Load %, Fan RPM, Flow L/h, Control %, Level %, Power W,
Data GB, Frequency Hz, Energy mWh, Noise dBA, Humidity %, Throughput KB/s.

## 3. Rendering semantics

- **Origin:** top-left, 1 unit = 1 px, positions `floor(X)`. Document order is the z-order.
- **Text:**
  - RichTextKit block top at (x,y); size is `FontSize*FontScale` px.
  - MaxWidth is Width (when >0); MaxLines is 1 when Wrap.
  - The first baseline is about `y + Leading/2 + |Ascent|` (I). On a canvas, use an alphabetic baseline at
    `y + fontBoundingBoxAscent`.
  - Rotation pivot: the box center if W and H are both >0, else the measured center. For right-aligned text the
    un-shifted x is used.
  - Glow: a blurred copy (sigma = GlowRadius) under the sharp text.
- **Rotation pivots:**
  - Image, Gauge and Chart: the dest-rect center.
  - Shape: `(x+w/2, y+h/2)`.
  - FlipX is `scale(-1,1)` about the center, applied before rotation.
- **Gradients** (`SkiaGraphics.cs:606-776`):
  - Linear: `a = (90-angle)` degrees, a line through the center with half-length diag/2, stops
    `[c1 0, c2 0.5, c3 1]`.
  - Bar fill: `FillPath(path, Color, Color, GradientColor)` at angle 90.
- **Fonts:**
  - Skia family lookup is accepted only if the returned family matches the requested one and is not "Segoe UI".
  - Fallbacks: the name with style words stripped, then the first family that shares a name word, then Arial.
- **DPI:** none. FontScale (96/72) is the only factor.

## 4. Runtime state a re-render must supply

- Sensor values: numeric, text, table rows and plugin images.
- Clock and calendar `now`.
- Graph history.
- Bar and donut smoothing (skipped in preview).
- Shape gradient time, marquee time and gauge smoothing.

## 5. Sample statistics

**Types:** 112 items, excluding gauge frames.

| Type | Count |
|---|---|
| Sensor | 51 |
| Bar | 17 |
| Group | 9 |
| Text | 9 |
| Gauge | 7 |
| Image | 6 |
| HttpImage | 5 |
| Table | 3 |
| Shape | 2 |
| Clock | 1 |
| Calendar | 1 |
| Graph | 1 |

**Bindings:** HwInfo 0, Libre 41, Plugin 43.

**Libre ids:**
- `/gpu-nvidia/0/{load/0,load/3,temperature/0,temperature/3,power/0,fan/1..3}`
- `/amdcpu/0/{load/0,power/0,temperature/2}`
- `/lpc/nct6701d/0/fan/{1,3,6}`
- `/ram/data/{0,1}`, `/ram/load/0`
- `/memory/dimm/1/temperature/1`
- `/nic/%7B187C...%7D/throughput/{7,8}`

**Plugin ids:**
- `/InfoPanel.RTSS/rtss/{fps,1% low fps,current frame time,windowtitle}`
- `/system-info-plugin/uptime/formatted`
- `/drive-info-plugin/{c..g}/{name,free_space,used_space}`
- `/spotify-plugin/spotify/{cover-art,track-progress,remaining-time,elapsed-time,artist,current-track}`
- `/InfoPanel.SteamAPI/SteamAPI-{Profile,Session,Social,News}/*`
- `/yr-weather-plugin/brevik[-norway]/{temp,wind_speed,weather_desc,weather_icon_url,forecast,last_refreshed}`

Ids contain spaces and `%`, so treat them as opaque.

**Assets:** about 195 PNGs.
- Gauge frames: `Donut_000NN.png` (fans, Max 3000, Scale 100-120) and `spg_000NN.png` (Spotify progress, 100
  frames).
- Backgrounds: `GPU-bg.png` and `SPOTIFY.png`.
- `arc-mono-ref.png` is a hidden reference overlay, and the group "DRIVE DATA" is hidden.
- Group X/Y values are junk (FANS Y=-318, SPOTIFY Y=-1480).

## 6. Not verified

- RichTextKit line metrics come from upstream master, not the pinned 0.4.167.
- The asset entry separator in the real zip (only the extracted folder was available).
- The donut start angle (not in the sample).
- The `.sensorpanel` and `.rslcd` importers.
- No pixel comparison against the running app.
