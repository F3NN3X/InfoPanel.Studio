---
id: touch
title: Touch panels
icon: touch_app
related: [kiosk, startup, problems]
verified: 1.3.1-beta.3
---

Use a USB touch display to drive the kiosk on it. Studio reads the touchscreen itself, so Windows never sees a touch: touching the panel never moves the mouse or takes focus from the game or app you're using. This is experimental.

## What you need

- A display whose touch comes over USB as a standard touchscreen. Pens, touchpads and the built-in touchscreens of most laptops don't work.
- The touchscreen on the **WinUSB** driver instead of Windows' own, set once per touchscreen with Zadig.
- InfoPanel showing the kiosk in a Web Page profile that fills that display exactly, with Interactive off.

## Turning it on

1. Open Settings › App › Touch and turn on **Touch panels**.
2. Under **Touchscreens**, find your display. If it says Windows owns it, follow the Zadig steps shown under it; it turns ready by itself when they're done.
3. Press **Set up panels…** and tap the circle on each touch display. Studio learns which touchscreen belongs to which display and sets each panel's size.
4. Copy the panel's kiosk URL and set it as the URL of a Web Page profile on that display in InfoPanel. Add `&profile=<id>` to pin a screen.

:::open settings/touch Settings › App › Touch

Close touch-kit's Touch Panel app first if it runs: only one app can read a touchscreen at a time.

## On the kiosk

| Touch | Does |
|---|---|
| Tap | Clicks whatever is under your finger |
| Swipe with one finger | Changes page, when page dots and swipe are on |
| Swipe left or right with two fingers | Next or previous page |
| Tap with three fingers | Shows or hides the touch status strip |

Other gestures and actions go in `touch.json` (**Show touch.json** on the Touch page). A page pinned with `?page=` stays on its page.

## Panel tools

- **Identify** shows the panel's name on its screen.
- **Pair…** shows "Touch this screen" on the panel's display; the touchscreen you touch becomes the panel's.
- **Calibrate…** shows four circles one after another. Tap the centre of each; the fit is saved when the taps agree. **Reset** goes back to mapping by size.
- **Virtual panels** under Testing replay touches recorded on a real panel, so you can try touch without one. Open their kiosk with **Open its kiosk**.

## If touches don't work

- The kiosk says what is wrong along its bottom edge: no connection to Studio, the touchscreen not found, touch turned off, or a page that doesn't fill the touch display.
- Touches that land beside your finger: check Rotation and Mirror on the panel, then calibrate.
- The kiosk URL only works on the PC running InfoPanel Studio: it uses `127.0.0.1`, and the touch stream answers only there.
- **Uninstall…** next to a ready touchscreen gives it back to Windows. Windows asks for admin permission once.
