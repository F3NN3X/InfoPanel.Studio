---
id: kiosk
title: Kiosk and server
icon: dns
related: [startup, performance, problems, diagnostics]
verified: 1.3.0-beta.5
---

The local server hosts your dashboard. InfoPanel shows it through the kiosk URL.

## The kiosk URL

:::generated defaults.table

Copy it from Settings › Server with **Copy**, or open it with **Open**. In InfoPanel, set it as the URL of a Web Page profile that fills your display. The URL uses this PC's network address when you choose Local network.

:::open settings/server Settings › Server

## Starting and stopping

Settings › Server shows the state (**Server running**, **Server stopped**, **Starting…**, **Restarting…** or **Server couldn't start**) with **Stop**, **Restart** and **Start server** buttons, plus address, uptime, clients and memory. The tray menu has Start server, Stop server and Restart server too. While stopped, the kiosk shows "can't connect".

## Who can connect

| Option | Address | Use when |
|---|---|---|
| This computer only | `127.0.0.1` | InfoPanel runs on this PC (most setups) |
| Local network | `0.0.0.0` | The display is driven by another device on your network |

:::warn
On Local network, anyone on your network can open the kiosk and the studio. Windows may ask to allow it through the firewall. **Allowed host names** limits which names the server answers to.
:::

## Changing the port

Pick a port from 1024 to 65535. Port, network and debug changes are saved right away but apply after a server restart; an amber bar at the top of Settings lists what is waiting and offers **Undo** and **Restart server**. Update the URL in InfoPanel to match.

## Frame rate and animations

The kiosk redraws its animations at most **Max FPS** times a second (**Frame rate limit**, 60 by default). **Animations** set to Reduced stops them. Set both under **Behaviour › Performance** with nothing selected, for all profiles or for this profile only. A kiosk URL can override them with `&fps=30` or `&motion=reduce`.

Lower Max FPS to 30 or 15 if the display's GPU works hard while nothing seems to change. See [Frame rate and motion](performance) for what each setting changes and what it saves.

## Crashes

With **Restart automatically if it crashes** on, the server comes back up to 3 times a minute, then stays stopped and logs why.

## The tray menu

Open studio, Open kiosk in browser, Settings, Check for updates…, Start server or Stop server, Restart server, and Quit.
