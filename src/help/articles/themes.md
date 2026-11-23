---
id: themes
title: Themes
icon: palette
related: [widget-settings, background, presets]
verified: 1.3.0-beta.36
---

Set the theme once and every widget follows. Change it only where a widget should differ.

## Where themes come from

:::flow
Built-in — Built into each widget
Screen — The screen's own theme
Page — What a page changes
Widget — Only sections you change
:::

Each layer overrides the one before it. Content settings (sensors, what to show) are never themed; they always belong to the widget.

## The Theme view

**Theme** in the sidebar is the one place for the theme, and you always edit what is live: a change shows on the screen at once. The header holds the **level picker**, which reads "‹screen› · whole screen" or "‹screen› › ‹page› page" and opens a menu of every screen and its pages, then two tabs, **Customise** and **Browse themes**, and **Save as my theme**, **Apply to other screens…** (at a screen that wears a theme, with other screens) and a **⋯** menu. Each screen owns its theme; nothing above it is shared. At a screen the **⋯** menu has **Lock all** and **Unlock all**, **Reset to ‹name›**, **Rename**, **Duplicate** and **Delete**.

**Customise** draws the screen as the kiosk draws it, with a theme pack's scenery and effects. **Show as** switches between **Full** and **Lite mode**, which is the screen with no motion and the pack's effects cut back, as a display that saves work draws it. Under the preview a line says how many things changed from the theme, for example "1 change from Field Kit" and what, with **Reset to ‹name›**, and **Try another** applies one of a few theme packs with one click; **All** opens **Browse themes**. On the right is the theme card, **Quick changes**, **In this theme** and **Fine-tune**.

## Browse themes

**Browse themes** shows every theme as a card drawn by the real widgets, in three groups: **Yours** (saved themes and imported packs), **Theme packs** (themes with scenery, effects, card details or their own fonts, tagged **Pack**) and **Plain themes**. The filters narrow by kind (**All**, **Packs**, **Plain**, **Yours**), by tag (minimal, technical, retro, neon, gaming, glass, light) and by the search. The card of the theme the level wears is tagged **Applied**.

Select a card for its detail: a larger picture, what it is, **Apply to ‹screen›**, **Preview on screen** (Customise draws it without applying it; nothing changes until you apply), **Duplicate** (a saved copy) and **What it brings**: scenery, effects, card details, icons, font and its licence, modes and burn-in need. The applied theme's card offers **Customise ‹name›** instead.

Applying a theme from Browse themes writes its look for the widgets and keeps the colors and corners the level has of its own: a level with no theme yet keeps all of them, and one that wears a theme gets the new theme's colors and corners only where it still shows the last theme's. The background comes with the theme unless you keep yours. Applying a saved theme or a template's writes its colors, corners and background too. Your fine-tune changes at this level are kept either way. A page takes only the theme's look; its colors, corners and background are its screen's. Widgets with their own colors or card keep them; the toast counts them and **Make them follow** puts them back. **Undo** in the toast puts the previous theme back. **Keep my background** (under **In this theme**) is remembered for each screen on this PC; with it on, a theme you apply leaves your background alone.

**Import a pack** brings in a theme pack from a folder or a zip. It is checked first, and a pack with a problem is refused with the reason shown (it may not reuse the name of a built-in theme). A pack may bring a style sheet, `pack.css`, with plain paint for the documented widget parts: colours as hex or `rgb()`, or a `var(--pack-name)` set in the same file. Before such a pack is stored it is tried on every widget where you can't see it, and it is refused if anything is hidden or can't be read, which can take a minute. Changing a file of a stored pack with a style sheet, or copying one into the folder by hand, stops the pack from loading until you import it again. A pack you import is stored in the app data folder and listed under **Yours**; it is checked again each time it loads, and a warning shows on its card and in its detail. **Remove this pack** takes it out; any screen or page that wore it draws Classic instead, and a note says how many. Sharing packs is off.

**Saved and template themes**, at the end of the list, opens every saved theme and every screen template's theme, filtered by **All**, **Saved**, **Templates** or **Light**. Your saved themes come first; each **⋯** says which levels use it (or "Not in use") and has **Rename**, **Duplicate** and **Delete**. Then one row for each screen template with a chip for each variant. To give other screens the same theme, choose **Apply to other screens…** there or in the header: tick the screens (or **Select all**) and press **Apply**. Each screen follows the usual rules and one Undo takes it all back.

## Quick changes

The few things you most often change on top of a theme: **Accent** (six colors and a custom one), **Mode** (Dark or Light, for a theme that supports light), **Cards** (the theme's own card, Glass, Light, Dark or Theme), **Corners** and **Density** (Compact, Normal or Roomy: the inner padding and the gap between items). Under Accent, the contrast of the color on the theme's cards is shown as you pick it, for example "2.0:1 on Field Kit's cards, too low for text. Text in this colour uses a darker shade, 4.6:1". A dot before each name says where its value comes from: hollow follows the level above, filled is set here, and pressing a filled dot offers **Reset**. Align and size are layout, not quick changes.

**Corners** is one control. On a screen it sets the screen's corners and the widgets' corners to the same size; on a page it sets that page's widgets. It shows the size the widgets draw. A widget's **Style** tab in Edit starts with the same rows under **Theme: ‹name›**, and so do several selected widgets (a change goes to each of them) and a panel's widget (Accent only: its cards, corners and density are the panel's). A change there is that widget's own and changes that one quick change only: the rest of its section keeps following the page. The dot's reset makes it follow again. A theme with variants adds a **Variant** row.

