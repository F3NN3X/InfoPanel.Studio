# Batch 6a notes (FND-027, FND-045, FND-050: the three ARIA patterns batch 2a left partial)

All three rows are now `fixed`. The Edit reference specs (`fixtures.spec.ts`, `shell.spec.ts`) were changed with the user's approval, only for these rows, to express the APG patterns; every changed assertion checks the same outcome.

- **FND-027** `design-left-panel.tsx`: dropped `roving={false}` so the Layers | Add switch is one tab stop (the checked radio) and the arrow keys move and select (`Segmented` + `lib/roving.ts`). `fixtures.spec.ts` "keyboard only" (~731): tabs to the checked radio, ArrowLeft if it is not Layers, then asserts Layers is checked (was: tab to the Layers radio, Enter). `checks.ts` wording says nothing about tabbing, unchanged. Unit: `tests/components/ui/segmented.dom.test.tsx`.
- **FND-045** `layers-tree.tsx`: the chevron, lock and eye buttons are `aria-hidden`, `tabIndex -1` pointer controls (`data-row-action="expand|lock|hide"`, click handlers kept), so the treeitem has no interactive descendants. Keyboard: Left/Right expand (existing), Ctrl+L, Ctrl+H (existing); the row's state is `aria-description` ("Locked", "Hidden"). `layers-tree.dom.test.tsx`: finds the icons by `data-row-action`, asserts no role=button inside any row, the `aria-description` states, Right opens a group. `fixtures.spec.ts` (~136, ~418-435, ~834-846, ~911): each row still has exactly one lock and one eye (by `data-row-action`) and now also zero buttons by role; hide, show and lock are driven by selecting the row and Ctrl+H / Ctrl+L, asserting the same `data-hidden`/`data-locked` plus the new `aria-description`. In the muted-name check the row is first deselected (another row clicked), because selecting it for the key turns the name white, which the old pointer click did not; the `text-ui-4` and 0.45-opacity assertions are unchanged.
- **FND-050** `command-palette.tsx`: the input is `role=combobox` with `aria-expanded` (the existing `aria-controls`, `aria-activedescendant`, options with `aria-selected` stay). `shell.spec.ts` (34, 45) queries it as `combobox` instead of `textbox`. Unit: `tests/components/studio/command-palette.dom.test.tsx`.

Visual: none (hover opacity of the lock icon and all styling unchanged). Uncertain: screen readers now hear lock/hidden as a description rather than a pressed button; no way to toggle lock/hide by keyboard other than Ctrl+L / Ctrl+H and the layer menu, as before.

## Review round 1

- fixtures.spec.ts: the locked row lock icon is asserted visible at opacity 1 again (checklist line 57).
- layers-tree.tsx: rows carry aria-keyshortcuts="Control+L Control+H" and an sr-only ", Locked" / ", Hidden" in the name; a polite live region (layers-announcement) says "<name>: hidden" etc. on a single change. Icon mouse-down is prevented so focus stays on the row.
- command-palette.tsx: aria-expanded follows whether there are results; tests cover empty results and Escape.
- segmented.tsx: the unused roving prop is removed.
