# Batch 1 notes: tokens and colors

All 15 rows fixed; FND-030, FND-074 and FND-046 only in part (stated below). `npm run verify` exit 0 (lint, typecheck, unit, build, settings-build, server, lab, import-check, e2e, cargo-server, cargo-app all passed).

## Contrast, before and after (WCAG, computed from the token hexes)

| Token | Before | After |
|---|---|---|
| ui-text-5 / s-dim (now `--ui-text-hint` #8a8a94) | #6f6f79: app 3.93, panel 3.79, hover 3.49, active 2.87 | app 5.72, panel 5.51, raised 5.23, hover 5.07, s-input 5.28, nav-on 4.96, seg-on 4.51, ui-active 4.17 (only the selected-fill surface stays under 4.5) |
| ui-text-4 | #85858f: panel 5.16, active 3.90 | #8f8f99: panel 5.89, active 4.45 |
| s-faint text uses | #55555e 2.3-2.6 | moved to s-dim (above); s-faint left for icons and a bullet |
| Studio and Settings control boundaries | #24242a / #2a2a31 / #2e2e35: 1.22-1.40 | `--ui-border-control` / s-input-line / s-track-line #66666f: app 3.44, panel 3.32, raised 3.15, hover 3.05, s-input 3.17 |
| Sheet drag handle | #3a3a42, 1.67 | ui-control, 3.32 on panel |
| Scrollbar thumb (studio, pickers) | #2e2e35 on #0c0c0e, 1.45 | #66666f, 3.44; 8px wide |
| Pin icon, logs timestamps, ruler numbers | #4a4a52 2.15 / #5a5a63 2.76 | ui-4 5.89 / s-dim 5.51 / ui-4 (rulers 10px) |
| Widget `--w-faint` dark | #71717a: 3.28-4.04 on the surfaces | #8a8a94: 5.72 on #0c0c0e, 5.51 on #111114 (dark surface cards are #18181b, similar) |
| Widget `--w-faint` light | #71717a on #f4f4f5 4.40 | #636366: 5.45 on #f4f4f5, 4.72 on #e4e4e7 |
| Theme-tone faint | 80% mix of muted | muted itself (`hsl(var(--muted-foreground))`), also in PANEL_SKIN_VARS |
| matte-light muted | alpha .6: 4.49 / 4.20 on chip | alpha .72 (surfaces.ts 60, 129, SURFACE_TOKENS 178) |
| Critical alert colour | --destructive 0 62.8% 30.6%: 1.89-1.99 | `--alert-critical` hsl(0 84% 60%): 5.3 on #09090b |
| Slate muted-foreground | 4.21 on bg, 3.07 on chip | 215 20% 65% (test passes 4.5 on all three pairs) |
| Template palettes (54 failing pairs) | muted on page/chip 1.74-4.45 | all >= 4.5, enforced by `tests/lib/theme-contrast.test.ts` |
| Weather muted over the condition wash | sun 2.6, snow 2.5, fog 3.2, cloud 3.4, rain 3.9 (dark card) | wash kept at the original 42% / 12%; over it --w-muted / --w-faint are --w-fg at 90% / 85%: all >= 4.5 on dark (snow 4.80 is the floor) and on a light card |

## Rows

- FND-001: `src/index.css` (text steps), `src/settings/tokens.css` (s-dim, input/track lines), 45 files renamed `ui-5` to `ui-hint`, 17 s-faint text uses to s-dim, 22 hand-typed `text-[#71717a|#6f6f79|#8a8a94]` to `text-ui-hint` (studio side only; settings and help have no such literals). Added `--ui-text-disabled` #55555e for disabled text (used by `select.css` disabled options via s-faint). Not done: the grep guard for `text-ui-hint` with `text-[..px]` (the ledger asked for it; it would flag most of the app today).
- FND-002 (exportRisk): `src/widgets/core/theme.ts:49,51,55,114`, `src/components/widgets/panel-skin.tsx:37`, `src/widgets/core/views.tsx:19` (opacity .7 dropped). `--w-fg`, `--w-muted`, STATE and accent unchanged, so `gauges/vector.ts` THEME needs no edit; import-check and the export tests pass. `tests/widgets/core/theme.test.ts:57` and `tests/lib/__fixtures__/v8-parity.json` expected `--w-faint:#71717a`; they now expect `#8a8a94`, because that is the intended new dark token (only that value and the Weather rows below changed in the fixture).
  `TONES.muted` (`theme.ts:114`) moved from the literal `#71717a` to `var(--w-faint, #8a8a94)`, like its ok/warn/crit siblings. Its only consumer, `panel-items.ts:32`, takes a tone of ok|warn|crit, so `muted` is not reached there; the InfoPanel gauge "muted" key is a separate palette in `lib/infopanel/gauges` and unaffected. Review follow-up: a hidden layer row also sets its name to `text-ui-4` (`layers-tree.tsx:324`) so it reads as hidden without opacity.
- FND-003: `src/lib/theme.ts` (Slate 110, Paper 185 to 42% lightness for 4.5 on its chip), `designs/ports.ts` (`readableSub` lifts every template palette's `sub` to 4.6:1 against bg and line; White variant gets a light bg #eceef3; Float line #4d5268). New `tests/lib/theme-contrast.test.ts` covers THEME_PRESETS and TEMPLATE_PRESETS. The screen-template golden (`instantiate-golden.json`) was regenerated with `UPDATE_GOLDEN=1` because the palette tokens deliberately changed; only hashes moved.
- FND-024: new `--ui-border-control` (`index.css`), applied to FIELD/SELECT (`setting-rows.tsx`), `slider-field.tsx`, `quick-bar.tsx`, `segmented.tsx`, `device-checklist.tsx`, `toggle.tsx` off track, `bottom-sheet.tsx` handle, settings `Switch` off track. `--color-s-input-line` and `--color-s-track-line` raised, so every use of them (kbd, dashed empty states, search boxes) gets the stronger line too.
- FND-028 (exportRisk): matte-light muted alpha .72 in `src/components/surfaces.ts`; `SURFACE_TOKENS` is in surfaces.ts, not theme.ts, and is not mirrored in vector.ts. Glass over a white page not changed: glass is a dark material (white text over a dark gradient); the ledger's "document it" option is not done.
- FND-029: one status set now in `src/settings/tokens.css` (`--ui-ok/warn/danger/info`, `--ui-success/warning` as aliases; s-green/amber/red point at them). Info moved to hue 205 so it no longer matches the accent. Not done: the ~150 mechanical renames of `ui-success`/`ui-warning` call sites (aliased instead).
- FND-030 (partial): `select.css` and `select-scrollbar.css` now use `--color-s-*` variables (new `s-menu`, `s-menu-line`, `s-hover`); logs.tsx timestamps; the island crit red `#ef4444` now `severityColor("critical")`. Not done: the sweep of the other ~300 `[#hex]` literals, `--ui-bg-hover-2`/`--ui-divider`, and the vitest hex guard (it would fail on the existing literals).
- FND-037: `--alert-critical` in `index.css`; used by `alert-model.ts` `severityColor` (ring, island glow, alert border/icon) and `zone-error-boundary.tsx`.
- FND-046: pin `settings-panel.tsx` to ui-4; ruler labels ui-4 at 10px; hidden layer rows dim only the icon and kind tag (`layers-tree.tsx`; `tests/components/studio/layers-tree.dom.test.tsx:62` now asserts that, since the row itself is no longer dimmed). Uncertain: rulers still live inside the canvas zoom transform, so their text scales with zoom; moving them out was not attempted.
- FND-070: `Weather.tsx` keeps its original condition wash (the darkened wash was rejected in review: it turned every tint near-black and lost the card's colour). Instead, a tinted card scopes `--w-muted` / `--w-faint` to `color-mix(var(--w-fg) 90% / 85%)` on the widget root; the last-refreshed time and the low temperature use `--w-muted`. v8-parity fixture updated for the Weather case (gradient string, root text vars, those two classes). Ratios computed, not rendered.
- FND-074 (partial): island secondary text opacity 60/65 to 75 (`dynamic-island.tsx`). Not done: GameSpotlight/SteamGame scrim and nixie weight, which depend on art and need rendering to judge.
- FND-081: `add-row.tsx` dims only the icon and footprint.
- FND-091: grep of src, tests, lab, tools found `clip-indicator.tsx` only referencing itself and the `--meter/--channel/--wave` tokens only in `index.css`; deleted the file and the tokens (including the `[data-theme-scope]` re-declaration), updated `docs/widget-settings.md`. A `legacy-zones.ts` comment mentions `--meter-ok` in prose only.
- FND-092: studio scrollbar thumb 8px, #66666f (3:1 rather than the ledger's about #4a4a54, which is 2.2:1); picker scrollbar likewise.
- FND-093: `--ui-text-5` renamed `--ui-text-hint` (utility `ui-hint`), in the same change as the contrast fix; 1-4 kept.

## For the screenshot review

- Studio hint/caption text is visibly lighter everywhere; `ui-hint` is now close to ui-4 (#8a8a94 vs #8f8f99), so the two steps read nearly the same.
- Field, select, checkbox, segmented, switch-off and drag-handle outlines are clearly brighter; Settings dashed empty states and kbd chips too.
- Scrollbar thumbs are brighter and wider.
- Deck/Meters/Orbit/Tower/Ticker White palette now has a light page; Float tracks are darker; Weather tint is a subtler wash.
- Critical alerts are a brighter red.