## The theme card

The card shows the applied theme's name and a line saying what it is, with **Change**, which opens **Browse themes**:

- **Theme pack · ‹n› changes** or **Theme · ‹n› changes**: a built-in theme.
- **Saved theme · also on ‹places›**, or **Saved theme · only here**: one of your saved themes.
- **From a screen template**: a template's theme, named "Template · Variant", for example "Terminal · Amber".
- **Theme · not saved**: nothing applied here yet. A saved theme you deleted still in use reads "‹name› (deleted)".

**Save as my theme** keeps the level's theme under a name you type. Once you change something after applying a saved theme, **Update ‹name›** saves it and refreshes every level that uses it (each keeps what it changed since). **Reset to ‹name›**, in the **⋯** menu and under the preview, puts every part back to the theme, background included, and clears this level's fine-tune changes in one undo step; pages keep their own.

On a page, a card says whether the page **follows** its screen, and **Give ‹page› its own theme** makes it the page's own; **Follow ‹screen› again** goes back.

## In this theme

What the theme brings, one row each: **Scenery** (the layers behind the widgets), **Effects**, **Card details**, **Icons** and **Font** with **Change**, which opens the Text section. These say what is drawn; they can't be switched off yet. **Background** has **Change** for the Background picker, **Keep my background** is a switch, and **Burn-in care** shows what the pack needs ("Needs pixel shift") and what the screen does about it; **Change** opens the screen's settings.

## Colors and Background

- **Colors** lists the six built-in palettes (Zinc is the built-in default), then the palettes you saved, tagged **Yours**. Each of yours has a **⋯** with what uses it, **Rename**, **Duplicate** and **Delete**. **+ Save current colors as a palette** saves the level's 19 tokens and its accent. A palette brings its accent: a theme's palette the theme's accent, one of yours the accent it was saved with, Ocean and Forest their own color; Zinc and the other grays keep the screen's. The glow, number glow and border colors that were the old accent change with it. Changing the colors keeps the theme, corners, background and the rest of the fine-tune.
- **Background** offers **This theme's**, **Solid**, **Gradient** and **Image**, then the background editor for the kind you picked (see [Backgrounds](background)).

## Fine-tune

**Fine-tune** lists the sections that sit on top of the theme: **Colors**, **Text**, **Shape & spacing**, **Surface & border**, **Units & format**, **Thresholds**, **Motion** and **Custom CSS**. One opens at a time. Each shows a dot, how many values changed here, a one-line summary and, at a screen, a lock:

| Dot | Means |
|---|---|
| Filled, "‹n› changed" | This level holds the value |
| Hollow | It follows the theme, or the screen on a page |
| **Locked** | The screen forces this section on its pages and widgets |

Press a dot for where the value comes from and what you can do: **Reset to inherited**, **Change here** on a page, or **Edit ‹level› ↗**. Editing a row makes the section changed here. **Reset to inherited** goes back; with a theme applied it goes back to the theme's values. **Colors** starts with the roles, each with its color and its contrast on the theme's cards, then **Widget colors**, **Status**, **Series colors**, and **More · all 19 color tokens**. The tokens are the palette, so changing one changes the theme, not the section. Page font is in Text; it isn't part of a theme, so switching themes keeps it.

## The preview

The preview draws the page at its real shape. The page button above it previews another page of the screen; the level you edit stays. A widget that differs from the level has a blue tag naming the section it changes. The pill says how many widgets differ; click it to hide or show the tags.

Click a widget to select it. The bar under the preview says what it uses of its own, with **Use theme's value** and **Open in Edit ↗**. With nothing selected, **Make all follow** resets every widget that differs on the page shown.

After a change, a row under the header says what happened, for example "Applied Desk. Colors, widget style and corners changed. Background kept. 2 fine-tune changes kept.", with **Reset to ‹name›** where fine-tune was kept, and **Undo**.

## From the command palette

Each saved theme has two commands: **Apply theme: ‹name›**, which brings its background, and **Apply theme, keep background: ‹name›**. They apply at the level the Theme view is set to, or the screen in Design before you have opened it.

## Follow theme, section by section

Every themable section in a widget's Style tab starts out following the theme, with the same dots as Fine-tune.

- Change a row, or choose **Change here** in the dot's menu, to change that section for this widget only. Rows start from the theme values.
- Choose **Reset to inherited** to follow again.

Inside a panel, a panel widget's dot says **From Panel** and its menu offers the same two choices. A widget's **Theme** row lists every theme, theme packs included.

## Locking

At a screen, the lock on a fine-tune section forces it on every page and widget of that screen, whatever their own setting. **Lock all** and **Unlock all**, in the **⋯** menu, do every section at once. A locked section shows **Locked** in widgets and pages. Their own values are kept and come back when you unlock it; the section says how many widgets differ.

## Surfaces

| Surface | What it draws |
|---|---|
| Auto | The card the chosen theme uses |
| Glass | Translucent dark gradient with white text |
| Matte (light) / Matte (dark) | Solid light gray or near-black card |
| Match theme | Built from the theme tokens; follows light or dark themes |
| Solid, Outline, Flat, Tinted | Plain variations on the card |
| Aurora, Neon, Holo, Mesh, Carbon, Inset, Studio, Terminal | Decorative materials |

Panels also offer **None**, **Card** and **Bordered card**. Opacity, blur, border and glow apply on top of any surface.
