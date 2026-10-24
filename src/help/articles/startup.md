---
id: startup
title: Startup and tray
icon: power_settings_new
related: [kiosk, updates]
verified: 1.3.0-beta.20
---

Keep the kiosk working after a reboot, without the studio in the way.

| Setting | Recommended for a kiosk | Why |
|---|---|---|
| **Start at login** | On | Starts in the tray after a reboot |
| **Start the server on launch** | On | The kiosk works as soon as the app is up |
| **Open the studio on launch** | Off | Starts quietly; open the studio from the tray |
| **Close to tray** | On | Closing the window keeps the server running |

**Remember window size and position** is also in this list. Every one of these is on by default, including **Open the studio on launch**, so turn that one off for a quiet start.

:::open settings/general Settings › App › General

## Where the studio opens

**Open the studio in**, under Window in Settings › App › General, picks what the tray, a second launch and Settings' links open:

| Choice | What opens |
|---|---|
| **App window** | The app's own studio window (the default) |
| **Microsoft Edge (app mode)** | Edge without tabs or an address bar. It looks almost like the app window, but its taskbar button is Edge's |
| **Default browser** | A tab in your default browser |

With either browser choice the app runs no studio window of its own, and closing the tab or window frees all of its memory. A browser that is already open costs least: the studio adds about 100 MB to a running Edge, where the app window takes about 500 MB. Started from cold, a browser takes about 400 MB, still less than the app window. If your default browser isn't based on Chromium (Firefox, for example), the preview may differ a little from what InfoPanel shows.

In a browser, the studio saves as soon as you switch away from its tab and asks before you close it with an unsaved change. Kiosk view opens in a window of its own, and Help opens in a tab. If a browser studio is already open, the app asks before opening a second one, since it can't bring that tab to the front.

## The studio in the background

Four settings, also under Window, keep a studio you aren't using from costing much:

| Setting | Default | What it does |
|---|---|---|
| **Refresh the Studio** | When idle for 30 minutes | Reloads the Studio page once it has sat unfocused this long, to give back memory a long session holds. The other choices are **Daily at 04:00** and **Off**. Edits are saved first |
| **Release the hidden studio** | After 10 minutes | When the studio has sat in the tray this long, its page is closed to give back its memory. Opening it from the tray rebuilds it in a moment. Edits are saved first; the undo history is lost |
| **Reduce studio animation when unfocused** | On | A minute after the studio loses focus, the canvas runs at 5 frames a second and weather, visualisers and other effects pause. They resume when you come back |
| **Design preview data** | Frozen when unfocused | Whether the Design canvas shows live sensor values or a snapshot. See [The studio](studio#design-preview-data) |

## App zoom

**App zoom** scales the studio and the app window from 80 % to 150 %. It doesn't change the kiosk. `Ctrl +` and `Ctrl −` step through the sizes and `Ctrl 0` resets, while the Settings window is focused. In the studio, those keys zoom the canvas instead.
