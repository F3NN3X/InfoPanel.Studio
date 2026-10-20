---
id: import
title: Importing a profile
icon: download
related: [canvas, remap, assets]
verified: draft
---
Bring an existing InfoPanel profile into the studio without losing anything.

## The import flow

:::flow
Source — File, folder, installed or saved
Mode — Faithful, native or both
Report — What converts and why
Remap — Fix sensors
Save — Into a canvas zone
:::

## 1. Source

- An `.infopanel` file or an extracted folder.
- A profile installed in InfoPanel on this PC (read-only).
- A canvas you saved earlier (`.canvas.zip`).

## 2. Default mode

| Mode | Result |
|---|---|
| **Faithful** | Every item drawn exactly as InfoPanel draws it. The theme never touches it. |
| **Native where possible** | Items become dashboard widgets (text, value, bar, gauge…) that follow your theme. |
| **Both** | One canvas of each, side by side, to compare. |

This only sets the starting point. You can switch any item later, without loss.

## 3. Report

Before committing, the report lists items per kind, how many go native and why the rest stay faithful, sensors by match status, assets (unused, duplicates, missing), fonts and gauges.

## 4. Remap and save

Fix sensors that didn't match this PC (see [Sensor remap](remap)), then save. The profile becomes a new dashboard profile at the InfoPanel size, filled by a canvas zone. A canvas zone can also sit beside widgets in an existing profile.

## Exporting back

**Export .infopanel** writes a profile InfoPanel can open, with assets included. **Save stored form** writes a `.canvas.zip` that reopens with your modes, remaps, fonts and assets intact.
