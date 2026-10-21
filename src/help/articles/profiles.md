---
id: profiles
title: Profiles and the grid
icon: aspect_ratio
related: [zones, themes, kiosk]
verified: 1.3.0-beta.1
---

A profile is a page for one display size. Its grid decides where zones can go.

## Managing profiles

Open **Profiles** on the left rail.

- Each profile is a card with a small screenshot of its first page, its name, its size and its page count. A video background shows its poster. The screenshot of the profile you are editing updates a couple of seconds after you stop editing and when you save. The others are drawn in the background the first time. Screenshots are kept in this browser only, so a new browser draws them again.
- Click a card to edit that profile. The card opens to list its pages: click one to show it, or use **Add page**. Clicking a card doesn't change which profile your displays show.
- A tag on a card shows which profile opens on launch: **Opens now** is the best fit for this window, and **On launch** is the one you chose to always open. See [Which profile opens](profiles#which-profile-opens).
- **New** adds a profile named after the size of the studio window, such as `1920×550`.
- **Import** adds a profile from a `.json` file saved with **Export profile**, or from text copied with **Copy profile JSON**. It gets a name of its own if one is already taken.
- A card's **⋯** menu has:
  - **Rename**;
  - **Duplicate**, which adds "‹name› copy" below it;
  - **Always open this one**;
  - **Export profile**, which saves the profile as a `.json` file;
  - **Copy profile JSON**;
  - **Delete**, which asks first and is off for your last profile.

  Ctrl+Z brings a deleted profile back.

A fresh install has one blank profile, **Main display**, at 1920 × 1080 with a 12 × 6 grid in Scroll mode. On the empty canvas, **Use sample layout** builds a 1920 × 550 sample you can take apart.

## Profile settings

Click an empty part of the canvas so nothing is selected. The inspector shows the page; its **More settings for this screen** links open the profile's settings in two tabs, **Layout** and **Behaviour**. The look is in **Theme** on the rail.

**Layout** holds the size and grid:

| Setting | What it does |
|---|---|
| **Name** | The profile's name. **Rename** in a card's **⋯** menu jumps here. |
| **Design size** | Presets for 1920 × 550, 1920 × 1080, 2560 × 720, 1280 × 400, 1024 × 600 and 800 × 480. A size that isn't a preset shows first. Width and Height hold the exact pixels. **Use this window's size** appears when the studio window has a different size. |
| **When it doesn't fit** | **Fill**: rows stretch so the whole grid fits the screen height. **Scroll**: rows stay 120 px tall and the page scrolls. |
| **Columns** / **Rows** | 2 to 24 columns and 1 to 24 rows. A change that would push a zone off the grid is refused. A new profile gets 6 or 12 columns and 4 or 6 rows depending on its size. The preview above them draws the grid with its gap and padding. |
| **Gap** and **Edge padding** | Space between zones (default 12 px) and around the edge. The sliders go to 64 px, and the boxes accept up to 200. |

The theme, skin and background are in **Theme**: pick the screen in its scope bar and edit a section to give this screen its own. See [Themes and appearance](themes#where-to-edit).

**Behaviour** holds the pages and their cycling, the Dynamic Island, Performance, Clock and date, Display, Studio and Connection. Clock and date, Display, Studio and Connection apply to every profile.

## Pages

A profile holds one or more pages that share its grid. See [The studio](studio#pages) for the page tabs and rotation.

## Which profile opens

**When the app opens**, at the bottom of the Profiles panel, decides which profile a display shows:

- **Best fit for the window** picks the profile whose size is closest to the window. Keep one profile per physical display and each one opens the right profile. The line under it names the profile this studio window would open, and it updates as you resize the window.
- **Always the same profile** opens one profile whatever the window size. Choosing it uses the profile you're editing. To pick another, use **Always open this one** in that card's **⋯** menu.

A display can still show another profile when its kiosk URL has `?profile=`, or when the profile is switched remotely.

Which profile you're editing belongs to this studio only. It isn't saved in the config, and it doesn't change what your displays show. **New**, **Duplicate**, **Import** and importing an InfoPanel profile all switch the studio to the new profile.

:::tip
Changing the grid keeps zones where they are in cells. If you halve the columns, widen zones afterwards or they will look narrow.
:::
