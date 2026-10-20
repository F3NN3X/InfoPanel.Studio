---
id: quickstart
title: Quick start
icon: rocket_launch
related: [concepts, studio, kiosk]
verified: draft
---
From a fresh install to a live dashboard on your InfoPanel display.

## 1. Check the server is running

The status pill at the bottom of the Settings sidebar should say **Server running**. If it says stopped, open Settings › Server and press **Start server**.

:::open settings/server Settings › Server

## 2. Pick a profile for your screen

Open the studio. In the drawer, switch to **Profiles** and pick the one closest to your display (for example `Kiosk strip 1920×550`), or press **New profile** and type your display size. The grid is created for you.

## 3. Add widgets

1. Switch the drawer to **Add**.
2. Filter with the chips (System, Media, Network, Info…) or search.
3. Drag a widget onto the grid. It snaps to cells and takes its minimum size.
4. Drag the corner handle to make it bigger.

:::tip
Not sure where to start? Add a **Layout starter** such as Row of stats and pick a sensor for each stat.
:::

## 4. Choose a look

Click an empty part of the canvas so nothing is selected. The inspector shows **Appearance**. Pick a preset (Dark, Glass, Neon…) and choose whether it applies to all profiles or this one.

## 5. Put it on the display

1. Open Settings › Server and press **Copy** next to the kiosk URL (`http://127.0.0.1:3922/?kiosk=1`).
2. In InfoPanel, add a web or browser item that fills your display and paste the URL.
3. Your dashboard appears. Edits in the studio show up there right away.

:::note
InfoPanel and the kiosk URL have to use the same port. If you change the port in Settings, update the URL in InfoPanel too.
:::
