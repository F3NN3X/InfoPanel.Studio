# InfoPanel Studio — widgets, panels, layouts & presets

As of 2026-10-12. The current building blocks of the dashboard and studio, as reference for the redesign.

## At a glance

```
Dashboard config        theme, global style, page background, fonts;
   │                    presets: appearance, style, saved panels
   ▼
Profile                 one per display size: size, grid cols × rows, Fill or Scroll,
   │                    gap, padding, own theme / style / background
   ▼
Zone                    a box on the grid (column, row, width, height in cells);
   │                    holds one widget, a panel, or is blank
   ├──► Widget          16 kinds; reads sensors from the Data API;
   │                    general settings + its own categories
   └──► Panel           Stack, Grid or Overlay layout; own card, gap, padding, CSS
           └──► Panel widgets   10 kinds: stat, value, bar, gauge, sparkline,
                                table, text, image, clock, shape
```

Looks are set at every level above a widget and resolve downward; a zone can also stay blank until a widget is picked.

## Widgets

There are 16 widgets (modules). Each claims sensor keys from InfoPanel's Data API by prefix, renders inside a zone on the grid, and has the shared general settings plus its own categories. Sizes are the minimum zone size in grid cells.

| Widget | Min | Data source | Own setting categories (examples) |
| --- | --- | --- | --- |
| System (modern) | 2×1 | system.cpu / system.ram, LibreHardwareMonitor | Devices (CPU/GPU/RAM/Disk, names, temps, power) · CPU (cores, heatmap/bars) · GPU (VRAM, clock, hotspot, fans) · Memory · Drives (temp, I/O, life) · Trends (sparklines) · Thresholds · Units & labels · Device colors |
| Spotify (modern) | 2×1 | Spotify plugin + audio level meter | Now playing (times, progress) · Cover art (tint, blurred background) · Waveform · Visualizer · Waveform shape · Audio source (live capture) |
| Media (modern) | 2×1 | Media plugin + audio level meter | Same categories as Spotify |
| Steam (modern) | 2×1 | Steam API plugin | Content (dim banner, stats, news) |
| Hardware (modern) | 2×1 | LibreHardwareMonitor / HWiNFO | Content (list or temp gauges, rows, fans) · Dot colors |
| Weather (modern) | 3×1 | yr weather plugin | Display (full/now/forecast/minimal, tint) · Current conditions · Forecast (days) |
| FPS (modern) | 2×1 | RTSS / FPS plugin | Content (gauge or trend, metrics, sparkline) · Gauge colors |
| Audio (modern) | 2×1 | Audio level meter | Content (device, meter/volume view) · Meter (solid/segmented/gradient, orientation, ballistics, colors) |
| Wave Link (modern) | 2×1 | Wave Link plugin (100 ms stream) | Content (meters to show, dB readout, fader, mixes) · Meter |
| Bluetooth (modern) | 2×1 | Bluetooth battery plugin | Content (full/devices/status) · Battery colors |
| Network (modern) | 2×1 | Ethernet sensors | Content (speeds or totals, sparkline) · Speed colors |
| Departures | 2×1 | VBZ plugin | Content (status) |
| Notifications | 2×1 | Notifications plugin | Content (history, max lines) |
| Text File | 2×1 | Text file plugin | Content (meta) |
| Stream Deck | 3×2 | Stream Deck plugin | Content (profile, labels) |
| Web Page | 4×2 | none (a URL in an iframe) | Page (URL); reduced style options |
| Other sensors | 4×2 | any key no widget claims | none; one generic card per sensor |

- **Adaptive layout:** the modern media, audio, Bluetooth and hardware widgets pick compact, simple, card or standard from their measured size; the Layout setting can force one.
- **Hide when idle:** removed; a widget with no data at all is still hidden in the kiosk.
- **Tint:** Spotify, Media and Weather can tint their surface from the cover art or the conditions; Steam uses its banner.
- **Add drawer chips:** All, Layouts, My panels, System, Media, Network, Info, Other.

## Panels

A panel is a zone that holds its own small widgets, laid out as a Stack, a Grid or an Overlay. It fills its zone by default (Fill) or shrinks to its content (Hug). Gap and padding are 0–200 px or auto.

| Layout | How it places widgets | Options |
| --- | --- | --- |
| Stack | A flex row or column | Direction, wrap (on by default), one 3×3 alignment picker (along: start/center/end/spread; across: start/center/end/stretch) |
| Grid | CSS grid cells | Columns 1–12, column sizes (1fr / auto / px), row sizes, 3×3 cell alignment; per widget: column/row span and start |
| Overlay | One image fills the panel; widgets sit in Top / Middle / Bottom bands over it | Dark scrim on/off, band alignment (start/center/end/spread), bottom band columns 1–12; title floats top-right |

