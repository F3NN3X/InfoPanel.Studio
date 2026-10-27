---
id: updates
title: Updates
icon: system_update
related: [startup, kiosk]
verified: 1.3.0-beta.36
---

Get new versions, and see what changed.

Settings › App › Updates checks for a new version, downloads it and installs it on restart. Installing restarts the app and the kiosk server; the display is blank for about 10 seconds. The update card has **Check now**, **Download**, **Cancel**, **Restart and update**, **What's new** and **Try again**, depending on the state.

| Option | Effect |
|---|---|
| **Release channel** | **Stable**, or **Beta** to get features a few weeks early |
| **Check for updates at startup** | Look for updates each time the app starts |
| **Download in the background** | Download automatically; install on the next restart |

On Stable, a note appears under the update card when a beta newer than your version exists. It names the version and has **Switch to Beta and check**. Stable itself never downloads a beta. If the beta list can't be read, the note doesn't show.

:::open settings/updates Settings › App › Updates

Settings › Changelog lists the last 10 releases. The newest is open and older ones are collapsed; each category lists its main changes, with **Show all** for the full notes. An "Installed" chip marks your version. Older releases are on GitHub: the link at the end of the page and **Releases on GitHub** in the sidebar both open the releases page in your browser.

:::open settings/changelog Settings › Changelog
