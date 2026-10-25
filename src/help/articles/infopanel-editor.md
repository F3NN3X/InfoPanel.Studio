---
id: infopanel-editor
title: The InfoPanel editor
icon: dashboard_customize
related: [canvas, import, remap]
verified: 1.3.0-beta.27
---

Build profiles for InfoPanel itself: its own item kinds and sensor bindings, saved as an .infopanel file that InfoPanel imports.

## The home page

**InfoPanel** on the rail always opens the home page, even while a profile is open. It has:

- **Continue editing**, when a profile is open: one click puts you back in it, with your selection and undo as you left them.
- **Create**: **Blank** and the templates, as cards. Click one and the New InfoPanel profile window opens with that card already chosen, for the name, size, colours and sensors.
- **In this dashboard**: every InfoPanel profile on a screen, drawn small. Click a card, or **Open**, to edit it.
- **In your Library**: the profiles you saved to the [Library](library) that aren't on a screen yet. **Open** brings one in as a new screen. **Duplicate** makes an independent copy in the Library. The bin removes it, after a question, and keeps any file that a profile still uses.
- **Import…** for an .infopanel file.

Inside the editor, **Profiles** at the left of the toolbar goes back to the home page. The profile stays open. **Done** still leaves for the dashboard. **Edit items** on a canvas zone opens that zone here too.

## What the page edits

Each InfoPanel profile lives in a canvas zone on a screen. The page edits that zone, so every change is one step in the studio's undo history and saves with the dashboard. An InfoPanel profile in the Library is a saved copy: **Edit profile** opens the zone made from it in this editor, or places it as a new screen first. Editing the zone doesn't change the Library copy until you choose **Update in Library** (see Saving to the Library).

## A new profile

**New InfoPanel profile…** asks for a name, what to start from, and a size: 480 × 320, 800 × 480, 1024 × 600, 1280 × 480, 1920 × 480, 1920 × 1080, or **Custom**. It comes in as a new screen and opens here. You'll also find it in Design's **Add** list under Layouts, in the Import window, in the Library and in the command palette.

Under **Start from**, **Blank** is an empty profile with a near black background and white Segoe UI text. Then come the templates, then your own profiles from the Library. A Library profile is copied as it is, at its own size, so **Size** goes away. Tick **Also save to Library** to keep the new profile there too; it's off unless you tick it.

When you pick a template, **Sensors** appears under **Start from**: one row for each sensor the template reads, with the sensor found on your PC. Open a row to pick another, or choose **Leave unbound**. A row that found nothing says so; open it to choose one. Whatever is still unbound when you press **Create** is listed over the canvas afterwards.

## Templates

A template is a finished profile made from the editor's own items and elements, bound to your PC's sensors. Each card in **Start from** shows it at the size you picked, with made-up values. Pick one, then a set of **Colours**, and **Create**.

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

Deck, Meters, Orbit, Tower and Ticker come in Dark, White and Smoke, and in Float, which has no cards and puts a dark shadow behind every line of text (Deck also has Tint). They are made for their own sizes, which the Size row offers and picks for you: Deck 1920 × 1080 (it also lays out for 1920 × 480 and for upright screens), Meters 1600 × 300, Orbit 1080 × 240, Ticker 1280 × 160 and Tower 480 × 1920. At other sizes they stack their parts and still fit.

FPS needs InfoPanel's RTSS plugin and RivaTuner running. Deck, Meters, Orbit, Tower and Ticker all show FPS, and the rows for it stay unbound without RTSS, so Create lists them and **Remap** can point them at another sensor. The 0.1% low is the least certain of them. Deck's clock and date are InfoPanel's own Clock and Calendar items, and change them in the editor to put the date the other way round. Deck's graphs show about 60 seconds of history, and the performance strip about two minutes. Voltage, fan speed and the memory temperature come from LibreHardwareMonitor or HWiNFO. Nothing in these five reads the 12V rail.

Every other template is drawn for 480 × 320 and laid out again for the size you pick. A wide size, such as 1280 × 480 or 1920 × 480, puts its cards in one row. A portrait size stacks them. Anything else keeps the 480 × 320 layout, scaled up. Text, lines and gaps grow with the size.

The sensors are matched to what your PC's Data API reports: CPU and GPU load, temperature, clock and power, RAM, disk, download and upload, and uptime.

The Clock template's ring reads InfoPanel's clock plugin (Clock · Second, 0 to 59), so it needs that plugin. Without it the ring is left unbound and Remap lists it as Clock second. The ring is exported with 60 frames, one for each second. A sensor that can't be found is left unbound, and the editor opens with a line naming each one. **Remap** on that line opens [Sensor remap](remap), where you can pick a sensor for it. Close the line with **×**.

A template's colours come from the profile's palette (see The palette, below), so you can change them all in one place later. Everything in it can be moved, changed or deleted like anything you add yourself, and it exports like any profile: cards, rings and glows that InfoPanel can't draw are baked when you export.

## The page

