# Settings & navigation IA: status

Phases follow `IMPLEMENTATION_PLAN.md`; the owner decisions in `PLAN.md` win over `SPEC.md`. Phase 0 (the audit) is
`IA_AUDIT.md`.

## Phase 1: shared building blocks

Built, not yet placed in the shell (Phase 2 mounts them). The checkpoint is the dev page **`?ia-preview`** (a lazy
chunk like `?ui-preview`, never linked): every chip state, the chips resolved live over a sample config (Lock /
Unlock and the chip menus edit it), LinkRows and the status bar in each state plus one live instance.

Checked by tests, a production build and by eye in headless Chromium at 1000 px (`?ia-preview`: chips, chip menu
opened with Enter, LinkRows, status bars; `?studio=1` still renders, no console errors).

| Piece | State |
|---|---|
| `InheritChip` (SPEC §5) | Done: `src/components/studio/inherit-chip.tsx`. Pure; props `state`, `from` (All screens / Screen / Page), `fromName`, `parentText`, `onReset`, `onJump`, `onCustomise`, `onMakeTheme`. Each state has its own icon, wording and border (dashed for inherited and built-in). Tooltips are the spec's copy; base and built-in take the prototype's. The menu is Base UI's: click, Enter or Space opens, Esc closes, 220 px. First line is the parent's value ("Without it: #3D8BFF from Page · Gaming"); then custom: Reset to inherited (⌫ hint) · Edit ‹level› ↗ · Make this the theme for… ▸ (widget only); inherited: Customise here · Edit ‹level› ↗; locked: Edit lock in Theme ↗; base: Reset to built-in. `InheritLockNote` / `keptOverrideText` give the amber kept-override note. |
| Inheritance resolution | Done: `src/lib/inheritance.ts` (`resolveInheritance`, `styleInheritance`, `dataInheritance`, `valueText`), on `theme-model.ts` (`themeVal`, `pageCustom`, `isLocked`) and the two-level resolvers (`resolveTheme`, `resolveBackground`, the performance layering, `resolveFont`). Covers the 11 widget-style sections at All / Screen / Page / Widget (locks, kept overrides) and tokens + radius, background, performance and the page font at All / Screen. A level "sets" a section when it holds a value for one of its keys (a page or widget: when it customises it); `from` is the nearest level above that sets it, else All screens. |
| `useInheritance(path, scope, ctx)` | Done: `src/components/studio/use-inheritance.ts`, a thin hook over the resolver and `inheritance-actions.ts` (`resetInheritance`, `customiseInheritance`, `inheritanceJump`, on the existing writers `withScopeValues`, `withPageFollow`, `withFollow`, `withScope`). `ctx` carries `config`, the history `setConfig` and `navigateTo`. |
| Page font per screen (PLAN decision 10) | Done: optional `MonitorProfile.font`, normalised in `layout.ts` (an unknown font is dropped), `resolveFont` in `general.ts`, `"font"` in `PROFILE_KEYS` and in the profile-scope switch (`ScopedSection`). The three readers (`App.tsx`, `profile-page.tsx`, `studio-canvas.tsx`) use `resolveFont`. No migration; nothing writes `profile.font` yet, so rendering is unchanged. |
| `LinkRow` (SPEC §4.1) | Done: `src/components/studio/link-row.tsx`. Label, read-only value (mono option) with "· from X", an optional lead-in note and the accent `↗` link calling `onNavigate`. |
| Navigation targets | Done: `src/components/studio/studio-nav.ts` (`NavTarget {view, tab, section, control, themeScope, profileId}`, `focusNavTarget`, `useNavFocus`) and `navigateTo` in `use-studio-ui.ts`. Views mark targets with `data-nav-section` / `data-nav-control`; the focus helper retries for about 30 frames so a lazy view can render first. Until the new views exist, `navigateTo` maps to today's places (Data → Sources, Alerts & Island / Screens → their drawers, Settings › App → the desktop window, other Settings → the profile inspector's Behaviour tab). |
| `StatusBar` (SPEC §3.4) | Done, not mounted: `status-bar.tsx` (pure) and `use-status-bar.ts` (live data). Data API connected / slow / unreachable from the sensor streams plus a timed `GET {base}/api` every 15 s (`pingApiBase`, `dataApiState`, `SLOW_API_MS` 300 in `data-api.ts`); server (desktop `Server · :port · LAN`, browser `Served by ‹host›`); kiosk count; update (desktop only); "Restart server to apply"; save state (Unsaved / All changes saved / Offline · edits kept locally, AUDIT A5). Below 960 px only the dots show. |
| Kiosk registry (PLAN decision 7) | Done: `server/control.mjs` keeps the open control streams that report `?profile=` (internal `connect` / `disconnect` actions, never POSTable), runtime only, published as `kiosks: [{id, profile, page, address, since}]`. `page` is the kiosk's `?page=` pin while the profile has it, else the profile's current page. `server.mjs` registers in `handleControlEvents` and drops it on close. Typed `ControlKiosk` in `src/lib/control.ts`; kiosks now send their `?page=` pin (`controlEventsUrl`); `kiosksOf(control)` reads the list from the page's one `useControl`. |

