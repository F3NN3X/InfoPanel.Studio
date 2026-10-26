# Changelog

All notable changes to InfoPanel Studio. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). A release takes the section headed with its
version as its notes, so move **Unreleased** under a new `## [X.Y.Z] - YYYY-MM-DD` heading before tagging.

## [Unreleased]

### Changed

- **Widgets grow with large zones.** A widget in a large zone used to keep the size of its largest layout and leave most of the card empty. Now its text, numbers and graphs grow with the zone, up to two and a half times, and a zone's **Size (%)** applies on top. **This changes how existing screens look:** their large zones now show bigger content. Small and medium zones look as before.
- **Readings fit their box.** The Sensor widget fits its number to the box as a value, and sizes a gauge's number from the ring, so it fills a large tile and no longer spills out of a small one. A figure's "%" stays inside its zone, a console line keeps readable text, and a small ring drops its inside label instead of drawing it tiny.
- **Status Bar text follows the bar's height.** The text was never larger than 22 px. Now it follows the bar's height, and when the items don't fit it shrinks before any is dropped, so Meters, Orbit and Ticker show every reading at every size. Their pill sits in the middle of the screen at the height its readings fit. Meters on a wide screen stacks a pill each for the CPU, the GPU and the frame rate, and Orbit fills a wide screen.
- **Small fixes for short and tall zones.** The clock's time grows with its zone and its date and seconds grow with it. The OSD strip puts each label beside its value in a short row, the System widget puts CPU and RAM on one line, the process list shows only whole rows, and Now playing sizes its cover from the zone and gives the title two lines.

### Added

- **Every template look is a theme.** **Theme › Start from › From templates** lists the look of each screen template, and of each of its palettes (Graphite · Amber, Neon · Toxic, Frost Bar · Ice and so on), grouped by template. Press one to apply it to any screen, or the copy button to keep it in Library › Themes and edit it like your own. A new screen made from a template looks exactly as before.

## [1.3.0-beta.30] - 2026-10-26

### Changed

- **New screen is a page, in two steps.** **New** on Screens opens a page in place of the cards instead of a menu and a popup. First **Start from**: Blank, the templates with their shape chips, and the sample layout, an InfoPanel profile or an import. Then **Size and look**: the size, the template's colours and a name beside a live preview at that size. **New InfoPanel profile** works the same way, and the InfoPanel home's Create cards open it on the second step.
- **Templates come at the size they are made for.** A template used to be made at the studio window's size, so an untouched New screen came out as large as the desktop. Now each template brings its own size (Meters at 1600 × 300, Deck at 1920 × 1080, in both New pages), until you change the size yourself. Blank starts at 1024 × 600, or the edited screen's size when that is a panel preset, and the first-run setup starts on the Panel size. Five sizes join the presets: 1920 × 440, 1280 × 400, 480 × 800, 600 × 1024 and 1080 × 1920.
- **Every template has a size of its own, and fits it.** Each screen template now names the size it is made for. The sizes of the text and readings inside it follow the screen's size from there, from 60 % to 160 %, so Cores, Tower and Quota no longer overflow on a small panel or look tiny on a large one. Gaming's top strip is tall enough to read on every size, Paper, Glass and Graphite have a wide arrangement of their own, Meters and Ticker fill the height of a strip, Cores' header labels are shorter, Deck's graphs are shorter on 1920 × 1080, Terminal shows three taller lines a pane on a strip, Streaming's wide arrangement uses the card player, and Console and Frost Bar have fewer cells on a standard screen.

### Added

- **Right-click menus on Screens and the InfoPanel home.** A right-click on a screen card, a saved Library card or an InfoPanel profile card opens the same actions as its **⋯** menu. Saved cards and the home's profile cards now have a **⋯** menu too, and a screen card's menu starts with **Open**.

## [1.3.0-beta.29] - 2026-10-26

### Changed

- **Smaller kiosk download.** A kiosk screen now downloads only the widgets it shows. Each widget loads on its own, all of a page's at once as soon as the screen is known; the screen's other pages follow while the kiosk is idle, and a kiosk changing screens keeps the old one up until the new one's widgets are in, so switching draws at once. What a kiosk loads before it can draw drops from 342 KB to 248 KB gzipped (27 % less), and the studio's from 657 KB to 564 KB; the first paint comes about 30 ms sooner on a fast PC. The studio loads a widget the first time it shows one, on the canvas or in the Add list.
- **Imported InfoPanel profiles open and edit more faithfully.** Text drawn without InfoPanel's font answers now takes the weight of its style (a "Bold" or "SemiBold" style drew regular before), a font InfoPanel can't answer for draws by its name instead of Segoe UI, and a styled font that isn't installed draws Segoe UI regular, as InfoPanel does. Sensors of a plugin renamed in a later version are found by reading id and name. The Sensors step has **Leave N unresolved unbound**, so a profile from another PC no longer takes three clicks per missing sensor. The Import door has **From InfoPanel on this PC…** for the profiles InfoPanel has installed here. An item kept as InfoPanel because its picture is missing names the file; the door no longer says "Imported 0 files" when it hands an `.infopanel` to the import steps. The editor's Add palette takes at most half the column, so Layers shows more than a few rows.

## [1.3.0-beta.28] - 2026-10-26

### Added

