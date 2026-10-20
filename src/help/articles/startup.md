---
id: startup
title: Startup and tray
icon: power_settings_new
related: [kiosk, updates]
verified: 1.3.0-beta.1
---

Keep the kiosk working after a reboot, without the studio in the way.

| Setting | Recommended for a kiosk | Why |
|---|---|---|
| **Start at login** | On | Starts in the tray after a reboot |
| **Start the server on launch** | On | The kiosk works as soon as the app is up |
| **Open the studio on launch** | Off | Starts quietly; open the studio from the tray |
| **Close to tray** | On | Closing the window keeps the server running |

**Remember window size and position** is also in this list. Every one of these is on by default, including **Open the studio on launch**, so turn that one off for a quiet start.

:::open settings/general Settings › General

## App zoom

**App zoom** scales the Settings window from 80 % to 150 %. It doesn't change the kiosk. `Ctrl +` and `Ctrl −` step through the sizes and `Ctrl 0` resets, while the Settings window is focused. In the studio, those keys zoom the canvas instead.
