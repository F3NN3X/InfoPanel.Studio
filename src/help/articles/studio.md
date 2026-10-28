---
id: studio
title: The studio
icon: space_dashboard
related: [zones, widget-settings, shortcuts]
verified: 1.3.0-beta.36
---

The editor window: a rail of views on the left, the work area in the middle, and an inspector for settings in Edit.

## The rail

| View | What it holds |
|---|---|
| **Screens** | Your screens: which one opens, sizes, pages, rotation and each screen's own frame rate. **New** opens the New page, where you start from Blank or a template. See [Screens and the grid](profiles). |
| **Edit** | The canvas, the page tabs and the inspector, for a grid screen or an InfoPanel profile. The left panel switches between **Layers** (every part of the page in one tree, see [Layers](studio#layers)) and **Add** (see [Add](studio#add)), which has tabs for **Widgets** (the widgets, InfoPanel's items and elements, as tiles), **Panels** (yours and the presets) and **Layouts** (starters). See [InfoPanel profiles in Edit](infopanel-editor) for profiles. |
| **Theme** | One editor for the look at every level. See [Themes](themes). |
| **Library** | Your saved Themes, Styles, Panels, gauges, media, fonts and canvases. See [Library](library). |
| **Gauges** | Browse, edit and build gauges. See [Gauges](gauges). |
| **Alerts & Island** | Alert rules, defaults and history, and the Dynamic Island. See [Dynamic Island and alerts](island-alerts). |
| **Data** | Every data point the Data API publishes, the connection and display names. See [Sensors and the Data API](sensors). |
| **Help** | Opens this help at the article for where you are (`F1` does the same). |
| **Settings** | Opens the Settings window (`Ctrl+,`, or Settings in the tray): **App** (General, Server, Coding agents and Updates, in the desktop app), **Dashboard** (every screen and kiosk, including the startup screen, saved the moment you change it), **Studio** (editor preferences, saved with the Studio on this device), then Diagnostics, Logs, About and Changelog. In a browser it opens as a tab with Dashboard and Studio. See [Startup and tray](startup). |

On a phone, Screens and the views after Library are under **More**. Under 960 px the rail is icons only.

## The title bar

- The screen name, its size and the page you're on open a list of your screens, each with its size, and the pages of the current one. Pick one to edit it. **Manage screens…** opens **Screens**, and **Screen settings…** opens **Screens** on the screen you are editing. Which screen your displays open is set in **Settings › Dashboard › Startup screen**. See [Screens and the grid](profiles#which-screen-opens).
- A tag beside the screen name says what the screen is: **Imported from InfoPanel** for a profile brought in from an .infopanel file or the InfoPanel app, otherwise **Screen**.
- The search box in the middle opens the command palette (`Ctrl+K`). Besides actions it lists every setting and one entry for each view. **Export check** is in it too, on a screen made for InfoPanel.
- **Undo** and **Redo**, **Import**, **Export & back up** and **Save**. See [Importing and exporting](import).
- **Live** shows how many kiosks are connected and opens the controls for them: show a page now, pause rotation, dim, mute alerts for an hour, switch the Dynamic Island and reload every kiosk. None of it is part of your design, so Save doesn't change it. **Open kiosk view** shows the kiosk in the Studio; in the desktop app it resizes the window to the screen's exact size, and moving the pointer to the top edge brings a strip with **Back to studio**, **Minimize** and **Close**.
- Under 640 px a **⋯** menu holds Undo, Redo, Import and Export.

The status bar under the work area shows the Data API (connected, slow or unreachable), the server, how many kiosks are connected, updates, and whether your edits are saved. When the server can't be reached it reads **Offline · edits kept locally**.

## Canvas

Shows the selected screen at its real size, scaled to fit the window. Grid lines appear while you drag. Click a widget to select it; click empty space to select nothing and see the page's settings. Right-click a widget for its menu (change widget, edit style, bind data, duplicate, hide, move to page, copy and paste style, make this the theme for…, size steps, delete) or empty canvas for **Add widget…**, **Select all**, **Zoom to fit** and **Edit theme**.

The bar under the canvas toggles the left panel, the grid and rulers, zooms in and out, and has **Fit** and the resolution button. On a screen made for InfoPanel too it also has **Studio | InfoPanel**: **InfoPanel** draws the page as the export makes it, the way InfoPanel shows it: a widget set to Recreate is a picture with its live values on top, a Snapshot is a picture, a widget InfoPanel has its own item for (the clock, for one) is that item, and a widget left out isn't there (it keeps its cells). The Export check marks stay on. **Studio** goes back. It changes only what you see.

An empty page shows **Drop widgets or InfoPanel items here**, with **Add** and **Import .infopanel**, and **Use sample layout** as a link under them. A widget this version doesn't have, saved by a newer or older one, shows as a grey box that says **Widget not available in this version**; it's kept as it is when you save. A page whose InfoPanel content didn't load says *This page's content isn't loaded yet.* and can't be moved until it does.

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

## Made for

The **Made for** button at the right of the page strip says who the screen is for. **Studio panels** is for screens shown by Studio. **InfoPanel too** also checks what would export to the InfoPanel app: the **Export check** pill appears after it, every part on the canvas gets a mark with its status, and the inspector shows each one's **On InfoPanel** line. On a screen's page the check lists every widget and says the page is converted when you export; **Review conversion…** and **Export .infopanel** open the conversion with each widget's choice already set. A change is one undo step. Imported InfoPanel profiles start as **InfoPanel too**, other screens as **Studio panels**.

## InfoPanel items on a page

A page can hold InfoPanel items and elements on top of its widgets. Add puts them there (see [Add](studio#add)), and an .infopanel file imported onto the page lands as a group of its items. Click one on the canvas to select it; `Shift` or `Ctrl`+click adds to the selection.

- Drag it and it snaps to the cells. Hold `Alt` while you drag to place it to the pixel, on top of a widget if you like: the cell lines fade, a hint says **Placing freely**, a readout under the item shows its X, Y, W and H, and a dashed box marks where it started. Press or release `Alt` during the drag to switch.
- Drag a handle to resize it, the same way.
- Widgets always sit on the cells and never on another widget. With `Alt` held, a widget's drag says **Widgets always sit on the grid**.
- On Linux, use `Ctrl+Alt` if the window manager takes `Alt`+drag. On a Mac, `Alt` is `Option`.

The zoom bar says how parts snap. A drag is one undo step.

With one item selected, the inspector shows its name, **InfoPanel item** or **Element**, and Hide, Duplicate and Delete. Under them is where it sits. **PLACE ON GRID** with **On grid** gives its column, row, width and height in cells. **POSITION AND SIZE (PX)** with **Placed freely** gives X, Y, W and H in pixels, and **Snap to grid** moves it to the nearest cells. Type into a box and press Enter. Then come the tabs **Item**, **Sensor** and **Look**, the **LAYER** buttons with **In group**, and on a screen made for InfoPanel its **On InfoPanel** line. A new Image or Sensor image asks for its picture first, and a Sensor image then asks for its sensor.

:::keys
Arrows — Move one cell (an item placed freely moves a cell's width)
Alt+Arrows — Nudge an item 1 px; it's then placed freely. A widget moves one cell
Alt+Shift+Arrows — Nudge an item 10 px
Shift+Arrows — Make it a cell wider, narrower, taller or shorter
Ctrl+] / Ctrl+[ — Bring forward / send backward
Ctrl+Shift+] / Ctrl+Shift+[ — Bring to front / send to back
Ctrl+G / Ctrl+Shift+G — Group / ungroup
Ctrl+L — Lock
Ctrl+H — Hide
Ctrl+D — Duplicate
Del — Delete
Esc — Clear the selection
:::

On a screen made for InfoPanel, each item has its Export check mark, and **Convert screen to InfoPanel profile** takes the items as the items they are, at the same place and in the same order. Hidden items, and items in a hidden group, stay out, as on the kiosk.

## Add

**Add** shows what you can put on the page as tiles, three to a row, each with an icon and a name. A widget's tile has its size at the top left. On a screen made for InfoPanel, each tile has its Export check status at the top right.

- **Show** picks **All**, **Widgets** or **InfoPanel items**. On a screen made for InfoPanel the items come first. The chips under it narrow the list to one category, and the search covers everything.
- **Recently used**, at the top, holds the last four things you added, widgets and items alike. It hides while you search or pick a chip.
- Rest the pointer on a tile, or move to it with the arrow keys, and a card opens beside the panel after a moment: a preview, what it is, its size, and on a screen made for InfoPanel what it becomes on export. Scrolling, leaving the list or `Esc` closes it.
- Click a tile or press `Enter` to add it. A widget takes the first free cells. An InfoPanel item or element goes in the middle of the page, on the cells, into the selected group if there is one. An item that reads a sensor asks for it next.
- Drag a tile onto the canvas to put it where you drop it. Hold `Alt` as you drop an item to place it to the pixel. A widget dropped where it has no free cells isn't added, and a message says "No free cells here."
- `/` opens Add from anywhere in Edit and puts the cursor in its search.
- On a screen made for InfoPanel, a message at the top of the canvas says what the new part becomes on export, with **Undo** and **Change**. **Change** opens its **On InfoPanel** setting.
- **Panels** and **Layouts** keep their lists. On an imported InfoPanel profile **Layouts** is greyed out. A layout adds Studio panel areas, and an imported profile keeps the layout it came with from InfoPanel.

## Layers

**Layers** lists every part of the page, the top one first: widgets, InfoPanel items, elements and groups. A group can hold any mix of them, and groups can hold groups. A screen's page and an InfoPanel profile use the same tree.

Each row has the part's icon, its name and what it is (*widget*, *item*, *element* or *group* with its count). An item placed freely has a move mark. On a screen made for InfoPanel the row also shows its Export check status. Every row ends with a lock and an eye, and a hidden row is dimmed. A hidden part isn't drawn in Edit, Preview or the kiosk. Select it in Layers and the canvas shows a dashed outline where it sits.

- Click a row to select it. `Ctrl`+click adds or removes a row and `Shift`+click selects a range. One selection can hold widgets, items and groups together, on the canvas too.
- From the keyboard, `Tab` reaches the selected row. The up and down arrows move between rows, `Shift`+arrow selects as it goes, `Enter` or `Space` selects the row and `Ctrl+Space` adds or removes it.
- Double-click a name, or press `F2`, to rename it. `Enter` keeps the new name and `Esc` drops it. A widget's new name shows in the inspector too.
- Drag a row between two rows to change what is drawn on top. Drop it on the middle of a group to put it inside, on top. A line or an outline shows where it lands. Reordering never moves a part on the page.
- On the canvas, a click on a part in a group selects the outermost group; double-click to select the part itself.
- Right-click a row, or any part on the canvas, widgets included, for the layer menu: Bring to front, Bring forward, Send backward, Send to back, Group selection, Ungroup, Move to group, Snap to grid, Lock, Hide, Rename, Duplicate, Delete and **Save to Library**. A widget's menu goes on below with the widget's own commands, such as Change widget, Edit style and Bind data. The inspector's **Layer** section has the four order buttons and the group the part sits in.
- Select a group and the canvas draws one box around its parts, with its name above it. Drag the box to move the group. A group with a widget in it moves by whole cells; when a widget would land on a widget outside the group, the group stays put and a message says "Not enough room to move the group." A group of items and elements snaps to the cells, or goes to the pixel while you hold `Alt`. Double-click inside the box to select the part under the pointer.
- A locked part can't be moved, resized or deleted on the canvas. You can still reorder it in Layers.
- When the screen is exported to InfoPanel, each group becomes an InfoPanel Group with the same name and parts, so the profile has the same tree.
- **Save to Library** (`Ctrl+Shift+S`, the layer menu, or the button in a group's inspector) saves what is selected as a component in the Library's **Components**. Widgets, items, elements and groups can be mixed. Each part keeps its place relative to the others, a widget keeps its settings and look, a group keeps its name and what is inside it, and a hidden part stays hidden. The component takes only the files its parts use. Drag it back onto any screen's page and it lands as a group named after it, its widgets on the nearest free cells. When a widget has no free cells left, nothing is added and a message says so. Dropped into an InfoPanel profile, its widgets stay Studio widgets.

| Keys | Action |
|---|---|
| `Ctrl+]` / `Ctrl+[` | Bring forward / send backward |
| `Ctrl+Shift+]` / `Ctrl+Shift+[` | Bring to front / send to back |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `Ctrl+L` / `Ctrl+H` | Lock / hide |
| `F2` | Rename |
| `Ctrl+Shift+S` | Save the selection to the Library |

## Inspector

The settings for whatever is selected. Where it sits depends on the width of the window, and there is no setting for it:

| Window width | Inspector |
|---|---|
| 960 px or more | Docked as a column on the right. `Ctrl+\` collapses it. |
| 600 to 959 px | A floating card. Open it with **All settings**, by double-clicking a widget, or with `Ctrl+\`. |
| Under 600 px | A bottom sheet that you can pull to peek, half or full height. |

A selected widget's inspector starts with **Studio widget** under its name and **PLACE ON GRID**: its column, row, width and height in cells. Type a value and press Enter; a box turns red when the widget can't go there because another widget is in the way. The tabs **Show**, **Style**, **Data** and **Behaviour** follow, then **LAYER** and, on a screen made for InfoPanel, **On InfoPanel**.

## Saving

The studio pushes every change to the local server automatically. A dot on **Save** means some edits haven't reached the server yet; press it (or `Ctrl+S`) to push them now.

## Undo

One drag, one field change or one bulk action (such as applying a Theme) is one undo step. `Ctrl+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.
