---
id: infopanel-editor
title: The InfoPanel editor
icon: dashboard_customize
related: [canvas, import, remap]
verified: 1.3.0-beta.23
---

Build profiles for InfoPanel itself: its own item kinds and sensor bindings, saved as an .infopanel file that InfoPanel imports.

Open **InfoPanel** on the rail. With no profile open, the page lists every InfoPanel profile in the dashboard, with **New InfoPanel profile…** and **Import…** above them. **Edit items** on a canvas zone opens that zone here too.

## What the page edits

Each InfoPanel profile lives in a canvas zone on a screen. The page edits that zone, so every change is one step in the studio's undo history and saves with the dashboard. A canvas in the Library is a saved copy: **Edit canvas** opens the zone made from it, or places it as a new screen first. Editing the zone never changes the Library copy.

## A new profile

**New InfoPanel profile…** asks for a name and a size: 480 × 320, 800 × 480, 1024 × 600, 1280 × 480, 1920 × 480, 1920 × 1080, or **Custom**. It comes in as a new screen and opens here, with a near black background and white Segoe UI text. You'll also find it in Design's **Add** list under Layouts, in the Import window, in the Library and in the command palette.

## The page

- **Add**, on the left: InfoPanel's 14 item kinds in four groups, Text, Data, Media and Layout.
- **Layers**, below it: the item tree, with a lock and a visibility checkbox on each row.
- The canvas, in the middle, with the toolbar above it. See [Editing a canvas](canvas) for selecting, moving and the toolbar.
- The inspector, on the right. With nothing selected it shows the profile's settings.

## Adding items

Each new item gets InfoPanel's own defaults. Text, Value, Clock and Calendar take the profile's font, size and colour. It goes where InfoPanel puts it: into the selected group, or the group of the selected item, unless that group is locked; otherwise on top of everything. The new item is selected and centred on the canvas.

| Add | InfoPanel item | Then |
|---|---|---|
| Value, Bar, Graph, Donut, Gauge | Sensor and chart items | Choose its sensor |
| Table, Web image | TableSensor, HttpImage | Choose a plugin sensor |
| Image | Image | Choose an image |
| Sensor image | SensorImage | Choose an image, then its sensor |

A gauge needs frames to draw in InfoPanel: press **Edit gauge…** in its inspector to build them.

## Choosing a sensor

The sensor picker lists the Data API's live sensors by source and device. Search by name, key or value. Choosing one sets InfoPanel's own binding on the item, so the exported file reads the same sensor. **Choose sensor…** in an item's inspector changes it later, and the line under it shows what InfoPanel reads.

If your InfoPanel build doesn't report sensor ids, a choice binds the preview only. The picker and the inspector say "Not exportable to InfoPanel".

## Profile settings

Name, width and height, background, font, font size, text colour, font scale, **Show FPS**, **OpenGL**, and the web view: **Show a web page**, its URL, **Interactive**, **Disable cache**, **Refresh every (s)** and **Max FPS**. A value InfoPanel would refuse shows a message and isn't stored. Changing the size keeps every item where it is.

## Exporting

Export the zone as an .infopanel file from **Export & back up**. A remap choice changes the item's InfoPanel binding too, so the file carries the sensor you chose.
