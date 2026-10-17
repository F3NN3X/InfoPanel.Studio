# InfoPanel Dashboard

React 19 + Vite + Tailwind 4 + @base-ui/react + lucide-react. Tests: Vitest (`npm test`);
`npm run build` runs `tsc -b` then Vite. No linter, no state library (the config is one
`DashboardConfig` in `src/App.tsx`, history in `src/hooks/use-config-history.ts`).

## Studio redesign

The spec is in `docs/redesign/`. Read `README.md` → `DATA_MODEL.md` → `FEATURE_MAP.md` →
`IMPLEMENTATION_PLAN.md`. The prototype is `docs/redesign/reference/Studio A.dc.html`.

- When sources disagree: for **behaviour**, `reference/design-overview.md` and `DATA_MODEL.md`
  win; for **look and placement**, `README.md` and the prototype win. The prototype is a
  reference — do not copy its code.
- **No feature loss.** Every row in `FEATURE_MAP.md` must survive. When you remove an old
  component, list in the commit message where each of its features now lives.
- **Backward compatibility.** Existing configs (dashboard, profiles, zones, panels, presets)
  load and render unchanged. Never rename a setting key or change a default without a migration.
  The old legacy module ids are gone; zones that still carry one are migrated to their template on
  load (config v4, `src/lib/legacy-zones.ts`).
- **Model:** dashboard → profile → zone (widget / panel / blank). Widget minimum sizes are
  enforced everywhere.
- **Styling:** effective value = widget value (only when Custom and Force global is off) ??
  profile style ?? dashboard style ?? default. Follow keeps the widget's own values stored but
  ignored. Source dots reflect this resolution (`src/lib/style-resolve.ts`).
- **Inspector:** one registry drives it (module `settings` + general + panel + panel-widget
  kinds + dashboard). Do not hard-code per-widget panels.
- **Chrome vs theme:** studio chrome uses the `--ui-*` tokens; the dashboard theme only
  colours widgets on the canvas and the kiosk page.
- **Live data:** reuse `src/lib/sensor-store.ts` streams; never open an EventSource per row.
- **Undo:** one drag, one panel JSON apply, one appearance preset = one undo step each.
- **Keyboard:** shortcuts never fire while focus is in an input, select or textarea.
- **Save:** the studio auto-pushes to the server; the Save button flushes, and its dot means
  "edits not pushed yet".
- Work phase by phase; the app builds and tests pass at the end of each phase.

## Desktop app

InfoPanel Studio is a Tauri 2 shell in `src-tauri/` that runs the bundled Node and `server.mjs` and loads the
studio from the server. Docs: `docs/desktop/README.md` (build, settings, debug) and `TAURI_PLAN.md` (decisions,
IPC contract). The studio side is `src/lib/desktop.ts` (lazy Tauri imports, no-op in the browser); keep the
kiosk and browser bundles free of Tauri code.

- `npm run desktop:build` builds the studio into `.cache/desktop/dist` and never touches `dist/`, which a running
  server serves; `npm run build` does touch it.
- Rust checks, in `src-tauri/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
- Never stop the servers on 3921 (InfoPanel) or 3922 when testing. Use `INFOPANEL_STUDIO_CONFIG_DIR`,
  `INFOPANEL_STUDIO_DATA_DIR` and a spare port; for the agent toggle also point `USERPROFILE` at a temp folder.

## Widget library

Every widget is a template in `src/widgets/<Id>.tsx` rendered inside the `<Widget>` shell
(`src/widgets/core/`), registered through `templateModule` (`src/widgets/module.tsx`, registry in
`src/widgets/registry/`). `src/modules/` holds the shared module types, the standard settings and Other sensors. The
plan and decisions are in
`docs/redesign/PHASE9_PLAN.md`; the rendering path, skins and data adapter in `docs/architecture.md`.

- **Settings:** build them with `src/widgets/registry/settings-kit.ts`; every setting reaches the template
  through `toProps`. Schema tests (`registry/*.schema.test.ts`) guard each group.
- **Data:** templates get flat strings (`toFlat`) and display names (`names`, read with `sensorLabel`).
  A template that cannot name its keys is `readsAll`; one that needs no data belongs in `SENSORLESS`.
- **Fit:** no overflow at cell 110 and 150 in any skin or variant. Check with the `?widget-qa` page
  and `window.__qaOverflow()` (`docs/redesign/phase9/qa.md`, including the full-sweep script).

## InfoPanel import

Plan: `docs/infopanel-import/PLAN.md`, open gaps in `GAPS.md` (add a row when a phase leaves something out) (lab phases done; app phases A1–A8 follow the studio spec in
`docs/infopanel-import/studio/SPEC.md`, concept `Studio Lab.dc.html`). The model and logic are in `src/lib/infopanel/`;
the lab page in `lab/infopanel/` (`npm run lab`, `lab:test`, `lab:typecheck`) imports them and stays as a dev tool.
Internal imports there keep `.ts` extensions so the lab's Node scripts can load them.
