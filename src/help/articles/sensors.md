---
id: sensors
title: Sensors and the Data API
icon: sensors
related: [widgets, problems, panel-widgets]
verified: 1.3.0-beta.34
---

Where every number on your dashboard comes from.

InfoPanel collects readings from LibreHardwareMonitor, HWiNFO and its plugins (Spotify, weather, Steam, Bluetooth and more) and publishes them on its **Data API**, by default on port `3921`. The studio and kiosk read from there.

The setup's **Data checks** step tests this link one piece at a time. The sections below cover what its fixes ask for.

## Installing InfoPanel

InfoPanel is a separate app. The Data API isn't in an official InfoPanel release yet: it's in the community test builds of InfoPanel, from `1.4.0-preview.3.f3nn3x.1` on, on the releases page of github.com/F3NN3X/infopanel.

1. Download the latest build's installer from that page.
2. Run it, then start **InfoPanel** once so it creates its data folder, `%LOCALAPPDATA%\InfoPanel`.
3. In InfoPanel, open **Settings**. Under **Data API**, turn on **Enable Data API**. InfoPanel starts it at once and saves the setting.
4. To have readings every time you sign in, turn on **Run on startup** in the same **Settings** page.

InfoPanel asks to run as administrator, so Windows asks for permission when it starts, including when the setup's **Start InfoPanel** button starts it.

## Updating InfoPanel

If the setup says your InfoPanel is too old, its settings.xml has no Data API switch. Install the latest community test build over the one you have: your profiles and settings are kept. Start InfoPanel again and turn on **Enable Data API** in its **Settings**.

InfoPanel only writes a setting to settings.xml when a setting changes. If you already run a build with the Data API but have never changed a setting, turning on **Enable Data API** once is enough for the setup to find it.

## A Data API on another PC

The studio can read InfoPanel on another PC on your network. In the setup's **Data checks**, choose **Another PC** and type that PC's address, such as `http://192.168.1.40:3921`. Studio can't look at InfoPanel on another PC, so it skips the first four checks and asks the Data API directly.

On the PC that runs InfoPanel:

1. Open InfoPanel's **Settings**. Under **Data API**, turn **Enable Data API** off: InfoPanel lets you change the address and port only while it's off.
2. Set **Listen IP** to that PC's network address instead of `127.0.0.1`, then turn **Enable Data API** on again.
3. Allow InfoPanel through the firewall: **Windows Security** › **Firewall & network protection** › **Allow an app through firewall**, then tick **InfoPanel** for **Private** networks.
4. Run `ipconfig` there and use its IPv4 address with the port, `3921` unless you changed it.

## How widgets find sensors

Each widget claims sensor keys by prefix: System reads the CPU and RAM sensors, Network reads the ethernet sensors, and so on. Anything no widget claims appears in **Other sensors**.

## Picking a sensor

Sensor fields open a picker with live values. Type to search the 650+ data points by key, name or reference; every word has to match. Use the arrow keys and Enter to pick, then **Done**. **Open data explorer** jumps to the Data view.

## HWiNFO sensors

When HWiNFO is running, its sensors are grouped by device in every list: "CPU [#0]: ...", "S.M.A.R.T.: ...", "GPU [#0]: ...". The grouping needs an InfoPanel build whose Data API lists HWiNFO's devices; with an older build the HWiNFO sensors still appear, in one flat list. Sensor templates and the Drives element look in HWiNFO for readings LibreHardwareMonitor does not have, such as the GPU hot spot and the memory clock.

## The Data view

**Data** on the rail shows every source as a tree, with a table of its data points (**Sensor**, **Now**, **Display name**, **Used in**) and an inspector for the point you select. From there you can bind a point to a widget. A display name applies to every screen.

## Changing the Data API address

In the studio, open **Data**, and in its **Connection** card set the **Data API URL**. Press **Test connection** to check it. Only change it if InfoPanel runs on another PC or port.

:::warn
If every widget shows dashes, the Data API is unreachable. Check InfoPanel is running and **Enable Data API** is on in its **Settings**, or run the setup's data checks again (Settings › General › **Run setup**). See [Common problems](problems).
:::
