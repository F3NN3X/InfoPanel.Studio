---
id: infopanel-editor
title: The InfoPanel editor
icon: dashboard_customize
related: [canvas, import, remap]
verified: 1.3.0-beta.24
---

Build profiles for InfoPanel itself: its own item kinds and sensor bindings, saved as an .infopanel file that InfoPanel imports.

Open **InfoPanel** on the rail. With no profile open, the page lists every InfoPanel profile in the dashboard, with **New InfoPanel profile…** and **Import…** above them. **Edit items** on a canvas zone opens that zone here too.

## What the page edits

Each InfoPanel profile lives in a canvas zone on a screen. The page edits that zone, so every change is one step in the studio's undo history and saves with the dashboard. A canvas in the Library is a saved copy: **Edit canvas** opens the zone made from it, or places it as a new screen first. Editing the zone never changes the Library copy.

## A new profile

**New InfoPanel profile…** asks for a name and a size: 480 × 320, 800 × 480, 1024 × 600, 1280 × 480, 1920 × 480, 1920 × 1080, or **Custom**. It comes in as a new screen and opens here, with a near black background and white Segoe UI text. You'll also find it in Design's **Add** list under Layouts, in the Import window, in the Library and in the command palette.

## The page

- **Add**, on the left: InfoPanel's 14 item kinds in four groups, Text, Data, Media and Layout, then the studio's **Elements**.
- **Layers**, below it: the item tree, with a lock and a visibility checkbox on each row.
- The canvas, in the middle, with the toolbar above it and a line of key hints below it. See [Editing a canvas](canvas) for the toolbar.
- The inspector, on the right. With nothing selected it shows the profile's settings.

## Adding items

Click a kind in **Add** to put it in the middle of the canvas, or drag it onto the canvas to put it where you drop it. A dropped item snaps like a moved one.

New items are made to suit the profile. Text, Value, Clock, Calendar and Table take the profile's font, size and colour. Bar, Graph and Donut sit on the palette's track with an Accent 1 fill and no frame. A Gauge is a ring in Accent 1. A Shape is a rounded card in the palette's Card colour. These are all InfoPanel's own settings, so the exported file looks the same in InfoPanel.

The item goes where InfoPanel puts it: into the selected group, or the group of the selected item, unless that group is locked; otherwise on top of everything. It's then selected.

| Add | InfoPanel item | Then |
|---|---|---|
| Value, Bar, Graph, Donut, Gauge | Sensor and chart items | Choose its sensor |
| Table, Web image | TableSensor, HttpImage | Choose a plugin sensor |
| Image | Image | Choose an image |
| Sensor image | SensorImage | Choose an image, then its sensor |

A new gauge is drawn by the studio. The Export window turns it into the frames InfoPanel draws; **Edit gauge…** in its inspector changes its look.

## Elements

The **Elements** group in **Add** has looks InfoPanel has no item for. Each one is still an InfoPanel item underneath, so the exported file only holds things InfoPanel reads. Its settings are in the inspector's first section, named after it.

| Element | What it is | In the .infopanel file |
|---|---|---|
| Ring | A value arc: start and sweep, thickness, track, one colour or a 2 or 3 stop gradient, round or flat ends, an end dot, ticks, LED segments, a glow | A Gauge with 101 image frames, bound to its sensor with Min and Max |
| LED bar | A bar of segments, across or down, with a gradient and a glow | A Gauge with image frames |
| Card | A rounded card: a fill or a 2 colour gradient at an angle, a 1 px stroke, a drop shadow, an outer glow | A Shape while it has only a fill, a stroke and corners; one image otherwise |
| Glow | A soft round light, for behind content | One image, see-through where the light fades |
| Divider | A 1 or 2 px line, one colour or a gradient | A Shape when it's one colour; one image otherwise |
| Icon | An icon from a searchable list, in a colour, as big as its box | One image |
| Cores | One bar per CPU core or thread, side by side or stacked | A Group of Bar items, each bound to its core |
| Sparkline | A line or area graph, with an end dot and a gradient fill | InfoPanel's Graph, without the dot and the gradient |

Ring, LED bar and Sparkline ask for a sensor when you add them. Cores finds the cores in the Data API by itself. If it can't find them, it shows placeholder bars, and its inspector says so. **Find the cores again** binds the bars once the Data API reports them. Changing a Cores setting lays its bars out again.

### Badges

Each element shows how it leaves for InfoPanel, in **Layers** (a letter) and in the inspector's header:

- **Native**: InfoPanel draws it as it is.
- **Baked**: it goes as images or gauge frames, made when you export.
- **Approximated**: it goes as the closest InfoPanel item. Hover over the badge, or look in the inspector, for what's lost.

A Card or Divider changes badge as you change it: a shadow, glow or gradient makes it Baked.

## The palette

With nothing selected, the profile settings end with the **Palette**: Accent 1, Accent 2, Accent 3, Text, Sub-text, Track, Card, Warning and Critical. New items and elements take their colours from it. In an element's settings each colour is either a palette colour or **Fixed**, with its own swatch.

Change a palette colour and everything that uses it changes too, in one undo step. Baked elements are baked again at the next export. The palette stays in the studio: the .infopanel file holds the plain colours.

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

With **Bake stale gauges and elements first** on, the Export window makes the frames and images for every gauge and element whose look changed, and shows its progress. It also lists every Approximated element with what it loses.

## What InfoPanel can't do

- **Letter spacing.** InfoPanel's text has no setting for the space between letters, so the editor doesn't offer one.
- **Font weight** comes from the font and its style, in **Font** and **Font style**. Pick a light or bold face there.
- **Value colours** for warning and critical are InfoPanel's own thresholds on a Value item.
- **Text effects** such as a gradient or a shadow on text aren't available; put a Glow or a Card behind it instead.
