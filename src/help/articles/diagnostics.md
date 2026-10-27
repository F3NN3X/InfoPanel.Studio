---
id: diagnostics
title: Diagnostics and logs
icon: monitoring
related: [problems, kiosk]
verified: 1.3.0-beta.36
---

Find out what went wrong, and give a bug report everything it needs.

## Debug mode

**Debug mode** logs every server request and samples memory every 30 seconds. Turn it on in Settings › Diagnostics and restart the server. Leave it off day to day: it writes a lot of log lines.

:::open settings/diagnostics Settings › Diagnostics

The page also has **View logs**, **Open logs folder**, **Open DevTools** (debug mode only), **Open WebView2 task manager** and **Copy diagnostics summary**. The task manager shows memory and CPU for each WebView2 process, such as the renderer and the GPU process, so you can tell which one grows.

**Widget QA** has an **Open** button below those. It opens a page in your browser that shows every widget at several sizes from fixture sensors, to spot text that overflows or is clipped.

## Reading the samples

The table shows each series with its latest value and the change over 30 and 60 minutes. Series are grouped by where they come from: `app`, `server`, `studio` and `webview`. The server runs inside the app, so its memory is part of the app's. A series is flagged when it rose in at least 80 % of samples and by more than 20 %. A flag after a few minutes means little; one after an hour points to a leak. **Notable** shows flagged series; **All** shows every series.

## Logs

Settings › Logs streams the **Server**, **App** and **Studio** logs. Filter by level (All, Errors, Warnings, Info, Debug) or by text with "Filter lines". **Follow new lines** keeps the newest line in view; scrolling up pauses it. **Copy** copies the lines and **Open file** opens the log file.

:::open settings/logs Settings › Logs

## Reporting a problem

1. Turn on debug mode and restart the server.
2. Reproduce the problem and leave it running for a while if it is a slowdown.
3. Press **Copy diagnostics summary**, and **Copy system info** in Settings › About.
4. Use **Report an issue** in About and paste both.

:::open settings/about Settings › About
