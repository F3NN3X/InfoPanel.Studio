---
id: panels
title: Panels
icon: dashboard_customize
related: [panel-widgets, presets, custom-css]
verified: draft
---
Compose your own zone from small widgets when no ready-made widget fits.

## Three layouts

| Layout | Places widgets | Options |
|---|---|---|
| **Stack** | In a row or column | Direction, wrap, and one 3×3 alignment picker (along: start/center/end/spread; across: start/center/end/stretch) |
| **Grid** | In cells | Columns 1–12, column sizes (`1fr`, `auto`, px), row sizes, cell alignment; per widget: span and start |
| **Overlay** | In Top / Middle / Bottom bands over an image | Dark scrim, band alignment, bottom band columns 1–12 |

A panel fills its zone (**Fill**) or shrinks to its content (**Hug**). Gap and padding go from 0 to 200 px, or auto.

## Editing a panel

1. Select the panel zone. The inspector shows **Panel**, **Layout**, **Widgets** (and **Background** for Overlay).
2. Press **Add** in the Widgets list and choose a kind.
3. Pick a sensor for it. The widget's own settings appear below the list.
4. Drag to reorder. Each row has hide, duplicate, copy/paste, change kind and delete.

:::tip
**Change kind** keeps the label, sensor, unit and colour, so you can try a gauge, then a bar, without setting it up again.
:::

## Code mode

Switch the Panel card to **Code** to edit the whole panel as JSON. Press **Apply** or `Ctrl+Enter`; the change is one undo step.

## Saving a panel

From the panel's **…** menu choose **Save panel**. It appears under My panels in the Add drawer, for every profile, and is included when you export. Each use is a fresh copy.
