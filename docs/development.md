# Development

## Prerequisites

- Node.js 20 or newer (as stated in the [README](../README.md)).
- npm. The repo carries a `package-lock.json`; install with `npm install`.
- Rust stable, to run the server from source (`npm start`, `npm run test:server`) or build the desktop app.
- For live data, InfoPanel with its Data API enabled (default
  `http://127.0.0.1:3921`). Without it the dashboard still starts; zones show
  no data.

## Scripts

From `package.json`:

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `vite` | Vite dev server with hot reload on http://localhost:5173 |
| `npm run build` | `tsc -b && vite build` | Type-checks, then builds into `dist/` |
| `npm run typecheck` | `tsc -b` | Type-check only |
| `npm test` | `vitest run` | Runs the test suite once |
| `npm run test:e2e` | `playwright test --project=e2e` | Functional specs against `dist/` on a scratch server (build first) |
| `npm run perf:kiosk`, `perf:studio` | `playwright test --project=perf-…` | Idle and load measurements into `.cache/perf/<label>/` |
| `npm run perf:all` | build, perf specs, bundle and disk reports | A full perf run; `PERF_LABEL` names it |
| `npm run perf:compare <A> <B>` | `node tools/perf/compare.mjs` | Markdown table of two runs |
| `npm run qa:shots` | `node tools/audit/qa-shots.mjs` | A PNG per widget, span, view and skin from the Widget QA page into `.cache/qa-shots/<label>/` (build first); `-- --compare <A> <B>` writes a side-by-side page of two runs. Report-only ([redesign/phase9/qa.md](redesign/phase9/qa.md)) |
| `npm run perf:budgets` | `node tools/perf/check-budgets.mjs` | The deterministic bundle budgets (CI) |
| `npm run test:one-editor` | `playwright test --project=one-editor` | The Edit v3 reference states: opens each `?fixture=one-editor/<name>` (`src/dev/fixtures`) on a scratch server, after building `.cache/dist-fixtures` itself (`vite build --mode fixtures`, also `npm run build:fixtures`). Release builds leave the fixtures out |
| `npm run build:stats` | `vite build --mode stats` | An unminified build in `.cache/dist-stats` with the ticker's debug stats (`window.__tickerStats()`); serve it with `DASHBOARD_DIST` |
| `npm run lint` | `biome lint` | Lints with Biome (`biome.json`: the recommended rules, minus the ones this codebase deliberately does differently; the formatter is off). CI runs `npx biome ci` |
| `npm start` | `node tools/start.mjs` | Builds `dist/` when it is missing, then runs `cargo run --release -p ips-server` (Rust stable needed): serves `dist/` and the config endpoints |
| `npm run serve` | `npm run build && node tools/start.mjs` | Build, then start |
| `npm run verify`, `verify:full`, `verify:plan` | `node tools/verify.mjs` | Runs the checks the changed files need, every check, or only prints the plan |
| `npm run test:server` | `node tools/parity/test-native.mjs` | Builds the debug `ips-server`, then runs `tests/server` against it (`SERVER_CMD` points at another binary) |

