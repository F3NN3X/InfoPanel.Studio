# Theme editor rework: change log for the help pass

What each PR of the Theme editor rework changes for users, kept as it lands so the help (`src/help/articles/`) can be
updated in one pass at the end. Each entry says what changed, what the UI says now, and which help articles it touches.
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

## PR · The new Theme view

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
