---
id: import
title: Importing a profile
icon: download
related: [canvas, remap, assets]
verified: 1.3.0-beta.1
---

Bring an existing InfoPanel profile into the studio without losing anything.

## The import flow

Press **Import** in the top bar. The dialog walks through five steps.

:::flow
Source — File or folder, installed, or saved
Mode — Faithful, native or both
Review — What converts and why
Sensors — Fix sensors
Save — Into a canvas zone
:::

## 1. Source

- **File or folder**: an `.infopanel` file, an extracted folder, or a `.canvas.zip`. Use **Choose file…** or **Choose folder…**.
- **Installed in InfoPanel**: a profile installed in InfoPanel on this PC (read-only).
- **Saved canvas**: a canvas you saved earlier.

## 2. Mode

| Mode | Result |
|---|---|
| **Faithful** | Every item drawn exactly as InfoPanel draws it. The theme never touches it. |
| **Native where possible** | Items become dashboard widgets (text, value, bar, gauge and more) that follow your theme. Scrolling text becomes a text widget that scrolls, and a Clock or Calendar keeps its format. Recommended. |
| **Both** | One canvas where each item keeps both forms, so you can switch any item later. |

This only sets the starting point. You can switch any item later, without loss.

## 3. Review

Before committing, the review shows tiles for Items, Native, Sensors, Assets, Fonts and Gauges. Below them: why some items stay InfoPanel, which app features native mode needs, items by kind, assets, fonts, whether the Data API on this PC answers, and any parse notes. Press **Looks right, continue**.

## 4. Sensors and save

Fix sensors that didn't match this PC (see [Sensor remap](remap)), then go to **Save**. Set the **Name** and where it **Lands**: a **New profile** at the InfoPanel size, or a **Canvas zone** in the current profile. You can also tick "Also save the stored form (.canvas.zip) to the Library". Press the **Import** button. The whole import is one undo step.

## Exporting back

Open **Export** in the top bar (or **Export InfoPanel canvas…** in the more actions menu). The dialog is titled "Export" followed by the canvas name.

| Choice | Writes |
|---|---|
| **Stored form** | A `.canvas.zip` that reopens with your modes, remaps, fonts and assets intact |
| **.infopanel for InfoPanel** | A profile InfoPanel can open, with assets included |

For the InfoPanel form you can turn on **Bake stale vector gauges first** and **Leave unused assets out**. The dialog also reviews font licences before you share.
