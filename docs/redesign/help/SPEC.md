# InfoPanel Studio — In-app Help

Implementation and content-verification spec for Claude Code.

**Package contents**
- `Help.dc.html`: the reference design. Open it in a browser; it needs `support.js` and `help-content.js` next to it.
- `help-content.js`: all help text as structured data (26 articles in 8 groups). **This is a draft.** Some of it was written from design briefs, not from the shipped code, so you must check it against the codebase (§4).
- `App Settings.dc.html`: the Settings window. Help shares its layout, and Help's "Open Settings ›" buttons link into it.
- `SPEC.md`: this file.

There are two jobs:
1. **Build** the Help window in the app (§2–3).
2. **Verify and update** every article against the code as it is today (§4–6). Do this before or alongside the build; the UI is useless if the text is wrong.

---

## 1. Goals

- Explain every user-facing feature of the app in one place, organised the way users think (Start here → Build → Style → Data → Import → Run → Troubleshoot → Reference).
- The same window shell as Settings: a sidebar with search and grouped nav, and a content column.
- Content is **data, not markup**. Articles live in one structured file that is easy to diff, review and keep in sync with the code.
- Fast search across titles, headings and body text, which jumps straight to the matching heading.

---

## 2. Window and layout

Mirror the Settings window (see `handoff_app_settings/SPEC.md` §2 and §7 for tokens).

```
┌ title bar 36px ─────────────────────────────────────────────────────┐
│ sidebar 248px     │ main (scrolls)                                  │
│  search (Ctrl K)  │  Home | Search results | Article                │
│  Help home        │                                                 │
│  GROUP            │  Article: breadcrumb · icon + H1 · lede         │
│   article         │           blocks…            │ On this page     │
│   article         │           Related · Prev/Next│ (TOC rail)       │
│  …                │                                                 │
│  ───────────────  │                                                 │
│  Open Settings  v │                                                 │
└───────────────────┴─────────────────────────────────────────────────┘
```