- **Add**, on the left: InfoPanel's 14 item kinds in four groups, Text, Data, Media and Layout, then the studio's **Elements**.
- **Layers**, below it: the item tree, with a lock and a visibility checkbox on each row. See Groups.
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
| Sparkline | A line, area or bar (histogram) graph, with a fill opacity, an end dot and a gradient fill | InfoPanel's Graph, in line or histogram mode; without the dot and the gradient |
| Row | A label, its value on the right, an optional icon and a thin bar under it, laid out for you | A Group of a Text and a Value, plus a Bar and an icon image if you turn them on |
| Rows | A list of rows with even spacing | A Group of Row groups |
| Graph stack | 2 to 4 graphs in rows, each with a label | A Group of Text and Graph items |
| Dual graph | Two series drawn over each other | A Group of two Graphs with no background |
| Double ring | An outer and an inner ring, each on its own sensor, with a value in the middle | A Group of two Gauges with image frames and a Value |
| Drives | A tile for each drive: icon, name, used bar and percent, temperature and free space | A Group of tile Groups made of a Shape, Text, Bar and Values; the icon is an image |
| Shadow text | A Text or Value with a dark copy behind it | Two Text items, the copy offset behind the text |

Ring, LED bar and Sparkline ask for a sensor when you add them. Cores finds the cores in the Data API by itself. If it can't find them, it shows placeholder bars, and its inspector says so. **Find the cores again** binds the bars once the Data API reports them. Changing a Cores setting lays its bars out again.

Row, Rows, Graph stack, Dual graph and Double ring start with no sensors. Select a part in **Layers** to choose its sensor or change its text; the element places the parts, so moving or resizing the element moves them all. A Row's thin bar follows the sensor of its value. Drives finds your drives in the Data API (LibreHardwareMonitor's drive sensors) and binds each tile. With none found it shows three placeholder tiles, and **Find the drives again** binds them once the Data API reports them.

**Colours by value** is in the Ring and LED bar settings, and in the Double ring for the inner ring. Each colour takes over from its percent of the range, so a frame has the colour of its value. That gives a ring that turns amber and then red as it fills. The end dot is left off while it's on, so it can't disagree with the ring.

For a rounded progress bar, a Bar's Sensor section has **Rounded gradient look**: it sets the corner radius to half the height and fills with a gradient from accent 1 to accent 2. The Bar stays a native Bar.

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

## Groups

A group holds items and moves as one. Its children keep their own X and Y, measured on the canvas, as InfoPanel stores them: a group never offsets what is in it, so grouping, ungrouping and moving items between groups never shifts anything on the canvas. Groups can hold groups.

- **Group** (`Ctrl+G`, the toolbar, or **Group selection** in the Layers menu) wraps the selected items in a new group, at the place of the first of them in **Layers**. Items from different groups can be grouped together. They keep their order.
- **Ungroup** (`Ctrl+Shift+G`, the toolbar or the menu) puts the children back in the group's place. A hidden or locked group leaves its children hidden or locked.
- **Layers** read in draw order. The first row is drawn first, at the back. A group's items are drawn at the group's place, in their own order. This is InfoPanel's own order.
- Drag a row in **Layers** to reorder it. Drop on the upper or lower edge of a row to go above or below it, on the middle of a group to go inside it, or on the empty space under the list to go to the end of the top level. A line or a box shows where it will land. Drag out of a group the same way. Several selected rows move together, in their order.
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

Name, width and height, background, font, font size, text colour, font scale, **Show FPS**, **OpenGL**, and the web view: **Show a web page**, its URL, **Interactive**, **Disable cache**, **Refresh every (s)** and **Max FPS**. A value InfoPanel would refuse shows a message and isn't stored. Changing the size keeps every item where it is.

## Saving to the Library

**Save to Library** in the toolbar keeps the profile in the Library's **InfoPanel profiles**. Once the profile has an item there, whether you saved it here or opened it from the Library, the button reads **Update in Library** and replaces the item's profile and files with what you have now. The item keeps its name.

New profiles can start from a Library profile, and **Edit profile** in the Library opens one here. Removing an item from the Library never deletes a file that a profile on a screen still uses.

## Exporting

Export the zone as an .infopanel file from **Export & back up**. A remap choice changes the item's InfoPanel binding too, so the file carries the sensor you chose.

With **Bake stale gauges and elements first** on, the Export window makes the frames and images for every gauge and element whose look changed, and shows its progress. It also lists every Approximated element with what it loses.

The file is written the way InfoPanel's own export writes it, and the lab reads it back with InfoPanel's own reader. It leaves out the window state of this PC (active, topmost, window position), as InfoPanel does, so an imported profile doesn't arrive inactive.

### On the PC that opens it

The Export window ends with what the other PC needs.

- **Fonts.** InfoPanel draws with installed fonts only, and an .infopanel carries none. The window lists the fonts the profile uses that Windows doesn't ship; install them on the other PC. The stored form (.canvas.zip) does carry the fonts you supplied.
- **Sensors.** InfoPanel matches HWiNFO sensors by name when it imports a profile. Libre and plugin sensors are matched by id, so those sensors have to exist on the other PC. The window says which sources the profile reads.

## What InfoPanel can't do

- **Letter spacing.** InfoPanel's text has no setting for the space between letters, so the editor doesn't offer one.
- **Font weight** comes from the font and its style, in **Font** and **Font style**. Pick a light or bold face there.
- **Value colours** for warning and critical are InfoPanel's own thresholds on a Value item.
- **Text gradients** aren't available; put a Glow or a Card behind the text instead.
- **A blurred text shadow** isn't available. Shadow text adds a sharp, dark copy behind the text (Approximated). A glow on text is InfoPanel's own Glow setting on the Text or Value.
- **A gradient fill under a graph** isn't drawn. InfoPanel fills a Graph with one colour, so the editor does the same and says so in the badge.
