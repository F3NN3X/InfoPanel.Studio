---
id: kiosk
title: Kiosk and server
icon: dns
related: [startup, performance, problems, diagnostics]
verified: 1.3.0-beta.20
---

The local server hosts your dashboard. InfoPanel shows it through the kiosk URL.

## The kiosk URL

:::generated defaults.table

Copy it from Settings › App › Server with **Copy**, or open it with **Open**. In InfoPanel, set it as the URL of a Web Page profile that fills your display. The URL uses the network address of the PC running InfoPanel Studio when you choose Local network.

:::open settings/server Settings › App › Server

## Starting and stopping

Settings › App › Server shows the state (**Server running**, **Server stopped**, **Starting…**, **Restarting…** or **Server couldn't start**) with **Stop**, **Restart** and **Start server** buttons, plus address, uptime, clients and memory. The tray menu has Start server, Stop server and Restart server too. While stopped, the kiosk shows "can't connect".

## Who can connect

| Option | Address | Use when |
|---|---|---|
| Only this PC (localhost) | `127.0.0.1` | InfoPanel runs on the PC running InfoPanel Studio (most setups) |
| Local network | `0.0.0.0` | The display is driven by another device on your network |

:::warn
On Local network, anyone on your network can open the kiosk and the studio. Windows may ask to allow it through the firewall. **Allowed host names** limits which names the server answers to.
:::

Other devices can view the dashboard and kiosks but can't change anything unless **Allow editing from other devices** is on. It is off by default and appears only on Local network. With it off, a studio opened on another device says so in a banner, and changes made there aren't saved. Stream Deck and kiosk control keep working either way.

## Changing the port

Pick a port from 1024 to 65535. Port, network and debug changes are saved right away but apply after a server restart; an amber bar at the top of Settings lists what is waiting and offers **Undo** and **Restart server**. Update the URL in InfoPanel to match.

## Frame rate and animations

The kiosk redraws its animations at most **Max FPS** times a second (**Frame rate limit**, 60 by default). **Animations** set to Reduced stops them. Set both under **Settings › Dashboard › Performance** for every screen, or in **Screens › Performance** for one screen. A kiosk URL can override them with `&fps=30` or `&motion=reduce`.

Lower Max FPS to 30 or 15 if the display's GPU works hard while nothing seems to change. See [Frame rate and motion](performance) for what each setting changes and what it saves.

## Remote control

A Stream Deck or another remote on your network can control a kiosk without changing your saved dashboard:

- switch pages and screens, and pause cycling;
- reload the kiosk page;
- dim the screen: a dark layer over the widgets and the island, with alerts staying on top;
- show or hide the Dynamic Island;
- mute alerts for a number of minutes.

Dim and the island setting are kept per screen, and they survive a restart of the server. Muted alerts still appear in the alert history, marked as quiet.

## Crashes

With **Restart automatically if it crashes** on, the server comes back up to 3 times a minute, then stays stopped and logs why.

## The tray menu

Open studio, Open kiosk in browser, Settings, Help, Check for updates…, Start server or Stop server, Restart server, and Quit.
