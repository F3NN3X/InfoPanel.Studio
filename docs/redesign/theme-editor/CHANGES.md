# Theme editor rework: change log for the help pass

What each PR of the Theme editor rework changes for users, kept as it lands so the help (`src/help/articles/`) can be
updated in one pass at the end. The help pass is done (PR · Words, renames and help, below). Each entry says what changed, what the UI says now, and which help articles it touches.
The design is the handoff spec (`SPEC.md`, option 5a); decisions made while grounding it are at the end.

## PR #228 · A skin applied to a page from the Library shows

- **Behavior:** Library › Skins › Apply to… › This page now changes the page. Before, it stored the skin but the page
  kept following its screen. The page customizes the sections the skin writes (Skin, Surface), unless the screen locks
  them.
- **Help:** `presets.md` (applying a skin), `themes.md` (page level).

## PR #229 · Applying a theme adds to the look

No new UI yet; the existing doors (Start from, "Apply a theme here…", Library, command palette, Edit in Theme) use the new
rule.

- **Behavior: a theme adds to the look.** Applying a saved theme or a template theme writes its palette, skin and corners,
  and replaces only the style values the last theme wrote. Values you changed since are kept. Before, a theme replaced
  the level's whole widget style and reset keys it didn't set.
- **Behavior: the background.** A theme's background is written only when "Include background" is ticked (Library's
  template looks and Edit in Theme still include it until their doors are replaced). The command palette's "Apply
  theme" no longer fills in a background where none was set.
- **Behavior: a page.** Applying a theme to a page writes its skin and style values only; the palette, corners and
  background come from the screen. A section the theme leaves empty follows the screen again.
- **Behavior: template variants.** A variant applied from Theme now writes its card opacity (Smoke, Tint, Float) and colour
  swaps into the widgets, so it looks like a new screen made from that variant. Switching to another theme, or Reset,
  takes those writes back (widget values you changed since stay).
- **Behavior: Update ‹name›** saves the theme and refreshes every level that last applied it. Each level keeps what it
  changed since.
- **Behavior: Save as Theme** makes that level count as using the new theme.
- **Data:** All screens, each screen and each page store the theme they last applied and what it wrote (`appliedTheme`).
  Dashboards saved before get one only where a level shows exactly a saved theme; otherwise the level is a custom look.
  Nothing looks different after the upgrade.
- **Help:** `themes.md` (what applying does, Update, the background, pages), `presets.md` (Apply a theme here, Library
  apply), `glossary.md` (Theme), `quickstart.md` (variants).
- **Not yet in the UI** (later PRs): Reset to ‹theme›, the Update bar naming the other places, "used by", "‹name›
  (deleted)", "Custom look · not saved".

## PR #230 · The new Theme view

The Theme rail view is rebuilt around the live look of a level (handoff SPEC §4.1 to §4.3, §4.5, §4.6).