- **Palettes for the native InfoPanel templates, and closer copies.** Each of the 17 templates now has the palettes of its InfoPanel original (Graphite amber, teal and violet, Terminal green, amber and cyan, the Dark, White, Smoke and Float family, and so on). New screen shows them as a **Colours** row under the cards, the cards follow the pick, and the first-run template step has the same row. A reading a template asks for that this PC doesn't have is filled from a similar one or left out, and the zones next to it take its room, so Tower no longer leaves empty tiles. Terminal, Mono, Readout, Console and Deck are closer to their originals: Sensor Value has new **Line** (label, meter and value in one row) and **Figure** (a large light number) displays, the Clock a **Line** face, a size like 5,414 MB reads as 5.3 GB, and a custom CSS rule that starts with `:scope` now applies in the templates that used it (Paper's shadows, Mono's hairlines).
- **History and analysis widgets.** **Bottleneck Lens** names what holds a game back (CPU-bound, GPU-bound, VRAM full, thermal throttling, power limited or balanced) with the reason under it, and holds a verdict for a few seconds before it changes. **Frame Histogram** bins frame times over the last minute with the 1% and 0.1% lows and the 60 and 120 fps guides. **Session Stats** keeps min, average, max and time above a level for up to six sensors, with Reset in the studio. **Threshold Timeline** draws a green, amber and red lane per sensor over the last few minutes. They choose their sensors on drop and keep a short history in the page only: a reload starts it again. The kiosk entry grows by about 9 KB gzipped, and its budget with it.

- **Status bar presets: Meters, Orbit and Ticker.** The Status Bar widget has three new views, each its own entry in Add widget, drawn like the InfoPanel designs of the same names: Meters (double rings with rows of thin bars), Orbit (a load ring at each end, FPS in the middle) and Ticker (one line: CPU, GPU, FPS, time). They use new items you can put in any bar: CPU ring, GPU ring, CPU double ring, GPU double ring, FPS and CPU, GPU and FPS lines. The CPU and GPU are found by role. FPS shows a dash when no game runs, and the FPS line leaves itself out. In a narrow zone the bar drops the least important item first. Saved settings are unchanged.
- **Day Planner, Radial Clock Stack and On-Air Beacon widgets.** Day Planner puts today's calendar events on a time rail with a now line and a temperature and rain band behind them. Radial Clock Stack shows the day, the year or week, a sensor and the time to the next event as rings around the time. On-Air Beacon shows LIVE, REC or Off air from OBS, with the time it has been going. They refresh once a minute; only the live pulse animates. A sensor bound in a widget's settings is now streamed to the kiosk with the widget.
- **Native versions of the InfoPanel templates.** New screen lists 17 more templates under their own heading: Graphite, Glass, Neon, Paper, Mono, Terminal, Clock, Cores, Deck, Meters, Orbit, Tower, Ticker, Readout, Console, Frost Bar and Quota. Each copies the look of the InfoPanel template of the same name with real widgets, in the shapes the original fits, using the Status Bar's Meters, Orbit and Ticker views where the original is a pill. They come in their first palette only. The cards are now pictures of the template at the size, taken as they scroll into view; until one arrives it shows the plan of its zones. The Work template's Coding agents card no longer leaves a tall empty area on a tall screen. A Sensor Value ring no longer spills out of a zone that is taller than it is wide.
- **Screen templates.** **Screens › New › Dashboard from a template…** opens New screen: Blank or one of seven starters (General, Gaming, Work, Hardware, Streaming, Minimal, Status bar), sorted by shape with the same chips as New InfoPanel profile, and a size. Each template has its own arrangement for every shape it fits, brings its look (theme, background, skin and effects) as the screen's own, splits its grid to suit the size and finds this PC's sensors for the widgets that read one. A template that doesn't fit the chosen size switches to one it does. Creating the screen is one undo step. The first-run setup's Start from a template offers the same templates.
- **Align, distribute and multi-edit on the Design canvas.** Hold `Shift` and drag over empty grid to select every zone the box touches. With two or more zones selected, **Align and distribute** in the right-click menu and the command palette aligns them left, right, top or bottom (`Alt+A`, `Alt+D`, `Alt+W`, `Alt+S`), matches their width or height to the primary zone, and with three or more spaces them evenly (`Alt+Shift+H`, `Alt+Shift+V`). It works in grid cells; a change that would overlap a zone, leave the grid or go under a minimum size is refused and nothing moves. The inspector marks a setting **Mixed** where the selected zones differ. Each action is one undo step. Saved settings are unchanged.

### Changed

- **Converting to InfoPanel is experimental.** Convert zone and Convert screen say so in their menus and window. The conversion stays as it is; new widgets and effects are made for the dashboard's own screens.

## [1.3.0-beta.27] - 2026-10-25

### Changed

- **The startup screen is a setting.** "When the app opens" moved from the Screens page to **Settings › Dashboard › Startup screen**, where you pick Best fit for the window or one screen. A screen's **Shown on** panel links to it. The saved setting is the same one, so nothing changes for your displays.

### Added