Tests added: `tests/lib/inheritance.test.ts` (every state at every level, kept overrides, two-level data, page font),
`tests/components/studio/inheritance-actions.test.ts` (reset / customise effects, lock and unlock, jump targets),
registry cases in `tests/server/control.test.mjs` and a route case in `tests/server/server.test.mjs`, page-font
round-trip in `profile-file.test.ts`, `resolveFont` in `general.test.ts`, the ping and state in `data-api.test.ts`.
One existing test changed: `control.test.mjs` "survives a missing or broken control.json" pins the whole public
state, which now has `kiosks: []`.

### Deviations

- **Icons are lucide**, as in the rest of the studio (Link2, Pencil, Lock, CircleDot, Box for link, edit, lock,
  adjust, deployed_code), not Material Symbols.
- **Dev route is `?ia-preview`**, following the existing `?ui-preview` / `?widget-qa` pattern, not `?studio=1&dev=chips`.
- **Latency is a new 15 s ping.** Sensor data is SSE; there is no existing poll to time. The ping is the same request
  as Test connection and runs only while the page is visible.
- **Screen "Customise here" on a widget-style section copies only the keys All screens sets.** Writing the built-in
  values would override widget kinds' own defaults (a Clock's 24 h, the cards' surface). With nothing set above, the
  shortcut changes nothing and editing a control customises, as the spec allows.
- **Two-level data at Page / Widget scope** reads as `inherited` from the screen (or All screens) and has no
  Customise or Reset (SPEC §4.2: no page level).
- **Tokens at All screens** read `base` when the theme or radius differs from the defaults, else `builtin` (the
  config always stores a theme).
- **Restart needed leaves out debug mode**: telling a forced `--debug` from a pending change needs `get_diagnostics`.
- **The chip's ⌫ shortcut is only shown**; the section card (Phase 3) binds the key.

### Unverified

- **Desktop status bar values.** `server_status`, `update_state` and `get_settings` are not in `STUDIO_PERMISSIONS`,
  so the first read is refused and the bar falls back to the page's own port with no LAN flag, no update and no
  restart item until a `server-status` / `update-state` event arrives. The restart item needs `get_settings`, which
  no event carries. Not run in the desktop app.
- The chip menu's submenu and focus return were checked in the browser only by opening with Enter.

### Follow-ups

- Phase 2: mount `StatusBar` with `useStatusBar(control, saveState)` from `studio-view.tsx` (the studio's existing
  `useControl`), wire `onOpenLive` to Live, and add the `data-nav-*` markers to the views `navigateTo` opens.
- Phase 3: replace the Follow bars with `InheritChip` + `useInheritance` (+ `InheritLockNote`); bind ⌫ on a focused
  section; implement `onMakeTheme`.
- Phase 4: the Typography section edits `profile.font` (Screen) and `general.font` (All screens); decide whether a
  saved Theme (`appearance-preset-apply.ts`) carries the font.
- Phase 5 (Settings › App): add `allow-server-status`, `allow-update-state` and `allow-get-settings` to
  `STUDIO_PERMISSIONS`; the status bar then has its first values without waiting for an event.
- Panel widgets ("Follows panel", AUDIT A4) have no chip level yet.
