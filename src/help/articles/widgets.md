---
id: widgets
title: Widgets
icon: widgets
related: [widget-settings, sensors, panels]
verified: 1.3.0-beta.28
---

Ready-made modules that read sensors and adapt to their zone.

## The widget list

:::generated widgets.table

Open **Add widget** in Design's left panel to browse them. The chips are All, Layouts, My panels, System, Hardware, Storage, Network, Media, Audio, Info, Gaming and Generic.

## Adapting to size

Most widgets pick a layout from the space they get. In **Show › Fit**, **Small zones** decides what happens when the zone is small:

- **Auto**: the widget decides.
- **Full**: always the full layout, scaled down.
- **Card**: a summary card with the key value.
- **Dense**: everything, packed tighter.

Which choices appear depends on the widget. **Density** (Auto, Roomy, Standard, Compact, Minimal) sits under **More**.

## Time and status widgets

Three widgets join the calendar, the weather, OBS and the clock. None of them has an InfoPanel version, so the conversion leaves them out.

- **Day Planner** lays today's calendar events along a time rail, with a line for now. Events that overlap sit side by side. Behind them a band shows the temperature and the rain. **Look ahead** sets how far the rail reaches; 24 and 36 hours include tomorrow. It refreshes once a minute. Add the calendar links under **Island › Calendar**. The weather comes from the Yr weather plugin. The server has no hourly forecast, so the band is worked out from the current reading and each day's high, low and rain: read it as a shape, not a reading.
- **Radial Clock Stack** draws rings for the day, the year (or the week), one sensor you pick, and the time to the next calendar event, with the time in the middle. The event ring fills during the run-up you set. The seconds ring is off by default; with it on, the widget refreshes every second instead of every minute.
- **On-Air Beacon** reads OBS and shows LIVE, REC, LIVE + REC or Off air in a colour for each state, with the time it has been going. OBS does not report that time, so it counts from when the dashboard first sees the state; a page opened mid-stream starts at zero. The live state pulses softly, and the pulse stops with reduced motion. Connect OBS under **Island › On air**.

Without a calendar or OBS set up, the studio shows a short hint in the widget. On a kiosk the widget stays quiet.

## Tint

The Weather widget can tint its surface from the current conditions. Find it in **Style › Widget colors**.
