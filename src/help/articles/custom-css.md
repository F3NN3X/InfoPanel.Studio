---
id: custom-css
title: Custom CSS
icon: code
related: [panels, widget-settings]
verified: draft
---
For looks the settings can't reach. CSS is scoped, so it never leaks into other zones.

## Where to write it

- A widget: Style › Custom CSS.
- A panel: Panel card › More › CSS. It applies to that zone only.
- A panel widget: its Advanced card. It applies to that cell only.

Inside, `:scope` is the zone or cell root.

## Hooks

| Selector | Targets |
|---|---|
| `.wp-panel[data-panel-layout]` | The panel; layout is stack, grid or overlay |
| `.wp-widget--{kind}` | A panel widget, e.g. `.wp-widget--gauge` |
| `.wp-label` `.wp-value` `.wp-unit` | Text parts |
| `.wp-bar-fill` `.wp-gauge` `.wp-clock-time` | Graphic parts |

## Variables

`--panel-gap`, `--panel-pad`, `--panel-direction`, `--wp-accent`, `--wp-fg`, `--wp-radius`. Setting a variable is safer than overriding the property, because it survives theme changes.

:::tip
Example: `:scope .wp-value { font-variant-numeric: tabular-nums; }` stops numbers jittering as they change.
:::
