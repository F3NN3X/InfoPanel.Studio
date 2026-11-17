---
id: studio
title: The studio
icon: space_dashboard
related: [zones, widget-settings, shortcuts]
verified: 1.3.1-beta.8
---

The editor window: a sidebar of views on the left, the work area in the middle, and an inspector for settings in Edit.

## The sidebar

| View | What it holds |
|---|---|
| **Screens** | Your screens: which one opens, sizes, pages, rotation and each screen's own frame rate. **New** opens the New page, where you start from Blank or a template. See [Screens and the grid](profiles). |
| **Edit** | The canvas, the page tabs and the inspector, for a grid screen or an InfoPanel profile. The left panel switches between **Layers** (every part of the page in one tree, see [Layers](studio#layers)) and **Add** (see [Add](studio#add)), which has tabs for **Widgets**, **Items** (InfoPanel's items and Studio's elements, where the page takes them), **Panels** (yours and the presets) and **Layouts** (starters). See [InfoPanel profiles in Edit](infopanel-editor) for profiles. |
| **Theme** | One editor for the theme at every level: Browse themes, its quick changes, your saved themes and colors. See [Themes](themes). |
| **Library** | Your Styles, Panels, gauges, media, fonts and canvases. See [Library](library). |
| **Widgets** | Every widget, your recipe widgets and imported ones, and the builder. See [The Widgets page](widgets-page). |
| **Gauges** | Browse, edit and build gauges. See [Gauges](gauges). |
| **Alerts & Island** | Alert rules, defaults and history, and the Dynamic Island. See [Dynamic Island and alerts](island-alerts). |
| **Data sources** | Every data point the Data API publishes, with a chart of the last minute, what uses it, and display names. See [Sensors and the Data API](sensors). |
| **Help and shortcuts** | A menu: **Help** opens this help at the article for where you are (`F1` does the same), **Keyboard shortcuts** opens the list (`?`), **Search or run a command** is `Ctrl+K`, and **Settings**. |
| **Settings** | Opens the Settings window (`Ctrl+,`, or Settings in the tray): **App** (General, Server, Coding agents and Updates, in the desktop app), **Dashboard** (every screen and kiosk, including the startup screen, saved the moment you change it), **Studio** (editor preferences, saved with the Studio on this device), then Diagnostics, Logs, About and Changelog. In a browser it opens as a tab with Dashboard and Studio. See [Startup and tray](startup). |

The sidebar is 232 px wide. The button at its top collapses it to a 60 px rail of icons, and the studio remembers your choice for every view, Edit included. It starts open. Under 960 px it is always the rail, and on a phone it is a bar at the bottom with Screens and the views after Library under **More**.

At the foot, above Settings, **Live** shows how many kiosks are connected and opens the controls for them. Under it, when something needs you, a row says so: an update is available, the server needs a restart, the server isn't running, or the server can't be reached (**Offline · edits kept locally**). The **Data API** card shows connected, reconnecting or offline; press it for the address (editable), the latency, the data points, the last drop, the studio server and the sources, with **Test connection** or **Retry now** and a copy of the troubleshooting report. A short drop shows **Reconnecting** with the last values held for 10 s, and only then does it turn red.

## The editor's top bar

Edit's top bar is the window's title bar in the desktop app. Every other view has a bar of the same height with its own title and controls (search, tabs, actions), and in the desktop app the caption buttons are at its end. The empty part of a bar drags the window and a double-click on it maximises.

- The breadcrumb names the screen (with a pencil to rename it) and its page; the screen name opens a list of your screens, each with its size, and the pages of the current one. Pick one to edit it. **Manage screens…** opens **Screens**, and **Screen settings…** opens **Screens** on the screen you are editing. Which screen your displays open is set in **Settings › Dashboard › Startup screen**. See [Screens and the grid](profiles#which-screen-opens).
- The top of that list says what the screen is: **Imported from InfoPanel** for a profile brought in from an .infopanel file or the InfoPanel app, otherwise **Screen**.
- The search box in the middle opens the command palette (`Ctrl+K`). Besides actions it lists every setting and one entry for each view.
- **Undo** and **Redo**, which say what they change, and the saved state, **Preview** (the kiosk view) and **File**: **Import** and **Export & back up**. See [Importing and exporting](import).
- **Live**, in the sidebar's foot (in the bar on a phone), opens the controls for the kiosks: show a page now, pause rotation, dim, mute alerts for an hour, switch the Dynamic Island and reload every kiosk. None of it is part of your design, so saving doesn't change it. **Open kiosk view** shows the kiosk in the Studio; in the desktop app it resizes the window to the screen's exact size, and moving the pointer to the top edge brings a strip with **Back to studio**, **Minimize** and **Close**.
- Under 600 px a **⋯** menu holds Undo, Redo, Save now, Import and Export. From 600 to 960 px the saved state is a dot; hover it for the words.

Whether your edits are saved shows in the saved state: **Saved · live on N displays**, **Unsaved changes**, or, when the server can't be reached, **Offline · edits kept locally**.

## Canvas

Shows the selected screen at its real size, scaled to fit the window. Grid lines appear while you drag. Click a widget to select it; click empty space to select nothing and see the page's settings. Right-click a widget for its menu (change widget, edit style, bind data, duplicate, hide, move to page, copy and paste style, make this the theme for…, size steps, delete) or empty canvas for **Add widget…**, **Select all**, **Zoom to fit** and **Edit theme**.

The bar under the canvas toggles the left panel, the grid and rulers, zooms in and out, and has **Fit** and the resolution button.

An empty page shows **Drop widgets or InfoPanel items here**, with **Add** and **Import .infopanel**, and **Use sample layout** as a link under them. A widget this version doesn't have, saved by a newer or older one, shows as a gray box that says **Widget not available in this version**; it's kept as it is when you save. A page whose InfoPanel content didn't load says *This page's content isn't loaded yet.* and can't be moved until it does.

To move around, hold `Space` and drag, or drag with the middle mouse button, to pan the canvas at any zoom. **Fit** puts it back. `Ctrl` + mouse wheel zooms.

## Design preview data

The Edit canvas can show live sensor values or a snapshot of them. A snapshot uses much less CPU: the studio closes its own Data API connection while nothing live is on screen, and weather, visualisers and other effects stand still. Choose in Settings › Studio, or under Window in Settings › App › General:

| Choice | The canvas shows |
|---|---|
| **Live** | Live values, all the time |
| **Frozen** | A snapshot, all the time |
| **Frozen when unfocused** | Live values while you work, and a snapshot from a minute after the studio loses focus (the default) |

While the canvas is frozen, the bar under it shows **Frozen · 14:05** with the time of the snapshot. Press the refresh button beside it (`Shift+F`) for a new snapshot, or **Go live for this session** to see live values until the page reloads; the setting stays as it is. `F` switches between frozen and live.

Only the Edit canvas and the Add list freeze. Kiosks, Kiosk view, the Data view, the sensor picker and alert previews always show live values.

The setting follows you: the app window and a studio in a browser read the same one.

## Pages

A screen can have several pages. The strip above the canvas shows them: press **+** to add a page, double-click a tab to rename it, drag a tab to reorder. A tab's menu has Rename, Icon…, Duplicate, Delete and Page settings. The last page can't be deleted.

With two or more pages, the kiosk can rotate them. Set it up in **Screens**, under **Rotation**: turn on **Rotate pages** and type **Every** (3 to 3600 seconds; the default is 15). In **Pages · order & rotation**, switch each page in or out of the rotation and drag them into order. A touch or remote switch pauses rotation for 30 seconds. The status bar at the bottom shows which page the kiosks show and how often they switch; click it to open **Live**. Pause or resume rotation from **Live**.

## Page settings

Every page works the same way. Widgets sit on the grid's cells, and InfoPanel items and elements snap to them unless you hold `Alt`. There's no layout to pick. Pages that were Free in an earlier version, and the InfoPanel areas a grid page held, came over as groups of their items at the same pixels.

Click an empty part of the canvas, or choose **Page settings** in a tab's menu, and the inspector shows the page as **Page · {name}**:

- **GRID** has **Snap items to grid**. With it on, items and elements snap to the cells and `Alt` places one freely. With it off they move to the pixel and `Alt` snaps one to the cells. Widgets always snap. Each change is one undo step.
- **Name**, **Size** and **Columns × rows**, then **Gap**, **Theme** and **Rotation**. Columns × rows reflows everything on the cells; items placed freely keep their pixels. If a widget wouldn't fit in the new grid, the change is refused with a message naming it, for example *CPU gauge and Weather don't fit in 3 × 2. Make room first.* Past three widgets it counts the rest: *CPU gauge, GPU gauge, Clock and 15 more don't fit in 2 × 1.*
- **Icon**, the sections this page sets apart from its screen's theme, **Show on kiosks now**, and **Duplicate page** and **Delete page**.

The rest of the screen's settings (fit, padding, performance, the island and which displays show it) are under **Screen settings…** in the title bar's screen menu.

## InfoPanel items on a page

A page can hold InfoPanel items and elements on top of its widgets. Add puts them there (see [Add](studio#add)), and an .infopanel file imported onto the page lands as a group of its items. Click one on the canvas to select it; `Shift` or `Ctrl`+click adds to the selection.

- Drag it and it snaps to the cells. Hold `Alt` while you drag to place it to the pixel, on top of a widget if you like: the cell lines fade, a hint says **Placing freely**, a readout under the item shows its X, Y, W and H, and a dashed box marks where it started. Press or release `Alt` during the drag to switch.
- Drag a handle to resize it, the same way.
- An item you placed freely keeps its size when you drag it again without `Alt`. Its corner snaps to a cell, and a resize snaps only the edge you drag. To put it back on the cells, use **Snap to grid** in its inspector.
- Widgets always sit on the cells and never on another widget. With `Alt` held, a widget's drag says **Widgets always sit on the grid**.
- On Linux, use `Ctrl+Alt` if the window manager takes `Alt`+drag. On a Mac, `Alt` is `Option`.

On a grid page the bar under the canvas says how parts snap. A drag is one undo step.

With one item selected, the inspector shows its name, **InfoPanel item** or **Element**, and Hide, Duplicate and Delete. Under them is where it sits. Its **C**, **R**, **W** and **H** boxes give its column, row, width and height in cells. **POSITION AND SIZE (PX)** with **Placed freely** gives X, Y, W and H in pixels, and **Snap to grid** moves it to the nearest cells. Type into a box and press Enter. Then come the tabs **Item**, **Sensor** and **Theme**. Order, group, lock and hide are in the Layers right-click menu and on keys; **Move to group › Move out of group** (`Ctrl+Shift+O`) takes it out of its group. A new Image or Sensor image asks for its picture first, and a Sensor image then asks for its sensor.

:::keys
Arrows — Move one cell (an item placed freely moves a cell's width)
Alt+Arrows — Nudge an item 1 px; it's then placed freely. A widget moves one cell
Alt+Shift+Arrows — Nudge an item 10 px
Shift+Arrows — Make it a cell wider, narrower, taller or shorter
Ctrl+] / Ctrl+[ — Bring forward / send backward
Ctrl+Shift+] / Ctrl+Shift+[ — Bring to front / send to back
Ctrl+G / Ctrl+Shift+G — Group / ungroup
Ctrl+Shift+O — Move out of its group
Ctrl+L — Lock
Ctrl+H — Hide
Ctrl+D — Duplicate
Del — Delete
Esc — Clear the selection
:::


## Add

**Add** shows what you can put on the page as rows, each with an icon, a name and one line of what it is. Its tabs are **Widgets**, **Items** (when the page takes InfoPanel items), **Panels** and **Layouts**.

- On **Widgets**, the chips under the tabs narrow the list to one category, and the search covers every tab. **Items** has its own chips: InfoPanel's groups and Studio's elements. Your recipe and code widgets (see [The Widgets page](widgets-page)) are listed after the built-in ones.
- **Recently used**, at the top, holds the last four things you added. It hides while you search.
- A widget with presets shows **N presets** on its row. Click it to list them, then click one to add it or drag it onto the canvas (see [Layouts and presets](presets#widget-presets)). Presets you saved are in the list too.
- Rest the pointer on a row, or move to it with the arrow keys, and a card opens beside the panel after a moment: a preview, what it is, and its size. Scrolling, leaving the list or `Esc` closes it.
- Click a row or press `Enter` to add it. A widget takes the first free cells, or fills the selected blank zone. An InfoPanel item or element goes in the middle of the page, on the cells, into the selected group if there is one. An item that reads a sensor asks for it next.
- Drag a row onto the canvas to put it where you drop it. Hold `Alt` as you drop an item to place it to the pixel. A widget dropped where it has no free cells isn't added, and a message says "No free cells here."
- `/` opens Add from anywhere in Edit and puts the cursor in its search.
- A message at the top of the canvas says what you added, with **Undo**.
- **Panels** and **Layouts** keep their lists. On an imported InfoPanel profile **Layouts** is greyed out. A layout adds Studio panel areas, and an imported profile keeps the layout it came with from InfoPanel.

## Layers

**Layers** lists every part of the page, the top one first: widgets, InfoPanel items, elements and groups. A group can hold any mix of them, and groups can hold groups. A screen's page and an InfoPanel profile use the same tree.

Each row has the part's icon, its name and what it is (*widget*, *item*, *element* or *group* with its count). An item placed freely has a move mark. Every row ends with a lock and an eye, and a hidden row is dimmed. A hidden part isn't drawn in Edit, Preview or the kiosk. Select it in Layers and the canvas shows a dashed outline where it sits.

- Click a row to select it. `Ctrl`+click adds or removes a row and `Shift`+click selects a range. One selection can hold widgets, items and groups together, on the canvas too.
- From the keyboard, `Tab` reaches the selected row. The up and down arrows move between rows, `Shift`+arrow selects as it goes, `Enter` or `Space` selects the row and `Ctrl+Space` adds or removes it.
- Double-click a name, or press `F2`, to rename it. `Enter` keeps the new name and `Esc` drops it. A widget's new name shows in the inspector too.
- Drag a row between two rows to change what is drawn on top. Drop it on the middle of a group to put it inside, on top. A line or an outline shows where it lands. Reordering never moves a part on the page.
- On the canvas, a click on a part in a group selects the outermost group; double-click to select the part itself.
- Right-click a row, or any part on the canvas, widgets included, for the layer menu: Bring to front, Bring forward, Send backward, Send to back, Group selection, Ungroup, Move to group, Snap to grid, Lock, Hide, **Pin here**, **Pin to edge**, Rename, Duplicate, Delete and **Save to Library**. A widget's menu goes on below with the widget's own commands, such as Change widget, Edit style and Bind data. The order and the group are in this menu and on the keys.
- Select a group and the canvas draws one box around its parts, with its name above it. Drag the box to move the group. A group with a widget in it moves by whole cells; when a widget would land on a widget outside the group, the group stays put and a message says "Not enough room to move the group." A group of items and elements snaps to the cells, or goes to the pixel while you hold `Alt`. Double-click inside the box to select the part under the pointer.
- A locked part can't be moved, resized or deleted on the canvas. You can still reorder it in Layers.
- **Save to Library** (`Ctrl+Shift+S`, the layer menu, or the button in a group's inspector) saves what is selected as a component in the Library's **Components**. Widgets, items, elements and groups can be mixed. Each part keeps its place relative to the others, a widget keeps its settings and look, a group keeps its name and what is inside it, and a hidden part stays hidden. The component takes only the files its parts use. Drag it back onto any screen's page and it lands as a group named after it, its widgets on the nearest free cells. When a widget has no free cells left, nothing is added and a message says so. Dropped into an InfoPanel profile, its widgets stay Studio widgets.

| Keys | Action |
|---|---|
| `Ctrl+]` / `Ctrl+[` | Bring forward / send backward |
| `Ctrl+Shift+]` / `Ctrl+Shift+[` | Bring to front / send to back |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `Ctrl+Shift+O` | Move out of its group |
| `Ctrl+L` / `Ctrl+H` | Lock / hide |
| `F2` | Rename |
| `Ctrl+Shift+S` | Save the selection to the Library |

## The pinned layer

**Page** and **Pinned** in the top bar switch Edit between the page and the screen's pinned layer: the widgets pinned to its edges or in place, the same on every page. With **Pinned** on, the page is dimmed under the layer and Layers lists the pinned widgets, top first. **+** pins a page rail, a now-playing bar, an agents panel or a status bar; the arrows change the order (several widgets on one edge stack outwards in that order) and the eye hides one. An agent prompt the Island shows is listed too, for reference: it comes and goes with the agent and is set in **Alerts & Island**.

Right-click a widget on the page, or its row in Layers, to pin it:

- **Pin here** keeps it on the cells it is on, on every page. Select several widgets first to pin them all in one step, such as three in a row along the top. On every page those cells are taken: a widget you add, move or resize goes around them. A widget that was already on them on another page is drawn under the pinned one until you move it: the pinned widget's inspector lists it with **Move**, which puts it in the next free spot, and the page's thumbnail under the canvas carries a warning mark. With **Page** on, a widget pinned in place shows a pin badge and a dashed edge and can't be dragged; click it to select it in the pinned layer. With **Pinned** on, drag it to move it and drag its corner to resize it.
- **Pin to edge** puts it on the top, bottom, left or right edge.

Select a pinned widget, on the canvas or in the list, to set it in the inspector. A widget pinned in place shows its cells, **Show on**, what it covers, **Move to page** (back on the page at the same cells if they are free, otherwise in the next free spot) and **Unpin**. One on an edge has:

- **Show on**: this page, some pages or all of them.
- **Edge**: left, right, top or bottom. A widget on the same edge as the Dynamic Island gets a warning: the Island draws over it.
- **Page content**: **Make room** takes the widget's size off the page, which lays out in the space left; **Float on top** lays it over the page.
- **Size** across the edge, and **Off the edge**: a gap to the screen's edge (and, for a side panel, to the top and bottom).
- **Hide the pinned layer on** this page gives the page its whole screen back.
- **Use on every profile of this size** copies the layer to the other profiles of the same size, replacing theirs; a page it shows on goes to the page in the same place there.

**Edit rail items** opens a rail's items: its pages, actions, the profile and small widgets such as the clock, in groups. Pick one to set its page or action, its icon (from the icon set, an image, a program or text), its shape, tint and label, what a tap, a hold and a double tap do, and its badge. An image can be a PNG, WebP, GIF or SVG. For a program, type its file name, such as Chat.exe: InfoPanel Studio reads its icon on this computer, from a program that is running, installed or on PATH. A logo (the profile with an image) sits on a plate: **Auto** picks none, the card colour or the text colour from the image, so a light logo stays visible on a light Look. A screen reader hears an image as the item's name and what a tap does. A rail warns when its items are taller than the screen, since the last ones would scroll. The pages under the canvas, and the page tabs' thumbnails, show the pinned layer until you turn **Show the pinned layer on thumbnails** off. Every change is one undo step.

## Inspector

The settings for whatever is selected. Where it sits depends on the width of the window, and there is no setting for it:

| Window width | Inspector |
|---|---|
| 960 px or more | Docked as a column on the right. `Ctrl+\` collapses it. |
| 600 to 959 px | A floating card. Open it with **All settings**, by double-clicking a widget, or with `Ctrl+\`. |
| Under 600 px | A bottom sheet that you can pull to peek, half or full height. |

A selected widget's inspector starts with **Widget** and where it sits under its name, then its column (**C**), row (**R**), width and height in cells. Type a value and press Enter; a box turns red when the widget can't go there because another widget is in the way. The tabs **Content**, **Style**, **Data** and **Behaviour** follow.

**Behaviour › Touch** sets what a tap, a hold (about half a second) and a double tap on the widget do on the kiosk: open a page, the next or previous page, the page lock, profiles, play or pause, the next or previous track, mute or unmute one of this computer's audio devices, an OBS scene or the OBS mic. Two more are listed after them, and run only once they're turned on in Settings › Actions: **Run a command…**, with **Hold to confirm**, **Approve** and **Test** (it checks the command and says what would start, starting nothing), and **OBS: go live or stop**, which always asks for a hold. A press on the widget's own buttons and sliders still does what they do, and a drag still swipes the page. With a double tap set, a tap waits a moment before it runs. Nothing runs in the studio. A pinned widget has the same **Touch** rows, and a rail item has them in **Edit rail items**.

A **Keys** widget lists its keys in the inspector's **Key list**. **Add a key** and **Add a folder** add one, the arrows change the order, and a folder's arrow opens its own keys, one level deep. Pick a key to set its name, its icon (from the icon set, an image or text), its colour, and what a tap, a hold and a double tap do. Keys run on the kiosk only, as touch actions do.

## Saving

The studio pushes every change to the local server automatically. The saved state in the top bar says **Unsaved changes** while some edits haven't reached the server yet; press it (or `Ctrl+S`) to push them now.

## Undo

One drag, one field change or one bulk action (such as applying a Theme) is one undo step. `Ctrl+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.
