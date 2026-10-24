# Testing

The suite guards what breaks the app or loses a user's data, and nothing else. In this repo that overrides any general coverage target, 80% included.

What counts as critical:
- config and profile load, save and migrations (every version keeps a round-trip case and its edge cases);
- schema validation of saved widget and panel data;
- server API routes, request guards, path safety and the updater manifest;
- InfoPanel import and export parsing, with the corpus round-trips;
- the settings and update model, and the changelog parse;
- the sensor data pipeline and the value formatting that feeds widgets;
- every registered widget kind rendering without throwing, once per kind;
- Help's content check, and Library remove and loose-file safety (never delete a used file).

Add a test when a change touches one of those or fixes a regression. Don't test copy, labels, styling or trivia.

- One case per behaviour, plus its boundaries. No size x variant x skin matrix sweeps; use a table only where each row hits a different branch.
- happy-dom only when the test needs a DOM.
- Tests live in `tests/`, mirroring `src/` and `tools/` (`src/lib/foo.ts` is tested by `tests/lib/foo.test.ts`).
- `npm test` stays under about 10 s locally.
- Rust tests live in their modules (`#[cfg(test)]`) and run in CI with `cargo test`. The server (`ips-server`) has its
  own: unit tests in its modules, route tests over a real socket (`crates/ips-server/tests/routes*.rs`) and parity tests
  (`tests/parity*.rs`) that read the frozen Node-server cases in `tests/fixtures/parity/` and are never regenerated.
  `ips-agent` has unit tests and a forwarder test over a real socket.
- `npm run test:server` builds `ips-server` and runs the HTTP suite in `tests/server/` against it; a plain `npm test`
  leaves that suite out. The server (`ips-server`) is the
  Rust code in `src-tauri/crates/ips-server`: its unit tests sit in its modules, and `tests/parity*.rs` read the frozen
  fixtures in `tests/fixtures/parity/` (output of the removed Node server, never regenerated).
- `tests/server/` (`npm run test:server`) is the HTTP-level server suite, run against the built `ips-server` binary
  (`SERVER_CMD` overrides the debug build). A plain `npm test` leaves it out because it needs that binary.
- The Playwright e2e specs (`tests/e2e/`, `npm run test:e2e`) cover what only a real browser and server show: the
  kiosk rendering, live updates over SSE, the studio's save and undo, the proxy and request-guard rules over HTTP, and
  the deterministic budgets. Keep them few. Perf specs (`tests/perf/`, `tests/desktop/`) measure and never gate.
