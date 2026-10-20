---
id: kiosk
title: Kiosk and server
icon: dns
related: [startup, problems, diagnostics]
verified: draft
---
The local server hosts your dashboard. InfoPanel shows it through the kiosk URL.

## The kiosk URL

`http://127.0.0.1:3922/?kiosk=1` by default. Copy it from Settings › Server and paste it into an InfoPanel web item that fills your display.

:::open settings/server Settings › Server

## Starting and stopping

Settings › Server has **Start**, **Stop** and **Restart**, and so does the tray menu. While stopped, the kiosk shows can't connect.

## Who can connect

| Option | Address | Use when |
|---|---|---|
| This computer only | `127.0.0.1` | InfoPanel runs on this PC (most setups) |
| Local network | `0.0.0.0` | The display is driven by another device on your network |

:::warn
On Local network, anyone on your network can open the kiosk and the studio.
:::

## Changing the port

Pick a port from 1024 to 65535. Port, network and debug changes are saved right away but apply after a server restart; a bar at the top of Settings offers **Restart server**. Update the URL in InfoPanel to match.

## Crashes

With **Restart automatically if it crashes** on, the server comes back up to 3 times a minute, then stays stopped and logs why.
