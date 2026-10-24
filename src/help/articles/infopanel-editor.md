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
- The canvas, in the middle, with the toolbar above it and a line of key hints below it. See [Editing a canvas](canvas) for the toolbar.
- The inspector, on the right. With nothing selected it shows the profile's settings.

## Adding items

Click a kind in **Add** to put it in the middle of the canvas, or drag it onto the canvas to put it where you drop it. A dropped item snaps like a moved one.

New items are made to suit the profile. Text, Value, Clock, Calendar and Table take the profile's font, size and colour. Bar, Graph and Donut sit on a muted track with a blue fill and no frame. A Gauge is a blue ring. A Shape is a rounded card a little lighter than the background. These are all InfoPanel's own settings, so the exported file looks the same in InfoPanel.

The item goes where InfoPanel puts it: into the selected group, or the group of the selected item, unless that group is locked; otherwise on top of everything. It's then selected.

| Add | InfoPanel item | Then |
|---|---|---|
| Value, Bar, Graph, Donut, Gauge | Sensor and chart items | Choose its sensor |
| Table, Web image | TableSensor, HttpImage | Choose a plugin sensor |
| Image | Image | Choose an image |
| Sensor image | SensorImage | Choose an image, then its sensor |

A new gauge is drawn by the studio. The Export window turns it into the frames InfoPanel draws; **Edit gauge…** in its inspector changes its look.

## Moving and snapping

- Drag an item to move it, or drag a handle to resize it. While you drag, it snaps to the edges and middle of the canvas and to the edges and middles of the other items, and a pink line shows what it lined up with.
- Hold `Alt` while you drag to stop snapping.
- Hold `Shift` while you move to keep to one direction, or while you resize to keep the shape. A square stays square.
- The selected item shows its width and height under it.
- A locked item ignores the mouse on the canvas, so a click goes to the item below it. Select it in **Layers** to edit it.

:::keys
Arrows — Nudge 1 px
Shift+Arrows — Nudge 10 px
Alt+drag — Move or resize without snapping
Shift+drag — Move on one axis; resize keeping the shape
Ctrl+D — Duplicate
Ctrl+G — Group
Ctrl+Shift+G — Ungroup
Del — Delete
Esc — Clear the selection, then leave the editor
Ctrl+Z — Undo
Ctrl+Shift+Z / Ctrl+Y — Redo
:::

Nudging with the arrow keys never snaps. Keys don't work while you type in a field.

## Several items

Click with `Shift` or `Ctrl` to select more than one item, on the canvas or in **Layers**. Drag, nudge, **Duplicate** and **Delete** act on all of them. The inspector then has:

- **Align**: left, centre, right, top, middle or bottom of the box around them.
- **Distribute**: equal gaps across or down, for three items or more. The first and last stay where they are.
- **Shared fields**: what every selected item has, such as X, Y, font and colours. A field they differ in says "Mixed" until you set it.

Locked items stay where they are. Each of these is one step to undo.

## Live on the screen

Every edit here is saved to the dashboard a moment later, as any studio edit is, so a kiosk or desktop panel showing that screen updates by itself. A drag shows up when you let go.

## Choosing a sensor

The sensor picker lists the Data API's live sensors by source and device. Search by name, key or value. Choosing one sets InfoPanel's own binding on the item, so the exported file reads the same sensor. **Choose sensor…** in an item's inspector changes it later, and the line under it shows what InfoPanel reads.

A Table takes its plugin's column format when your InfoPanel build reports it. Otherwise it keeps InfoPanel's default, and the inspector says so.

In [Sensor remap](remap), **Reset to automatic** puts back the sensor the item came with, then matches it again.

If your InfoPanel build doesn't report sensor ids, a choice binds the preview only. The picker and the inspector say "Not exportable to InfoPanel".

## Profile settings

Name, width and height, background, font, font size, text colour, font scale, **Show FPS**, **OpenGL**, and the web view: **Show a web page**, its URL, **Interactive**, **Disable cache**, **Refresh every (s)** and **Max FPS**. A value InfoPanel would refuse shows a message and isn't stored. Changing the size keeps every item where it is.

## Exporting

Export the zone as an .infopanel file from **Export & back up**. A remap choice changes the item's InfoPanel binding too, so the file carries the sensor you chose.
