---
id: widget-settings
title: Widget settings
icon: tune
related: [themes, widgets, custom-css]
verified: 1.3.0-beta.36
---

Every widget and panel has the same four tabs, filed by the question they answer.

| Tab | Answers | Holds |
|---|---|---|
| **Show** | What is on it? | Header (title, icon, widget type, visible), the widget's own content sections, Fit (small sizes, density) |
| **Style** | How does it look? | Skin, Colors (with the widget's own colors), Typography (with Number glow: Auto keeps the skin's own glow, Off removes it, Soft and Strong set one, in the accent or a color you pick), Shape & spacing, Surface & effects, Border & glow, Advanced · CSS & locks |
| **Data** | Where do values come from? | Bound data, device and sources, Units & format |
| **Behavior** | How does it react? | Thresholds, the widget's own behavior, Motion, Send to island |

Widget-specific sections come first in each tab, shared ones after. With nothing selected, the inspector shows the **Page** you are on: its name and icon, the sections it customizes, **Show on kiosks now**, and links to the screen's layout, Theme and behavior. Theme lists the same sections in one ordered column.

Every Style section has a chip that says where its value comes from: **From ‹screen›**, **From theme**, **Changed here**, **Built-in** or **Locked** (see [Themes](themes#fine-tune)). Editing a row changes the section here. Click the chip, or the links under the rows, to **Reset to inherited**, **Change here** or open the level it comes from. With a section focused, Backspace resets it.

## Finding a setting

- Type in the inspector's search box. Results name the tab and section.
- A section's header counts what you changed in it. The reset button beside it clears those values.
- Open **More** at the end of a section for less common rows.
- Press the pin button on a row to pin it to the quick bar, up to 6 per widget type. Turn the bar on under **Settings › Studio › Quick bar**.

## Setting dots

A dot beside a row shows where its value comes from. No dot means the default. Other dots mean it comes from the app settings (the clock), from the screen's theme, is set on this widget, or is set here and overrides an inherited value. Click a set dot to reset only that row. The inspector footer has **What the dots mean**.

## Common controls

| Control | Works like this |
|---|---|
| Thresholds | A green, amber and red bar with **Warning** and **Critical** sliders. Critical can't go below Warning. **Off** turns thresholds off. The quantity is Load, Temperature, Fullness, Audio level or Value. |
| Device | **Auto** first, with its rule and current pick (for example "busiest adapter"), then every detected device. Audio widgets let you tick several devices, and **Show** (All devices, Outputs or Inputs) narrows the list. Each device is tagged Input or Output. |
| Units & format | Temperature °C / °F, speed units, decimals, clock format. Set once in the theme. |
| Widget colors | Each color has a role (Series 1 to 6, OK, Warning, Critical, Accent) that follows the theme's Series colors and Status colors until changed. |

## Copying a look

The **Style** tab starts with a toolbar:

- **Start from a Style** opens the built-in Styles (Follow theme, Matte dark, Matte light, Frosted, Monochrome) and the ones you saved. Follow theme clears the widget's own look. Applying one writes its sections to this widget.
- **Save as Style** keeps this widget's own look in the Library.
- **Make this the theme for…** moves the widget's custom sections to **This screen** or **This page**, after a confirm that lists them. The widget then follows the theme again.

Right-click a widget for **Copy style** and **Paste style**.
