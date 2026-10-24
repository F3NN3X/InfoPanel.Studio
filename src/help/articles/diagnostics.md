---
id: diagnostics
title: Diagnostics and logs
icon: monitoring
related: [problems, kiosk]
verified: 1.3.0-beta.18
---

Find out what went wrong, and give a bug report everything it needs.

## Debug mode

**Debug mode** logs every server request and samples memory every 30 seconds. Turn it on in Settings › Diagnostics and restart the server. Leave it off day to day: it writes a lot of log lines.

:::open settings/diagnostics Settings › Diagnostics

The page also has **View logs**, **Open logs folder**, **Open DevTools** and **Copy diagnostics summary**.

## Server

**Server** picks which dashboard server the app runs. **Native**, the default, runs it inside the app: about 40 MB for the app and server together, and one process. **Node** runs the older server as a separate `node.exe` process, about twice the memory. Both answer kiosks the same way and read and write the same files, so you can switch back and forth. Node stays available for a while in case Native gives you trouble; if it does, switch to Node and report the problem with the log lines from around it.

A change takes effect when the server restarts, so the page shows the restart bar.

## Reading the samples

The table shows each series with its latest value and the change over 30 and 60 minutes. Series are grouped by where they come from: `app`, `server`, `sidecar` (the Node server process, only when **Server** is Node), `studio` and `webview`. With the native server, the server's memory is part of the app's. A series is flagged when it rose in at least 80 % of samples and by more than 20 %. A flag after a few minutes means little; one after an hour points to a leak. **Notable** shows flagged series; **All** shows every series.

## Logs

Settings › Logs streams the **Server**, **App** and **Studio** logs. Filter by level (All, Errors, Warnings, Info, Debug) or by text with "Filter lines". **Follow new lines** keeps the newest line in view; scrolling up pauses it. **Copy** copies the lines and **Open file** opens the log file.

:::open settings/logs Settings › Logs

## Reporting a problem

1. Turn on debug mode and restart the server.
2. Reproduce the problem and leave it running for a while if it is a slowdown.
3. Press **Copy diagnostics summary**, and **Copy system info** in Settings › About.
4. Use **Report an issue** in About and paste both.

:::open settings/about Settings › About
