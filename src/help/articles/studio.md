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
| **Edit** | The canvas, the page tabs and the inspector, for a grid screen or an InfoPanel profile. The left panel switches between **Layers** (the zones of this page, or a profile's items: hide, rename, reorder, select) and **Add**, which has tabs for **Widgets**, **Panels** (yours and the presets) and **Layouts** (starters), or InfoPanel's items and elements on a profile. See [The InfoPanel editor](infopanel-editor) for profiles. |
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

Shows the selected screen at its real size, scaled to fit the window. Grid lines appear while you drag. Click a zone to select it; click empty space to select nothing and see the page's settings. Right-click a zone for its menu (change widget, edit style, bind data, duplicate, hide, move to page, copy and paste style, make this the theme for…, size steps, delete) or empty canvas for **Add widget…**, **Select all**, **Zoom to fit** and **Edit theme**.

The bar under the canvas toggles the left panel, the grid and rulers, zooms in and out, and has **Fit** and the resolution button.

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

A screen can have several pages. The strip above the canvas shows them: press **+** to add a page, double-click a tab to rename it, drag a tab to reorder. A tab's menu has Rename, Icon…, Duplicate, Layout, Page settings and Delete. The last page can't be deleted.

With two or more pages, the kiosk can rotate them. Set it up in **Screens**, under **Rotation**: turn on **Rotate pages** and type **Every** (3 to 3600 seconds; the default is 15). In **Pages · order & rotation**, switch each page in or out of the rotation and drag them into order. A touch or remote switch pauses rotation for 30 seconds. The status bar at the bottom shows which page the kiosks show and how often they switch; click it to open **Live**. Pause or resume rotation from **Live**.

## Grid or Free

Each page is **Grid** or **Free**, and its tab shows which with a small icon. On a Grid page, widgets snap to the cells. On a Free page they sit at any pixel, among InfoPanel items, as on an InfoPanel profile. A screen can mix both kinds, and the kiosk rotates through them as usual. A page added from a Free page is Free too.

Switch a page with **Layout** in its tab menu, or with **Layout** at the top of the page settings (select nothing to see them):

- **Grid → Free** keeps every widget where it is, in pixels. A canvas zone on the page becomes a group of its items. The page looks the same on the kiosk.
- **Free → Grid** snaps each widget to the nearest cells. InfoPanel items, widgets that overlap one placed before them, and locked or rotated widgets stay together in one free area over the cells they cover, where you can still edit them freely. When that happens, a dialog asks first; **Don't ask again** turns it off.

Nothing is lost either way. Settings, sensors and each widget's On InfoPanel choice go with it, and switching back gives the page you started from. Each switch is one undo step, and its message has **Undo**. A page whose content hasn't loaded yet can't switch.

## Made for

The **Made for** button at the right of the page strip says who the screen is for. **Studio panels** is for screens shown by Studio. **InfoPanel too** also checks what would export to the InfoPanel app: the **Export check** pill appears after it, every part on the canvas gets a mark with its status, and the inspector shows each one's **On InfoPanel** line. On a Grid page the check lists every zone and says the page is converted when you export; **Review conversion…** and **Export .infopanel** open the conversion with each widget's choice already set. A change is one undo step. Imported InfoPanel profiles start as **InfoPanel too**, other screens as **Studio panels**.

## InfoPanel items on a page

A grid page can hold InfoPanel items and elements on top of its widgets, for example the ones of a page that was Free in an earlier version. Click one on the canvas to select it; `Shift` or `Ctrl`+click adds to the selection.

- Drag it and it snaps to the cells. Hold `Alt` while you drag to place it to the pixel, on top of a widget if you like: the cell lines fade, a hint says **Placing freely**, a readout under the item shows its X, Y, W and H, and a dashed box marks where it started. Press or release `Alt` during the drag to switch.
- Drag a handle to resize it, the same way.
- Widgets always sit on the cells and never on another widget. With `Alt` held, a widget's drag says **Widgets always sit on the grid**.
- On Linux, use `Ctrl+Alt` if the window manager takes `Alt`+drag. On a Mac, `Alt` is `Option`.

The zoom bar says how parts snap. A drag is one undo step.

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

## Inspector

The settings for whatever is selected. Where it sits depends on the width of the window, and there is no setting for it:

| Window width | Inspector |
|---|---|
| 960 px or more | Docked as a column on the right. `Ctrl+\` collapses it. |
| 600 to 959 px | A floating card. Open it with **All settings**, by double-clicking a zone, or with `Ctrl+\`. |
| Under 600 px | A bottom sheet that you can pull to peek, half or full height. |

## Saving

The studio pushes every change to the local server automatically. A dot on **Save** means some edits haven't reached the server yet; press it (or `Ctrl+S`) to push them now.

## Undo

One drag, one field change or one bulk action (such as applying a Theme) is one undo step. `Ctrl+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.
