# Customization guide

How to make a widget look the way you want, from the studio.

Open the studio with the wrench button on the dashboard (or
`http://127.0.0.1:3922/?studio=1`). Changes save automatically; **Save now**
(in the top bar's **...** menu) saves immediately, and open kiosk pages update within about a second.

## The studio layout

```
┌──────────────────────────── top bar ────────────────────────────┐
├──┬────────────┬───────────────────────────────┬─────────────────┤
│  │ left panel │      [ quick bar ]            │ inspector       │
│R │ Layers |   │ canvas                        │ (docked: 320 px)│
│a │ Add        │                               │                 │
│i │ (Edit      │      [ floating zoom bar ]    │                 │
│l │  only)     │                               │                 │
└──┴────────────┴───────────────────────────────┴─────────────────┘
```

Shown docked (studio 1100 px or wider). Narrower, the inspector floats over
the canvas or becomes a bottom sheet, see [Inspector
placement](#inspector-placement-docked-floating-bottom-sheet).

The bar along the top of Edit (the window's title bar in the desktop app) holds, from left to right:

- the **breadcrumb** - the screen's name (with a pencil to rename it) and its page; the
  screen name opens a list of your screens, each with its size, and the pages of the
  current one. **Manage screens…** and **Screen settings…** open [Screens](#screens);
- **Search settings or run a command** (**Ctrl + K**) - the [command
  palette](#undo-shortcuts-and-the-command-palette);
- **Undo** and **Redo** (see [Undo, shortcuts and the command
  palette](#undo-shortcuts-and-the-command-palette)) and the saved state
  (**Saved · live on N displays**, **Unsaved changes** or **Offline · edits kept locally**);
- **Preview** (the kiosk view) and **File**: **Import** brings a config, a screen, a
  `.infopanel` profile or an asset in; **Export & back up** writes the whole config
  (or one screen) out.

**Live** - control the kiosks now: show a page, pause rotation, **Mute alerts
for 1 h**, **Dynamic Island**, dim screens, reload all kiosks and open the kiosk
view - sits at the foot of the sidebar (in the top bar on a phone). Changes are
pushed to the server automatically.

Under 600 px a **...** menu holds Undo, Redo, Save now, Import and Export.
**Reset everything...** (restores the default dashboard after a confirmation:
it wipes every screen, the theme, the styles and all widget settings; it
offers a backup first) is in Settings › Dashboard › Danger zone, the shortcut
list is in Help (and **?**), and the build id is in Settings › App › About.

The **sidebar** (232 px; it collapses to a 60 px icon rail, and is always the rail under 960 px) at the left opens one
full view at a time: **Screens**, **Edit**, then **Theme**, **Library**,
**Widgets**, **Gauges**, **Alerts & Island** and **Data sources**. **Help and shortcuts** and **Settings** sit at
its foot; Settings opens its own window. Only **Edit** has the canvas, the
left panel and the inspector; the other views take the whole page and are
described in their own sections. **Library** (your saved images, fonts, gauges, panels, Themes, Styles, widget presets and imported InfoPanel canvases), **Widgets** (every widget, your own recipes and imports, and the builder; see [The Widgets page and the builder](#the-widgets-page-and-the-builder)) and **Gauges** (design a Custom gauge or edit a screen's) replace the canvas; **Import** in the top bar brings an `.infopanel` profile in as a canvas zone.

A **floating zoom bar** sits over the bottom of the canvas, centred. It
toggles the grid and the rulers, zooms out and in (or
**Ctrl + wheel** over the canvas, **Ctrl + =** / **Ctrl + -**), fits the page
(**Fit**, **Ctrl + 0**), shows the design size (click it to open Screens) and
a preview-data chip (see **Design preview data** in Settings › Studio). The page is centered in the
canvas whenever it is smaller than the view. The design size is the screen and
**Fit** frames it in both fit modes, so changing the grid's columns or rows never
rescales the page. A **Scroll** profile whose rows run past the screen shows a
dashed **Screen ends at … px · the kiosk scrolls** line; the rows below it are
dimmed but stay editable. The grid and ruler toggles are
remembered.

On first run a **quick tips** card sits at the bottom left of the canvas;
dismiss it and it stays away. A screen without zones shows a card instead:
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
  The zoom bar sits above the sheet. On a phone the top bar hides Undo / Redo,
  Import, Export and Live (they move into the **...** menu).

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
- Switch it off or on with Settings › Studio › **Quick bar** (on by
  default).

### The left panel

In Edit, a left panel beside the sidebar has two tabs, **Layers** and **Add**
(its width is Settings › Studio › **Left panel width**: Narrow, Default or Wide).

- **Layers** - every zone of the screen's page, with an icon for its type (the
  widget's own, a panel, or a blank zone), its name, a paint-brush when it has
  its own look and its size in cells. Click a row to select the zone and
  scroll it into view; **Shift / Ctrl-click** adds or removes it from the
  selection; right-click opens the zone menu. The eye hides or shows it and
  the bin removes it. Hidden zones are dimmed but stay selectable (and do not
  show in the kiosk).
- **Add** - every widget, panel and layout, with a search box and the tabs
  **Widgets | Items | Panels | Layouts** (Items, InfoPanel's items and the
  studio's elements, appears where the page takes them). Widgets also has
  category chips (System, Hardware, Storage, Network, Media, Audio, Info, Gaming,
  Generic, Streaming), and Panels lists your saved panels under My panels (see
  [Creating a panel](#creating-a-panel)). Each widget is one row with its icon,
  name and a line of what it is. A widget with presets shows **N presets**: click
  it to list them and add one directly (see [Widget presets](#widget-presets)).
  Recipe and code widgets you added on the Widgets page follow the built-in ones.
  **Drag** a row onto the canvas - a dashed ghost shows where it lands, or **No
  room here** in red - or **click** it to place it at the first free spot. With a
  blank zone selected, a click fills that zone instead. **Recently used** holds
  the last four things you added. Resting the pointer on a row opens a card with
  a preview, what it is and its minimum size in grid cells. *Other sensors* is
  listed here too, under Generic. **Widget list** and **Preview on hover** in
  Settings › Studio set the list's density and whether hovering shows a preview.

The other views are pages of their own:

- **Screens** - see [Screens](#screens).
- **Theme** - see [Theme editor](#theme-editor).
- **Data** - the Data Explorer (see [Data Explorer and
  binding](#data-explorer-and-binding)).

### Screens

**Screens** lists the monitor profiles as cards (a thumbnail, the size, the
grid and page count). Click a card to select it for editing: it is the screen
Edit, the page tabs and the canvas follow, and it never changes what the app
opens on. **Settings > Dashboard > Startup screen** ("When the app opens") is a
choice between **Best fit for the window** (the screen closest to the kiosk
window's size; the card tagged *Best fit now*) and one screen (tagged *Opens on
launch*). A card's **...** menu
has **Open**, **Rename**, **Duplicate**, **Always open this one**, **Copy kiosk link**,
**Export screen** and **Delete** (not the last screen). **New screen** opens the New
screen page (templates, a blank grid, the sample layout or an InfoPanel profile);
**Import** reads a screen or an InfoPanel profile from a file. The Help article
*Screens and the grid* lists everything on this page.

The selected screen's detail column holds **Size and fit** (a **Size preset**,
**Width** and **Height**, **Match this window**, and **When it doesn't fit**:
Fill or Scroll), **Grid** (**Columns**, **Rows**, **Gap** and **Edge padding**,
see [Grid spacing](#grid-spacing-gap-and-padding)), **Rotation** (**Rotate
pages** and **Every** n seconds), **Performance** (**Frame-rate cap** and
**Animations** for this screen, with a chip saying whether it inherits
Settings › Dashboard's), **Theme** and **Dynamic Island** (links to this screen's
look in Theme and its island in Alerts & Island, under **Edited elsewhere**),
**Shown on** (the displays set to this screen) and **Pages: order and rotation**
(drag pages into order, **+ Add page**, and a switch per page for whether it is
in the rotation).

### Selecting, moving and resizing zones

Drag across empty grid cells to draw a new, blank zone; its **Pick a widget**
button opens the widget picker (or select it and use Add). Hovering a zone shows its size in grid cells.
Clicking selects it (a 2 px accent outline, drawn 5 px outside the zone and
the same size at any zoom; hovering shows a 1 px one). **Double-click** opens
all settings: the floating card opens, the bottom sheet goes to half. Clicking
empty canvas first closes an open colour swatch row, otherwise it clears the
selection, closes the floating card, sends the sheet to peek and clears the
search. A hidden zone shows at 35% with a dashed border and an
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
**Change widget...**, **Edit style**, **Bind data...**, **Save as Panel**
(panels), **Duplicate**, **Hide / Show**, **Move to page**, the size steps **Narrower / Wider /
Shorter / Taller** (a step that would run into a neighbour or past the grid
is disabled), **Copy style**, **Paste style**, **Follow the theme**,
**Deselect** and **Delete**. With several zones the widget-only rows and the
size steps are left out. Right-click empty canvas for **Add widget...**,
**Select all**, **Zoom to fit**, **Edit theme** (opens Theme) and
**Keyboard shortcuts**.

The widget picker (the dialog behind **Pick a widget** and **Change widget…**) lists every built-in
widget and panel (layout starters and your saved panels included) with a search box
(focused when it opens), the category chips and each one's minimum size; recipe and
code widgets are added from Add or the Widgets page; **Blank zone** removes the
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
JSON and applying a saved Theme are one step each. The studio keeps
the last 100 steps; leaving the studio, or the server's copy arriving when
the studio opens, starts a fresh history. Switching profile does not clear
it (the switch is itself a step). Undone changes are saved and synced like
any other edit.

**Ctrl + K** opens the command palette: type part of a name and press
**Enter** (or click) to run it, **arrow keys** to move through the list,
**Esc** to close. It reaches the same actions as the mouse:

- add any widget or panel - layout starters and your saved panels included
  (at the first free spot), switch screen or page, select a zone by name,
  open any view (Screens, Edit, Theme, Library, Widgets, Gauges, Data, Alerts & Island
  and its tabs, Settings and its pages), the Add or Layers panel, toggle the
  grid, zoom, save, export, import, undo, redo, **Open Live**, the shortcut
  list, **Theme**, **Theme › Background**, **Theme › Text**,
  **Settings › Dashboard** and **Data › Connection** (each opens that part of
  its view), and **Apply theme: ...** for each saved Theme;
- for the selected zone: pick a widget, duplicate, hide or show, remove,
  copy / paste / follow-global style, and **Go to setting: ...** for each of
  the widget's options, which puts the option in the inspector's search;
- for a selected panel zone: **Save as Panel** (opens the name
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
is in flight only Esc (cancel) works. Outside Edit the canvas keys are off.
The tooltips of the top bar buttons show their shortcut (the zone's Duplicate
and Remove only while no panel widget is selected, since Ctrl + D and Del
then act on the widget).

## Where the options are

The inspector is driven by one registry: the widget's own `settings` (each
with a `tab`, `section`, `more`, `hint` and `visibleIf`), the general look settings
every widget shares, the panel and panel-widget fields, and the dashboard
settings. It never hard-codes a panel per widget.

**Header.** A selected zone shows a 32 px icon, an editable name, a sub line
(`Type · N changed`, or `Type · defaults`), and **Hide**, **Duplicate** and
**Delete**. Under it is the **placement row** (column, row, width, height in
grid cells; values are checked against neighbours and minimum sizes). A
**Search this widget's settings** box sits below it.

**Tabs.** A widget or panel zone has **Content**, **Style**, **Data** and **Behaviour**
(Content: what is on the widget; Style: how it looks; Data: where the values
come from and how they are written; Behaviour: how it reacts and what it
tells you). A small pill on a tab counts the options set on this zone, and
a tab with no sections is dimmed and skipped. The open tab is remembered per
kind of selection. A blank zone and a multi-selection have no
tabs. **Search** looks through all tabs at once: the tabs give way to the
matching options, each section labelled with its tab, and a line says "N
matching settings". It covers labels, keys and option names, and the custom
cards by title and keywords; **Esc** clears it, and `No settings match "q".`
says when nothing matches. A dot on a row, and the count on a section, show what
is changed on this zone (see the source dots below).

**Sections.** The sections are an accordion with sticky headers: icon, title
(and the tab name while filtering), the number changed, a chevron and a reset
button that restores just that section's options. Settings › Studio ›
**Inspector sections** chooses **One open** (the default) or **Many
open**. The Style tab's toolbar (**Start from a saved style**, **Save as style**, **Make this the theme for…**) sits above its sections. A short hint sits behind an **i** icon on a
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
- teal - from the dashboard style (All screens);
- violet - from the screen's style;
- blue - set here (on this widget, or in the scope being edited);
- blue with a ring - set here, overriding a global value;

A value stored on a widget section that follows the theme applies to
nothing, so it shows no dot (it comes back on **Customize**). Click a dot
that is set here to reset that option.

**More.** A section's less-used rows sit behind a **More (n)** link at the
end of the section; **Less** folds them again. Whether a section is
expanded is remembered for the session, per section and kind of zone.
Search always includes the More rows, expanded.

**Inheritance chip.** A section whose look comes from the [widget
theme](#widget-theme) has a chip in its header saying where its value comes
from; its menu holds the parent's value and the actions:

- *From All screens / Screen · Desk / Page · Gaming* (inherited) with
  **Customise here**: the rows show the theme's values, dimmed and read-only,
  apart from rows that never come from a theme (the tint from cover art,
  the background image). **Customise here** unlocks them, starting from the
  theme's values. With **Advanced settings** off (Settings › Studio) a
  following section is one line, *Follows theme*, with **Customise**.
- *Custom here* with **Reset to inherited**: the widget's own values
  apply. **Reset to inherited** follows again and keeps them stored;
  **Customise here** brings them back. A section's reset button clears them.
- *Locked by Screen · Desk*: no switch; the screen decides. **Edit lock in
  Theme** opens it.
- **Edit ‹level›** opens the Theme card that holds the value, and **Make this
  the theme for...** (on a widget) moves the widget's custom sections to All
  screens, this screen or this page.

With several zones selected, an edit (and **Customise here** / **Reset to
inherited**) applies to each of them; the chip shows the primary zone's state.

**What each context shows:**

- **Widget zone** -
  - *Content*: **Header** (**Show title**, which off hides the title everywhere
    the widget shows it, **Title** and, under More, **Icon**; a widget that
    draws no header, or only a title, has fewer rows), the widget's own
    sections (for example Media: *Player*, *Visualizer*; System: *Sections*,
    *CPU*, *GPU*, *Memory*, *Drives*; Weather: *Forecast*, *Current
    conditions*) and **Fit** (**Small sizes**: Auto, Full, Card or Dense,
    with Card only where the widget has a summary card; **Density** under
    More).
  - *Style*: **Theme** (**Theme**, **Ring / bar thickness (%)**; **Graph
    style** and **Meter style** under More, see [Skins and
    variants](#skins-and-variants)), **Colors** (**Accent color**, **Text
    color**, **Secondary text color**), **Widget
    colors** (the widget's own colors, each standing for a palette color such
    as *Series 1* or *Critical*, plus the rows that choose how they work, such
    as the tint or a heat ramp; what a widget draws and how, like a Stream
    Deck's key gap or a scrim, is in its own sections under *Content*),
    **Typography** (**Font**, **Value weight**, **Label case**), **Shape &
    spacing** (**Size %**, the 3×3 **Alignment** with **Spread**, **Inner
    padding**, **Gap between items**, **Corner radius**), **Surface & effects**
    (**Surface**, **Opacity**, **Blur**;
    **Background image** and **Use as background** under More), **Border & glow**
    (**Border width** and **color**, **Edge glow** and **Glow color** - only
    while the glow is not none; the **Zone frame** - **Frame accent**, **Frame
    background**, **Frame title header** - under More) and **Advanced · CSS &
    locks** (**Custom CSS** under More, see [Custom CSS](#custom-css)).
  - *Data*: **Bound data** (see [Data Explorer and
    binding](#data-explorer-and-binding)), the widget's own source sections
    (a **Device** picker that says what Auto picks, sensors, the audio
    source) and **Units & format** (temperature unit, rate unit, decimals and
    clock, only those the widget draws).
  - *Behaviour*: **Thresholds** (see [Thresholds](#thresholds)), the
    widget's own behaviour sections (history, sorting, dynamics, click
    behaviour), **Motion** (**Graph updates**) and **Send to island**.
  - **Web Page** has reduced styling: its Style tab has the accent, size and
    corner radius, and the border. The plain card widgets (Departures,
    Notifications, Text File, Stream Deck and the *Other sensors* cards)
    offer fewer of the standard options than the other widgets.
- **Panel zone** - *Content*: **Panel** (Visual or Code, Fill or Hug, gap,
  padding), **Layout** (Stack / Grid / Overlay options), **Background**
  (Overlay only), **Widgets**; *Style*: the same look sections as a widget;
  *Data*: the sensors its widgets use. With a widget selected the
  inspector shows [that item's own four tabs](#editing-widgets) instead.
- **Blank zone** - **Widget** with a **Pick a widget** button, and **Zone
  frame**.
- **Several zones** - only the shared Style sections, with the chip of the
  primary zone.
- **Nothing selected: the Page inspector.** Click empty canvas or press
  Esc. It shows the page being edited: its **Name** and **Icon**, its
  **Size**, **Gap**, **Theme** (**Edit in Theme**) and a **Rotation** link to
  [Screens](#screens), **This page's theme** (the sections the page changes
  over its screen's theme), **Live** (**Show on kiosks now**) and **Actions**
  (**Duplicate page** and **Delete page**). A screen's size, grid and
  rotation are in Screens, the look every level inherits in
  [Theme](#theme-editor), preferences in [Settings](#general-settings) and the
  Data API URL in Data.

"Auto" or an empty value always means the widget's own look.

### Data Explorer and binding

The **Data** view replaces everything right of the sidebar with the Data
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

The panel's **title** (empty = hidden) is the *Header* section's **Title**,
and its card and accent are *Surface*'s **Surface**
(none / card / bordered card, glass, matte, theme) and *Colors*' **Accent color**;
the panel sections below do not repeat them. The **Panel** section has **Visual
/ Code**, which switches between the editors and the panel as JSON (see
[Code view](#code-view)), and **...** with Save as panel preset. **Layout**
is the arrangement (next section), **Background** (overlay panels) picks the
image widget that fills the overlay and the dark scrim - not to be
confused with *Surface*'s **Background image** (under More), which is a
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

- **Gap**: space between the widgets, and **Padding**: space
  inside the panel's card. Empty (auto) uses *Shape & spacing*, then
  the layout's own spacing.
- **Size**: **Fill** (default) stretches the panel over the whole
  zone; **Hug** shrinks it to its content.

Switching from Stack to Grid drops Spread (a grid has no free space to
spread over); everything else carries over, so switching back restores the
stack.

### Alignment at two levels

1. **The panel in its zone.** A panel fills its zone unless its **Size**
   is **Hug**. A hugging panel is placed by the zone's own alignment, the
   3×3 picker in *Shape & spacing* (left / center / right × top /
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
- The selected widget's editor is its own four-tab inspector (the zone's
  header and tabs give way to it; the header's actions still act on the
  zone). The rows are the shared ones, the same as a zone's, filed by what
  the kind uses:
  - *Content*: **Kind** (chips; **Change kind** keeps the label, sensor, unit,
    color, layout, CSS and follow flags, and drops what the new kind does
    not read), **Content** (label, clock time / date, static text or image
    URL, shape and thickness, table rows; columns and header under More) and
    **Size & placement** (width, height and align self, see below; in a
    grid the column / row span, start column / row under More, in an overlay
    the band and *Use as panel background*);
  - *Style*: **Typography** (font size, or a gauge's **Ring size**, and text
    alignment), **Color** (the widget's color, role *accent*) and **Custom
    CSS** (class names and CSS under More, with the list of hooks);
  - *Data*: **Binding** (the sensor and, under More, a sub sensor shown small
    below the value; **Bind data...** opens the picker) and **Units & format**
    (unit, decimals, **Maximum**, the 100 % of a bar or gauge, and **Multiply
    by**, e.g. bytes to GB);
  - *Behaviour*: **Thresholds** (stat, value, bar and gauge), **History**
    (sparkline samples) and **Fill** (invert).
  Typography, Color, Units & format and Thresholds follow the panel, like a
  widget follows its theme: the section reads *Follows panel "CPU"* with
  **Customise**, and *Custom for this item* with **Use panel**. An item's
  thresholds are off until the panel's theme level sets them; the quantity
  (load, temperature, value) comes from the bound sensor's unit.
- With **Code** chosen in the *Panel* section, the layout, widgets and widget
  sections give way to one wide **Code** section (see [Code view](#code-view)).

### Selecting widgets on the canvas

With the panel zone selected, click one of its widgets (a double-click on a
widget of an unselected panel does both at once). The widget gets an outline
(the others show a faint one on hover), the selection chip and the inspector
header show *Zone > Widget* (click the zone crumb to go back to the panel,
the widget crumb to scroll to its editor), and the inspector shows its
four tabs (see [Editing widgets](#editing-widgets)). Clicking empty space in the panel selects the panel again; dragging
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
travels with it into saved panels. It works like the zone's Custom CSS (both
apply).

### Styling panels with CSS

Panel CSS (Style > **Custom CSS**, or the Code
view's `css`) is scoped to the zone: `:scope` is the zone's root and the
selectors below match inside it. A widget's own **Custom CSS** (its Style tab) is scoped to that widget's cell: `:scope` is the
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
Shape & spacing value and then the built-in spacing as fallbacks:

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
(Style > Custom CSS > **Class names**, e.g. `hot`) and select `.wp-widget.hot` in the
panel's CSS.

## Widget presets

Most widgets come with **presets**: named views, each with its own size and settings. Weather has Full, Now, Forecast,
Minimal, Glance and Week; FPS Monitor has Frame-time graph, Gauge, Trend and Frame pacing. 67 presets ship, across 21
widgets. Several widgets that used to be separate are presets of another: Forecast is Weather's Forecast preset,
Threshold Timeline is Session Stats' Threshold timeline, Vitals is KPI Tiles' Vitals, GPU Rings is GPU Monitor's Rings and
Frame Pacing is FPS Monitor's Frame pacing. A screen saved with an old one opens as the new one, in the matching view, with
its settings kept.

- In **Add**, a widget with presets shows **N presets**; click it to list them and add one, or drag it onto the canvas.
- A placed widget has a **Preset** row in its inspector, under the placement row and above the tabs. Click a preset to apply it (one undo step); it sets the
  view and the settings the preset names and leaves the rest. Tick **Also use the preset's size** to resize the zone too. If
  you change a setting a preset sets, the row reads **Custom**.
- **Save as preset** keeps the widget's view, settings and size under a name you type. It is listed under **Yours** in the
  Preset row, as a row of that widget in Add, and in **Library › Widget presets**, where it can be applied to the selected
  widgets of that kind, renamed, duplicated and deleted. **Save as style** next to it keeps only the look (see [Styles, Copy,
  Paste and Make this the theme](#styles-copy-paste-and-make-this-the-theme)).

## The Widgets page and the builder

**Widgets** in the sidebar opens the Widgets page: every built-in widget, the ones you made and the ones you imported, in one
place. It also builds new ones.

**Browse.** The title counts the built-in, your own and the imported widgets. A search box and the chips **All**, **Recipes**,
**Code** and **Yours** narrow the list, which has three sections: **Yours** (recipes saved from the builder), **Imported**
(packages brought in from a file) and **Built in** (with **Show all**). Click a card to open its details: what it is, how it
is made and by whom, its presets, the options people can change and the screens it is on. **Add to a screen** puts it on the
screen you were editing. The **⋯** menu has **Duplicate**, **Remove** and, for an imported code widget, **Turn this widget off**.

**Two kinds of widget you add.** A **recipe** is built from the studio's own blocks: it holds no code, follows the theme,
scales with its zone and needs no trust. A **code widget** is a package with JavaScript in it, written by a developer; it runs
with the same access as a built-in widget, so it loads only when signed by a key you trust (see [Code widgets and
trust](#code-widgets-and-trust)). Both appear in Add after the built-in widgets and have presets like any other.

**Import and Export.** **Import** takes a widget package, a `.zip` of at most 512 KB. The studio checks it before storing
anything; a refused package is listed with the file and the reason in plain words. A package whose widget is already installed
asks first, showing the installed version and the file's (**Replace** or **Keep the installed one**); the same files again change
nothing, and a signed package is never replaced by one of the same version with other files. A replaced recipe stays where it
was (in **Yours** when you made it). **Export**, in a widget's details or in the builder, writes `<name>-<version>.widget.zip`;
in the builder it saves your edits first, so the file is always the version the server holds.

**New widget** opens the builder on a blank recipe. A built-in's details also have **Duplicate as a recipe** for CPU Monitor,
GPU Monitor, Sensor, Weather, Fans, Disk I/O and Core Heatmap; the other built-ins draw things blocks cannot (lists of things that
are not devices or places, controls, the clock, audio streams), and the button says why it is disabled.

**The builder** has Layers and **Add a block** on the left, the preview in the middle and the inspector on the right.

- A recipe is a card of blocks: Ring, Gauge, Bar, Sparkline, Value, Label, Weather icon, Image, Heatmap, Row, Grid and Repeat (up
  to 64 blocks, six levels deep). The name is edited in the bar at the top; **Undo** and **Redo** (`Ctrl+Z`, `Ctrl+Shift+Z`)
  step through edits, and every open recipe keeps its own history. A text or number field counts as one edit when you leave it
  or press **Enter** (the preview follows as you type; **Esc** puts the value back), and a slider drag is one edit.
- In **Layers**, drag a block into a Row, a Grid, a Card or a Repeat (onto the middle of its row), out of one, or between rows (a
  line shows where it lands). On the keyboard, **Alt+←** takes the selected block out of its container, **Alt+→** puts it into
  the Row, Grid, Card or Repeat just above it, and **Alt+↑** / **Alt+↓** move it among its neighbours. A move the recipe can't
  hold (a Repeat or a Grid inside a Repeat, more than six levels, an item's reading outside its Repeat or in a Repeat whose items
  lack it) is refused, and the reason shows where you dropped it.
- Click a tile in **Add a block** to add the block by the selection, or drag the tile onto a row in **Layers** or onto the
  preview to put it exactly there (the same line or outline shows where, and a refused drop says why).
- Right-click a row in **Layers** (or press **Shift+F10** or the Menu key) for **Rename** (**F2** or a double-click),
  **Duplicate** (`Ctrl+D`), **Copy** (`Ctrl+C`), **Cut** (`Ctrl+X`), **Paste** (`Ctrl+V`), **Wrap in a row** (`Ctrl+G`),
  **Move up**, **Move down**, **Move out** and **Delete** (**Del**). **Ctrl+click** and **Shift+click** select several rows;
  Delete, Duplicate, Copy, Cut, Wrap in a row and a drag act on all of them. A paste lands after the selected block, or inside it
  when it holds blocks, and works across the open recipes, bringing along the options the blocks use; a paste the recipe can't
  hold is refused with the reason. A cut and its paste are one undo step. A row whose block has a problem has a warning dot.
- **Layers** is a tree for the keyboard and screen readers: **↑** / **↓** move between rows, **Home** / **End** go to the ends,
  **→** / **←** open and close a container, typing jumps to a row by name, **Enter** selects and **Esc** selects the card. Moves,
  pastes and refusals are announced.
- `Ctrl+S` saves the recipe (as **Save** does). **Discard changes** returns to the saved version (one undo step), and the **×**
  after the name closes the recipe, asking first when it has unsaved changes; the Widgets page lists recipes left open with
  unsaved changes, each with **Discard**.
- Above the preview, **Size** switches between the recipe's main sizes and the two boxes beside it take any size from its
  smallest to its largest; **Preview in** draws it in another look as a screen wearing that look would (its card, colours and art), and **Data** switches between **Live data** and **Sample**
  values. Before the first save the Sample takes each reading the recipe has no sample of from the live data.
- The inspector's **Block** tab sets what the selected block reads (a sensor, or a device such as a CPU or GPU), its colour
  (accent, a series, or by thresholds; a Heatmap's own heat scale or a series; a Value's number also **Text**, its default, or
  **Muted**), when it shows (always, or when an option has a value) and the sizes it is drawn at (**From the size** and **Up to the
  size**, each in columns and rows). **Let people pick** turns a binding into an option, and **Replace sensor…** swaps
  the block's reading for another everywhere the recipe reads it (one undo step; the blocks it changed are listed). A **Row**'s
  **Align** (Start, Centre, End, Stretch) places each block across the row. A card's **Opens at** size is also its default
  preset's, so **Add to a screen** places it at that size.
- A **Value**'s and a **Ring**'s **Show in** shows the reading in another unit of its kind, from a fixed list: Hz, kHz, MHz and
  GHz; B, KB, MB, GB and TB (by 1024); B/s, KB/s, MB/s and GB/s (by 1000); W and kW; °C and °F. A CPU's clock of 5120 MHz shows as
  5.12 GHz with two decimals. The decimals, a ring's range and the warning levels are in the unit shown; a typed **Unit** and
  **Show in** are one or the other. A ring's centre value has a **Centre colour** (Text or Muted).
- A **Value**'s **Align** is **Spread** (the label at the start, the value at the end; the default), **Start**, **Centre** or
  **End**; a **Label**'s is Start, Centre or End.
- A **Value** and a **Label** have a **Weight**: **Theme**, the default, draws the Look's own weights (regular text, and a Value's
  number in the Look's numeral weight, bold on Classic); **Medium** and **Semibold** set 500 and 600 for the whole text, number
  included, in the Look's own font (a Look that sets its numbers' weight keeps it) and a **Case** (As typed or UPPER; on a Value the label only, so a unit keeps its case).
- **Opacity** (100 %, the default, 80, 60 or 40 %) sits by the colour of a Value, Label, Ring, Gauge, Bar, Sparkline or Heatmap. A
  mark (a ring's arc, a bar's fill, a sparkline, the cells) is drawn at that step. Text (a Value, a Label, a ring's centre value) is
  never drawn under a 4.5:1 contrast on its card: where the step is too faint for the Look it is shown on, it is drawn at the
  lowest step that keeps it readable, and the inspector says so ("Shown at 80 % on this Look to stay readable").
- A **Card** inside the widget has a **Surface** (None, Track, the default tint, or Raised, lifted off the card with an edge and a
  shade) and a **Padding** (None, S, M, the default 8 px, or L). The widget's own card has a **Spacing** between its blocks
  (Tight, Normal, the default, or Roomy). All of them take their colours from the Look.
- A **Gauge** has a **Sweep** of 180°, 240° or 270° (the default), and a **Bar** a **Height** of S, M (the default) or L.
- **Thresholds** have a **Direction**: **High is bad** (the default: warning from the warning level up, critical from the critical
  level up) or **Low is bad**, for a battery or free space (warning at the warning level and under, critical at the critical
  level and under). The line under the levels says the order in words; a warning level past the critical one for its direction
  is a problem the recipe cannot be saved with.
- The widget's card (the top row in Layers) has a **Header icon** and the recipe's **Details**: the **Description** shown on
  its card on the Widgets page, a **Category** (letters and spaces), the **Author**, the **Version** (each save raises it; the
  next is shown) and the **Icon** its card shows.
- A **Label**'s **Text** is **Typed** or **From data**: a sensor, an option people set (a text option, for instance) or, inside a
  Repeat, a field of each place. From data it is a line of parts shown as chips: **Add a part** adds typed text or another
  reading, each reading with its own unit and decimals, and the chips drag to reorder ("6° / 1°" is the high, " / " and the low).
- A **Heatmap** lists its **Cells**, one reading each: **Add a cell** opens the data picker (tick several at once), × removes one
  and the rows drag to reorder. Inside a Repeat it draws a field of numbers of each place instead.
- The **Image** tile asks for the picture first and adds the block only once one is picked; an Image has **Alt text** for screen
  readers (empty for a picture that only decorates). A picture no Image shows is left out when the recipe is saved. A **Weather
  icon** outside a Repeat picks from text readings (a condition), and has no **Let people pick**.
- **Snippets** under the tiles add a few blocks at once, in a Row: **Label, value and bar**, **Ring with a caption** and **Value
  and history**.
- The eye and the lock on a row in **Layers** (shown when you point at the row, also in its menu, `Ctrl+Shift+H` and
  `Ctrl+Shift+L`) are the builder's own: a hidden block is not drawn in the preview (it keeps its room), and a click on a locked
  block in the preview selects the block holding it; a locked row does not drag. Neither is saved; **Shows when** is how a saved
  recipe hides a block. The **Header** row under the card holds its title, sub-title and header icon (a click on the preview's
  header selects it too).
- Deleting a block that was the last to use an option (a Repeat's **Locations**) offers **Also remove … (not used now)**; it is one
  undo step with the delete, and **Keep** leaves the option. Setting a Repeat to run over devices offers the same for the place
  list it no longer reads.
- A **Repeat**'s **List** is a place list (Weather by place, below) or a device list the readings have: **Drives**, **CPU
  cores**, **Fans**, **Network adapters** or **GPUs**, each found as the built-in widgets find them. The blocks inside read a
  **Field** of each item: a drive's name, model, used space, temperature, activity, read and write rates, free and total space and
  life; a core's name and load (the first CPU's threads, in order); a fan's name and speed in RPM (a fan at 0 is left out); an
  adapter's name and download and upload rates; a GPU's name, load, temperature, clock, power and memory used. **Most shown** goes
  up to 32 for devices (12 for places). Changing the list moves each block to a field the new items have (a name stays a name).
  The Sample shows the devices the recipe was saved with.
- A **Grid** lays its blocks out as cells of one size, in **Columns** you set (1 to 12) or, empty, as many as make the cells
  closest to square at the size shown, with a **Spacing** (Tight, Normal or Roomy). A Repeat inside a Grid gives each item its own
  cell, its blocks in a column: a Grid holding a Repeat over CPU cores with a Ring draws a ring per core. A Repeat in a Grid has
  no Direction or divider lines of its own, and a Grid can't go inside a Repeat. At a small size the cells shrink; the crowding
  warnings below name a block in a cell as anywhere else.
- **Options** are what people can change when they add the widget, shown in its Content tab: a toggle, a choice, a number, a
  text, a sensor (its default picked with the data picker), a place list or a device (up to 24). A device option's **Kind** (CPU, GPU, Drive, Network adapter) changes what
  every block that follows it reads at once: each reading moves to the new kind's reading of the same sort (load, temperature,
  clock, power), and the ones with no match are listed so you can pick them again. That is how a GPU card is made from a CPU
  card. An option has a **Hint** (a line under it in the Content tab) and a **Group** (the heading it sits under), and a number a
  **Step**. A choice that a block's **Shows when** names can't be removed until that block shows otherwise; a preset that picked a
  removed choice goes back to the default. **Presets** are named sets of options and a size (up to 16), each with a **Blurb** (its
  line in Add) and values for every kind of option: a text, a sensor, a place list and a device too.
- The line under the preview says whether the recipe is valid. When it is not, it lists every problem in plain words, each
  naming its block as Layers does; click one to select that block (or open the Options or Presets tab). After each change it
  also measures the preview at the size shown and warns of crowding by block: a cut text, a ring too small for its value, a
  block past the card or two blocks over each other ("At 2×2, Values overlaps Ring"), with a dot in Layers; a warning never
  stops a save, and the line says the recipe **fits** at that size only when nothing is crowded. **Save** stores it on
  the server, **Add to a screen** saves it and puts it on the screen, and **Export** saves it and writes the package. A recipe
  signed by someone else cannot be replaced by a save, only copied with **Save as a copy**.
- A recipe that uses a label of parts, a Value's or a Label's **Align**, a Value's **Muted** colour, a
  ring's **Centre colour**, **Show in**, **Low is bad**, a **Grid** or a Repeat over devices is saved as recipe format 2, and needs this version of Studio. An older
  Studio draws it as "Widget not available" (a recipe without any of them stays format 1 and draws everywhere); this one says
  "made with a newer InfoPanel Studio; update to show it" for a recipe of a format newer than it reads.

**Weather by place.** A recipe can show the weather for places people choose, with no plugin: a **Repeat** block over a place
list, with a Weather icon and values bound to each place's temperature, wind, precipitation and so on. In the widget's Content
tab the place list takes names (**Add a place: search by name**) and a first place for this PC (**Use this PC's location
first**, picked once and never looked up from your connection). The forecasts come from Open-Meteo, through the dashboard's
server; only the place names and coordinates leave your PC, and a place is fetched when a screen first needs it and about every
15 minutes after. The widget draws the credit **Weather data by Open-Meteo.com · CC BY 4.0** and says when data is old or
missing. Start the server with `WEATHER=off` to turn it off. The built-in Weather widget is separate and still reads the Yr or
OpenWeatherMap plugin.

### Code widgets and trust

A code widget's details say who stands behind it:

- **Signed by InfoPanel Studio · reviewed** - signed by the owner's key, which is built into the app.
- **Signed by ‹name› · not reviewed** (amber) - signed by a key you trusted yourself. Nobody has reviewed the code. It can read
  your sensors, screens and settings and use the network.
- **Not loaded: the signature does not check out** (red) - refused. It is greyed out, is not in Add and draws "Widget not
  available" where it is placed.

Keys are added only in **Settings › Widget publishers** (**Manage keys** in a widget's details goes there), never from an
import. A key signs only for the publisher names you give it. **Turn this widget off** unloads one widget, and **Third-party
code widgets** at the top of the page hides and stops every code widget that isn't built in. Both are kept by the server, so
every screen and kiosk it serves obeys them, kiosks on other devices included. The server's own `USER_CODE_WIDGETS=off` does
the same and cannot be undone from the page; `USER_WIDGETS=off` turns off every recipe and code widget. The page offers the
**Widget SDK types (.d.ts)** for authors. How to write and sign a widget: [code-widgets.md](code-widgets.md); the security
side: [security.md](security.md).

## Scaling with the zone and Size %

Widgets fit themselves to their zone: each one measures its zone, picks a
layout for that size and shape (a 1×1 zone gets a compact tile, a wide strip a
row, a larger box the full layout) and sizes its text, rings and rows from the
room that is there. Making a zone bigger therefore shows more, not just larger
content. **Density** (Fit, under More: Auto, Roomy, Standard, Compact, Minimal) fixes
the size class instead of measuring it.

**Size (%)** (50-200) zooms the content on top of that, and the layout is
chosen from the zoomed size: 150 % in a zone makes the widget behave as if the
zone were smaller. The old **Scale with the zone** option did nothing and is
gone; only Size % applies.

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

The **Theme** section (Style tab) restyles a whole widget, not just its colors.
It resolves like every other look setting: you can set it once for the
profile or a page (the [widget theme](#widget-theme)) and let widgets follow it.

- **Theme** (the first Style section, the widget style; stored as the skin) - Auto, or one of fourteen, each with its own fonts, corner
  radius, header and graph and meter style: `default` (studio card), `tui`
  (btop-style terminal), `macos`, `fluent` (Windows 11), `hud` (sci-fi HUD),
  `ink` (monochrome editorial), `retro` (CRT terminal), `ios`, `android`
  (Material You), `synth` (synthwave), `cyber` (cyberpunk), `nixie`, `brutal`
  (neo-brutalist) and `instrument` (instrument rack). A skin brings its own
  card (see below) unless you pick a surface under *Surface*,
  and its own accent unless you set an accent. Its fonts load on first use; offline, the widget
  falls back to the standard stack. **Font** under *Typography* overrides the
  skin's fonts.
- **Small sizes** (Fit, Content tab) - what the widget draws in a small zone.
  *Auto* swaps a zone of 1 x 1, a one-row strip or a one-column zone to a
  summary card of tile, strip or column form; *Full* keeps the full layout at
  any size; *Card* shows the summary card at any size (a wide zone gets the
  strip form, otherwise the tile form) and is offered only by widgets that
  have one; *Dense* draws a dense summary of the same data (a headline
  value, a trend and a few rows), or the card where the widget has no dense
  view. **Density** (under More) picks the size tier of the layout. Small
  sizes belongs to the zone's shape, not its look, so no theme sets it.
- **Graph updates** (Motion, Behaviour tab) - Stepped (the default) or Smooth. Smooth scrolls line,
  area and step graphs at a constant speed, about two readings behind the
  feed, so each new reading slides in without the line jumping or pausing;
  the axis eases, and bars and rings glide (about 1 s). Reduced motion
  (**Animations** in Settings › Dashboard or in the screen, or the system setting) keeps graphs stepped. Braille,
  bars and dots graphs and numbers are unchanged. The theme sets it too.
- **Graph style** (More) - Auto, area, line, step, bars, dots or braille:
  how trends are drawn.
- **Meter style** (More) - Auto, bar, pill, segments, blocks, hair, wave
  or square: how bars and level meters are drawn.

A skin is more than a card: type, numerals, graph and meter style, header and
decorations, and it brings its own card. The **Surface** setting is only the
card. Picking a skin (the **Theme** row) sets that level's
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
radius (Theme › Shape & spacing, at the screen) rounds every widget's outer card; a widget's own Corner
radius wins.

## Colors and type

- **Accent color** (in *Colors*) tints the widget's main fill,
  such as the progress bar or the big temperature; each widget decides where
  it lands.
- **Text color** and **Secondary text color** override the surface's text.
- **Font** (Theme, or any font of the [catalog](#fonts)), **Value weight** and **Label
  case** (UPPERCASE, as written, Capitalized). *Theme* uses the page font,
  which is the **Page font** in Theme › Fine-tune › Text (see [General settings](#general-settings)).
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

In *Border & glow* and *Surface* (opacity
and blur), for widgets with a surface box:

- **Border width** and **Border color** (the default is a 1 px edge).
- **Edge glow** (None, Soft, Strong) and **Glow color** (empty = the accent
  color). The glow is drawn inside the edge, because an outer glow would be
  clipped by the zone.
- **Surface opacity (%)** fades the surface background, gradients included.
  At 0 the background is fully transparent.
- **Background blur** blurs what is behind the surface (visible on glass or a
  faded surface).

A **background image** (in *Surface*, under More) needs both the image URL and
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

The page behind the zones can be a color, a gradient, an image or a video. Open
**Theme** and its **Colors and Background** section (or **Theme › Background** in the command
palette). The studio canvas shows the background as the kiosk will,
with the dotted grid drawn over it.

Each screen has its own background; a page has none of its own (the card
links to the screen's). **None** shows no background on that screen. The type
and **Dim** show first; Fit, position, fill, tint, blur and the video options
are under **More**. A theme can bring a background; **Keep my background** (in
Theme) keeps yours when you apply a theme.

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
  By default that follows the system's *reduce motion* setting; **Animations in Settings ›
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

- **Upload…** on the field opens a file picker for that
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

The library button next to **Upload…** lists the uploaded files of the
field's kind (thumbnails; the first frame for a video) with their size.
Click one to use it. Files the saved config does not use are marked
*unused*. The bin on a file deletes it from the server (click twice to
confirm). **Clean up unused…** deletes every unused file, images and
videos, after a confirm. Undo can't bring a deleted file back. The check
looks at the config saved on the server (the studio saves a moment after
each change), so a file that only the undo history still refers to counts as
unused.

## Skins and saved themes

**Theme** in the sidebar edits the live look of one screen, or of one of its pages; a change shows on the screen at once.
Each screen owns its theme and nothing above it is shared. A theme is its widget style (the skin, one of the fourteen
above), its palette (the 19 color tokens and the widgets' accent), its corners and its background (see [Page
background](#page-background)); a theme pack may add scenery, effects and card details. On a page the palette, corners and
background are the screen's, and a page changes its widget style and fine-tune only.

The header has the **level picker** ("‹screen› · whole screen" or "‹screen› › ‹page› page"), the tabs **Customise** and
**Browse themes**, **Save as my theme** and a **⋯** menu.

- **Browse themes** shows every theme as a card drawn by the real widgets, in the groups **Yours**, **Theme packs** and
  **Plain themes**, with filters (All, Packs, Plain, Yours), tags and a search. Select a card for its detail, then **Apply
  to ‹screen›**, **Preview on screen**, **Duplicate**, and see **What it brings**. **Import a pack** brings in a theme pack
  from a folder or a zip. **Saved and template themes**, at the end of the list, holds your saved themes and each screen
  template's theme (filters All, Saved, Templates, Light). Applying one writes its look and, unless **Keep my background**
  is on, its background; the message under the header says what changed, how many fine-tune changes were kept, with
  **Reset to ‹name›** and **Undo**.
- **Customise** draws the screen as the kiosk draws it (**Show as** Full or Lite mode) with, on the right, the **theme
  card** (**Change** opens Browse themes), **Quick changes** (**Accent**, **Mode**, **Cards**, **Corners**, **Density**),
  **Motion** (only for a theme pack that brings motion, see below), **In this theme** (Scenery, Effects, Card details, Icons, Font, Background and **Keep my background**, Burn-in care) and
  **Fine-tune**.
- **Fine-tune** holds the sections that sit on top of the theme: **Colors**, **Text**, **Shape & spacing**, **Surface &
  border**, **Units & format**, **Thresholds**, **Motion** and **Custom CSS**. Each has a dot saying whether the value is
  set here or follows the theme (or, on a page, the screen), and, on a screen, a lock. Press the dot for **Reset to
  inherited**, **Change here** (on a page) or **Edit ‹level›**.
- The card's **⋯** menu has **Lock all** and **Unlock all** (on a screen), **Reset to ‹name›** (every part back to the theme
  and this level's fine-tune cleared, one undo step), **Rename**, **Duplicate** and **Delete**. **Save as my theme** keeps
  the level's theme under a name you type; after a change to a saved theme, **Update ‹name›** saves it and refreshes the
  levels that use it. Saved themes are stored in the config (`appearancePresets`).
- The preview draws the page at its real shape and tags each widget that differs from the level; click one for **Use
  theme's value** and **Open in Edit ↗**, or **Make all follow** with nothing selected.
- The command palette has **Apply theme: ‹name›** and **Apply theme, keep background: ‹name›**.
- **Motion** shows for a theme pack whose `pack.json` has a `motion` block: labels and titles that decode as a card arrives,
  numbers that scramble for a moment when their reading changes (at most once every few seconds each), a short glitch on
  the titles, a card that fades, wipes or draws a line in as it arrives, and an occasional flicker or scan line across a
  card. A pack can also have numbers **count** to a new reading or **roll** their changed digits (a clock), with a short
  flash or underline; rows of lists (friends, processes, coding agents, services, news, notifications) **slide in**,
  **glide** to a new place when the order changes, light up when their status changes and decode a new row's text; and
  the page **boot** in, card after card, with a line drawn across each and its title decoding, once each time a page
  opens. **Level** is the screen's **Effects** setting (Screens › Performance): **Full** draws all of it, **Calm** only what
  plays as a card or reading arrives (without the flashes that mark a change), **Off** none; reduced animations and lite
  mode draw none either. **Intensity** and
  **Speed** (Low or Slow, the theme's own, High or Fast) and a switch per effect are stored like the other quick changes,
  at the screen or page. The real text stays on the page throughout (the noise is a copy screen readers skip), nothing
  changes size, and nothing flashes more than three times a second.

  In `pack.json`, `motion` takes any of `glitch`, `decode`, `scramble`, `arrival`, `flicker` and `sweep`, each an object
  with `on` (default true; false leaves it for the switch), `intensity` (0.1 to 1) and its own timing: `glitch` `ms`
  80-300 and `every` 0 (on arrival only) or 4-120 seconds; `decode` `ms` 150-900; `scramble` `ms` 60-300 and `every`
  1-60 (the least seconds between two scrambles of one number); `arrival` `ms` 120-300 and `style` `fade`, `clip` or
  `line`; `flicker` `every` 2-120 and `target` `card` or `label`; `sweep` `ms` 400-3000 and `every` 4-120; `value` `ms`
  150-900, `every` 1-60 (the least seconds between two runs of one number), `style` `tween` (count) or `roll`, `mark`
  `none`, `flash` or `underline` (a number with both `value` and `scramble` takes the value); `list` `ms` 120-300, `enter`
  `slide`, `fade` or `none`, and `reorder`, `change` and `decode` (true or false); `boot` `ms` 120-300, `stagger` 20-120 (ms
  between two cards), `style` `fade`, `clip` or `glitch`, and `line` and `decode` (true or false). Anything else, or a
  value out of range, refuses the pack at import. The real reading is on the page at once while a number counts, the page
  starts at most six counts and two change marks a second and twelve runs at once, and a list moves at most eight rows of
  a card at a time.

- **Animated page art**: a page layer's SVG may move (a turning reticle, a tracing line, a pulsing lamp) when the layer
  says `"animated": true` in `pack.json`'s `stage.layers`. The SVG keeps to a small subset: `@keyframes` in a `<style>` that
  move `transform`, `opacity` or `stroke-dashoffset`, started by rules on a `.class` or `#id`, or `<animate>` on `opacity`
  and `stroke-dashoffset` and `<animateTransform>`, with times and numbers only; a cycle lasts at least a second with at
  most seven steps, and at most 24 elements of a file move. It moves only at **Full**: at **Calm** and **Off**, in lite
  mode and with reduced animations the app draws it still. An animated SVG may not be used from `pack.css`, and `<text>`
  and scripts are still refused.

- **Effect script**: a theme pack may carry one small script that draws an effect over the cards (particles, a scan line,
  a pulse that follows a reading). It runs in a sandbox of its own and draws only shapes in the theme's colours on a layer
  over the cards that takes no clicks and that screen readers skip. It never sees text or exact readings and cannot reach
  the network, your files, settings or other apps. Like Motion it follows **Effects**: **Full** at 30 frames a second,
  **Calm** at 15, **Off**, lite mode, reduced animations and a hidden screen run none of it. A script that is too slow
  three times in ten seconds gives way to the pack's other effects, and one that runs past its time, uses too much memory
  or breaks is stopped; the rest of the pack stays either way.

  The built-in **Cyberspec** pack has one: corner brackets that trace in round a card as it arrives, a slow scan band down
  each card, and a pulse round a card in warning. A built-in pack's script comes with the app and asks nothing; **Pack effect
  scripts** in Browse themes, or `PACK_SCRIPTS=off`, turns it off with the others.

  Whether an imported pack's script runs depends on its signature (see [Pack scripts](security.md#pack-scripts)). For an
  **Unverified** pack the studio asks once, when you first wear or preview it: **Allow for this pack** or **Don't allow**.
  The answer is kept with the pack and asked again when the pack is updated. A kiosk never asks: there an unanswered pack's
  script just does not run. A pack that changed since it was signed, or that was withdrawn, never runs its script.

#### Writing an effect script

[Building an advanced theme pack](building-an-advanced-theme-pack.md) walks through a whole pack, script included, with
Cyberspec as the example.

In `pack.json`, `"script": { "file": "fx.js" }` names the script, a file in the pack's `assets` folder listed in `assets` like
the others: a plain name ending in `.js` (lowercase letters, digits and hyphens), at most 64 KB of UTF-8 text. It is the only
`.js` file a pack may hold. The script is plain JavaScript run by QuickJS: the language's own objects (`Math`, `JSON`, `Array`,
`Map`, typed arrays and so on) and one more, `fx`. There is no `Date`, `Promise`, `Math.random`, timer, `fetch` or any other web
API: use `fx.now()` and `fx.rand()`.

| Call | What it does |
|---|---|
| `fx.onFrame(fn)` | `fn(t)` runs once a frame (`t` is the frame's time in ms). The app draws the frame from what `fn` hands to `fx.draw`; the last `fx.onFrame` wins. |
| `fx.draw(list)` | Adds commands to this frame: an array of objects, below. At most 2,000 a frame; the rest are dropped. |
| `fx.signals()` | What the script may read of the screen, updated at most 4 times a second: `{ level, width, height, cards }`. |
| `fx.rand()` | A number from 0 to 1, from a seed of the pack's id, so a pack draws the same way each time. |
| `fx.now()` | The frame's time in ms. |

`level` is `"full"` or `"calm"`; `width` and `height` are the overlay's size in px. Each card is `{ x, y, w, h, value, state, texts }`:
its box in px, `value` the card's lead bar or ring as 0 to 1 in hundredths (or `null`), `state` `"ok"`, `"warn"`, `"crit"` or
`null`, and `texts` the boxes of its title, labels and numbers as `{ x, y, w, h, n }`, where `n` is how many letters it has. Cards
that blur a value for privacy, and coding-agent and chat cards, are not in the list, and nothing is drawn over them.

Every command paints with `fill` and/or `stroke`, an index into the theme's palette, plus `alpha` (0 to 1, default 1) and
`width` (the line width, 0 to 8 px, default 1). The palette is the theme's own colours, in this order: 0 accent, 1 text,
2 muted, 3 ok, 4 warn, 5 crit, 6 info, 7 page background, 8 card surface, 9 secondary text.

| Command | Fields |
|---|---|
| `rect` | `x`, `y`, `w`, `h` |
| `arc` | `x`, `y`, `r`, `start` and `end` in radians (default a full circle) |
| `path` | `points`: `[x0, y0, x1, y1, …]`, 2 to 512 points (8,000 in a frame), `close` true to close it |
| `glyph` | `card` and `text`, indices into `fx.signals().cards` and its `texts`: paints that text's box |
| `transform` | `m`: `[a, b, c, d, e, f]` for the commands after it; scale and skew at most 4, moves within the screen |
| `reset` | back to no transform |

A command out of shape, or a colour that is not a palette index, is skipped; numbers out of range are held to it. A frame has
2 ms of the script's own time: past that it is cut off and draws nothing, and three such frames in ten seconds hand over to the
pack's other effects. The script's top level has 50 ms, and the script has 8 MB of memory. The app also holds the overlay to
at most three flashes a second. For example:

```js
fx.onFrame(function (t) {
  var cards = fx.signals().cards;
  var list = [];
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    var y = c.y + ((t / 3000 + i / 7) % 1) * c.h;
    list.push({ op: "rect", x: c.x, y: y, w: c.w, h: 2, fill: c.state === "warn" ? 4 : 0, alpha: 0.2 + 0.3 * (c.value || 0) });
  }
  fx.draw(list);
});
```

Saved themes are not the same as a widget's Styles (see [Styles, Copy, Paste and Make this the
theme](#styles-copy-paste-and-make-this-the-theme)): a saved theme sets a screen's (or page's) look; a Style restyles the
one widget you apply it to.

### What a theme pack can set

For a worked example of every part below, in the order you would build them, see [Building an advanced theme
pack](building-an-advanced-theme-pack.md).

A pack's `look.json` may list **variants** (the Variant row under Quick changes: chips, or a dropdown for more than two). A variant sets `accent`, and also `textColor`,
`mutedColor`, `ok`, `warn`, `crit`, `borderColor`, `glowColor` and `numGlowColor`, as colours (`#rrggbb`, `rgb()`, `hsl()`,
`oklch()` or an alias such as `{cyan}`), so a variant can restyle its labels and secondary text and not only the accent. A colour
may instead be **derived from the variant's accent** in OKLCH, so one rule serves every accent:
`"textColor": {"from": "accent", "l": 0.94, "c": 0.03}` takes the accent's hue at that lightness and chroma. The fields are `l`
(lightness 0 to 1) or `lMin` (at least that light), `c` (chroma 0 to 0.4), `cMul` (0 to 2) or `cMax`, and `alpha` (only for
`borderColor`, `glowColor` and `numGlowColor`). The app works the colour out when the variant is picked, so the contrast check
reads it like any other colour: a variant that sets such a colour is refused when its text is under 4.5:1 on the pack's cards.
The labels (the small names over a value, in the tone's grey by default) take the Look's `label-color` in `look.json`'s `t3`:
`{accent}`, `{fg}` or `{muted}` follow that colour, so a variant that changes it recolours them too, or a `#rrggbb`; it is held to
4.5:1 like the text.

The same `t3` block can colour the widgets' **data**, so charts, rings and meters follow the variant too:

- `series-1` to `series-6`: the series colours. A widget whose colour rows follow the theme's Series 1 to 6 (System Overview's
  CPU, GPU, RAM and VRAM, Network Traffic's download and upload, Steam Friends' in-game and offline, Coding Agents' Claude Code
  and Codex, with its heat grid) draws them instead of its own palette.
- `meter-ok`, `meter-warn`, `meter-clip`: a level meter's safe, warning and clip zones. `meter-ok` replaces the theme's **OK**
  on the meters (Audio Meter, Meter Bridge, Volume Mixer, Wave Link), so a pack can keep a green OK for its status lamps and
  draw its meters in the accent.
- `icon-color`: the icons' colour. The app's weather icons take it, and Meteocons are drawn in it as one colour while the
  widget keeps the default icon style.

Each is `{accent}`, `{fg}`, `{muted}`, `{faint}`, `{ok}`, `{warn}` or `{crit}` (the card's own colours, so a variant that changes
one recolours the marks), a `#rrggbb`, or an alias of another T3 colour the Look sets (`"meter-ok": "{accent-ink}"` with
`"accent-ink": "{accent}"` is the accent). A series is held to 3:1 on the cards. A colour you set on a widget, or under **Status &
series colors** in the theme editor, still wins; a Look that sets none draws as before.

A pack's page effects (the `glitch`, `flicker`, `rgb-split` and `interference` overlays, and a layer's `glow`) are drawn in the
screen's accent, so they follow the variant and an accent you pick; the pack's own accent is used only where the screen sets none.

In `pack.css`, real elements may also set `letter-spacing` (`normal` or up to `0.15em`, or the same in px), `text-transform`
(`none` or `uppercase`) and `font-variant-numeric` (`tabular-nums`, `lining-nums`, `slashed-zero` and the like). They are not
animated or transitioned, and font sizes stay the app's. A pack's own CSS animations (`@keyframes pack-*`) run only while the
screen's **Effects** level is **Full**: at Calm and Off, in lite mode and with reduced animations every one of them stops, so a
lamp that pulses in `pack.css` needs no switch of its own.

A pack's `frame` in `pack.json` has `corners` (`square`, `cut`, `bracket` or `notch`) with a `size` up to 20 px (the Cyberspec kit's
largest cut is 18) and a `stroke` up to 2 px, and now also:

- `byCorner`: a kind for one corner, over `corners` and `which`, for example `{"tl": "cut", "br": "notch"}` (`square` leaves
  that corner plain);
- `spine`: `{"edge": "left", "width": 5}`, an accent bar along one edge, 1 to 6 px thick;
- `tab`: `{"at": "tl", "width": 56, "height": 5}`, a solid accent tab on the top or bottom edge at a corner, up to 64 by 8 px;
- `double`: `true` draws a second line 2 px inside the first;
- `alpha`: how strong the lines and the spine are over the card, 0.2 to 1 (the Cyberspec kit's panel line is 0.55); the tab
  stays solid.

A spine, a tab or a second line is drawn only where the card's padding is at least as wide as it is, so it never covers text. For
the same reason a card's ornaments (the small marks and labels in a corner) are drawn only where the padding is more than 10 px,
and a corner ornament keeps clear of a cut corner and of a spine on its side.

### Signing a pack you share

Browse themes shows each imported pack's badge: **Verified by Themely** (Themely ran its checks and a person reviewed these
exact files; it does not mean the pack is safe), **Signed by <publisher>, not reviewed**, **Unverified** (amber), or, in red,
**Changed since it was signed** or **Withdrawn: <reason>**. A changed or withdrawn pack is not used. How the signatures work:
[security.md](security.md#pack-signatures).

To sign a pack you made, so people who trust your key see your name instead of Unverified:

1. Make a minisign key once: `minisign -G -p acme.pub -s acme.key` (or, to try it out, `node tools/packs/sign.mjs --generate acme`,
   which leaves the secret key unencrypted). Keep `acme.key` to yourself.
2. Finish the pack, `version` in `pack.json` included, then sign the folder:
   `node tools/packs/sign.mjs my-pack --key acme.key --password-env MINISIGN_PASSWORD`. This writes `pack.minisig` beside the
   files: a signature over every file's SHA-256, so change nothing after it (sign again after any change, with a higher
   `version`).
3. Share the folder or a zip of it with `pack.minisig` in it, and your `acme.pub`. Whoever imports it adds `acme.pub` in
   Settings › Widget publishers; until they do, the pack shows as Unverified.

An update must be signed with the same key and have a higher version: the app refuses an older version, or another key's, over
a pack it has. A pack's effect script runs only when the pack is verified, signed by a key whose **Allow pack scripts** is on in
Settings › Widget publishers, or when you allow it for that pack; **Pack effect scripts** in Browse themes, or `PACK_SCRIPTS=off`
on the server, turns them all off.

## Widget theme

Look and content preferences can be set once instead of per widget. A theme holds a value for each *themed* setting: the
look sections (Theme, Colors, Widget colors, Surface & effects, Typography, Shape & spacing, Border & glow, custom CSS) and
the content ones (Units & format, Thresholds, Motion). Per-widget content, layout, title, icon, the background image and a
widget's look toggles (the tint, the heat ramp) are never themed, and neither is **Small sizes**.

The levels, lowest first (`resolveStyle`, `src/lib/style-resolve.ts`):

1. the defaults (today's look, so nothing repaints on upgrade);
2. **Screen** - the screen's theme, with per-section locks;
3. **Page** - a page's theme: per section, follow the screen or use the page's own values;
4. **Widget** - each section follows or is custom (see below).

Items in a panel follow the panel (the panel's own resolved look), which follows the same levels.

### Follow or customise

A widget section either follows the theme (the default) or is custom. Its [inheritance chip](#where-the-options-are)
switches it: **Customise here** unlocks the rows at the theme's values, **Reset to inherited** follows again and keeps the
widget's own values stored. Editing a themed row of a following section is not possible; customise it first. Panels saved
by earlier versions keep their card and accent as their own values: those sections open as *Custom here*.

A screen can **lock** a section: every widget on every page then follows it, the widgets' chip becomes *Locked by Screen*
and their own values stay stored, inactive. Locking is screen-only; a locked section is the screen's on a page too. A
locked **Colors** section also overrides a panel's own item colors where the panel gives way (fills take the accent).

The source dot of a row says where its value comes from (hover it for the explanation):

- no dot - the default;
- blue dot - set here (on this widget, or in the scope being edited);
- violet dot - from the screen's theme;
- blue dot with a ring - set here, overriding the theme.

Clicking a dot that is set here resets it: the option falls back to the theme (or the default).

### Theme editor

Theme is a view of its own (see [Skins and saved themes](#skins-and-saved-themes)). Open it from **Theme** in the sidebar,
**Edit in Theme** on a screen or page, a chip's **Edit ‹level›**, **Edit theme** on the canvas, or **Theme** in the command
palette. At a screen the fine-tune sections can be locked; at a page each follows the screen or is **Changed here**. A widget
that does not follow (a custom section) is listed by the preview's tags, and **Make all follow** puts every one on the page
back on the theme.

### Thresholds

One control per quantity: a zone bar (green, amber, red, widths from the
values) and a **Warning** and a **Critical** slider; critical never goes below
warning, and **Off** disables a level. The quantities and their theme
defaults:

| Quantity | Unit | Warning / Critical |
|---|---|---|
| Load | % | 80 / 92 |
| Temperature | °C, shown in °F when the temperature unit is °F | 80 / 90 |
| Fullness | % | 85 / 95 |
| Audio level | dB | -9 / -2 |
| Value | the sensor's unit | off (SensorValue, Sensor group) |

A widget lists the quantities it draws. Thermals has **Use sensor limits** (on
by default): each sensor's own limits instead of fixed levels. A panel item
follows the panel's levels for its quantity, and is off until a theme level
sets them.

## General settings

Preferences that are not a look are in the Settings window (the sidebar's
**Settings**): **Dashboard** applies to every screen, in the kiosk and in the
studio, and is saved on the server the moment it changes; **Studio** is this
device's editor preferences.

**Settings › Dashboard**

- **Performance** (*Default for all screens*) - **Frame-rate cap** (5, 15, 30,
  60 or No limit) and **Animations** (*Follow system*, *Reduced*, *Full*): a
  screen can override either in Screens, and the list under each shows the
  screens that do (with **Reset** and **Screens ↗**). *Follow system* uses the
  operating system's *reduce motion* setting; *Reduced* shows a background
  video's poster instead of the video and lets the meters and waveforms repaint
  less often. **Refresh kiosk pages** reloads them once a day at 04:00 to give
  back memory. **Ring glides**, **Limit blur** (caps a widget's blur at 12 px),
  **Blur inside widgets** and **Live graph glow** trade looks against the cost
  of drawing them.
- **Clock & date** (*All screens and the island*) - **Clock**: *Locale* (the date
  locale decides 12 or 24 hours), *24 h* or *12 h*; **Show seconds** (on by
  default); **Date locale** - *System* or one of the listed locales (for example
  *Deutsch (Deutschland) · de-DE* writes *Mo., 12.10.2026*). These shape the
  panel **Clock** widget; the last-update time in the dashboard header follows the
  clock format and locale (always with seconds). Durations, such as a track's
  elapsed time, are not clock times and don't change.
- **Kiosk** - **Page dots & swipe** and **Hide cursor** (no mouse pointer on kiosk
  pages, `?kiosk=1`; the studio and the normal dashboard page keep it).
- **Danger zone** - **Reset everything...**, after an offer to back up first.

The **Page font** is a look: it is in Theme › Fine-tune › Text, from the [font
catalog](#fonts). Every widget whose **Font** is *Theme* uses it; a Font set on
the widget, or in the global style, still wins. The **Data API URL** is in Data ›
Connection.

**Settings › Studio** (kept per browser, not in the config) - **Quick bar**
shows or hides the [quick bar](#the-quick-bar) (on by default); **Inspector
sections** is **One open** (default) or **Many open**; **Advanced settings**
shows every inspector setting, including ones the theme controls; **Default
zoom**, **Design preview data**, **Show grid**, **Show rulers**, **Left panel
width**, **Widget list** and **Preview on hover** set the canvas and the Add
panel.

Dashboard changes are saved at once and are not part of the undo history.

## Fonts

The page font (Theme › Fine-tune › Text) and every widget's **Font** option offer the
same catalog (`src/lib/fonts.ts`): *System* (the browser's default), *Sans*,
*Rounded*, *Serif* and *Mono* (the original system stacks, whose ids saved
configs keep) and Google Fonts: Inter, Geist, Roboto, Manrope, Outfit, Space
Grotesk, IBM Plex Sans, Nunito, Rajdhani, Orbitron, Oswald, JetBrains Mono and
Fira Code. A Google font is downloaded the first time something uses it and
always has a system fallback, so a kiosk without internet still renders (in
the fallback). The studio's own chrome is a separate matter: it uses Geist and
Geist Mono and does not follow the dashboard font.

## Grid spacing: gap and padding

Each screen has its own spacing, in Screens › Grid:

- **Gap** - the space between zones. Empty means 12 px, the spacing
  every screen had before.
- **Edge padding** - the space between the page edge and the grid. Empty
  keeps the page's defaults: an 8 px inset on a *Fill* kiosk page (none
  with *Touch the display edges* on), 12 px on
  the normal dashboard page of a *Fill* screen (next to the
  header) and 24 px for *Scroll* screens.
- **Corners** - a 0-1.5 rem slider in Theme › Shape & spacing, for the
  screen's widgets. A screen that has not set one uses the dashboard's
  radius. It rounds every widget's outer card (panels use it too); a widget's
  own Corner radius (px) still wins.

Both take 0 to 200 px in the box; a 0-64 px slider beside each box rests on
the default while the box is empty. The studio canvas draws the profile at its design
size with the same gap and padding (as the kiosk page shows it), and
drawing, moving and resizing zones, the column guides and the selection chip
all follow the gap. A gap of 0 makes the zones touch; with no card surface
(for example a transparent surface) that turns the grid into one seamless
page.

## Pinned widgets

A screen can pin widgets to its edges (config format 20): the page rail on the left, a now-playing
bar along the bottom, an agents panel on the right. They are the same on every page, and a page
change or a swipe leaves them where they are. Pin them in Edit: **Pinned** in the top bar shows the
layer, **+** in its list pins a widget, and the inspector sets its pages, edge, size and whether it
makes room; **Edit rail items** sets a rail's buttons. They are stored under the screen's `pinned`:

```json
"pinned": {
  "items": [
    {
      "id": "now-bar",
      "edge": "bottom",
      "mode": "room",
      "thickness": 84,
      "inset": 12,
      "show": "all",
      "visible": true,
      "placement": { "id": "now-bar-w", "module": "NowPlaying", "settings": { "showHeader": false } }
    }
  ]
}
```

- **edge** - `left`, `right`, `top` or `bottom`.
- **mode** - `room` (make room): the page loses the widget's thickness and inset on that edge and
  its zones lay out in the space left, as with the Dynamic Island's **Reserve space**. `float`:
  the widget lies over the page, which keeps its whole size.
- **thickness** - the widget's size across its edge, in px; **inset** its distance from the
  screen's edge (unset: none). A widget on the left or right runs the full height, less its inset
  at the top and bottom; one on the top or bottom runs between them, lined up with the zones.
- **show** - `"all"`, or `{ "pages": ["<page id>", …] }` for some pages only. A page with
  `"hidePinned": true` shows none of them and gets its whole screen back.
- **placement** - the widget, as a zone stores it but without its cells: its `module`, `settings`
  and so on.

Several widgets on one edge stack outwards from it in the order listed. The studio's canvas draws
them as the kiosk does, with the page laid out in the space they leave. **Use on every profile of
this size** copies a screen's pinned layer to the other screens of its size, replacing theirs, a
page it names going to the page in the same place there. A pinned widget sent to the Dynamic Island
feeds it as one on a page does.

### Pinned in place

**Pin here** on a widget's right-click menu (config format 21) pins it on the cells it is on. It
keeps them on every page it shows on, and the pages lay out around them: placing, moving and
resizing a widget treat those cells as taken. Pin several side by side for a strip that stays put.
Such a widget is stored with `at`, its cells in the screen's grid, instead of an edge:

```json
{
  "id": "cpu-pin",
  "at": { "colStart": 1, "rowStart": 1, "colSpan": 4, "rowSpan": 1 },
  "show": "all",
  "visible": true,
  "placement": { "id": "cpu-w", "module": "SensorValue" }
}
```

Every page of a screen shares its grid, so the cells mean the same place on each page; they count in
the page area the edge widgets leave. Cells past the grid are moved back inside it when the screen
loads, and changing the screen's columns or rows is refused while a pinned widget would fall
outside. A widget already on those cells on a page is drawn under the pinned one and listed with
**Move** in its inspector. A format 20 version can't open a format 21 screen.

### The page rail

The **Page Rail** widget is a column of your pages and actions. Pinned to the left or right with
`"thickness": 84`, it shows the profile chip, one button per page with the page's icon, the page
lock (**Auto** while the pages rotate, **Locked** while they stay) and the Clock at its rail preset,
the time over the short date. The page shown is marked in the Look's accent. Below 580 px of height
it uses smaller buttons, never under 48 px. Its options turn off the chip, the page lock and the
clock.

With no `rail` list it shows every page. A `rail` list beside `placement` picks and orders its
buttons instead (Edit's **Edit rail items** writes it):

```json
{
  "id": "rail",
  "edge": "left",
  "mode": "room",
  "thickness": 84,
  "show": "all",
  "visible": true,
  "placement": { "id": "rail-w", "module": "PageRail" },
  "rail": [
    { "id": "keys", "group": "pages", "target": { "kind": "page", "pageId": "<page id>" }, "icon": { "from": "set", "name": "key-grid" } },
    { "id": "agents", "group": "pages", "target": { "kind": "page", "pageId": "<page id>" }, "icon": { "from": "set", "name": "bot" }, "badge": { "when": "agents-waiting" } },
    { "id": "mic", "group": "actions", "name": "Microphone", "target": { "kind": "action", "action": { "op": "audio", "body": { "target": "windows", "op": "mute", "kind": "input", "id": "<device id>" } } }, "icon": { "from": "set", "name": "mic-off" } }
  ]
}
```

- **group** - `top`, `pages`, `actions` and `widgets` are drawn in that order with a line between
  groups; `bottom` sits at the foot, above the page lock.
- **target** - a `page`; the `profile` (a logo slot, which opens the profile picker);
  an `action`: `page` (an id, `next` or `prev`), `lock` (the page lock), `profile-picker`, `audio` or `obs` (the same
  requests the Audio and OBS buttons send, refused from another computer as theirs are), or `media` with a `key` of
  `play-pause`, `next` or `previous` (the PC's media keys, guarded the same way); or a
  `widget` with `module` and `settings`, drawn 72 px wide (a widget whose preset is a rail preset,
  such as the Clock's **Rail**, one of your recipes with a rail preset, or a code widget that offers itself for the
  rail).
- **icon** - `{ "from": "set", "name": … }` takes a page icon (the page icon picker's names, with
  `key-grid`, `keyboard` and `mic-off`); `{ "from": "image", "asset": … }` an uploaded PNG, WebP,
  GIF or SVG (an SVG is sanitised when it is uploaded, up to 256 KB), in its own colours unless
  `"tint": true`; `{ "from": "app", "exe": "Chat.exe", "asset": … }` a program's own icon, which
  the studio asks the server to read from the program (running, installed or on PATH, Windows only)
  and stores as a PNG (with no `asset` it draws a window); `{ "from": "text", "text": … }` a word.
  **shape** (`as-is`, `rounded`, `circle`) rounds an image, **label** writes the name under the
  icon, and **name** is what a screen reader says. An image's alt text is the name and what a tap
  on it does ("Hexmark logo, opens profiles").
- **plate** - on a logo (a `profile` item with an image): `none`, `card` (the card colour) or
  `contrast` (the text colour, which keeps a light logo seen on a light Look). Unset, the rail picks
  one from the image: `none` for an image that fills its square, `contrast` for one whose marks
  would fade into the rail, else `card`.
- **badge** - `agents-waiting` (a dot while an agent needs you), `alerts` (a dot while an alert is
  shown; on a page button, one that goes to that page) or `obs-live` (**LIVE** while OBS streams).
- **touch** - what a `tap`, `hold` (600 ms) or `doubleTap` does, each an action as above; a tap
  does what the target is unless it says otherwise.

### Touch actions on any widget

Any widget, on a page, pinned or in a rail's widget slot, can run an action when you tap it, hold
it (600 ms) or tap it twice: its placement's `touch`, set in the inspector's **Behaviour › Touch**
(a pinned widget's **Touch**). The actions are the rail's above: a page, the next or previous
page, the page lock, the profile picker, a media key, a mute of one of this PC's audio devices,
an OBS scene or the OBS mic. Two more are listed after them, and run only once they are turned on in
**Settings › Actions** (see [Keys and commands](#keys-and-commands)): **Run a command…** and **OBS: go live or stop**.

```json
{ "id": "cpu", "module": "CpuMonitor", "colStart": 1, "rowStart": 1, "colSpan": 2, "rowSpan": 2, "visible": true,
  "touch": { "tap": { "op": "page", "to": "next" }, "hold": { "op": "media", "key": "play-pause" } } }
```

A press that starts on the widget's own controls (a button, a slider, a link) stays theirs, so an
Audio Button with a hold action still mutes on a tap, and a drag is still the page's swipe. With a
double tap set, a tap waits a moment to tell the two apart. Enter or Space on a focused widget is a
tap. Actions run on the kiosk only; nothing runs in the studio's canvas. `POST /api/media/act`
(`{ "key": "next" }`, the `X-Dashboard-Control` header) presses a media key on the PC; like the audio
and OBS requests it is refused from another computer unless remote editing is on.

Your own widgets go in a rail too: in the Widgets page builder's **Presets** tab, **Use in the
page rail** turns a preset into a rail preset (`"size": "rail"`, recipe format 2), which the stage
then draws in a rail slot's box, and the rail editor lists it under **Widgets**. A code widget
offers itself with `rail: { settings }` in its definition.

### Keys and commands

The **Keys** widget is a grid of keys built on the press-button tile: each key has a name, an icon
(from the icon set, an image or text), a colour from the series, and a tap, a hold and a double
tap, the same actions as above. One dot in a key's corner means it has a hold, two a double tap;
**Legend** (Grid) says so in the header, and **Columns** fixes the grid (0 picks it from
the widget's shape). A key with `keys` of its own is a folder, one level deep: a tap opens it and
**Back** leaves it. When the widget is too small for every key at a finger's size (48 px), it shows
the keys that fit and a **More** key that steps through the rest. The inspector's **Key list**
adds, orders and edits them, at most 48 a level. Enter or Space on a focused key is pressed as a
finger is: held for a hold, twice for a double tap.

```json
{ "id": "k", "module": "Keys", "colStart": 1, "rowStart": 1, "colSpan": 4, "rowSpan": 2, "visible": true,
  "keys": [
    { "id": "notes", "name": "Notes", "icon": { "from": "set", "name": "file-text" },
      "touch": { "tap": { "op": "run", "command": "notepad.exe" } } },
    { "id": "lock", "name": "Lock PC", "icon": { "from": "set", "name": "lock" },
      "touch": { "hold": { "op": "run", "command": "rundll32.exe user32.dll,LockWorkStation", "confirm": true } } },
    { "id": "apps", "name": "Apps", "keys": [ { "id": "calc", "name": "Calc", "touch": { "tap": { "op": "run", "command": "calc.exe" } } } ] }
  ] }
```

A command (`{ "op": "run", "command": "…" }`) starts a program on the PC running InfoPanel Studio.
It is off three ways until you say otherwise:

- **Run commands from the panel** in **Settings › Actions** (`ACTION_RUNNER=on` for the server
  alone) turns the runner on, after a restart.
- Each command runs only once it is approved, word for word, on that PC: under the command in the
  Touch rows, in **Settings › Actions › Commands**, or in the review the studio shows after you import
  a screen that names commands. Approvals stay on the PC; a screen file never carries one.
- A run comes from that PC's kiosk unless **Allow editing from other devices** is on.

The command is not passed to a shell: spaces separate the program and its arguments, double quotes
group (`"C:\Program Files\App\app.exe" --flag`), `""` inside quotes is a quote, and `&`, `|`, `>`
or `%VAR%` are plain text. To use a shell, name it: `cmd.exe /c …` or `powershell.exe -Command …`.
`"confirm": true` (**Hold to confirm**) makes the kiosk show the whole command and wait for a 0.6 s
hold before it runs; a hold on the key itself counts as that hold. **Test mode** in Settings ›
Actions, or **Test** under a command, checks everything and starts nothing, and the kiosk says what
would have run. **Settings › Actions › Log** lists every run, refusal and failure.

**OBS: go live or stop** (`{ "op": "obs", "body": { "op": "stream", "state": "toggle" } }`, or
`start` or `stop`) needs **Go live and stop in OBS from the panel** in Settings › Actions
(`OBS_STREAM_CONTROL=on`), and always asks for the hold. The security model has the details: see
[security.md](security.md) under "Running a command".

### Profiles that follow the app in front

Tap or hold the rail's profile chip to open the profile picker: the screens of the display's size,
the current one, and **Matches now** on one whose program is in front. A screen's programs are its
`autoSwitch` list (Screens › **Switch with the app in front** writes it); unset, the screen is
never chosen by itself:

```json
"autoSwitch": { "exe": ["Code.exe", "WindowsTerminal.exe"] }
```

On Windows the server reads the program in front once a second, only while some screen has such a
list, and picks the first screen of the shown one's size whose list names it (by file name, any
case, `.exe` optional). It shows it through the same override the Stream Deck's profile switch
uses, and takes it back when no list names the program in front. The program in front is published
to kiosks as `front` in `/api/control`, as a file name, while a list exists. The desktop app's own
windows never count, so touching its kiosk on this PC doesn't switch it; a kiosk in a browser on
this PC is that browser, which takes back an automatic switch unless a list names it.

**Lock to** sends `POST /api/control/auto` with `{ "state": "off", "profile": "<id>" }`: the
override, with switching paused, whatever is in front. `{ "state": "on" }` resumes it (and applies
the program in front at once), `"off"` pauses it and `"toggle"` flips it; `autoPaused` in the state
says it is paused. The route takes the same `X-Dashboard-Control` header as the other control
routes. A kiosk link with `?profile=`, or a display assigned a screen, keeps its screen.

### Swiping beside pinned widgets

With **Page dots and swipe** on, a page that fills the screen follows your finger: drag it and the
next page comes in beside it, under the pinned widgets, which stay still. Let go past a quarter of
the page's width, or flick, and it moves on; short of that it springs back. With reduced motion, or
on a page that scrolls, a swipe changes the page at once, as before.

## Styles, Copy, Paste and Make this the theme

The Style tab's toolbar and the zone menu work on a widget's look-only options:

- **Copy style** remembers the selected widget's style; **Paste style**
  replaces another widget's style with it. Paste replaces the style as a whole:
  options the copied style does not set go back to the theme or defaults, the
  widget's content settings are untouched, and options the target widget does
  not have are skipped.
- **Start from a saved style** lists the built-in Styles and your saved ones and
  applies one (same replace rules as Paste). **Save as style** asks for a name
  and stores the widget's style in Library › Styles; **Update ‹name›** writes
  the widget's look back into the Style it was built on. Styles are saved in
  the config and are shared by all screens.
- **Make this the theme for…** makes the selected widget's custom sections
  the theme of **This screen** or **This page**.

For a whole screen's look, see [Skins and saved themes](#skins-and-saved-themes).

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

## Dynamic Island

A pill at the top centre of a profile, like the macOS notch. When idle it shows the
time; on kiosk pages (`?kiosk=1`) it springs open for alerts and notices, then shrinks
to a badge while an alert lasts. The plain dashboard page shows the idle pill only.

Turn it on per screen in **Alerts & Island › Island** (pick the screen under **Island for**); a
screen's detail in Screens links to it. The tab also gathers what sends to the island:

- **Widgets** - every widget on any page of the profile that can send to the island, with its
  *Send to island* switch. Click a name to show the widget on the canvas (switching page) with
  its settings open. A hidden widget sends nothing, and when two zones hold the same widget only
  the first sends. Below the list, the island widgets the profile does not have yet.
- **Alert rules** - the rules that show on this profile's island (display style *Island*).
  Click one to edit it under Rules.

**Shape**

- **Style** - *Pill* floats below the top edge; *Notch* sits on the top edge with curved
  corners, like a laptop notch.
- **Size** - S, M or L, and **Scale** (80-150%) for anything in between. A short profile or a
  small screen gets a smaller size automatically: the open island never takes more than 40%
  of the page height.
- **Offset from edge** (the pill only) - 0 to 64 px.
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
- **Shadow**, **Font** (a link to Theme: it shows the page font unless the island keeps its own; **Follow Theme** puts it back) and **Weight**.

**Clock** - **Clock format** shows the hours (24 h or 12 h) and seconds of *Settings ›
Dashboard › Clock & date*; **Follow the Dashboard** puts back an island that keeps its own.

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
- **Preview** - shows the island on the canvas as it looks when **Idle**, with a **Notice** or with an **Alert**.

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
the PC. In the desktop app, turn on **Settings › Coding agents**: the app backs up
`~/.claude/settings.json` and `~/.codex/hooks.json`, then adds its hooks with a dated backup of
each file. Your own hooks stay; your statusline keeps printing, wrapped by the forwarder
(`ips-agent.exe`). In Codex, run `/hooks` and approve the new hooks. Turning the setting off,
or uninstalling the app, takes them out again. The hooks post to
`http://127.0.0.1:3922` (set `DASHBOARD_URL` for another port) and never slow an agent
down: with the dashboard closed they give up after a second.

Settings › Connections sets them up. Both run on the
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

## Desktop app

In the **InfoPanel Studio** desktop app (see [desktop/README.md](desktop/README.md)) the studio is the same, with these differences:

- The top bar is the window's title bar. Drag it by its empty space, double-click it to maximize, and use the minimize, maximize and close buttons at its right end. Close hides the app to the tray; the server keeps running, so the kiosk page keeps updating.
- **Settings**, at the foot of the sidebar, opens the Settings window (in the desktop app and in a browser alike; the App pages are the app's own): app zoom, start at login, open the studio on launch, close to tray, where the server listens (this computer or the local network; the port; extra allowed host names), updates, the **Coding agents** toggle, debug mode, logs and the changelog.
- **Coding agents:** turning the toggle on writes the Claude Code and Codex hooks for you (with backups), using the app's `ips-agent.exe` and the current port. Turning it off, or uninstalling the app, removes them. In Codex, still run `/hooks` once to approve them.
- **Export & back up…** and the Import door use the system Save and Open dialogs. Import merges as before and is one undo step.
- Pending edits are saved before the window hides or the app quits.

## Widgets with no data

A widget with no data at all is hidden in the kiosk. (The old **Hide when idle**
option was removed; a stored value is ignored and the widget stays shown.)
