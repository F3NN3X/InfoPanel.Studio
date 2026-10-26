---
id: themes
title: Themes
icon: palette
related: [widget-settings, background, presets]
verified: 1.3.0-beta.31
---

Set the look once and every widget follows. Customize only where a widget should differ.

## Where looks come from

:::flow
Default — Built into each widget
All screens — The base look
Screen — What one screen changes
Page — Sections a page customises
Widget — Only sections you customize
:::

Each layer overrides the one before it. Content settings (sensors, what to show) are never themed; they always belong to the widget.

## Where to edit

**Theme** on the rail is the one place for the look. Its scope bar reads **All screens › ‹screen› › Page: ‹page›**; pick a level, and the arrows beside the screen and page pick another one. It starts at the screen and page you are designing.

- **All screens** is the base every screen starts from. Screens and pages only store what they change.
- **A screen** shows what it changes from All screens. Editing any section makes it **Custom here**; **Reset to inherited** goes back.
- **A page** lists only the sections it customises, then **Customise a section for this page**. Background is set per screen, a locked section can't be customised, and Shape & spacing is spacing only (the corner radius stays with the screen). In Colors a page has the widget colors; the color tokens link to the screen.

**1 · Start from** opens with a **Current look** line (the saved Theme the scope matches, else its palette and skin, with "edited" when the colors match no palette), then plain starting points: your saved Themes, the built-in palettes and the skins (the first few, the rest under More). Nothing in these rows is marked as selected. Below them, **From templates** opens the look of every screen template, a row for each template and an item for each palette (Graphite · Amber, Neon · Toxic and so on). Press an item to apply that look to the scope, background included, on any screen. The copy button on its corner saves it to Library › Themes, where you can rename and edit it like your own. A template look is the colors, corners, widget style and background; the arrangement stays with the template. **Update ‹name›** in the top bar saves the scope's look back into the Theme it started from or matches. Then the sections, in order: Colors (the color tokens and the widget colors), Typography (the page font and the widget type), Shape & spacing (corners and spacing), Surface & effects (surface, opacity, blur and the skin's details), Border & glow, Background, Units & format, Thresholds, Motion and Advanced (custom CSS). Each has a chip saying where its value comes from.

The preview on the right draws the page at the level you are editing, with a pencil on each widget that doesn't follow it. **Exceptions** lists what below this level doesn't follow it; **Make it follow** resets one, **Make all follow** resets them all (on a page, only its widgets).

## Follow theme, section by section

Every themable section in a widget's settings (Colors, Surface, Typography, Size & spacing, Border & glow, Units & format, Thresholds, Motion and more) starts out following the theme. A pill beside the section shows **Theme**, **Custom** or **Locked**.

- Press **Customize** to change that section for this widget only. Rows start from the theme values.
- Press **Use theme** to follow again. Your values are kept, so Customize brings them back.
- Press the section's reset icon to clear them for good.

Inside a panel, a panel widget's section says "Follows panel" and offers **Use panel**.

## Locking

At a screen, **Lock** in a section's header forces it on every page and widget of that screen, whatever their own setting. **Lock all** and **Unlock all** do every section at once. A locked section shows **Locked by Screen** in widgets and pages. Their own values are kept and come back when you unlock it; the section says how many widgets override it.

## Theme colors

A theme is a set of 19 color tokens (background, foreground, card, primary, accent, muted, border and more) and a corner radius. Start from Zinc, Neutral, Slate, Ocean, Forest or Paper (light) and edit any token.

## Surfaces

| Surface | Look |
|---|---|
| Auto | The card the chosen skin uses |
| Glass | Translucent dark gradient with white text |
| Matte (light) / Matte (dark) | Solid light grey or near-black card |
| Theme | Built from the theme tokens; follows light or dark themes |
| Solid, Outline, Flat, Tinted | Plain variations on the card |
| Aurora, Neon, Holo, Mesh, Carbon, Inset, Studio, Terminal | Decorative materials |

Panels also offer **None**, **Card** and **Bordered card**. Opacity, blur, border and glow apply on top of any surface.
