# Batch 0 notes: functional bugs

All 7 rows fixed, each with a regression test where Vitest can reach it. Two things to look at first: both bundle budgets were raised (below), and FND-062 changes how Help Home looks while typing.

## Rows

- FND-022: `src/settings/store.tsx` (load moved to its own effect keyed on a retry counter, `.catch` sets `loadError`, the provider renders `LoadState` instead of null), new `src/settings/load-state.tsx` (title bar with caption buttons, "Couldn't load settings", the error, "Try again. If it keeps failing, restart InfoPanel Studio.", Retry). Test: `tests/settings/settings-app.dom.test.tsx` (load rejects, Close button present, Retry opens the window). The loading state is a blank window with the caption buttons rather than a skeleton (a design preference; the skeleton would be a flash).
- FND-023: new `src/widgets/fps-line.ts` (`fpsSubLine`), used in `FpsMonitor.tsx` (gauge compact line, non-gauge compact, xs Metric) and `OsdStrip.tsx` compact. A 0 or missing 1% low is left out; the label reads "1% low". Test: `tests/widgets/fps-line.test.ts`. The Stat rows at sm and lg sizes show "–" for a 0 or missing 1% low (follow-up in review).
- FND-039: `src/App.tsx` fetches the config itself when the stream has sent nothing after 1.5 s (not on mount: that was a second /api/config request and broke the kiosk request budget); the blank screen is the new `src/components/ui/kiosk-connecting.tsx`, which says "Waiting for InfoPanel Studio. Check that it is running." after 3 s. Test: `tests/components/kiosk-connecting.dom.test.tsx` (the message). The silent-stream fetch itself has no unit test: App is not testable in Vitest without the whole kiosk; the e2e kiosk specs cover the normal path.
- FND-057: `src/components/infopanel/import/import-dialog.tsx` (Escape, backdrop, Cancel and a new X go through `useCloseGuard` once past step 0; a "Discard this import? / Keep going" dialog), new `use-close-guard.ts`. Test: `tests/components/infopanel/import/use-close-guard.dom.test.tsx`. Commit success still closes without asking.
- FND-062: `src/help/app.tsx`, `src/help/ui/home-view.tsx`. Home's field stays mounted while typing and the results appear under it (hero title and cards hidden), so nothing moves focus. The sidebar field is still on screen with the same name (two "Search help" fields); I left it because Ctrl+K targets it. Test: `tests/help/help.dom.test.tsx` (same element, still focused). Reviewer: look at Help Home while typing.
- FND-064: Run setup (`general.tsx`), Help button (`shell.tsx`) and F1 (`app.tsx`, `window-desktop.tsx`) toast the error; Diagnostics refresh shows "Can't read the diagnostics…" (`diagnostics.tsx`); Logs footer shows "Can't read the log. It will keep trying." (`logs.tsx`); Help's Open Settings, external links and zoom set report through a small notice at the bottom of the window (`help/env.tsx` `setFailureHandler`, `help/app.tsx`). Test: `tests/help/env.test.ts`. Not changed: Help's version read and zoom re-sync on focus (background reads, nothing the user clicked) and the browser settings page's F1 (`window.tsx`, no store/toast there).
- FND-080: `first-run-page.tsx` Escape ignores keys from inputs/textarea/select and already-handled ones, unless the Skip dialog is open. The Convert timing: `screens-view.tsx` `onConvertScreen` -> `studio-view.tsx` opens the screen, then an effect opens the dialog once that screen is the edited one and Screens is closed (no 300 ms timer). Test: `first-run.dom.test.tsx` (fails without the fix). The Convert effect has no unit test (studio-view is not mountable in Vitest).

## Bundle budget

`tools/perf/budgets.json`, measured here (Windows, `npm run build` then `check-budgets`; HEAD before the batch measured kiosk 267462, studio 600615):

| entry | old budget | new budget (= measured) |
|---|---|---|
| kiosk | 267457 | 267745 |
| studio | 600259 | 601033 |

The growth is the kiosk's own code (the config-pull module and the "waiting" message, both must be eager). The import dialog, Settings and Help are lazy or separate entries and are not in either number. CI's Linux numbers may differ by a few bytes, within the 0.1 % slack. I did not find a way to keep this code out of the entry.

## Review round 1

- Import dialog (FND-057): `tests/components/infopanel/import/import-dialog.dom.test.tsx` drives the dialog through Escape, the X, Cancel (each asks, Discard closes), Escape at step 0 (closes at once) and Escape on the question (keeps the import open, once). Both Escapes did behave in happy-dom, so I did not add a guard against the double handling. `asking` is reset when `open` goes false from outside.
- Kiosk (FND-039): the logic is `src/lib/kiosk-config-pull.ts` (`startKioskPull`), used by `App.tsx`. Only the newest read applies (a slow older one is dropped), timers are cleared on stop. A failed read still lets the local copy mount, as the message path always did. Test: `tests/lib/kiosk-config-pull.test.ts` (silent stream, stream spoke first, offline, out-of-order, reconnect vs update, stop).
- Help test order (FND-062): the cause was a late `hashchange` for the page already shown clearing the query. `src/help/app.tsx` `onHash` now ignores a hash that names the current page; `tests/help/help.dom.test.tsx` has a test that dispatches one while typing (fails without the guard) and the focus test is back in its original place. File ran 5 times in a row: 4 of 4 tests passed each time.
- Nits taken: first-run Escape uses `instanceof Element`; `convertAfter` is dropped if the screen did not open; fps-line comment example; kiosk wait message now "Waiting for InfoPanel Studio. Check that it is running."; Settings load error no longer says "Try again" above Retry. Not taken: Retry busy state, shared title constant, zoom revert on failure, Logs footer styling.

## Uncertain

- The kiosk silent-stream path is covered at the module level, not in a browser (no Playwright case holds the stream silent).
