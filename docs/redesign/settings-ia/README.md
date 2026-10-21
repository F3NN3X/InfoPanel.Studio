# Handoff: InfoPanel Studio — settings & navigation reorganisation

**Start here, Claude Code.** This package reorganises where every setting lives in InfoPanel Studio (1.3.0-beta.7). It is a UI and information-architecture change. The data model stays, apart from the few changes listed in `SPEC.md` §11.

## What's in the package

| File | What it is |
|---|---|
| `SPEC.md` | The full spec: structure, every screen, components, behaviour, tokens, migrations, acceptance tests. **This is the source of truth.** |
| `IMPLEMENTATION_PLAN.md` | Phased order of work with checkpoints. Follow it. |
| `Studio IA.dc.html` | Clickable prototype. Open it in a browser (serve the folder: `npx serve docs/redesign/settings-ia`). The Tweaks panel has `platform` (desktop/browser), `startView`, `firstRun` and `annotations`. |
| `Studio IA Map.dc.html` | Sitemap, the full before → after table, naming, chip spec, narrow and phone layouts, and the open questions. |
| `InheritChip.dc.html`, `SettingRow.dc.html` | The two shared components, isolated. |
| `support.js` | The runtime that lets the `.dc.html` files open in a browser. Not app code. |

## About the design files

The files in `` are **design references written in HTML**, not production code. Rebuild them in Studio's existing stack (Tauri + React, Base UI / shadcn-style components, Tailwind, Geist / Geist Mono, Material Symbols Rounded) using the patterns that are already in the codebase. Do not copy the inline-style markup.

## Fidelity

**High-fidelity for structure, labels, copy and behaviour.** Visuals follow the studio's existing dark theme: use the existing Tailwind tokens wherever they match the values in `SPEC.md` §12. Mock data in the prototype (sensor values, names, IPs) is illustrative only.

## Rules

1. **Keep every behaviour and stored key that exists today.** This work moves, regroups and relabels. Anything new is marked **NEW** in the spec.
2. **One home per setting.** If a setting shows in a second place, that place is a **link** (`↗`) that navigates to the home. It is never a second editor.
3. Where the spec guesses a key or component name, find the real one in the code and use it. Record what you found in `IA_AUDIT.md` (see `IMPLEMENTATION_PLAN.md` phase 0).
4. Desktop-only items must be visibly absent or explained in the browser build. They must never be broken.
