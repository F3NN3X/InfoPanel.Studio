---
id: themes
title: Themes
icon: palette
related: [widget-settings, background, presets]
verified: 1.3.0-beta.36
---

Set the look once and every widget follows. Change it only where a widget should differ.

## Where looks come from

:::flow
Built-in — Built into each widget
Screen — The screen's own theme
Page — What a page changes
Widget — Only sections you change
:::

Each layer overrides the one before it. Content settings (sensors, what to show) are never themed; they always belong to the widget.

## The Theme view

**Theme** on the rail is the one place for the look, and you always edit what is live: a change shows on the screen at once. The header reads **Live look of** and the level: a screen (with its size) or a page. The screen and page each have a menu to pick another one. Each screen owns its look; nothing above it is shared. A line under it says what the level is: "The look of ‹screen›", or for a page "What ‹page› changes from ‹screen›. Palette, corners and background come from ‹screen›." At a screen, **Lock all** and **Unlock all** sit beside it.

## The theme card

A theme is four parts: the **Palette** (the 19 color tokens), the **Skin**, the **Corners** and the **Background**. The card shows them under **Made of**, with the theme's name and a line saying what it is:

- **Saved theme · also on ‹places›**, or **Saved theme · only here**: one of your saved themes.
- **From a screen template**: a template's look, named "Template · Variant", for example "Terminal · Amber".
- **Custom look · not saved**, with **Save as theme**. A saved theme you deleted still in use reads "‹name› (deleted)".

Click a part to change it: **Palette** and **Skin** open their pickers, **Corners** is a slider (0 to 24 px), and **Background** opens the Background picker. On a page the palette, corners and background are the screen's and can't be changed there. The card's **⋯** has **Reset to ‹name›**, **Rename**, **Duplicate** and **Delete**. Reset puts every part back to the theme, background included, and clears this level's fine-tune changes in one undo step; pages keep their own.

Once you change a part after applying a saved theme, a bar says "Changed here. Updating ‹name› also changes ‹places›." **Update ‹name›** saves the theme and refreshes every level that uses it (each keeps what it changed since); **Save as new** saves a new theme. For a template's look the bar offers **Save as theme**, which saves "‹Template · Variant› copy".

To give other screens the same theme, open **Switch theme** at a screen and choose **Apply to other screens…**: tick the screens (or **Select all**) and press **Apply**. Each screen follows the usual rules, **Keep my background** included, and one Undo takes it all back. The command palette's **Apply theme to all screens: ‹name›** does the same for every screen.

## Switch theme

**Switch theme** opens every theme you can apply, filtered by **All**, **Saved**, **Templates** or **Light**. Your saved themes come first; each **⋯** says which levels use it (or "Not in use") and has **Rename**, **Duplicate** and **Delete**. Then one row for each screen template with a chip for each variant. Meters, Orbit and Ticker look the same, so they are one row, tagged "also Orbit, Ticker".

Picking a theme writes the palette, skin, corners and the theme's background. The first theme picked on a level that has none yet replaces its look, fine-tune included. After that, picking a theme adds to the look: it keeps the fine-tune changes you made at this level since. A variant also brings the card opacity and color swaps a new screen from it has. Tick **Keep my background** at the bottom to keep the level's background. It is off by default and stays as you set it until the studio closes. On a page a theme brings its skin and fine-tune values only. Widgets with their own colors or card look keep them; the toast counts them and **Make them follow** puts them back on the theme. **+ Save current look as a theme** at the bottom saves the level's look.

## Palette, Skin and Background

- **Palette** lists the six built-in palettes (Zinc is the built-in default), then the palettes you saved, tagged **Yours**. Each of yours has a **⋯** with what uses it, **Rename**, **Duplicate** and **Delete**. **+ Save current colors as a palette** saves the level's 19 tokens. Changing the palette keeps the skin, corners, background and fine-tune.
- **Skin** lists all 14 skins, drawn live. **Default** is the studio's own. Changing the skin keeps the colors, corners, background and fine-tune.
- **Background** offers **This theme's**, **Solid**, **Gradient** and **Image**, then the background editor for the kind you picked (see [Backgrounds](background)).

## Fine-tune

Under the card, **Fine-tune** lists the sections that sit on top of the theme: **Colors**, **Text**, **Shape & spacing**, **Surface & border**, **Units & format**, **Thresholds**, **Motion** and **Custom CSS**. One opens at a time. Each shows a one-line summary and a chip saying where its values come from:

| Chip | Means |
|---|---|
| **Changed here** | This level holds the value |
| **From theme** | The value the applied theme wrote |
| **From ‹screen›** | Inherited from the screen |
| **Built-in** | Nothing set; the app's default |
| **Locked** | The screen forces this section on its pages and widgets |

Editing a row makes the section **Changed here**. **Reset to inherited** goes back; with a theme applied it goes back to the theme's values. On a page, **Change here** makes a section the page's own. Colors has **Widget colors**, **Status**, **Series colors**, and **More · all 19 color tokens**. The tokens are the palette, so changing one changes the theme (the Update bar shows), not the section. Page font is in Text; it isn't part of a theme, so switching themes keeps it.

## The preview

The preview on the right draws the page at its real shape with the live look. The page buttons above it preview another page of the screen; the level you edit stays. A widget that differs from the level has a blue tag naming the section it changes. The pill says how many widgets differ; click it to hide or show the tags.

Click a widget to select it. The bar under the preview says what it uses of its own, with **Use theme's value** and **Open in Edit ↗**. With nothing selected, **Make all follow** resets every widget that differs on the page shown.

After a change, a row under the preview header says what happened, for example "Applied Desk. Palette, skin and corners changed. Background kept. 2 fine-tune changes kept.", with **Reset to ‹name›** where fine-tune was kept, and **Undo**.

## From the command palette

Each saved theme has two commands: **Apply theme: ‹name›**, which brings its background, and **Apply theme, keep background: ‹name›**. They apply at the level Theme is set to, or the screen in Design before you have opened Theme.

## Follow theme, section by section

Every themable section in a widget's Style tab starts out following the theme, with the same chips as Fine-tune.

- Change a row, or choose **Change here** in the chip's menu, to change that section for this widget only. Rows start from the theme values.
- Choose **Reset to inherited** to follow again.

Inside a panel, a panel widget's chip says **From Panel** and its menu offers the same two choices.

## Locking

At a screen, **Lock** on a fine-tune section forces it on every page and widget of that screen, whatever their own setting. **Lock all** and **Unlock all** do every section at once. A locked section shows **Locked** in widgets and pages. Their own values are kept and come back when you unlock it; the section says how many widgets differ.

## Surfaces

| Surface | Look |
|---|---|
| Auto | The card the chosen skin uses |
| Glass | Translucent dark gradient with white text |
| Matte (light) / Matte (dark) | Solid light gray or near-black card |
| Match theme | Built from the theme tokens; follows light or dark themes |
| Solid, Outline, Flat, Tinted | Plain variations on the card |
| Aurora, Neon, Holo, Mesh, Carbon, Inset, Studio, Terminal | Decorative materials |

Panels also offer **None**, **Card** and **Bordered card**. Opacity, blur, border and glow apply on top of any surface.
