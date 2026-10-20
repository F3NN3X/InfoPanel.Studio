---
id: zones
title: Zones
icon: grid_view
related: [widgets, panels, studio]
verified: draft
---
Every box on the grid is a zone. Select one to move, resize or fill it.

## Placing and sizing

- Drag a zone to move it; it snaps to grid cells.
- Drag the corner handle to resize. A zone can't go below its widget's minimum size (for example 2×1 for most widgets, 4×2 for Web Page).
- Or type exact values in the zone box at the top of the inspector: **Col**, **Row**, **W**, **H**.

## Zone kinds

| Kind | Holds | Inspector shows |
|---|---|---|
| Widget | One widget | Show · Style · Data · Behaviour tabs |
| Panel | Panel widgets in a Stack, Grid or Overlay | Panel, Layout, Widgets list, then the selected panel widget |
| Canvas | An imported InfoPanel profile | Item tree, canvas tools, item inspector |
| Blank | Nothing yet | **Pick a widget** and the zone frame |

## Zone actions

The inspector header has **hide**, **duplicate** and **remove**. Hidden zones stay in the layout but don't render on the kiosk. Use **Change** on the Widget section to swap the widget while keeping the zone and its look.