InfoPanel import lab (`lab/infopanel/`, a dev tool over `src/lib/infopanel/`; see its
[README](../lab/infopanel/README.md)): `npm run lab` (page on http://localhost:5174),
`lab:test`, `lab:typecheck`, and the Node tools `lab:extract`, `lab:map`, `lab:fonts`
and `lab:font-get`. `npm run lab:build` (part of `npm run build` and `desktop:web`) writes the page to `dist/lab/`, which
ips-server serves at `/lab/` in debug mode only; the built page has none of the dev-server endpoints (corpus, installed
profiles, gauge library, asset store, font proxy), only the files you open.

## Desktop app scripts

| Script | What it does |
|---|---|
| `npm run desktop:web` | `tsc -b`, then builds the studio into `.cache/desktop/dist` |
| `npm run desktop:prepare` | Builds the release `ips-agent.exe` and fills `src-tauri/resources/` with it and the built studio |
| `npm run desktop:build` | `desktop:web`, `desktop:prepare`, then `tauri build` (NSIS installer in `src-tauri/target/release/bundle/nsis/`) |
| `npm run desktop:dev` | The same two steps, then `tauri dev` |

`desktop:build` never writes `dist/`. `npm run build` does, and a running
dashboard server serves `dist/`, so don't run it while the live server is up
unless you mean to update it.

The app needs Rust stable (MSVC), Visual Studio 2022 Build Tools with
"Desktop development with C++" and the Windows SDK. Checks, run in `src-tauri/`:
`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
To run the app without touching the live setup set `INFOPANEL_STUDIO_CONFIG_DIR`
(settings and logs), `INFOPANEL_STUDIO_DATA_DIR` (the server's `DASHBOARD_DATA_DIR`),
`INFOPANEL_STUDIO_DEBUG=1` and a spare port in `settings.json`; never stop
the servers on 3921 or 3922. See [desktop/README.md](desktop/README.md).

## Verifying a change

`npm run verify` runs the checks the changed files need (the feature map and the modes are in [TESTING.md](TESTING.md)).
Run `npm run verify:full` before opening a pull request. Optionally, `git config core.hooksPath .githooks` enables
`.githooks/pre-push`, which runs `node tools/verify.mjs --check-fresh` and, if the last run is stale, `npm run verify`.

## CI and releases

`.github/workflows/ci.yml` runs on every pull request, and on `main` when the dependencies or `src-tauri/` change. On `main`
it runs only `server` and `rust`, the jobs whose Rust and npm caches PRs restore, since every change already passed in its PR.
Its `plan` job asks `node tools/verify.mjs --plan --json` which checks the change needs, so a docs change runs almost
nothing and a widget change skips Rust. The jobs: `lint` (Biome, and actionlint when `.github/` changed),
`typecheck-build` (`tsc -b`, the build, the Settings build, the bundle budgets), `unit` (the whole Vitest suite),
`lab`, `server` (Linux: `npm run test:server`, `cargo test`/`clippy` for `ips-server` and `ips-agent`), `e2e`
(Playwright against the built pages and a debug `ips-server`, in `.github/actions/e2e`) and `rust` (Windows: the same
Rust tests for the server crates, plus the Tauri app's `cargo test` and `clippy --workspace` when the app crate is
involved). `ci-ok` is the one required check: it passes when every job that ran passed. The e2e specs are slow, so a pull
request runs them only with the label `ci:e2e`; the release runs them before it publishes, and the nightly every night.
The label `ci:full` runs everything. On
the Windows runner `tools/ci-stub-desktop.mjs` replaces `npm run desktop:prepare`: tauri-build only checks that the
bundled resources exist.

`.github/workflows/nightly.yml` (23:30 UTC, 01:30 in Oslo in summer) runs every check on Linux and Windows, an unsigned
installer build, and the perf suites (report-only, with a table against the previous night). One issue, "Nightly
failing", follows its result. A scheduled night with `main` still on the last green nightly's commit skips (a manual run
always runs).

`.github/workflows/release.yml` runs when a tag `vX.Y.Z` is pushed. It fails unless the tag matches `version` in
`package.json` and `CHANGELOG.md` has a `## [X.Y.Z]` section, and unless CI vouches for the commit (a green `ci-ok` on it
or on the pull request that merged it, or the last green nightly: `tools/ci/release-gate.mjs`). Then `npm run desktop:build`
on `windows-latest` and the e2e specs on Linux run side by side, and once both pass it creates a GitHub release with that
section as its notes and the NSIS installer (`InfoPanel Studio_<version>_x64-setup.exe`) attached. The unit and Rust
tests don't run again: the gate already requires them green. No test depends on the machine's locale.

`main` takes changes only through pull requests: its ruleset requires `ci-ok` and blocks deleting the branch.