- **Header:** "Theme", a green **Live look of** label and the level control: **All screens** (screen count) ·
  ‹screen› (its size) · ‹page› ("page"). The screen and page segments have a menu for another screen or page. Then the
  level help: "The base theme for every screen", "What ‹screen› changes from All screens", "What ‹page› changes from
  ‹screen›. Palette, corners and background come from ‹screen›." **Lock all / Unlock all** stays at screen level.
  Gone: "Editing for", the "own" counts, **Apply a theme here…**, **Save as Theme**, **Update ‹name›** and the
  **Editing ‹name›** pill in the header (the Library's Edit in Theme still applies and opens Theme; the card names it).
- **Theme card:** a thumbnail, the theme's name and a kind line: "Saved theme · also on ‹places›" / "Saved theme · only
  here", "From a screen template · applied to ‹level›", or **Custom look** · "not saved" with **Save as theme**. A
  deleted saved theme still in use reads "‹name› (deleted)" with Save as theme. Its **⋯** menu: **Reset to ‹name›**
  ("Back to exactly ‹name›: clears N fine-tune changes and part changes on ‹level›. Pages keep their own."),
  **Rename**, **Duplicate** (a template theme: a saved copy), **Delete**.
- **Update bar** once a part changed since the theme was applied: "Changed here. Updating ‹name› also changes ‹places›."
  with **Update ‹name›** and **Save as new**; for a template theme "Changed from ‹name›. Save it to reuse it on other
  screens." with **Save as theme** (named "‹Template · Variant› copy").
- **MADE OF:** **Palette** (five swatches and its name, opens the Palette picker), **Skin** (opens the Skin picker),
  **Corners** (a 0 to 24 px slider, shown in rem, "0.63 rem"), **Background** ("Solid #09090B", "Gradient #0B1023 →
  #05060A", "Image · aurora, dim 25"; opens the Background picker). On a page the palette, corners and background are
  the screen's and read-only. Then **Switch theme** with the counts ("2 saved · 55 from templates").
- **Fine-tune** ("FINE-TUNE · N CHANGES HERE", legend "changed here" / "inherited"): **Colors**, **Text**, **Shape &
  spacing**, **Surface & border**, **Units & format**, **Thresholds**, **Motion**, **Custom CSS**, one open at a time,
  each with a one-line summary, the lock (screen level), its chip and the caret. Renamed: Typography → Text, Surface &
  effects + Border & glow → Surface & border, Advanced (custom CSS) → Custom CSS. Gone from the list: the step numbers,
  **Start from**, the **Background** section (a theme part now), the corner radius in Shape & spacing (on the card),
  the skin select in Surface (on the card), and the page's "Customise a section for this page" list (a page lists every
  section; **Change here** makes one its own). Colors shows **Widget colors**, **Status**, **Series colors**, and
  **More · all 19 color tokens** (it showed 13). The color tokens are the palette, so changing one marks the theme as
  changed (Update bar) rather than the section.
- **Chips:** **Changed here** (was Set here and Custom here), **From theme** (new: the value the applied theme wrote),
  **From All screens**, **From ‹screen›** (was From Screen), **Built-in** (was Built-in default), **Locked** (was Locked
  by Screen). The chip menu's **Customise here** is **Change here**. The same chips show in a widget's Style tab.
  **Reset to inherited** on a section with a theme applied goes back to the theme's values.
- **Pickers** (full height, **‹ Back**): **Switch theme** (All · Saved · Templates · Light; "SAVED THEMES · N" with ⋯:
  "Used by …" / "Not in use", Rename · Duplicate · Delete; "FROM SCREEN TEMPLATES · 22 TEMPLATES, 55 LOOKS", one row per
  template with variant chips; Meters, Orbit and Ticker are one row, "4 variants · also Orbit, Ticker"; footer **Include
  background**, off by default and remembered until the studio closes, its note, the counts and **+ Save current look as
  a theme**). **Palette** (the six built-ins; Zinc "Built-in default"). **Skin** (all 14; TUI and HUD in capitals,
  "Default" for the studio's own). **Background** (This theme's · Solid · Gradient · Image, then the background editor).
- **Toasts:** "Applied ‹name›. Palette, skin and corners changed. Background kept." (or "… and background changed."; on
  a page "Skin changed. Palette, corners and background come from ‹screen›.") plus "N fine-tune changes kept." with a
  **Reset to ‹name›** button; "Palette changed to ‹name›. Skin, corners, background and fine-tune kept."; "Skin changed
  to ‹name›. Colors, corners, background and fine-tune kept."; "Reset to ‹name›. Everything on ‹level› now matches the
  theme, including its background."; "Saved "‹name›". It's in Switch theme under saved themes."
- **Command palette:** each saved theme has **Apply theme: ‹name›** and **Apply theme with background: ‹name›**,
  applied at the level Theme is set to (its hint names it; All screens until Theme has been opened).
- **Help:** `themes.md` (the whole Theme section: header, card, parts, fine-tune list, pickers, chips, 19 tokens),
  `presets.md` (Start from and Apply a theme here… are gone; Switch theme), `quickstart.md` (1 · Start from),
  `glossary.md` (Skin: picked on the theme card), `library.md` (Theme › Start from, Typography), `widget-settings.md`,
  `performance.md` and `problems.md` (chip words), `island-alerts.md` (Theme › Typography is Theme › Text).

## PR #231 · Preview, toast row and saved palettes

- **Preview** (SPEC §4.4): "Preview", the screen's pages as a segmented control (it previews another page; the level
  stays), the differences pill **N widgets differ · hide tags** / **Show what differs**, the toast row, then the page at
  its real aspect ratio with the live look. A widget that differs from the level has a blue tag "✎ ‹section›" (and
  "+N" for more sections). Click a widget: a 2px outline and the bar "‹Widget› · widget on ‹page›", "Uses its own
  ‹sections›: ‹values›. Everything else follows ‹level›." (or "Follows ‹level› everywhere."), **Use theme's value**
  (only when it differs) and **Open in Edit ↗** (Edit with the widget selected). Nothing selected: "Click a widget to
  see what it changes." and **Make all follow** (the widgets that differ on the page shown). Gone: "Live preview ·
  ‹screen› / ‹page›" and the **Exceptions** list with its Make it follow rows; a screen's or page's own sections are
  the fine-tune chips.
