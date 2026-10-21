---
id: quickstart
title: Quick start
icon: rocket_launch
related: [concepts, studio, kiosk]
verified: 1.3.0-beta.1
---

From a fresh install to a live dashboard on your InfoPanel display.

## 1. Check the server is running

The status pill at the bottom of the Settings sidebar should say **Server running**. If it says stopped, open Settings › Server and press **Start server**.

:::open settings/server Settings › Server

## 2. Size the profile for your screen

A fresh install has one blank profile, **Main display**, at 1920 × 1080. Open **Screens** (the screen name in the title bar, **Manage screens…**) and press **New screen** to make one at your display size. A new screen is named after its size and uses the size of the studio window, so resize the window first, or pick a **Size preset** such as 1920 × 550 under **Size & fit**. The grid is created for you.

:::tip
To see a finished example first, press **Use sample layout** on the empty canvas. It builds a 1920 × 550 profile you can take apart.
:::

## 3. Add widgets

1. Open **Widgets** on the left rail.
2. Filter with the chips (System, Hardware, Network, Media and more) or search.
3. Drag a widget onto the grid. It snaps to cells and takes its minimum size.
4. Drag the corner handle to make it bigger.

Not sure where to start? Add a layout starter such as the stat row from **Layouts**, then pick a sensor for each stat.

## 4. Choose a look

Open **Theme** on the rail and pick a skin under **1 · Start from**. The scope bar decides where it applies: **All screens**, or just this screen.

## 5. Put it on the display

1. Open Settings › Server and press **Copy** next to the kiosk URL (`http://127.0.0.1:3922/?kiosk=1` by default).
2. In InfoPanel, create a profile for your desktop display, turn on **Web Page** mode and set the URL to the one you copied.
3. Your dashboard appears. Edits in the studio show up there right away.

:::note
InfoPanel and the kiosk URL have to use the same port. If you change the port in Settings, update the URL in InfoPanel too.
:::
