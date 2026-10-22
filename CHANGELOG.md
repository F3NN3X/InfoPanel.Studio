# Changelog

All notable changes to InfoPanel Studio. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). A release takes the section headed with its
version as its notes, so move **Unreleased** under a new `## [X.Y.Z] - YYYY-MM-DD` heading before tagging.

## [Unreleased]

### Added
- **Allow editing from other devices** is a new app setting, off by default, for a server on the local network. A
  server restart applies it.
- **Open WebView2 task manager** in Settings > Diagnostics shows memory and CPU for each WebView2 process (renderer, GPU
  and the rest).

### Changed
- **Editing from other devices is off by default.** A server on the local network lets other devices view the dashboard
  and kiosks, but only this computer can change the config and integrations; turn it on in Settings > Server. Stream
  Deck and kiosk control are unaffected, and a Studio opened elsewhere says why it can't save.
- **The Studio pages carry security headers** (a content security policy, no framing from other sites, no MIME sniffing).
- **The image proxy refuses private-network addresses**, including on redirects.
- **Developer tools are available in debug mode only**, and Diagnostics shows the button only then.
- **Live widgets use far less CPU and GPU.** Bars, meters and markers animate on the compositor, colour cells and
  segments step with the data, and the frame loop sleeps between capped frames.

### Fixed
- **A hidden or minimized studio no longer keeps rendering.** Its webview is suspended while the window is in the tray or
  minimized, and wakes when you open it, which stops the slow memory and CPU growth over long sessions.
- **Links in the studio open in the browser again.** They had been refused by the shell with a "not allowed by ACL" error.

## [1.3.0-beta.9] - 2026-10-22

### Changed
- **Settings is its own window again**, and it holds everything that isn't design: **App** (General, Server, Coding
  agents, Updates), **Dashboard** (frame rate and animations, clock and date, kiosk behaviour, Reset everything…),
  **Studio** (editor preferences), then Diagnostics, Logs, About and Changelog, with search over all of them. Open it
  from Settings on the rail, `Ctrl+,`, the command palette, the tray's Settings or Update…, or Help's "Open settings".
  In a browser it opens as a tab with Dashboard and Studio.
- **Dashboard settings apply at once.** There is no Save: each change is saved on the server, reaches the kiosks
  straight away and shows up in the Studio without touching your unsaved design edits. Dashboard lists every screen
  that uses its own frame rate or animations, with a link that opens it in Screens. Studio preferences changed there
  apply to the open Studio window as you change them.
- **Screens is on the rail**, after Theme, and a settings button beside the screen name in the title bar opens Screens
  on the screen you are editing (on a phone, Screens is under More).
- **A screen's own frame rate and animations are easy to find.** Settings › Dashboard lists the screens that override
  Frame-rate cap or Animations ("MyDefault uses 30 fps") with Reset and a link to the screen. Theme's Motion section
  says on which screens Smooth is off, and the Frame-rate cap hint says why: below 60 fps transitions are off and graphs
  step at the data rate.
- The Studio window can call only the desktop commands it uses (13, down from 39); the Settings window has its own
  set. If the server isn't running, Settings opens with the App pages only.

### Fixed
- Layers, the selection bar and the widget inspector show each widget's own icon instead of a plain box for all of
  them.

## [1.3.0-beta.8] - 2026-10-21

### Added
- **A new studio layout.** The rail is labelled and every item is a full view: **Design**, **Theme**, **Library**,
  **Gauges**, **Data**, **Alerts & Island**, **Help** and **Settings**. The title bar holds the screen and page switcher, the
  command palette, **Import**, **Export**, **Live** and **Save**, and a status bar shows the Data API (with its
  response time), the server, the kiosks, updates and whether your edits are saved.
- **Theme** is one editor for the look at every scope. Pick **All screens**, a screen or a page in the scope bar;
  the sections are Colors, Typography, Shape & spacing, Surface & effects, Border & glow, Background, Units & format,
  Thresholds, Motion and Advanced. **Lock** a section to force it on every page and widget of a screen, see every
  widget and page that does not follow in **Exceptions** (**Make it follow** puts one back), and **Apply a theme here…**
  or **Save as Theme** for a whole look. A screen can have its own page font.
- **Where a value comes from.** A chip on every inheritable section reads **From All screens**, **From Screen**,
  **From Page**, **Custom here**, **Locked** or **Built-in**. Its menu resets the section, jumps to where it is set,
  or makes a widget's look the theme for all screens, this screen or this page. Editing a section that follows turns it
  **Custom here**; there is no switch to flip.
