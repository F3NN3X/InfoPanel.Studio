---
id: profiles
title: Profiles and the grid
icon: aspect_ratio
related: [zones, themes, kiosk]
verified: draft
---
A profile is a page for one display size. Its grid decides where zones can go.

## Profile settings

| Setting | What it does |
|---|---|
| Size | The design size in pixels, usually your display's resolution. |
| Grid | Columns × rows. New profiles get 6 or 12 columns and 4 or 6 rows depending on size. |
| Fit | **Fill**: the grid stretches to the full height. **Scroll**: rows are 120 px tall and the page scrolls. |
| Gap / padding | Space between zones (default 12 px) and around the edge. |
| Theme, style, background | Inherit from the dashboard, or set this profile's own. |

## Which profile the kiosk shows

With **Auto**, the kiosk picks the profile whose size is closest to its window. You can also pin a profile in the kiosk URL. Keep one profile per physical display and Auto does the right thing.

## Shipped profiles

:::generated profiles.table

:::tip
Changing the grid keeps zones where they are in cells. If you halve the columns, widen zones afterwards or they will look narrow.
:::
