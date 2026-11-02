# Batch 5 notes: UI and motion, plus the FND-030 colour sweep

Eight rows fixed, none no_change_needed; FND-030 stays `partial`. `npm run verify` exit 0 (all 16 checks passed, cargo-app included). No fixture or golden re-recorded (v8-parity and the template golden did not change).

## Rows

- FND-017: new `src/components/ui/kiosk-offline.tsx` (status pill, bottom right, only once data has arrived at least once, "Data API disconnected. Showing the last values" after the island's 5 s debounce, `DISCONNECT_DEBOUNCE_MS`); mounted in `src/App.tsx` (kiosk only, hidden when the profile has an island). The role=status region stays mounted so the text is announced.
- FND-035 (the delete-undo item, "Library and Add panel deletes"; not a scrollbar): `library-page.tsx` `deleteSavedPanel` and `use-studio-mutations.ts` `deleteSavedPanel` (Add panel) toast "Deleted X" with an Undo action, 8 s, like Screens. `StudioBridge.undo` (new, optional) and `useStudioMutations({ onUndo })` carry the history's undo from `studio-view.tsx`. Not done: Delete/Backspace on a focused Library card still deletes directly (it now has the Undo toast, which is the ledger's fix).
- FND-041: the "+N more" chip is a button, "Dismiss N more", acknowledging every collapsed alert (`alert-layer.tsx`; `Slot.rest` new in `alert-model.ts`). Persistent alerts under a dim/blur backdrop get a "Tap an alert to dismiss it" caption; backdrop tap itself is not an ack.
- FND-065: new `src/settings/page-state.tsx` (`PageState`: placeholder blocks while loading, "Couldn't load X. {reason}" with Try again). Used by changelog (plus the releases link), About and Connections. Diagnostics already had its own readable failure line with a refresh loop; left.
- FND-067: stepper removed, `ZOOMS` gains 175 and 200 (`src/app-window/zoom.ts` and the Rust `ZOOMS` in `src-tauri/src/settings.rs`, which validates); the zoom save toast now reads the new percent ("125%") instead of "Saved" (`src/settings/store.tsx`), so Ctrl +/-/0 give feedback in the Settings windows. `useZoomKeys` takes a `notify`: at the first or last step Ctrl +/- says "200% — maximum" / "80% — minimum" (Settings toast, Help status line). The Help window has a 1.2 s status line (`role=status`) that shows the percent on every zoom change.
- FND-079: Delete sits after a divider in `text-ui-danger/80` (group inspector, zone inspector actions); the unsaved dialog's Discard uses the danger outline (`border-ui-danger/40 text-ui-danger`, same tokens as the other danger surfaces) and Cancel takes initial focus.
- FND-083: Restore shows two overlapping squares (`title-bar.tsx`, inline SVG).
- FND-089: the held-open frame was probably a capture gap, but a silent Visualizer drew nothing at all; the widget now passes `minPx: 2` (vizLook can override), a 2 px baseline. Other AudioViz users unchanged.

## FND-030 sweep (partial)

Literals `[#hex]` in `src/components` and `src/settings`: 290 before, 124 after (166 mapped). Rule applied by script: nearest token of the right kind (text tokens for `text-`, surface/border/status tokens otherwise), CIEDE2000 under 2, the studio has a single dark theme. No new token was needed (`s-divider` is exactly #1c1c21). Excluded: `src/widgets/core/theme.ts`, `gauges/vector.ts`, fixtures.
Left (guard test `tests/components/color-literals.test.ts`, MAX 124, lower it, never raise it): `text-[#a1a1aa]` x20 (nearest ui-3, 3.5), `text-[#7c7c86]` x11 (ui-hint 5.2, would also brighten it past the contrast fix), `border-[#3a3a44]`/`#3a3a42` x15 (ui-menu 4), blue accents `#3b82f6`, `#60a5fa` family and the navy `#0b1530`/`#1e3a8a` chips, amber `#2a1d0a`, `#4ade80`, `#f87171` (2.2 from danger), `#27272a` (2.2), `#d4d4da`/`#d6d6db`, `#fafafa`, plus one-offs. These each need a token decision (a lighter secondary text step, a menu border, an accent blue) rather than a snap; the ledger's `--ui-bg-hover-2` and `--ui-divider` are covered by existing tokens.
Also: `tools/perf/budgets.json` kiosk 268881 to 269215, studio 605421 to 605736 gzip bytes (the pill, PageState, danger styles; same practice as earlier batches).

## For the screenshot review

- Kiosk: offline pill (stop the Data API for over 5 s, no island); alert stack past 3 shows a "Dismiss N more" button.
- Studio: Delete icons in the group and zone inspector headers (red tint, divider); unsaved-changes dialog (red Discard, Cancel focused); Add panel and Library delete toasts with Undo.
- Settings: General zoom (no stepper, 8 segments); changelog, About and Connections while loading and on failure.
- Title bar: maximized state icon.
- Visualizer widget: silent state baseline.
- The 166 swapped literals are within dE 2, so no visible change is expected; most likely to show are the Add panel previews, theme preview and island preview backgrounds (#070709 now #09090b).
