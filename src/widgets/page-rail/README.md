# Page Rail

Your pages and actions down one edge.

## What it shows

A column of the profile's pages, actions and small widgets: the profile chip at the top, the slots in their groups (top,
pages, actions, widgets) with a rule between groups, then the slots of the bottom group, the page lock (Auto or Locked)
and the Clock at its rail preset at the foot. The page shown is marked in the accent; a badge follows the agents waiting,
the alerts shown or OBS on air. Under 580 px of height it draws its dense sizes. It has no header, summary card or dense
view.

## Data it needs

No sensor keys. Its slots are stored on the pinned item (`PinnedItem.rail`, `src/lib/pinned.ts`), and with none stored it
draws one slot per page. The screen gives it the pages, the page shown and the actions (`src/components/rail-host.ts`); the
badges read the extras (`agents`, `obs`) and the alerts shown, as the Island does. Without a screen around it (Widget QA,
a preview) it draws a sample profile's five pages.

## Options

- **Profile chip**, **Page lock** and **Clock**, each on by default.
- The slots themselves (page, action or a widget with a rail preset; icon, shape, tint, label, badge and touch) are edited
  in the pinned layer, not here.

## Presets

None yet.
