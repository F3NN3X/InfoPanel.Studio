# Profiles panel + profile inspector: plan and decisions

This plan adapts `SPEC.md` to the app. The setting inventory, with file:line references, is in `PROFILES_AUDIT.md`. The design (`Profiles and Dashboard.dc.html`) shows the layout and look only. Where it disagrees with the app, the app's keys, limits, components and behaviour win.

## Owner decisions (2026-10-21)

1. **A card click selects the profile to edit, and nothing else.**
   - It replaces "Pin for editing". The edited profile is the selected card, and it persists per studio in localStorage, the way the pin does today (`pinned-profile.ts`).
   - A card click no longer writes `activeProfile`.
   - "When the app opens" is the only control that writes `activeProfile`:
     - **Best fit for the window** sets `"auto"`;
     - **Always the same profile** sets `<id>`;
     - the ⋯ menu's **Always open this one** sets `<id>` for that profile.
   - No `launchProfileId` key is added.
   - Switching to Always from the footer uses the profile being edited.
   - The rule for which profile a display shows is unchanged: `?profile=` and the control channel override still win.
2. **The General settings are spread into the new tabs, all in the studio.** App Settings can't reach `config.json`, and browser users can't open it.
   - Font goes to Look.
   - Clock and date, Hide cursor, and Page dots and swipe go to Behaviour. Page dots sit next to Cycle through pages.
   - The Data API URL and Test go to a Connection section at the end of Behaviour.
3. **"Apply to every widget"** is a toggle that locks or unlocks all 11 per-profile style sections (`profile.widgetTheme.locks`). When only some sections are locked, it reads "Some sections". Locking single sections stays in the Theme editor.
4. **Export profile** saves one profile as a `.json` file. **Import profile** in the Profiles header loads one back as a new profile, with fresh ids and a name made unique. "Copy profile JSON" stays.

## Smaller calls (made without asking; easy to change)

- **Per-profile Animations under This profile:** Follow system / Reduced / Full are stored as `"system"`, `"reduce"` and `"full"`. All profiles means no override.
- **Corners** sit under Theme and follow its switch:
  - All profiles writes `config.radius`;
  - This profile writes `profile.radius`;
  - the Theme counts as This profile when `profile.theme` or `profile.radius` is set;
  - switching back to All profiles drops both.
- **Look › Widget style** holds the Skin gallery, saved looks (presets), Surface, Background opacity and Background blur. Its All profiles / This profile switch replaces the old Scope target for these.
- **Studio view preferences** (Quick bar, Inspector sections) go to a small Studio section at the end of Behaviour.
- **Cycle interval:** 10 s / 30 s / 1 min / 5 min presets, plus a number field (3–3600 s) for other values. A stored 15 still shows correctly.
- **Pause on touch** isn't a setting. A static line says that a touch or a remote page switch pauses cycling for 30 s.
- **Dynamic Island toggle label:** it stays "Show Dynamic Island", because `island.enabled` also hides the idle clock pill. The spec's pop-up alerts line becomes its help text. All existing island groups stay under it.
- **Limits are the app's:** columns 2–24, rows 1–24, Gap and Edge padding sliders 0–64 (fields up to 200), and a Scroll row height of 120 px (`SCROLL_ROW_H`).
- **"Opens now"** is computed for the studio window. Its tooltip says so: "Closest to this W × H window".
- **The App Settings footer link** shows only in the desktop app (`isTauri()`). It now covers server, updates and startup, because clock and fonts stay in the studio. It reads "Server, updates and startup are in App settings ↗".
- **Search and Changed N** are hidden in the profile inspector and kept in the widget inspector. Palette jumps and "Go to setting" are re-pointed to the new tabs and sections.

## Delivery

- **PR A: Profiles panel.**
  - Cards with a page list.
  - The ⋯ menu: Rename, Duplicate, Always open this one, Export profile, Delete.
  - Import profile.
  - The "When the app opens" footer and the Opens now / On launch tags.
  - Edit-only selection, which replaces Pin.
  - "Cycling every N s" in the page tabs.
  - Tests: duplicate (fresh ids, `rotate.pages` remap), profile file parse and validation, and import.
- **PR B: Profile inspector.**
  - Header and the Layout / Look / Behaviour tabs.
  - The All profiles / This profile switches, the grid preview and "Use this window's size".
  - General spread in.
  - Search and Changed hidden here; palette jumps re-pointed.
- **Help** (`src/help/articles/profiles.md`, `studio.md`, `kiosk.md` and others as touched) is updated in each PR. It is written with the humanizer skill.
