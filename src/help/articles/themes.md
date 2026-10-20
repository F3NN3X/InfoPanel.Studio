---
id: themes
title: Themes and appearance
icon: palette
related: [widget-settings, background, presets]
verified: draft
---
Set the look once and every widget follows. Customise only where a widget should differ.

## Where looks come from

:::flow
Default — Built into each widget
Dashboard theme — All profiles
Profile theme — This profile
Widget — Only sections you customise
:::

Each layer overrides the one before it. Content settings (sensors, what to show) are never themed; they always belong to the widget.

## Follow theme, section by section

Every themable section in a widget's settings (Colors, Surface, Typography, Size & spacing, Border & glow, Units & format, Thresholds, Motion…) starts out following the theme. Its rows show the theme's values, dimmed.

- Press **Customize** to change that section for this widget only. Rows start from the theme values.
- Press **Use theme** to follow again. Your values are kept, so Customize brings them back.
- Press the section's reset icon to clear them for good.

## Locking

In the profile theme, **Lock** a section to make every widget follow it, whatever its own setting. Locked sections show Locked by the profile in widgets. Use this to enforce one font or one set of thresholds across a whole screen.

## Theme colours

A theme is 19 colour tokens (background, foreground, card, primary, accent, muted, border…) and a corner radius. Start from Zinc, Neutral, Slate, Ocean, Forest or Paper (light) and edit any token.

## Surfaces

| Surface | Look |
|---|---|
| Glass | Translucent dark gradient with white text (default for most widgets) |
| Matte light / dark | Solid light grey or near-black card |
| Theme | Built from the theme tokens; follows light or dark themes |
| None / Card / Bordered | Panels only: transparent, half-opacity card, or card with a border |

Surface opacity, background blur, border and glow (none, soft, strong) apply on top of any surface.
