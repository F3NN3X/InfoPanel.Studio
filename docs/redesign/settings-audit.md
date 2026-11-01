# Widget settings audit: general style and each widget's own

November 2026, over all 69 registered widgets. The question: which settings are general (the same on every widget)
and which are a widget's own, and is each one filed where people look for it?

## The rule

- **Style** holds the general sections (Skin, Colors, Typography, Shape & spacing, Surface & effects, Border & glow,
  Advanced) plus a widget's own **colours**: its colour rows, which follow the theme palette through their `role`, and
  the few rows that choose how its colours work (a ramp, a tint, a gradient).
- Everything else that is a widget's own goes to **Show** (what it draws and how), **Data** (its sources) or
  **Behaviour** (how it reacts), in the widget's own sections.

A widget's own row with `tab: "style"` lands in Style › Widget colors (shown as Colors), so that flag is only for the
rows above. `tests/widgets/registry/refile-audit.test.ts` fails on any other own row filed there; the colour choices it
allows are named in the test.

Moving a widget's own row between tabs moves no stored value: copy and paste style, saved Styles and the theme only
read the general keys (`PROFILE_STYLE_KEYS`, `SECTION_KEYS`), so no config migration is needed.

## Method

Every widget's settings run through the inspector's own filing (`categorize`, `tabOf`): 479 rows are a widget's own
(not a general key). 78 of them were in Style, in 27 widgets. The rest of the own rows were checked for general style
concepts filed under Show (size, radius, colour, font, gap, opacity…): none duplicate a general setting.

The Widget QA page (`?widget-qa`) lists each widget's settings the same way, by tab and section, own rows bright and
general ones dim, so this stays checkable as widgets change.

## What stays in Style

49 colour rows:

| Widget | Colours |
|---|---|
| System Overview | CPU, GPU, RAM, VRAM, Disks, Network |
| GPU Rings | Outer ring, Inner ring |
| Thermals | Fan dot |
| Disk I/O | Read, Write |
| Network Traffic | Download, Upload |
| Sensor Group | Temperature dot, Fan dot, Power dot |
| Now Playing | Color 1, Color 2, Color 3, Peak cap |
| Audio Meter | Level, Hot level |
| Volume Mixer | Level |
| Meter Bridge | Level, Clip level |
| Visualizer | Color 1, Color 2, Color 3, Peak cap |
| Wave Link | Level, Live indicator, Muted / offline |
| FPS Monitor | Ring, Trend sparkline |
| Playtime Share | Slice 1 to 6 |
| Steam Friends | In-game, Online, Away, Busy, Offline |
| Bluetooth | Battery medium, Battery low |
| On-Air Beacon | Live, Recording |

12 colour choices: System Overview's One accent for every section and Thread heat ramp, CPU Monitor's Heatmap ramp,
Core Heatmap's Color ramp, Drive Space's Neutral below thresholds, Weather's Tint from conditions, Now Playing's Tint
from cover art, Now Playing's and Visualizer's Visualizer colors and Gradient, and Stream Chat's Name colours.

## What moved

17 rows that are a widget's own look or content, not its colours:

| Widget | Rows | From | To |
|---|---|---|---|
| Stream Deck | Key gap, Key corner radius, Key style, Frame, Icon overlay, Overlay strength, Pressed effect | Style › Colors | Show › Key look (Keys keeps titles and their size) |
| Now Playing | Blurred cover behind | Style › Colors | Show › Player |
| Now Playing | Opacity, Glow (visualizer) | Style › Colors | Show › Visualizer, behind More |
| Visualizer | Opacity, Glow | Style › Colors | Show › Spectrum, behind More |
| Stream Mixer, Audio Fader | Fader | Style › Colors | Show › Fader |
| Game Spotlight | Scrim darkness | Style › Colors | Show › Layout |
| Steam Game | Scrim darkness | Style › Colors | Show › Artwork |
| Stream Chat | Text size | Style › Colors | Show › Messages |

The visualiser's opacity and glow now come with its shape and gap (`vizShapeSettings`), so both visualiser widgets
file them together.

## Renamed

Audio Meter's and Wave Link's own **Meter style** (LED, VU, ring… and solid, segmented, gradient) became **Meter
type**: the general Style › Skin › Meter style is a different setting with different options, and the two shared a
name.