### 2.1 Entry points
- The tray menu → **Help**
- The studio's help button or menu → **Help** (opens Help home)
- `F1` anywhere in the studio or Settings → Help. **Context-sensitive:** open the article for the current section (see the map in §2.6).
- The Settings sidebar footer: add a **Help** link next to the version.
- Error callouts in Settings (port in use, can't connect, …) get a **Learn more** link to the matching article and heading.

It can be a separate window or a route in the studio webview; your call. Separate is preferred, so Help can sit next to the studio.

### 2.2 Sidebar
- **Search**, with the placeholder "Search help". `Ctrl/Cmd+K` focuses it; `Esc` clears it.
- **Help home** (`home` icon).
- **Nav groups**: an uppercase 10.5px label, then one item per article (Material Symbols icon + title). The active item has background `#1c1c22`, text `#ededf0`, and an accent icon.
- **Footer**: **Open Settings** and the app version.
- Every button has `flex: none`, so items don't shrink inside the scrolling column.

### 2.3 Home
- H1 "How can we help?", a one-line subtitle, and a large search field bound to the same query as the sidebar.
- **Start here**: three cards (Welcome, Quick start, Core concepts), each with an icon tile, title and lede.
- **All topics**: a card per group (excluding Start here), listing its articles.

### 2.4 Search results
- Shown in main whenever the query isn't empty; the nav stays visible.
- Matching: all words must appear (case-insensitive) in `article title + section heading + section body text`, with markup stripped.
- Index entries are per section: the lede plus the text before the first `h` is one entry, then one entry per `h`.
- Score: +3 per word in the title, +2 per word in the heading. Keep the top 30.
- A result shows the article icon, `Title › Heading`, a ~170-character snippet with the first match highlighted (`<mark>`, accent 25% background), and the group name.
- Clicking opens the article **scrolled to that heading**.
- Empty state: "Try fewer or different words, or browse all topics."
- Nice to have: also index the **Settings search index** (App Settings spec §8). Those results show a `settings` icon and open Settings at that section.

### 2.5 Article
- Breadcrumb: `Help › <Group>`.
- Title row: a 42px icon tile and the H1 (26/600), top-aligned so a wrapped title doesn't collide with the lede.
- Lede: 15.5px, `#b4b4bd`.
- Blocks (§3.2).
- **Related**: cards from `related[]`.
- **Previous / Next**, in nav order.
- **On this page**: a sticky TOC rail of the `h` blocks.
  - Only show it when the article has 2 or more headings **and** the main pane is at least 1000px wide. Measure it with a ResizeObserver on the scroll container.
  - Scroll-spy: the active heading is the last one whose top is above `scrollTop + 80`. Nothing is highlighted before the first heading.
- When you open an article, the scroll position resets to the top (or to the anchor).
- Deep links: support `help://<articleId>#<headingSlug>` (or a route equivalent), so other UI can link to a specific heading. Use slugs of the heading text, not the mock's `h0, h1…`.

### 2.6 Context map for F1 / Learn more

| Where the user is | Opens |
|---|---|
| Studio, nothing selected | `themes` |
| Studio, widget zone selected | `widget-settings` |
| Studio, panel zone selected | `panels` |
| Studio, canvas zone selected | `canvas` |
| Studio, Profiles drawer | `profiles` |
| Import dialog | `import` |
| Remap step | `remap` |
| Settings › General | `startup` |
| Settings › Server | `kiosk` |
| Settings › Coding agents | `agents` |
| Settings › Updates | `updates` |
| Settings › Diagnostics, Logs | `diagnostics` |
| Server error callouts | `problems#the-server-wont-start-port-in-use` (or `#the-display-says-it-cant-connect`) |

---

## 3. Content format

### 3.1 File shape

```js
{
  groups: [ ['Group label', ['articleId', …]], … ],   // nav order = reading order
  articles: {
    articleId: {
      title: string, icon: string /* Material Symbols name */, lede: string,
      blocks: Block[], related: string[]   // article ids
    }
  }
}
```

**Recommended for the real app:** move from `window.HELP_CONTENT` in a JS file to **one Markdown file per article** with front-matter, e.g.

```md
---
id: kiosk
title: Kiosk and server
icon: dns
group: Run
order: 1
related: [startup, problems, diagnostics]
verified: 1.2.0
---
The local server hosts your dashboard…   ← first paragraph = lede
## The kiosk URL
…
:::tip
…
:::
```

Then use a small build step (or runtime parser) that maps it to the block types below. Markdown is easier to review and to keep in sync. If you keep the JS form, keep the block DSL exactly as in §3.2.

### 3.2 Block types

| DSL | Markdown equivalent | Renders as |
|---|---|---|
| `['h', text]` | `## text` | H2 18/600; becomes a TOC entry and an anchor |
| `['p', text]` | paragraph | 14px / 1.7, `#d0d0d6` |
| `['ul', [..]]` | `- item` | bullets |
| `['ol', [..]]` | `1. item` | numbered steps with 22px circled numbers |
| `['table', head[], rows[][]]` | GFM table | card table; first column bright; scrolls horizontally when narrow (minimum width 520px for 3+ columns) |
| `['tip'|'note'|'warn', text]` | `:::tip` / `:::note` / `:::warn` | callout: green "Tip" (lightbulb), blue "Note" (info), amber "Heads up" (warning) |
| `['keys', [[combo,label]..]]` | `:::keys` + `combo — label` lines | 2-column grid of label + keycaps. `Ctrl+Shift+G` splits on `+`; `Ctrl +` splits on the space |
| `['flow', [[title,desc]..]]` | `:::flow` | numbered step cards with arrows; wraps |
| `['open', label, href, icon]` | `:::open settings/server` | button "Open Settings › Server ↗" that deep-links into the app |

Inline markup inside any text: `` `code` ``, `**bold**`, `[label](articleId)` or `[label](articleId#heading-slug)`.

In the real app, `open` targets must be **app routes** (for example `settings://server`), not the mock's `App Settings.dc.html`.

---

## 4. Content verification (the main task)

The draft was written from the design briefs below, **not** from the running app:
- `design-overview.md` (widgets, panels, layouts & presets, styling model, as of 2026-10-12)
- `handoff_widget_settings_v2/SPEC.md` (Show / Style / Data / Behaviour tabs, Follow theme, locks)
- the InfoPanel Import Lab brief (import, canvas, remap, assets, gauges)
- `handoff_app_settings/SPEC.md` (Settings window)

Some of that is **planned, not shipped**. Every statement must be checked against the code on the current branch.

### 4.1 Procedure, per article

1. **Find the code** behind each claim. Search for UI labels, setting keys, registry entries, defaults, shortcuts and limits.
2. **Classify** each statement:
   - ✅ **Correct**: leave it.
   - ✏️ **Wrong detail** (label, number, default, name, path, shortcut): fix the text to match the code. **The code wins.**
   - 🚧 **Not shipped yet** (designed but missing): remove it, or move it to a `planned` list in the report. Don't document unshipped features.
   - ➕ **Missing**: a shipped user-facing feature with no coverage. Add it to the best-fitting article, or add a new article (§4.4).
3. **Use the app's own words.** Button labels, section names and menu items must match the UI exactly, including case. Bold them.
4. **Re-check cross-links**: every `[label](id)` and `related` id must exist; every `open` target must be a real route.
5. **Stamp it**: set `verified: <app version>` on the article.

### 4.2 Known risk areas (check these first)

| Article | Claim to check | Why it's risky |
|---|---|---|
| `widget-settings`, `themes` | Four tabs **Show · Style · Data · Behaviour**, per-section **Customize / Use theme**, **Lock** in the profile theme, **More** rows, colour roles, Small zones `auto/full/card/dense` | This is the **v2 model**. If v2 hasn't landed, rewrite for the shipped model: **Content · Style · Data** tabs; general cards Widget, Size & alignment, Typography, Spacing & shape, Colors & surface, Border & effects, Advanced; **Follow global / Custom**; **Force global style**; setting dots. |
| `widgets` | The 17-row widget list, minimum sizes, data sources | The brief lists 16 modules plus Other sensors; the settings audit counted 54 widget definitions. Generate the table **from the widget registry** (§5) instead of by hand. |
| `import`, `canvas`, `remap`, `assets`, `gauges` | The whole Import from InfoPanel group | Written from the **Lab brief**. The canvas zone may not be integrated in the studio yet. If not shipped, remove the group (or hide it behind the same feature flag as the feature). |
| `studio` | Drawer tabs **Add / Layers / Profiles**, inspector **Side / Bottom / Auto**, `Ctrl+\`, **Save** dot, `Ctrl+S` | Check the names and that `Ctrl+S` exists. |
| `kiosk`, `startup`, `updates`, `diagnostics` | Settings labels, Start/Stop, auto-restart ("3 tries a minute"), release channel, background download, LAN option, Logs viewer | From the **new Settings design**. Match whatever has actually been built from `handoff_app_settings`; remove anything not built yet. |
| `quickstart` | Default port `3922`, kiosk URL `/?kiosk=1`, the InfoPanel step ("add a web or browser item") | Check the exact InfoPanel item name and how to add it. |
| `sensors` | Data API port `3921`, the **Connection** section name, prefix claims (`system.cpu…`) | Check the defaults in config. |
| `agents` | File paths, "runs InfoPanel Studio's own Node", the **Needs repair** status, **Repair hooks** | The status chips and the Repair button come from the Settings design. Check they exist. |
| `profiles` | Shipped profiles table, default gap 12 px, Scroll row height 120 px, new-profile grid sizes | Generate from the bundled profiles. |
| `presets` | Layout starters, panel presets, the 9 appearance presets, **Replace the page background** | Generate from the preset registries. |
| `panel-widgets` | 10 kinds and their options; history 5–200 | Generate from the panel widget kind registry. |
| `custom-css` | Class names, CSS variables, `@scope` behaviour | Grep the stylesheet and renderer for every selector and variable listed. Remove any that don't exist. |
| `background` | Video pause-when-hidden, reduced-motion poster | Check them in the renderer. |
| `shortcuts` | Every combo | Grep the keybinding handlers. Remove what doesn't exist; add what's missing. |
| `problems` | Fix steps and the button labels they mention | Must match real error messages and UI. |

### 4.3 Things you must never document
- Internal keys, file formats or APIs, unless the user sees them in the UI (paths shown in Settings › About are fine).
- Developer-only flags, debug endpoints or test pages.
- Exact numbers that change often, such as sensor counts or version numbers in prose. Pull those from app data at runtime if needed.

### 4.4 Adding an article
- Pick the group by the user's task, not by code module.
- Id: kebab-case, stable forever (it is used in deep links).
- Structure: a one-sentence lede saying what it is or what you can do → H2s ordered by task → tables for option lists → one callout at most per H2.
- Add 2–3 `related` ids. Add the article to the §2.6 context map if a screen should open it.

---

## 5. Generate, don't hand-write, where possible

These sections go stale fastest. Have the build (or runtime) fill them from the same registries the app uses:

| Article / block | Source |
|---|---|
| `widgets` › widget table | widget/module registry: display name, min size, data source description |
| `panel-widgets` › kinds table | panel widget kind registry |
| `presets` › layout starters, appearance presets | preset registries |
| `profiles` › shipped profiles | bundled profile files |
| `shortcuts` | the keybinding map (give each binding a `label` and a `scope`) |
| `custom-css` › hooks and variables | an exported list from the renderer |
| `about`-style facts (ports, defaults) | the settings defaults object |

Use a placeholder block, e.g. `['generated', 'widgets.table']` or `:::generated widgets.table` in Markdown, so the prose stays hand-written and the lists stay accurate.

---

## 6. Writing style

- Second person, present tense, short sentences. "Press **Restart server**." Not "The user can restart…".
- Bold UI labels exactly as they appear. Use `code` for URLs, ports, file paths, keys and CSS.
- One idea per paragraph. Use tables for anything with 3 or more options.
- No marketing language, no "simply" or "just", no emoji.
- Use "zone", "panel", "widget", "profile" and "theme" consistently, as defined in `glossary`. Update the glossary when you add terms.
- British or American spelling: pick whichever the app UI uses and apply it everywhere. The draft mixes them ("colour", "Customize"), so normalise to the UI.

---

## 7. Implementation notes

- **Rendering**: map blocks to components; don't inject HTML from strings. Inline markup is the only parsing needed (the regex is in `Help.dc.html`: `` (`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)) ``).
- **Search index**: build it once when content loads; it's small (about 120 entries). No library is needed. If you switch to Markdown files, build the index at build time.
- **Scroll container**: Help scrolls inside `main`, not the window. TOC clicks and anchors set `main.scrollTop = heading.offsetTop - 20`. Don't use `scrollIntoView`; it scrolls the wrong ancestor in the webview.
- **Zoom**: Help follows the app zoom (`app.zoom`) like the other app windows.
- **Accessibility**: use semantic `nav`, `main`, `article`, `h1`/`h2`. The TOC uses `aria-current="location"`, the active nav item uses `aria-current="page"`, search is `role="search"`, and the keycaps are `<kbd>`.
- **Offline**: all content is bundled; no network access is needed.