To release, on a branch: bump the version in `package.json`, `package-lock.json` (both `version` fields),
`src-tauri/Cargo.toml`, `src-tauri/crates/ips-server/Cargo.toml`, `src-tauri/crates/ips-agent/Cargo.toml` and the
three matching entries in `src-tauri/Cargo.lock` (`cargo check --workspace --locked` confirms the lockfile), and move
the **Unreleased** entries in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`. Open a pull request, merge it once
`ci-ok` is green, then tag the merge commit on `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`.

A pull request that changes only those version fields (and the CHANGELOG) does not run the full suite or e2e: `verify` and the
CI `plan` job route the manifests to the `release-version` feature, which runs `cargo-server` only.

If the release changes the `.infopanel` writer or the InfoPanel schema, also run `import-check` first on a PC with the
InfoPanel source (CI can't; see [TESTING.md](TESTING.md#the-infopanel-export-check)) and make sure it passes.

## Dev server vs the standalone server

**Standalone server (`ips-server`, `src-tauri/crates/ips-server`).** Serves the built `dist/`, stores the
studio config and uploaded media, streams config changes to kiosk pages and
proxies cover-art images. It is the same code the desktop app runs inside its own
process; the media routes are in `src-tauri/crates/ips-server/src/assets.rs`. Environment variables it reads:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3922` | Listen port |
| `HOST` | `127.0.0.1` | Listen address |
| `LOCALAPPDATA` | - | The config is `%LOCALAPPDATA%\InfoPanel\Dashboard\config.json`. If unset, `$HOME/.local/share/InfoPanel/Dashboard/config.json` |
| `ALLOW_REMOTE_UPLOAD` | unset | `1` accepts media uploads and deletes from other machines; otherwise only from loopback (the server answers 403) |
| `ALLOW_REMOTE_EDIT` | unset | `1` accepts config and integrations writes from other machines; otherwise only from loopback (403). Control and reads stay open |
| `ALLOWED_HOSTS` | unset | Extra `Host` names to serve, comma separated (e.g. `kiosk.lan,panel.example`). Without it only `localhost`, `127.0.0.1`, `[::1]` and `HOST` are served (421 otherwise); with `HOST=0.0.0.0` any IP address and the machine name work too |
| `ASSETS_MAX_BYTES` | `2147483648` | Cap on the total size of the uploaded media; an upload that would pass it gets 507 |
| `DASHBOARD_DIST` | `dist` in the working directory (`npm start` sets the repo's) | The built app to serve (the desktop app points it at its bundled copy) |
| `DASHBOARD_DATA_DIR` | `%LOCALAPPDATA%\InfoPanel\Dashboard` | Where `config.json`, `assets` and the other state files live; takes precedence over `LOCALAPPDATA` (use a temp folder for tests) |
| `DASHBOARD_DEBUG` | unset | `1` logs every request (method, path, status, ms) and SSE connect/disconnect per channel, and serves `GET /api/debug/stats` (memory, uptime, SSE clients, the runtime's tasks and workers, timer delay) to this machine only |

Uploaded images and videos go to an `assets` folder next to `config.json`
(`%LOCALAPPDATA%\InfoPanel\Dashboard\assets`), created on the first upload.
Files are named by content hash; deleting one by hand breaks every config
that refers to it, so prefer the studio's library (it can list what the saved
config no longer uses). Copy the folder along with `config.json` to move a
dashboard to another machine. Routes and security rules are in
[architecture](architecture.md#uploaded-media-cratesips-serversrcassetsrs-srclibassetsts).

It answers 503 for pages until `dist/` exists, so run `npm run build` once
(or use `npm run serve`). Endpoints are listed in the README.

**Vite dev server.** `npm run dev` serves the source with hot reload. The
config store and image proxy live in the standalone server, so Vite forwards
`/api` and `/events/config` to `http://127.0.0.1:3922` (`vite.config.ts`).
Start `npm start` in a second terminal, otherwise the dev page cannot load or
save the config. Sensor data is not proxied: the page reads the Data API
directly, using the `dataApiUrl` from the config. Uploads work through the
proxy too (`/api/assets`, including `Range` requests for video); the server
sees them coming from the proxy on loopback.

Because a non-kiosk page loads the server's config on open and then pushes
every change back, a dev page and the standalone dashboard share one config
(see "Sync" in [architecture](architecture.md#3-config)). For experiments,
run a second server with its own config instead of using the live one:
`PORT=3999 LOCALAPPDATA=<some folder> npm start`.

**Windows launcher (`start-dashboard.bat`).** Double-click it to start the
standalone server. It checks that Node is on PATH (it builds the web app), runs `npm ci` when
`node_modules` is missing, runs `npm run build` when `dist\index.html` is
missing, then runs `src-tauri\target\release\ips-server.exe` when it exists, else
`cargo run --release -p ips-server`. `start-dashboard.bat rebuild` builds
before starting. Set `PORT` / `HOST` beforehand to change where it listens. On
an error it pauses so the window stays open.

## Build output

`vite build` writes `dist/`. The Vite `base` is `./`, so the build works from
any path. `dist/` is git-ignored, as are `node_modules/`, `*.tsbuildinfo` and
`*.log`.

## Tests

Vitest, run with `npm test`. Most tests exercise pure logic, or render with
`renderToString` in Node. A component test that needs a DOM opts in per file with
the docblock pragma `// @vitest-environment happy-dom` on its first line, and uses
Testing Library (`@testing-library/react`, `@testing-library/user-event`); there
is no global DOM switch. `tests/setup/dom-setup.ts` (in `test.setupFiles`, a no-op in
Node) stubs `matchMedia`, `ResizeObserver` (reports 800 x 600), `IntersectionObserver`
and `URL.createObjectURL`, and unmounts rendered trees after each test.
`setViewport(width)` from that file sets the width `matchMedia` answers for (1280
by default, reset before each test) and fires `change` on the queries it flips, so
call it inside `act` to cross a breakpoint after render. Assertions use plain
matchers (no jest-dom). Tests sit beside the code they cover:

| Area | Test files |
|---|---|
| Sensor streaming | `tests/lib/sensor-stream.test.ts` (merging, namespaces, stream planning), `tests/lib/sensor-store.test.ts` (reference counting, reconnects, discovery) |
| Data API | `tests/lib/data-api.test.ts`, `tests/lib/catalog.test.ts`, `tests/lib/sources.test.ts`, `tests/lib/sensors.test.ts` |
| Readings | `tests/lib/system-metrics.test.ts` (System widget readings, thresholds, units), `tests/lib/image.test.ts` |
| Widget style | `tests/components/widget-style.test.ts` (zoom, `--wp-*` variables, `chromeOf`, `surfaceBox`, scoped CSS, profile style) |
| Config and appearance | `tests/lib/layout.test.ts` (`mergeConfig` migration and guards), `tests/lib/panel-model.test.ts`, `tests/lib/style-resolve.test.ts` (style layers), `tests/lib/appearance-presets.test.ts` (applying, overrides, saved looks), `tests/lib/theme.test.ts` (profile theme over the dashboard's), `tests/lib/general.test.ts` (general settings, clock formatting), `tests/lib/profile-grid.test.ts` (gap / padding defaults and the track math for gaps 0, 12 and 24) |
| Studio | `tests/components/studio/placement-content.test.ts` (per-zone prefixes and content), `tests/components/studio/inspector-model.test.ts` (tabs, sections, search, Advanced, source dots) and `inspector-categories.test.ts` (every module's settings resolve to a known category), `studio-layout.test.ts` (Side / Bottom / Auto, fit zoom), `use-studio-shortcuts.test.ts`, and the other `*.test.ts` beside the studio modules (commands, zone geometry, studio and appearance actions, the explorer model, …) |
| Data layer and history | `tests/lib/data-points.test.ts` (normalising the catalog, health, search), `tests/lib/data-usage.test.ts` (Used by, bind / unbind), `tests/lib/sample-history.test.ts`, `tests/lib/fonts.test.ts` (the font catalog), `tests/hooks/config-history.test.ts` (undo stacks, coalescing, transactions) |
| Page background and media | `tests/lib/appearance.test.ts` (background layers, video style and `videoPolicy`), `tests/lib/assets.test.ts` (upload / library requests with a mocked `fetch`) |
| InfoPanel import | `tests/lib/infopanel/**/*.test.ts` (parsing, formatting, fonts, canvas model and editing, remap, export, gauges, assets; a few read the lab's gitignored `corpus/` and skip without it), `tests/lib/gauge-studio/`, `tests/widgets/registry/*.schema.test.ts` (settings schema per widget group) |
| Component (DOM) | `tests/components/gauges/gauges-page.test.tsx` (open a gauge, toggle a part, the Save / Discard / Cancel dialog, details pane vs sheet) |
| Server | `tests/server/*.test.mjs` (`server`, `alerts-http`, `data-roundtrip`): HTTP cases against a running `ips-server`. `npm test` skips them; `npm run test:server` builds the server and runs them (`SERVER_SUITE=1`). The server's own Rust tests are in `src-tauri/crates/ips-server/` (`cargo test`) |

`npm test` prints the current number of test files and tests; all of them
should pass.

### Playwright suites

`playwright.config.ts` has four projects; every spec starts its own scratch server on a temp copy of
`tests/fixtures/perf/data` with a fake Data API (`tools/perf/scratch.mjs`), so none touches the real data.

| Project | Specs | Runs |
|---|---|---|
| `e2e` | `tests/e2e/*.spec.ts`: kiosk render (incl. the gauge icon), live config update, control page switch, studio edit/save/undo, image-proxy rules, request guard, kiosk request budget, the visualiser after a hide and remount, the studio in a browser tab, cross-origin writes refused, the frozen Design preview | `npm run test:e2e`, in CI |
| `one-editor` | `tests/visual/one-editor/*.spec.ts`: each Edit v3 fixture opens in Edit; its reference checklist is skipped until the phase that builds it | `npm run test:one-editor`, in CI |
| `perf-kiosk`, `perf-studio` | `tests/perf/*.perf.ts`: `kiosk-idle`, `server-idle`, `studio-idle`, `studio-hot-cold`, `studio-unfocused`, `studio-frozen` | `npm run perf:kiosk` / `perf:studio`, report only |
| `desktop` | `tests/desktop/*.desktop.ts`: the debug build over CDP (`tray-close-releases-webview`, `studio-idle-webview2`, `studio-unfocused-webview2`, `studio-in-browser`, `server-soak`) | Windows, by hand: see [desktop/README.md](desktop/README.md#testing-without-touching-the-live-setup) |

The method, the fixture and the reports are in [performance.md, "The harness"](performance.md#the-harness).
Regenerate the fixture with `node tools/perf/make-fixture.mjs` after a config version bump.

## Typecheck

`npm run typecheck` runs `tsc -b` with the project's own TypeScript
(`~5.6.2`). If you call `tsc` directly, use the local binary:

```bash
./node_modules/.bin/tsc -b
```

A newer global TypeScript can reject `tsconfig.json`: TypeScript 6 stops with
`TS5101: Option 'baseUrl' is deprecated` because the config sets
`"baseUrl": "."` (used for the `@/*` path alias).

## Adding a widget

1. Create `src/modules/<name>.tsx` with the module (`id`, `title`,
   `minCols`/`minRows`, `prefixes`, optional `reads`, `settings`, `render`,
   optional `isIdle`) and register it in `src/modules/index.ts`.
2. For an adaptive widget, spread `STANDARD_SETTINGS` into `settings`, build
   the `chrome` prop with `chromeOf(cfg)`, wrap the component in
   `ModernChrome`, and size its `designSize` from what it shows. The three
   steps are in
   [widget-settings.md, "Adopting the standard block"](widget-settings.md#adopting-the-standard-block-new-widget).
3. Add a row to [module-catalog.md](module-catalog.md), and a unit test for
   any logic that reads sensor keys (see `tests/lib/system-metrics.test.ts`).

The studio inspector needs no code for the new widget's options: each
`ModuleSetting` in `settings` is filed into a section by its `group` and into
a tab by `tab` (or by its category), and can be `advanced`, carry a `hint`, or
show only while `visibleIf(values)` holds. See [architecture.md, "Adding a
setting to a module"](architecture.md#adding-a-setting-to-a-module). The
category test fails for an unfiled option.

`prefixes` and `reads` decide which streams the zone opens and which changes
re-render it; see [architecture](architecture.md#2-per-zone-rendering).

## Verification checklist

Before calling a change done:

1. `./node_modules/.bin/tsc -b` exits 0.
2. `npm test` exits 0.
3. `npm run build` exits 0.
4. Start the server (`npm start`) and look at the result in kiosk mode,
   `http://127.0.0.1:3922/?kiosk=1&profile=<id>`:
   - in a **small** zone (about 2 x 1 cells), where the compact or simple
     layout should appear and nothing should overflow;
   - in a **large** zone, where the content should scale up to fill it;
   - with the widget's options toggled in the studio (`/?studio=1`), then
     **Save** and check that the kiosk page updates without a reload.
5. If the change touches the stream code, open the browser's network panel
   and check that there is one `/events?prefix=…` request per namespace and no
   more than four sensor streams.
6. `git diff --stat` lists the files you meant to change.