- **Screens** is a view of its own (the switcher's **Manage screens…**): **When the app opens**, a card per screen,
  and a detail panel for size and fit, grid, rotation, performance and the page order.
- **Settings** has three tabs. **Dashboard** is what every screen shares (frame rate, clock and date, kiosk
  behaviour, **Reset everything…**), **Studio** is your editor preferences, and **App** is the desktop app's startup,
  server and update settings inside the studio. The tray's **Settings** and **Update…** open **Settings › App**.
- **Data** has a Connection card (status, Data API URL, **Test connection**) above the source tree, and a point table
  with a display name per source and where each point is used.
- **Alerts & Island** has **Rules**, **Island**, **Defaults** and **History** tabs, with the Dynamic Island set per
  screen and the widgets that send to it listed. The Island tab's preview is the real island and follows every
  setting as you change it; **Preview an alert** plays in it.
- **A sensor alert can watch several sensors**, each with its own condition (CPU temperature over 95 or GPU
  temperature over 85). It fires when any one holds and names the sensors that fired; `{sensor}` is a new text token.
- **Themes and Styles in the Library** show their colors, shape and keys, where they're used, and **Apply**,
  **Rename**, **Duplicate** and **Delete**. **Edit in Theme** opens a saved theme in the Theme editor and
  **Update ‹name›** saves your changes back to it; the Style tab and the Library offer **Update ‹name›** for a saved
  Style the same way.
- Theme's **Start from** shows one **Current look** line (the saved theme it matches, or the palette and skin) over
  **Saved themes**, **Palettes** and **Skins**.
- Double-clicking a canvas in the Library opens the canvas editor (**Edit canvas**); one not yet on a page comes in
  as a new screen first.
- **One door in, one sheet out.** **Import** accepts a config backup, a screen, an `.infopanel` file, a gauge, a frame
  sequence, an image, a video or a font, from the button or dropped anywhere in the studio, and tells you what it
  found. **Export & back up** has **Save backup**, **Export this screen**, **Export a page for InfoPanel** and
  **Export a gauge**, each with **Copy JSON**. Replacing everything backs up first by default.
- **Live** controls the kiosks right now and never saves: show a page, pause rotation, dim, mute alerts for an hour,
  the Dynamic Island, **Reload all kiosks** and **Open kiosk view**. The page tabs show which page the kiosks are on.
- **Narrow windows and phones.** Under 1280 px the left panel starts closed. Under 960 px the rail is icons with
  tooltips, the inspector is a card you can drag by its header and close with Esc, and the status bar shows dots.
  Under 600 px the rail is a bottom bar (**Design**, **Theme**, **Library**, **More**) and the inspector a bottom
  sheet with big rows. Every view fits without sideways scrolling.
- **First-run setup.** With no saved config the studio opens a short setup: connect the Data API, pick your screen
  size, start from a template, an InfoPanel import or a blank screen, and name your first page with widgets found in
  your sensors. **Help › Run setup again** repeats it.
- **F1** in a focused Theme section opens how sections follow and lock. Text fields show a focus ring.
- The Library keeps its side menu and gains **Themes** and **Styles** collections beside Panels, Gauges, Media, Fonts
  and Canvases. Custom gauges show in the Library and open in **Gauges**.

### Changed
- **Screen** is the word for a profile, and **All screens** replaces All profiles, Global and General. **Panel**,
  **Theme** (a saved whole look), **Style** (one widget's look) and **Skin** have one meaning each.
- The profile inspector (Layout, Look, Behaviour) is gone: the **Page** inspector shows with nothing selected, and its
  contents live in Screens, Theme, Settings, Data and Alerts & Island. A link marked **↗** opens the one place a
  setting lives with its control focused.
- The widget **Style preset** menu is replaced by **Start from a Style**, **Save as Style** and **Make this the theme
  for…**. Widgets keep their looks.
- The kiosk page font, the Dynamic Island font and clock, and **Frame-rate cap** (was Max FPS) and **Animations**
  moved to their homes in Theme, Alerts & Island and Settings › Dashboard.
- Config version 10 drops the old zone `preset` key and changes nothing else. Version 11 stores a sensor alert's
  condition as a one-item list; rules behave as before.
- An app-notification alert is titled with the app's name, and its text is the notification's own title and message
  (the island's Notifications source too).
- Settings, Help and first-run speak of **the Studio** and **the desktop app** rather than "this browser" or "this
  PC". The page's **Live** row reads **Show on kiosks now** and says Save doesn't change it.

### Fixed
- A restore waits for the backup it takes first, and stops without replacing anything when the backup cannot be saved.
- Tray **Settings** opens **Settings › App** even when the studio window has only just been created.

### Removed
- The Profiles, Alerts and Island drawers, the **Follow** bars, **Pin for editing**, and the
  top bar's separate Import and Export menus, **Copy profile JSON** and **Kiosk view** buttons.

## [1.3.0-beta.7] - 2026-10-21

### Added
- Control actions for the Stream Deck plugin and other remotes:
  - **Mute alerts** for 1 to 1440 minutes with `POST /api/control/alert` `{ action: "mute", minutes }`, and `0` to unmute. Muted alerts still land in the history.
  - **Reload kiosk**, **dim the screen** and **show or hide the Dynamic Island** with `POST /api/control/kiosk` `{ action: "reload" | "dim" | "island", profile? }`.

  The control state carries `mutedUntil`, and each profile's `dim`, `island` and `reload`, so keys can show the current state. None of these touch `config.json`.
- Profiles: a card's **⋯** menu has **Duplicate**, **Always open this one** and **Export profile**, which saves one
  profile as a `.json` file. **Import** in the panel header adds a profile from such a file, or from Copy profile JSON.
- **When the app opens** at the bottom of the Profiles panel: **Best fit for the window** or **Always the same profile**.
  It replaces the Auto-pick toggle, and the setting it saves is unchanged. Tags on the cards show which profile opens:
  **Opens now** and **On launch**.
- The page strip shows **Cycling every N s** while page rotation is on.

### Changed
- With nothing selected, the inspector shows the profile's settings in three tabs: **Layout**, **Look** and
  **Behaviour**. It replaces Profile, Appearance and General.
  - **Layout** has the name, design size (with **Use this window's size**), Fill or Scroll, and a live grid preview
    with Columns and Rows steppers, Gap and Edge padding.
  - **Look** has Theme, Widget style and Background. Each has an **All profiles | This profile** switch, which
    replaces Inherit/Custom and the Apply-to scope. Corners follow the Theme switch. Widget style gets **Apply to
    every widget**, which locks every section of the profile's widget theme.
  - **Behaviour** has the page list with drag to reorder, Cycle through pages with interval presets, the Dynamic
    Island, Performance (with its own switch), Clock and date, Display, Studio and Connection. The General settings
    now live here in the studio.
  - Search and the Changed filter stay in the widget inspector only. In the desktop app, a footer link opens App
    settings.
  - Delete profile moved to the card's ⋯ menu, where it asks first.
- Clicking a profile card now only picks the profile to edit. It no longer changes which profile your displays show or
  turns auto-pick off. Pin for editing is gone, because a card click does what the pin did. The active card lists its
  pages and **Add page**. The top bar's profile menu lists profiles to edit.
- Left panels are at least 280 px wide.

## [1.3.0-beta.6] - 2026-10-21

### Added
- Max FPS and Motion under General › Performance, with a per-profile override under Profile › Performance and kiosk
  URL overrides `&fps=` (5, 15, 30, 60, 0 for unlimited), `&animations=0` and `&motion=reduce|full|system`. Max FPS
  defaults to 60, so nothing changes until it is lowered.

### Changed
- The kiosk no longer redraws at the display's rate when nothing changes. Animated gradients, smooth graphs and
  moving gauges share one frame clock capped at Max FPS, hidden items and gauges that reached their value cost
  nothing, and the Clock colon blinks once a second from the clock's own tick instead of a CSS animation. With
  Motion on Reduce they stay still. Motion also follows the URL and profile overrides.
- Scrolling text no longer uses a CSS animation. One Marquee, driven by the shared frame clock, scrolls InfoPanel
  items in both Faithful and Native mode (Faithful marquee text never scrolled before) and the new **Scroll when
  too long** option of the text widget. Clock widgets set to Time or Date take a .NET **Format**
  (`hh:mm:ss tt`, `dd/MM/yyyy`). Importing InfoPanel in native mode turns scrolling Text into the text widget with
  scroll on, and a Clock or Calendar keeps its Format, so "scrolling text" and "date and time format" no longer
  appear among the app work native mode asks for.
- Animated shape gradients turn without re-rendering the view: each frame only rewrites the gradient's own
  numbers, so a profile with animated gradients no longer rebuilds its whole scene (React commits drop from the
  frame rate to about one a second) and uses less CPU. The look is unchanged.
- Max FPS and Motion now reach the loops that still ran at the display's rate. Audio visualizers, the Ken Burns
  pan on game art and the pulsing dot of a working coding agent run on the shared frame clock, and with Motion on
  Reduce the visualizers hold one still frame and the pulse and pan stop. Below 60 fps, or with Reduce, widgets also
  drop their CSS transitions and animations (bar and ring glides, spinning icons, equalizer bars), which ran at the
  display's rate and re-laid out the page every frame; readings step at the data rate instead. At 60 fps and
  above nothing changes.

## [1.3.0-beta.5] - 2026-10-20

### Changed
- Profile previews are small screenshots instead of live renders, so they cost no running widgets. The Profiles
  panel is back to compact rows with a 104×60 thumbnail, and the top-bar profile menu shows a smaller one. The
  edited profile's screenshot is retaken from the canvas 2 seconds after you stop editing and when you save; the
  others are drawn in the background, one at a time, when the browser is idle. Imported InfoPanel profiles now
  preview as they look instead of a grey box. Screenshots are kept in this browser only, never in the config.

## [1.3.0-beta.4] - 2026-10-20

### Changed
- The Settings and Help windows show the studio logo in the title bar, and About shows it large. Settings ›
  Changelog lists each category's headlines with a "Show all" button, opens only the newest release, and no longer
  has a Markdown view.
- The Alerts and Dynamic Island panels on the left now look like the inspector on the right: the same collapsible
  sections, field rows, switches, selects and number boxes, with hints behind the info icon. Every setting does what
  it did before. The Dynamic Island groups (Shape, Idle, Look, Clock, Motion, Alerts, Dashboard notices) and the
  Alerts rule editor (Rule, the sensor or notification source, Display, Switch to page, Highlight widget) are sections.
- The Profiles panel shows each profile as a card with a live preview of its first page (its background, theme and
  widgets, drawn by the same renderer as the dashboard and scaled to fit), and the top bar's profile menu shows a smaller
  one, instead of a plain outline. A video background shows its poster. Previews are drawn only while on screen.

## [1.3.0-beta.3] - 2026-10-20

### Added
- The studio can pin a profile for editing: a pin in the Profiles panel, or "Pin this profile for editing" in the top
  bar's profile menu. While pinned, the studio keeps editing that profile and choosing a profile or Auto changes only
  what displays show ("Show on displays"); a new or imported profile is pinned and leaves the displays alone. The pin
  is kept in the studio's own storage, never in the config.
- Desktop app: Kiosk view resizes the window to the shown profile's exact size (even past the screen) and Back to
  studio restores the studio's size, position and maximized state. Moving the pointer to the top edge shows a strip with
  Back to studio, Minimize and Close. Kiosk view shows the profile the studio was editing and, in Auto, does not switch
  profile when the window is resized.

### Changed
- The studio's left rail is grouped with thin dividers: Profiles, Theme; Layers, Widgets; Gauges, Library; Alerts,
  Dynamic Island; Data sources. The Add button is now called Widgets.

## [1.3.0-beta.2] - 2026-10-20

### Added
- Gauge cards on the Gauges page have a right-click menu: Open in editor, Add to canvas, Duplicate and Export (disabled
  exactly when the detail pane disables them), and for gauges in My library Rename (in place on the card) and Delete
  from library. Delete on a focused library gauge card asks to delete it too.
- The Library's banner for uploaded files that are not in My library now has Review…: a list with a thumbnail, size and a
  "Used by a profile" tag per file, to add the ones you want to My library or delete the unused ones (after a confirm).
- Help: a "?" on the studio's left rail (above Keyboard shortcuts), a Help item in the tray and F1 open a Help window
  with 30 articles, search across Help and Settings, and links that open at a heading. F1 opens the article for what you
  are doing (the selected widget kind, the open drawer, import or remap). In a browser Help opens in a tab.
- Settings has a Help link in its sidebar footer, and its server error messages have a Learn more link to the matching
  troubleshooting section.

## [1.3.0-beta.1] - 2026-10-20

### Added
- A hand tool pans the studio canvas at any zoom: drag with the middle button, or hold Space and drag. The cursor
  shows a grab hand; Fit (and switching profile) puts the page back in the middle.
- Desktop app: the server can be stopped and started (tray and settings), and "Start the server on launch" can be turned
  off. While it is stopped or failed the window shows the start page with a Start button.
- Desktop app: server bind errors are recognised (port in use, with the first free port suggested; Windows blocking
  the port), and `GET /api/server/stats` reports uptime and connected clients without debug mode.
- Desktop app updates: a state machine (check, download with progress, cancel, install), a Stable | Beta channel and
  background download. Beta tags (`vX.Y.Z-beta.N`) publish as prereleases and feed the `updater-beta` release.
- Desktop app: new settings for app zoom, auto-restart after a crash and remembering window size; the settings file
  moves to version 2 (`host` becomes `listen`: local or lan) and keeps every existing value.
- Gauges in the Library are drawn from their spec (thumbnails and the detail preview) instead of a generic icon;
  image sequences still show their first frame.
- The gauge editor has "Save as new" next to Save when the gauge already has a library item: it creates "<name> copy"
  and later Saves update that copy (a profile gauge is linked to it instead of the original).
- The Library detail pane animates the selected gauge (a vector gauge sweeps its value, an image sequence plays its
  frames at its speed) and plays the selected video (muted, looped; the overlay button plays and pauses). Cards stay
  still, and reduced motion keeps the gauge still and stops the video autoplaying.
- Library cards have a right-click menu: the item's actions (Set as background, Open in editor, Duplicate, Export…),
  Rename and Remove from library. Delete on a focused card removes it too.
- The desktop app shows only its own right-click menus; the webview's menu (Back, Reload, Inspect) is gone, except in
  text fields, which keep cut, copy and paste.
- Desktop app: the settings window is redesigned as a sidebar of sections (General, Server, Coding agents, Updates,
  Diagnostics, Logs, About, Changelog) with search (Ctrl K). Every change saves at once; settings the server reads at
  start (port, who can connect, allowed host names, debug mode) show a restart bar with Undo and Restart server.
  It adds app zoom (Ctrl +, Ctrl - and Ctrl 0 in the window), server start, stop and error cards, a live log viewer
  for the server, app and studio, the update flow, an About page and the bundled changelog.
- The studio's left rail has a Settings button under Keyboard shortcuts (desktop app only).

### Changed
- The "Desktop app settings" item left the studio's ⋯ menu; the rail's Settings button opens the settings window.
- The studio top bar no longer has the Design | Sources switch: Sources opens and closes from its rail button, and
  the other rail items go back to the design view.
- Removing a library item asks first, and also deletes its file (a gauge's frames too) when no profile, canvas or
  other item still uses it. Copies already placed stay.
- A profile or dashboard background's image and video pickers list only My library's Backgrounds of that type; when
  there are none they say so and open the Library. A file uploaded from the picker is also added to My library (once,
  with its size, so a wide one is a Background). Typing a URL and dropping a library file still work.
- Library: "Add uploaded files to My library" appears when uploaded images or videos are not library items (older
  background uploads) and adds them as "Upload <id>"; files that belong to an imported canvas, a saved canvas or a
  gauge are left out.

### Fixed
- Save to library on a gauge in the profile (a Custom gauge widget or a canvas Gauge item) updates the library item it
  was placed from or first saved to, instead of creating another item each time; the editor header says "Saves to <item>".
  If that item was deleted, the next Save creates a new one. Known limit: a canvas gauge is linked by its item index
  path, so deleting or reordering canvas items can move a link to another gauge.

## [1.2.0] - 2026-10-20

### Added
- The `.canvas.zip` font licence review offers "Swap for <font>" for a font that may not be shared: same-category
  fonts from My library replace it in the exported package only, and the package carries the alternative's file (#41).
- Library › Fonts reads the licence column from the font file itself (name table, as declared: "OFL (declared)" or the
  declared text in a tooltip) for Data API and supplied fonts, not only those also in My library (#41).
- Import › Save has "Keep InfoPanel's screenshot for Compare" (off by default): the chosen screenshot is stored as an
  asset and the canvas remembers it, so Compare starts on it and "Change screenshot…" still picks another. The
  `.canvas.zip` carries neither the screenshot nor its id, and a screenshot whose file is gone falls back to choosing one (#43).

- Image-sequence gauges export from the Gauges page as `<name>.gauge-frames.zip` (PNG frames plus a `manifest.json`)
  and import back with "Import frames (.zip)", validated and capped like the other importers (#49).
- The Gauges page editor: an SVG template gauge has a Scale part (min, max, unit, decimals); a profile gauge's name is
  editable in the header and lands in the canvas item's Name or the widget's label; the filmstrip takes Left / Right
  to select, Shift+Left / Right to move and Delete / Backspace to remove frames, never while typing; and a library
  gauge shows "· My library" in the header (#48).
- Library › Profile assets: "Use for selection" sets a stored file as the picture of the selected image widgets (off,
  with the reason, when nothing selected shows an image), numbered frame series (three or more, `fan_000.png`, `fan_001.png`, ... without gaps) collapse
  into one row with a frame count that expands, and a "Tiled" badge and filter mark the file the page background tiles (#46 part B).
- Tests pin near-duplicate detection (a re-encode is caught; a resize is not, by the same-pixel-size rule) and a
  style preset dropped on a widget (#46 part B).
- A "Custom gauge" panel widget draws a gauge from the Gauges page inside a custom panel, with the same drawing as the
  Custom gauge zone widget; pick a preset in its Kind card, set its width, bind a sensor. Like the zone widget it is
  drawn live and has no `.infopanel` export (#47).
- Gauge cards on the Gauges page (presets, profile gauges and My library) drag to the canvas with the "Drag here to
  place it on the canvas" pill, and drop as a library gauge does (#47).
- "Add to canvas" for an image-sequence gauge offers the page's canvas zones and inserts the gauge into the one picked
  (#47).
- Widget settings v2, shared controls: a Thresholds control (zone bar, Warning / Critical sliders with an Off chip,
  Critical never below Warning, temperatures in °F when the widget reads °F), a device picker that states what Auto
  picks ("Busiest adapter · now Wi-Fi") with live readings and a checkbox list for multi-device rows, Small zones
  (Auto / Full / Card / Dense, Card only where the widget has a summary card) and Density in the Fit section, a 9-cell
  alignment with Spread (quick-bar-able), and Units & format rows (temperature unit, rate unit, decimals, clock)
  where the widget formats them. Thresholds, units and format, the meters' response and palette roles are themed.
- Thermals has "Use sensor limits" (on by default) instead of "0 = per sensor".
- Audio meter's amber and hot zones are an Audio level threshold (dB), defaulting to the old 72 % / 90 % of full scale.
- CPU monitor has Units & format (temperature unit and decimals of its temperatures).
- Widget settings v2 files all 54 widgets' rows by task (never under a shared "Content" group), with their colour rows on the
  theme palette:
  - The nine sample widgets (System overview, Now playing, Sensor group, Audio meter, Weather,
    CPU monitor, Uptime, Steam profile, Web page): their rows are filed by task as drawn in the concept, with per-section
    More rows. Their colour rows follow the theme palette (System overview CPU…Network = Series 1–6, Sensor group dots
    = Critical / Series 3 / Series 5, Audio meter level / hot = OK / Critical, Now playing visualiser colours = Series 1–3
    and Critical for the peak caps); look toggles (tints, cover background, heat ramps) stay per widget. Weather's view
    is a preset that sets its three toggles in place and reads Custom when they differ; Sensor group's Auto-discover is
    a Readings mode, and each listed sensor has a tune button for its own label, bar maximum, thresholds and decimals;
    Steam profile's Data tab shows whether the Steam API is connected; Uptime and Web page, which bind nothing, have a
    disabled Data tab.
  - The system and hardware widgets (Menu bar, KPI tiles, Status tracker, System status, Vitals,
    Service health, Process list, Core heatmap, GPU rings, GPU monitor, Memory usage, Thermals, Power draw, Fans): rows
    are filed by task. Sorting, history length, the fan spin and the menu bar's click behaviour are in Behaviour; bar
    scales and the Thermals / Fans full-scale values are in Data; the GPU rings and the Thermals fan dot follow the
    theme palette (Series 1 and 2, Series 3), the core heatmap ramp stays per widget. Status tracker's per-track levels
    are More rows of Thresholds.
  - The storage, network, info and audio widgets (Drive space, Storage health, Disk I/O, Network
    throughput, Network adapters, Clock, Timer, Coding agents, Calendar, Forecast, Sensor value, Custom gauge, Volume
    mixer, Meter bridge, Visualizer, Wave Link): rows are filed by task. Drive sort order, the Meter bridge peak hold and
    the Visualizer dynamics are in Behaviour; bar scales, the Meter bridge floor and the Wave Link meters are in Data;
    the Drive space neutral tint is a per-widget look toggle. Their colour rows follow the theme palette (Disk I/O read /
    write and Network download / upload = Series 1 and 2, the audio level colours = OK, hot / clip and muted = Critical,
    Visualizer colours = Series 1-3 and Critical for the peak caps). Custom gauge's gauge and frames data is no longer
    listed in the inspector.
  - The gaming and plugin-card widgets (FPS monitor, Game spotlight, OSD strip, Frame pacing,
    Playtime share, Steam friends, Steam game, Achievements, Steam library, Steam news, Text file, Notifications,
    Departures, Bluetooth, Stream Deck): rows are filed by task. FPS monitor's View and Bluetooth's View are presets that
    set their toggles (and read Custom once one is changed), the FPS target is in Data, Steam friends' sort order,
    Notifications' history length, Frame pacing's samples and Game spotlight's Ken Burns motion are in Behaviour, and the
    scrim darkness is a per-widget look row. Their colour rows follow the theme palette (FPS ring and sparkline = Series 1
    and 2, playtime slices = Series 1-6, friend statuses = Series 1 / OK / Warning / Critical / Series 2, Bluetooth
    battery = Warning and Critical).
- Widget settings v2, the theme editor (Studio › Theme in the rail, a page's Theme… in its menu, "Edit theme" on the
  canvas, the palette's "Theme editor…"): a scope list (All profiles, the profile theme, each page), live previews of
  CPU Monitor, Weather and Audio Meter under the edited values with Theme / Custom / Locked chips per section, "Who
  doesn't follow the theme" per section with Reset to theme (the widgets follow again and keep their own values), and
  the inspector without a Show tab: Style adds Status & series colors (Series 1-6, OK, Warning, Critical) after
  Colors, Data is Units & format (all four rows), Behaviour is Thresholds (every quantity) and Motion. The profile
  theme locks per section ("Default for all widgets · N custom on <page>", Lock / Unlock, and Lock all); a page follows the
  profile per section ("Follows the profile theme" + Customize, "Custom for <page>" + Use profile). The palette's
  "Go to setting" reaches every theme row (Accent, Glow, thresholds…) and opens the editor there; a widget's Follow
  bar link opens the theme it names (the page's or the profile's).
- A colour row that follows its palette role names the role ("Series 1") instead of "Auto".
- Widget settings v2 for panel widgets: a selected panel widget has the zone's four tabs (Show: Kind chips, Content,
  Size & placement; Style: Typography, Color, Custom CSS; Data: Bound data, Binding, Units & format; Behaviour:
  Thresholds, History, Fill), only the sections its kind reads, so a change of kind drops the rest. Typography,
  Color, Units & format and Thresholds follow the panel, which follows the theme ("Follows panel “Rig”" + Customize,
  "Custom for this item" + Use panel, Locked by the profile theme). New Thresholds for stat, value, bar and gauge:
  the bound sensor's unit picks the quantity (% load, ° temperature, else value) and the value or fill takes the
  palette's warning / critical colour. A widget that follows Thresholds is off until a theme level sets that
  quantity's levels. The Custom gauge kind chip shows only on a widget that already is one.

- A Gauge panel widget has its own Ring size (`size`), instead of sharing the font size row with text kinds, so changing
  its kind no longer carries the ring size over as a font size.

### Changed
- Widget inspector tabs are Show · Style · Data · Behaviour (was Content · Style · Data); a remembered Content tab
  opens Show, and a tab with nothing in it is dimmed and never picked by default. Sections follow the widget settings
  v2 spec: Header and Fit in Show; Skin & graphics, Colors, Widget colors, Surface, Typography, Size & spacing,
  Border & glow and Custom CSS in Style; Units & format in Data; Thresholds, Dynamic Island and Motion (Graph updates)
  in Behaviour. A widget's color groups and Style rows land in Widget colors (no longer hidden as advanced), its
  Thresholds group, GPU Monitor's temperatures, System Overview's Trends and the visualizer dynamics in Behaviour.
- "More (n)" at the end of a section replaces the Advanced settings switch and its "Show N advanced settings"
  button (also for the extra theme colors): open per section and widget type for the session; Search and Changed
  list More rows inline.
- Widgets declare whether they draw a header and what they draw in small zones. Clock and System Overview show only
  Title (a title draws their header); Calendar, Game Spotlight, KPI Tiles, Menu Bar, OSD Strip, Steam Game, Vitals
  and Web Page have no Header section: Title and Icon close Fit, and Show title is gone from all ten.
- The phone sheet's tiles use the new short labels (Header, Fit, Skin, Colors, Widget, Surface, Type, Spacing,
  Border, CSS, Format, Alerts, Motion, Island).
- Widgets follow a widget theme per section instead of the Follow global / Custom switch: each themed section (Skin &
  graphics, Colors, Surface, Typography, Size & spacing, Border & glow, Custom CSS, Motion) has a Theme / Custom /
  Locked pill and a bar ("Follows the profile theme · Desk" + Customize, "Custom for this widget" + Use theme).
  Following rows show the theme's values, read-only; Customize starts at them, or at the widget's own values kept
  from before; Use theme keeps those values stored. Editing a look row no longer flips the widget to Custom, the
  Changed count and section reset count only own values that apply, and a pinned quick-bar row of a following
  section shows the theme's value and opens its section. Copy style, Save style and Use as global style take the
  look the widget shows of its own; Paste style makes the sections it sets custom.
- The profile's style is its widget theme, over the all-profiles style; "Force global style" locks every section of
  the profile theme (All profiles: of every profile), and the old Inherit choice is gone. Pages can carry a theme of
  their own per section (no editor yet). The Global style tab no longer lists Dense summary, Summary card and Scale
  with the zone: they are per widget now. The island reads widgets' resolved settings.
- The Dashboard inspector has no Global style tab: its rows are the theme editor's All profiles and profile theme
  scopes. Appearance › Scope keeps "Apply to" for skins, presets, theme colours and surface and opens the theme
  editor. "Force global style" is gone: locking is per profile now (a profile theme locks its own sections, Lock /
  Unlock per section or Lock all), so the old All-profiles Force, which locked every profile at once, has no one-click
  equivalent; lock each profile instead. "Make all widgets follow" is Reset to theme per section in the editor. The
  palette's force toggle reads "Lock / Unlock every theme section" (this profile).
- A section the profile theme locks is the profile's on every page too: a page's own values for it stay stored but
  no longer apply (before, a custom page section still showed under the lock).
- Default thresholds now come from the theme, which shifts these unstored defaults: System status and CPU monitor
  load 75 / 90 → 80 / 92; Drive space (and its Dynamic Island source) 80 / 92 → 85 / 95; GPU monitor temperature
  75 / 85 → 80 / 90 °C; System overview VRAM warning 90 (critical at the load level 92) → 85 / 95; Meter bridge
  −18 / −6 dB → −9 / −2 dB; Status tracker tracks 1–2 50 / 80 → the load threshold 80 / 92. Stored levels are kept,
  and where only one level of a pair was stored the other keeps its old default. A Thermals widget with one level set
  (the other per sensor) gets the CPU sensor's old limit (80 / 90 °C) for the other.
- The stored config moves to version 9 over four steps (a build of an older version is refused saving over it), each
  keyed on the old keys and run on load:
  - Version 6: `styleMode` becomes per-section `follow` (Follow → every
    section follows; Custom or unset → the sections with own look values are custom), a profile's `style` and
    `styleEnforce` become `widgetTheme` values and locks (the dashboard's force switch locks the profiles without
    their own), and a global Dense summary, Summary card or Scale with the zone is written into the widgets that
    rendered with it. Nothing renders differently after the upgrade. Saved panels placed from the Library show their
    own look as custom sections; appearance presets keep themed keys only.

  - Version 7: renames the shared keys (`variant` + `compactView` → `compact`, `layout` → `sizeTier`, `alignX` /
    `alignY` → `align` + `alignSpread`, thresholds → `warn.<quantity>` / `crit.<quantity>`, device keys → `device` /
    `devices`, `units` → `tempUnit`, a Clock's `format` → `clock`) and drops the unused `autoScale`. Settings > General's
    12-hour clock moves to the theme's Clock format. Widgets that stored a value keep it as a custom section; an own
    value equal to the old widget default is dropped, so the widget follows the theme. A Clock set to the old explicit
    24-hour format is one of those: it now follows the clock format (General's 12-hour setting, else the theme).
  - Version 8: renames Now playing's visualiser keys (`waveformVariant` → `vizStyle`, `vizRamp` → `vizColor1`,
    `waveformSensitivity` → `vizGain`, `visualizerBarCount` → `vizBars`, `visualizerAlign` → `vizAlign`,
    `visualizerOrientation` → `vizOrientation`, `visualizerMinLevel` → `vizMinLevel`, `waveformLineWidth` → `vizLine`,
    `waveformFadeEdges` → `vizFade`, `waveformFadeWidth` → `vizFadeWidth`) and reads the old engines' keys once into what
    they drew, and Sensor group's `auto` → `mode`, and stores FPS monitor's Trend view with its sparkline on (what it drew). A widget with an own colour in a row that now follows a palette role
    gets Widget colors set to custom, so nothing repaints. Weather's Forecast preset no longer sets 7 forecast days.
    Sensor group's temperature unit also applies to auto-discovered temperatures.
  - Version 9: a Custom gauge panel widget's width is its own `width` and a Gauge panel widget's ring size its own `size`, no
    longer `fontSize`, so changing either to another kind no longer carries the size over as a font size (a 140 px text).
    Panels saved earlier (configs, My panels, Library panels, pasted widgets, the Code view) move it on load. A panel
    widget saved before the follow flags keeps its own font size, alignment, colour and decimals (those sections read
    as custom), so nothing renders differently.
- A vector gauge dropped into a canvas zone is baked to frames at the drop, so InfoPanel draws it at once: if baking
  fails the drop is cancelled with the error, and a drop with its bake is one undo step (#47).
- A library gauge with both a spec and frames, dropped on the grid, keeps its frames on the Custom gauge zone for a
  later export (#47).
- The studio spec now says `.gauge.json` is the lab's `VectorGauge` shape, and the concept's `GaugeRender` object is
  internal (#49).
- Component tests run in happy-dom per file (`// @vitest-environment happy-dom`, with a `setViewport` helper), and the
  Gauges page and the narrow-layout sheet now have them (#50).

### Fixed
- "Edit gauge…" over an editor with unsaved changes now asks (Save to library, Discard, Cancel) instead of replacing
  the working copy silently (#48).
- The canvas editor at narrow widths: when the toolbar no longer fits, the sensor source and Compare move into a "More"
  menu instead of being clipped, and the inspector docks, floats or becomes a sheet at the studio's own viewport
  breakpoints, so opening it no longer flips the mode back (#45).
- Library copies made on the Page background or inside the canvas editor now record the real profile, so "jump to
  copy" reaches them; older copies recorded without one are still listed but can't be jumped to (#46, part A: G12).
- Dragging a Library image, video or gauge over a canvas zone no longer shows the red "No room" grid ghost, since the
  zone takes the drop as an item (#46, part A: G14).
- After an import lands, the canvas editor opens on the new zone, as the spec says (#43).
- Opening the Library no longer closes the canvas editor: it stays mounted but hidden (keys off, size kept) and
  returns, with its selection and undo history, when the Library closes, so a Library drag can land in it (#43).
- A font added through Get a font is uploaded once, not once for the canvas and again for My library (#41).
- Exports (`.canvas.zip`, `.infopanel`) save through a native Save As dialog in the desktop app instead of a silent
  browser download; cancelling the dialog does nothing (#42).
- Profile import's XML errors for a bad entity point at its `&`, in text and in attribute values, and a character
  reference beyond Unicode is reported instead of crashing the parser (#52).
- The server accepts `PORT=0` (a free port, logged on start); its test uses it, so it no longer races another process
  for the port it picked (#51).
- Imported canvases no longer count against the config's 5 MB cap, so several imports save again: each is stored as
  its own file under `canvases/` in the data folder and the config holds a reference. An existing config moves its
  canvases on the studio's first save; older builds then refuse to overwrite it (#44).

## [1.1.0] - 2026-10-19

### Changed
- The project is now **InfoPanel Studio** (formerly InfoPanel Dashboard): the repo, the package name, the page
  title and the desktop app's messages. Config, its folder (`%LOCALAPPDATA%\InfoPanel\Dashboard`), the browser
  storage key and the server's `/api/health` app id are unchanged, so existing setups keep working.
- A config export is saved as `infopanel-studio-config.json`; older exports still import.
- The island shows the agent activity beside the waiting badge (`15:17 · Codex · api · ● 1`) instead of dropping it;
  the activity text shortens first when the pill is narrow, the time and the badge never do (#17).

### Added
- In-app updates: the desktop app checks GitHub releases shortly after it starts (a setting turns it off), the tray
  offers `Update to vX.Y.Z…`, and Settings has an Updates card to check now and install. Installing stops the
  app's server, runs the installer and restarts the app. Updates are verified against the project's updater key (#29).
- Coding Agents shows each session's cost and model, dims limits the agent has not reported lately and resets
  expired windows, projects when a window would fill at its pace so far, and this week's tokens by model and
  project with today's by type (#18).
- Coding Agents reads per-project and per-model token shares and lists live Claude Code sessions from
  `~/.claude/sessions`, all from local files.
- CI builds and tests every pull request and `main`; pushing a `vX.Y.Z` tag builds the Windows installer and
  publishes a GitHub release.
- InfoPanel profile import: a canvas zone that draws `.infopanel` profiles as InfoPanel does, with live sensors,
  a sensor remap step, and export back to `.canvas.zip` or `.infopanel`.
- Canvas zone editor with an item tree, a toolbar and an InfoPanel inspector.
- Library page: My library on the server (images, fonts, gauges, panels, canvases), profile assets and fonts,
  Get a font, and drag to the canvas.
- Gauges page with a gauge editor, image-sequence tools and a **Custom gauge** widget.
- Desktop app (InfoPanel Studio): a Tauri installer with its own Node and server, a tray, start at login and a
  debug mode.
- Studio logo and favicon; resizable left panel; widget editing with a quick bar, one-column inspector and a
  bottom sheet on narrow screens.
- Coding Agents widget (rings, heatmap, wide layouts) with Claude Code and Codex session status.
- Dynamic Island on profiles, with more sources, dashboard notices, look options and a Timer widget.
- Steam Friends widget; summary card, content-aware widget fit and drive labels.
- Network speed units, smooth graphs, show title, skin gallery, surface and theme swatches, profile radius.
- Alerts for sensor thresholds and Windows notifications.
- Profile pages, a control channel and kiosk page navigation.
- The studio redesign: rail, top bar, tabbed inspector, the template widget library and a real audio visualiser;
  panels on the style system with a visual panel editor; the System widget and shared style options.
- A standalone server, the Data API URL setting, and Wave Link and forecast data from the native InfoPanel
  plugins.

### Fixed
- The image proxy follows redirects by hand and checks every hop, so an https image URL can no longer
  redirect it to plain http on the LAN or a metadata address (#26).
- Coding Agents draws its full layout in 2x2 and 2x4 cells instead of only the summary card (#21).
- Coding Agents rings beside the sessions keep their reset times, in a line under each ring when there is no room
  beside them (#22).
- Token usage appears as soon as the server's first scan finishes, instead of up to 30 seconds after a restart.
- "Use it for this session" is only offered for, and only adopts, a node.exe owned by the current user, so
  another user on the machine cannot squat the port and be loaded with the studio's IPC capability (#27).

### Removed
- The legacy widget modules; zones that still name one are migrated to its template on load.
