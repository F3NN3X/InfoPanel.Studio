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

**New widget** opens the builder with a blank recipe. A built-in widget's details also have **Duplicate as a recipe**, which starts a recipe from what the widget shows by default: CPU Monitor, GPU Monitor, Sensor and Weather. The other built-ins draw things blocks cannot (lists with as many rows as the data has, controls, the time, audio streams), and their button is greyed with the reason.

The builder has three columns:

- **Layers** and **Add a block**, on the left: a recipe is a card holding blocks. The blocks are Ring, Gauge, Bar, Sparkline, Value, Label, Weather icon, Image, Heatmap, Row and Repeat. A Row lays blocks out and a Repeat draws a block once per place. A recipe holds up to 64 blocks, six levels deep.
- The preview, in the middle. **Size** switches between the sizes the recipe supports, **Preview in** shows it in another look, and **Data** switches between **Live data** and **Sample** values.
- The inspector, on the right, with the tabs **Block**, **Options** and **Presets**.

To move a block, drag its row in **Layers** onto the middle of a Row, Card or Repeat to put it inside, or between rows to place it there. With the keyboard, **Alt+←** takes it out of its container, **Alt+→** puts it into the container just above it, and **Alt+↑** and **Alt+↓** move it among its neighbours. A move the recipe can't hold, such as a Repeat inside another Repeat, is refused and the reason shows where you dropped it.

**Add a block** adds by the selection when you click a tile; drag a tile onto a row in **Layers** or onto the preview to put the block exactly there. Right-click a row in **Layers** (or press **Shift+F10** or the Menu key) for its menu: **Rename** (also **F2**, or double-click the name), **Duplicate** (`Ctrl+D`), **Copy** (`Ctrl+C`), **Cut** (`Ctrl+X`), **Paste** (`Ctrl+V`), **Wrap in a row** (`Ctrl+G`), **Move up**, **Move down**, **Move out** and **Delete** (**Del**). **Ctrl+click** adds a row to the selection and **Shift+click** selects a run of rows; Delete, Duplicate, Copy, Cut, Wrap in a row and dragging act on all of them. A paste goes after the selected block, or inside it when it is a Row, Card or Repeat, and works between the recipes you have open: options the pasted blocks use come along. A cut and its paste undo as one step. A row with a problem has a warning dot.

With the keyboard, **↑** and **↓** move through **Layers**, **Home** and **End** go to the first and last row, **→** and **←** open and close a Row, Card or Repeat, typing a name's first letters jumps to it, **Enter** selects and **Esc** goes back to the card.

In **Block**, bind a block to a sensor, choose its colour (the accent, a series or by thresholds), and set when it shows (always, or when an option has a value) and the smallest size it is drawn at. **Let people pick** turns a binding into an option, so the person adding the widget chooses the sensor or the device (a CPU, GPU, drive or adapter, **Auto** by default). **Opens at** is also the size the widget is added at.

A **Label**'s text is **Typed** or **From data**: a sensor, an option people set, or a place's field inside a Repeat. From data, **Add a part** builds a line of several parts, typed text and readings each with their own unit and decimals, shown as chips you can drag: the high, " / " and the low make "6° / 1°". A **Heatmap** lists its **Cells**: **Add a cell** picks readings, and the rows drag to reorder.

**Options** are what people can change when they add the widget; they appear in its **Content** tab. An option is a toggle, a choice, a number, a text, a sensor, a place list or a device. A recipe holds up to 24. A device option's **Kind** switches every block that follows it to another kind of device at once, reading the same sort of value (load, temperature, clock, power); readings it can't match are listed so you can pick them again. That is how a GPU card is made from a CPU card. **Presets** are named sets of options and a size (up to 16); people can save their own on top (see [Layouts and presets](presets#widget-presets)).

Type the widget's name at the top. **Undo** and **Redo** (`Ctrl+Z`, `Ctrl+Shift+Z`) step through your edits, and each open recipe keeps its own history. A field counts as one edit when you leave it or press **Enter** (the preview follows as you type, and **Esc** puts it back); a slider drag is one edit. The line under the preview says whether the recipe is valid; if not, it lists every problem, each naming its block as Layers does, and a click on one selects that block. **Save** (`Ctrl+S`) stores the recipe on the server. **Add to a screen** saves it and puts it on the screen you were editing. A recipe signed by someone else cannot be replaced by a save, only copied: **Save as a copy**.

**Discard changes**, next to the saved state, takes the recipe back to its saved version (**Undo** brings the changes back). The **×** after the recipe's name closes it; with unsaved changes it asks first. Recipes left open with unsaved changes are listed on the Widgets page, each with **Discard**.

A recipe with a label of parts is saved as a newer recipe format, which an older Studio cannot draw (it shows "Widget not available"); recipes without one draw everywhere.

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