**Panel widget kinds** (10):

| Kind | What it shows | Kind-specific fields |
| --- | --- | --- |
| stat | Label over a big number | sub sensor, decimals, scale, font size, align |
| value | Compact inline readout | sub sensor, decimals, scale, font size, align |
| bar | Label, value and a fill bar | decimals, scale, max, inverted |
| gauge | Circular ring with the value | decimals, scale, max, inverted, ring size |
| sparkline | Rolling mini line graph | decimals, scale, history (5–200) |
| table | Rows from a multi-line sensor | rows, columns, header, align, font size |
| text | Static or sensor-bound text | text, align, font size |
| image | Picture from a URL or sensor | height, use as panel background |
| clock | Live time and/or date | time/date/both, align, font size |
| shape | Decorative bar, rectangle or circle | vbar/hbar/rect/circle, thickness |

Every panel widget also has label, sensor, unit, color, size and placement (Hug/Fill/Fixed in a stack; cell span in a grid; band in an overlay), class names and custom CSS. Change kind keeps the shared fields.

**Editing:** Visual mode shows the Panel, Layout, Background (Overlay only) and Widgets cards, then the selected widget's cards. Code mode edits the panel as JSON in one wide card (Apply or Ctrl+Enter, one undo step). The Widgets list supports drag reorder, hide, duplicate, copy/paste, change kind and delete.

**CSS hooks:** `.wp-panel[data-panel-layout]`, `.wp-widget--{kind}[data-widget-id]`, parts such as `.wp-label`, `.wp-value`, `.wp-unit`, `.wp-bar-fill`, `.wp-gauge`, `.wp-clock-time`, and variables `--panel-gap`, `--panel-pad`, `--panel-direction`, `--wp-accent`, `--wp-fg`, `--wp-radius`. Panel CSS is scoped to the zone and widget CSS to its cell (`@scope`, `:scope` = root).

## Layouts & presets

