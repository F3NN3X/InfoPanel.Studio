---
id: widget-settings
title: Widget settings
icon: tune
related: [themes, widgets, custom-css]
verified: draft
---
Every widget has the same four tabs, filed by the question they answer.

| Tab | Answers | Holds |
|---|---|---|
| **Show** | What is on it? | Header (title, icon), the widget's own content sections, Fit (small zones, density) |
| **Style** | How does it look? | Skin & graphics, Colors, Widget colors, Surface, Typography, Size & spacing, Border & glow, Custom CSS |
| **Data** | Where do values come from? | Device, sensors, source; Units & format |
| **Behaviour** | How does it react? | Thresholds, history, dynamics, Dynamic Island, Motion |

Widget-specific sections come first in each tab, shared ones after. A tab with nothing in it for this widget is greyed out.

## Finding a setting

- Type in the inspector's search box. Results name the tab and section.
- Press **Changed** to list only what you have changed on this widget.
- Rows marked **More** are less common; open them at the end of a section.

## Setting dots

A filled accent dot means the row has its own value on this widget. Click the dot to reset just that row. Sections show a pill instead: **Theme**, **Custom** or **Locked**.

## Common controls

| Control | Works like this |
|---|---|
| Thresholds | A green / amber / red bar with Warning and Critical sliders. Critical can't go below Warning. |
| Device | **Auto** first, with its rule and current pick (for example busiest adapter · now Ethernet 2), then every detected device. |
| Units & format | Temperature °C / °F, rate (auto, MB/s, Mb/s…), decimals, 12 / 24 h. Set once in the theme. |
| Widget colors | Each colour has a role (Series 1–6, OK, Warning, Critical, Accent) that follows the theme palette until customised. |

## Copying a look

From the Style tab's preset menu: **Copy style**, **Paste style**, **Save as preset**, or **Use as theme** to push this widget's look up to the profile.
