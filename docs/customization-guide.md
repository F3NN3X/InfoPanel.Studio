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
│R │ Layers |   │ canvas                        │ (docked: 320 px)│
│a │ Add        │                               │                 │
│i │ (Design    │      [ floating zoom bar ]    │                 │
│l │  only)     │                               │                 │
└──┴────────────┴───────────────────────────────┴─────────────────┘
```

Shown docked (studio 1100 px or wider). Narrower, the inspector floats over
the canvas or becomes a bottom sheet, see [Inspector
placement](#inspector-placement-docked-floating-bottom-sheet).

The bar along the top holds, from left to right:

- the **screen / page switcher** - the active screen's name with its design
  size; click it to switch to another screen or page. The gear beside it
  opens [Screens](#screens) at that screen;
- **Search settings or run a command** (**Ctrl + K**) - the [command
  palette](#undo-shortcuts-and-the-command-palette);
- **Undo** and **Redo** (see [Undo, shortcuts and the command
  palette](#undo-shortcuts-and-the-command-palette));
- **Import** and **Export** - the Import door brings a config, a screen, a
  `.infopanel` profile or an asset in; **Export & back up** writes the whole
  config (or one screen) out;
- **Live** - control the kiosks now: show a page, **Rotation**, **Mute alerts
  for 1 h**, **Dynamic Island**, **Dim screens**, **Reload all kiosks** and
  **Open kiosk view** (leave the studio);
- **Save**. Changes are pushed to the server automatically; **Save** flushes
  them at once, and the small dot on it means "edits not pushed yet".

On a phone Undo / Redo, Import, Export and Live move into a **...** menu.
**Reset everything...** (restores the default dashboard after a confirmation:
it wipes every screen, the theme, the styles and all widget settings; it
offers a backup first) is in Settings › Dashboard › Danger zone, the shortcut
list is in Help (and **?**), and the build id is in Settings › App › About.

The **icon rail** (72 px, labelled; 48 px under 960 px) at the left opens one
full view at a time: **Screens**, **Design**, then **Theme**, **Library**,
**Gauges**, **Alerts & Island** and **Data**. **Help** and **Settings** sit at
its foot; Settings opens its own window. Only **Design** has the canvas, the
left panel and the inspector; the other views take the whole page and are
described in their own sections. **Library** (your saved images, fonts, gauges, panels, Themes, Styles and imported InfoPanel canvases) and **Gauges** (design a Custom gauge or edit a screen's) replace the canvas; **Import** and **Export** in the top bar bring an `.infopanel` profile in as a canvas zone and write one out. They are described in [architecture](architecture.md#importing-and-exporting-an-infopanel-profile) and [docs/infopanel-import](infopanel-import/PLAN.md).

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

In Design, a left panel beside the rail has two tabs, **Layers** and **Add**
(its width is Settings › Studio › **Left panel width**: Narrow, Default or Wide).

- **Layers** - every zone of the screen's page, with an icon for its type (the
  widget's own, a panel, or a blank zone), its name, a paint-brush when it has
  its own look and its size in cells. Click a row to select the zone and
  scroll it into view; **Shift / Ctrl-click** adds or removes it from the
  selection; right-click opens the zone menu. The eye hides or shows it and
  the bin removes it. Hidden zones are dimmed but stay selectable (and do not
  show in the kiosk).
- **Add** - every widget, panel and layout, with a search box and the kinds
  **Widgets | Panels | Layouts**; Widgets also has category chips (System,
  Hardware, Storage, Network, Media, Audio, Info, Gaming, Generic), and Panels
  lists your saved panels under My panels (see
  [Creating a panel](#creating-a-panel)). **Drag** a card onto the canvas -
  a dashed ghost shows where it lands, or **No room** in red - or **click** it
  to place it at the first free spot. With a blank zone selected, a click
  fills that zone instead. The numbers are the minimum zone size in grid
  cells, and a badge counts how often a widget is already on the page.
  *Other sensors* is listed here too, under Generic. **Widget list** and
  **Preview on hover** in Settings › Studio set the list's density and
  whether hovering shows a preview.

The other views are pages of their own:

- **Screens** - see [Screens](#screens).
- **Theme** - see [Theme editor](#theme-editor).
- **Data** - the Data Explorer (see [Data Explorer and
  binding](#data-explorer-and-binding)).

### Screens

**Screens** lists the monitor profiles as cards (a thumbnail, the size, the
grid and page count). Click a card to select it for editing: it is the screen
Design, the page tabs and the canvas follow, and it never changes what the app
opens on. **When the app opens** is a choice between **Best fit for the window**
(the screen closest to the kiosk window's size; the card tagged *Best fit now*)
and **Always the same screen** (tagged *Opens on launch*). A card's **...** menu
has **Rename**, **Duplicate**, **Always open this one**, **Export screen** and
**Delete** (not the last screen). **New screen** adds one for the current window
size; **Import a screen...** reads a screen file.

The selected screen's detail column holds **Size & fit** (a **Size preset**,
**Width** and **Height**, **Match this window**, and **When it doesn't fit**:
Fill or Scroll), **Grid** (**Columns**, **Rows**, **Gap** and **Edge padding**,
see [Grid spacing](#grid-spacing-gap-and-padding)), **Rotation** (**Rotate
pages** and **Every** n seconds), **Performance** (**Frame-rate cap** and
**Animations** for this screen, with a chip saying whether it inherits
Settings › Dashboard's), **Linked - edited elsewhere** (links to this screen's
look in Theme and its Dynamic Island in Alerts & Island) and **Pages - order &
rotation** (drag pages into order, **+ Add page**, and a switch per page for
whether it is in the rotation).

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
**Change widget...**, **Edit style**, **Bind data...**, **Save as Panel**
(panels), **Duplicate**, **Hide / Show**, **Move to page**, the size steps **Narrower / Wider /
Shorter / Taller** (a step that would run into a neighbour or past the grid
is disabled), **Copy style**, **Paste style**, **Follow the theme**,
**Deselect** and **Delete**. With several zones the widget-only rows and the
size steps are left out. Right-click empty canvas for **Add widget...**,
**Select all**, **Zoom to fit**, **Edit theme** (opens Theme) and
**Keyboard shortcuts**.

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
  open any view (Screens, Design, Theme, Library, Gauges, Data, Alerts & Island
  and its tabs, Settings and its pages), the Add or Layers panel, toggle the
  grid, zoom, save, export, import, undo, redo, **Open Live**, the shortcut
  list, **Theme**, **Theme › Background**, **Theme › Typography**,
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
is in flight only Esc (cancel) works. Outside Design the canvas keys are off.
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
**Search all settings** box and a **Changed N** toggle share one row below it.

**Tabs.** A widget or panel zone has **Show**, **Style**, **Data** and **Behaviour**
(Show: what is on the widget; Style: how it looks; Data: where the values
come from and how they are written; Behaviour: how it reacts and what it
tells you). A small pill on a tab counts the options set on this zone, and
a tab with no sections is dimmed and skipped. The open tab is remembered per
kind of selection. A blank zone and a multi-selection have no
tabs. **Search** looks through all tabs at once: the tabs give way to the
matching options, each section labelled with its tab, and a line says "N
matching settings". It covers labels, keys and option names, and the custom
cards by title and keywords; **Esc** clears it, and `No settings match "q".`
says when nothing matches. **Changed** lists only the values set on this zone,
across every tab ("N changed settings", with **Reset all**); when there are
none it says "Nothing changed yet. Everything uses its default."

**Sections.** The sections are an accordion with sticky headers: icon, title
(and the tab name while filtering), the number changed, a chevron and a reset
button that restores just that section's options. Settings › Studio ›
**Inspector sections** chooses **One open** (the default) or **Many
open**. The Style tab's toolbar (**Start from a Style**, **Save as Style**, **Make this the theme for...**) sits above its sections. A short hint sits behind an **i** icon on a
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
Search and **Changed** always include the More rows, expanded.

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
  - *Show*: **Header** (**Show title**, which off hides the title everywhere
    the widget shows it, **Title** and, under More, **Icon**; a widget that
    draws no header, or only a title, has fewer rows), the widget's own
    sections (for example Media: *Player*, *Visualizer*; System: *Sections*,
    *CPU*, *GPU*, *Memory*, *Drives*; Weather: *Forecast*, *Current
    conditions*) and **Fit** (**Small zones**: Auto, Full, Card or Dense,
    with Card only where the widget has a summary card; **Density** under
    More).
  - *Style*: **Skin** (**Skin**, **Ring / bar thickness**; **Graph
    style** and **Meter style** under More, see [Skins and
    variants](#skins-and-variants)), **Colors** (**Accent color**, **Text
    color**, **Secondary text color**), **Widget
    colors** (the widget's own colors, each standing for a palette color such
    as *Series 1* or *Critical*, plus look toggles such as the tint),
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
- **Panel zone** - *Show*: **Panel** (Visual or Code, Fill or Hug, gap,
  padding), **Layout** (Stack / Grid / Overlay options), **Background**
  (Overlay only), **Widgets**; *Style*: the same look sections as a widget;
  *Data*: **Sensors used** by its widgets. With a widget selected the
  inspector shows [that item's own four tabs](#editing-widgets) instead.
- **Blank zone** - **Widget** with a **Pick a widget** button, and **Zone
  frame**.
- **Several zones** - only the shared Style sections, with the chip of the
  primary zone.
- **Nothing selected: the Page inspector.** Click empty canvas or press
  Esc. It shows the page being edited: its **Name** and **Icon**, a
  **Rotation** link to [Screens](#screens), **This page's look** (the
  sections the page customises over its screen's theme, with **Edit in
  Theme** and **Customise a section...**), **Live** (**Show on kiosks now**)
  and **Duplicate page** / **Delete page**. A screen's size, grid and
  rotation are in Screens, the look every level inherits in
  [Theme](#theme-editor), preferences in [Settings](#general-settings) and the
  Data API URL in Data.

"Auto" or an empty value always means the widget's own look.

### Data Explorer and binding

The **Data** view replaces everything right of the rail with the Data
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

- **Gap (px)**: space between the widgets, and **Padding (px)**: space
  inside the panel's card. Empty (auto) uses *Size & spacing*, then
  the layout's own spacing.
- **Fit in zone**: **Fill** (default) stretches the panel over the whole
  zone; **Hug** shrinks it to its content.

Switching from Stack to Grid drops Spread (a grid has no free space to
spread over); everything else carries over, so switching back restores the
stack.

### Alignment at two levels

1. **The panel in its zone.** A panel fills its zone unless **Fit in zone**
   is **Hug**. A hugging panel is placed by the zone's own alignment, the
   3×3 picker in *Size & spacing* (left / center / right × top /
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
  - *Show*: **Kind** (chips; **Change kind** keeps the label, sensor, unit,
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
Size & spacing value and then the built-in spacing as fallbacks:

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

The **Skin & graphics** section (Style tab) restyles a whole widget, not just its colors.
It resolves like every other look setting: you can set it once for the
profile or a page (the [widget theme](#widget-theme)) and let widgets follow it.

- **Skin** (Skin & graphics) - Auto, or one of fourteen, each with its own fonts, corner
  radius, header and graph and meter style: `default` (studio card), `tui`
  (btop-style terminal), `macos`, `fluent` (Windows 11), `hud` (sci-fi HUD),
  `ink` (monochrome editorial), `retro` (CRT terminal), `ios`, `android`
  (Material You), `synth` (synthwave), `cyber` (cyberpunk), `nixie`, `brutal`
  (neo-brutalist) and `instrument` (instrument rack). A skin brings its own
  card (see below) unless you pick a surface under *Surface*,
  and its own accent unless you set an accent. Its fonts load on first use; offline, the widget
  falls back to the standard stack. **Font** under *Typography* overrides the
  skin's fonts.
- **Small zones** (Fit, Show tab) - what the widget draws in a small zone.
  *Auto* swaps a zone of 1 x 1, a one-row strip or a one-column zone to a
  summary card of tile, strip or column form; *Full* keeps the full layout at
  any size; *Card* shows the summary card at any size (a wide zone gets the
  strip form, otherwise the tile form) and is offered only by widgets that
  have one; *Dense* draws a dense summary of the same data (a headline
  value, a trend and a few rows), or the card where the widget has no dense
  view. **Density** (under More) picks the size tier of the layout. Small
  zones belongs to the zone's shape, not its look, so no theme sets it.
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
radius (Theme › Shape & spacing, at the screen) rounds every widget's outer card; a widget's own Corner
radius wins.

## Colors and type

- **Accent color** (in *Colors*) tints the widget's main fill,
  such as the progress bar or the big temperature; each widget decides where
  it lands.
- **Text color** and **Secondary text color** override the surface's text.
- **Font** (Theme, or any font of the [catalog](#fonts)), **Value weight** and **Label
  case** (UPPERCASE, as written, Capitalized). *Theme* uses the page font,
  which is the **Page font** in Theme › Typography (see [General settings](#general-settings)).
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
**Theme** and its **Background** card (or **Theme › Background** in the command
palette). The studio canvas shows the background as the kiosk will,
with the dotted grid drawn over it.

The scope bar at the top of Theme chooses what you edit:

- **All screens** - the dashboard's background, shown on every screen that
  has none of its own. **None** turns it off: the theme's background color
  shows.
- **A screen** - that screen only. The card's chip says **From All screens**
  until you **Customise here**, which gives the screen its own (it starts as a
  copy of the dashboard's); **None** shows no background on this screen even
  when the dashboard has one; **Reset to inherited** hands it back.
- **A page** has no background of its own; the card links to the screen's.

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

## Skins and saved themes

Theme holds ten cards (Colors, Typography, Shape & spacing, Surface & effects,
Border & glow, Background, Units & format, Thresholds, Motion and Advanced) under
**1 · Start from**, at the scope the scope bar names (All screens, a screen or a
page).

**Start from** lists the **Saved themes**, the six **Palettes** (Zinc, Neutral,
Slate, Ocean, Forest, Paper) and the fourteen **Skins**. Click a skin to apply
it to the scope and set the surface to Auto; that is one undo step. The nine
built-in looks of earlier versions (Dark, Light, Glass, Frosted, Matte, Neon,
Minimal, Ocean, Forest) are gone: their parts live in the skins, the palettes,
**Opacity** and **Blur** (Surface & effects) and the page background.

**Surface & effects** has, in order, **Surface** (Auto and the sixteen surfaces,
see [Colors and type](#colors-and-type)), **Opacity** (0-100 %), **Blur** (Off,
4, 8, 16, 24, 40; it needs an opacity under 100 % and frosts a page image or
video behind the cards) and the **Skin** rows. **Colors** has the editable color
tokens (six shown, seven more under More), then the widget colors. All of them write the scope's
style, so a widget can still set its own. The corner radius is **Corners** in
**Shape & spacing** (see [Grid spacing](#grid-spacing-gap-and-padding)).

**Apply a theme here...** in the top bar applies a **Saved theme** or a palette to the
scope. What a saved theme changes depends on the scope:

- **All screens** - the dashboard's theme colours, corner radius and style
  (replaced as a whole, so nothing of the previous look is left over).
  Screens with their own theme colours or style keep them (see the list
  below).
- **A screen** - this screen's own theme colours, corner radius and
  style; the other screens keep theirs. Options the dashboard style sets but
  the theme leaves alone are set back to their defaults in the screen, so the
  screen shows the saved theme rather than a mix. **Reset to inherited** on
  *Colors* hands the colours back to the dashboard.

A saved theme's background goes to the same scope, but only where none is set
yet - tick **Include background** to replace an existing one (it is disabled on
a page: *Set per screen*). A theme without a background never removes yours.
Widget content (sensors, layout, titles, ...) is never touched, and applying a
theme is one undo step: **Ctrl+Z** puts the whole previous look back.

Widgets with their own look still win over a skin or a saved theme. The
**Exceptions** list under the preview names them - for example *Colors
customised* on a widget, or *set for this screen* on a screen - each with
**Follow**, and **Follow all** at the top: those widgets switch to [follow the
theme](#follow-or-customise) (their own values stay saved) and, for All
screens, the screens' own styles, theme colours and corner radius are
cleared. That is one undo step too.

**Save as Theme** in the top bar asks for a **Theme name** and saves the colors,
corner radius, widget style (for a screen: its own over the dashboard's) and,
with **Include background**, the background. **Update ‹name›** writes the
scope's look back into the saved theme it matches. A saved theme's **...** menu
has **Rename...** and **Delete**; they live in Library › Themes and are stored in
the config (`appearancePresets`), shared by all screens. The command palette
has **Apply theme: <name>** for every one (applied to All screens).

Saved themes are not the same as a widget's Styles (see [Styles, Copy, Paste and
Make this the theme](#styles-copy-paste-and-make-this-the-theme)): a saved theme
sets the whole dashboard's (or screen's) look; a Style restyles the one widget
you apply it to. The palettes are a third, smaller step: they change the colours
only.

## Widget theme

Look and content preferences can be set once instead of per widget. A theme
holds a value for each *themed* setting: the look sections (skin, colors, widget
colors, surface, typography, shape & spacing, border & glow, custom CSS) and
the content ones (units & format, thresholds, motion). Per-widget content,
layout, title, icon, the background image and a widget's look toggles (the
tint, the heat ramp) are never themed, and neither is **Small zones**.

The levels, lowest first (`resolveStyle`, `src/lib/style-resolve.ts`):

1. the defaults (today's look, so nothing repaints on upgrade);
2. **All screens** - the dashboard style, for every widget on every screen;
3. **Screen** - the screen's theme, over the dashboard's, with per-section
   locks;
4. **Page** - a page's theme: per section, follow the profile or use the
   page's own values;
5. **Widget** - each section follows or is custom (see below).

Items in a panel follow the panel (the panel's own resolved look), which
follows the same levels.

### Follow or customise

A widget section either follows the theme (the default) or is custom. Its
[inheritance chip](#where-the-options-are) switches it: **Customise here**
unlocks the rows at the theme's values, **Reset to inherited** follows again and
keeps the widget's own values stored. Editing a themed row of a following
section is not possible; customise it first. Panels saved by earlier
versions keep their card and accent as their own values: those sections open
as *Custom here*.

A screen can **lock** a section: every widget on every page then follows it,
the widgets' chip becomes *Locked by Screen* and their own
values stay stored, inactive. Locking is screen-only; a locked section is
the screen's on a page too. A locked **Colors** section also overrides a
panel's own item colors where the panel gives way (fills take the accent).

The source dot of a row says where its value comes from (hover it for the
explanation):

- no dot - the default;
- blue dot - set here (on this widget, or in the scope being edited);
- teal dot - from the dashboard style (All screens);
- violet dot - from the screen's style;
- blue dot with a ring - set here, overriding the theme.

Clicking a dot that is set here resets it: the option falls back to the
theme (or the default).

### Theme editor

Theme is a view of its own. Open it from **Theme** in the rail, **Edit in Theme**
on a screen or page, a chip's **Edit ‹level›**, **Edit theme** on the canvas, or
**Theme** in the command palette.

- The **scope bar** picks what you edit: *All screens*, a screen (pick another
  with its chevron) or one of its pages. A screen shows a lock on each card
  and **Lock all** / **Unlock all** at the top; a page shows
  *Follows ‹screen›* with **Customise here** per card, or *Custom here* with
  **Reset to inherited**; *All screens* has no locks.
- The left column is the widget inspector without a Show tab: **Start from**,
  then the ten cards. Colors adds **Status & series colors** (Series 1-6, OK,
  Warning, Critical: the palette the widgets' colors stand for); Units & format
  holds the Data rows; Thresholds and Motion the Behaviour ones. Color tokens,
  Page font, Corners and Background are the two-level data of their cards
  (All screens and a screen; a page links to the screen).
- A live **preview** of the page at the scope draws under the edited values.
- **Exceptions** (*Who doesn't follow this theme*) lists the widgets and pages
  with a custom card; **Follow** makes one follow again and keeps its own
  values, **Follow all** every one. Together with **Lock all** it replaces the
  old Global style tab.

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

### Theme colours per screen

The theme colours belong to the dashboard, unless a screen has its own. The
corner radius is separate, set in Theme › Shape & spacing (see [Grid
spacing](#grid-spacing-gap-and-padding)). At a screen, the *Colors* card
starts with a chip:

- **From All screens** - the screen uses the dashboard's theme colours.
- **Custom here** (after **Customise here**) - the screen gets its own,
  starting as a copy of the dashboard's; the palette swatches and the editable
  colours below then edit the screen's copy only.

The kiosk shows a screen with its own colours in them (page, cards, text,
the Theme surface). In the studio the canvas previews them while the
studio's own panels and bars keep the dashboard's colours, so a light
screen shows as a light page on the canvas. Applying a saved theme to **a
screen** sets the screen's colours too (see [Skins and saved
themes](#skins-and-saved-themes)). Each colour edit and the
inherit / custom switch are undo steps like any other.

## General settings

Preferences that are not a look are in the Settings window (the rail's
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

The **Page font** is a look: it is in Theme › Typography, from the [font
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

The page font (Theme › Typography) and every widget's **Font** option offer the
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
  keeps the page's defaults: none on a *Fill* kiosk page, 12 px on
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

## Styles, Copy, Paste and Make this the theme

The Style tab's toolbar and the zone menu work on a widget's look-only options:

- **Copy style** remembers the selected widget's style; **Paste style**
  replaces another widget's style with it. Paste replaces the style as a whole:
  options the copied style does not set go back to the theme or defaults, the
  widget's content settings are untouched, and options the target widget does
  not have are skipped.
- **Start from a Style** lists the built-in Styles and your saved ones and
  applies one (same replace rules as Paste). **Save as Style** asks for a name
  and stores the widget's style in Library › Styles; **Update ‹name›** writes
  the widget's look back into the Style it was built on. Styles are saved in
  the config and are shared by all screens.
- **Make this the theme for...** makes the selected widget's custom sections
  the theme of **All screens**, **This screen** or **This page**.

For a whole dashboard look, see [Skins and saved themes](#skins-and-saved-themes).

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
the PC. In the desktop app, turn on **Settings › Coding agents**: the app backs up
`~/.claude/settings.json` and `~/.codex/hooks.json`, then adds its hooks with a dated backup of
each file. Your own hooks stay; your statusline keeps printing, wrapped by the forwarder
(`ips-agent.exe`). In Codex, run `/hooks` and approve the new hooks. Turning the setting off,
or uninstalling the app, takes them out again. The hooks post to
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
- **The Settings button at the foot of the rail** opens the Settings window (in the desktop app and in a browser alike; the App pages are the app's own): app zoom, start at login, open the studio on launch, close to tray, where the server listens (this computer or the local network; the port; extra allowed host names), updates, the **Coding agents** toggle, debug mode, logs and the changelog.
- **Coding agents:** turning the toggle on writes the Claude Code and Codex hooks for you (with backups), using the app's `ips-agent.exe` and the current port. Turning it off, or uninstalling the app, removes them. In Codex, still run `/hooks` once to approve them.
- **Export config** and **Import config…** use the system Save and Open dialogs. Import merges as before and is one undo step.
- Pending edits are saved before the window hides or the app quits.

## Widgets with no data

A widget with no data at all is hidden in the kiosk. (The old **Hide when idle**
option was removed; a stored value is ignored and the widget stays shown.)
