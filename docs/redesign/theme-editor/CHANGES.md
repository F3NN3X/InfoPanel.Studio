# Theme editor rework: change log for the help pass

What each PR of the Theme editor rework changes for users, kept as it lands so the help (`src/help/articles/`) can be
updated in one pass at the end. Each entry says what changed, what the UI says now, and which help articles it touches.
The design is the handoff spec (`SPEC.md`, option 5a); decisions made while grounding it are at the end.

## PR #228 · A skin applied to a page from the Library shows

- **Behavior:** Library › Skins › Apply to… › This page now changes the page. Before, it stored the skin but the page
  kept following its screen. The page customizes the sections the skin writes (Skin, Surface), unless the screen locks
  them.
- **Help:** `presets.md` (applying a skin), `themes.md` (page level).

## PR · Applying a theme adds to the look

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
