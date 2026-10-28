---
id: problems
title: Common problems
icon: build
related: [diagnostics, kiosk, performance, sensors]
verified: 1.3.0-beta.36
---

Quick fixes for the things that go wrong most.

## The display says it can't connect

1. Check the status pill in Settings: the server must be running.
2. Compare the port in the kiosk URL in InfoPanel with Settings › App › Server.
3. If you chose Local network and InfoPanel is on another device, allow InfoPanel Studio through Windows Firewall.

## The server won't start (port in use)

Another program holds the port. Settings › App › Server explains "Port N is already in use by another app" and offers a button to switch to the next free port, such as **Use 3923**. Press it, then update the kiosk URL in InfoPanel.

If the message says another InfoPanel Studio server is already running on that port, for example from `start-dashboard.bat`, choose **Use it** when the button is offered, or close that program and start the server again. If Windows blocked the port, the message offers **View logs**.

## The studio opens in the app window, not the browser

- With **Microsoft Edge (app mode)**, the studio does open in Edge, in a window with no tabs or address bar. Its taskbar button is Edge's.
- If the studio window is already open, the tray brings it to the front. Close it to the tray, then open the studio again.
- If the server isn't running within 30 seconds, the app shows its own window with the start page, which names the problem.

## Widgets show dashes or zeros

- InfoPanel must be running with its Data API enabled.
- The sensor may have a new name after a driver or hardware change. Re-pick it in the widget's **Data** tab.
- Plugin widgets (Spotify, Weather, Steam and others) need that plugin enabled in InfoPanel.

## Edits don't show on the display

- Look for a dot on the studio's **Save** button and press it.
- Check the kiosk shows the screen you are editing. With **Best fit for the window** it opens the closest size, and the card tagged **Default · best fit** in Screens shows which one. With **Always ‹screen name›** it opens the card tagged **Default**.

## The display's GPU stays busy

InfoPanel's web view keeps the GPU busy while the dashboard barely changes.

1. Open **Screens**, pick the screen, and in its **Performance** group set **Frame-rate cap** to 30 or 15.
2. Check that the kiosk URL in InfoPanel doesn't carry `&fps=60` or `&fps=0`.
3. On a display where nothing needs to move, set **Animations** to Reduced.
5. After updating InfoPanel Studio, restart InfoPanel. It doesn't reload the kiosk page by itself.

See [Frame rate and motion](performance) for what each setting changes.

## An imported profile looks different

- Missing fonts are the usual cause. Open **Library › Fonts** and add the missing families.
- Items set to native follow your theme. Switch them back to InfoPanel with **Draw as** to match InfoPanel exactly.

## Still stuck?

Turn on **Debug mode**, reproduce the problem, then use **Copy diagnostics summary** and attach it to an issue. See [Diagnostics and logs](diagnostics).
