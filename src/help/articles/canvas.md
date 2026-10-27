---
id: canvas
title: Editing a canvas
icon: draw
related: [infopanel-editor, import, remap, gauges]
verified: 1.3.0-beta.35
---

A free-form editor over the imported profile. Every edit stays valid for export back to InfoPanel.

The editor is **Edit** on the rail, the same view that edits a grid screen, and it opens on every Free page (see [Grid or Free](studio#grid-or-free)); see [The InfoPanel editor](infopanel-editor) for adding items, choosing sensors and the profile settings. An InfoPanel profile opens in it from its card in Screens. To edit a canvas zone on a grid screen, select it and press **Edit items** on the note about the InfoPanel profile in the inspector, or double-click it. Press **Done** to go back to the grid.

Dragging an InfoPanel item or element from **Add** onto an empty cell of a grid page makes a canvas zone on that cell, the cell's size, and opens it here with the item in it. Dropped on a canvas zone, it goes into that zone. A click on one adds it to the selected canvas zone, or to a new one on the first free cell. In Add, the group says **Makes a free area here** on a grid page.

## Selecting and moving

- Click an item on the canvas or in Layers. `Shift` or `Ctrl` adds to the selection; `Shift` in the tree selects a range.
- Drag to move. Drag a handle to resize. Both snap to the canvas and the other items; hold `Alt` to stop snapping.
- Arrow keys nudge 1 px, `Shift`+arrow 10 px.
- Locked items ignore the mouse on the canvas: a click goes to the item below. Select them in Layers.

## Layers

The item tree. Groups nest. Each row has a lock toggle, and a checkbox that sets InfoPanel's Hidden flag. A Studio widget on the page is a row too, with its widget icon in the accent colour and the word *widget*; see [Studio widgets on a profile](infopanel-editor#studio-widgets-on-a-profile).

## The toolbar

Undo and Redo, Duplicate, Group and Ungroup, Draw later and Draw earlier, Delete, **Draw all as** (InfoPanel or Native), **Show modes**, **Sensors**, **Remap** and **Compare**.

## InfoPanel or native, per item

In the item inspector, **Draw as** switches an item between InfoPanel and Native. It lists what would be lost ("Lost while native") and which app features the widget uses. Switching back restores every original field. Position holds X, Y, W, H, rotation and flip. A gauge item has **Edit gauge…**.

## Sensor source

The **Sensors** control sets what the canvas shows.

| Source | Shows |
|---|---|
| Unbound | As InfoPanel with no sensors |
| Live | Real values from the Data API |
| Mock | A slider per item, to test ranges |

The item's **Sensor** button opens [Sensor remap](remap).

## Compare overlay

**Compare** lays InfoPanel's own screenshot over the render, with an opacity slider and a difference blend, to check the match. The screenshot is there when you kept it on import.

| Keys | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+D` | Duplicate |
| `Ctrl+G` | Group |
| `Ctrl+Shift+G` | Ungroup |
| `Delete` | Delete |
| Arrow keys | Nudge 1 px |
| `Shift` + arrow keys | Nudge 10 px |
