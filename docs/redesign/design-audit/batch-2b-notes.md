# Batch 2 part B notes: accessibility (kiosk, widgets, Settings and Help)

11 rows: 9 `fixed`, 2 `partial` (FND-008, 061). Keyboard additions show on focus-visible only, so the touch layout has no new chrome at rest, apart from the Pause button (FND-011) and the glyphs of FND-008.

## Per row

- **FND-008 (partial)** New `ToneCue` in `src/widgets/core/primitives.tsx` (small ▲ for warn, ✕ for crit, plus sr-only "warning: " / "critical: "; nothing for ok). Used in `Metric` (every tone-coloured hero number), `FpsMonitor.tsx` GaugeView, `Thermals.tsx` value cell, `OsdStrip.tsx` cells. `StatusTracker.tsx`: history cells also differ in height (ok full, warn 66%, crit 33%). Island: `dynamic-island.tsx` `LevelCue` adds a triangle or octagon icon and sr-only text before a stat past its warn or crit. StreamChat badge squares get `role=img` with the badge name. Checked, no change: `KpiTiles` already prints ▲/▼ and the value; `Bluetooth` always prints the battery percentage beside the bar. Not done: StreamControl platform squares and user colours.
- **FND-010** `page-dots.tsx`: the active dot is a 16x8 pill, inactive is `bg-muted-foreground/70`; `aria-current="page"`.
- **FND-011** `page-dots.tsx`: tablist/tab replaced by a `group` of buttons with `aria-current`; when the profile's auto-rotate is on (new `rotateOn` prop, set in `App.tsx`) a Pause/Play button with `aria-pressed` sits beside the dots (absolutely placed, so the dots stay centred), replacing the old paused icon. It is hidden at rest: any pointerdown or key on the page shows it for 4 s (`PAUSE_SHOW_MS`), it stays while it has keyboard focus, and it fades out (no animation under reduced motion). The dots themselves stay visible. Long-press is kept.
- **FND-012** `alerts/alert-layer.tsx`: a real "Dismiss <title>" button in each card, visible only on keyboard focus (`.alert-dismiss` in `index.css`); its click bubbles to the card's existing tap handler. `island/dynamic-island.tsx`: the pill is focusable when tappable (`tabIndex 0`, Enter/Space, `role=button` with a label when no notice is open; an open notice keeps `role=alert/status`), focus ring through the new `.kiosk-focus` in `index.css`.
- **FND-013** `kiosk-strip.tsx`: dropped `inert`, added `onFocus`/`onBlur`, so Tab reaches Back/Minimize/Close while hidden and focus shows the strip.
- **FND-040** `alert-layer.tsx`: `role=alert/status` moved to the title+text block; the age label is `aria-hidden` and outside the announced text.
- **FND-061 (partial)** Done: `a { text-decoration: underline }` in `settings.css` and `window.css`; `scroll-pt-16` on the settings `main` (`app.tsx`); scrollers focusable with `role=region` and a label (`logs.tsx`, `diagnostics.tsx`, `help/ui/blocks.tsx`; a `biome-ignore` states why); div tables got ARIA table, row, cell roles (`diagnostics.tsx`, `help/ui/blocks.tsx`, rows use `display: contents` in Help); `Row` in `ui.tsx` is a `group` labelled by its label and described by its hint (`useId`); the port and allowed-hosts rejection hints are `role=alert` (`hintAlert`, `server.tsx`). Not done: clicking a Row's label does not toggle its control (`htmlFor`; the controls are passed as children and have no shared id); the tables are ARIA roles, not `<table>` elements; `window-pages.tsx` sticky bar covered only through `scroll-pt-16` on the main settings view (the desktop `WindowMain` scroller was not changed).
- **FND-071** `WaveLink.tsx` MuteMark and `MeterBridge.tsx` mute: the 10px "M" is now the `volume_off` icon at 13px, `role=img`, `aria-label="Muted"`.
- **FND-073** `Timer.tsx`: preset buttons are 40px tall (`h-10 max-h-full`, `ROW_H` 46 so `presetsThatFit` still counts whole rows; the running clock budget moved into `runningClockPx`, +12 for the taller button row), `aria-label` "Start N minute timer" / "Start pomodoro". Visual change: larger chips, so a short box fits fewer presets.
- **FND-075** `App.tsx`: Wrench button has `aria-label="Open InfoPanel Studio"`, `opacity-70`, focus ring; the page root is `<main aria-label={pageName}>`. `touch-layer.tsx`: the notice is `role=status`. Background video: documented exception, no pause control (user decision). `page-background.tsx` already shows only the poster/still frame under reduced motion (`videoPolicy`), and pauses while the page is hidden.
- **FND-084** `changelog.tsx`: the button toggles ("Show fewer"), has `aria-expanded` and the label "Show all <section> changes (n)". `about.tsx`: Files "Show" buttons are named "Show <label>". `ui.tsx` `useFlag` also raises `toast("Copied")` so the status region announces every copy (all six copy buttons inherit it); this also shows the Settings toast visually.

## Round 1 review fixes

- `ToneCue` marks its parts `data-ip-skip` (only in the studio canvas); `decompose.ts` `valueText` and `textRect` leave them out, so a warn or crit Metric exports the same text and box as ok. Test: `decompose.dom.test.ts` (Metric at crit). FND-008 `exportRisk` set to true.
- ToneCue glyph has a floor, `max(8px, 0.45em)`.
- Diagnostics group titles are `rowheader`; regions named "Series readings" and (Help) by their column headings.
- `OsdStrip.tsx` names its two drop colours (`DROP_CRIT`, `DROP_WARN`) instead of repeating hex.
- Timer: `tests/widgets/Timer.test.ts` covers `presetsThatFit` and `runningClockPx`.

## Tests and fixtures

- `tests/lib/__fixtures__/v8-parity.json`: 12 cases re-recorded (`st-*`, `th-discover`, `tm-*`, `fps-*`, `osd-*`). The only differences are the intended ones: the `ToneCue` span, the StatusTracker cell heights, the Timer chips (`h-10`, `aria-label`). That frozen file holds markup, so the new markup is the correct output.
- `tools/perf/budgets.json`: `kioskEntryGzipBytes` 267745 to 268534 and `studioEntryGzipBytes` 604181 to 604843 (measured on Windows, not CI Linux bytes). Reason: the accessibility additions (ToneCue, page-dots Pause button, island and alert keyboard paths, mute icon, decompose cue skip) cost about 800 B gzip in the kiosk entry and about 660 B in the studio entry; put this in the commit message.
- No new test files; the per-kind widget render test still passes.

## For the screenshots

Page dots (pill and Pause button), kiosk widgets with a warn or crit value (small glyph before the number), the StatusTracker history bars, Timer presets, the audio mute icon, the island with a warn or crit stat.

## Uncertain

The Pause button always shows when auto-rotate is on, which is visible chrome the audit asked for; remove it if the design prefers the long-press alone. No e2e or one-editor spec was run by hand beyond what `npm run verify` selected.
