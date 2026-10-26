---
id: quickstart
title: Quick start
icon: rocket_launch
related: [concepts, studio, kiosk]
verified: 1.3.0-beta.34
---

From a fresh install to a live dashboard on your InfoPanel display.

The first time the studio opens with no saved dashboard, the setup fills the window. It has five steps:

1. **Welcome** shows how InfoPanel, Studio and your panels fit together. The data checks start here, in the background.
2. **Data checks** tests each link from InfoPanel to your screens, in order: InfoPanel installed, running, a build with the Data API, the Data API turned on, the Data API answering, sensors found, readings that change, and Studio's own server. A check that fails or warns opens with the steps to fix it, and some fixes have a button (start InfoPanel, use the address InfoPanel's settings name). Nothing here blocks you: you can carry on without live data.
3. **Your screen** picks the size of your display from the same presets as the New page, this window's size, or a size you type.
4. **Start** makes your first screen from a template (shown with your own readings), an InfoPanel profile, or a blank grid. **Browse all** opens the New page at that size after setup.
5. **Finish** sums it up and sets whether Studio starts with Windows and checks for updates.

The data checks also show your kiosk address, with a QR code for a tablet or phone. To run the setup again, open Settings › General and choose **Run setup**, or choose **Run setup again** at the bottom of this Help's sidebar. Run again keeps your screens: it adds a screen only if you pick one in Start.

## 1. Check the server is running

The Server item in the status bar at the bottom of the studio should show the port it is serving on. If the server is stopped, open Settings › App › Server and press **Start server**.

:::open settings/server Settings › App › Server

## 2. Make a screen for your display

A fresh install has one blank screen, **Main display**, at 1920 × 1080. To make one at your display size, open **Screens** (on the rail) and press **New**. The New page opens with the gallery on the left and the settings for your pick on the right.

1. Pick **Blank grid** or a template. Search covers template names, the widgets they use and the sensors they read, and the chips narrow the list by shape. Templates sit in sections by shape, with your recently used ones first.
2. Check the size. A template comes at the size it is made for, marked with a ★ in the size list. Choose another preset or type a width and height.
3. Pick a palette, check the sensors it found on this PC, and name the screen.
4. Press **Create screen**.

You can change the size later under **Size & fit**. The grid is created for you.

:::tip
To see a finished example first, press **Use sample layout** on the empty canvas. It builds a 1920 × 550 screen you can take apart.
:::

## 3. Add widgets

1. In Design, open the **Add** tab in the left panel.
2. Filter the **Widgets** list with the chips (System, Hardware, Network, Media and more) or search.
3. Drag a widget onto the grid. It snaps to cells and takes its minimum size.
4. Drag the corner handle to make it bigger.

Not sure where to start? Open the **Layouts** tab, add a layout starter such as the stat row, then pick a sensor for each stat.

## 4. Choose a look

Open **Theme** on the rail and pick a look under **1 · Start from**: a palette, a skin, a saved Theme or the look of a screen template. The scope bar decides where it applies: **All screens**, or just this screen.

## 5. Put it on the display

1. Open Settings › App › Server and press **Copy** next to the kiosk URL (`http://127.0.0.1:3922/?kiosk=1` by default).
2. In InfoPanel, create a profile for your desktop display, turn on **Web Page** mode and set the URL to the one you copied.
3. Your dashboard appears. Edits in the studio show up there right away.

:::note
InfoPanel and the kiosk URL have to use the same port. If you change the port in Settings, update the URL in InfoPanel too.
:::
