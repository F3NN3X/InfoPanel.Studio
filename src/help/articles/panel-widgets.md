---
id: panel-widgets
title: Panel widgets
icon: view_comfy_alt
related: [panels, sensors, custom-css]
verified: 1.3.0-beta.33
---

The small building blocks you place inside a panel.

:::generated panel-widgets.table

## History

A sparkline keeps between 5 and 200 samples of the value.

## Scrolling text

A text widget can scroll like InfoPanel's marquee. Under Behaviour › Scrolling, turn on **Scroll when too long** and set the **Speed** (px per second) and the **Spacing** between repeats. The text scrolls only while it is wider than the widget, so give the widget a **Fixed** or **Fill** width. With Motion on Reduce it stays still and shows the start of the text.

## Time and date format

Set a clock widget to **Time** or **Date**, then type a .NET **Format** such as `hh:mm:ss tt` or `dd/MM/yyyy`. Empty uses the time and date settings under **Settings › Dashboard › Clock & date**. An InfoPanel Clock or Calendar keeps its format when it is imported.

## Shared options

Every panel widget also has a kind, content, size and placement, typography, color, class names and custom CSS, a sensor binding, units and format (unit, decimals, maximum, multiply by), thresholds and, for bars and gauges, an **Invert fill** switch.

| In a... | Placement means |
|---|---|
| Stack | **Hug** (content size), **Fill** (share the free space) or **Fixed** (px) |
| Grid | **Cell** or **Fixed** width, plus column and row span |
| Overlay | Which band the widget sits in |

Use **Align self** to override the panel's alignment for one widget.
