---
id: import
title: Importing and exporting
icon: download
related: [canvas, remap, assets]
verified: 1.3.0-beta.1
---

Bring files into the studio and take them out again, without losing anything.

## The Import door

Press **Import** in the title bar, or drop files anywhere in the window. The door reads what a file is from its contents, not its name, and shows what it found:

| File | What it does |
|---|---|
| A config backup | **Replace everything** (the default) or **Add its screens only**. "Back up the current dashboard first" is on by default: a Save As asks where to keep the backup, and if you cancel it nothing is replaced (untick the box to replace without one). A restore is one undo step. |
| A screen (profile) file | Becomes a new screen. |
| An `.infopanel` file or a stored canvas | The InfoPanel steps below, landing as a new screen or a canvas zone on the current page, whichever you chose in the door. |
| A gauge file, SVG template or frames `.zip` | Saved in Library › Gauges and opened in the gauge editor. |
| An image, video, font or font pack | Saved in Library › Media or Fonts, with "Also use it as the background for ‹screen›". |

Drop several files together and the door lists each one; a file it doesn't recognise says so and the rest go on. One config and one InfoPanel file are taken per run.

## The InfoPanel import flow

An `.infopanel` file goes through five steps.

:::flow
Source — File or folder, installed, or saved
Mode — Faithful, native or both
Review — What converts and why
Sensors — Fix sensors
Save — Into a canvas zone
:::

## 1. Source

- **File or folder**: an `.infopanel` file, an extracted folder, or a `.canvas.zip`. Use **Choose file…** or **Choose folder…**, or drop it on the door.
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

Fix sensors that didn't match this PC (see [Sensor remap](remap)), then go to **Save**. Set the **Name**; where it lands (a **New screen** at the InfoPanel size, or a **Canvas zone** on the current page) was chosen in the door. You can also tick "Also save the stored form (.canvas.zip) to the Library". Press the **Import** button. The whole import is one undo step.

## Export & back up

Press **Export & back up** in the title bar. The sheet has a row for each thing you can take out, and every row has **Copy JSON**, which copies exactly what the file holds:

- **Back up everything**: **Save backup** writes `infopanel-studio-config.json`, which the Import door restores.
- **Export this screen**: one screen as a `.json` file.
- **Export a page for InfoPanel**: **Export…** opens the InfoPanel export below. It is off, with its reason, when the page has no canvas zone.
- **Export a gauge**: **Choose…** lists Library › Gauges.

## Exporting a canvas for InfoPanel

The InfoPanel export dialog is titled "Export" followed by the canvas name.

| Choice | Writes |
|---|---|
| **Stored form** | A `.canvas.zip` that reopens with your modes, remaps, fonts and assets intact |
| **.infopanel for InfoPanel** | A profile InfoPanel can open, with assets included |

For the InfoPanel form you can turn on **Bake stale vector gauges first** and **Leave unused assets out**. The dialog also reviews font licences before you share.
