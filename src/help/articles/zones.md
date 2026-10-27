---
id: zones
title: Widgets on the grid
icon: grid_view
related: [widgets, panels, studio]
verified: 1.3.0-beta.36
---

Every widget sits on cells of the grid. Select one to move, resize or fill it.

## Placing and sizing

- Drag a widget to move it; it snaps to grid cells.
- Drag the corner handle to resize. A widget can't go below its minimum size.
- Or type exact values in the **PLACE ON GRID** row at the top of the inspector: **COL**, **ROW**, **W**, **H**.
- Arrow keys move the selected widget and `Shift`+arrow resizes it. The right-click menu has **Narrower**, **Wider**, **Shorter** and **Taller**.
- Select several widgets with `Shift`+click or `Ctrl`+click, or all of them with `Ctrl+A`. To select by area, hold `Shift` and drag a box over empty grid; every widget it touches is selected. `Esc` clears the selection.
- Several selected widgets move together, and delete and duplicate together. Each is one undo step.

## Align and distribute

With two or more widgets selected, the right-click menu has **Align and distribute**. It works in grid cells.

| Action | Keys | What it does |
|---|---|---|
| Align left, right, top, bottom | `Alt+A`, `Alt+D`, `Alt+W`, `Alt+S` | Lines the widgets up on that edge of the box around them |
| Match width, match height | | Gives every widget the primary widget's width or height (the last one you selected) |
| Distribute horizontally, vertically | `Alt+Shift+H`, `Alt+Shift+V` | With three or more widgets, spaces them evenly between the first and last |

A change that would overlap another widget, leave the grid or push a widget under its minimum size is refused and nothing moves. The same actions are in the command palette. Each is one undo step.

## Editing several widgets

With several widgets selected, the inspector shows the Style settings they share. A row where the widgets differ is marked **Mixed** and shows the primary widget's value. Change it and every selected widget gets that value.

## What a cell box holds

| Kind | Holds | Inspector shows |
|---|---|---|
| Widget | One widget | Show, Style, Data and Behaviour tabs |
| Panel | Panel widgets in a Stack, Grid or Overlay | The same four tabs, with Panel, Layout and Widgets sections |
| Canvas | An imported InfoPanel profile | Item tree, canvas tools, item inspector |
| Blank space | Nothing yet | **Widget type** and the widget frame |

## Widget actions

The inspector header has **Hide**, **Duplicate** and **Delete**. A hidden widget keeps its cells but isn't drawn in Edit, Preview or the kiosk; its row in Layers is dimmed, and the eye there brings it back. Use the **Widget type** row (or **Change widget…** in the right-click menu) to swap the widget while keeping its place and its look.

Right-click also offers **Move to page** when the screen has more than one page, **Copy style** and **Paste style**, and **Save as Panel** on a panel.

**Copy style** (`Ctrl+Alt+C`) takes a widget's look: theme and widget theme values, effects such as glow, blur and ring face, and the card chrome. It never takes the widget's data or sensor settings. **Paste style** (`Ctrl+Alt+V`) puts it on every selected widget.
