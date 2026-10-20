---
id: studio
title: The studio
icon: space_dashboard
related: [zones, widget-settings, shortcuts]
verified: 1.3.0-beta.1
---

The editor window: a rail of tools on the left, the canvas in the middle, and an inspector for settings.

## The left rail

| Button | Opens |
|---|---|
| **Layers** | The zones of this profile in order. Hide, rename, reorder and select from here. |
| **Add** | Every widget, layout starters, panel presets and your saved panels. |
| **Profiles** | Switch, add, rename, resize and delete profiles. |
| **Dynamic Island** | The island's shape, idle display and notices. See [Dynamic Island and alerts](island-alerts). |
| **Alerts** | Alert rules, what is firing now and the history. See [Dynamic Island and alerts](island-alerts). |
| **Library** | Your files: images, videos, fonts, gauges and saved panels. See [Library](library). |
| **Gauges** | Browse and build gauges. See [Gauges](gauges). |
| **Theme** | Edit the theme for all profiles, a profile or a page. See [Themes and appearance](themes). |
| **Data sources** | Browse every data point the Data API publishes. See [Sensors and the Data API](sensors). |
| **Keyboard shortcuts** | The shortcut list. |
| **Settings** | The app's settings window (desktop app only). |

The first five open a panel beside the canvas. Drag its edge to resize it; double-click the edge to reset the width. The next three replace the canvas with a full page.

## The top bar

- The profile name opens **Profiles**. The chevron beside it lists the profiles, with **Auto (match window)** at the top.
- The summary shows size, grid, fit mode, zone count and page count.
- **Undo** and **Redo**, **Kiosk view**, **Import**, **Export** and **Save**.
- **More actions** (the three dots) holds Export config, Import config, Import InfoPanel profile, Export InfoPanel canvas, Copy profile JSON, Command palette, Keyboard shortcuts and Reset everything.

When the server can't be reached, the bar shows **Offline · edits kept locally**.

## Canvas

Shows the selected profile at its real size, scaled to fit the window. Grid lines appear while you drag. Click a zone to select it; click empty space to select nothing and see dashboard-wide settings. Right-click a zone for its menu (change widget, edit style, bind data, duplicate, hide, move to page, copy and paste style, size steps, delete) or empty canvas for **Add widget…**, **Select all**, **Zoom to fit** and **Edit theme**.

The bar under the canvas toggles the left panel, the grid and rulers, zooms in and out, and has **Fit** and the resolution button.

To move around, hold `Space` and drag, or drag with the middle mouse button, to pan the canvas at any zoom. **Fit** puts it back. `Ctrl` + mouse wheel zooms.

## Pages

A profile can have several pages. The strip above the canvas shows them: press **+** to add a page, double-click a tab to rename it, drag a tab to reorder. A tab's menu has Rename, Icon…, Theme…, Duplicate, **Show on kiosk** and Delete. The last page can't be deleted.

With two or more pages, the play and pause button rotates them on the kiosk. Set the timing in **Dashboard › Profile**: **Auto-rotate pages**, **Seconds per page** (3 to 3600, default 15) and the **Pages** checklist. A touch or remote switch pauses rotation for 30 seconds.

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

One drag, one field change or one bulk action (such as applying a look) is one undo step. `Ctrl+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.
