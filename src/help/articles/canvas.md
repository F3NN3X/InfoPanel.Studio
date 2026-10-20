---
id: canvas
title: Editing a canvas
icon: draw
related: [import, remap, gauges]
verified: 1.3.0-beta.1
---

A free-form editor over the imported profile. Every edit stays valid for export back to InfoPanel.

Select a canvas zone, and in the inspector press **Edit items** on the note about the imported InfoPanel profile. Press **Done** to leave.

## Selecting and moving

- Click an item on the canvas or in the item tree. `Shift` or `Ctrl` adds to the selection; `Shift` in the tree selects a range.
- Drag to move. Drag a handle to resize.
- Arrow keys nudge 1 px, `Shift`+arrow 10 px.
- Locked items can be selected but not moved.

## Item tree

Groups nest. Each row has a lock toggle, and a checkbox that sets InfoPanel's Hidden flag.

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