- **Owner rule:** what a theme wrote into a widget (a variant's color swaps and card opacity) is the theme's. A widget
  whose own values of a section are only those writes isn't tagged, counted, or made to follow; "N widgets override
  this" under a fine-tune section counts the same way.
- **Toast row** under the preview header, replacing the studio toast for Theme: a green dot, the bold title, the
  sub-line, **Reset to ‹name›** (a theme applied with fine-tune kept), **Undo** (the studio's undo) and ✕. It stays
  until ✕, the next toast or the next change. Copy: "Applied ‹name›." · "Palette, skin and corners changed. Background
  kept." (… "N fine-tune changes kept."); "Palette changed to ‹name›." · "Skin, corners, background and fine-tune
  kept."; "Skin changed to ‹name›." · "Colors, corners, background and fine-tune kept." (a page: "Fine-tune kept.
  Palette, corners and background come from ‹screen›."); "Reset to ‹name›." · "Everything on ‹level› now matches the
  theme, including its background." (a page: "Everything on ‹page› now matches the theme. Palette, corners and
  background come from ‹screen›."); "Saved "‹name›"." · "It's in Switch theme under saved themes." (a palette: "It's
  at the top of the picker under Yours.").
- **Saved palettes:** **Palette** lists the six built-ins (Zinc "Built-in default"), then the user's palettes tagged
  **Yours**, newest first, each with **⋯**: "Used by ‹saved themes, All screens, screens›" or "Not in use", Rename ·
  Duplicate · Delete. Footer: "6 built-in · N yours" and **+ Save current colors as a palette**. The card's Palette row
  names a built-in or saved palette with the level's colors, else "Custom".
- **Library:** Duplicate on a built-in palette makes a saved palette "‹name› copy" (it made a saved theme with an empty
  widget style). Saved palettes aren't listed in the Library.
- **Data:** `config.palettes` (`id`, `name`, the 19 `tokens`); a theme keeps a copy of its tokens, never a palette id.
- **Help:** `themes.md` (the preview, the tags and the selection bar, Make all follow, the toast row, saved palettes;
  Exceptions is gone), `presets.md` (saved palettes; duplicating a palette), `library.md` (duplicating a palette).

## PR #232 · One Library, island looks, Styles, one matching rule

- **One Library (SPEC §7):** the Library no longer lists Themes, palettes, template looks, skins or Island looks. The
  sidebar ends with a row "Themes, palettes and skins are in Theme →" (`navigateTo({ view: "theme" })`). Search, Recent,
  Not used and the counts are built from the remaining items, so none of them can show a theme. "Edit in Theme" is gone
  (`studio-view` `editInTheme`, `onEditInTheme`).
- **Styles stay in the Library.** Rename, Duplicate, Delete and Update from selection of a saved Style exist nowhere
  else (the Style tab only starts from and saves Styles), so the Styles collection stays, trimmed to Styles
  (`preset-actions.ts`, `preset-detail.tsx`, `preset-summary.ts` keep `styleRows` only).
- **Island looks** are a picker at the top of the island settings' Look section (six buttons, the one matching the
  island pressed). It applies through `withIslandLook` (moved to `src/lib/island/looks.ts`) to the screen being edited,
  with no coalescing key, so it is one undo step. Renames: Glass → Frosted pill, Paper → Light pill, Theme card → Match
  theme (ids kept).
- **Built-in Styles renamed** (ids kept): Default → Follow theme, Dark → Matte dark, Light → Matte light, Vivid →
  Frosted, Mono → Monochrome. Surface material "Theme" → **Match theme** (label only, stored value `theme`).
- **One matching rule:** `themeLabel(themeState(...))` in `theme-view-model.ts` names a level's theme from its stored
  snapshot: the theme, "Changed from ‹name›", "‹name› (deleted)" or "Custom look". The page inspector's Theme row uses it
  at the screen's level (All screens' when the screen has no theme of its own). `presetMatches`, `activePresetId` and
  `sameTokens` (appearance-actions) are gone; the Library's "Used by" for a Theme went with the Theme detail.
- **Tests:** the activePresetId cases, the skin, template-look and palette Library cases, `themeUsedBy`, and the
  Themes/Skins/Island collections' counts were removed with what they tested; the island look cases moved to
  `tests/lib/island/looks.test.ts`.

## PR · Words, renames and help

