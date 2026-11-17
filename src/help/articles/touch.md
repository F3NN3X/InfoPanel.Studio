---
id: touch
title: Touch panels
icon: touch_app
related: [kiosk, startup, problems]
verified: 1.3.1-beta.3
---

Use a USB touch display to drive the kiosk on it. Studio reads the touchscreen itself, so Windows never sees a touch: touching the panel never moves the mouse or takes focus from the game or app you're using. This is experimental.

## How it works

- Studio reads the touchscreen itself, over USB.
- InfoPanel shows the panel's kiosk page full screen on that display.
- Interactive stays off in InfoPanel, or Windows gets the touches too and moves the mouse.

The panel's kiosk is a display on **Screens**, named after the panel. Which screen it shows is chosen in Studio, never in its address.

## What you need

- A display whose touch comes over USB as a standard touchscreen. Pens, touchpads and the built-in touchscreens of most laptops don't work.
- The touchscreen on the **WinUSB** driver instead of Windows' own, set once per touchscreen with Zadig.
- InfoPanel Studio's desktop app. A studio in a browser shows touch as off and says so.

## Set up touch on a display

On **Screens**, each display on this PC has a **Touch** row. Press **Set up touch** and Settings › App › Touch opens the guided setup for that display. It goes step by step, and you can close it at any time: it opens again at the first step not done.

1. **Turn on touch panels**, if they are off.
2. **Pick the touchscreen.** If Windows owns it, the step shows the Zadig steps with its exact USB ID, and finishes by itself once the touchscreen is ready.
3. **Pair it with its screen.** Touch the target on the panel's screen. Studio learns which touchscreen and which display belong together, and takes the panel's size from the display.
4. **Size and rotation.** Check the size, turn touches to match a panel mounted sideways, and press **Looks right**.
5. **Show its kiosk in InfoPanel.** Add a Web Page profile, set its URL to the address shown (**Copy**), show it full screen on the panel's display and turn Interactive off. This is the only time you copy it.
6. **Try a tap.** The tap shows in the setup, and the kiosk on the panel reacts. The display card on Screens then says **Ready**.

A setup started from a named display gives the new panel the display's name, so the display and its panel are one card on Screens.

Each step says what is wrong in the same words as the kiosk's status strip.

Close touch-kit's Touch Panel app first if it runs: only one app can read a touchscreen at a time.

## Which screen a panel shows

Choose it in any of these places; they set the same thing:

- **Shows** on the panel's display card on Screens.
- **Use on touch panel** in a screen's **⋯** menu, or **Show on…** in the screen's **Shown on**. The screen's card then says **On Panel 1 (touch)**.
- **Shows** on the panel's card in Settings › App › Touch.

A panel can be chosen once its kiosk has opened in InfoPanel. An older panel address with `&profile=` in it still works and pins its screen: the cards say **Pinned by its link**. Take `&profile=` out of the address in InfoPanel to choose here.

## The manual way

Settings › App › Touch has every step by hand. Each panel's card starts with where it stands, such as **Ready: touches go to the kiosk on DISPLAY4**, and a **Continue setup…** button while something is missing. Below it:

- **Shows**: the screen on the panel.
- **Show this on the panel's display**: the four steps for InfoPanel, with the address to copy.
- **Fix touches**: Identify, Pair… and Calibrate…, only needed when the wrong screen reacts or touches land beside your finger.
- **Advanced**, folded: Name, Id, Size, Rotation, Mirror and the USB port.

**Set up a panel…** starts the guided setup for a new panel; **Add panel by hand** adds an empty one.

:::open settings/touch Settings › App › Touch

Close touch-kit's Touch Panel app first if it runs: only one app can read a touchscreen at a time.

## On the kiosk

| Touch | Does |
|---|---|
| Tap | Clicks whatever is under your finger |
| Swipe with one finger | Changes page, when page dots and swipe are on |
| Swipe left or right with two fingers | Next or previous page |
| Tap with three fingers | Shows or hides the touch status strip |

Other gestures and actions go in `touch.json` (**Show touch.json** on the Touch page). The thresholds are under **Gesture tuning**. A page pinned with `?page=` stays on its page.

## Fix touches

On a ready panel's display card, the **⋯** next to **Ready** has **Identify**, **Calibrate…** and **Remove…**; each opens Settings › App › Touch and does it there.

- **Identify** shows the panel's name on its screen.
- **Pair…** shows "Touch this screen" on the panel's display; the touchscreen you touch becomes the panel's.
- **Calibrate…** shows four circles one after another. Tap the centre of each; the fit is saved when the taps agree. **Reset** goes back to mapping by size.
- **Virtual panels** under Testing replay touches recorded on a real panel, so you can try touch without one. Open their kiosk with **Open its kiosk**.

## If touches don't work

- The kiosk says what is wrong along its bottom edge: no connection to Studio, the touchscreen not found, touch turned off, or a page that doesn't fill the touch display.
- Touches that land beside your finger: check Rotation and Mirror under the panel's **Advanced**, then calibrate.
- The kiosk URL only works on the PC running InfoPanel Studio: it uses `127.0.0.1`, and the touch stream answers only there.
- **Uninstall…** next to a ready touchscreen gives it back to Windows. Windows asks for admin permission once.
