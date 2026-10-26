---
id: widgets
title: Widgets
icon: widgets
related: [widget-settings, sensors, panels]
verified: 1.3.0-beta.28
---

Ready-made modules that read sensors and adapt to their zone.

## The widget list

:::generated widgets.table

Open **Add widget** in Design's left panel to browse them. The chips are All, Layouts, My panels, System, Hardware, Storage, Network, Media, Audio, Info, Gaming and Generic.

## Adapting to size

Most widgets pick a layout from the space they get. In **Show › Fit**, **Small zones** decides what happens when the zone is small:

- **Auto**: the widget decides.
- **Full**: always the full layout, scaled down.
- **Card**: a summary card with the key value.
- **Dense**: everything, packed tighter.

Which choices appear depends on the widget. **Density** (Auto, Roomy, Standard, Compact, Minimal) sits under **More**.

## Tint

The Weather widget can tint its surface from the current conditions. Find it in **Style › Widget colors**.

## History and analysis

Four widgets look back or give a verdict, which InfoPanel's own items can't do.

- **Bottleneck Lens** names what holds a game back: CPU-bound, GPU-bound, VRAM full, thermal throttling, power limited or balanced. The reason sits under it, for example "GPU 98 % · CPU busiest core 61 %". A new verdict has to last 5 seconds before it replaces the old one; change that under **Behaviour › Verdict**. With no game running it says Idle.
- **Frame Histogram** counts frame times over the last minute and marks the 1% and 0.1% lows. The dashed guides are 60 and 120 fps. Bars to the right of a guide are frames that missed it.
- **Session Stats** shows min, average, max and the time above a level for up to six sensors. In the studio, **Reset** in the widget's header starts the counts again.
- **Threshold Timeline** draws one lane per sensor, green, amber or red by its thresholds, over the last few minutes.

All four pick their sensors themselves, so they work when you drop them. Pick other sensors under **Data**. The history lives in the page: a reload starts it again, and nothing is saved.
