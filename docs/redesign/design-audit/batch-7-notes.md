# Batch 7 notes (rendered-walk findings, FND-094 to FND-103)

Source: a rendered browser walk (chromium on the `dist/` build, scratch server; forced-colors, reduced-motion, 640 and 1440).
Fixed 6, no change needed 4.

- FND-094 (forced-colors switches): `forced-colors:` classes on the track and knob in `src/components/ui/toggle.tsx`, `src/settings/ui.tsx` (Switch), `src/components/infopanel/export-dialog.tsx` (Toggle), `src/settings/sections/logs.tsx` (Follow new lines) and `src/components/studio/first-run/steps.tsx`. Off: Canvas track, ButtonText border and knob. On: Highlight track and border, HighlightText knob. Disabled: GrayText border.
- FND-095 (selected state): same classes (Highlight fill, HighlightText, `forced-color-adjust: none`) on the selected segment of `src/components/ui/segmented.tsx` and `src/settings/ui.tsx` (Segmented), the active item of `src/settings/nav.tsx` (icon too) and both Help sidebar items (`src/help/ui/sidebar.tsx`). Tabs (add-panel, inspector, page tabs, alerts, gauges) get one CSS rule on `[role="tab"][aria-selected="true"]` in the forced-colors block of `src/index.css`. Test: `tests/components/ui/forced-colors.dom.test.tsx` (switch, both Segmented controls, nav); the tab rule is CSS only.
- FND-096: `src/components/studio/setting-rows.tsx`: `SELECT` max width 150 to 170 with `whitespace-nowrap`; `INLINE_LABEL` 9 to 11 so "Comfortable | Compact" sits on the label's line like its siblings. Both are shared with the inspector rows, so inspector selects and segmented sets with 10-11 character labels now sit inline too.
- FND-097: `src/help/ui/results-view.tsx`: `whitespace-normal!`. Cause: `src/settings/settings.css:35` sets `button { white-space: nowrap }` unlayered, which beats every Tailwind `whitespace-normal` on a button. Other Help buttons with `whitespace-normal` (sidebar items, home cards, article cards) have the same latent problem; not changed.
- FND-098: `src/app-window/search-box.tsx` hides input, clear button and `Kbd` (new optional `className` in `src/app-window/kbd.tsx`) in the `rail:` variant and centres the icon.
- FND-099: `src/app-window/title-bar.tsx`: caption buttons draw the focus ring inside (`focus-visible:-outline-offset-2!`; the unlayered global outline offset needs the important flag).
- FND-100, 101: no change. The Add chips row and the quick bar are deliberate sideways-scrolling strips with an edge fade mask; the cut item is the scroll cue.
- FND-102: no change. Studio and Dashboard pages reuse the studio inspector row components; unifying with the Settings cards is a rewrite.
- FND-103: no change. Status-bar ellipsis on the 1920x550 fixture at 1440 is the widget's designed behaviour.

Look at in screenshots: forced-colors Settings General/Updates and studio inspector (switches, Stable/Beta, nav), Settings > Studio at 1440, Help search at 1440, Settings and Help at 640, title bar Tab focus.
- Controller follow-up: the root cause of the Help nowrap was an unlayered `button { white-space: nowrap }` in settings.css; it now sits in `@layer base`, so every button's own whitespace-* utility wins, and the one-off `whitespace-normal!` on the Help results card is dropped. Re-rendered: f7-help-1440-search.png wraps. The empty App zoom selection in the walk shots is the mocked Tauri bridge (no zoom value), not a forced-colours bug.
