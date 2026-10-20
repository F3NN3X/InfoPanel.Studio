---
id: problems
title: Common problems
icon: build
related: [diagnostics, kiosk, sensors]
verified: draft
---
Quick fixes for the things that go wrong most.

## The display says it can't connect

1. Check the status pill in Settings: the server must be **running**.
2. Compare the port in the kiosk URL in InfoPanel with Settings › Server.
3. If you chose Local network and InfoPanel is on another device, allow InfoPanel Studio through Windows Firewall.

## The server won't start: port in use

Another program holds the port. Settings › Server shows **Use 3923** (or the next free port); press it, then update the kiosk URL in InfoPanel.

## Widgets show dashes or zeros

- InfoPanel must be running with its Data API enabled.
- The sensor may have a new name after a driver or hardware change. Re-pick it in the widget's Data tab.
- Plugin widgets (Spotify, Weather, Steam…) need that plugin enabled in InfoPanel.

## Edits don't show on the display

- Look for a dot on the studio's **Save** button and press it.
- Check the kiosk shows the profile you are editing; with Auto it picks the closest size.

## An imported profile looks different

- Missing fonts are the usual cause. Open Assets › Fonts and add the missing families.
- Items set to native follow your theme. Switch them back to Faithful to match InfoPanel exactly.

## Still stuck?

Turn on debug mode, reproduce the problem, then use **Copy diagnostics summary** and attach it to an issue. See [Diagnostics and logs](diagnostics).