- **The Default skin (SPEC §8 item 7):** reads "Default" everywhere: the Skin picker, the widget Skin select (which
  showed "Auto" and "Default" side by side and now shows one "Default"), the theme card, toasts and the help's skin
  table. Every picker writes `auto` (`DEFAULT_SKIN`, `lib/theme-model.ts`), the stored default, so untouched dashboards
  keep their value. `default` (written by screen templates and by the Skin picker before) stays valid on load and reads
  as the same skin: `skinOf` / `sameSkin` (`lib/theme-skins.ts`, kept out of the kiosk bundle) treat unset, `auto` and `default` as one in the snapshot comparisons
  (`themeState`'s changed parts, `theme-apply`'s merge). Nothing stored is rewritten. A panel still draws `default` with
  the skin's own context and `auto` without, as before.
- **Skin names (§8 item 8):** one spelling: the Skin select's labels (Default, TUI, HUD, else capitalized), which
  `skinLabel` (moved to `lib/theme-skins.ts`) reads for the Skin picker, the theme card, the preview's selection bar
  and the help's skin table.
- **Renames (§3.1):** the New screen and New InfoPanel profile "Colours" chips are **Variant**, and the summary names a
  variant with its template ("Terminal · Amber"). InfoPanel's **Palette** is **Profile colors** (the profile settings row,
  section and swatch labels, the component dialog). Theme's palette hint says **Series colors**. Source dots say
  **Changed here** (were Set here). The widget section action and the "Follows theme" line say **Change here** (were
  Customise here / Customise). The command palette's **Theme › Typography** is **Theme › Text**. The island Color
  option **Theme** is **Match theme** (value `theme` kept).
- **US spelling:** colour, colours, coloured, recolour, customise in UI strings across the studio, the gauge editor and
  the InfoPanel editor are color, colors, colored, recolor, customize (labels, hints, toasts, export loss notes, widget
  descriptions). Identifiers and stored ids are unchanged.
- **Help:** `themes.md` rewritten for the Theme view (levels, the theme card and its four parts, the Update bar, Switch
  theme with Include background, the Palette / Skin / Background pickers and saved palettes, fine-tune and its chips,
  the preview with its tags and selection bar, the toast row, the command palette's two commands). `presets.md` (skins
  on the theme card, themes on any level, saved themes and palettes), `glossary.md` (Skin, Theme), `quickstart.md`
  (Variant; Switch theme), `library.md` (no themes, skins or island looks; Styles), `widget-settings.md` (chips, Change
  here, Style names), `island-alerts.md` (island looks, Match theme, Theme › Text), `performance.md` and `problems.md`
  (Changed here), `profiles.md` and `infopanel-editor.md` (Variant, Profile colors), `concepts.md` and `studio.md`
  (saved themes). US spelling in every article. CHANGELOG's "Frost Bar · Ice" is "Frost Bar · Smoke".
