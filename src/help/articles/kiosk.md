---
id: kiosk
title: Kiosk and server
icon: dns
related: [startup, performance, problems, diagnostics]
verified: 1.3.0-beta.33
---

The local server hosts your dashboard. InfoPanel shows it through the kiosk URL.

## The kiosk URL

:::generated defaults.table

Copy it from Settings › App › Server with **Copy**, or open it with **Open**. In InfoPanel, set it as the URL of a Web Page profile that fills your display. The URL uses the network address of the PC running InfoPanel Studio when you choose Local network.

:::open settings/server Settings › App › Server

## Starting and stopping

Settings › App › Server shows the state (**Server running**, **Server stopped**, **Starting…**, **Restarting…** or **Server couldn't start**) with **Stop**, **Restart** and **Start server** buttons, plus address, uptime and memory; the line under the state says how many clients it is serving. The tray menu has Start server, Stop server and Restart server too. While stopped, the kiosk shows "can't connect".

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

The kiosk redraws its animations at most **Max FPS** times a second (**Frame-rate cap**, 60 by default). **Animations** set to Reduced stops them. Set both for each screen in **Screens › Performance**. A kiosk URL can override them with `&fps=30` or `&motion=reduce`.

Lower Max FPS to 30 or 15 if the display's GPU works hard while nothing seems to change. See [Frame rate and motion](performance) for what each setting changes and what it saves.

## Pinned widgets

A screen can pin widgets to its edges, such as the page rail on the left or a now-playing bar along the bottom. They stay where they are on every page while the pages change beside them. A pinned widget that makes room takes its space off the page, and the page's widgets fit in what is left; one that floats sits over the page. A page can hide them.

The **page rail** lists your pages down one edge, with the page shown marked in the accent. Tap a page to show it. It can also hold actions, such as muting the microphone, and small widgets, such as the clock at its foot. A dot on a page tells you an agent is waiting or an alert is showing, and **LIVE** that OBS is streaming. **Auto** at the foot means the pages rotate; tap it to stay on the page you're on.

With page dots and swipe on, drag a page and the next one slides in beside it under the rail. Let go past a quarter of the way to move on.

### Profiles that follow the app in front

Tap or hold the **profile chip** at the top of the rail to open **Profiles**: the screens of this display's size, the one shown marked **Current**. Tap one to show it. A screen can list programs in **Screens › Switch with the app in front**; while one of them is in front on this PC, the display switches to that screen, and back to its usual one when another program comes to the front. **Matches now** marks a screen whose program is in front while it is not shown.

**Switch with the app in front** turns switching on or off for now. **Lock to** keeps the screen shown whatever is in front, until you unlock it or turn switching back on. Switching only reads the program in front on Windows, and only while a screen lists programs. A kiosk link with `?profile=`, or a display given a screen in Screens, keeps its screen, and its chip only shows the name.

You pin widgets in Edit: see [The pinned layer](studio#the-pinned-layer).

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
