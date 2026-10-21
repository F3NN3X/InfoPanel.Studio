---
id: studio
title: The studio
icon: space_dashboard
related: [zones, widget-settings, shortcuts]
verified: 1.3.0-beta.1
---

The editor window: a rail of views on the left, the work area in the middle, and an inspector for settings in Design.

## The rail

| View | What it holds |
|---|---|
| **Design** | The canvas, the page tabs and the inspector. The left panel switches between **Layers** (the zones of this page: hide, rename, reorder, select) and **Add widget** (every widget, layout starters and your panels). |
| **Theme** | One editor for the look at every level. See [Themes](themes). |
| **Screens** | Your screens: which one opens, sizes, pages, rotation and each screen's own frame rate. See [Screens and the grid](profiles). |
| **Library** | Your saved Themes, Styles, Panels, gauges, media, fonts and canvases. See [Library](library). |
| **Gauges** | Browse, edit and build gauges. See [Gauges](gauges). |
| **Data** | Every data point the Data API publishes, the connection and display names. See [Sensors and the Data API](sensors). |
| **Alerts & Island** | Alert rules, defaults and history, and the Dynamic Island. See [Dynamic Island and alerts](island-alerts). |
| **Help** | Opens this help at the article for where you are (`F1` does the same). |
| **Settings** | Opens the Settings window (`Ctrl+,`, or Settings in the tray): **App** (General, Server, Coding agents and Updates, in the desktop app), **Dashboard** (every screen and kiosk, saved the moment you change it), **Studio** (editor preferences, saved with the Studio on this device), then Diagnostics, Logs, About and Changelog. In a browser it opens as a tab with Dashboard and Studio. See [Startup and tray](startup). |

On a phone, Screens is under **More**. Under 960 px the rail is icons only.

## The title bar

- The settings button beside the screen name opens **Screens** on that screen.
- The screen name opens a list of your screens, each with its size, and the pages of the current one. Pick one to edit it. **Manage screens…** opens **Screens**. Which screen your displays open is set there, under **When the app opens**. See [Screens and the grid](profiles#which-screen-opens).
- The search box in the middle opens the command palette (`Ctrl+K`). Besides actions it lists every setting and one entry for each view.
- **Undo** and **Redo**, **Import**, **Export & back up** and **Save**. See [Importing and exporting](import).
- **Live** shows how many kiosks are connected and opens the controls for them: show a page now, pause rotation, dim, mute alerts for an hour, switch the Dynamic Island and reload every kiosk. None of it is part of your design, so Save doesn't change it. **Open kiosk view** shows the kiosk in the Studio; in the desktop app it resizes the window to the screen's exact size, and moving the pointer to the top edge brings a strip with **Back to studio**, **Minimize** and **Close**.
- Under 600 px a **⋯** menu holds Undo, Redo, Import and Export.

The status bar under the work area shows the Data API (connected, slow or unreachable), the server, how many kiosks are connected, updates, and whether your edits are saved. When the server can't be reached it reads **Offline · edits kept locally**.

## Canvas

Shows the selected screen at its real size, scaled to fit the window. Grid lines appear while you drag. Click a zone to select it; click empty space to select nothing and see the page's settings. Right-click a zone for its menu (change widget, edit style, bind data, duplicate, hide, move to page, copy and paste style, make this the theme for…, size steps, delete) or empty canvas for **Add widget…**, **Select all**, **Zoom to fit** and **Edit theme**.

The bar under the canvas toggles the left panel, the grid and rulers, zooms in and out, and has **Fit** and the resolution button.

To move around, hold `Space` and drag, or drag with the middle mouse button, to pan the canvas at any zoom. **Fit** puts it back. `Ctrl` + mouse wheel zooms.

## Pages

A screen can have several pages. The strip above the canvas shows them: press **+** to add a page, double-click a tab to rename it, drag a tab to reorder. A tab's menu has Rename, Icon…, Duplicate, Page settings and Delete. The last page can't be deleted.

With two or more pages, the kiosk can rotate them. Set it up in **Screens**, under **Rotation**: turn on **Rotate pages** and type **Every** (3 to 3600 seconds; the default is 15). In **Pages · order & rotation**, switch each page in or out of the rotation and drag them into order. A touch or remote switch pauses rotation for 30 seconds. The right end of the page strip shows which page the kiosks show and how often they switch. Pause or resume rotation from **Live**.

## Inspector

The settings for whatever is selected. Where it sits depends on the width of the studio, and there is no setting for it:

| Studio width | Inspector |
|---|---|
| 1100 px or more | Docked as a column on the right. `Ctrl+\` collapses it. |
| 640 to 1099 px | A floating card. Open it with **All settings**, by double-clicking a zone, or with `Ctrl+\`. |
| Under 640 px | A bottom sheet that you can pull to peek, half or full height. |

## Saving

The studio pushes every change to the local server automatically. A dot on **Save** means some edits haven't reached the server yet; press it (or `Ctrl+S`) to push them now.

## Undo

One drag, one field change or one bulk action (such as applying a Theme) is one undo step. `Ctrl+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.
