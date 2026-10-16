# InfoPanel import lab

Phase 0 of the `.infopanel` import (`docs/infopanel-import/PHASE0_PLAN.md`): parse InfoPanel exports and redraw
them at native size, then compare against InfoPanel's own render. Nothing here is imported by `src/`, and nothing
here reaches `npm run build`, `desktop:build` or the app's `tsc -b`.

| Command | What it does |
|---|---|
| `npm run lab:extract -- [folder]` | Extracts every `.infopanel` in `folder` into `corpus/` (gitignored) |
| `npm run lab` | Lab page on <http://localhost:5174> |
| `npm run lab:test` | The lab's Vitest suite |
| `npm run lab:typecheck` | `tsc` over `src/` with the lab's own tsconfig |

The default corpus folder is `G:\win_user-folders\Downloads\infopanel-profiles`; override it with the argument or
`INFOPANEL_CORPUS`. Tests that read the corpus skip when it has not been extracted.

Layout: `src/` holds the lab code and its tests, `scripts/` the Node tools (run with Node's built-in type
stripping, so they can import `src/*.ts`).

## Parser (P0.2)

| File | Role |
|---|---|
| `src/zip.ts` | Read-only zip reader (`DecompressionStream`) |
| `src/xml.ts` | Minimal XML reader for XmlSerializer output, no DOM needed |
| `src/schema.ts` | Every serialized field per item type, with C# defaults and setter checks; the types derive from it |
| `src/parse.ts` | `Profile.xml` / `DisplayItems.xml` → typed items plus an issue report |
| `src/archive.ts` | Opens a `.infopanel` or extracted folder; assets stay lazy |

Parsing follows XmlSerializer: a missing element keeps the C# default, a value a setter rejects keeps the default,
and the first occurrence of an element wins. Where InfoPanel would refuse the whole file (a bad number, an unknown
enum or item type) the lab keeps going and reports it. Fields from other InfoPanel versions are kept in
`item.unknown` and reported.

`src/corpus.test.ts` checks every corpus profile against `src/__fixtures__/corpus-expected.json`, an independent
survey written by `python -I lab/infopanel/scripts/corpus-expected.py`. Re-run it after the corpus changes.
