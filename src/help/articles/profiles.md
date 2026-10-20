---
id: profiles
title: Profiles and the grid
icon: aspect_ratio
related: [zones, themes, kiosk]
verified: 1.3.0-beta.1
---

A profile is a page for one display size. Its grid decides where zones can go.

## Managing profiles

Open **Profiles** on the left rail.

- **New profile** (the **+** button) adds a profile named after its size, such as `1920×550`, using the size of the studio window.
- A row's **Profile actions** menu has Rename…, Size, grid and spacing…, Copy profile JSON and Delete profile.
- **Auto-pick by window size** lets the studio and the kiosk choose the profile closest to the window.

A fresh install has one blank profile, **Main display**, at 1920 × 1080 with a 12 × 6 grid in Scroll mode. On the empty canvas, **Use sample layout** builds a 1920 × 550 sample you can take apart.

## Profile settings

With nothing selected, open **Dashboard › Profile**.

| Setting | What it does |
|---|---|
| **Design size** | Presets for 1920 × 550, 1920 × 1080, 2560 × 720, 1280 × 400, 1024 × 600, 800 × 480, or Custom. Width and Height hold the exact pixels. |
| **Grid columns** / **Grid rows** | 2 to 24 columns and 1 to 24 rows. A new profile gets 6 or 12 columns and 4 or 6 rows depending on its size. |
| **Fit mode** | **Fill**: the grid stretches to the full height. **Scroll**: rows are 120 px tall and the page scrolls. |
| **Gap** and **Padding** | Space between zones (default 12 px, up to 200) and around the edge. |
| **Corner radius** | How round the zones' corners are. |
| **Theme**, **Style**, **Background** | Inherit from the dashboard, set this profile's own, or (for the background) none. |

## Pages

A profile holds one or more pages that share its grid. See [The studio](studio#pages) for the page tabs and rotation.

## Which profile the kiosk shows

With **Auto-pick by window size**, the kiosk picks the profile whose size is closest to its window. Keep one profile per physical display and Auto picks the right one.

:::tip
Changing the grid keeps zones where they are in cells. If you halve the columns, widen zones afterwards or they will look narrow.
:::
