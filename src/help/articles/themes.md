---
id: themes
title: Themes and appearance
icon: palette
related: [widget-settings, background, presets]
verified: 1.3.0-beta.1
---

Set the look once and every widget follows. Customize only where a widget should differ.

## Where looks come from

:::flow
Default — Built into each widget
Dashboard theme — All profiles
Profile theme — This profile
Widget — Only sections you customize
:::

Each layer overrides the one before it. Content settings (sensors, what to show) are never themed; they always belong to the widget.

## Where to edit

- **Look**, with nothing selected, has three sections: **Theme**, **Widget style** and **Background**. Each has a switch:
  - **All profiles** (teal dot): the section is shared, and changes apply to every profile that doesn't have its own.
  - **This profile** (purple dot): this profile gets its own copy, starting from the shared values. Switching back to All profiles drops the profile's own values.

  **Theme** has the theme swatches, the colour tokens (more under **More**), **Corners** and the **Font**. Corners follow the Theme switch. The Font applies to every profile.

  **Widget style** has the **Skins** gallery, **Saved looks**, the surface, its opacity and blur, and **Apply to every widget**. That toggle locks every section of this profile's widget theme, and reads **Some sections** when only some are locked. **Edit widget style ›** opens the Theme page.
- **Theme** on the left rail: a scope list with All profiles, Profile theme and each page. Its "Who doesn't follow the theme" list has **Reset to theme** for each widget that has its own values.

## Follow theme, section by section

Every themable section in a widget's settings (Colors, Surface, Typography, Size & spacing, Border & glow, Units & format, Thresholds, Motion and more) starts out following the theme. A pill beside the section shows **Theme**, **Custom** or **Locked**.

- Press **Customize** to change that section for this widget only. Rows start from the theme values.
- Press **Use theme** to follow again. Your values are kept, so Customize brings them back.
- Press the section's reset icon to clear them for good.

Inside a panel, a panel widget's section says "Follows panel" and offers **Use panel**.

## Locking

In the profile theme, **Lock** a section to make every widget follow it, whatever its own setting. **Lock all** and **Unlock all** do every section at once. A locked section shows "Locked by the profile theme" in widgets and has no switch. Use this to enforce one font or one set of thresholds across a whole screen. On a page, **Customize** and **Use profile** choose between the page's own theme and the profile's.

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

Panels also offer **None**, **Card** and **Bordered card**. Surface opacity, background blur, border and glow apply on top of any surface.
