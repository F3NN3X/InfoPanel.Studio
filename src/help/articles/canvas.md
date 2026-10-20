---
id: canvas
title: Editing a canvas
icon: draw
related: [import, remap, gauges]
verified: draft
---
A free-form editor over the imported profile. Every edit stays valid for export back to InfoPanel.

## Selecting and moving

- Click an item on the canvas or in the item tree. `Shift` or `Ctrl` adds to the selection; `Shift` in the tree selects a range.
- Drag to move. Drag a handle to resize (one unrotated, unlocked, non-group item).
- Arrow keys nudge 1 px, `Shift`+arrow 10 px.
- Locked items can be selected but not moved.

## Item tree

Groups nest. The checkbox on each row sets InfoPanel's Hidden flag.

## Faithful or native, per item

Each item has a mode badge. In the inspector, **Draw as a dashboard widget** switches it, and lists what would be lost (for example vertical gradient direction) and what the widget needs. Switching back restores every original field.

## Sensor source

| Source | Shows |
|---|---|
| Unbound | As InfoPanel with no sensors |
| Live | Real values from the Data API |
| Mock | A slider per item, to test ranges |

## Compare overlay

Lay InfoPanel's own screenshot over the render, with an opacity slider and a difference blend, to check the match.

- **Ctrl+Z**: Undo
- **Ctrl+Y**: Redo
- **Ctrl+D**: Duplicate
- **Ctrl+G**: Group
- **Ctrl+Shift+G**: Ungroup
- **Delete**: Delete
- **Arrows**: Nudge 1 px
- **Shift+Arrows**: Nudge 10 px
