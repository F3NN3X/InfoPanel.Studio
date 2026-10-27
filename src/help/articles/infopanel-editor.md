---
id: infopanel-editor
title: InfoPanel profiles in Edit
icon: dashboard_customize
related: [canvas, import, remap]
verified: 1.3.0-beta.36
---

Build profiles for InfoPanel itself: its own item kinds and sensor bindings, saved as an .infopanel file that InfoPanel imports.

## Finding a profile

InfoPanel profiles are listed in [Screens](profiles#managing-screens) with your other screens, and each card has an **InfoPanel** tag. **InfoPanel** in the **Show** filter lists only them. **Import .infopanel** in the Screens toolbar brings in an .infopanel file as a new screen. **Open** on a profile's card opens it in **Edit**, the same view that edits a grid screen, with the same rail, left panel and inspector.

Profiles you saved to the [Library](library) that aren't on a screen yet are in the Library's **InfoPanel profiles**. **Edit profile** there brings one in as a new screen and opens it.

A profile's card has the same menu as any screen's. **Rename** renames the profile with the screen, in one undo step.

An .infopanel file imported onto a screen's page doesn't open a separate editor. Its items join the page as a group, at the pixels the file had them, and you edit them like any other item there (see [InfoPanel items on a page](studio#infopanel-items-on-a-page)).

## What the page edits

Each InfoPanel profile lives in a canvas zone on a screen. The page edits that zone, so every change is one step in the studio's undo history and saves with the dashboard. An InfoPanel profile in the Library is a saved copy: **Edit profile** opens the zone made from it in Edit, or places it as a new screen first. Editing the zone doesn't change the Library copy until you choose **Update in Library** (see Saving to the Library).

## A new profile

**New InfoPanel profile…** opens the same page as **New screen** on Screens, set to **InfoPanel profile**: the templates on the left, and on the right a preview of the one you picked with its **Size**, **Colours**, **Sensors** and **Name**. Press **Create profile**, or Enter, whenever it looks right; **Cancel** or Esc leaves without making anything. It comes in as a new screen and opens here. **Screen** at the top of the page, or **A screen instead**, switches it to making a screen. You'll also find the page in Edit's **Add** list under Layouts, in the Import window, in the Library and in the command palette.

The search, the shape chips, the colour dots on the cards, **Recently used** and the sizes work as they do for screens (see [Screen templates](profiles#screen-templates)). The new profile's name is the template's until you type one.

**Blank canvas**, in the row above the templates, is an empty profile at 800 × 480 with a near black background and white Segoe UI text. A template comes at the size its card shows, Meters at 1600 × 300 and Deck at 1920 × 1080, until you set a size yourself; after that, picking another template keeps your size.

**Your Library** lists your own saved profiles after Recently used, and **From your Library** in the row above jumps to them. A Library profile is copied as it is, at its own size, so **Size** goes away. Tick **Also save to Library** to keep the new profile there too; it's off unless you tick it.

When you pick a template, **Sensors** says how many of the sensors it reads were found on your PC. **Review** opens one row for each, with the sensor found. Open a row to pick another, or choose **Leave unbound**. A row that found nothing says **Not found · left unbound**; open it to choose one. Whatever is still unbound when you press **Create profile** is listed over the canvas afterwards.

## Templates

A template is a finished profile made from the editor's own items and elements, bound to your PC's sensors. Each card in the gallery shows it with made-up values, at the size written on it. Pick one, then a set of **Colours**, and **Create profile**.

| Template | Look |
|---|---|
| Graphite | Flat grey cards with one accent and rings |
| Glass | See-through cards with a soft sheen over coloured glows |
| Neon | Dark panels with glowing outlines, LED rings and bars |
| Paper | A light theme: white cards with soft shadows |
| Mono | Black, with very large thin numbers and fine lines |
| Terminal | Green on black console lines in Consolas, with LED meters |
| Clock | A large clock inside a ring of 60 segments that counts the seconds |
| Cores | One bar per CPU core or thread, under the CPU temperature |
| Deck | A second-screen dashboard of cards: CPU and GPU rings, FPS with a frame-time histogram, the clock, memory, three graphs and the network |
| Meters | A wide pill in three zones: double rings, rows with thin bars, and FPS with a line graph |
| Orbit | A pill with a load ring at each end, the temperatures and power beside them, and FPS in the middle |
| Tower | A tall card with FPS, CPU and GPU as lists of readings, each with a small graph |
| Ticker | One long pill of text: CPU, GPU, FPS and the time |
| Readout | Three instrument panels (GPU, CPU, System), each with one very large number and two meters that change colour as they fill. Colours: Mono, Glow (Mono with glowing numbers), Tint |
| Console | A strip of six readouts, CPU and GPU rings on a hex face, RAM and VRAM bars, and a tile for each drive. Colours: Ice, Ice glow (Ice with glowing numbers), Amber, Steel |
| Frost Bar | Frosted glass cards that blur the wash behind them: load rings, memory, clock, uptime, network and three temperature rings. Colours: Aurora, Smoke |
| Quota | A large clock and a list of CPU, RAM, GPU and Disk load, one thin bar each. Colours: Slate, Sand |

Deck, Meters, Orbit, Tower and Ticker come in Dark, White and Smoke, and in Float, which has no cards and puts a dark shadow behind every line of text (Deck also has Tint). They are made for their own sizes, which the Size row offers and picks for you: Deck 1920 × 1080 (it also lays out for 1920 × 480 and for upright screens), Meters 1600 × 300, Orbit 1080 × 240, Ticker 1280 × 160 and Tower 480 × 1920. At other sizes they stack their parts and still fit.

FPS needs InfoPanel's RTSS plugin and RivaTuner running. Deck, Meters, Orbit, Tower and Ticker all show FPS, and the rows for it stay unbound without RTSS, so Create lists them and **Remap** can point them at another sensor. The 0.1% low is the least certain of them. Deck's clock and date are InfoPanel's own Clock and Calendar items, and change them in the editor to put the date the other way round. Deck's graphs show about 60 seconds of history, and the performance strip about two minutes. Voltage, fan speed and the memory temperature come from LibreHardwareMonitor or HWiNFO. Nothing in these five reads the 12V rail.

Every other template is drawn for 480 × 320 and laid out again for the size you pick. A wide size, such as 1280 × 480 or 1920 × 480, puts its cards in one row. A portrait size stacks them. Anything else keeps the 480 × 320 layout, scaled up. Text, lines and gaps grow with the size.

The sensors are matched to what your PC's Data API reports: CPU and GPU load, temperature, clock and power, RAM, disk, download and upload, and uptime.

The Clock template's ring reads InfoPanel's clock plugin (Clock · Second, 0 to 59), so it needs that plugin. Without it the ring is left unbound and Remap lists it as Clock second. The ring is exported with 60 frames, one for each second. A sensor that can't be found is left unbound, and the editor opens with a line naming each one. **Remap** on that line opens [Sensor remap](remap), where you can pick a sensor for it. Close the line with **×**.

Some templates read sensors your PC may not have. Console shows FPS from RTSS (through InfoPanel's RTSS plugin), memory speed from HWiNFO, and UPS power from a UPS plugin; without them those readouts stay empty and Remap lists them. Readout and Console show a GPU hot spot, which NVIDIA cards often don't report, and Readout shows the CPU's two CCD temperatures, which only some Ryzen chips have. Console's drive tiles come from the drives in your Data API, one tile each, with placeholders if there are none. Console is drawn for 1920 × 720 and Quota for 1920 × 540; both are in the Size list. Frost Bar and Readout are drawn for 1920 × 480.

A template's colours come from the profile's palette (see The palette, below), so you can change them all in one place later. Everything in it can be moved, changed or deleted like anything you add yourself, and it exports like any profile: cards, rings and glows that InfoPanel can't draw are baked when you export.

## The page

- **Layers** and **Add**, two tabs on the left, as on a grid screen. **Add** lists InfoPanel's 14 item kinds first, in four groups, Text, Data, Media and Layout, then the studio's **Elements** and the Studio widgets (see [Add](studio#add)). **Layers** is the item tree, the top item first, with a lock, an eye and the Export check's mark on each row (see [Layers](studio#layers)). See Groups, and Studio widgets on a profile.
- The canvas, in the middle, with the page tabs and a strip of view controls above it and a line of key hints below it. See [Editing a canvas](canvas) for the strip.
- The inspector, on the right. A selected item shows **InfoPanel item** or **Element** under its name, then where it sits: **POSITION AND SIZE (PX)** with **Placed freely** for an item at its imported pixels, or **PLACE ON GRID** with **On grid** once it sits on the cells. **Snap to grid** puts it on the nearest cells and keeps it there; typing a new X or Y, or dragging it off the cells, places it freely again. Its fields follow on the **Item**, **Sensor** and **Look** tabs, then **LAYER** and its **On InfoPanel** line. With nothing selected it shows the page's settings (see Profile settings). The **Export check** pill at the right of the page tabs shows the check there instead (see The Export check).

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
| Ring | A value arc: start and sweep, thickness, track, one colour or a 2 or 3 stop gradient, round or flat ends, an end dot, ticks, LED segments, a glow, a textured face inside the ring | A Gauge with 101 image frames, bound to its sensor with Min and Max; the face is baked into them || A Gauge with 101 image frames, bound to its sensor with Min and Max |
| LED bar | A bar of segments, across or down, with a gradient and a glow, a textured face inside the ring | A Gauge with 101 image frames, bound to its sensor with Min and Max; the face is baked into them || A Gauge with image frames |
| Card | A rounded card: a fill or a 2 colour gradient at an angle, a 1 px stroke, a drop shadow, an outer glow, a background blur | A Shape while it has only a fill, a stroke and corners; one image otherwise, and with a blur one image with the blurred background baked in || A Shape while it has only a fill, a stroke and corners; one image otherwise |
| Glow | A soft round light, for behind content | One image, see-through where the light fades |
| Divider | A 1 or 2 px line, one colour or a gradient | A Shape when it's one colour; one image otherwise |
| Icon | An icon from a searchable list, in a colour, as big as its box; or your own image or SVG from My library | One image of the icon, or an Image of your file |
| Cores | One bar per CPU core or thread, side by side or stacked | A Group of Bar items, each bound to its core |
| Sparkline | A line, area or bar (histogram) graph, with a fill opacity, an end dot and a gradient fill | InfoPanel's Graph, in line or histogram mode; without the dot and the gradient |
| Row | A label, its value on the right, an optional icon and a thin bar under it, laid out for you | A Group of a Text and a Value, plus a Bar and an icon image if you turn them on |
| Rows | A list of rows with even spacing | A Group of Row groups |
| Graph stack | 2 to 4 graphs in rows, each with a label | A Group of Text and Graph items |
| Dual graph | Two series drawn over each other | A Group of two Graphs with no background |
| Double ring | An outer and an inner ring, each on its own sensor, with a value in the middle | A Group of two Gauges with image frames and a Value |
| Drives | A tile for each drive (from LibreHardwareMonitor, or HWiNFO's S.M.A.R.T. and drive devices): icon, name, used bar and percent, temperature and free space | A Group of tile Groups made of a Shape, Text, Bar and Values; the icon is an image, or an Image of your own file for a drive that has one |
| Shadow text | A Text or Value with a dark copy behind it | Two Text items, the copy offset behind the text |

Ring, LED bar and Sparkline ask for a sensor when you add them. Cores finds the cores in the Data API by itself. If it can't find them, it shows placeholder bars, and its inspector says so. **Find the cores again** binds the bars once the Data API reports them. Changing a Cores setting lays its bars out again.

Row, Rows, Graph stack, Dual graph and Double ring start with no sensors. Select a part in **Layers** to choose its sensor or change its text; the element places the parts, so moving or resizing the element moves them all. A Row's thin bar follows the sensor of its value. Drives finds your drives in the Data API (LibreHardwareMonitor's drive sensors) and binds each tile. With none found it shows three placeholder tiles, and **Find the drives again** binds them once the Data API reports them.

**Your own icons.** An Icon element's **Your image…** button picks a file from My library, or uploads one there. Drives has a row for each drive with **Your image…** and **Icon set**; **Reset** goes back to the hard drive. The file joins the profile's files, so it exports with the profile and My library won't remove it while a profile uses it. A file is drawn as it is: the icon colour doesn't tint an SVG, so pick an image that already suits the card. A wide or tall image is fitted inside the icon box, keeping its shape and centred; the exported Image is that fitted size. A drive keeps its icon when you use **Find the drives again** or the drives come back in another order. HWiNFO drives are matched by name when they have no stable id. We don't ship brand or game emblems: add your own files.

**Glow** is on every Text and Value, in its Glow section: a switch, a radius from 2 to 20 and a colour. InfoPanel draws it itself, so it exports as it looks. Row, Rows and Double ring have a **Value glow** switch that sets it on their values. The dashboard's **Number glow** (Style, Typography) is the same idea for the dashboard's own widgets.

**Face** is on Ring and Double ring (on its inner ring): a dark disc inside the ring with a repeating pattern on it, Hex, Dots, Grid or Carbon, with its own colour, opacity and cell size. InfoPanel can't draw a pattern, so the face is baked into the ring's frames when you export. The same Face is a part in the Gauges editor, so a Custom gauge on the dashboard can have one.

**Background blur** is on Card. It blurs whatever is drawn behind the card, so give the card a see-through fill. InfoPanel can't blur what is behind an item, so the export bakes the blurred background into the card's image, and the card is badged Approximated. The bake covers the profile's background colour and the images, shapes and cards under the card. Text, values and gauges behind it aren't in the baked picture, so they show sharp in InfoPanel.

**Colours by value** is in the Ring and LED bar settings, and in the Double ring for the inner ring. Each colour takes over from its percent of the range, so a frame has the colour of its value. That gives a ring that turns amber and then red as it fills. The end dot is left off while it's on, so it can't disagree with the ring.

For a rounded progress bar, a Bar's Sensor section has **Rounded gradient look**: it sets the corner radius to half the height and fills with a gradient from accent 1 to accent 2. The Bar stays a native Bar.

### Badges

Each element shows how it leaves for InfoPanel in the inspector's header:

- **Native**: InfoPanel draws it as it is.
- **Baked**: it goes as images or gauge frames, made when you export.
- **Approximated**: it goes as the closest InfoPanel item. Hover over the badge, or look in the inspector, for what's lost.

A Card or Divider changes badge as you change it: a shadow, glow or gradient makes it Baked, and a background blur makes a Card Approximated.

## Studio widgets on a profile

A profile's page can hold the studio's own widgets among its InfoPanel items. In **Add**, **Show** picks **All**, **Widgets** or **InfoPanel items**, and the search covers both. Click a widget to put it in the middle of the canvas, or drag it to where you want it. It starts at the size it would take in a grid cell, smaller if the canvas is small. A message says what it becomes on export, with **Undo** and **Change**. **Layouts** is greyed out here. A layout adds Studio panel areas, and an imported profile keeps the layout it came with from InfoPanel.

A widget is a layer like any item. It moves, resizes, snaps, groups, locks and hides the same way, and Layers shows it with its widget icon and the word *widget*. The kiosk draws it live from the Data API, and so does the canvas, whatever the **Sensors** control is set to.

Its inspector has the widget's own settings, as in a grid zone, plus **Place** (X, Y, width and height in px) and **On InfoPanel**, which says what the export makes of it:

- **Recreate**: a picture of the widget with its values put back on top as InfoPanel items, bound to the same sensors. It arrives in InfoPanel as one Group named after the widget.
- **Snapshot**: a still picture of the widget as it looks when you export.
- **Leave out**: it stays on your Studio screens and the .infopanel file doesn't have it.

A widget offers only the choices it can do, and starts on the first of them. A widget with no InfoPanel version is always left out, and says why. A Panel offers all three. Changing the choice is one undo step.

The export draws each widget itself, out of sight and in the screen's theme, so the profile exports the same from Edit, from its card in Screens or from the Library. It takes a second or two longer with widgets on the page.

## The Export check

On a screen made for InfoPanel (**Made for** › **InfoPanel too**, see [Made for](studio#made-for)), the page tabs end with an **Export check** pill, after **Made for**. It counts the parts of the profile by what they become in the .infopanel file, and it updates as you edit:

- **Exports as is**: InfoPanel reads it as it is. Elements baked into images or gauge frames count here too.
- **Approximated**: InfoPanel gets the closest item it has, without a look the studio adds.
- **Becomes a picture** and **Left out**: a Studio widget on the page, by its On InfoPanel choice, or a dashboard widget on the screen that InfoPanel can't draw. A widget this version doesn't have counts as left out, marked "Not available in this version".

Click the pill to show the check in place of the inspector, grouped by those four. Each part says what it loses, and a click on it selects it. **Export .infopanel** at the bottom opens the Export window, which lists the same parts. Esc or the pill again closes the check, and so does selecting anything.

Every part on the canvas has a small round mark in its top-right corner with its status, and **Layers** shows the same mark on each row. In the inspector, a setting that InfoPanel can't draw has an Approximated mark beside it, and the header has a line saying what happens on InfoPanel. These looks are:

- **Background blur** on a Card: baked into the card's picture, so values behind it aren't blurred.
- **Blurred shadow** on Shadow text: becomes a sharp copy.
- **Gradient fill** under a Sparkline, and its **End dot**: dropped.

A screen made for Studio panels shows none of this, whatever its pages are.

## The palette

With nothing selected, the profile settings end with the **Palette**: Accent 1, Accent 2, Accent 3, Text, Sub-text, Track, Card, Warning and Critical. New items and elements take their colours from it. In an element's settings each colour is either a palette colour or **Fixed**, with its own swatch.

Change a palette colour and everything that uses it changes too, in one undo step. Baked elements are baked again at the next export. The palette stays in the studio: the .infopanel file holds the plain colours.

## Moving and snapping

- Drag an item to move it, or drag a handle to resize it. While you drag, it snaps to the edges and middle of the canvas and to the edges and middles of the other items, and a pink line shows what it lined up with.
- Hold `Alt` while you drag to stop snapping.
- An imported profile's page has a grid of about 100 px cells, drawn as faint dashed lines. Items also snap to the cell edges. With `Alt` held, the lines fade, a hint says **Placing freely**, the readout under the item shows its X, Y, W and H, and a dashed box marks where it started.
- Studio widgets on the page sit on the cells. A dragged or resized widget goes by whole cells and never lands on another widget; with `Alt` held the hint says **Widgets always sit on the grid**. Dropped from **Add**, a widget takes the free cells under the pointer, or the nearest free ones.
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
Ctrl+Shift+S — Save the selection as a component
Del — Delete
Esc — Close the Export check, then clear the selection
Ctrl+Z — Undo
Ctrl+Shift+Z / Ctrl+Y — Redo
:::

Nudging with the arrow keys never snaps. Keys don't work while you type in a field.

On an imported profile's page the arrows go by cells instead:

:::keys
Arrows — Move one cell's width or height
Shift+Arrows — Make it a cell wider, narrower, taller or shorter
Alt+Arrows — Nudge 1 px (a widget moves one cell)
Alt+Shift+Arrows — Nudge 10 px
Ctrl+] / Ctrl+[ — Bring forward / send backward
:::

## Groups

A group holds items and moves as one. Its children keep their own X and Y, measured on the canvas, as InfoPanel stores them: a group never offsets what is in it, so grouping, ungrouping and moving items between groups never shifts anything on the canvas. Groups can hold groups.

- **Group** (`Ctrl+G`, or **Group selection** in the Layers menu) wraps the selected items in a new group, at the place of the first of them in **Layers**. Items from different groups can be grouped together. They keep their order.
- **Ungroup** (`Ctrl+Shift+G`, or the menu) puts the children back in the group's place. A hidden or locked group leaves its children hidden or locked.
- **Layers** lists the top item first. The last row is drawn first, at the back. A group's items are drawn at the group's place, in their own order.
- Drag a row in **Layers** to reorder it. Drop on the upper or lower edge of a row to go above or below it, on the middle of a group to go inside it on top, or on the empty space under the list to go to the back of the top level. A line or a box shows where it will land. Drag out of a group the same way. Several selected rows move together, in their order.
- A group can't go inside itself or inside anything it holds. When a drop isn't allowed, **Layers** says why.
- The chevron opens and closes a group; the state is saved in the profile (InfoPanel's `IsExpanded`). Double-click a name, or choose **Rename** in the menu, to rename it.
- **Hidden** and **Lock** on a group act on everything in it. A locked group's items can't be dragged out or in.
- **Delete** removes a group with its children, and **Duplicate** copies it with them. Each is one undo step, and so is every other group action.
- On the canvas, a click on an item in a group selects the whole group, to move it. `Alt`+click or a double-click selects the item itself. With an item of the group already selected, a plain click picks items inside it.
- A **Cores** element is a group of bars that the element places itself. Its bars can't be moved in or out, and it can't be ungrouped. The whole Cores group can go inside another group.

## Several items

Click with `Shift` or `Ctrl` to select more than one item, on the canvas or in **Layers**. Drag, nudge, **Duplicate** and **Delete** act on all of them. The inspector then has:

- **Align**: left, centre, right, top, middle or bottom of the box around them.
- **Distribute**: equal gaps across or down, for three items or more. The first and last stay where they are.
- **Shared fields**: what every selected item has, such as X, Y, font and colours. A field they differ in says "Mixed" until you set it.

Locked items stay where they are. Each of these is one step to undo.

## Live on the screen

Every edit here is saved to the dashboard a moment later, as any studio edit is, so a kiosk or desktop panel showing that screen updates by itself. A drag shows up when you let go.

## Choosing a sensor

At the top of an item's **Sensor** section is a dropdown. It shows the item's sensor with its live value. Open it to search the Data API's live sensors, listed by source and device. Search by name, key or value. Use the arrow keys, `Enter` to choose and `Esc` to close. Choosing one sets InfoPanel's own binding on the item, so the exported file reads the same sensor. The line under it shows what InfoPanel reads. A new item you add from **Add** asks for its sensor in a window with the same list.

You don't type a binding. The ids InfoPanel stores are in **Binding details**, a section below the others, and they're shown but can't be changed: the sensor type, the HWiNFO ids, the Libre sensor id and the plugin sensor id. **Sensor name** is there too and you can edit it, since InfoPanel shows it and uses it to match HWiNFO sensors. **Value type** is a choice list. To read a different sensor, choose it in the dropdown, or use [Sensor remap](remap).

A Table takes its plugin's column format when your InfoPanel build reports it. Otherwise it keeps InfoPanel's default, and the inspector says so.

In [Sensor remap](remap), **Reset to automatic** puts back the sensor the item came with, then matches it again.

If your InfoPanel build doesn't report sensor ids, a choice binds the preview only. The picker and the inspector say "Not exportable to InfoPanel".

## Profile settings

Click an empty part of the canvas and the inspector shows the page as **Page · {name}**. **GRID** has **Snap items to grid** and the `Alt` hint, as on any page (see [Page settings](studio#page-settings)). Turning it on or off never moves an item.

Then **Name**, **Size**, **Columns × rows**, **Background**, **Palette** and **Fonts** (the fonts the items use), and **Remap sensors**, which opens [Sensor remap](remap) with a count of the sensors that need a look. Columns × rows changes the grid that widgets and snapped items use; items at their imported pixels stay where they are. Under them are the font, font size, text colour, font scale, **Show FPS**, **OpenGL**, and the web view: **Show a web page**, its URL, **Interactive**, **Disable cache**, **Refresh every (s)** and **Max FPS**. A value InfoPanel would refuse shows a message and isn't stored. Changing the size keeps every item where it is and resizes the screen too.

## Saving to the Library

**Save to Library** in the strip above the canvas keeps the profile in the Library's **InfoPanel profiles**. Once the profile has an item there, whether you saved it here or opened it from the Library, the button reads **Update in Library** and replaces the item's profile and files with what you have now. The item keeps its name.

New profiles can start from a Library profile, and **Edit profile** in the Library opens one here. Removing an item from the Library never deletes a file that a profile on a screen still uses.

## Components

Select items, a group or an element and choose **Save as component** (`Ctrl+Shift+S`, or the Layers menu). Name it, and it goes to the Library's **Components**. A part of an element such as a Row is saved with the whole element. The component keeps the files its items use, the palette slots they follow, and for each sensor the role it fills (CPU load, GPU temperature and so on) when it matches one.

Drag a component from the Library onto the canvas. Its items land where you drop them, in front, as one undo step. A file already in the profile is reused, and a different file with the same name gets a new one. Colours that follow a palette slot take this profile's colour for that slot; fixed colours stay as they were.

Sensors the profile can't find are matched by role on this PC. Any that still don't match open Remap. A component placed on a screen's page becomes a group of its own, with its own copy of the items.

## Exporting

Export the profile as an .infopanel file from **Export & back up**. A remap choice changes the item's InfoPanel binding too, so the file carries the sensor you chose.

With **Bake stale gauges and elements first** on, the Export window makes the frames and images for every gauge and element whose look changed, and shows its progress. It also lists every Approximated element with what it loses.

The file is written the way InfoPanel's own export writes it, and the lab reads it back with InfoPanel's own reader. It leaves out the window state of this PC (active, topmost, window position), as InfoPanel does, so an imported profile doesn't arrive inactive.

### On the PC that opens it

The Export window ends with what the other PC needs.

- **Fonts.** InfoPanel draws with installed fonts only, and an .infopanel carries none. The window lists the fonts the profile uses that Windows doesn't ship; install them on the other PC. The stored form (.canvas.zip) does carry the fonts you supplied.
- **Sensors.** InfoPanel matches HWiNFO sensors by name when it imports a profile. Libre and plugin sensors are matched by id, so those sensors have to exist on the other PC. The window says which sources the profile reads.

## Converting dashboard widgets

InfoPanel can't draw the dashboard's widgets, so a zone or a whole screen can be rebuilt from InfoPanel's own items. Right-click a zone and choose **Convert zone to InfoPanel (experimental)…**, open the command palette and choose **Convert screen to InfoPanel profile (experimental)…**, or use **Convert to InfoPanel profile (experimental)** in a screen card's menu in Screens. Native widgets are rebuilt from InfoPanel items, so they may look slightly different.

Conversion is experimental and stays as it is: the dashboard's own screens are where new widgets and effects go, and many of them have no InfoPanel equivalent. Use it for a plain InfoPanel copy of a screen, not a faithful one.

For each widget you choose what it becomes:

- **Recreate** rebuilds it. A widget keeps its look: it becomes a picture of itself with its values taken out, and each value goes on top as an InfoPanel item at the same place, in the same font, size and colour, bound to the same sensor. Bars become Bars, rings and level meters become Gauges, sparklines become Graphs (they start empty, as InfoPanel keeps its own history), and the time and date become a Clock and a Calendar. Anything else that moves (a weather animation, a tile's colour) stays as it was when you converted. A panel's widgets become Values, Bars, Gauges, Graphs, Tables, Text, Images, Clocks and Shapes at the places they were drawn. A widget whose values the conversion can't read yet is built from the readings it shows instead: hardware by role, plugins by their entries, on a plain card. The page's background is one picture under everything, and a canvas zone on the page keeps its InfoPanel items, scaled to its zone.
- **Static snapshot** is a picture of the widget as it is now. It never updates.
- **Leave out** drops it.

Recreate is the default. A widget whose readings aren't on this PC goes as a snapshot, and the report says so. Your choices are kept on the zone, so the next conversion starts from them. On a screen made for InfoPanel, a widget's **On InfoPanel** choice in its inspector is where the conversion starts too, and a choice made here sets it. A reading the dashboard pushes itself (the system load, Spotify) has no InfoPanel reading of its own: it is bound to the matching hardware or Spotify plugin reading, or left unbound with a note.

Coding Agents, Countdown, Timer, Web Page, WaveLink, Day Planner, Radial Clock Stack and On-Air Beacon aren't InfoPanel data. They can't be converted, and the window says each one is left out.

A zone lands as an InfoPanel canvas zone in a free cell of the page, and is saved to the Library as a component you can place on any InfoPanel profile. A screen becomes a new profile with one canvas zone. The window ends with a report of what each widget became. Export the result with **Export & back up**.

## What InfoPanel can't do

- **Letter spacing.** InfoPanel's text has no setting for the space between letters, so the editor doesn't offer one.
- **Font weight** comes from the font and its style, in **Font** and **Font style**. Pick a light or bold face there.
- **Value colours** for warning and critical are InfoPanel's own thresholds on a Value item.
- **Text gradients** aren't available; put a Glow or a Card behind the text instead.
- **A blurred text shadow** isn't available. Shadow text adds a sharp, dark copy behind the text (Approximated). A glow on text is InfoPanel's own Glow setting on the Text or Value.
- **A gradient fill under a graph** isn't drawn. InfoPanel fills a Graph with one colour, so the editor does the same and says so in the badge.