Five kinds of reusable starting points exist: profiles (whole pages), panel presets and layout starters (one panel each), saved panels (the user's own), and style and appearance presets (looks only).

**Profiles** are pages with a design size, a uniform grid (cols × rows), a fit mode (Fill: the grid fills the height; Scroll: 120 px rows and the page scrolls), gap (default 12 px) and padding. Auto picks the profile closest to the window size. A new profile gets 6 or 12 columns and 4 or 6 rows depending on its size.

| Shipped profile | Size | Grid | Fit | Contents |
| --- | --- | --- | --- | --- |
| Sample 1920×550 | 1920×550 | 12×6 | fill | Spotify + 7 panels (FPS rings, Network, Clock, Last played overlay, Weather, GPU/RAM, Session) |
| ARCv2 | 1920×550 | 12×6 | fill | 10 panels recreating an InfoPanel export, with bundled art |
| Main display | 1920×1080 | 12×10 | scroll | 13 widget zones |
| Kiosk strip 1920×550 | 1920×550 | 12×2 | fill | 6 widgets, 2×2 each |
| Small 1024×600 | 1024×600 | 6×4 | scroll | 7 widgets + Other sensors |

**Panel presets** (built in; several are bound to the author's sensors, so treat them as samples): Blank panel 2×1, System 4×2, RAM 2×2, CPU 2×2, GPU 3×2, FPS gauges 3×2, Steam 3×2, Weather 4×2, Network 2×2, Clock 1×1.

**Layout starters** (sensor-free; widgets ask for a sensor):

| Starter | Size | Builds |
| --- | --- | --- |
| Row of stats | 4×1 | Row stack, spread, 3 stats |
| 2×2 stats | 3×2 | 2-column grid, 4 stats |
| Hero overlay | 4×2 | Image background, title top, big stat middle, 2 values bottom |
| Gauge row | 4×1 | Row stack, 3 gauges |
| Clock + date | 2×1 | Centered column, time over date, no card |
| Label / value list | 2×2 | 2-column grid of label + right-aligned value |

**Saved panels (My panels):** any panel saved from its "…" menu, with its look and size; shared by all profiles and exported with the config. Each use is a fresh copy.

**Style presets:** a widget's look keys only (surface, accent, typography, spacing, border, effects, custom CSS), saved and applied per widget; the same menu copies, pastes or uses a style as the global one.

| Appearance preset | Theme | Radius (rem) | Look | Background |
| --- | --- | --- | --- | --- |
| Dark | zinc | 0.5 | matte dark cards | — |
| Light | paper | 0.75 | theme cards | — |
| Glass | zinc | 0.75 | glass, 60 % opacity, 16 px blur, 1 px light border | aurora image, dim 20 |
| Frosted | zinc | 1 | glass, 40 % opacity, 24 px blur, soft glow | aurora image, dim 35 |
| Matte | neutral | 0.75 | matte dark, 12 px radius | — |
| Neon | slate | 0.5 | matte dark, cyan accent, strong glow, mono font | — |
| Minimal | zinc | 0.5 | no card or border, 8 px padding | — |
| Ocean | ocean | 0.75 | theme cards | — |
| Forest | forest | 0.75 | theme cards | — |

An appearance preset applies to All profiles or This profile in one undo step. Its background only lands where none is set unless "Replace the page background" is ticked. Users can save the current look as their own preset.

## Styling model

A widget's look is resolved in four layers, lowest first; content settings (sensors, views, labels) always come from the widget itself.

1. Widget default
2. Dashboard style (All profiles)
3. Profile style (This profile)
4. The widget's own look settings

- **Follow global / Custom:** a widget set to Follow ignores its own look values (they stay stored); Custom lets them win key by key.
- **Force global style:** makes every widget follow; set for the dashboard or per profile (Inherit / On / Off). It also overrides panel widgets' own colors (fills take the accent).
- **Setting dots:** each row shows where its value comes from — default, set here, dashboard, profile or overriding — and hovering a set dot resets it.

| Surface | Look |
| --- | --- |
| Glass (default for modern widgets) | Translucent dark gradient, white text, emerald fill |
| Matte (light) | Solid light grey card, dark text |
| Matte (dark) | Solid near-black card, light text |
| Theme | Built from the theme tokens (card, foreground, primary, border); follows light or dark themes |
| None / Card / Bordered card | Panels only: transparent, half-opacity card, or card with a border ring |

Surface opacity, background blur, border width/color and glow (none/soft/strong) apply on top of any surface.

**Theme:** 19 color tokens (background, foreground, card, primary, accent, muted, border…) plus a corner radius, from 6 presets (Zinc, Neutral, Slate, Ocean, Forest, Paper light) or custom colors; a profile can inherit or set its own.

**Page background:** none, color, gradient, image or video (URL or upload), with fit (cover/contain/stretch/center/tile), position, dim, tint and blur. Video loops muted, pauses when hidden and shows only its poster on reduced motion. Set for all profiles, then per profile Inherit / Custom / None.

**General settings:** font (system, sans, rounded, serif, mono), clock 12/24 h and seconds, date locale, motion (system/reduce/full), hide the cursor in kiosk mode, and the Data API URL.

## Settings categories

Selecting a zone opens one sheet: a fixed header, then the seven general cards every zone shares, then the widget's own categories. A category list on the left jumps to a card; each card shows how many settings are changed and resets only its own.

**Header:** zone name, hide / duplicate / remove / close, the zone box (column, row, width, height in cells) and search.

| General card | Holds |
| --- | --- |
| Widget | Widget type (Change), show title, custom title, icon, visible |
| Size & alignment | Layout (auto/card/standard/compact/simple), scale with the zone, size %, 3×3 alignment |
| Typography | Text and secondary colors, font, value weight, label case |
| Spacing & shape | Inner padding, gap, corner radius, ring/bar thickness |
| Colors & surface | Follow global / Custom, style preset, surface, accent, background image, surface opacity, background blur; copy/paste/save style |
| Border & effects | Border width and color, glow and glow color, zone frame (accent, background, title header) |
| Advanced | Custom CSS |

**Then, per zone type:**

- **Widget:** its own categories from the Widgets table (e.g. System: Devices, CPU, GPU, Memory, Drives, Trends, Thresholds, Units & labels, Device colors).
- **Panel:** a Panel group (Panel with Visual/Code, Layout, Background for Overlay, Widgets list), then a Selected widget group (the widget's kind card, Display, Size & placement, Typography, Colors, Advanced).
- **Blank zone:** only Widget (Pick a widget) and the zone frame.

**Nothing selected:** the same sheet shows Appearance (scope All profiles / This profile, Force global style, Presets gallery), Global style (the general cards at dashboard or profile level), Page (Theme colors, Background), General (Type, Clock & date, Display) and Connection (Data API URL).

**Studio layout:** the inspector's placement follows the studio width: docked (a 320 px column, collapses with Ctrl+\) from 1100 px, a floating card over the canvas from 640 px, a bottom sheet below that. A quick bar over the canvas holds the pinned settings of the selection.
