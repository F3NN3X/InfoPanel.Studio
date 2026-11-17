# Keys

A grid of keys: tap, hold or double tap each.

## What it shows

Studio's own key grid: each key is a tile with its icon and name, as the Audio and OBS buttons draw theirs. A dot in a
key's corner says it has a hold action, two dots a double tap. A key whose tap mutes something lights while it is muted.
A folder key opens its own keys, with a Back key first. It has no summary card or dense view.

## Data it needs

No sensor keys. Its keys are stored on the widget's placement (`Placement.keys`, `src/lib/keys.ts`), not in its settings,
and the screen runs their actions: a page, next or previous page, the page lock, profiles, the media keys, a mute of one
of this PC's devices, an OBS scene, the OBS mic, OBS's go live (when it is turned on), or a command through the action
runner (off until it is turned on in Settings > Actions, and each command approved on the PC). Without a screen around it
(Widget QA, a preview) it draws six sample keys.

## Options

- **Columns** (0 picks them from the widget's shape) and **Legend** (what the dots mean, in the header).
- The keys themselves (name, icon, colour, tap, hold, double tap, folder) are edited in its **Key list** section.

## Presets

None yet.
