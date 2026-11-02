# Batch 6b notes (the 15 rows left `partial` by batches 1-5)

Closed: FND-007, 008, 026, 031, 032, 036, 042, 043, 047, 052, 061, 063, 069, 090. Still partial: FND-030 (142 literals left, below). FND-072 and FND-074 untouched.

- **FND-007** Checked, nothing left: the source dot (shape per state, role=img, hit area) and the explorer StatusDot were done in batch 2a. `fixed`.
- **FND-008** StreamChat badges (batch 2b) and tone cues were done. StreamControl names its platforms in text ("TW", "YT") and its scenes carry icon and name, so no colour-only identity is left; user colours in chat are the name text. `fixed`, no code change.
- **FND-026** `page-dots.tsx`: `pointer-coarse:` 44px buttons and `pageDotsStripPx()` (44 on a coarse pointer, 24 otherwise; `App.tsx` uses it). `quick-bar.tsx` swatch 22 to 24px. Switch, dense rows and close buttons were done in 2a.
- **FND-030 (partial)** 216 to 142 (guard MAX lowered). New tokens in `index.css`: `ui-soft` #a1a1aa, `ui-dim` #7c7c86, `ui-edge` #3a3a44 (also #3a3a42), `ui-blue` #3b82f6, `ui-ok-text`; exact matches to `ui-hint`/`ui-disabled`; green and blue oklch text to `ui-ok-text`/`ui-accent-text`. Only `src/components` got the new hex tokens (settings and help load their own `s-*` tokens, not index.css). Left: settings/help literals, widgets (`Calendar`, `NowPlaying`, qa pages), navy/amber chips, `#0c0c0e` in touch overlay, oklch tints with alpha, one-offs.
- **FND-031** Every `text-[11px]`, `[12px]`, `[13px]` outside `src/widgets` became `text-micro`, `text-caption`, `text-body`. Deliberate leftovers: 10px chrome floor, 11.5px and 12.5px (exactly halfway between two steps, moving them would shift about 540 layouts), SVG/inline font sizes, and `src/widgets/**` 11/12/13px (155 uses; v8-parity markup would change for no visual gain).
- **FND-032** Call sites: `rounded-[6|8|9|12px]` to `rounded-ui-sm|md|menu|lg` (about 170), `h-[28px]`/`h-[34px]` to `h-(--ui-h-control|field)`, `z-[60]` dialogs/alert layer to `z-(--z-dialog)`, menu positioners to `z-(--z-menu)`. `cn` knows the `rounded-ui-*` names (`lib/utils.ts`). Other z values (`z-50` dialogs, `z-[80]`, `z-[90]`, `z-[100]`) keep their numbers: they are not the token values.
- **FND-036** `SystemOverview.tsx`: the 1x1 ring tile names the lead ring (label and value) in the hole when the tile is at least 130px and under the legend gate; smaller tiles keep the `aria-label`.
- **FND-042** `modern-chrome.tsx`: the body now starts below the header (`mt-7`, height less 1.75rem) when a header shows.
- **FND-043** Checked: all four items done in 2a/6a. `fixed`.
- **FND-047** `aria-description` with the tip on `inherit-chip.tsx`, `status-bar.tsx` items, `settings/ui.tsx` Button (diagnostics WebView2 button) and the Help `OpenButton`. Shell Help button already has a visible label.
- **FND-052** `role=img`/`group` on the remaining labelled spans and divs: `element-ui.tsx`, `export-check-panel.tsx`, `wizard-parts.tsx`, `studio-top-bar.tsx`, `place-row.tsx`, `island-preview.tsx`, `icon-source.tsx`.
- **FND-061** `ui.tsx` Row: clicking the label focuses or clicks the row's control. `window-pages.tsx` `WindowMain` scroller `scroll-pt-16`. Real `<table>` not done on purpose: the ARIA table roles from 2b are equivalent and the grid layouts would need rebuilding.
- **FND-063** Below 700px both sidebars become a 56px icon rail (`settings/shell.tsx`, `nav.tsx`, `help/ui/sidebar.tsx`): labels sr-only with `title`, search, group labels, status indicators and the footer hidden.
- **FND-069** `core/data.ts`: `fmtUnit`, `DATE_STYLES`, `fmtDate` (used by StatusBar dateText, DayPlanner, CodingAgents limits). `lib/countdown.ts` `trimTrailingZeros` (live seconds kept), used by Countdown. Weather forecast rain reads "42.5 mm". WaveLink and MeterBridge show "dB" once between the L and R readouts so "-inf" has its unit. Clock keeps its own date code (its format is part of the face).
- **FND-090** Only tui frames the title (all other skins draw a header only over a body view), so `core/Widget.tsx` blanks a summary view's label when it equals the frame title in tui. Other skins checked in code: no header and summary together.

