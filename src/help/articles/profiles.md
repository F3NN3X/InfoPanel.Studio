---
id: profiles
title: Screens and the grid
icon: aspect_ratio
related: [zones, themes, kiosk]
verified: 1.3.0-beta.28
---

A screen (profile) is a design for one display size. Its grid decides where zones can go.

## Managing screens

Open **Screens** from the rail, from the settings button beside the screen name in the title bar (it opens Screens on the screen you are editing), from **Manage screens…** in the screen name's list, or from a size link.

- Each screen is a card: a small picture of it, its name, a kind badge and a line such as `1920×550 · 3 pages · grid 12 × 6`. The badge says **Dashboard**, **InfoPanel** (the screen is one InfoPanel profile) or **Mixed** (both). An InfoPanel screen is drawn live; the others show a screenshot of the first page. The screenshot of the screen you are editing updates a couple of seconds after you stop editing and when you save. The others are drawn in the background the first time. Screenshots are kept in this browser only, so a new browser draws them again.
- Click a card to select it; its details open on the right. Clicking a card doesn't change which screen your displays show. **Open** on a card (or in the panel) opens the screen in Design, or in the InfoPanel editor when it is one InfoPanel profile.
- **Search** finds a screen by name, kind or size (`1920x480` works). **All**, **Dashboard**, **InfoPanel** and **Saved** narrow the list; a Mixed screen shows under both Dashboard and InfoPanel. **Sort** by last edited (the default), name, size or your own order. Last edited starts counting from the first edit you make in this version, so older screens come last until you change them.
- Badges: **Default** marks the screen the app opens on and **Default · best fit** the one the window picks when no screen is chosen (see [Which screen opens](profiles#which-screen-opens)). **Live on 2 kiosks** means kiosks show that screen right now. Default is what you chose; live is what is on the displays at this moment.
- **New** offers a blank dashboard screen named after the studio window's size, **Dashboard from a template…** (see [Screen templates](profiles#screen-templates)), a dashboard from the sample layout, and **InfoPanel profile or template…**, which opens New InfoPanel profile (blank, or a template from the gallery).
- **Import…** opens the Import door (see [Importing and exporting](import)); a `.json` file saved with **Export screen** becomes a new screen with a name of its own if one is already taken.
- **Saved in your Library** lists InfoPanel profiles saved in My library that no screen uses yet. **Place** makes one a new screen and opens it. A saved card can also be duplicated, renamed or removed. Removing asks first and can't be undone with Ctrl+Z, but a file that any screen still uses is kept.
- A card's **⋯** menu has:
  - **Rename**;
  - **Duplicate**, which adds "‹name› copy" below it;
  - **Always open this one**;
  - **Move earlier** and **Move later**, which set the order that **Your order** sorts by;
  - **Copy kiosk link**;
  - **Export screen**, which opens the Export & back up sheet on that screen;
  - **Delete**, which is off for your last screen.

  Delete asks first and says what goes with the screen: its pages, zones and InfoPanel canvases, and whether the app opens on it or kiosks show it. Deleting the screen the app opens on makes the app open on the best fit. Afterwards the **Undo** in the message, or Ctrl+Z, brings the screen back with its InfoPanel canvases.

A fresh install has one blank screen, **Main display**, at 1920 × 1080 with a 12 × 6 grid in Scroll mode. On the empty canvas, **Use sample layout** builds a 1920 × 550 sample you can take apart.

## Screen templates

**New › Dashboard from a template…** opens **New screen**. Pick **Blank** or a template, give the screen a name and choose its size, then press **Create**.

| Template | What's on it |
|---|---|
| **General** | Clock, weather, CPU, GPU and RAM gauges, network and now playing, on frosted glass |
| **Gaming** | An OSD strip, the frame rate, frame pacing, the game you're playing and your friends. A second page, **System**, has the GPU, the CPU, temperatures and power |
| **Work** | Clock, calendar, weather, processes, system status and your coding agents |
| **Hardware** | Core heatmap, GPU rings, temperatures, fans, power draw and drives, in the HUD skin |
| **Streaming** | Now playing, a visualiser, the volume mixer, whether OBS has you live or recording, and the system state |
| **Minimal** | A big clock with the date and three readings: CPU and GPU temperature and RAM load |
| **Status bar** | One bar with the time, load, temperatures and network, for thin strip displays |

- The chips above the cards sort them by shape: **Strip** (4:1 or wider), **Wide**, **Standard** and **Tall** (narrower than square). They start on the shape of the chosen size, and **All** lists every shape with that one first.
- Each card is a plan of the template's zones at that size. A template has its own arrangement for each shape it lists under, so a tall screen gets a column and a strip gets a row.
- Choosing a template that has no arrangement for the chosen size's shape switches the size to one it does have. **Status bar** only fits strips, so choosing it at 480 × 1920 switches to 1280 × 160.
- The template brings its look as the screen's own: colours, background, widget skin and effects. Change them in **Theme** with the screen as the scope.
- The grid is split to suit the size. A strip twice as long for its height gets twice the columns, so zones keep their shape and widgets you add later get sensible boxes.
- Widgets that read one sensor, such as Minimal's three readings, find this PC's sensor for it. A reading that isn't found is named in the message after **Create**; pick its sensor in the inspector.
- Creating the screen is one step, so Ctrl+Z removes it again.

The first-run setup's **Start from a template** offers the same templates at the size you picked.

## Screen settings

Select a screen's card in **Screens**. The panel on the right holds the settings of that screen. The look is in **Theme** on the rail.

| Group | What it does |
|---|---|
| **Size & fit** | **Size preset** offers 1920 × 550, 1920 × 1080, 2560 × 720, 1280 × 400, 1024 × 600 and 800 × 480; a size that isn't a preset shows first. **Width** and **Height** hold the exact pixels. **Match this window** takes the studio window's size. **When it doesn't fit**: **Fill** stretches rows so the whole grid fits the screen height, **Scroll** keeps rows 120 px tall and the page scrolls. |
| **Grid** | 2 to 24 columns and 1 to 24 rows. A change that would push a zone off the grid is refused. The preview draws the grid with its gap and padding. **Gap** (default 12 px) and **Edge padding** go to 64 px on the sliders, and the boxes accept up to 200. |
| **Shown on** | Whether the app opens on this screen, with a **Settings ↗** link to where that is chosen, which kiosks show it now, and **Copy kiosk link**. |
| **Rotation** | **Rotate pages** and **Every** (3 to 3600 seconds) step the kiosk through the pages. |
| **Performance** | The frame-rate cap and **Animations** for this screen. The chip says whether they come from **Settings › Dashboard** (all screens) or are this screen's own. |
| **Pages · order & rotation** | **Add page**, drag a page's handle to reorder it (the page tabs follow), switch it in or out of the rotation, or **Open** it in Design. |

The theme, skin and background are in **Theme**: pick the screen in its scope bar and edit a section to give this screen its own. See [Themes](themes#where-to-edit).

## Pages

A screen holds one or more pages that share its grid. See [The studio](studio#pages) for the page tabs and rotation.

## Which screen opens

**When the app opens**, under **Settings › Dashboard › Startup screen**, decides which screen a display shows. In **Screens**, **Shown on** has a **Settings ↗** link to it.

- **Best fit for the window** picks the screen whose size is closest to the window. Keep one screen per physical display and each one opens the right screen.
- **Always** followed by a screen name opens that screen whatever the window size. You can also use **Always open this one** in a card's **⋯** menu.

**Copy kiosk link** gives an address such as `http://127.0.0.1:3922/?kiosk=1&profile=…`. Open it on a kiosk to pin that kiosk to the screen; on another device use this PC's address instead of `127.0.0.1`.

## Named displays

Give a display a name and you can choose its screen from the studio, with no new link to type on the kiosk. In **Copy kiosk link**, fill in **Display name (optional)**: letters, digits, `-` and `_`, up to 32 characters. The link then looks like `http://127.0.0.1:3922/?kiosk=1&display=hall`. It doesn't pin a screen, because a pin would win over your choice.

To set up a display on InfoPanel, add a web page profile and paste the link as its URL. Each web page profile needs its own name in the link, since InfoPanel's web pages share one browser storage and the address is the only thing that tells them apart.

The display shows up in **Displays** on **Screens** the first time its link opens. Each row has the name, whether it's online, when it was last seen, its address while online, and a picker:

- **Follow “When the app opens”** is the default. The display shows what that setting says.
- A screen from the list always shows that screen on the display. If you delete the screen, the display goes back to following.

**Forget** removes a row; it returns the next time its link opens. A screen's **Shown on** panel lists the displays set to it. Only a kiosk on this PC shows its address.

A `?profile=` pin in a link still wins over everything else, then the display's screen, then a screen switched from **Live**, then **When the app opens**.

A display can still show another screen when its kiosk URL has `?profile=`, or when the screen is switched from **Live**.

Which screen you're editing belongs to this studio only. It isn't saved in the config, and it doesn't change what your displays show. **New**, **Duplicate**, **Import…** and importing an InfoPanel profile all switch the studio to the new screen.

:::tip
Changing the grid keeps zones where they are in cells. If you halve the columns, widen zones afterwards or they will look narrow.
:::
