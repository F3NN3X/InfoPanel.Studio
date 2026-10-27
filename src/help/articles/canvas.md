---
id: canvas
title: Editing a canvas
icon: draw
related: [infopanel-editor, import, remap, gauges]
verified: 1.3.0-beta.36
---

A free-form editor over the imported profile. Every edit stays valid for export back to InfoPanel.

The editor is **Edit** on the rail, the same view that edits a grid screen. An imported InfoPanel profile opens in it from its card in Screens. See [InfoPanel profiles in Edit](infopanel-editor) for adding items, choosing sensors and the page's settings.

An InfoPanel item or element added from **Add** to a grid page goes on the page itself, among the widgets, and no longer makes a canvas zone (see [Add](studio#add)).

## Selecting and moving

- Click an item on the canvas or in Layers. `Shift` or `Ctrl` adds to the selection; `Shift` in the tree selects a range.
- Drag to move. Drag a handle to resize. Both snap to the canvas and the other items; hold `Alt` to stop snapping.
- Arrow keys nudge 1 px, `Shift`+arrow 10 px.
- Locked items ignore the mouse on the canvas: a click goes to the item below. Select them in Layers.

## Layers

The item tree, the top item first, as on a screen's page (see [Layers](studio#layers)). Groups nest. Each row has a lock and an eye, which sets InfoPanel's Hidden flag. A Studio widget on the page is a row too, with its widget icon in the accent colour and the word *widget*; see [Studio widgets on a profile](infopanel-editor#studio-widgets-on-a-profile).

## The strip above the canvas

**Draw all as** (InfoPanel or Native), **Show modes**, **Sensors**, **Compare** and **Save to Library**. Undo and Redo are in the title bar. Duplicate, Group, Ungroup, the draw order and Delete are in Layers, its right-click menu, the inspector's **LAYER** buttons and the keys. **Remap sensors** is in the page's settings: click an empty part of the canvas.

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
