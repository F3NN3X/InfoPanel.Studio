---
id: sensors
title: Sensors and the Data API
icon: sensors
related: [widgets, problems, panel-widgets]
verified: 1.3.0-beta.1
---

Where every number on your dashboard comes from.

InfoPanel collects readings from LibreHardwareMonitor, HWiNFO and its plugins (Spotify, weather, Steam, Bluetooth and more) and publishes them on its **Data API**, by default on port `3921`. The studio and kiosk read from there.

## How widgets find sensors

Each widget claims sensor keys by prefix: System reads the CPU and RAM sensors, Network reads the ethernet sensors, and so on. Anything no widget claims appears in **Other sensors**.

## Picking a sensor

Sensor fields open a picker with live values. Type to search the 650+ data points by key, name or reference; every word has to match. Use the arrow keys and Enter to pick, then **Done**. **Open data explorer** jumps to the Data view.

## The Data view

**Data** on the rail shows every source as a tree, with a table of its data points (**Sensor**, **Now**, **Display name**, **Used in**) and an inspector for the point you select. From there you can bind a point to a widget. A display name applies to every screen.

## Changing the Data API address

In the studio, open **Data**, and in its **Connection** card set the **Data API URL**. Press **Test connection** to check it. Only change it if InfoPanel runs on another PC or port.

:::warn
If every widget shows dashes, the Data API is unreachable. Check InfoPanel is running and its web server is enabled. See [Common problems](problems).
:::
