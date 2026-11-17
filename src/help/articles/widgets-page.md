---
id: widgets-page
title: The Widgets page
icon: widgets
related: [widgets, presets, widget-settings, library, connections]
verified: 1.3.1-beta.8
---

Browse every widget, build your own from Studio's blocks, and bring in widgets other people made.

## What the page shows

**Widgets** in the sidebar opens the page. Its title counts the built-in widgets, the ones that are yours and the imported ones. **Search** matches names, and the chips **All**, **Recipes**, **Code** and **Yours** narrow the list. It has three sections:

- **Yours**: recipes you built here.
- **Imported**: widget packages you brought in from a file.
- **Built in**: Studio's own widgets, each with its presets. **Show all** lists them all.

Click a card to open its details on the right: what it is, its presets, the options people can change and the screens it is on. **Add to a screen** puts it on the page you are editing. The **⋯** menu holds **Duplicate**, **Remove** and, for an imported code widget, **Turn this widget off**.

## Recipes and code widgets

There are two kinds of widget you add yourself:

- A **recipe** is built from Studio's own blocks. It holds no code, follows your theme, scales with its zone and works on every screen. Anyone can make one.
- A **code widget** is a package with JavaScript in it, written by a developer. It can only be imported when it is signed by a key you trust, and it runs with the same access as a built-in widget. See [Code widgets](widgets-page#code-widgets) below.

Both kinds are rows in [Add](studio#add) after the built-in ones, with their presets like any other widget.

## Import and export

**Import** takes a widget package, a `.zip`. Studio checks it before it stores anything and, if it is refused, lists what is wrong in plain words and which file. When the widget is already installed, Studio asks first and shows both versions: **Replace** or **Keep the installed one**. The same files again change nothing, a signed package is never replaced by another of the same version, and a replaced recipe stays in **Yours** if you made it. **Export** in a widget's details (or in the builder) writes the package back out as `<name>-<version>.widget.zip`, to share or to keep; in the builder it saves your edits first. A package is at most 512 KB.

## The builder

**New widget** opens the builder with a blank recipe. A built-in widget's details also have **Duplicate as a recipe**, which starts a recipe from what the widget shows by default: CPU Monitor, GPU Monitor, Sensor, Weather, Fans, Disk I/O and Core Heatmap. The other built-ins draw things blocks cannot (lists of things that are not devices or places, controls, the time, audio streams), and their button is greyed with the reason.

The builder has three columns:

- **Layers** and **Add a block**, on the left: a recipe is a card holding blocks. The blocks are Ring, Gauge, Bar, Sparkline, Value, Label, Weather icon, Image, Heatmap, Row, Grid and Repeat. A Row lays blocks out, a Grid lays them out as cells of one size, and a Repeat draws its blocks once per place, drive, CPU core, fan, network adapter or GPU. A recipe holds up to 64 blocks, six levels deep.
- The preview, in the middle. **Size** switches between the recipe's main sizes, and the two boxes beside it take any size from its smallest to its largest. **Preview in** shows it in another look, as a screen wearing that look would, and **Data** switches between **Live data** and **Sample** values; before the first save, the sample is taken from the live readings, so it is never empty.
- The inspector, on the right, with the tabs **Block**, **Options** and **Presets**.

To move a block, drag its row in **Layers** onto the middle of a Row, Card or Repeat to put it inside, or between rows to place it there. With the keyboard, **Alt+←** takes it out of its container, **Alt+→** puts it into the container just above it, and **Alt+↑** and **Alt+↓** move it among its neighbours. A move the recipe can't hold, such as a Repeat inside another Repeat, is refused and the reason shows where you dropped it.

**Add a block** adds by the selection when you click a tile; drag a tile onto a row in **Layers** or onto the preview to put the block exactly there. Right-click a row in **Layers** (or press **Shift+F10** or the Menu key) for its menu: **Rename** (also **F2**, or double-click the name), **Duplicate** (`Ctrl+D`), **Copy** (`Ctrl+C`), **Cut** (`Ctrl+X`), **Paste** (`Ctrl+V`), **Wrap in a row** (`Ctrl+G`), **Move up**, **Move down**, **Move out** and **Delete** (**Del**). **Ctrl+click** adds a row to the selection and **Shift+click** selects a run of rows; Delete, Duplicate, Copy, Cut, Wrap in a row and dragging act on all of them. A paste goes after the selected block, or inside it when it is a Row, Card or Repeat, and works between the recipes you have open: options the pasted blocks use come along. A cut and its paste undo as one step. A row with a problem has a warning dot.

With the keyboard, **↑** and **↓** move through **Layers**, **Home** and **End** go to the first and last row, **→** and **←** open and close a Row, Card or Repeat, typing a name's first letters jumps to it, **Enter** selects and **Esc** goes back to the card.

In **Block**, bind a block to a sensor, choose its colour (the accent, a series or by thresholds; a Value's number is the **Text** colour unless you pick another, and can be **Muted**), and set when it shows (always, or when an option has a value) and the sizes it is drawn at (**From the size** and **Up to the size**). **Let people pick** turns a binding into an option, so the person adding the widget chooses the sensor or the device (a CPU, GPU, drive or adapter, **Auto** by default). **Replace sensor…** under a block's data swaps that reading for another wherever the recipe reads it, in one step, and lists the blocks it changed. A **Row** has **Align**: **Start**, **Centre**, **End** or **Stretch**, where each block sits across the row. **Opens at** is also the size the widget is added at.

A **Value** or a **Ring** can **Show in** another unit of its reading's kind: a clock in GHz rather than MHz, bytes in GB, a speed in MB/s, °F rather than °C, W in kW. Its decimals, a ring's range and its warning levels are in the unit shown. A Value's **Align** is **Spread** (label at the start, value at the end), **Start**, **Centre** or **End**, and a Label's is Start, Centre or End. A ring's **Centre colour** is **Text** or **Muted**.

A Value and a Label have a **Weight**: **Theme** is the Look's own (a Value's number bold on Classic), and **Medium** or **Semibold** set that weight for the whole text, in the Look's font. Both also have a **Case** (**As typed** or **UPPER**; a Value's unit keeps its case). **Opacity** (100, 80, 60 or 40 %) softens a block beside its colour: a ring's arc, a bar, a sparkline or heatmap cells take the step as it is, while text is never drawn under a 4.5:1 contrast on its card, so a step too faint for the Look is raised and the inspector says so. A **Card** inside the widget has a **Surface** (**None**, **Track** or **Raised**) and a **Padding** (**None**, **S**, **M** or **L**), the widget's own card a **Spacing** between its blocks (**Tight**, **Normal** or **Roomy**), a **Gauge** a **Sweep** (180°, 240° or 270°) and a **Bar** a **Height** (**S**, **M** or **L**).

Colour by thresholds has a **Direction**. **High is bad** turns the colour as the reading rises, past the warning level and then the critical one. **Low is bad** turns it as the reading falls, for a battery or free space, so the warning level is the higher one. The line under the levels says the order in words, and a warning level past the critical one is listed as a problem.

The widget's card (the top row in **Layers**) also holds its **Header icon** and its **Details**: the **Description** shown under its name on the Widgets page, a **Category**, the **Author**, the **Version** (each save raises it; the next one is shown) and its **Icon**, which its card on the Widgets page shows.

A **Label**'s text is **Typed** or **From data**: a sensor, an option people set, or a place's field inside a Repeat. From data, **Add a part** builds a line of several parts, typed text and readings each with their own unit and decimals, shown as chips you can drag: the high, " / " and the low make "6° / 1°". A **Heatmap** lists its **Cells**: **Add a cell** picks readings, and the rows drag to reorder.

The **Image** tile asks for a picture first and adds the block once you pick one; give it **Alt text** unless it only decorates. A picture no Image shows is not saved. A **Weather icon** outside a Repeat reads a text reading, a condition. **Snippets** add a few blocks at once in a Row: **Label, value and bar**, **Ring with a caption** and **Value and history**.

Point at a row in **Layers** for its eye and lock (also in its menu, `Ctrl+Shift+H` and `Ctrl+Shift+L`). A hidden block is not drawn in the preview, and a locked one can't be picked or dragged there. Both are for building only and are never saved: **Shows when** is how a widget hides a block. The **Header** row under the card holds its title, sub-title and header icon. When a delete leaves an option no block uses, such as a Repeat's **Locations**, the builder offers to remove it too, in the same undo step.

A **Repeat**'s **List** is a place list or a list of devices the readings have: **Drives**, **CPU cores**, **Fans**, **Network adapters** or **GPUs**, found as the built-in widgets find them. A block inside reads a **Field** of each one, such as a drive's used space and temperature, a core's load or a fan's speed; **Most shown** goes up to 32 for devices. A **Grid** sets **Columns** (empty: as many as make square cells at the size shown) and a **Spacing**; a Repeat inside it gives each item its own cell, so a Grid holding a Repeat over CPU cores with a Ring draws a ring per core. A Grid can't go inside a Repeat.

**Place freely** on a card, a Row or a Grid lets you drag its blocks anywhere and size them by their handles, with guides that snap to the other blocks and the edges (hold **Alt** while dragging to place without snapping). Resizing with **Shift** (keeps the shape) or **Alt** (from the centre) shows the guides but does not snap.

**Options** are what people can change when they add the widget; they appear in its **Content** tab. An option is a toggle, a choice, a number, a text, a sensor, a place list or a device. A recipe holds up to 24. A sensor option's default is picked with the data picker. A device option's **Kind** switches every block that follows it to another kind of device at once, reading the same sort of value (load, temperature, clock, power); readings it can't match are listed so you can pick them again. That is how a GPU card is made from a CPU card. An option also takes a **Hint** and a **Group** for the Content tab, and a number a **Step**. A choice that a block's **Shows when** uses can't be removed until that block changes. **Presets** are named sets of options and a size (up to 16), each with a **Blurb** for Add and a value for any option, a text, sensor, place list or device included; people can save their own on top (see [Layouts and presets](presets#widget-presets)). **Use in the page rail** in a preset's **⋯** menu makes it a rail preset: the widget then fits a page rail's slot, 72 px wide, and **Edit rail items** offers it under **Widgets**. The stage shows it in a rail slot (pick **Rail** in **Size** to see it again), and its text must stay above 11 px there. The default preset stays on the grid. A recipe with a rail preset is saved as format 2, which older versions show as "Widget not available".

Type the widget's name at the top. **Undo** and **Redo** (`Ctrl+Z`, `Ctrl+Shift+Z`) step through your edits, and each open recipe keeps its own history. A field counts as one edit when you leave it or press **Enter** (the preview follows as you type, and **Esc** puts it back); a slider drag is one edit. The line under the preview says whether the recipe is valid; if not, it lists every problem, each naming its block as Layers does, and a click on one selects that block. It also warns of crowding at the size shown: a block whose text is cut, a ring too small for its value, a block past the card's edge or two blocks over each other ("At 2×2, Values overlaps Ring"). Those rows get a warning dot too, but a warning does not stop a save. When nothing is crowded the line says it **fits** at that size. **Save** (`Ctrl+S`) stores the recipe on the server. **Add to a screen** saves it and puts it on the screen you were editing. A recipe signed by someone else cannot be replaced by a save, only copied: **Save as a copy**.

**Discard changes**, next to the saved state, takes the recipe back to its saved version (**Undo** brings the changes back). The **×** after the recipe's name closes it; with unsaved changes it asks first. Recipes left open with unsaved changes are listed on the Widgets page, each with **Discard**.

A recipe with a label of parts, or with any of **Align** on a Value or Label, a Value's **Muted** colour, **Centre colour**, **Show in**, **Low is bad**, **Weight**, **Case**, **Opacity**, a card's **Surface**, **Padding** or **Spacing**, a gauge's **Sweep**, a bar's **Height**, a **Grid** or a Repeat over devices, is saved as a newer recipe format, which an older Studio cannot draw (it shows "Widget not available"); recipes without them draw everywhere.

## Weather by place

A recipe can show the weather for places you choose, with no plugin. Add a **Repeat** block over a place list, then a **Weather icon** and values bound to the place's temperature, wind, precipitation and so on.

In the widget's **Content** tab the place list takes names: **Add a place: search by name**, and pick the match. **Use this PC's location first** puts the place you give for this PC at the top; it is picked once by you and is never looked up from your connection.

The weather comes from [Open-Meteo](https://open-meteo.com/), through the dashboard's server, so a kiosk never calls the provider. Only the place names and coordinates leave your PC. Each place is fetched when a screen first needs it and about every 15 minutes after that. Under the widget a line gives the credit, **Weather data by Open-Meteo.com · CC BY 4.0**, and says when the data is old or not there yet. Studio shows **Sample weather** in the builder.

To stop it altogether, start the server with the environment variable `WEATHER=off`; place search is then refused and no widget fetches anything.

## Code widgets

A code widget shows its trust in the details pane:

- **Signed by InfoPanel Studio · reviewed**: signed by the owner's key, which is built into the app.
- **Signed by ‹name› · not reviewed**: signed by a key you trusted yourself. Nobody has reviewed the code, and it can read your sensors, screens and settings and use the network.
- **Not loaded: the signature does not check out**: refused. It is greyed, is not in Add, and draws "Widget not available" where it is placed.

Keys are added in **Settings › Widget publishers**, nowhere else: an import never asks you to trust a key. **Manage keys** in a widget's details goes there. Each key signs only for the publisher names you give it.

Two switches stop code widgets:

- **Turn this widget off** keeps one widget listed but unloaded.
- **Third-party code widgets**, at the top of the page, hides and stops every code widget that isn't built in.

Both are kept by the server, so every screen and every kiosk that server serves obeys them. The server's own environment variables go further: `USER_CODE_WIDGETS=off` does the same as the switch and cannot be turned back on from the page, and `USER_WIDGETS=off` turns off every recipe and code widget at once.

Developers can download the **Widget SDK types (.d.ts)** from the page. Kiosks on other devices that show a code widget run it too, so turn the switch off if you do not want that.

:::open settings/publishers Settings › Widget publishers
