---
id: panels
title: Panels
icon: dashboard_customize
related: [panel-widgets, presets, custom-css]
verified: 1.3.0-beta.1
---

Compose your own zone from small widgets when no ready-made widget fits.

## Three layouts

| Layout | Places widgets | Options |
|---|---|---|
| **Stack** | In a row or column | Direction (Row or Column), Wrap, and a 3 × 3 alignment picker with Spread |
| **Grid** | In cells | Columns 1 to 12, column sizes, row sizes, cell alignment; per widget: span and start |
| **Overlay** | In bands over an image | Background image, a dark scrim over the image, band alignment, bottom band columns |

A panel fills its zone (**Fill**) or shrinks to its content (**Hug**). Gap and padding go from 0 to 200 px, or auto.

## Editing a panel

1. Select the panel zone. The inspector shows the usual four tabs; the panel's own sections are **Panel**, **Layout** and **Widgets**.
2. In the Widgets list, choose **+ Add panel widget…** and pick a kind.
3. Pick a sensor for it. The widget's own settings appear below the list.
4. Each row has Move up, Hide, Duplicate and Delete, and a **Widget actions** menu with Copy, Paste after and Change kind.

:::tip
**Change kind** keeps the label, sensor, unit and color, so you can try a gauge, then a bar, without setting it up again.
:::

## Code mode

Switch the Panel section's **Editor** from **Visual** to **Code** to edit the whole panel as JSON. Press **Apply** or `Ctrl+Enter`; the change is one undo step.

## Saving a panel

From the panel header's **More panel actions** menu choose **Save as panel preset…**, name it, and it appears under **My panels** in **Add**, for every profile. It is included when you export. Each use is a fresh copy.
