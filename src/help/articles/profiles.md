---
id: profiles
title: Screens and the grid
icon: aspect_ratio
related: [zones, themes, kiosk]
verified: 1.3.0-beta.1
---

A screen (profile) is a design for one display size. Its grid decides where zones can go.

## Managing screens

Open **Screens** from the screen name in the title bar (**Manage screens…**) or from a size link.

- Each screen is a card with a small screenshot of its first page, its name and a line such as `1920×550 · 3 pages · grid 12 × 6`. A video background shows its poster. The screenshot of the screen you are editing updates a couple of seconds after you stop editing and when you save. The others are drawn in the background the first time. Screenshots are kept in this browser only, so a new browser draws them again.
- Click a card to edit that screen; its details open on the right. Clicking a card doesn't change which screen your displays show.
- A tag on a card shows which screen opens on launch: **Best fit now** is the best fit for this window, and **Opens on launch** is the one you chose to always open. See [Which screen opens](profiles#which-screen-opens).
- **New screen** adds a screen named after the size of the studio window, such as `1920×550`.
- **Import a screen…** opens the Import door (see [Importing and exporting](import)); a `.json` file saved with **Export screen** becomes a new screen with a name of its own if one is already taken.
- A card's **⋯** menu has:
  - **Rename**;
  - **Duplicate**, which adds "‹name› copy" below it;
  - **Always open this one**;
  - **Export screen**, which opens the Export & back up sheet on that screen;
  - **Delete**, which asks first and is off for your last screen.

  Ctrl+Z brings a deleted screen back.

A fresh install has one blank screen, **Main display**, at 1920 × 1080 with a 12 × 6 grid in Scroll mode. On the empty canvas, **Use sample layout** builds a 1920 × 550 sample you can take apart.

## Screen settings

Select a screen's card in **Screens**. The panel on the right holds the settings of that screen. The look is in **Theme** on the rail.

| Group | What it does |
|---|---|
| **Size & fit** | **Size preset** offers 1920 × 550, 1920 × 1080, 2560 × 720, 1280 × 400, 1024 × 600 and 800 × 480; a size that isn't a preset shows first. **Width** and **Height** hold the exact pixels. **Match this window** takes the studio window's size. **When it doesn't fit**: **Fill** stretches rows so the whole grid fits the screen height, **Scroll** keeps rows 120 px tall and the page scrolls. |
| **Grid** | 2 to 24 columns and 1 to 24 rows. A change that would push a zone off the grid is refused. The preview draws the grid with its gap and padding. **Gap** (default 12 px) and **Edge padding** go to 64 px on the sliders, and the boxes accept up to 200. |
| **Rotation** | **Rotate pages** and **Every** (3 to 3600 seconds) step the kiosk through the pages. |
| **Performance** | The frame-rate cap and **Animations** for this screen. The chip says whether they come from **Settings › Dashboard** (all screens) or are this screen's own. |
| **Pages · order & rotation** | **Add page**, drag a page's handle to reorder it (the page tabs follow), switch it in or out of the rotation, or **Open** it in Design. |

The theme, skin and background are in **Theme**: pick the screen in its scope bar and edit a section to give this screen its own. See [Themes](themes#where-to-edit).

## Pages

A screen holds one or more pages that share its grid. See [The studio](studio#pages) for the page tabs and rotation.

## Which screen opens

**When the app opens**, at the top of **Screens**, decides which screen a display shows:

- **Best fit for the window** picks the screen whose size is closest to the window. Keep one screen per physical display and each one opens the right screen. The line under it names the screen this studio window would open, and it updates as you resize the window.
- **Always the same screen** opens one screen whatever the window size. Pick it in the list under the option, or use **Always open this one** in a card's **⋯** menu.

A display can still show another screen when its kiosk URL has `?profile=`, or when the screen is switched from **Live**.

Which screen you're editing belongs to this studio only. It isn't saved in the config, and it doesn't change what your displays show. **New screen**, **Duplicate**, **Import a screen…** and importing an InfoPanel profile all switch the studio to the new screen.

:::tip
Changing the grid keeps zones where they are in cells. If you halve the columns, widen zones afterwards or they will look narrow.
:::
