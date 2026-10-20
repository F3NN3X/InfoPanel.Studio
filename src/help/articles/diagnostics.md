---
id: diagnostics
title: Diagnostics and logs
icon: monitoring
related: [problems, kiosk]
verified: draft
---
Find out what went wrong, and give a bug report everything it needs.

## Debug mode

Logs every server request and samples memory every 30 seconds. Turn it on in Settings › Diagnostics and restart the server. Leave it off day to day: it writes a lot of log lines.

:::open settings/diagnostics Settings › Diagnostics

## Reading the samples

Series are grouped by where they come from: `app`, `server`, `sidecar` (sensor reader), `studio` and `webview`. A series is **flagged** (amber) when it rose in at least 80 % of samples over the last hour and by more than 20 %. A flag after a few minutes means little; one after an hour points to a leak.

## Logs

Settings › Logs streams the Server, Studio and Sensor sidecar output. Filter by level (errors, warnings, info, debug) or by text. **Follow new lines** keeps the newest line in view; scrolling up pauses it.

## Reporting a problem

1. Turn on debug mode and restart the server.
2. Reproduce the problem and leave it running for a while if it is a slowdown.
3. Press **Copy diagnostics summary**, and **Copy system info** in About.
4. Use **Report an issue** in About and paste both.
