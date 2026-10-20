---
id: sensors
title: Sensors and the Data API
icon: sensors
related: [widgets, problems, panel-widgets]
verified: draft
---
Where every number on your dashboard comes from.

InfoPanel collects readings from LibreHardwareMonitor, HWiNFO and its plugins (Spotify, weather, Steam, Bluetooth…) and publishes them on its **Data API**, by default on port `3921`. The studio and kiosk read from there.

## How widgets find sensors

Each widget claims sensor keys by prefix: System reads `system.cpu…` and `system.ram…`, Network reads ethernet sensors, and so on. Anything no widget claims appears in **Other sensors**.

## Picking a sensor

Sensor fields open a picker with live values. Type to search keys, names and references; every word has to match. Use the arrow keys and Enter to pick.

## Changing the Data API address

With nothing selected in the studio, open **Connection** and set the Data API URL. Only change it if InfoPanel runs on another PC or port.

:::warn
If every widget shows dashes, the Data API is unreachable. Check InfoPanel is running and its web server is enabled. See [Common problems](problems).
:::