- **Tests changed for the copy:** `look-settings` (the Skin select's options), `new-page.dom` (the Variant radiogroup),
  `multi-inspector.dom`, `add-tiles`, `elements/apply`, `native/convert` (color spelling), `elements.dom` (Profile color
  label), `theme-view-model` (`skinLabel` moved, `default` case). Added: the Default skin's two spellings in
  `theme-apply.test.ts`.

## PR · Theme switching applies the theme

- **The bug:** on a screen saved before snapshots ("MyDefault" in the owner's config), Switch theme › Paper · Ink
  left it dark: with no snapshot `merged()` compared the level's values with `{}`, so every one counted as the level's
  own and stayed (surfaceOpacity 0 among them); the background came only with Include background, off by default.
- **A level with no snapshot has nothing of its own** (`theme-apply.ts`, `writtenAt`): the first pick takes everything
  the level holds as the last theme's, so it replaces the palette, skin, corners and every fine-tune value, as Reset does,
  except that a theme without a background leaves the level's. Same per unlocked section on a page (`mergedPage`). Later
  picks keep only what changed since the last one. `resetToTheme` is unchanged.
- **Keep my background** replaces Include background: `ApplyThemeOptions.keepBackground`, off by default, so a theme
  with a background brings it. Session-remembered in Switch theme as before; the command palette's two commands are
  "Apply theme: ‹name›" (brings it) and "Apply theme, keep background: ‹name›" (action `keepBackground`).
- **Toast (§5.4):** a first pick says "Replaced this screen's look, background included." (or ". Background kept.";
  "the look of All screens", "this page's look"). After any pick, the widgets that still differ in the sections the theme
  sets (`widgetsKeeping` in `theme-differences.ts`: `differencesOf` over `exceptionsOf`, widgets only, not ignored)
  add "N widgets keep their own look." and **Make them follow** (`followAll`, one `setConfig`). The count is taken
  before the pick lands; the action recomputes from the config it runs on.
- **Help:** `themes.md` (first pick, Keep my background, Make them follow, the two commands), `presets.md`.
- **Tests changed because the rule changed:** `theme-apply.test.ts` "keeps every value of a level that has no snapshot"
  is now "replaces the look of a level that has no snapshot… then keeps what changes since"; "writes the background only
  when included" is now "brings the theme's background unless the level keeps its own"; the first case's snapshot now
  holds desk's background; the page case drops `includeBackground`. `appearance-presets.test.ts`'s background case uses
  `keepBackground`. `commands.test.ts` (labels, `keepBackground`), `theme-messages.test.ts` (the outcome argument).
  Added: a screen and a page with no snapshot, `widgetsKeeping` / `widgetCount`, the replaced and widgets toast copy, and
  `tests/e2e/theme-switch.spec.ts` (a black screen with see-through cards → Paper · Ink → Paper's background and white
  cards → Undo), on the `styles-themes` (now with `e2e`) and `studio` features.

## PR · Screens own their look (config v16)

- **No All screens level.** The dashboard's `theme`, `radius`, `background`, `style` and `appliedTheme` are gone from
  `DashboardConfig`; each screen owns its look. Theme's level bar is the screen and its page (`ThemeScope`: `profile`,
  `page`), a screen is the top level (its sections read Built-in or Set here, Change here does nothing there), and
  Switch theme, Make this the theme for… and the command palette's theme commands no longer offer All screens.
- **Migration** (`lib/screen-look-migrate.ts`, `migrateScreensV16`, run in `mergeConfig` before v16): every screen gets
  the dashboard's look merged under its own (all 19 tokens, radius, background unless the dashboard's was `none`, page
  font, style values without `clock`, performance), and the dashboard's theme snapshot when the screen had no look of
  its own. Snapshots are guessed per screen before the move (`guessApplied`, the dashboard's style as the shadow).
  `style.clock` becomes `general.clock`. The resolved look of every screen is unchanged; checked on the owner's v15
  config (5 screens, 41 widgets) and the v11 perf fixture.
- **App-wide settings** (`GeneralSettings`): `clock`, `showSeconds`, `locale`, `hideCursor`, `kioskPageNav`,
  `kioskRefresh`. The clock is the base under every widget's clock key (source "app", "From the app settings"); a
  clock of "auto" at any level falls through to it. Page font and performance (fps, motion and the rendering switches
  Ring glides, Limit blur, Blur inside widgets, Live graph glow) are each screen's own, in Screens › Performance;
  Settings › Dashboard › Performance keeps Refresh kiosk pages and links to Screens.
- **Server:** before the first save that raises the version, `ips-server` copies `config.json` to
  `config.backup-before-v16.json` (never over an existing one). `config_settings` accepts `general.clock` and the
  screens' rendering switches and still accepts the older keys the frozen parity cases send.
- **Tests:** `tests/lib/settings-migrate.v16.test.ts` (field by field, snapshots, resolved-look equivalence),
  `tests/e2e/screens-own-look.spec.ts` (kiosk before and after the studio's first save, the backup, no All screens
  level), Rust unit and route tests for the backup. Tests that set or read the dashboard look now set the screen's.

## Decisions made while grounding the spec

- A page can't hold a palette, corners or background. At page level these parts are read-only and say "Palette, corners
  and background come from ‹screen›."; Switch theme there applies skin and style values only.
- Switching themes replaces what the last theme wrote and keeps what you changed: each level stores a snapshot of what
  the theme wrote; a value that still equals it is the theme's.
- A variant's zone opacity and color swaps are applied at Screen and Page level, not at All screens.
- The command palette offers two commands, "Apply theme: ‹name›" and "Apply theme with background: ‹name›", at the
  level Theme is set to.
- The "Widget colors" section keeps its stored id `palette`; only its label changes.
- A deleted theme still in use shows "‹name› (deleted)" with Save as theme in place of Update.
- Include background is remembered for the session in Switch theme only; the command palette has its two commands.
- A section with values equal to what the applied theme wrote reads "From theme"; the palette's tokens count as a
  theme part, so editing one shows the Update bar, not "Changed here" on Colors.
- The preview's Make all follow acts on the widgets that differ on the page shown, the ones the pill counts; a
  screen's or page's own sections are reset from their fine-tune chips.
