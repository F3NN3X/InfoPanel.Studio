# Profiles panel + Dashboard inspector redesign

**For Claude Code.** This changes the studio's default view: the left **Profiles** panel and the right inspector when **nothing is selected** (today titled "Dashboard"). The canvas, widget inspector, top bar and rail stay as they are.

- Design: `design/Profiles and Dashboard.dc.html`. Open it in a browser. It is interactive, and the values in it are mock data.
- Current app: `reference/current-app.png`.
- Rule: **keep every behaviour and stored key the app has today.** This spec only moves, regroups and relabels settings. It also adds a small number of features, each marked **NEW**. Wherever a key name here is a guess, find the real one in the code and use that.

---

## 0. Before you start (audit)

1. Find the components that render the Profiles rail panel, the page tabs (Main / Gaming / Work) and the "nothing selected" inspector, with its tabs Profile / Appearance / General and its sections Profile, This profile, Profile selection, Auto-rotate, Dynamic Island, Performance.
2. List every setting those sections render: key, type, default, scope (dashboard or profile) and where it is stored. Write the list to `PROFILES_AUDIT.md`.
3. Map each one to its new home using §4. If a setting is not in §4, keep it and put it in the closest section. Note it in the audit.
4. Do not rename stored keys and do not migrate data, unless §6 says to.

---

## 1. Problems this fixes

- The "Profile" tab contains a section that is also called "Profile", which is confusing.
- "This profile → Inherit / Custom" is jargon, and it lives far from the settings it controls.
- Auto-pick appears twice: in the left panel footer and in Profile selection.
- In Performance, "Dashboard" is used as a value (Max FPS = Dashboard), and people don't understand it.
- The left list does not show pages, which profile will open, or any actions.
- App-wide settings (clock, fonts, connection) are mixed in with dashboard settings under "General".

---

## 2. Left panel: Profiles

Width 280 px.

**Header:** "Profiles", a count, a **New** button, and one line of help: "One profile per screen size. Each has its own pages, grid and widgets."