- **Named displays.** A kiosk link can carry `?display=hall` (letters, digits, `-` and `_`, up to 32). Screens then lists each display with its online state, last seen time and address, and a picker that sets its screen from the studio, or leaves it following "When the app opens". Copy kiosk link takes an optional display name, and a screen's Shown on lists its displays. Links without a name work as before.
- **A screen and profile manager.** Screens is now one page for every screen and saved InfoPanel profile. Cards have thumbnails and a kind badge (Dashboard, InfoPanel, Mixed); search by name, kind or size, filter by kind, and sort by last edited, name, size or your own order (Move earlier, Move later). **New** makes a blank screen, a screen from the sample layout, or an InfoPanel profile or template. Rename, Duplicate, Export and **Copy kiosk link** are on each card's menu, and a panel shows whether the app opens on a screen and which kiosks show it now. Delete names what goes (pages, zones, InfoPanel canvases, the launch screen, kiosks) and an **Undo** in the message brings the screen back, canvases included; the last screen can't be deleted. Saved InfoPanel profiles from My library are listed too, to place, duplicate, rename or remove. The InfoPanel home uses the same cards and links to **Manage all screens**. Everything the old Screens page had is still there. Each screen now remembers when it was last edited.
- **Components, reusable pieces for both editors.** In the InfoPanel editor, **Save as component** (`Ctrl+Shift+S`, the toolbar or the Layers menu) keeps a selection, group or element in My library's new **Components** collection, with the files and palette colours it uses and the role of each sensor. Drag one onto a screen to get a canvas zone, or into an InfoPanel profile to merge its items where you drop it, as one undo step. Files are merged once, palette colours take the profile's, and sensors the PC doesn't have are matched by role, then Remap. A placed component counts as a copy, and My library won't remove a file a placed copy still uses. Components don't show as profiles. Saved settings and the profile format are unchanged.
- **Convert dashboard widgets to InfoPanel.** Right-click a zone and choose **Convert zone to InfoPanel…**, or use the command palette's **Convert screen to InfoPanel profile…**. Each widget is rebuilt from InfoPanel's own items (Recreate), pictured as it is now (Static snapshot) or left out, and your choice is kept on the zone. Panel widgets become Values, Bars, Gauges, Graphs, Tables, Text, Images, Clocks and Shapes; every other widget keeps its look as a picture of itself with its values taken out, and each value goes on top as a bound InfoPanel item in the same place, font, size and colour (bars as Bars, rings and level meters as Gauges, sparklines as Graphs, the time and date as a Clock and Calendar). Widgets that aren't made of InfoPanel data (Coding Agents, Countdown, Timer, Web Page, WaveLink) are named and left out. A widget whose values can't be read from the page yet is rebuilt from the readings it shows (hardware by role, plugins by their entries) on a card; one whose readings aren't on the PC goes as a snapshot. A zone becomes an InfoPanel canvas zone and is saved to the Library as a component, a screen a new profile (Screens › card menu › **Convert to InfoPanel profile**, or the command palette), and a report lists what each widget became. The page background is one picture under everything, a canvas zone keeps its items, and what else moves (a weather animation, a tile's colour) stays as it was when converted. Saved settings stay at version 13.
- **Your own icons, including one for each drive.** An Icon element in the InfoPanel editor can show an image or SVG from My library (or one you upload there) instead of a built-in icon, and a Drives element has a row for each drive to pick its own image or an icon from the set. The Drive Space widget has a **Drive icons** setting that does the same. In an `.infopanel` export your file is a plain Image of the profile's file (Native); My library won't remove a file a profile or screen still uses. A file is drawn as it is (an SVG isn't tinted) and fitted inside the icon box, keeping its shape. No brand or game emblems are included. Saved settings stay at version 13.
- **HWiNFO sensors grouped by device.** The Data page, the widget pickers and the InfoPanel editor's sensor list now show HWiNFO's sensors under the device HWiNFO reports ("CPU [#0]: ...", "S.M.A.R.T.: ...", "GPU [#0]: ..."). This needs an InfoPanel build that lists HWiNFO's devices in the Data API; with an older build HWiNFO stays one flat list.
- **Glowing numbers, in both editors.** Style › Typography has **Number glow** (Auto keeps the skin's own glow, Off removes it, Soft and Strong set one) and a glow color, for the theme, a page, a zone or one widget, following the usual theme levels. In the InfoPanel editor a Text or Value's Glow section now holds the radius and the colour together, and Row, Rows and Double ring have a **Value glow** switch. It exports as InfoPanel's own Glow settings. Readout and Console each have a glow colour set (Glow, Ice glow) with glowing numbers.
- **Ring faces, in both editors.** A ring can have a **Face**: a dark disc inside it with a Hex, Dots, Grid or Carbon pattern. The Gauges editor has it as a part (Decor, arc only), so a Custom gauge on the dashboard can have one, and the Ring and Double ring elements in the InfoPanel editor have a Face section. It's drawn once under the arc, so the moving arc never redraws it. InfoPanel can't draw a pattern, so the export bakes it into the ring's frames. Console's CPU and GPU rings now sit on a hex face.
- **Glass blur on Cards.** A Card in the InfoPanel editor has a **Background blur**, drawn live over whatever is behind it. InfoPanel can't blur an item's background, so the export bakes the blurred background (the profile colour and the images, shapes and cards under the card) into the card's image, and the card is badged Approximated. Text, values and gauges behind it stay sharp in InfoPanel. Frost Bar's cards now really blur the wash behind them.
- **A newer config version.** Saved settings are now version 13. A copy of the studio from before this release can no longer save over them (the server refuses it and asks it to reload), so it can't strip the glow settings.
- **An InfoPanel home page.** The rail's InfoPanel button now always opens it, even with a profile open. It leads with Continue editing, then Create (Blank and the templates, as cards that open New InfoPanel profile on that choice), then the profiles in this dashboard and in your Library as cards with live thumbnails, with Open, and Duplicate and Remove for the Library's. The editor's toolbar has a Profiles button back to it; the profile stays open.
- **Group management in the InfoPanel editor.** `Ctrl+G` groups the selection, from different groups too, and `Ctrl+Shift+G` ungroups; the Layers menu has both, plus Rename, Duplicate and Delete. Layers rows drag to reorder, into a group or out of one, several at once, with an indicator for above, inside and below, and a line saying why when a drop isn't allowed. Groups open and close (InfoPanel's IsExpanded) and rename in place. A click on the canvas selects a whole group; `Alt`+click or a double-click selects the item inside. Items keep their canvas positions through every move. A Cores element's bars stay managed by the element.
- **More elements in the InfoPanel editor.** Add now has Row, Rows, Graph stack, Dual graph, Double ring, Drives and Shadow text. A Row is a label with its value on the right, an optional icon and a thin bar; Rows lists several, evenly spaced. Graph stack puts 2 to 4 labelled graphs in rows, and Dual graph draws two series over each other. Double ring is two rings, each on its own sensor, with a value in the middle. Drives makes a tile per drive from the Data API. Shadow text puts a dark copy behind a Text or Value. The Help article says what each exports as.
- **Five more profile templates: Deck, Meters, Orbit, Tower and Ticker.** Deck is a second-screen dashboard of cards, Meters a wide pill with double rings and rows with thin bars, Orbit a pill with a ring at each end, Tower a tall card of readings with graphs, and Ticker one long line of text. Each comes in Dark, White, Smoke and Float (no cards, shadowed text), and Deck also in Tint. They are built from the editor's own items and elements, so you can edit every part. New Profile now offers 1920 × 720, 1600 × 300, 1280 × 160, 1080 × 240 and 480 × 1920, and picks the size a template is made for. FPS needs InfoPanel's RTSS plugin; without it those rows stay unbound for Remap.
- **Histogram and fill opacity on Sparkline.** A Sparkline can draw bars, which export as InfoPanel's histogram graph, and its fill has an opacity.
- **Colours by value on Ring and LED bar.** Each colour takes over from a percent of the range, so a ring turns amber and red as it fills.
- **Rounded gradient look on Bar.** One button sets half-height corners and a gradient fill.
- **Four more InfoPanel templates: Readout, Console, Frost Bar and Quota.** Readout is three instrument panels with one huge number each. Console is a header strip, CPU and GPU rings, RAM and VRAM bars and a tile for each drive. Frost Bar is frosted glass cards over a soft wash. Quota is a large clock with a CPU, RAM, GPU and Disk list. Each has two or three colour sets, and New InfoPanel profile has 1920 × 540 and 1920 × 720 sizes. Memory speed is a new sensor role.
- **New sensor roles for templates:** FPS, 1% and 0.1% low, frame time, VRAM used, total and temperature, GPU memory clock, hot spot, fan and voltage, RAM total and free, disk free, busiest CPU core, CCD1 and CCD2 temperatures, 12V rail and UPS power.

### Fixed

- **Sensor roles and drives found in HWiNFO.** GPU hot spot, memory speed, GPU fan, memory temperature, CCD temperatures and FPS are found in HWiNFO when LibreHardwareMonitor has no such reading, and HWiNFO's temperatures no longer show "Â°C". The Drives element finds HWiNFO's drives as they are really reported, named from the device list when the Data API sends one.

## [1.3.0-beta.26] - 2026-10-25

### Added

- **A sensor dropdown in the InfoPanel editor.** An item's Sensor section now opens a searchable list of the Data API's sensors, grouped by source and device, with each sensor's live value. It works from the keyboard, binds the item natively, and replaces the Choose sensor button. The raw bindings (sensor type, HWiNFO ids, Libre and plugin ids) are shown read-only under Binding details; Sensor name is still editable there, and Value type is still a choice list.
- **Sensors at Create.** New InfoPanel profile lists every sensor the chosen template reads, with the one found on your PC, in the same dropdown. Change any of them, or leave one unbound, before you press Create.
- **InfoPanel profiles in the Library.** The Library's Canvases are now InfoPanel profiles, drawn on their cards. Edit profile opens the InfoPanel editor. The editor's toolbar has Save to Library, which becomes Update in Library once the profile has an item. The InfoPanel page lists the saved profiles that aren't on a screen under In your Library, and New InfoPanel profile can start from one and, with Also save to Library, keep the new profile there too.

### Changed

- **The Clock template counts seconds.** Its ring now reads InfoPanel's clock plugin (Clock · Second) over 0 to 59 and is baked with 60 frames, one for each second, instead of showing CPU load. The CPU label and value under the date are gone. Without the clock plugin the ring is left unbound and Remap lists it.

## [1.3.0-beta.25] - 2026-10-25

### Added

- **The Export window says what the other PC needs.** For an .infopanel it lists the fonts the profile uses that Windows doesn't ship, and which sensor sources it reads: HWiNFO sensors are matched by name when InfoPanel imports, Libre and plugin sensors must exist there with the same ids.
- **Profile templates.** New InfoPanel profile now starts from Blank or one of eight templates: Graphite, Glass, Neon, Paper, Mono, Terminal, Clock and Cores, each with three sets of colours and a live preview at the size you pick. A template lays itself out for any size, binds to your PC's CPU, GPU, RAM, disk, network and uptime sensors, and leaves anything it can't find unbound, named in a line over the canvas with a Remap button. It's built from the editor's own items and elements, takes its colours from the profile's palette, and exports like any profile.

### Changed

- **Profile.xml now matches what InfoPanel's own export writes.** The same elements in InfoPanel's order, empty text as `<X />`, and the window state of the PC it came from (active, topmost, window position, process triggers) left at a fresh profile's values, so an imported profile doesn't arrive inactive or pinned. Item elements and empty groups and gauges follow InfoPanel's order too, checked against real profiles.

### Fixed

- **Image and gauge-frame URLs InfoPanel would ignore.** InfoPanel only keeps an HTTP address that starts with http:// or https:// and an RTSP address that starts with rtsp:// or rtsps://; the editor now refuses others instead of exporting them.

## [1.3.0-beta.24] - 2026-10-25

### Added

- **Elements in the InfoPanel editor.** A new Elements group in Add: Ring (a value arc with a gradient, end dot, ticks, LED segments or a glow), LED bar, Card (rounded, with a gradient, stroke, drop shadow or glow), Glow, Divider, Icon (a searchable set of icons), Cores (one bar per CPU core, bound to its load) and Sparkline. They draw live in the editor and on kiosks, and export as InfoPanel items: what InfoPanel can draw goes as its own items, the rest is baked into images or gauge frames when you export.
- **Export badges.** Layers and the inspector mark each element Native, Baked or Approximated, with the reason. The Export window bakes everything that needs it, with progress, and lists what an approximation loses.
- **A palette for each InfoPanel profile.** Accent 1 to 3, text, sub-text, track, card, warning and critical, in the profile settings. New items and elements take these colours, and changing one recolours everything that uses it. The palette stays in the studio; the .infopanel file carries plain colours.

## [1.3.0-beta.23] - 2026-10-24

### Added

- **The InfoPanel editor, on its own page.** InfoPanel on the rail opens it: the Add palette and Layers on the left, the canvas in the middle, the inspector on the right. It edits a canvas zone, with undo and redo in the studio's history; Edit items on a canvas zone opens it there, and with nothing open the page lists the dashboard's InfoPanel profiles.
- **New InfoPanel profile.** A profile from scratch, with a name and a size (480 × 320 up to 1920 × 1080, or custom), as a new screen in the editor. It's on the InfoPanel page, in Design's Add list under Layouts, in the Import window, in the Library and in the command palette.
- **Add palette for InfoPanel's 14 item kinds**, grouped as Text, Data, Media and Layout. Each new item gets InfoPanel's own defaults and goes where InfoPanel would put it: into the selected group unless it's locked, else on top.
- **Profile settings.** With nothing selected the inspector edits the profile: name, size, background, font, colours, font scale, Show FPS, OpenGL and the web view settings, with InfoPanel's own checks. Resizing keeps every item in place.
- **Snapping and guides in the InfoPanel editor.** A move or resize snaps to the canvas's edges and centre and to the other items, with guide lines; hold Alt to stop it. Shift keeps a drag on one axis and a resize in proportion. The selection shows its size, and a hint line under the canvas names the keys.
- **Several items at once.** With more than one item selected, the inspector aligns them (left, centre, right, top, middle, bottom), spreads them evenly across or down, and edits the fields they share, such as X, Y, font and colours. Each is one undo step.
- **Drag from Add.** Drag a kind from the Add palette onto the canvas to create it there; a click still adds it centred.
- **New items look at home on the profile.** Text takes the profile's colour; Bar, Graph and Donut sit on a muted track with a blue accent and no frame; a Gauge is a blue ring; a Shape is a rounded card a little lighter than the background. They're ordinary InfoPanel fields, so the .infopanel file carries them.
- **A bound Table takes its plugin's column format**, when the InfoPanel build reports it.
- **Locked items let clicks through on the canvas**, to the item below. Select them in Layers.
- **Sensor picker with native bindings.** Choose a live Data API sensor, by source and device; the item gets InfoPanel's own binding, so the .infopanel file reads that sensor. On an InfoPanel build that reports no sensor ids it binds the preview only, and says so.

### Fixed

- **A remapped sensor was lost in the .infopanel export.** A Remap choice, in the editor or at import, now rewrites the item's InfoPanel binding too.
- **The .infopanel export now writes `_valueType` next to `ValueType`**, as InfoPanel's own files do.
- **Reset to automatic in Remap now restores the original sensor.** After a choice it used to resolve the new binding, so only undo brought the old one back.
- **The Remap panel keeps its selected row after a choice.** It used to jump back to the first row.
- **Audio Meter's Auto said it picks the loudest device.** It meters the default device: the default output, or the default input when Show is Inputs. The Device list's Auto row now says so and names the device it follows right now.

## [1.3.0-beta.22] - 2026-10-24

### Changed

- **Every release is built from code that passed its checks.** The release build now stops unless the tagged commit passed CI (or the nightly run), and it runs the desktop app's Rust tests before building the installer.

## [1.3.0-beta.21] - 2026-10-24

### Added

- **Pick audio devices, inputs and outputs, in every audio widget.** Audio Meter, Meter Bridge, Volume Mixer, Visualizer, Now Playing's visualizer and Wave Link have a device list you can tick several from, and **Show** (All devices, Outputs or Inputs) narrows it. The Visualizer draws the loudest of the devices you pick. Wave Link's Inputs are its channels and input devices, its Outputs the mixes. Inputs need InfoPanel.AudioMeter 1.5.0; with an older plugin every device counts as an output. A saved single device carries over as one picked device.

### Fixed

- **Audio Meter's Volume bar and mute marker never showed for the default device.** One device meters the default device unless you pick another, and its volume and mute weren't found; they now come from the volume plugin's default device. Meter Bridge's default-device column gets them too.

## [1.3.0-beta.20] - 2026-10-24

### Changed

- **Help covers the newer settings.** Startup explains where the studio opens, Release the hidden studio, Reduce studio animation when unfocused and Refresh the Studio; The studio explains Design preview data and the Frozen chip; Diagnostics lists Open WebView2 task manager; Kiosk explains Allow editing from other devices. App zoom is described correctly: it scales the studio and the app window.

## [1.3.0-beta.19] - 2026-10-24

### Removed

- **The bundled Node.** The app no longer ships `node.exe`, so the installer and the installed app are about 80 MB smaller. The dashboard server runs inside the app, as it has since beta.18.
- **The Server setting** (Settings › Diagnostics). It chose between Node and the app's own server; there is only the app's own server now, and a stored Node choice is dropped when the app starts. `npm start` and `start-dashboard.bat` now run the same server from source and need Rust (stable) installed.
- **"Stop it and start the app's server"** when another server holds the port. A server you run yourself from source (`npm start`) is used as it is; anything else on the port gets the usual choices (use the next free port, view logs).

### Fixed

- **Updates leave no old files behind.** Installing over an earlier version now clears the bundled Node folder and the app's old web files first, which an update used to keep (about 90 MB on an install that started before this release).

## [1.3.0-beta.18] - 2026-10-24

### Changed

- **The native dashboard server is now the default.** The app runs the dashboard server itself instead of a separate Node process: about half the memory (41 MB against 82 MB), less idle CPU and one process fewer. Existing installs move over on their next start. If something misbehaves, Settings › Diagnostics › Server › Node switches back, and please report it: Node is going away in a later release.

## [1.3.0-beta.17] - 2026-10-24

### Added

- **A native dashboard server (experimental).** Settings › Diagnostics › Server (experimental) › Native runs the dashboard server inside the app instead of as a separate Node process. The server answers the same, reads and writes the same files, so you can switch back and forth. It uses about half the memory: 41 MB against 82 MB for the app plus the Node server, idle or with five kiosks connected. Node stays the default for now.
- **Design preview data.** The Design canvas can show a snapshot of the sensor values instead of live data: *Frozen*, or *Frozen when unfocused* (now the default: live while you work, frozen a minute after the Studio loses focus). A frozen Studio stops its own Data API stream and its effects, using a fraction of the CPU. The zoom bar shows "Frozen · HH:MM" with Refresh (Shift+F) and Go live for this session; F toggles it. Kiosks, Kiosk view and the Data view stay live. Settings › Studio, or Settings › General › Window.
- **Open the studio in Microsoft Edge or your browser.** Settings › General › Window › Open the studio in: the app window (default), Microsoft Edge in app mode, or the default browser. The app then runs no studio window of its own; with Edge already open this saves most of the studio's memory. The tray, a second launch and Settings' links open it there, and asks before opening a second one. In a browser the Studio saves as soon as its tab is hidden, asks before closing with an unsaved change, opens Kiosk view in a window of its own, and opens Help in a tab.

### Changed

- **Coding agent hooks start about eight times faster.** The Claude Code and Codex hooks now run a small native helper (`ips-agent.exe`) instead of Node: about 6 ms per event instead of 50. The app moves existing hooks over on its next start; nothing to do.
- **The Design preview setting follows you between the app window and a browser studio**, and a browser studio picks up Dashboard and Studio settings changed in the app's Settings window.
- **The hidden Studio gives back its memory.** After 10 minutes in the tray its page is closed (Settings › General › Window › Release the hidden studio: 1 minute, 10 minutes, an hour or never); opening it from the tray rebuilds it in a moment. Edits are saved before it closes; unsaved undo history is lost.
- **The kiosk page downloads about 200 KB less script.** Gauge icons come from markup made at build time, so the page no longer carries React's server renderer.
- **Kiosks and the Studio draw fewer frames when nothing moves.** Clocks wake only when the time they show changes, finished animations stop asking for frames, and the animation loop sleeps until something is due: a page with only a clock, weather or visualisers runs at about 35 frames a second instead of 60, and at none with nothing animating.
- **The Studio slows down in the background.** A minute after its window loses focus the canvas moves at 5 frames a second and weather, visualisers and other effects pause; they resume the moment you come back. Turn it off in Settings › General › Window › Reduce studio animation when unfocused.

### Fixed

- **Calendar events on the 31st (or 29 February) kept repeating only until the first month without that day.** They now skip such a month and carry on.
- **The font list cache and the coding agents' settings files are written atomically**, so a crash can no longer leave a cut file.
- **A kiosk no longer starts on its local copy of the layout.** Until the server's config arrived it showed the local copy (the defaults in a fresh browser), reported that profile (`main`) as shown, and its widgets connected to that copy's Data API address. It now waits for the server's config (or for the server to be unreachable) before it draws.

## [1.3.0-beta.16] - 2026-10-23

### Fixed

- **Frame Pacing and the FPS widget's frame-time graph** no longer jitter or bend into odd shapes:
  - a slow frame now rises, as on RivaTuner's own graph;
  - the scale moves in round steps and ignores a game's loading spikes, which used to flatten the line, and the line is drawn straight between readings;
  - a frame time RivaTuner reports that doesn't fit the frame rate (0.1 ms at 130 fps) is replaced by the frame rate's average;
  - the budget lines are on the graph's own scale and read as "60 fps · 16.7 ms", with their labels beside the graph;
  - the time axis says 2 min, the span of 120 one-a-second readings;
  - the FPS graph cuts menu and loading-screen spikes.

## [1.3.0-beta.15] - 2026-10-23

### Changed

- **Less CPU and GPU on the kiosk.** Measured on a 1920×550 strip with 11 widgets, about 0.94 → 0.7 of a core at 60 fps, with nothing turned off:
  - a widget's blur is skipped over a solid page background, where it shows nothing (images and videos keep it; the island and alerts always do);
  - weather effects, the art drift behind games, visualizers and animated Meteocons draw at most 30 frames a second, even when Max FPS is higher (meters and values keep Max FPS);
  - animated Meteocons follow Max FPS and stop while hidden: they used to animate at the display's rate;
  - a smoothly scrolling graph redraws once its line has moved half a pixel instead of every frame;
  - a Blur of 0 no longer keeps a blur layer.
- **Cheaper animations, same look.** The island's critical glow pulses an overlay's opacity instead of a box-shadow, the retro header's cursor blinks in steps, and gauges, meter markers and the playtime bar no longer transition `all` or layout properties (the playtime bar's segments now change size without gliding).
- `tools/perf/render-bench.cjs` measures a page's CPU and memory with one kind of drawing switched off at a time.

