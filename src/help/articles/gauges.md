---
id: gauges
title: Gauges
icon: speed
related: [canvas, assets, library]
verified: 1.3.0-beta.1
---

Browse, edit and build gauges: vector gauges that need no frames, image sequences and SVG templates.

## The Gauges page

Open **Gauges** on the left rail. The header has two tabs, **Gauges** and **Editor**, and the buttons **Import .gauge.json / SVG**, **Import frames (.zip)** and **New gauge**.

The list is in three sections: **Presets**, **In** the current profile, and **My library**. Select a gauge to see its detail pane:

- **Customise a copy** on a preset, or **Edit** on your own gauge.
- **Add to canvas**.
- **Duplicate**.
- **Export** as `.gauge.json` (or `.gauge-frames.zip` for an image sequence).

## The editor

The header has **Back to Gauges**, the name, Undo and Redo, Import, Export, **Save as new** (saves a copy named after the gauge) and **Save to library**. A **Start from** strip offers presets.

Vector gauges are built from these parts:

| Part | Options |
|---|---|
| Shape | Arc, Bar, Liquid (Round, Rect, Diamond, Hex), Grid, SVG |
| Fill | Solid, Gradient, Zones or Thresholds; "Follow dashboard theme" colors |
| Parts | Track, Needle, Marker, Ticks, Labels, Value text, Title, Background, Rings, Pattern, Icon row, Centre icon, Glow, Shadow, and Wave, Shine and Bubbles for liquid |

## SVG templates

Use your own SVG, driven by the CSS variables `--value` (0 to 1) and `--percent` (0 to 100). Files can be up to 256 KB; scripts and links outside the file are removed.

## Image sequences

Preview at any value with a slider or play. Set **Frames per second**, **Recolour** by hue, saturation and brightness, or press **Convert to vector**. Frame tools: Reverse, Resample…, Duplicate, Replace… and Remove.

## Baking for InfoPanel

The bake bar reads "InfoPanel export" with a state: Frames baked, Frames out of date or No frames baked yet. **Bake frames** renders a vector gauge to PNG frames for InfoPanel. It is only needed when exporting to InfoPanel.

Right-click a gauge card for **Open in editor**, **Add to canvas**, **Duplicate** and **Export**. Your own gauges also get **Rename** and **Delete from library…**, and `Delete` on a selected card does the same. Built-in presets can't be renamed or deleted.