**Profile card** (one per profile)
- Thumbnail: 64×40, with the snapshot contained on a dark background. Use the existing thumbnail render.
- Name: 12.5 px, medium weight, ellipsized.
- Meta, in mono 10.5 px: `1920×550 · 3 pages`. The grid and fit mode leave this row; they now live in the inspector.
- Tag (shows at most one; the meta row wraps if there isn't room):
  - **"Opens now"**, in teal: when the launch rule is Best fit and this profile is the best fit for the current window. Tooltip: "Closest to the W × H window".
  - **"On launch"**, neutral: when the launch rule is Always and this is the chosen profile.
- Active card: 1 px accent border, raised background. It **expands to list its pages**: icon, name, index and **Add page**. Clicking a page selects it, which is the same as clicking its page tab. The page tabs and this list must stay in sync.
- **⋯ menu (NEW):** Rename, Duplicate, Always open this one, Export profile, a divider, then Delete in red.
  - Rename makes the profile active, opens the inspector Layout tab, and focuses and selects the Name field.
  - Duplicate inserts a copy named "‹name› copy" directly below and makes it active. Wire it to the existing duplicate or copy if there is one. If not, deep-copy the profile and its pages.
  - Always open this one sets the launch rule to Always with this profile.
  - Export profile uses the existing export, limited to one profile if that is supported. If it isn't, hide the item and note that in the audit.
  - Delete is disabled for the last profile and asks for confirmation. If you delete the active profile, the first one becomes active.
- **Compact list (optional setting):** no thumbnail, and a monitor or portrait icon instead. This is a Tweak in the design. Ship cards only, unless asked.

**Footer: "When the app opens"**. This **replaces** the "Auto-pick by window size" toggle. It is two radio cards:
- **Best fit for the window**: "Picks the closest size. This W × H window opens ‹name›." The name updates live as the window resizes.
- **Always the same profile**: "Opens ‹name›. Change it from a profile's ⋯ menu." When it isn't selected, it reads "Ignore the window size."

Storage: Best fit is `cfg.autoProfile = true` (the existing key). Always is `autoProfile = false`, plus **NEW** `cfg.launchProfileId`. If the app today opens the last-used profile when auto-pick is off, then while `launchProfileId` is unset Always defaults to the current profile. Preserve that.

The best-fit logic stays exactly as it is now; only the label is new. The design uses an exact size match, then the closest aspect ratio, as a stand-in.

---

## 3. Page tabs (above the canvas)

- These are unchanged, except for one thing. **NEW:** when cycling through pages (the old auto-rotate) is on, show "⟳ Cycling every 30 s" on the right in muted 11.5 px text.

---

## 4. Right inspector, with nothing selected

**Header:** the profile thumbnail (44×30), the profile name, and "Profile settings · select a widget to edit it". This replaces the old "Dashboard / MyDefault · nothing selected".

**Tabs:** this is a segmented control with an icon on each tab, and one line of description under it.

| Tab | Description |
|---|---|
| Layout | Size, grid and spacing for this profile. |
| Look | Theme, widget style and background. |
| Behaviour | Pages, pop-up alerts and performance. |

The old tabs Profile / Appearance / General are removed. "Search all settings" and the "Changed N" filter are removed from this view. If they are shared with the widget inspector, keep them there.

### 4.1 Layout

All of these settings are per profile.

**Screen**
- Name (text). This is the target of Rename from the ⋯ menu.
- Design size: the existing select and presets. If the stored size is not a preset, show it as the first option.
- **NEW:** a "Use this window's size (W × H)" button. It shows only when the size differs from the current window.
- "When it doesn't fit": Fill / Scroll. This is the old "Fit mode". The help line under it changes with the choice:
  - Fill: "Rows stretch so the whole grid fits the screen height."
  - Scroll: "Rows stay 120 px tall and the page scrolls." Use the real row height.

**Grid**
- **NEW: live preview.** The profile's aspect ratio is fitted into a box of about 300×112. It draws cols × rows cells, with gap and padding scaled to match. It is render only and not clickable.
- Columns and Rows are steppers. Keep the current limits (the design uses 1–24 and 1–20).
- Gap slider (0–48 px) and Edge padding slider (0–64 px). "Edge padding" was "Padding".

### 4.2 Look: shared vs this profile

This replaces "This profile → Theme / Style / Background: Inherit / Custom".

- At the top of the tab there is a note: "Look settings are shared by every profile. Switch a section to **This profile** to give ‹name› its own." It includes a legend: a teal dot for All profiles and a purple dot for This profile only.
- **Theme**, **Widget style** and **Background** each have a header made of a dot, the title, and a small segmented control: **All profiles | This profile**.
  - All profiles is `pr.theme / pr.style / pr.bg = Inherit`. Edits write to the dashboard level. The note reads "Shared by all N profiles. Changes here apply to every one."
  - This profile is `Custom`. Edits write to the profile. The note reads "Only ‹name› uses this. Other profiles keep the shared one."
  - Switching to This profile starts from the current shared values, the same as Custom does today.
  - The old Background value **None** becomes This profile with background type None. If the code stores `pr.bg = 'None'` separately, keep it that way: map *This profile + None* to `pr.bg = 'None'`, and *This profile + anything else* to `Custom`.
- Use the dot colours that already exist for "dashboard" and "profile" style sources, so the widget inspector and this panel match.
- The old Appearance **Scope** setting ("Apply to: All profiles / This profile") is replaced by these per-section switches. Check in the code what Scope wrote to. If it only chose where Global style edits go, the Widget style switch takes its job. Note the change in the audit.

**Theme**
- Preset swatches in a 3-column grid (the existing presets), an Accent colour and Corners (the old Corner radius).
- Primary, Background, Foreground, Card, Border and the other advanced tokens stay as they are today, behind a "More" disclosure.

**Widget style**
- "Apply to every widget" is a toggle. It was "Force global style". The help line: "Overrides each widget's own colours and surface." If the current setting has three states (Inherit / On / Off), keep all three and use a segmented control instead.
- "Edit widget style ›" opens the existing Global style editor, which was the Global style tab, as a sub-view or drawer with a back button.

**Background**
- The type control is None / Colour / Gradient / Image / Video, with the existing options. Gradient was left out of the design to save space; keep it if the app has it.
- Colour shows a colour input. Image and Video show a drop-zone button ("Choose an image" or "Choose a video"). Any type other than None shows Dim.
- Fit, Position, Tint and Blur stay, behind a "More" disclosure.

### 4.3 Behaviour

**Pages**
- A list of the profile's pages with a drag handle, an index, the name and a delete button. The delete button is hidden when there is only one page.
- **NEW:** drag to reorder, which also sets the cycle order. If page order isn't stored yet, store it as array order.
- Add page.
- "Cycle through pages" is a toggle. It is the old **Auto-rotate**; keep its keys. When it is on:
  - Switch every: 10 s / 30 s / 1 min / 5 min, or the existing interval options and values.
  - Pause when I touch or click: show this only if the app supports it. If it doesn't, leave it out and note that in the audit.

**Dynamic Island**
- "Show pop-up alerts" is a toggle. The help line: "Widgets with 'Send to island' on appear here briefly — a new song, rain starting."
- Keep all the existing Dynamic Island settings, such as position and duration, under this toggle.

**Performance**
- It has the same All profiles | This profile header as the Look sections. This replaces the "Dashboard" value inside Max FPS and Motion:
  - All profiles means the profile has no override (the old value "Dashboard").
  - This profile means the profile stores its own value.
- Frame rate limit: 5 / 15 / 30 / 60 / No limit ("Unlimited" is renamed). The help line: "Lower uses less CPU and GPU."
- Animations: Follow system / Reduced / Full. This is the old Motion (Dashboard / Reduce / Full). When the scope is All profiles, the value shown is the dashboard-level value.

### 4.4 Footer link

- "Clock, fonts and connection are in App settings ↗" opens App Settings.
- Move the old **General** tab content (Type/font, Clock & date, Display (motion, hide cursor), Studio (inspector position) and Connection) into App Settings > General, following `handoff_app_settings/SPEC.md`. If App Settings isn't built yet, keep these settings reachable. Put a temporary "General" disclosure at the bottom of Behaviour and note it in the audit. Don't lose them.
- Display motion vs Performance motion: if they are the same key, keep it only in Performance. If they are different, keep both and give them clear labels.

---

## 5. Visual tokens (from the design)

- Panel background `#111114`, borders `#1f1f24`, inputs `#0c0c0e` with border `#24242a`, selected segment `#2a2a31`.
- Text `#ededf0`, secondary text `#c9c9cf`, muted text `#7c7c86` / `#8a8a94`.
- Accent `oklch(0.72 0.15 255)`.
- Shared (teal) `oklch(0.76 0.11 190)`, profile (purple) `oklch(0.74 0.13 300)`.
- Section padding 16 px, row gap 12 px, label column 92 px, controls 26–30 px tall.
- Fonts: Geist and Geist Mono, with Material Symbols Rounded icons.
- **Use the app's existing tokens and components wherever they exist.** The values above are only for matching.

---

## 6. Data changes

- **NEW** `cfg.launchProfileId` (string | null).
- **NEW**, only if it doesn't exist: a stored page order per profile.
- Nothing else is new. Everything else is relabelled UI on top of existing keys.

---

## 7. Test checklist

- [ ] Every setting from the audit list can be reached in the new UI, or is linked to App Settings.
- [ ] Switching profiles from a card swaps the canvas, page tabs and inspector. The active card expands and the others collapse.
- [ ] Clicking a page in the card selects the same page as the tabs, and the other way round.
- [ ] Add page and delete page update the card, the tabs and the Behaviour list. The last page can't be deleted.
- [ ] ⋯ Rename focuses the Name field. Editing it updates the card, the top bar and the inspector header live.
- [ ] Duplicate and Delete work. Deleting the active profile picks another. The last profile can't be deleted.
- [ ] With Best fit selected, the "Opens now" tag follows the window as it resizes. It matches the profile the app really opens on restart.
- [ ] With Always selected, the chosen profile opens on restart whatever the window size.
- [ ] Look → This profile writes to the profile, and other profiles don't change. All profiles writes to the dashboard, and every profile without its own value changes.
- [ ] Switching back to All profiles drops the profile's override.
- [ ] Performance with All profiles shows the dashboard value; with This profile it stores an override.
- [ ] The grid preview matches the canvas grid after changes to columns, rows, gap and padding.
- [ ] At a 924 px window, nothing wraps or overlaps (tags, grid label, zoom bar).
- [ ] Settings saved before this change load into the new UI correctly (Inherit/Custom/None, Max FPS = Dashboard, auto-pick on and off).
