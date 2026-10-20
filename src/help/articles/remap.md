---
id: remap
title: Sensor remap
icon: swap_horiz
related: [import, sensors]
verified: 1.3.0-beta.1
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
| **Unresolved** | No match | Pick a key |
| **Left unbound** | Left empty on purpose | Nothing |

## How matches are found

1. Your own choice wins.
2. Then an automatic match: reference, plugin key, then name.
3. Then a suggestion, when one sensor of the same type stands out.

**Reset to automatic** takes a group back to the automatic match, and **Leave unbound** empties it on purpose. Reopen remap any time from the canvas editor.
