---
id: studio
title: The studio
icon: space_dashboard
related: [zones, widget-settings, shortcuts]
verified: draft
---
The editor window: canvas in the middle, a drawer for adding things, and an inspector for settings.

## Canvas

Shows the selected profile at its real size, scaled to fit the window. Grid lines appear while you drag. Click a zone to select it; click empty space to select nothing and see dashboard-wide settings.

## Drawer

| Tab | What it holds |
|---|---|
| **Add** | Every widget, layout starters, panel presets and My panels. Filter chips: All, Layouts, My panels, System, Media, Network, Info, Other. |
| **Layers** | The zones of this profile in order. Hide, rename, reorder and select from here. |
| **Profiles** | Switch, add, duplicate and resize profiles. |

## Inspector

The settings for whatever is selected. It sits beside the canvas or docks at the bottom:

- **Side** — one column next to the canvas. Good for tall profiles.
- **Bottom** — cards flow in 300 px columns under the canvas, and the drawer becomes the first column. Good for wide, short profiles such as 1920×550.
- **Auto** — picks Bottom for wide, short profiles and Side for the rest.

Drag the splitter to resize the bottom dock. Press `Ctrl+\` to collapse or expand it.

## Saving

The studio pushes every change to the local server automatically. A dot on the **Save** button means some edits haven't reached the server yet; press it (or `Ctrl+S`) to push them now.

## Undo

One drag, one field change or one bulk action (such as applying a preset) is one undo step. `Ctrl+Z` undoes, `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.
