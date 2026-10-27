---
id: custom-css
title: Custom CSS
icon: code
related: [panels, widget-settings]
verified: 1.3.0-beta.36
---

For looks the settings can't reach. CSS is scoped, so it never leaks into other widgets.

## Where to write it

- A widget or panel: **Style › Custom CSS**, under **More**. It applies to that widget only.
- A panel widget: **Style › Custom CSS › CSS**. It applies to that cell only.
- A panel in Code mode: the `css` field.

Inside, `:scope` is the widget's or the cell's root.

## Hooks

| Selector | Targets |
|---|---|
| `.wp-panel[data-panel-layout]` | The panel; layout is stack, grid or overlay |
| `.wp-widget--{kind}` | A panel widget, such as `.wp-widget--gauge` |
| `.wp-label` `.wp-value` `.wp-unit` `.wp-sub` | Text parts |
| `.wp-bar-track` `.wp-bar-fill` `.wp-gauge` `.wp-table` `.wp-clock-time` `.wp-clock-date` `.wp-shape` | Graphic parts |
| `.wp-band` `.wp-panel-title` `.wp-panel-bg` `.wp-panel-scrim` | Overlay parts |

## Variables

`--panel-gap`, `--panel-pad`, `--panel-direction`, `--wp-accent`, `--wp-fg` and `--wp-radius`. Setting a variable is safer than overriding the property, because it survives theme changes.

:::tip
Example: `:scope .wp-value { font-variant-numeric: tabular-nums; }` stops numbers jittering as they change.
:::
