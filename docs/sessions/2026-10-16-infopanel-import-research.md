---
title: InfoPanel profile import — research and Phase 0 plan
status: planned, awaiting answers to the plan's open questions; docs only, uncommitted on main
created: 2026-10-16
updated: 2026-10-16
tags: [infopanel, import, research, plan, data-api]
---

The session opened PR #30 (the desktop app) and squash merged it as `47b691c`. Before the merge, these all passed:
`npx vitest run` (3,496 passed, 1 skipped), `npx tsc -b`, `cargo fmt --check`, `cargo clippy` and `cargo test` (50).
The repo has no CI.

The rest of the session was research and planning for importing `.infopanel` profiles. No code was written. The
new docs sit untracked in `docs/infopanel-import/` on `main`.

Plan: `docs/infopanel-import/PHASE0_PLAN.md`.

## What shipped

- **Format reference** (`research-infopanel-format.md`): every DisplayItem type, the archive layout, and the C#
  render rules from the InfoPanel fork's source, with file:line citations.
- **Dashboard targets** (`research-dashboard-targets.md`): the zone/panel model, sensor keys, assets and fonts, and
  the retired prior art.
- **Corpus survey** (`corpus.md`): 14 sample exports in `G:\win_user-folders\Downloads\infopanel-profiles\`.
- **Phase 0 plan:** a standalone `lab/infopanel/` bench. It parses, maps sensors, loads fonts, renders, and compares
  the result against screenshots of InfoPanel itself. It also adds a small Data API change in the fork.

## What surprised us

- **This was built once and deliberately removed.** `ea1a63f`…`fffb966` held a 1:1 IP model, renderer, zip
  round-trip and C# parity fixes. `506c1d4` deleted them (2026-10-08, "No import path"). Port from `fffb966`;
  don't start from nothing.
- **InfoPanel quirks that break a naive port:**
  - Groups don't offset their children.
  - `Wrap=true` means a single line.
  - FontStyle beats Bold/Italic.
  - Colours are `#AARRGGBB`.
  - Gauge frames use banker's rounding.
  - The shape gradient animates at 300°/s by default.
- **Libre and HWiNFO sensor keys from the Data API are name slugs.** The native id is lost, so exact mapping needs
  the Data API to expose it (P0.3).
- **Subagent caveat:** the `researcher` agent type has no Write tool. Both researchers returned their findings
  inline, and the controller saved them.

## Decisions

- Validate in a lab before touching `src/`. Where imported profiles live (an `absolute` panel layout, or a revived
  free canvas) is decided only after the lab results (P0.8).
- Extend the Data API in the user's InfoPanel fork rather than guess mappings. The user approved changing the Data
  API if it makes import easier.
- FontScale and all profile fields are read per profile, never hard-coded, on the user's direction.

## Still open

- The four open questions at the end of `PHASE0_PLAN.md`: screenshots, the fork branch, the lab location, and
  porting the prior art.
- Commit the `docs/infopanel-import/` docs and this record on a feature branch. They were left uncommitted on
  `main`.
