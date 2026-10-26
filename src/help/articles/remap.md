---
id: remap
title: Sensor remap
icon: swap_horiz
related: [import, sensors]
verified: 1.3.0-beta.33
---

Profiles from another PC read other hardware. Remap points them at yours.

Bindings are grouped by the sensor they read, so one choice fixes every item that uses it. Filter the list with **All**, **Check**, **Unresolved** or **Done**.

## Statuses

| Status | Means | Do |
|---|---|---|
| **Matched** | Found the same sensor here | Nothing |
| **Confirmed** | You accepted a suggestion | Nothing |
| **Your choice** | You picked a sensor yourself | Nothing |
| **Check** | A suggestion that needs your eye | Confirm one by one, or **Confirm all** suggestions |
| **Unresolved** | No match | Pick a key, or leave them all unbound at once |
| **Left unbound** | Left empty on purpose | Nothing |

## How matches are found

1. Your own choice wins.
2. Then an automatic match: reference, plugin key, then name.
3. Then a suggestion, when one sensor of the same type stands out. A plugin that was renamed in a later version is
   followed when its reading has the same id and name, so a profile made with the old plugin finds the new one.

Import waits until no group is Unresolved. **Leave N unresolved unbound** settles them all at once; the items show
"-" until you remap them from the canvas editor.

**Reset to automatic** takes a group back to the sensor the profile came with, then matches it again. **Leave unbound** empties it on purpose. Reopen remap any time from the canvas editor.