## Re-recorded
`tests/lib/__fixtures__/v8-parity.json`: `wx-default` only (rain "42.5mm" to "42.5 mm", three cells).

## Budgets
`tools/perf/budgets.json`: kiosk 269215 to 269553, studio 605736 to 606100 gzip bytes (rail variants, token classes, new helpers).

## Screenshots to check
Studio: all chrome (11/12/13px now rem, radii same values), page dots on a touch kiosk (44px), quick-bar swatch, layers/inspector with the new colour tokens (#3a3a44 borders, #3b82f6 blue).
Settings and Help windows narrower than 700px (icon rail). Kiosk modern-chrome panels with a header (content starts 28px lower). Widgets: SystemOverview 1x1 (lead ring in the hole), Weather forecast rain unit, WaveLink and MeterBridge (dB label), Countdown (trailing zero units gone), tui skin summary views (no repeated title).

## Round 1 (review fixes)
- Scale tokens (`--text-*`, `--radius-ui-*`, `--ui-h-*`, `--z-*`) moved from `index.css` to `src/settings/tokens.css`, which index.css, settings.css (and so Help) all import; before, the Settings and Help bundles fell back to 16px text. Guard: `tests/settings/theme-tokens.test.ts` (names used in settings, help, app-window must be defined in the CSS they load). Compiled settings.css with @tailwindcss/node to check `text-body`, `rounded-ui-menu`, `h-(--ui-h-field)` and `rail:` utilities are emitted.
- Rail: now a `rail` custom variant (tokens.css) that matches only inside `data-narrow` asides (desktop Settings shell, Help sidebar), under 700px, and not while the search input has focus (so Ctrl+K or a tap on the search icon opens the rail with a usable field). The browser Settings window sidebar is unaffected. Rail keeps: search (collapsed to its icon), update and status dots on the item corner, the server dot (title and aria-label), Help footer actions as icon buttons with titles (version in the Open Settings title).
- FND-042: the header offset is padding on an unzoomed parent, and `zoomFor` gets the height less 28px, so auto-scale no longer sizes for room the header takes.
- FND-090: the retro half was done in batch 3 (`font-size-adjust: 0.4` on the `terminal` surface, `core/surfaces.ts:33`); tui duplicate titles in this batch. Row stays fixed.
- `fmtUnit` removed (no caller). Tests added: `fmtDate` (tests/widgets/core/data.test.ts), `trimTrailingZeros` (tests/lib/countdown.test.ts).
- Tokens renamed to the `--ui-text-*` / `--ui-accent-*` pattern: `--ui-text-ok` (value oklch(0.88 0.10 150)), `--ui-accent-blue`. `ui-dim` dropped: its 11 sites use `text-ui-hint` (#8a8a94, AA) so they are slightly brighter. Swaps with dE00 over 2 went back to literals (green 0.84/0.14 in help `blocks.tsx` and 3 others, accent-text 0.78/0.85); literal guard MAX is 148.
- Controller review: MeterBridge 4x4 crowded its per-strip footer with an inline "dB" (neighbouring channels ran together). The footer is back to "L … R …" and the row has title="Level in dB, left and right"; WaveLink keeps its dB label (it has room). Budgets set to the measured 269594 / 606140.