### Added

- **Refresh the Studio** (Settings › General › Window): the desktop Studio reloads itself after saving, to give back the memory a long session holds (an overnight run grew it to 2 GB). When idle for 30 minutes (default), daily at 04:00, or off; only while its window isn't focused.
- **Rendering options** (Settings › Dashboard › Performance): Ring glides, Limit blur (on by default, caps widget blur at 12 px), Blur inside widgets and Live graph glow. Rings step, inner blurs are off and graph glow is a static copy of the line unless you turn them on.
- **Refresh kiosk pages** (Settings › Dashboard › Performance): kiosk pages reload once a day at about 04:00 (default; each kiosk adds a few random minutes), or never.
- **The desktop Studio uses less memory while it isn't focused** (WebView2's low memory target), **reloads itself if its page crashes or hangs** (at most once a minute), and **says when WebView2 has updated** and a restart would pick it up.

### Fixed

- **Edit canvas in the Library** opens the canvas editor. For an imported canvas not used on any screen yet, it showed the import dialog again; it now adds the canvas as a new screen and opens it. Double-click a canvas card to do the same.

## [1.3.0-beta.14] - 2026-10-23

### Fixed

- **The Studio window no longer scrolls.** With the Add panel open, the whole window could scroll down and cut off its top: the list's hidden labels stretched it.
- **Live previews for every view.** Hovering a view in the Add panel (Weather · Glance, System Overview · Graphs, …) showed nothing: it now previews the widget in that view.
- **Options only where they work.** System Overview's Graphs and Gauges, Weather's Forecast, Glance and Week, Drive Space's Segments and Bars and Bluetooth without batteries no longer list options that change nothing there. `npm run audit:views` lists the options a view shows but never uses.
- **Monochrome Meteocons icons.** The Weather widget's monochrome icons showed as a solid square in the installed app; they now draw in the text colour.

