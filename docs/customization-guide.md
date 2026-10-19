# Customization guide

How to make a widget look the way you want, from the studio. For the setting
keys and how they are stored, see [widget-settings.md](widget-settings.md);
for what happens behind the scenes, [architecture.md](architecture.md).

Open the studio with the wrench button on the dashboard (or
`http://127.0.0.1:3922/?studio=1`). Changes save automatically; **Save**
saves immediately, and open kiosk pages update within about a second.

## The studio layout

```
┌──────────────────────────── top bar ────────────────────────────┐
├──┬────────────┬───────────────────────────────┬─────────────────┤
│  │ left panel │      [ quick bar ]            │ inspector       │
│R │ Layers /   │ canvas                        │ (docked: 320 px)│
│a │ Add /      │                               │                 │
│i │ Profiles   │      [ floating zoom bar ]    │                 │
│l │ (256 px)   │                               │                 │
└──┴────────────┴───────────────────────────────┴─────────────────┘
```

Shown docked (studio 1100 px or wider). Narrower, the inspector floats over
the canvas or becomes a bottom sheet, see [Inspector
placement](#inspector-placement-docked-floating-bottom-sheet).

The bar along the top holds, from left to right:

- the active profile's name - click it to switch to another profile or to
  **Auto (match window)** - with its design size, grid (columns × rows),
  fit and zone count;
- **Design | Sources** - the canvas, or the [Data Explorer](#data-explorer-and-binding)
  (the same as the rail's Sources button);
- **Undo** and **Redo** (see [Undo, shortcuts and the command
  palette](#undo-shortcuts-and-the-command-palette));
- **Kiosk view** (leave the studio), **Save** and the **...** menu.
  Changes are pushed to the server automatically; **Save** flushes them at
  once, and the small dot on it means "edits not pushed yet". The **...**
  menu holds **Export config** (downloads the whole config as a JSON file),
  **Import config...**, **Copy profile JSON**, **Command palette...**,
  **Keyboard shortcuts** and **Reset everything...** (restores the default
  dashboard after a confirmation: it wipes every profile, the theme, the
  style presets and all widget settings; Undo brings it back only until you
  leave the studio, so export first). The menu also shows the build id.

The **icon rail** (52 px) at the left opens one **left panel** at a time -
**Layers**, **Add**, **Profiles**, **Dynamic Island** and **Alerts** - or switches to the full pages **Library**, **Gauges** and **Sources**; the
keyboard icon at its bottom opens the shortcut list. Click the open panel's
icon again to collapse it and give the canvas the full width. The studio
remembers the open panel, also after a reload. The left panel stays beside
the rail in every inspector placement. **Library** (your saved images, fonts, gauges, panels and imported InfoPanel canvases) and **Gauges** (design a Custom gauge or edit a profile's) replace the canvas; **Import** and **Export** in the top bar bring an `.infopanel` profile in as a canvas zone and write one out. They are described in [architecture](architecture.md#importing-and-exporting-an-infopanel-profile) and [docs/infopanel-import](infopanel-import/PLAN.md).

A **floating zoom bar** sits over the bottom of the canvas, centred. It
toggles the left panel, the grid and the rulers, zooms out and in (or
**Ctrl + wheel** over the canvas, **Ctrl + =** / **Ctrl + -**), fits the page
(**Fit**, **Ctrl + 0**), shows the design size (click it to open Dashboard ›
Profile). The page is centered in the
canvas whenever it is smaller than the view. The design size is the screen and
**Fit** frames it in both fit modes, so changing the grid's columns or rows never
rescales the page. A **Scroll** profile whose rows run past the screen shows a
dashed **Screen ends at … px · the kiosk scrolls** line; the rows below it are
dimmed but stay editable. The grid and ruler toggles are
remembered.

On first run a **quick tips** card sits at the bottom left of the canvas;
dismiss it and it stays away. A profile without zones shows a card instead:
**Browse widgets** opens Add, **Use sample layout** loads the shipped sample.

**Fit is sticky.** The studio opens fitted: the zoom is the largest one at
which the whole page (width and height) fits the canvas, and it follows the
window, the profile and the panels as they change. Any manual zoom (the
buttons, **Ctrl + wheel**, **Ctrl + =** / **Ctrl + -**, the percentage button
that resets to 100%) stops that; **Fit** (the button, **Ctrl + 0** or the
palette) turns it back on. A scroll profile (not *Fill viewport*) is fitted to
the width only. The zoom mode is remembered.

### Inspector placement: docked, floating, bottom sheet

Where the inspector sits follows the width of the studio; there is no setting
for it.

- **1100 px and wider: docked.** A 320 px column on the right.
  `Ctrl + \` collapses it to a slim strip and expands it again; the
  collapsed state is remembered.
- **640 to 1099 px: floating.** A 320 px card over the right side of the
  canvas, closed by default. **All settings** in the quick bar, a
  **double-click** on a zone or `Ctrl + \` opens it; its **X**,
  `Ctrl + \`, clearing the selection or clicking empty canvas closes it.
  While it is open the page fits the space left of it.
- **Under 640 px: bottom sheet.** A sheet at the bottom of the canvas with
  three heights: **peek** (a compact header and a tool strip; with nothing
  selected only "Tap a widget to edit it."), **half** and **full**. Drag the
  handle to snap to the nearest height; a tap on it toggles peek and half.
  The tool strip has **Quick** (the pinned settings) and one tile per section
  across all tabs, with a dot on the sections that have changes; tapping a tile
  shows that section's fields (44 px rows). The header's eye and **All
  settings** buttons are 44 px; **All settings** (or a double-click on a zone)
  goes to half, and at full height the header's **Collapse** goes back to half.
  The zoom bar sits above the sheet. On a phone the top bar hides the summary,
  the *Kiosk view* label and Undo / Redo (Undo / Redo move into the **...** menu).

### The quick bar

In the docked and floating placements a **quick bar** floats at the top centre
of the canvas, below the page tabs. It shows the selection (icon and name, "N widgets" for several
zones, "Dashboard" with nothing selected in the floating placement), the
**pinned settings** as compact controls (a switch, buttons or a select, a
slider with its value, a colour swatch that opens a swatch row under the bar,
or a text field), then the visibility eye and, when floating, **All settings**.
Only the middle scrolls.

- **Pin** a setting with the pin button on its inspector row. Pins are kept per
  widget type (all panels share one set), at most 6, and are remembered per
  browser. A type with no pins shows a default set: *Layout* and *Accent* when
  it has them, then its first two own compact settings (at most 4).
- With several zones selected it shows only the pins every selected type
  shares, and an edit applies to all of them.
- With nothing pinned it says "Pin settings from the panel to show them here".
- Switch it off or on with Dashboard › General › Studio › **Quick bar** (on by
  default).

### The left panel

- **Layers** - every zone of the profile, with an icon for its type (the
  widget's own, a panel, or a blank zone), its name, a paint-brush when it has
  its own look and its size in cells. Click a row to select the zone and
  scroll it into view; **Shift / Ctrl-click** adds or removes it from the
  selection; right-click opens the zone menu. The eye hides or shows it and
  the bin removes it. Hidden zones are dimmed but stay selectable (and do not
  show in the kiosk).
- **Add** - every widget and panel, with a search box and category chips
  (All, Layouts, My panels, System, Hardware, Storage, Network, Media, Audio,
  Info, Gaming, Generic), in the
  groups Widgets, Layouts, Panels and My panels (see
  [Creating a panel](#creating-a-panel)). **Drag** a card onto the canvas -
  a dashed ghost shows where it lands, or **No room** in red - or **click** it
  to place it at the first free spot. With a blank zone selected, a click
  fills that zone instead. The numbers are the minimum zone size in grid
  cells, and a badge counts how often a widget is already on the profile.
  *Other sensors* is listed here too, under Generic.
- **Profiles** - the monitor profiles. Click one to pin it, or pick **Auto
  (match window)**, which shows the profile closest to the window size (the
  entry names the one it picks, and that profile is tagged *auto*). **New**
  adds a profile for the current window size, the bin deletes the active
  one. A profile's name, design size, grid, fit, gap and padding are edited
  in Dashboard › Profile (see [Grid spacing: gap and
  padding](#grid-spacing-gap-and-padding)).
- **Sources** - swaps the canvas and inspector for the Data Explorer (see
  [Data Explorer and binding](#data-explorer-and-binding)). Click it again,
  any panel icon, or **Design** in the top bar to go back to the canvas.

### Selecting, moving and resizing zones

Drag across empty grid cells to draw a new, blank zone; its **Pick a widget**
button opens the widget picker. Hovering a zone shows its size in grid cells.
Clicking selects it (a 2 px accent outline, drawn 5 px outside the zone and
the same size at any zoom; hovering shows a 1 px one). **Double-click** opens
all settings: the floating card opens, the bottom sheet goes to half. Clicking
empty canvas first closes an open colour swatch row, otherwise it clears the
selection, closes the floating card, sends the sheet to peek and clears the
search and **Changed**. A hidden zone shows at 35% with a dashed border and an
eye-off badge, and stays editable. **Shift / Ctrl-click** (on the canvas or in Layers) adds
or removes a zone from the selection; **Ctrl + A** selects all. The last zone
you picked is the *primary* one: it shows the handles, the keyboard resize
and the inspector. With several zones selected the inspector shows only the
shared look (Style) and a chip row with Hide, Duplicate and Delete; a style
change applies to all of them.

A small **selection chip** sits above the primary zone (below it when there is
no room) and keeps its size at any zoom. It shows the widget name (or "N
selected"), the size, **Hide / Show** and **More**, which opens the zone menu.
The selected zone shows knobs on its corners and edges: drag a corner to
resize both ways, or any point along an edge to resize that side. Dragging
a tile moves it (all selected zones move together). Moves and resizes never
overlap another zone or leave the grid, and widget minimum sizes are
enforced. **Esc** during a drag cancels it; one drag is one undo step.
To deselect press **Esc** or click empty canvas (the page padding, the gaps
between zones, or the area around the page).

**Context menus.** Right-click a zone (or click **More** on the chip) for:
**Change widget...**, **Edit style**, **Bind data...**, **Save to My panels**
(panels), **Duplicate**, **Hide / Show**, the size steps **Narrower / Wider /
Shorter / Taller** (a step that would run into a neighbour or past the grid
is disabled), **Copy style**, **Paste style**, **Follow global style**,
**Deselect** and **Delete**. With several zones the widget-only rows and the
size steps are left out. Right-click empty canvas for **Add widget...**,
**Select all**, **Zoom to fit**, **Edit global theme** (Dashboard ›
Appearance) and **Keyboard shortcuts**.

The widget picker lists every widget and panel (layout starters and your
saved panels included) with a search box (focused when it opens), the
category chips and each one's minimum size; **Blank zone** removes the
widget. Picking one assigns it to the zone and grows the
zone to the widget's minimum size — unless that would cover another zone;
then the zone keeps its size and you can resize it yourself.

## Undo, shortcuts and the command palette

Every studio edit can be undone: zones, widgets, settings, the theme,
profiles and sources. **Undo** and **Redo** in the top bar are greyed out
when there is nothing to undo or redo. A run of changes to the same thing -
dragging a slider, typing in a field, holding an arrow key - counts as one
step as long as the changes come less than half a second apart. A pointer
drag (moving or resizing zones, however long it takes), applying a panel's
JSON and applying an appearance preset are one step each. The studio keeps
the last 100 steps; leaving the studio, or the server's copy arriving when
the studio opens, starts a fresh history. Switching profile does not clear
it (the switch is itself a step). Undone changes are saved and synced like
any other edit.

**Ctrl + K** opens the command palette: type part of a name and press
**Enter** (or click) to run it, **arrow keys** to move through the list,
**Esc** to close. It reaches the same actions as the mouse:

- add any widget or panel - layout starters and your saved panels included
  (at the first free spot), switch profile (or
  Auto), select a zone by name, open the Add, Layers or Profiles panel or
  Sources, toggle the grid, zoom, save, export, import, copy the profile
  JSON, undo, redo and the shortcut list, and **Appearance...**,
  **Background...**, **General settings...** and **Connection...** (each
  opens that part of the Dashboard inspector);
- for the selected zone: pick a widget, duplicate, hide or show, remove,
  copy / paste / follow-global style, and **Go to setting: ...** for each of
  the widget's options, which puts the option in the inspector's search;
- for a selected panel zone: **Save panel as preset...** (opens the name
  input), **Select widget: ...** for each of its widgets, and with a widget
  selected: duplicate, copy, paste after, move earlier / later and remove
  that widget.

Matches that start with what you typed come first, then matches at the
start of a word, then anywhere in the name.

Keyboard shortcuts (**?** lists them in the studio):

| Keys | Action |
|---|---|
| Ctrl + K | Command palette |
| Ctrl + S | Save |
| Ctrl + Z | Undo |
| Ctrl + Shift + Z, Ctrl + Y | Redo |
| ? | Keyboard shortcuts |
| Esc | Close a menu or dialog, then clear the search, step out (widget → zone → none), or close the left panel |
| Ctrl + Enter | Apply the panel JSON (inside the code editor) |
| Shift / Ctrl + click | Add a zone to or remove it from the selection |
| Ctrl + A | Select all zones |
| Arrow keys | Move the selection one cell |
| Shift + Left / Right | Primary zone narrower / wider |
| Shift + Up / Down | Primary zone shorter / taller |
| Ctrl + D | Duplicate the selected zones (or the selected panel widget) |
| H | Hide / show the selected zones |
| Ctrl + Alt + C / V | Copy the primary zone's style / paste it onto the selection |
| Del, Backspace | Remove the selected zones (or only the selected panel widget) |
| Ctrl + C / Ctrl + V | Copy the selected panel widget / paste the copy after it |
| Alt + Up / Down | Move the selected panel widget earlier / later |
| Ctrl + 0 | Fit the page to the canvas and keep it fitted |
| Ctrl + = / Ctrl + - | Zoom in / out (stops the sticky fit) |
| Ctrl + wheel | Zoom |
| Ctrl + \ | Show / hide the inspector (collapse the docked one, open / close the floating card, peek / half for the sheet) |

While you type in a field (a setting, the search box, the zone name), the
plain keys go to the field; Ctrl + S and Ctrl + K still work, and so does
undo / redo outside text fields (inside one they are the browser's own). With
a dialog or menu open, its own keys win (Esc closes it). While a pointer drag
is in flight only Esc (cancel) works. In Sources mode the canvas keys are off.
The tooltips of the top bar buttons show their shortcut (the zone's Duplicate
and Remove only while no panel widget is selected, since Ctrl + D and Del
then act on the widget).

## Where the options are

The inspector is driven by one registry: the widget's own `settings` (each
with a `tab`, `advanced`, `hint` and `visibleIf`), the general look settings
every widget shares, the panel and panel-widget fields, and the dashboard
settings. It never hard-codes a panel per widget.

**Header.** A selected zone shows a 32 px icon, an editable name, a sub line
(`Type · N changed`, or `Type · defaults`), and **Hide**, **Duplicate** and
**Delete**. Under it is the **placement row** (column, row, width, height in
grid cells; values are checked against neighbours and minimum sizes). A
**Search all settings** box and a **Changed N** toggle share one row below it.

**Tabs.** A widget or panel zone has **Content**, **Style** and **Data**; a
small pill on a tab counts the options set on this zone. The open tab is
remembered per kind of selection. A blank zone and a multi-selection have no
tabs. **Search** looks through all tabs at once: the tabs give way to the
matching options, each section labelled with its tab, and a line says "N
matching settings". It covers labels, keys and option names, and the custom
cards by title and keywords; **Esc** clears it, and `No settings match "q".`
says when nothing matches. **Changed** lists only the values set on this zone,
across every tab ("N changed settings", with **Reset all**); when there are
none it says "Nothing changed yet. Everything uses its default."

**Sections.** The sections are an accordion with sticky headers: icon, title
(and the tab name while filtering), the number changed, a chevron and a reset
button that restores just that section's options. Dashboard › General ›
Studio › **Inspector sections** chooses **One open** (the default) or **Many
open**. The style tools (copy, paste, preset) sit in the header of the section
that has them, while it is open. A short hint sits behind an **i** icon on a
row.

**Rows.** A label and its control share one line; sliders sit inline with their
value box (the left panels keep the stacked slider). Segmented controls never
truncate: more than three options, or long labels, move to their own line.
Colour rows offer swatches (*Auto*, Blue, Violet, Teal, Green, Amber, Rose,
White) plus a custom colour. Setting a value equal to the inherited or default
value removes the override, so it shows no "changed" dot. The pin button on a
row adds it to the [quick bar](#the-quick-bar).

**Source dots.** A 7 px dot before a label says where its value comes from
(hover it for the explanation; the **?** in the footer lists them):

- no dot - the default;
- teal - from the dashboard style (all profiles);
- violet - from the profile style;
- blue - set here (on this widget, or in the scope being edited);
- blue with a ring - set here, overriding a global value;
- amber ring - set here but **ignored** (the widget follows the global style,
  or the global style is forced).

Click a dot that is set here to reset that option.

**Advanced.** The footer has an **Advanced settings** toggle (off by default
and remembered). While it is off, advanced options are tucked away and a
dashed **Show N advanced settings** button at the end of the list reveals
them.

**What each context shows:**

- **Widget zone** -
  - *Content*: **Widget** (type, **Show title** (off hides the title
    everywhere the widget shows it), custom title, icon, **Visible**), then the
    widget's own categories (for example Media: *Now playing*, *Cover art*,
    *Waveform*, *Visualizer*, *Audio source*; System: *Devices*, *CPU*,
    *GPU*, *Memory*, *Drives*, *Trends*, *Thresholds*, *Units & labels*;
    Weather: *Display*, *Current conditions*, *Forecast*).
  - *Style*: **Look** (**Skin**, **Graph updates**; **Graph style**, **Meter
    style** are advanced - see [Skins and
    variants](#skins-and-variants)), **Size & alignment** (**Layout**, **Dense
    summary**, **Summary card**, **Scale with the zone**, **Size %**, the 3×3 **Alignment**),
    **Typography** (**Text color**, **Secondary text color**, **Font**,
    **Value weight**, **Label case**), **Spacing & shape** (**Inner
    padding**, **Gap between items**, **Corner radius**, **Ring / bar
    thickness**), **Colors & surface** (**Follow global | Custom**, the style
    tools, **Preset**, **Surface**, **Accent color**, **Background image** with
    **Use as background**, **Surface opacity** and **Background blur**),
    **Border & effects** (**Border width** and **color**, **Edge glow** and
    **Glow color** - only while the glow is not none - and the **Zone
    frame**: **Frame accent**, **Frame background**, **Frame title
    header**) and **Advanced** (**Custom CSS**, see [Custom CSS](#custom-css));
    the widget's own color pickers (e.g. the System widget's device colors)
    sit here too, marked advanced.
  - *Data*: **Bound data** (see [Data Explorer and
    binding](#data-explorer-and-binding)) and data-related own categories
    (for example *Audio source*).
  - **Web Page** has reduced styling: Colors & surface, Border & effects and
    Advanced only. The plain card widgets (Departures, Notifications, Text
    File, Stream Deck and the *Other sensors* cards) offer fewer of the
    standard options than the other widgets.
- **Panel zone** - *Content*: **Panel** (Visual or Code, Fill or Hug, gap,
  padding), **Layout** (Stack / Grid / Overlay options), **Background**
  (Overlay only), **Widgets**, and with a widget selected its cards under
  **Selected widget** (see [Panels](#panels)); *Style*: the same look
  sections as a widget; *Data*: **Sensors used** by its widgets.
- **Blank zone** - **Widget** with a **Pick a widget** button, and **Zone
  frame**.
- **Several zones** - only the shared Style sections.
- **Nothing selected: the Dashboard inspector.** Click empty canvas or press
  Esc. Its tabs:
  - **Profile** - the profile's name, design size, grid, fit, gap,
    padding and corner radius; **This profile** (Theme / Style / Background: **Inherit** or
    custom); and **Profile selection** (**Auto-pick by window size**).
  - **Appearance** - **Scope** (**All profiles | This profile**, plus **Force
    global style**, see [Appearance (global style)](#appearance-global-style)),
    **Skins** (a gallery of the fourteen skins, then your saved looks, see
    [Skins and saved looks](#skins-and-saved-looks)), **Theme & surface**
    (surface, background opacity and blur, theme colors, see [Theme colours
    per profile](#theme-colours-per-profile)) and **Page background** (see
    [Page background](#page-background)).
  - **Global style** - the look itself, in the same sections as a widget's
    Style tab, written at the dashboard or profile level by the Scope.
  - **General** - *Type*, *Clock & date*, *Display*, *Studio* (the **Quick bar**
    switch and **Inspector sections**: One open / Many open) and *Connection* (the Data API URL and
    its test); see [General settings](#general-settings).

"Auto" or an empty value always means the widget's own look.

### Data Explorer and binding

**Sources** mode replaces everything right of the rail with the Data
Explorer: a header (the number of data points and sources, whether the Data
API is running and live over SSE, an **Endpoints** popover that copies a
route, and **Add source**), a **source tree** (filter, health chips for
healthy / no data / offline, categories Built-in / Plugins / Hardware
monitors / Pushed via API, and a row per source and container), a **point
table** and a **point inspector**. The table has a search, a type control
(All / Numbers / Text / Lists / Links), **Hide empty** and **In use** chips,
and for each point its name, live value, which zones use it, and copy-key and
**Bind** buttons. The point inspector shows the value (numbers get a
24-sample Min / Avg / Max history), the key and stream URL to copy, **Used
by** (each zone links back to the canvas), a select to **Bind** the point to a
zone, and **New widget from this value**. With no point selected it shows a
summary of the group, a "stream this group" prefix URL and the sources'
**Show in dashboard** and display-name preferences. Below a 1240 px window
the point inspector becomes a drawer, and below 1000 px the table drops its
**Used by** column. All values come from the page's one live sensor stream.

A zone's bindings are the keys it reads; nothing extra is stored. A panel
widget claims its **Sensor** (and sub sensor); a widget zone claims its
module's data prefixes, narrowed to one container when the widget's source
setting is set (a widget can be bound to a container, never to a single
key). The Data tab's **Bound data** lists them with their live value (amber
**No data** when empty), an unbind button and **Bind**; click a row to open
the point in the Explorer. **Bind** opens a search over every data point
(multi-word, over name, key, source, container and kind): in a widget zone
each row toggles a binding, and from a panel widget's **Sensor** field
picking a point sets the sensor and closes the picker. The zone menu's
**Bind data...** opens the same picker.

## Panels

A *panel* is a zone that holds your own group of small widgets - stats,
values, bars, gauges, sparklines, tables, text, images, clocks and shapes -
each bound to any sensor. Its **arrangement** (stack, grid or overlay) and
its widgets are edited in its own cards (next to the general ones); its
**look** (title, card, spacing, colors, font, border, glow, CSS) in the
general sections, like any widget's. A panel draws its own card, so the zone frame's background does not
apply to it.

### Creating a panel

The Add panel and the widget picker list three kinds of panel, each with a
category chip:

- **Layouts** - sensor-free starters that show what the arrangements can do:
  *Row of stats* (a stack that spreads three stats across one row), *2×2
  stats* (a 2-column grid, centered in its cells), *Hero overlay* (an image
  background with a title, a big stat and two values in the bands), *Gauge
  row* (three rings spread across a row), *Clock + date* (time over date,
  centered) and *Label / value list* (a grid of labels and right-aligned
  values). Their widgets are unbound: in the studio each one says *pick a
  sensor* under itself until you bind it (the kiosk shows just "-").
- **Panels** (System, Network, Info, Other) - ready-made panels bound to
  sensors (CPU, GPU, RAM, network, weather, FPS gauges, Steam, clock).
- **My panels** - panels you saved yourself.

Drag a row onto the canvas, click **+** to add it at the first free spot,
use the widget picker to put it in the selected zone, or type **Add panel:
...** in the command palette. A new panel zone is ready to edit straight
away: its title and card are already settings of its general sections.

**Save as panel preset**: in a panel zone's *Panel* section, the **...** next to
**Visual / Code** has **Save as panel preset...** (the command palette has
*Save panel as preset...* too). Type a name (it starts as the panel's
title) and press **Enter**; **Esc** cancels. The preset keeps the panel's
arrangement, widgets and sensors, its look (the panel's general settings)
and the zone size, and appears under **My panels**. Saving is one undo step.
The **...** on a My panels row renames it (in place: Enter or clicking away
saves, Esc cancels) or deletes it. Saved panels are stored in the config, shared by all
profiles, and travel with an exported config. Every use is a fresh copy:
changing a placed copy never changes the preset or other copies.

Duplicate a panel zone with the zone's **Duplicate** (or Ctrl + D with no
panel widget selected).

### The panel sections

The panel's **title** (empty = hidden) is the *Widget* section's **Custom
title**, and its card and accent are *Colors & surface*'s **Surface**
(none / card / bordered card, glass, matte, theme) and **Accent color**;
the panel sections below do not repeat them. The **Panel** section has **Visual
/ Code**, which switches between the editors and the panel as JSON (see
[Code view](#code-view)), and **...** with Save as panel preset. **Layout**
is the arrangement (next section), **Background** (overlay panels) picks the
image widget that fills the overlay and the dark scrim - not to be
confused with *Colors & surface*'s **Background image**, which is a
picture behind the whole panel - and **Widgets** lists the widgets (see
[Editing widgets](#editing-widgets)).

### Layouts

**Layout** picks the arrangement; each one shows its own options.

- **Stack** - the widgets in a line.
  - **Direction**: **Row** (left to right) or **Column** (top to bottom).
  - **Wrap**: start a new line when the row (column) is full; off keeps
    everything on one line.
  - **Alignment**: a 3×3 picker. Along the stack the cells give start /
    center / end, and **Spread** spreads the widgets with equal space
    between them; across the stack they give start / center / end, and
    **Stretch** makes every widget as tall (in a row) or as wide (in a
    column) as the line. Click the active cell again for Auto.
- **Grid** - the widgets in columns and rows, filled in order.
  - **Columns**: the column count (1-12), all equal.
  - **Column sizes**: one size per column instead: `1fr` (a share of the
    free space), `auto` (as wide as the content) or a fixed `120px`. Adding
    or removing a size changes the column count.
  - **Row sizes**: the same for rows (empty = equal rows).
  - **Cell alignment**: where each widget sits inside its cell,
    horizontally and vertically; **Stretch** fills the cell's height.
- **Overlay** - an image widget paints the whole panel, and the other
  widgets sit on top of it in three bands.
  - **Background image**: which image widget is the background (default:
    the first image widget).
  - **Dark scrim over the image**: keeps light text readable on any image;
    turn it off for art with its own contrast.
  - **Band alignment**: Start / Center / End / Spread for the top, middle
    and bottom band.
  - **Bottom band columns**: lay the bottom band out as N equal columns
    (for values that must line up under columns printed on the art); empty
    = a row.

For every layout:

- **Gap (px)**: space between the widgets, and **Padding (px)**: space
  inside the panel's card. Empty (auto) uses *Spacing & shape*, then
  the layout's own spacing.
- **Fit in zone**: **Fill** (default) stretches the panel over the whole
  zone; **Hug** shrinks it to its content.

Switching from Stack to Grid drops Spread (a grid has no free space to
spread over); everything else carries over, so switching back restores the
stack.

### Alignment at two levels

1. **The panel in its zone.** A panel fills its zone unless **Fit in zone**
   is **Hug**. A hugging panel is placed by the zone's own alignment, the
   3×3 picker in *Size & alignment* (left / center / right × top /
   middle / bottom).
2. **The content in the panel.** The layout's alignment (Stack:
   *Alignment*; Grid: *Cell alignment*; Overlay: *Band alignment*) places
   all widgets. A single widget can differ: its **Layout** section has
   **Align self** (across the stack, or inside its grid cell) and its own
   **Width** and **Height**:
   - in a stack: **Hug** (its content's size), **Fill** (share the free
     space; bars, tables, images and sparklines fill by default) or
     **Fixed** px;
   - in a grid: **Cell** (fill the cell, the default) or **Fixed** px.

### Editing widgets

- The **Widgets** section is a layer list. Drag a row to reorder it (or select
  it and press **Alt + Up / Down** with the list focused), the eye hides a
  widget, and **...** offers Duplicate, Copy, Paste after, Change kind and
  Delete. **Add widget** (at the top of the section) inserts the chosen kind
  after the selected widget. An unlabeled widget is listed by its sensor's
  name.
- The selected widget's editor is a set of sections under **Selected widget**,
  in the same order as a zone's own (only the cards its kind uses):
  - **<Kind> widget** (with **Change kind**): label, sensor, sub sensor
    (shown small below the value), unit, decimals, scale (multiplier, e.g.
    bytes to GB), max (the 100 % of a bar or gauge), invert fill, and the
    static text or image URL;
  - **Display**: the kind's own options (shape and thickness, image max
    height, table rows / columns / header, sparkline history, clock time /
    date, text alignment);
  - **Size & placement**: width, height and align self (see above), in a
    grid the column / row span and start column / row, in an overlay the
    band and *Use as panel background*;
  - **Typography**: font size (a gauge's ring diameter);
  - **Colors**: the widget's color;
  - **Advanced**: **Class names** (hooks for the panel's CSS) and **Custom
    CSS** scoped to the widget, with the list of hooks.
  **Change kind** (in the first section or the layer's **...**) keeps the
  label, sensor, unit, color, layout and CSS.
- With **Code** chosen in the *Panel* section, the layout, widgets and widget
  sections give way to one wide **Code** section (see [Code view](#code-view)).

### Selecting widgets on the canvas

With the panel zone selected, click one of its widgets (a double-click on a
widget of an unselected panel does both at once). The widget gets an outline
(the others show a faint one on hover), the selection chip and the inspector
header show *Zone > Widget* (click the zone crumb to go back to the panel,
the widget crumb to scroll to its editor), and the inspector shows its
sections under **Selected widget** (the widget's data, display, size &
placement, typography, color and advanced sections, in the zone's own order). Clicking empty space in the panel selects the panel again; dragging
still moves the zone.

With a widget selected:

| Keys | Action |
|---|---|
| Del, Backspace | Remove the widget |
| Ctrl + D | Duplicate it |
| Ctrl + C / Ctrl + V | Copy it / paste the copy after the selected widget (also in another panel) |
| Alt + Up / Down | Move it earlier / later |
| Esc | Step out: first to the panel, then to nothing |

The arrow keys still move and resize the zone, and the zone's own Duplicate
and Remove buttons stay available (their tooltips drop the key while a
widget has it). The outlines and *pick a sensor* hints are studio-only; the
kiosk never shows them.

### Code view

**Code** shows the whole panel as JSON: edit it and press **Apply** (or
**Ctrl + Enter**). Invalid JSON or an unknown widget kind is reported and
nothing changes; missing or repeated widget ids get fresh ones. One Apply
is one undo step, and a changed `title` also updates the shown title. The
JSON has the fields the editor sets (`layout`, `direction`, `wrap`,
`justify`, `align`, `gap`, `padding`, `columns`, `gridCols`, `gridRows`,
`overlayAlign`, `scrim`, `bottomGridCols`, `fit`, and per widget `box`,
`span`, `rowSpan`, `overlayZone`, …) plus `css`: CSS for the panel that
travels with it into saved panels. It works like *Advanced* > Custom CSS (both
apply).

### Styling panels with CSS

Panel CSS (*Advanced* > **Custom CSS**, or the Code
view's `css`) is scoped to the zone: `:scope` is the zone's root and the
selectors below match inside it. A widget's own **Custom CSS** (its *Advanced*
card) is scoped to that widget's cell: `:scope` is the
`.wp-widget` element.

```
:scope                                   the zone's root (fills the zone)
└─ div.z-10
   └─ div                                 places a hugging panel by the zone alignment
      └─ .wp-panel                        the card
           [data-panel-layout="stack|grid|overlay"] [data-panel-id]
         ├─ .wp-panel-title               the title line (accent dot or icon + text)
         │
         │  stack / grid:
         ├─ div                           the stack (flex) or grid container
         │  └─ .wp-widget.wp-widget--{kind}.{your class names}
         │       [data-widget-id] [data-widget-kind]
         │     └─ the widget (below)
         │
         │  overlay:
         ├─ img.wp-panel-bg               the background image (div when there is none)
         ├─ .wp-panel-scrim               the dark scrim
         └─ div
            └─ .wp-band[data-band="top|middle|bottom"]
               └─ .wp-widget …
```

Inside a widget (by kind):

| Kind | Hooks |
|---|---|
| stat | `.wp-label`, `.wp-value` (with `.wp-unit` inside), `.wp-sub` |
| value | `.wp-value` (with `.wp-unit`), `.wp-label`, `.wp-sub` |
| bar | `.wp-label`, `.wp-value`, `.wp-unit`, `.wp-bar-track` > `.wp-bar-fill` |
| gauge | `.wp-gauge` > `[data-gauge]` > `svg` (two `circle`s: track, then fill) |
| sparkline | `.wp-label`, `.wp-value`, `svg.wp-spark` |
| table | `.wp-label`, `.wp-table` |
| text | `.wp-label`, `.wp-value` |
| image | `img`, `.wp-label` |
| clock | `.wp-clock-time`, `.wp-clock-date` |
| shape | `.wp-shape` |

The panel's layout fields are CSS variables on `.wp-panel`, read with the
Spacing & shape value and then the built-in spacing as fallbacks:

| Variable | From | Used for |
|---|---|---|
| `--panel-gap` | Gap | space between widgets (and bands) |
| `--panel-pad` | Padding | space inside the card |
| `--panel-direction` | Direction | `row` / `column` |
| `--panel-wrap` | Wrap | `wrap` / `nowrap` |
| `--panel-justify` | Alignment (along) / Cell alignment (horizontal) | `justify-content` / `justify-items` |
| `--panel-align` | Alignment (across) / Cell alignment (vertical) | `align-items` |

A field you set in the editor is written on the element itself and wins
over CSS; leave it on auto to set it from CSS. The same goes for values a
widget sets inline (its color, its font size): override those with
`!important`. The panel's colors are the theme variables `--accent`,
`--foreground` and `--muted-foreground` (HSL triplets: `hsl(var(--accent))`).

Four examples (each tried in the kiosk):

```css
/* 1. Panel CSS: tighter spacing (Gap and Padding left on auto) */
.wp-panel {
  --panel-gap: 4px;
  --panel-pad: 6px;
}
```

```css
/* 2. Panel CSS: accent-colored, glowing numbers on every stat */
.wp-widget--stat .wp-value {
  color: hsl(var(--accent));
  text-shadow: 0 0 10px hsl(var(--accent) / 0.5);
}
```

```css
/* 3. Panel CSS: divider lines between the widgets of a row stack */
.wp-panel[data-panel-layout="stack"] .wp-widget + .wp-widget {
  border-left: 1px solid hsl(var(--border));
  padding-left: 12px;
}
```

```css
/* 4. A bar widget's own Custom CSS: thinner track, traffic-light fill */
:scope {
  padding-block: 4px;
}
.wp-bar-track {
  height: 6px;
}
.wp-bar-fill {
  background-image: linear-gradient(90deg, #22c55e, #f59e0b, #ef4444);
}
```

Example 2 leaves a widget with its own **Color** as it is (the color is
set on the element); to target a few widgets only, give them a class name
(*Advanced* > **Class names**, e.g. `hot`) and select `.wp-widget.hot` in the
panel's CSS.

## Scaling with the zone and Size %

Widgets fit themselves to their zone: each one measures its zone, picks a
layout for that size and shape (a 1×1 zone gets a compact tile, a wide strip a
row, a larger box the full layout) and sizes its text, rings and rows from the
room that is there. Making a zone bigger therefore shows more, not just larger
content. The **Layout** option (Auto, Card, Standard, Compact, Simple) fixes
the size class instead of measuring it.

**Size (%)** (50-200) zooms the content on top of that, and the layout is
chosen from the zoomed size: 150 % in a zone makes the widget behave as if the
zone were smaller. **Scale with the zone** is kept for older dashboards and
changes nothing for widgets; only Size % applies.

## Alignment

The **Alignment** picker is a 3×3 grid: click a cell to place the content
inside the zone horizontally (left / center / right) and vertically (top /
middle / bottom) in one go, and click the active cell again to go back to
Auto. With the grid focused, the arrow keys move and pick. **Spread**
distributes the items across the width (the cells then pick only the
vertical position). Left, center and right keep items at their natural size
and move them. When the content is wider than the zone, a
centered or right-aligned layout overflows at its end instead of cutting off
its start.

## Skins and variants

The **Look** section (Style tab) restyles a whole widget, not just its colors.
It resolves like every other look setting: you can set it once for the
dashboard or a profile (Global style) and let widgets follow it.

- **Skin** - Auto, or one of fourteen, each with its own fonts, corner
  radius, header and graph and meter style: `default` (studio card), `tui`
  (btop-style terminal), `macos`, `fluent` (Windows 11), `hud` (sci-fi HUD),
  `ink` (monochrome editorial), `retro` (CRT terminal), `ios`, `android`
  (Material You), `synth` (synthwave), `cyber` (cyberpunk), `nixie`, `brutal`
  (neo-brutalist) and `instrument` (instrument rack). A skin brings its own
  card (see below) unless you pick a surface under *Colors & surface*,
  and its own accent unless you set an accent. Its fonts load on first use; offline, the widget
  falls back to the standard stack. **Font** under *Typography* overrides the
  skin's fonts.
- **Dense summary** (under *Size & alignment*) - Off, or On: a dense summary
  of the same data (a headline value, a trend and a few rows). Its labels use
  the widget's font.
- **Graph updates** - Stepped (the default) or Smooth. Smooth scrolls line,
  area and step graphs at a constant speed, about two readings behind the
  feed, so each new reading slides in without the line jumping or pausing;
  the axis eases, and bars and rings glide (about 1 s). Reduced motion
  (**General > Motion** or the system setting) keeps graphs stepped. Braille,
  bars and dots graphs and numbers are unchanged. It can be set globally too.
- **Graph style** (advanced) - Auto, area, line, step, bars, dots or braille:
  how trends are drawn.
- **Meter style** (advanced) - Auto, bar, pill, segments, blocks, hair, wave
  or square: how bars and level meters are drawn.
- **Summary card** (Size & alignment) - Auto, Never or Always. Auto swaps a
  small zone (1 x 1, a one-row strip or a one-column zone) to a summary card;
  Never keeps the full layout at any size; Always shows the summary card even
  in a large zone.

A skin is more than a card: type, numerals, graph and meter style, header and
decorations, and it brings its own card. The **Surface** setting is only the
card. Picking a skin (the **Skin** select or the gallery) sets that level's
surface to Auto, so the skin shows whole; choosing a surface afterwards
replaces only the card.

Auto and Default leave a widget as it was. Skin, Graph style and Meter style
also reach panels: with a skin set, a panel's bars, sparklines, gauges and
numbers use the skin's drawing. Without a skin they render as before.

## Spacing and shape

- **Inner padding**: space between the surface edge and the content.
- **Gap between items**.
- **Corner radius**, up to a pill shape.

Each is a pixel step, or Auto for the widget's own value. A profile's corner
radius (Profile tab) rounds every widget's outer card; a widget's own Corner
radius wins.

## Colors and type

- **Accent color** (in *Colors & surface*) tints the widget's main fill,
  such as the progress bar or the big temperature; each widget decides where
  it lands.
- **Text color** and **Secondary text color** override the surface's text.
- **Font** (Theme, or any font of the [catalog](#fonts)), **Value weight** and **Label
  case** (UPPERCASE, as written, Capitalized). *Theme* uses the page font,
  which is **General > Font** (see [General settings](#general-settings)).
- **Ring / bar thickness (%)** (50-250) scales rings and bars.
- Widgets with several parts add their own colors here (the System widget has
  a color per device).
- The **Surface** (Auto, glass, matte light, matte dark, theme, or one of
  twelve generic cards: Solid, Outline, Flat, Tinted, Aurora, Neon, Holo, Mesh,
  Carbon, Inset, Studio, Terminal; panels and plain cards offer only the four
  materials. Auto is the skin's card, the same as unset; a stored config
  without a surface still renders glass) and the **Preset**
  (a one-click bundle of surface and accent) are at the top of the list.
  **Theme** builds the surface from the theme's colours (card, text, muted,
  border, primary), so it follows the theme preset: with *Paper (light)* a
  theme-surface widget is light, with a dark preset it is dark.
- The accent, text and secondary text colours (hex) also recolour the
  theme colours inside the widget, so parts drawn in theme colours (labels,
  values, gauges, the plain cards' text) follow them too.

## Border, glow, opacity and blur

In *Border & effects* (border and glow) and *Colors & surface* (opacity
and blur), for widgets with a surface box:

- **Border width** and **Border color** (the default is a 1 px edge).
- **Edge glow** (None, Soft, Strong) and **Glow color** (empty = the accent
  color). The glow is drawn inside the edge, because an outer glow would be
  clipped by the zone.
- **Surface opacity (%)** fades the surface background, gradients included.
  At 0 the background is fully transparent.
- **Background blur** blurs what is behind the surface (visible on glass or a
  faded surface).

A **background image** (in *Colors & surface*) needs both the image URL and
**Use as background**. Glass surfaces let it show through; matte ones cover
it. The field takes a URL, or upload a file with **Upload...** or by dropping
it on the field, or pick an uploaded one from the library button; see
[Uploading images and videos](#uploading-images-and-videos).

## Custom CSS

The **Custom CSS** field takes CSS that applies to this widget only. The
dashboard wraps it in `@scope`, so selectors match inside the widget, and
`:scope` is the widget's root, which fills the zone. This needs a browser with
CSS `@scope` support; InfoPanel's web page profile uses a current WebView2.
The CSS is not checked beyond that scope, since it is your own dashboard.

The structure you can rely on (from `src/widgets/core/Widget.tsx`; custom
panels use `src/components/modern-chrome.tsx`, which is similar):

```
:scope                       the root; fills the zone, position: relative
├─ img + overlay             only with a background image in use
└─ div                       the padded content box: scaled by Size %
     ├─ the skin header      only when a title or icon is set (hidden in small zones)
     └─ div                  the widget's content (surface box, rings, text, …)
```

Lengths inside the content are scaled by the zoom; `:scope` itself and its
`::before` / `::after` are not.

Four examples that work with this structure:

```css
/* 1. Steadier numbers and a little letter spacing, everywhere in the widget */
:scope {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
```

```css
/* 2. A soft light sheen over the top of the widget */
:scope::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 40%);
}
```

```css
/* 3. A dashed inner frame (z-index keeps it above the content) */
:scope::after {
  content: "";
  position: absolute;
  inset: 6px;
  z-index: 30;
  pointer-events: none;
  border: 2px dashed rgba(255, 255, 255, 0.35);
  border-radius: 12px;
}
```

```css
/* 4. Glow around rings and icons (widgets that draw SVG, such as System) */
svg {
  filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.6));
}
```

Examples 2 and 3 both use `::after`, so use one or the other, or merge their
declarations.

## Page background

The page behind the zones can be a color, a gradient, an image or a video. With
nothing selected, open the Dashboard inspector's **Appearance** tab and its
**Page background** section (or **Background...** in the command palette). The studio canvas shows the background as the kiosk will,
with the dotted grid drawn over it.

At the top, choose what you edit:

- **All profiles** - the dashboard's background, shown on every profile that
  has none of its own. **None** turns it off: the theme's background color
  shows.
- **This profile** - the active profile only. **Inherit** uses the
  dashboard's background, **Custom** gives the profile its own (it starts as
  a copy of the dashboard's), and **None** shows no background on this
  profile even when the dashboard has one.

With **All profiles** selected, when the active profile has its own
background the editor warns "<profile> has its own background (a video), so
this one doesn't show there". **Use this one** makes the profile inherit it;
**Edit <profile>'s** switches to that profile's scope.

Then pick the type:

- **Color** - one color.
- **Gradient** - **From** and **To** colors and an **Angle** (0° runs bottom
  to top, 90° left to right).
- **Image** - an **Image**: type an `http(s)` address or a path served by
  the dashboard such as `/assets/ip/arcv2/arc-mono-ref.png` (applied when you
  press Enter or leave the field), or upload a file (see
  [Uploading images and videos](#uploading-images-and-videos)). A preview
  shows below it.
  **Fit**: *Cover* fills the page and crops, *Contain* shows the whole image
  with the **Fill** color around it, *Stretch* distorts it to the page size,
  *Center* uses its natural size and *Tile* repeats it. **Position** (the 3x3
  picker) anchors the image; clicking the selected cell goes back to the
  center.
- **Video** - a **Video** (MP4, WebM or MKV, by URL or upload) and a **Poster
  image**, the still shown until the video plays. **Loop** and **Muted** are
  on by default; with Muted off the video tries to play with sound and plays
  muted if the browser does not allow it. **Speed** sets the playback rate
  (0.5x to 2x). **Fit** and **Position** work as for an image, except that a
  video can't tile.

  The video pauses while the page is hidden (minimized, another tab) and
  resumes when it is shown again. When motion is reduced, only the poster
  shows (or the fill color without a poster) and the video is not loaded.
  By default that follows the system's *reduce motion* setting; **General >
  Motion** can force it either way (see [General
  settings](#general-settings)).

  The kiosk plays the video around the clock, so keep it light: H.264 MP4
  or VP9 WebM at the display's resolution and 24-30 fps. Blur over a video
  makes the browser re-composite every frame; leave it off or low.

Gradients, images and videos have **Effects**: **Dim** darkens the page (0-100 %),
**Tint** lays a color over it at **Tint opacity**, and **Blur** softens it
(up to 40 px; the edges stay sharp). Dim and tint make widgets with the
*Glass* surface easier to read over a busy image.

Each change is one undo step (changes made in quick succession, such as
dragging a slider, are merged). Values for the other types are kept, so
switching from Image to Color and back keeps the URL and effects. Image and
Video share one source, so switching between them never carries a file into
the wrong field: an image becomes the video's poster, and a video's poster
becomes the image.

### Uploading images and videos

Every image field in the studio (the page background, a video's poster, a
widget's background image) and the video field can take a file instead of a
URL:

- **Upload image...** / **Upload video...** opens a file picker for that
  kind; or drop a file on the field. A video dropped on an image field (or
  the other way round) is refused with a message naming the field's kind. The file
  goes to the dashboard server, and the field gets its address
  (`/api/assets/<id>`). The kiosk loads it from the same server, so it works
  in InfoPanel's own browser too.
- Accepted: PNG, JPEG, GIF, WebP and AVIF images up to 25 MB; MP4, WebM and
  MKV videos up to 300 MB. SVG is not accepted. The type is checked from the
  file's content, so renaming a file does not help. A WebM that is Matroska
  inside (as OBS remuxes and many converters write it) and a `.mkv` are both
  accepted and stored as WebM; the browser plays either. When Windows gives
  a file no type, the studio takes it from the extension.
- Uploading the same file again reuses the stored copy.
- A server started before uploads existed answers "can't take uploads yet":
  close it and start it again (`start-dashboard.bat`).
- Uploads are accepted only from the computer the server runs on. From
  another machine the studio shows "The server only accepts uploads from its
  own computer"; start the server with `ALLOW_REMOTE_UPLOAD=1` to allow it.

The **library** button next to Upload... lists the uploaded files of the
field's kind (thumbnails; the first frame for a video) with their size.
Click one to use it. Files the saved config does not use are marked
*unused*. The bin on a file deletes it from the server (click twice to
confirm). **Clean up unused...** deletes every unused file, images and
videos, after a confirm. Undo can't bring a deleted file back. The check
looks at the config saved on the server (the studio saves a moment after
each change), so a file that only the undo history still refers to counts as
unused.

## Skins and saved looks

The Dashboard inspector's **Appearance** tab has these sections: **Scope**,
**Skins**, **Theme & surface** and **Page background**. The tab opens on
*This profile* when the active profile has its own style, force setting or
background.

**Skins** is a gallery of the fourteen skins, each drawn live. Click one to
apply it to the scope (**All profiles | This profile**) and set the surface to
Auto; that is one undo step. The nine built-in appearance presets (Dark, Light,
Glass, Frosted, Matte, Neon, Minimal, Ocean, Forest) are gone: their parts now
live in the skin gallery, the surface swatches, the theme swatches, **Background
opacity** and **Background blur**, and the page background.

**Theme & surface** has, in order:

- **Surface** - swatches with live previews: Auto and the sixteen surfaces
  (see [Colors and type](#colors-and-type)).
- **Background opacity** (0-100 %) and **Background blur (px)** (Off, 4, 8, 16,
  24, 40). Blur needs an opacity under 100 % and frosts a page image or video
  behind the cards.
- **Theme** - six swatches (Zinc, Neutral, Slate, Ocean, Forest, Paper) with a
  *Custom (edited)* note when the colours match none, then the editable token
  colours.

All of them write the scope's global style, so a widget can still set its own.
The corner radius is no longer here: it is on the Profile tab (see [Grid
spacing](#grid-spacing-gap-and-padding)).

Below the gallery, **Saved looks** are your own presets. What a saved look
changes depends on the **All profiles | This profile** switch above it:

- **All profiles** - the dashboard's theme colours, corner radius and style
  (replaced as a whole, so nothing of the previous look is left over).
  Profiles with their own theme colours or style keep them (see the banner
  below).
- **This profile** - this profile's own theme colours, corner radius and
  style; the other profiles keep theirs. Options the dashboard style sets but
  the look leaves alone are set back to their defaults in the profile, so the
  profile shows the saved look rather than a mix. **Inherit** under *Theme
  colours* hands the colours back to the dashboard.

A saved look's background (the card shows a picture icon) goes to the same
scope, but only where none is set yet - turn on **Replace the page
background** under the gallery to replace an existing one. A look without a
background never removes yours. Widget content (sensors, layout, titles, ...)
is never touched, and applying a look is one undo step: **Ctrl+Z** puts the
whole previous look back.

Widgets with their own look still win over a skin or a saved look. After you
apply a saved look, a banner counts them - for example *3 widgets keep their
own style* (and, for All profiles, *1 profile has its own look*: its own style
or theme colours) - with **Make them follow**: those widgets switch to [Follow
global](#follow-global-or-custom) (their own values stay saved) and, for
All profiles, the profiles' own styles, theme colours and corner radius are
cleared. That is one undo step too.

**Save current look as preset...** under the saved looks asks for a name and
saves the current theme colours, corner radius, style (for This profile: the
profile's own over the dashboard's) and background as a preset of your own.
Its **...** menu has **Rename...** and **Delete**. Saved presets are stored in
the config (`appearancePresets`) and shared by all profiles. The command
palette has **Apply appearance: <name>** for every preset (applied to all
profiles).

Saved looks are not the same as a widget's style presets (see
[Copy, Paste, Use as global and presets](#copy-paste-use-as-global-and-presets)):
a saved look sets the whole dashboard's (or profile's) look; a style preset
restyles the one widget you apply it to. The theme swatches are a third, smaller
step: they change the colours only.

## Appearance (global style)

Look-only options can be set once for every widget instead of per widget.
With nothing selected, the Dashboard inspector's **Global style** tab lists them: surface, accent,
size and alignment, spacing, colors and type, border, glow, opacity, blur
and custom CSS. Content settings, layout, title, icon and the background
image are always per widget.

A switch (**Scope**, on the Appearance tab) picks what you edit:

- **All profiles** - the dashboard style, for every widget in every profile.
- **This profile** - this profile's style, over the dashboard's. Rows the
  dashboard style sets show its value with a teal dot until you set them
  here.

The order of precedence is: the widget's default, then the dashboard style,
then the profile style, then the widget's own value (unless the widget
follows the global style, see below). A panel's older card and accent
choices count as its default, so the global style reaches it.

**Force global style on every widget** (one per scope) makes every widget
ignore its own look values - they stay saved and come back when you turn it
off. Under **All profiles** it is a switch; under **This profile** it is
**Inherit** (the dashboard's choice), **On** or **Off**. While it is on, a
panel's own widget colours (**Color** of a stat, bar, shape, …) also give
way: fills take the global accent, text the global text colour.

A dot left of an option says where its value comes from (hover it for the
explanation):

- no dot - the default;
- blue dot - set here (on this widget, or in this scope);
- teal dot - from the dashboard style (All profiles);
- violet dot - from the profile style;
- blue dot with a ring - set here, overriding the global style;
- amber ring - set here but ignored (the widget follows the global style, or
  it is forced).

Clicking a dot that is set here resets it: it drops the value, so the option
falls back to the global style (or the default). On the Global style tab the
same dots and reset apply to the scope's own values, and **Search settings**
filters them (for example "radius").

Each section's **Reset** there clears that section's options of the scope
being edited.

### Follow global or custom

The top of a widget's *Colors & surface* section has **Follow global | Custom**:

- **Custom** (also what a widget without a choice does) - the widget's own
  values win, option by option.
- **Follow global** - only the dashboard / profile style applies. The
  widget's own values stay saved but ignored (their dots get the amber
  ring), and a banner on the Style tab says so, with a link to **Edit global
  theme** (Dashboard › Appearance). Editing a look option while the widget
  follows switches it to Custom; **Follow global style** in the zone menu
  clears the widget's look overrides.

Panels saved by earlier versions keep their card and accent as their own
values, so the global surface doesn't reach them until they follow: set
them to **Follow global**, or run **Make all widgets follow global style**
from the command palette (all zones of this profile, one undo step). The
palette also has **Force global style on every widget** (it toggles this
profile's switch when the profile has its own, else the dashboard's) and
**Appearance...**.

Each scope's style edits, its force switch and each zone's Follow / Custom
choice are separate undo steps.

### Theme colours per profile

The theme colours belong to the dashboard, unless a profile has its own.
The corner radius is separate: it is set per profile in Dashboard › Profile
(see [Grid spacing](#grid-spacing-gap-and-padding)). Under **This profile**, the *Theme colours* section
starts with **Inherit | Custom**:

- **Inherit** - the profile uses the dashboard's theme colours.
- **Custom** - the profile gets its own, starting as a copy of the
  dashboard's; the swatches and the editable colours below
  then edit the profile's copy only.

The kiosk shows a profile with its own colours in them (page, cards, text,
the Theme surface). In the studio the canvas previews them while the
studio's own panels and bars keep the dashboard's colours, so a light
profile shows as a light page on the canvas. Applying a preset to **This
profile** sets the profile's colours too (see [Skins and saved
looks](#skins-and-saved-looks)). Each colour edit and the
Inherit / Custom switch are undo steps like any other.

## General settings

With nothing selected, the Dashboard inspector's **General** tab holds preferences that are not
a look. They apply to every profile, in the kiosk and in the studio.

- **Font** - the page font, from the [font catalog](#fonts). Every widget
  whose **Font** is *Theme* uses it; a Font set on the widget, or in the
  global style, still wins.
- **Clock** - *Locale* (the date locale decides 12 or 24 hours), *24 h*
  or *12 h*; **Show seconds** (on by default); **Date & time locale** -
  *System* or one of the listed locales (for example *Deutsch (Deutschland)
  · de-DE* writes *Mo., 12.10.2026*). These shape the panel **Clock**
  widget; the last-update time in the dashboard header follows the clock
  format and locale (always with seconds). Durations, such as a track's
  elapsed time, are not clock times and don't change.
- **Motion** - *System* follows the operating system's *reduce motion*
  setting; *Reduce* and *Full* override it. Reduced motion shows a
  background video's poster instead of the video and lets the meters and
  waveforms repaint less often.
- **Hide cursor in kiosk** - no mouse pointer on kiosk pages
  (`?kiosk=1`); the studio and the normal dashboard page keep it.
- **Studio** - **Quick bar** shows or hides the [quick bar](#the-quick-bar)
  (on by default); **Inspector sections** is **One open** (default) or **Many
  open**. Both are kept per browser, not in the config.

Each change is one undo step (the same option changed in quick succession is
merged).

## Fonts

The page font (General › Type) and every widget's **Font** option offer the
same catalog (`src/lib/fonts.ts`): *System* (the browser's default), *Sans*,
*Rounded*, *Serif* and *Mono* (the original system stacks, whose ids saved
configs keep) and Google Fonts: Inter, Geist, Roboto, Manrope, Outfit, Space
Grotesk, IBM Plex Sans, Nunito, Rajdhani, Orbitron, Oswald, JetBrains Mono and
Fira Code. A Google font is downloaded the first time something uses it and
always has a system fallback, so a kiosk without internet still renders (in
the fallback). The studio's own chrome is a separate matter: it uses Geist and
Geist Mono and does not follow the dashboard font.

## Grid spacing: gap and padding

Each profile has its own spacing, in Dashboard › Profile:

- **Gap px** - the space between zones. Empty means 12 px, the spacing
  every profile had before.
- **Padding px** - the space between the page edge and the grid. Empty
  keeps the page's defaults: none on a *Fill viewport* kiosk page, 12 px on
  the normal dashboard page of a *Fill viewport* profile (next to the
  header) and 24 px for *Scroll* profiles.
- **Corner radius** - a 0-1.5 rem slider, after Gap and Padding, for the
  profile's widgets. A profile that has not set one uses the dashboard's
  radius. It rounds every widget's outer card (panels use it too); a widget's
  own Corner radius (px) still wins.

Both take 0 to 200 px in the box; a 0-64 px slider beside each box rests on
the default while the box is empty. The studio canvas draws the profile at its design
size with the same gap and padding (as the kiosk page shows it), and
drawing, moving and resizing zones, the column guides and the selection chip
all follow the gap. A gap of 0 makes the zones touch; with no card surface
(for example a transparent surface) that turns the grid into one seamless
page.

## Copy, Paste, Use as global and presets

The buttons at the top of the *Colors & surface* section work on a
widget's look-only options:

- **Copy** remembers the selected widget's style; **Paste** replaces another
  widget's style with it. Paste replaces the style as a whole: options the
  copied style does not set go back to the global style or defaults, the
  widget's content settings are untouched, and options the target widget does
  not have are skipped.
- The **...** menu holds the rest. **Use as global...** makes the selected
  widget's style the global style of **All profiles** or **This profile**. **Save as preset...** asks for a name and
  stores the widget's style as a named preset; **Apply preset** applies one
  to the widget (same replace rules as Paste) and **Delete preset** removes
  one. Presets are saved in the config and are shared by all profiles.
  (For a whole dashboard look, see [Skins and saved looks](#skins-and-saved-looks).)

## Network speeds

The network readings arrive as bytes per second (the source labels them
"KB/s"). **Network Traffic** and the **Menu Bar** show them in the unit you
pick under **Speed units**: Auto (B/s up to GB/s), MB/s, Mb/s, KB/s, Kb/s or
Mbps (megabits, the way internet providers write it). Prefixes are decimal,
like Task Manager. Both read the same adapter: the busiest one, unless you
pick one under **Adapter** / **Network adapter**.

On a screen nobody touches, the Menu Bar's **Active item** shows one tab
selected, with its detail panel when the zone is tall enough (about two rows
at cell 110). Clicking another tab still works.

Where each widget setting takes effect, by zone size, is in
[widget-settings-coverage.md](widget-settings-coverage.md).

## Dynamic Island

A pill at the top centre of a profile, like the macOS notch. When idle it shows the
time; on kiosk pages (`?kiosk=1`) it springs open for alerts and notices, then shrinks
to a badge while an alert lasts. The plain dashboard page shows the idle pill only.

Turn it on per profile in the **Dynamic Island** panel (the notch icon on the studio's left
rail), or with nothing selected under **Dashboard → Profile → Dynamic Island**; both edit the
same settings. The panel also gathers what sends to the island:

- **Widgets** - every widget on any page of the profile that can send to the island, with its
  *Send to island* switch. Click a name to show the widget on the canvas (switching page) with
  its settings open. A hidden widget sends nothing, and when two zones hold the same widget only
  the first sends. Below the list, the island widgets the profile does not have yet.
- **Alert rules** - the rules that show on this profile's island (display style *Island*).
  Click one to edit it in Alerts.

**Shape**

- **Style** - *Pill* floats below the top edge; *Notch* sits on the top edge with curved
  corners, like a laptop notch.
- **Size** - S, M or L, and **Scale** (80-150%) for anything in between. A short profile or a
  small screen gets a smaller size automatically: the open island never takes more than 40%
  of the page height.
- **Offset from top** (the pill only) - 0 to 64 px.
- **Reserve space** - the zones start below the island instead of under it.

**Idle**

- **When idle** - *Time*; *Time and date*; *Time and values* (up to three live values, each
  with a sensor, a label of up to 12 characters such as *GPU*, and optional *Orange at* and
  *Red at* levels the value turns that colour at); *Line* (a hairline at the top that grows
  into the island when something shows); or *Hidden* (only shows when there is something to
  show).
- **Rotate every** - instead of side by side, the date, each value and (with *Calendar
  countdown* on) the next event take turns beside the time, this many seconds each. 0 = side
  by side.

**Look**

- **Color** - *Black*, *Theme* (the theme's card colour, text and border) or *Custom* (pick
  the background and the text).
- **Opacity** - below 100% the page shows through, blurred.
- **Border** - none, subtle (the text colour, faint) or the theme's accent.
- **Shadow**, **Font** (any dashboard font; *Page font* follows General) and **Weight**.

**Clock** - **Seconds** and **Hours** (24 h or 12 h) follow *Dashboard › General* unless
set here.

**Motion** - **Animation**: *Lively* springs open with a little overshoot and closes flat,
*Smooth* without overshoot, *Off* changes at once. The content cross-fades with a short lift
and blur. Reduced motion (General, or the system setting) turns it off. On a kiosk, add
`&slow=4` to the address to watch the animation four times slower.

**Alerts**

- **Collapse alerts after** - for screens without touch: an alert that stays until
  tapped shrinks to the badge after this many seconds (0 = stays open until tapped).
- **Group notices** - a new notification from the same app (an achievement from the same
  game, a friend, a news post) replaces the one shown and counts up (*×3*) instead of
  queueing behind it.
- **Preview an alert** - plays an info, a warning and a critical sample on the canvas.

**What opens it.**

- **Alerts** whose display style is **Island** (in the rule's Outputs, or the alert
  defaults). On a profile without an island they show as a toast, so none is lost.
  The **Plugin stopped reporting** preset uses the condition *stops reporting*: it fires
  when a sensor that has reported goes missing for 30 s.
- **The Data API connection** - *Data API disconnected* after 5 s down (it stays as a
  badge), then *Data API reconnected*.
- **Widgets with Send to island on** (off by default, in the widget's own group on the
  Content tab; the widget's island options show under it while it is on):
  - **Now Playing** - the playing track sits beside the time with its cover and
    progress; a new track opens the island for 4 s.
  - **Steam Friends** - *Ann is online*, *Bo is playing Doom*; each friend at most
    once every 10 minutes.
  - **Wave Link** - an input, channel or mix muted (warning) or live again (info).
    *Fader moves* adds a level bar while a fader moves.
  - **FPS Monitor** - the running game and its FPS beside the time. *Game started
    notice*; *Low FPS warning below* (0 = off).
  - **Achievements** - an achievement unlocked, with its icon.
  - **Steam News** - a new post for a game in your library.
  - **Drive Space** - a drive passing the widget's Warn or Critical threshold.
  - **Network** (adapters) - an adapter connecting or dropping. *Public IP changes*.
  - **Network Throughput** - the download rate beside the time while it is faster than
    *Show above* (5 MB/s).
  - **Volume Mixer** - a level bar when the Windows volume changes or mutes, like the
    macOS volume pop-up. *Output switched* names the new default output.
  - **Weather** - rain or snow starting at the widget's location.
  - **Notifications** - Windows notifications, only from the apps you add in *Apps*
    (the apps the plugin has seen are offered while you type); *Show the message*.
  - **Timer** - the countdown beside the time, and a notice when it runs out.

  The widget only has to be on one of the profile's pages, visible or not. Two zones of
  the same widget raise each notice once. Nothing fires when the page loads.

**Dashboard notices.** Under the island's settings, each is off until you switch it on:

- **Page name** - the page's name when the kiosk switches pages.
- **Layout updated** - when a studio save reaches the kiosk.
- **Plugin back** - when a plugin that stopped reports again (the *Plugin stopped
  reporting* alert raises the stop).
- **On air (OBS)** - a red *Live* or *Recording* dot while OBS streams or records, and a
  notice when either starts or stops.
- **Calendar countdown** - the next event counts down beside the time from *Count down
  from* minutes before (10), opening the island then and when it begins. All-day events
  are left out.
- **Coding agents** - Claude Code and Codex sessions: the most urgent beside the time
  (*Claude · project*, pulsing while it works), a badge while one waits for you, *finished*
  after a turn of 20 seconds or more, an error, and the plan's 5-hour or weekly use
  passing 80 % and 95 %. Needs the agents connected (below).

**Connecting Claude Code and Codex.** The *Coding agents* notice and the Coding Agents
widget read what the agents report through their hooks and Claude's statusline, plus the
token counts in their session files. Nothing is sent but the state, the tool's name, the
project folder's name and the plan percentages; prompts, paths and session ids stay on
the PC. Once, in a terminal in the dashboard folder:

1. `node tools/agent-install.mjs` shows what it would add to `~/.claude/settings.json` and
   `~/.codex/hooks.json`, and changes nothing.
2. `node tools/agent-install.mjs --apply` adds them, keeping a dated backup of each file.
   Your own hooks stay; your statusline keeps printing, wrapped by the forwarder.
3. In Codex, run `/hooks` and approve the new hooks.

`node tools/agent-install.mjs --remove --apply` takes them out again (`--remove` alone
shows what it would take out). The hooks post to
`http://127.0.0.1:3922` (set `DASHBOARD_URL` for another port) and never slow an agent
down: with the dashboard closed they give up after a second.

With On air or Calendar countdown on, a card below sets them up. Both run on the
dashboard server, so every kiosk shares one OBS connection and one calendar fetch:

- **OBS WebSocket** - in OBS, *Tools › WebSocket Server Settings*: enable it and copy the
  port and password. Enter the host (127.0.0.1 when OBS runs on this PC), port and
  password, then **Save OBS**. The status shows *Connected* once OBS answers.
- **Calendar links** - paste an ICS link and press **Add**: Google Calendar's *Secret
  address in iCal format*, Outlook's published ICS link, or an iCloud public calendar
  (webcal:// works). The server fetches each every 10 minutes.

The password and the links are kept by the server in their own file, not in the
dashboard config that every kiosk downloads; the studio shows only *Saved* and the
link's host. Remove a link with its bin icon; **Disconnect** forgets the OBS settings.

**Taps.** A tap on an open alert acknowledges it; a tap on any other notice dismisses
it. A tap on the badge reopens the held notices one per tap, strongest first. A tap on
the activity (the playing track) opens it.

**Quiet hours.** The alerts' quiet hours also hold back the island's own notices below
the minimum severity.

The design, the internals and how to make another widget send to the island are in
[redesign/island/PLAN.md](redesign/island/PLAN.md).

## Desktop app

In the **InfoPanel Studio** desktop app (see [desktop/README.md](desktop/README.md)) the studio is the same, with these differences:

- The top bar is the window's title bar. Drag it by its empty space, double-click it to maximize, and use the minimize, maximize and close buttons at its right end. Close hides the app to the tray; the server keeps running, so the kiosk page keeps updating.
- **⋯ › Desktop app settings** opens the app's settings: where the server listens (this computer, all interfaces or one IP; the port; extra allowed host names), start at login, open the studio on launch, close to tray, the **Coding agents** toggle and debug mode.
- **Coding agents:** turning the toggle on writes the Claude Code and Codex hooks for you (with backups), using the app's own Node and the current port, so the `node tools/agent-install.mjs` steps above are not needed. Turning it off, or uninstalling the app, removes them. In Codex, still run `/hooks` once to approve them.
- **Export config** and **Import config…** use the system Save and Open dialogs. Import merges as before and is one undo step.
- Pending edits are saved before the window hides or the app quits.

## Widgets with no data

A widget with no data at all is hidden in the kiosk. (The old **Hide when idle**
option was removed; a stored value is ignored and the widget stays shown.)