---

## 8. Deliverables from Claude Code

1. The Help window, built per §2, with entry points per §2.1 and the context map per §2.6.
2. Updated content: every article verified, with `verified` stamps.
3. `HELP_AUDIT.md`, a table per article:
   `| Article | Statement | Status (✅/✏️/🚧/➕) | Evidence (file:line) | Change made |`
   followed by a **Planned (not documented)** list and an **Added coverage** list.
4. Generated sections wired to their registries (§5).
5. A test or script that fails CI if:
   - a `related` id or `[link](id)` points to a missing article
   - an `open` target isn't a registered route
   - a shortcut in `shortcuts` doesn't exist in the keybinding map
   - an article has no `verified` stamp

---

## 9. Acceptance checklist

- [ ] Sidebar, Home, Search and Article views match the reference at 760px and 1400px wide; the TOC appears only at ≥1000px.
- [ ] Ctrl K focuses search, Esc clears it, and a result opens at the right heading.
- [ ] F1 opens the context article from every screen in §2.6.
- [ ] Every "Open Settings ›" button lands on the right Settings section.
- [ ] Every article is verified; `HELP_AUDIT.md` is complete; no unshipped feature is documented.
- [ ] Widget, panel widget, preset, profile and shortcut lists are generated, not hand-written.
- [ ] Link and route checks pass in CI.