## [1.3.0-beta.13] - 2026-10-22

### Added
- **Status Bar widget.** A one-row bar with a left, a centre and a right slot, each holding any of the logo or your
  own text, date, time, weather, CPU / GPU / memory, temperatures, download / upload, disk, network, volume, battery,
  now playing and uptime; an item with no data is left out. Three views, each its own entry in the Add panel: Edge,
  Pill and Islands. It leaves a gap at the page centre for the Dynamic Island, with the centre items split around it,
  and drops items from the outer ends when the bar is narrow.
- **Weather: animated backgrounds.** An opt-in rain, snow, hail, thunder, fog, cloud, wind, sun, or moon and stars
  effect behind every Weather view, based on [web-weather](https://github.com/greywen/web-weather) by greywen (MIT).
  Settings: Intensity, Particles, Speed, Wind, Lightning, Clouds and fog, Strength, and Show to preview a condition.
  It uses more CPU, GPU and memory on the kiosk, follows Max FPS and stops with reduced motion. There is no sound.
- **Weather: Glance and Week views, and Meteocons icons.** Glance is a big icon with the temperature, condition and
  place; Week lists Today and the next days, each with an icon, high and low. Weather and Forecast can now draw
  [Meteocons](https://github.com/basmilius/meteocons) (MIT) in Fill, Flat, Line or Monochrome instead of the app
  icons, picked from the provider's icon code before the description, with optional animation. Animated icons use
  more CPU and memory on the kiosk, and run outside the Max FPS cap. App icons stay the default.
- **Coding Agents: Summary and Limits views.** Two more layouts, each its own entry in the Add panel: Summary lists the
  plan limits with their reset times, today's tokens and the sessions with a short status; Limits is the limit bars
  alone, larger. Per-model weekly limits and the Claude Code version show when the statusline reports them.
- **Countdown widget.** Counts down to an event, or up from it: pick a date (and optionally a time), an event name,
  whether to count until, since or automatically, and a breakdown of days, years or live seconds. Three views, each its
  own entry in the Add panel: Inline, Tiles and Big number. Settings gain native date and time pickers.
- **Drive Space: Segments and Bars views.** Two more layouts, each its own entry in the Add panel: one row per drive
  with its icon, name, used / total and a segmented or slim fill bar that turns warn and critical past the
  thresholds. The List view is unchanged.
- **System Overview: Graphs and Gauges views.** Two more layouts, each its own entry in the Add panel: Graphs draws a
  sparkline row per metric, Gauges open-arc dials. Both follow the chosen sections and colours; pick which drive (and
  whether it shows activity, used space or read + write) and which network adapter (down, up or both, with an optional
  top speed in Mbps) they read.
- **Widget views in the Add panel.** Widgets with several layouts list each as its own entry (Weather · Forecast,
  Game Spotlight · Ticker, Now Playing · Vinyl, …), which adds the widget with that view already picked.

### Changed
- **Advanced switch in widget settings.** The inspector now hides what most people never touch: sections that follow
  the theme collapse to "Follows theme" with a Customise button, the "More" rows and the CSS & locks card stay
  out of the way, and one Advanced switch (also under Settings > Studio) shows everything inline.

### Fixed
- The FPS Monitor's and Frame Pacing's frame-time graphs read like an FPS graph: a drop or a stutter now dips
  instead of peaking, and Frame Pacing's refresh-rate lines sit where those frame rates fall.
- Starting the app, or opening the studio from the taskbar or tray, no longer flashes a white window before the
  studio appears.

## [1.3.0-beta.12] - 2026-10-22

### Changed
- Font lists (Theme's Page font and a widget's Font) show each font in its own typeface, so you can see it before
  picking it.

### Fixed
- The Settings window uses the Studio's thin scrollbar.
- Long dropdown lists, such as the font lists, scroll with the thin scrollbar instead of the Windows one with arrows.
- The terminal skin's braille graph no longer causes "ResizeObserver loop" errors in the app log, and that notice is
  logged as a warning now, since nothing fails.

## [1.3.0-beta.11] - 2026-10-22

### Added
- **A new Add panel** in Design (the tab is now called Add). Widgets, Panels and Layouts have their own tabs, and the
  widget categories sit in one scrolling row of chips. Each row shows the name, a one-line summary and the size it opens
  at. Hovering a row shows a live preview of the widget beside the panel, with its full description.
- Search matches names, summaries, categories and synonyms (`temp`, `vram`, `rtss`). Press `/` to search, ↑ ↓ to browse
  and Enter to add. When nothing matches, **Add a Sensor** is one click away.
- Adding a widget puts it in the first free spot, shrinking it to fit when there is less room. A toast says what was
  added, with **Undo**, and the new zone flashes. A **Recent** group lists the last three widgets added.
- Select a blank zone on the canvas to fill it: the widgets that fit it exactly are marked **Best fit**, the ones too
  big for it are dimmed, and a click fills the zone.
- While dragging, the drop outline snaps to the grid, shrinks to fit, covers a blank zone to fill it and turns red where
  there is no room.
- Settings › Studio › Editor has **Left panel width** (Narrow, Default or Wide, in place of the pixel slider; an old
  width moves to the nearest option), **Widget list** (Comfortable or Compact) and **Preview on hover**.

### Changed
- The Studio opens on **Screens**, now at the top of the rail. **Data** moved below Alerts & Island.
- Theme's **1 · Start from** collapses like the other sections.
- Dropdown lists open in the Studio's own menu style instead of the system list.
- The Settings and Help windows use the Studio's thin scrollbar, and open without a white flash.

## [1.3.0-beta.10] - 2026-10-22

### Added
- **Allow editing from other devices** is a new app setting, off by default, for a server on the local network. A
  server restart applies it.
- **Open WebView2 task manager** in Settings > Diagnostics shows memory and CPU for each WebView2 process (renderer, GPU
  and the rest).

### Changed
- **Editing from other devices is off by default.** A server on the local network lets other devices view the dashboard
  and kiosks, but only this computer can change the config and integrations; turn it on in Settings > Server. Stream
  Deck and kiosk control are unaffected, and a Studio opened elsewhere says why it can't save.
- **The Studio pages carry security headers**: a content security policy, no MIME sniffing, and no framing of the
  Studio and Settings pages by other sites. Kiosk pages stay embeddable.
- **The image proxy refuses private-network addresses**, including on redirects.
- **Developer tools are available in debug mode only**, and Diagnostics shows the button only then.
- **Live widgets use less CPU.** Bars, meters and markers animate on the compositor, colour cells and segments step with
  the data, rings glide for 300 ms with Smooth on and step otherwise, and the frame loop sleeps between capped frames.

### Fixed
- **A hidden or minimized studio no longer keeps rendering.** Its webview is suspended while the window is in the tray or
  minimized, and wakes when you open it, so it no longer spends CPU and memory on a window nobody sees.
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
