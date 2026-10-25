---
id: gauges
title: Gauges
icon: speed
related: [canvas, assets, library]
verified: 1.3.0-beta.27
---

Browse, edit and build gauges: vector gauges that need no frames, image sequences and SVG templates.

## The Gauges view

Open **Gauges** on the rail (your own gauges are also in Library › Gauges, and opening one there brings you here). The header has two tabs, **Gauges** and **Editor**, and the buttons **Import…** (the Import door, which takes `.gauge.json`, SVG and frames `.zip` files) and **New gauge**.

The list is in three sections: **Presets**, **In** the current screen, and **My library**. Select a gauge to see its detail pane:

- **Customise a copy** on a preset, or **Edit** on your own gauge.
- **Add to canvas**.
- **Duplicate**.
- **Export** as `.gauge.json` (or `.gauge-frames.zip` for an image sequence); **Export & back up** has a gauge row too.

## The editor

The header has **Back to Gauges**, the name, Undo and Redo, Import (the Import door, which saves the file with your gauges and opens it here), Export, **Save as new** (saves a copy named after the gauge) and **Save to library**. A **Start from** strip offers presets.

Vector gauges are built from these parts:

| Part | Options |
|---|---|
| Shape | Arc, Bar, Liquid (Round, Rect, Diamond, Hex), Grid, SVG |
| Fill | Solid, Gradient, Zones or Thresholds; "Follow the theme" colors |
| Parts | Track, Needle, Marker, Ticks, Labels, Value text, Title, Background, Face, Rings, Pattern, Icon row, Centre icon, Glow, Shadow, and Wave, Shine and Bubbles for liquid |

**Face** (arc only) is a disc inside the ring with a repeating pattern: Hex, Dots, Grid or Carbon, with its own colour, opacity and cell size, and an optional disc colour. It is drawn once under the arc, so the arc moving over it costs nothing extra. It is baked into the frames when you export for InfoPanel.

## SVG templates

Use your own SVG, driven by the CSS variables `--value` (0 to 1) and `--percent` (0 to 100). Files can be up to 256 KB; scripts and links outside the file are removed.

## Image sequences

Preview at any value with a slider or play. Set **Frames per second**, **Recolour** by hue, saturation and brightness, or press **Convert to vector**. Frame tools: Reverse, Resample…, Duplicate, Replace… and Remove.

## Baking for InfoPanel

The bake bar reads "InfoPanel export" with a state: Frames baked, Frames out of date or No frames baked yet. **Bake frames** renders a vector gauge to PNG frames for InfoPanel. It is only needed when exporting to InfoPanel.

Right-click a gauge card for **Open in editor**, **Add to canvas**, **Duplicate** and **Export**. Your own gauges also get **Rename** and **Delete from library…**, and `Delete` on a selected card does the same. Built-in presets can't be renamed or deleted.
