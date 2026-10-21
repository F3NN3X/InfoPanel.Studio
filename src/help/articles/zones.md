---
id: zones
title: Zones
icon: grid_view
related: [widgets, panels, studio]
verified: 1.3.0-beta.1
---

Every box on the grid is a zone. Select one to move, resize or fill it.

## Placing and sizing

- Drag a zone to move it; it snaps to grid cells.
- Drag the corner handle to resize. A zone can't go below its widget's minimum size.
- Or type exact values in the zone box at the top of the inspector: **COL**, **ROW**, **W**, **H**.
- Arrow keys move the selected zone and `Shift`+arrow resizes it. The right-click menu has **Narrower**, **Wider**, **Shorter** and **Taller**.
- Select several zones with `Shift`+click or `Ctrl`+click, or all of them with `Ctrl+A`.

## Zone kinds

| Kind | Holds | Inspector shows |
|---|---|---|
| Widget | One widget | Show, Style, Data and Behaviour tabs |
| Panel | Panel widgets in a Stack, Grid or Overlay | The same four tabs, with Panel, Layout and Widgets sections |
| Canvas | An imported InfoPanel profile | Item tree, canvas tools, item inspector |
| Blank | Nothing yet | **Widget type** and the zone frame |

## Zone actions

The inspector header has **Hide**, **Duplicate** and **Delete**. Hidden zones stay in the layout but don't render on the kiosk. Use the **Widget type** row (or **Change widget…** in the right-click menu) to swap the widget while keeping the zone and its look.

Right-click also offers **Move to page** when the screen has more than one page, **Copy style** and **Paste style**, and **Save as Panel** on a panel.
