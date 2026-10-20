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
- `npm test` stays under about 10 s locally.
- Rust tests live in their modules (`#[cfg(test)]`) and run in CI with `cargo test`.
