---
id: remap
title: Sensor remap
icon: swap_horiz
related: [import, sensors]
verified: draft
---
Profiles from another PC read other hardware. Remap points them at yours.

Bindings are grouped by the sensor they read, so one choice fixes every item that uses it. Click a group's item count to select those items on the canvas.

## Statuses

| Status | Means | Do |
|---|---|---|
| Matched | Found the same sensor here | Nothing |
| Check | Matched by name, or one strong suggestion | Confirm one by one, or **Confirm all** |
| Unresolved | No match | Pick a key |
| Unbound | Left empty on purpose | Nothing |

## How matches are found

1. Your own choice wins.
2. Then an automatic match: exact reference, plugin key, or HWiNFO name.
3. Then a suggestion, when exactly one sensor of the same type and hardware family stands out.

Reset a group to go back to the automatic match. Reopen remap any time from the canvas zone.
