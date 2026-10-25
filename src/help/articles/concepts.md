---
id: concepts
title: Core concepts
icon: account_tree
related: [profiles, zones, themes]
verified: 1.3.0-beta.27
---

The five building blocks, from the whole dashboard down to a single readout.

:::flow
Dashboard — Theme, Styles, saved Themes
Screen — One per display size and grid
Zone — A box on the grid
Widget or panel — What fills the zone
:::

## Dashboard

Everything you build: the theme for all screens, the page background, fonts and your saved Themes, Styles and Panels. There is one dashboard per install, and it exports as one file.

## Screen

A design for one display size (a profile in files and InfoPanel), with its own grid (columns × rows), fit mode, gap and padding. A screen can inherit the theme for all screens or set its own. With **Best fit for the window** (Settings › Dashboard › Startup screen), each display opens the screen closest to its window size, so one dashboard can serve a 1920 × 550 strip and a 1024 × 600 panel.

## Zone

A rectangle on the screen grid, placed by column, row, width and height in cells. A zone holds exactly one thing: a widget, a panel, an imported InfoPanel canvas, or nothing yet (a blank zone).

## Widget

A ready-made module that reads sensors and draws itself: System, Spotify, Weather, FPS and so on. Widgets adapt to the zone size and have settings in four tabs. See [Widgets](widgets).

## Panel

A zone you compose from small **panel widgets** (stat, gauge, bar, clock, image and more) laid out as a Stack, a Grid or an Overlay. Use a panel when no widget shows exactly what you want. See [Panels](panels).

## How looks are decided

Looks flow downward. A widget follows its page, which follows its screen, which follows All screens, unless you customise a section on the widget itself. Content (which sensor, what to show) always belongs to the widget. See [Themes](themes).
