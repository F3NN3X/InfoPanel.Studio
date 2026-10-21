---
id: widget-settings
title: Widget settings
icon: tune
related: [themes, widgets, custom-css]
verified: 1.3.0-beta.1
---

Every widget and panel has the same four tabs, filed by the question they answer.

| Tab | Answers | Holds |
|---|---|---|
| **Show** | What is on it? | Header (title, icon, widget type, visible), the widget's own content sections, Fit (small zones, density) |
| **Style** | How does it look? | Skin & graphics, Colors, Widget colors, Surface, Typography, Size & spacing, Border & glow, Custom CSS |
| **Data** | Where do values come from? | Bound data, device and sources, Units & format |
| **Behaviour** | How does it react? | Thresholds, the widget's own behaviour, Dynamic Island, Motion |

Widget-specific sections come first in each tab, shared ones after. With nothing selected, the inspector shows the profile's **Layout**, **Look** and **Behaviour** instead, without the search box and the Changed filter. The theme editor has Style, Data and Behaviour tabs.

## Finding a setting

- Type in the inspector's search box. Results name the tab and section.
- Turn on **Changed** to list only what you have changed on this widget. **Reset all** clears them.
- Open **More** at the end of a section for less common rows.
- Press the pin button on a row to pin it to the quick bar, up to 6 per widget type. Turn the bar on under **Behaviour › Studio › Quick bar**, with nothing selected.

## Setting dots

A dot beside a row shows where its value comes from. No dot means the default. Other dots mean it comes from the dashboard style, from the profile style, is set on this widget, or is set here and overrides a global value. Click a set dot to reset only that row. The inspector footer has **What the dots mean**.

## Common controls

| Control | Works like this |
|---|---|
| Thresholds | A green, amber and red bar with **Warning** and **Critical** sliders. Critical can't go below Warning. **Off** turns thresholds off. The quantity is Load, Temperature, Fullness, Audio level or Value. |
| Device | **Auto** first, with its rule and current pick (for example "busiest adapter"), then every detected device. |
| Units & format | Temperature °C / °F, speed units, decimals, clock format. Set once in the theme. |
| Widget colors | Each color has a role (Series 1 to 6, OK, Warning, Critical, Accent) that follows the theme palette until customized. |

## Copying a look

In the **Colors** header, the copy and paste icons copy one widget's style to another, and the three-dot menu has:

- **Use as global…** to push this widget's look up to All profiles or This profile.
- **Apply preset**, **Save as preset…** and **Delete preset**.

Right-click a zone for **Copy style**, **Paste style** and **Follow global style** too.
