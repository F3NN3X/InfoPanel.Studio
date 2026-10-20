---
id: gauges
title: Gauges
icon: speed
related: [canvas, assets]
verified: draft
---
Edit imported image gauges, or build vector gauges that need no frames.

## Image-sequence gauges

Preview at any value with a slider or **play**. Retime frames, move, duplicate, reverse, resample or replace them, and recolour by hue, saturation and brightness.

## Vector gauges

| Part | Options |
|---|---|
| Shape | Arc, bar, liquid tank (round, rect, diamond, hexagon), grid of cells |
| Fill | Solid, gradient, zones or thresholds; theme colours follow your dashboard |
| Extras | Track, needle or marker, ticks and labels, value text, glow, rings, patterns, icons |

Start from a preset, or press **Convert to vector** on an imported gauge. Save gauges to your library to reuse them, and share them as `.gauge.json`.

## SVG templates

Use your own SVG, driven by the `--value` and `--percent` variables. Animations are kept; files up to 256 KB.

:::note
**Bake** renders a vector gauge to PNG frames for InfoPanel. It is only needed when exporting, and warns when frames are out of date.
:::
