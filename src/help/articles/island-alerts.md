---
id: island-alerts
title: Dynamic Island and alerts
icon: notifications
related: [widget-settings, studio]
verified: 1.3.0-beta.36
---

A small pill at the top of the kiosk that shows the time, and expands to show alerts and notices.

## Dynamic Island

Open **Alerts & Island** on the rail, choose the **Island** tab and turn on **Show Dynamic Island**. Pick the screen the island is for at the top. The tab has these sections:

| Section | Holds |
|---|---|
| Shape | Style (Pill or Notch), Size (S, M or L), Scale, Offset from top, Reserve space |
| Idle | **When idle**: Time, Time and date, Time and values, Line or Hidden; Rotate every |
| Look | The island looks (Frosted pill, Light pill, Match theme and more: one press sets the shape, color, opacity, border, shadow and weight for this screen), then Color (Black, Match theme or Custom), Opacity, Border, Shadow, Weight; the font is a link to **Theme › Text** |
| Clock | A link to **Settings › Dashboard › Clock & date** |
| Motion | Animation: Lively, Smooth or Off |
| Alerts | Collapse alerts after, Group notices |
| Dashboard notices | Page name, Layout updated, Plugin back, On air (OBS), Calendar countdown, Coding agents |

Press **Preview an alert** to see how an alert looks. **Widgets sent to the island** lists the widgets that raise their own alerts, each with **Open widget ↗**. Turn it on per widget under **Behavior › Send to island**.

## Alerts

Open **Alerts & Island** on the rail. **Alerts on** turns the rules on or off. The tabs are **Rules**, **Island**, **Defaults** and **History**. **Rules** lists each rule with its condition, severity and style, an on/off toggle, **Duplicate** and **Delete**, and when it **Last fired**; **New rule** adds a **Blank sensor rule**, a **Blank notification rule** or a rule from **Presets**. **Defaults** holds the default style, position, size, **Show for**, **Dim the page behind** and quiet hours. **History** has **Active now** (what is firing, with acknowledge and dismiss) above the list of past alerts.
