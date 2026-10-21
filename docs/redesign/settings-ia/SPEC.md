# SPEC: Settings and navigation reorganisation

Design: `Studio IA.dc.html` (prototype) and `Studio IA Map.dc.html` (map and tables). Section numbers are referenced from `IMPLEMENTATION_PLAN.md`.

---

## 1. Goals

The core loop is: **pick a screen → lay out widgets → make it look good → show it on the screen.** Every concept gets one home, one name and one visible inheritance rule.

Problems this fixes:
- "Theme" means three things.
- Widget style has two editors.
- Global settings sit inside the profile inspector.
- "Preset" has seven meanings.
- There are about 26 import/export entry points for 7 real operations.
- Pages are managed in four places.
- The Dynamic Island has four surfaces.
- There is no connection, update or kiosk status in the chrome.
- Remote-control actions have no UI.

Principles:
1. **One home per setting.** Any other appearance is a `↗` link.
2. **Scope is always visible.** Every inheritable section shows an `InheritChip` (§5). A setting that exists at one scope only has no chip and no scope switch.
3. **The canvas is the centre.** Design is canvas + inspector. Everything else is a separate full view.
4. **Progressive disclosure.** A new user can change colors, pick a skin and lay out widgets without meeting locks, page overrides or custom CSS.
5. **Files go through one door** for import and one sheet for export.
6. **Saved things are one family:** Themes, Styles, Panels, Gauges, Media, Fonts, Canvases. Built-ins sit beside saved items.
7. **Live is not configuration.** Kiosk control lives only in Live and is never saved.
8. **Status is ambient,** in the status bar.

---

## 2. Naming

### 2.1 Terms (use these exact words in the UI)

| Term | Meaning | Notes |
|---|---|---|
| **Screen** | A profile (one design size) | Shown as `Desk bar · 1920×550`. In Import/Export and InfoPanel contexts say "screen (profile)" once. Keep `profile` in code, keys and file formats. |
| **All screens** | The top scope | Replaces All profiles, Global and General. |
| **Page**, **Zone**, **Widget** | Unchanged | |
| **Panel** | A custom group of mini widgets; a saved one lives in Library › Panels | Replaces custom panel, panel preset, My panels and Saved panels. |
| **Theme** | The whole inherited look at any scope; a saved Theme is a bundle | Replaces Saved looks and the color theme presets (Zinc, Ocean…). |
| **Style** | One widget's own look, saved or not | Replaces style presets and the widget "Style preset" select. |
| **Skin** | A built-in widget rendering family | Picked in Theme › Start from. |
| **Live** | Kiosk control right now; never saved | |
| **Dashboard** (Settings tab) | Behaviour shared by every screen | Always subtitled "every screen". |

### 2.2 Retired labels (must not appear anywhere, including the command palette and help)

Appearance · Global style · Widget theme · Widget style (as a place name) · Saved looks · Style preset · General settings · `Dashboard › …` paths · Use as global… · Follows the profile theme · Background opacity (now "Opacity", under Surface & effects) · Edit widget style ↗ · "Applies to all profiles" notes.

---

## 3. Shell

The layout is a column: title bar 40 px, then a body row (rail 72 px, then the view), then the status bar 26 px.

### 3.1 Title bar (40 px; it is also the OS title bar on desktop)

From left to right:

1. **App mark:** 20×20, radius 6, accent fill.
2. **Screen / page switcher:** a button, height 28, padding 0 8, radius 7, background `#17171b`, border `#26262c`. It contains:
   - a `desktop_windows` icon;
   - the screen name (600 weight);
   - the size in Geist Mono 11 px, `#7c7c86`;
   - a `/` separator;
   - the page name;
   - an `unfold_more` icon.

   It never wraps. Clicking opens a popover, 300 wide, anchored below:
   - every screen (name + size);
   - the current screen's pages, indented 32 px, with the current page in full white and the others `#8a8a94`;
   - a divider, then **Manage screens…**, which opens Screens.

   Choosing a page switches screen and page.
3. **Command entry**, centred and flexible: max 340 px, min 32 px. Placeholder "Search settings or run a command" (ellipsized), plus a `Ctrl K` key cap. It opens the existing palette.
4. **Undo** and **Redo:** 30×30 icon buttons.
5. A divider, 1×18.
6. **Import** (`input` icon) and **Export** (`output` icon): outlined buttons, height 28, radius 7. They open §9.1 and §9.2.
7. **Live · N:** a green tinted button. Background `oklch(0.78 0.15 150 / .12)`, border `oklch(0.78 0.15 150 / .45)`, text `oklch(0.88 0.10 150)`, with a 7 px dot. N is the number of connected kiosks. It opens §3.3.
8. **Save:** filled `#ededf0`, text `#0c0c0e`, 600 weight. A 6 px accent dot shows while there are unsaved changes.
9. **Window controls** (Tauri only): three 44×40 cells for minimise, maximise and close. Close turns `#c42b1c` on hover. The browser build renders none.

The whole bar is a drag region except the controls.

### 3.2 Rail (72 px, labelled)

Each item is an icon (Material Symbols Rounded, 20 px) with a 10.5 px label underneath. Padding is 7/2/6 and radius 8. Active: background `#1c1c21`, text `#ededf0`. Inactive: `#8a8a94`.

| Item | Icon | Opens |
|---|---|---|
| Design (default) | `dashboard_customize` | §6 |
| *(divider)* | | |
| Theme | `palette` | §7 |
| Library | `collections_bookmark` | §10.4 |
| Data | `sensors` | §10.2 |
| Alerts & Island | `notifications_active` | §10.3 |
| *(spacer)* | | |
| Help | `help` | Help window, at the article for the current view |
| Settings | `settings` | §10.1 (both platforms) |

**Every rail item is a full view.** No rail item opens a drawer. Screens is **not** on the rail. You reach it from the switcher, from the zoom-bar size link, and from links (see §16-1).

### 3.3 Live popover (NEW UI on the existing API)

A 340 px popover anchored under the Live button, with a green border tint. It is not modal and closes on an outside click or Esc.

- **Header:** "Live control", then the sub-line "Acts on kiosks right now. Nothing here is saved to your dashboard."
- **Kiosk list:** `cast_connected` icon, screen name · current page, and the IP in mono.
- **Controls:**
  - **Show on ‹screen› kiosks:** a segmented control of that screen's pages. This replaces the page-tab "Show on kiosk".
  - **Rotation:** a toggle. Off means paused (runtime override). The note under it reads "Paused for now. Saved setting: every 20 s — resumes on reload." or "Following the saved setting: every 20 s." This replaces the tab-strip Play/Pause and "Back to the saved setting".
  - **Dim screens:** a slider.
  - **Mute alerts for 1 h:** a toggle.
  - **Dynamic Island:** a toggle (runtime on/off).
  - **Reload all kiosks:** a button.

Nothing in Live marks the document dirty.

### 3.4 Status bar (26 px, NEW)

Background `#0f0f12`, top border `#1f1f24`, text 11.5 px `#a1a1aa`. Every item is a button (a 7 px status dot + label, radius 5, hover `#1c1c21`).

| Item | Desktop label | Browser label | Click |
|---|---|---|---|
| Data API | `Data API · connected` / `· unreachable` (red) / `· slow` (amber) | same | Data › Connection |
| Server | `Server · :8080 · LAN` | `Served by 192.168.1.12` | Settings › App › Server (browser: the read-only notice) |
| Kiosks | `2 kiosks` | same | opens Live |
| Update | `Update 1.3.0 available` (amber) | hidden | Settings › App › Updates |
| *(spacer)* | | | |
| Save state | `Unsaved changes` / `All changes saved` | same | — |

A restart-needed state shows here as an amber "Restart server to apply" item, as well as in Settings › App.

### 3.5 Responsive

- **≥ 1280 px:** as above. The Design left panel is open by default.
- **< 1280 px:** the Design left panel is closed by default. A toggle (`left_panel_open`) sits at the start of the page-tab row.
- **< 960 px (narrow):**
  - The rail drops its labels and is 48 px wide; tooltips stay.
  - The inspector becomes a floating card, 280 wide, inset 10 px from the right of the canvas. It can be dragged by its header and closes with Esc or ✕.
  - The status bar shows dots only.
  - In the title bar, Import and Export become icon-only, and the command entry collapses to an icon.
- **< 600 px (phone):**
  - The rail becomes a bottom tab bar, 52 px: Design, Theme, Library, More (More holds Data, Alerts & Island, Settings, Help).
  - The inspector is a bottom sheet with a drag handle, and its rows are at least 44 px tall.
  - The switcher stays at the top. Live is in the top ⋯ menu.

See the mockups in `Studio IA Map.dc.html` §4.

---

## 4. Shared patterns

### 4.1 One home, links elsewhere

A secondary appearance of a setting is a **LinkRow**:
- the label;
- the current value as read-only text (mono where numeric), plus where it comes from (e.g. `60 fps · from Dashboard`);
- a link, `Edit in Theme ↗` / `Settings ↗` / `Screens ↗` etc., in accent `oklch(0.80 0.12 255)`.

Clicking the link navigates to the home, opens the right tab or section, and scrolls to and focuses the control.

### 4.2 Scope

Inheritable data, and where each part can be set:

| Data | All screens | Screen | Page | Widget |
|---|---|---|---|---|
| Color tokens, corner radius | ✓ | ✓ | — | — (widget Colors is widget-style colors) |
| Page font | ✓ | ✓ (**model change** §11.1) | — | — |
| Background | ✓ | ✓ | — | — |
| Widget style, 11 sections | ✓ | ✓ (+ locks) | ✓ (sections the page customises) | ✓ |
| Performance (fps cap, animations) | ✓ (Settings › Dashboard) | ✓ (Screens) | — | — |

Single-scope settings have no chip:
- clock/date, page dots & swipe, hide cursor (Settings › Dashboard);
- Data API URL and display names (Data);
- alert defaults;
- Studio prefs (browser-local);
- App settings (`settings.json`).

### 4.3 Section card (inspector and Theme)

- **Header:** height about 38, padding 9/10/9/14, top border `#1f1f24`. It contains:
  - the section icon (16 px, `#8a8a94`), or a step number in Theme;
  - the name (12.5 px, 500);
  - the `N changed` count (10.5 px, `#8a8a94`), only when > 0;
  - in Theme at Screen scope, the lock toggle;
  - the `InheritChip`;
  - a chevron.
- **Body:** padding 0/14/12, with a gap of 4 between rows. Rows are `SettingRow`s:
  - min-height 28;
  - label 12 px `#a1a1aa` on the left;
  - control on the right: select, swatch, segmented, slider, toggle, text or button;
  - a 5 px accent dot after the label if that row differs from its parent.
- **Action line** under the rows (11.5 px, links, nowrap, wraps as a whole line):
  - `Reset to inherited` (when Custom here);
  - `Customise here` (when inherited; editing any control also customises, so this is a shortcut);
  - `Edit ‹source› ↗` (e.g. "Edit Page ↗", "Edit All screens ↗", "Edit lock in Theme ↗").
- Keep the existing features: More (n), the per-section Reset, section search, pin to quick bar, and the accordion preference.
- **Remove** the "Changed" filter; the chips and counts replace it.

### 4.4 Live styling

Anything live (Live button, Live popover, the "Show this page on kiosks now" button, the kiosk marker) uses the **green** family and is labelled `LIVE · NOT SAVED` where it sits inside settings. Nothing else uses green, except success status.

---

## 5. Inheritance chip (`InheritChip`)

A pill, height 20, padding 0 8 0 6, radius 999, Geist 11 px / 500, with a 13 px icon and a gap of 4. It never wraps and is focusable (`tabindex=0`).

| State | Icon | Text | Border | Background | Text color | When |
|---|---|---|---|---|---|---|
| `inherited` | `link` | `From ‹Level›` | 1 px **dashed** `#4a4a53` | transparent | `#b4b4bc` | The value comes from a parent |
| `custom` | `edit` | `Custom here` | 1 px solid `oklch(0.72 0.15 255 / .6)` | `oklch(0.72 0.15 255 / .16)` | `oklch(0.88 0.08 255)` | Overridden at this level |
| `locked` | `lock` | `Locked by ‹Level›` | 1 px solid `oklch(0.80 0.13 80 / .55)` | `oklch(0.80 0.13 80 / .12)` | `oklch(0.88 0.10 85)` | A screen lock forces it |
| `base` | `adjust` | `Set here` | 1 px solid `#33333a` | `#1c1c21` | `#ededf0` | The All screens level, when set |
| `builtin` | `deployed_code` | `Built-in default` | 1 px dashed `#3a3a42` | transparent | `#8a8a94` | Not set at any level |

- `‹Level›` is one of `All screens`, `Screen` or `Page`. The specific name (e.g. "Desk bar", "Gaming") goes in the tooltip and the menu.
- **State is never carried by color alone:** each state has its own icon, wording and border style.
- **Hover:** `filter: brightness(1.18)`, plus a tooltip:
  - inherited: "Inherited — the value comes from ‹name›. Change it here to customise."
  - custom: "Overridden at this level. Reset to go back to ‹name›."
  - locked: "‹name› forces this section everywhere below it. Edit or unlock it there."
- **Focus:** 2 px accent outline, 2 px offset.
- **Click / Enter / Space** opens a menu (220 wide, `#1a1a1f`, border `#33333a`, radius 8):
  - First line, muted: the parent's value, e.g. "Without it: `#3D8BFF` from Page · Gaming".
  - **custom:** `Reset to inherited` (shortcut ⌫ while the section is focused) · `Edit ‹parent› ↗` · `Make this the theme for… ▸` (widget only).
  - **inherited:** `Customise here` · `Edit ‹source› ↗`.
  - **locked:** `Edit lock in Theme ↗` (opens Theme at Screen scope with the section expanded).
  - **base / builtin:** `Reset to built-in` (base only).
- **Locked + a kept override:** when a widget or page has its own value for a section that its screen locks, the chip shows `locked`. The section body shows an amber note: "This widget has its own ‹section›; it returns if the Screen unlocks ‹section›." The override is **not deleted**.

---

## 6. Design (default view)

Body row: the left panel (232 px, optional), the canvas column (flex), and the inspector (320 px).

### 6.1 Left panel

- Segmented: **Layers | Add widget**.
- **Layers:** a zone list. Each row has the icon, the name (ellipsized), an `edit` mark (13 px, accent) when the zone has any custom section, the size (`2×2`) in mono 10 px, and hide/delete on hover. Clicking a row selects the zone. Right-click opens the existing zone menu.
- **Add widget:**
  - search, then category groups as a two-column card grid (draggable onto the canvas; click places it in the first free cell);
  - a **My panels** group, which lists Library › Panels;
  - at the end, the link `Canvas from an .infopanel file → Import`, which opens the Import door.

### 6.2 Page tabs, canvas and zoom bar

- **Tab row:** 38 px, no wrapping, overflow hidden. In order:
  - the left-panel toggle;
  - one tab per page (icon + name). The kiosk page gets a green `cast` icon;
  - `+` (Add page);
  - on the right, a dashed chip `Kiosks show ‹page› · rotation ‹paused|every 20 s›`, which shrinks and ellipsizes and opens Live.
- Double-clicking a tab renames it inline. Right-click on a tab offers: Rename, Icon…, Duplicate, Delete, and "Page settings" (which deselects, so the Page inspector shows).
- **Removed** from the tabs: ⋯ › Theme…, Show on kiosk, the Play/Pause control and "Back to the saved setting".
- **Canvas:** clicking an empty area deselects. The board scales to fit, keeping the design aspect ratio.
- **Zoom bar** (floating, bottom centre): grid, rulers, zoom %, Fit, and the size link `1920×550 ↗` (which opens Screens with this screen selected).

### 6.3 Zone inspector (a zone is selected)

- **Header:**
  - icon tile (28, `#1a1a1f`, radius 7), name (600), and position `C3 R1 · 2×2` (mono 10.5 `#7c7c86`);
  - icons: Help (F1), Hide, Duplicate, Delete;
  - **QUICK:** pinned-setting chips;
  - **tabs: Show · Style · Data · Behaviour**, plus the existing settings search.
- **Show:** unchanged (widget picker, Visible, Title/Icon, sections, Fit). Panels keep Visual/Code, Gap, Padding, Layout, Background, Widgets and Panel JSON. Rename "Save as panel preset…" to **Save as Panel**.
- **Style:**
  - A toolbar, one line, nowrap:
    - **Start from a Style ▾**: a gallery popover of built-in and saved Styles. Applying one writes its sections as custom.
    - **Save as Style**: saves to Library › Styles.
    - **Make this the theme for… ▾**: All screens / This screen / This page. It writes the widget's custom sections to that scope, then resets them on the widget (confirm with a list).
  - Sections in order: Skin, Colors (with the existing widget colors merged in), Typography, Shape & spacing, Surface & effects, Border & glow (with Zone frame merged in: accent, background, title header), and Advanced · CSS & locks.
  - Copy style and Paste style stay in the right-click menu.
  - **Remove** the widget "Style preset" select (§11.3), and the Apply / Save / Delete preset submenus.
- **Data:** Bound data; the LinkRow `Rename sensors and change the connection in Data ↗`; the Units & format section (with chip).
- **Behaviour:** the Thresholds and Motion sections (with chips), then **Send to island** as a toggle. Its note reads "How the island looks is set in Alerts & Island ↗".

### 6.4 Page inspector (nothing selected; NEW, replaces the profile inspector)

- **Header:** page icon, `Page · ‹name›`, `‹screen› · N zones`, and Help.
- **Rows:**
  - Name (text);
  - Icon (picker);
  - **Rotation:** a LinkRow, `Included · every 20 s`, with "Page order and rotation live in Screens ↗".
- **THIS PAGE'S LOOK:**
  - one card per section the page customises (icon, name, `Custom here` chip);
  - the line "Everything else follows ‹screen›." (or "This page follows ‹screen› completely.");
  - the links `Edit in Theme ↗` (opens Theme at page scope) and `Customise a section…` (opens Theme at page scope, at the customise list).
- **LIVE · NOT SAVED:** the green button "Show this page on kiosks now".
- **Actions:** Duplicate page, and Delete page (red; confirm; disabled for the last page).

The page is the home for name, icon, duplicate and delete. Screens owns order and rotation only.

---

## 7. Theme (one editor; replaces the rail Theme page and Look)

### 7.1 Top bar (wraps if needed)

- `Theme`, then "Editing for", then the **scope bar**, a segmented breadcrumb with three buttons separated by `chevron_right`:
  - `public` **All screens** · `3 screens`
  - `desktop_windows` **‹Screen›** · `1920×550 · N own`
  - `sports_esports` **Page: ‹page›** · `N own`

  The active button has background `#26262c`. The screen and page default to the current Design selection. Each button has a dropdown chevron for picking another screen or page.
- At Screen scope only: **Lock all** / **Unlock all**.
- **Apply a theme here…** opens a gallery of Themes, with the checkbox "Include background", and applies at the current scope.
- **Save as Theme** saves color tokens, widget style and (optionally) background from the resolved current scope to Library › Themes.

### 7.2 Left column (360 px, scrolls)

- **Scope help line** (11.5 px `#8a8a94`):
  - All: "The base look for every screen. Screens and pages only store what they change."
  - Screen: "What ‹screen› changes from All screens. Lock a section to force it on every page and widget of this screen."
  - Page: "‹page› only stores the sections it customises. Everything else follows ‹screen›."
- **1 · Start from** (All screens and Screen scopes only): a 3-column grid of built-in palettes, built-in skins and saved Themes. Each item is a 16:10 swatch plus a name and a kind label (Palette / Skin / Saved theme). The current one gets a 2 px white border. There is an `All themes in Library ↗` link.
- **Sections 2–11, in this order:** Colors, Typography, Shape & spacing, Surface & effects, Border & glow, Background, Units & format, Thresholds, Motion, Advanced (custom CSS).
  - Each is a section card (§4.3) with a step number and a chip.
  - **All screens:** chip `base`, or `builtin` if never set.
  - **Screen:** `custom` if the screen owns it, otherwise `inherited · All screens`. There is a **lock toggle** in the header for every section except Background and Advanced:
    - Off: outline `#2a2a31`, `lock_open`, "Lock".
    - On: amber, `lock`, "Locked".
    - Tooltip: "Force this section on every page and widget of ‹screen›".
  - **Page:** only the sections the page customises (chip `custom`, from Screen), followed by the **Customise a section for this page** list. That list has one button per remaining section, disabled with a reason when not allowed:
    - Colors and Background: "Set per screen" (model limit, §16-3).
    - Locked sections: "Locked by Screen".
    - Shape & spacing is allowed: "Spacing only". Corner radius stays at screen level.
  - Under each open section: `Reset to inherited` (when custom), and "N widgets override this" (with "— ignored while locked" when locked).
- **Color tokens and widget-style colors are one Colors section.** Underneath they are two stores; write each control to its store.
- **Typography** contains the page font (§11.1) and the widget typography.

### 7.3 Right area

- `Live preview · ‹screen› / ‹page›`: the real page rendered with the resolved theme at the current scope. Widgets that don't follow get a 16 px accent `edit` badge at their top-right.
- **Exceptions** card (max-width 900):
  - The header reads `Exceptions · N things below ‹scope› don't follow it`, with **Make all follow**.
  - Rows show: icon, who, kind (`Widget on Gaming` / `Page` / `Screen`), what (`Colors customised`), a `locked` chip if the override is ignored, a `custom` chip, and **Make it follow**, which resets that override.
  - Scope All lists screens, pages and widgets. Scope Screen lists pages and widgets. Scope Page lists widgets.
  - The empty state reads "Everything below this level follows it."

---

## 8. Screens (NEW view; reached from the switcher, the zoom-bar size link and links)

The main column (scrolls, padding 20/24) has:

- **Header:** `Screens`, **Import a screen…** (opens the Import door) and **New screen** (filled).
- **When the app opens:** two radio cards.
  - **Best fit for the window**: "Picks the screen whose size matches the kiosk window".
  - **Always the same screen**: "Always open ‹screen›", plus a screen picker.
  - Storage: `cfg.autoProfile` (existing) and `cfg.launchProfileId` (NEW, from the Profiles handoff). Keep the existing best-fit logic.
- **Screen cards:** an auto-fill grid with a minimum of 220.
  - Each card has a 110 px thumbnail well (`#0b0b0d`), with the screen's aspect drawn inside (use the existing snapshot render). Then the name (600) and a tag: `Best fit now` or `Opens on launch` (green tint).
  - Meta line in mono 11: `1920×550 · 3 pages · grid 8 × 3`.
  - Selected: white border. Card ⋯ menu: Rename, Duplicate, Export screen (opens §9.2 preselected), Delete (confirm; not the last one).

The right detail panel (340 px) has:

| Group | Rows |
|---|---|
| SIZE & FIT | Width, Height, **Match this window** (`Use W × H`), When it doesn't fit (Fill / Scroll) |
| GRID | Columns × rows, Gap, Edge padding |
| ROTATION | Rotate pages (toggle), Every (seconds). Note: "Pause it for now from Live ↗" |
| PERFORMANCE | Frame-rate cap and Animations, with an `InheritChip` (inherited from All screens = Settings › Dashboard, or custom) |
| LINKED — EDITED ELSEWHERE | Look: `N own sections` → Edit in Theme ↗ · Dynamic Island: `On` → Alerts & Island ↗ |
| PAGES · ORDER & ROTATION | `+ Add page`; rows with a drag handle, icon, name, an in-rotation toggle (`sync` / `sync_disabled`) and **Open** (goes to Design on that page) |

The page list here edits only order and in-rotation. The page-tab order follows it.

---

## 9. Files: one Import door, one Export sheet

### 9.1 Import (title-bar button, plus drag-and-drop anywhere in the window)

- Dropping a file shows a full-window drop overlay: "Drop to import".
- The dialog is 560 wide, `#141418`, radius 12.
  - Header: `Import`, with the help line "One door for every file. Drop it anywhere in Studio, or choose a file — we work out what it is."
  - **Detected card:** one row per file, with an icon, the filename (mono) and `Detected: …` in green.
  - **Destination** radio cards.
  - Optional checkbox.
  - Footer: a next-step hint, Cancel, and the primary button.

| Detected type | How to detect | Destinations (first = default) | Extra | Then |
|---|---|---|---|---|
| Studio config backup | JSON with the config root shape | **Replace everything** · Add its screens only | ☑ "Back up the current dashboard first (recommended)" (default on) | Restore |
| Studio profile | JSON with the profile shape | **New screen** | — | Opens Screens |
| `.infopanel` | extension / signature | **New screen** (one page per canvas) · Canvas zone on ‹current page› | — | The existing wizard: Faithful / Native where possible / Both → Review → Sensors → Save. The "Lands in" step is removed, because the choice is made here |
| `.gauge.json`, gauge SVG | extension / shape | Library › Gauges | — | Opens the gauge |
| Frames `.zip` | zip of images | Library › Gauges (frame gauge) | — | |
| Images, videos | MIME | Library › Media | ☐ "Also use ‹file› as the background for ‹screen›" | |
| Fonts (ttf/otf/woff2) | MIME / extension | Library › Fonts | — | |
| Several files | per-file detection | grouped, one row each | | |
| Unknown | — | an error row: "We don't recognise this file." | | |

Retire every other import entry point and point it here: the top-bar Import, the ⋯ Import config…, the ⋯ Import InfoPanel profile…, the Profiles drawer Import, the Library "Import profile" and Upload, the gauge imports, Add fonts, and the Add widget canvas-zone import.

### 9.2 Export & back up (title-bar button)

A 520 px sheet: "Pick what to take out. Each one can also be copied as JSON."

| Row | Detail | Button |
|---|---|---|
| Back up everything | "All screens, themes, alerts and settings · .json" | **Save backup** (primary) |
| Export this screen | "‹screen› with its pages and own look · .json" | Export screen |
| Export a page for InfoPanel | "‹page› as an .infopanel canvas"; options ☑ Bake vector gauges first · ☑ Leave unused assets out · Stored form / .infopanel | Export… |
| Export a gauge | "Pick one from Library › Gauges · .gauge.json" | Choose… |

Each row has a small `Copy JSON` link. That replaces all three "Copy profile JSON" items.

---

## 10. Other views

### 10.1 Settings (rail, bottom)

Tabs (underline style) with subtitles: **Dashboard** `every screen` · **Studio** `this browser` · **App** `this PC` (browser: `desktop only`). The content column has a max-width of 560. Each group has a title and a scope note.

- **Dashboard:**
  - Performance (default for all screens): Frame-rate cap, Animations. Note: "‹screen› uses its own (30 fps). Screens ↗".
  - Clock & date (all screens and the island): Clock 24 h / 12 h, Show seconds, Date locale.
  - Kiosk: Page dots & swipe, Hide cursor.
  - Danger zone: Reset everything… (its confirm offers "Back up first").
- **Studio:** Editor (saved in this browser only): Quick bar, Inspector sections (One open / Many open), Default zoom, Show grid, Show rulers, Left panel width.
- **App** (desktop): a left sub-nav, 180 px, with General · Server · Updates (amber dot when an update is available) · Coding agents · Diagnostics & logs · About. Port the content of the desktop Settings window as-is, including the restart bar. **Retire the separate Settings window.** Tray › Settings opens the studio at Settings › App.
- **App (browser):** a notice card.
  - Title: "App settings live in the desktop app".
  - Body: "You're using Studio in a browser, served from the PC running InfoPanel Studio. Startup, window, server, updates, coding agents and logs can only be changed there."
  - Read-only rows: Server, Kiosk URL (Copy), Desktop version.

### 10.2 Data

- The left column (300) holds:
  - **Connection**: the status pill (`Connected · 18 ms` or an error), Data API URL, Test connection, and API index (Open ↗);
  - below it, the source tree.
- The main area is a point table with columns Sensor · Now · Display name (editable inline) · Used in (which screens). The note reads "Display names apply to every screen."

### 10.3 Alerts & Island

Tabs: Rules · Island · Defaults · History.

- **Rules:** the existing list and editor. Each row shows the severity icon, the name, the condition in mono, `‹severity› · shows as ‹style›`, and an enabled toggle. **New rule** opens the existing menu (Blank sensor / Blank notification / Presets).
- **Island:**
  - "Island for" screen chips;
  - a preview pill;
  - rows: Show Dynamic Island, Shape, When idle;
  - **Font** as a LinkRow (`Geist · from Theme`, Theme ↗) and **Clock format** as a LinkRow (`24 h · from Dashboard`, Settings ↗). Remove the old "As General" settings and the dead path;
  - Motion;
  - Dashboard notices (toggles);
  - **Widgets sent to the island**: a list with `Open widget ↗` (selects the zone and opens its Behaviour tab). The note reads "Turn this on per widget: Behaviour › Send to island."
- **Defaults:** Default style, Position, Size, Dim the page behind, Show for, Quiet hours, During quiet hours still show.
- **History:** the existing list, plus "Active now" at the top.

### 10.4 Library

- Header: `Library`, "Everything you've saved, beside the built-ins.", search, and **Add files…** (opens the Import door).
- Tabs, each with a count: Themes · Styles · Panels · Gauges · Media · Fonts · Canvases.
- One hint line per tab:
  - Themes: "A Theme is a whole look. Apply one in Theme at any scope."
  - Styles: "A Style is one widget's look. Apply from a widget's Style tab."
  - Panels: "Reusable widget groups. Drag onto the canvas from Design › Add."
  - Gauges: "Open a gauge to edit it. New gauge starts the gauge editor."
  - Media: "Images and videos. Use one as a background from Theme › Background."
  - Fonts: "Fonts appear in every Typography picker."
  - Canvases: "InfoPanel canvases imported as zones."
- An auto-fill grid with a minimum of 160. Each card has a 4:3 thumbnail, the name and a tag (`Built-in` muted, otherwise accent).
- The existing smart collections (Recent, Unused, Large files, Duplicates, Suggested for theme) become **search filters**. "My library | Profile assets" becomes a filter: "Used by ‹screen›".
- Item actions stay as they are.
- The Gauges editor opens from a gauge item. Its Save as new and Save to library stay; its Import and Export route through §9.

### 10.5 First-run (NEW; when there is no config, or from Help › Run setup again)

A 720 px modal with a stepper: `1 Connect — 2 Screen — 3 Start — 4 First page`. Footer: Skip setup · Back · Continue (the last step says **Open Studio**).

1. **Connect your sensors.** "Studio reads sensors from InfoPanel's Data API. It's usually running on this PC already."
   - The URL is prefilled with the default and auto-tested on open.
   - Success reads "Connected — N sensors from ‹sources›".
   - Failure shows help with a link to set up the Data API.
2. **Which screen is this for?** "This window is W×H — that looks like a bar display."
   - Cards: the detected size (preselected), Panel 1024×600, Strip 480×1920, Phone or tablet, Custom size.
3. **How do you want to start?** Cards:
   - Start from a template;
   - Import from InfoPanel (opens the Import door with `.infopanel`);
   - Blank screen.
4. **Your first page.** A name field plus widget cards, preselected from the detected sensors: CPU temperature, GPU temperature, Fans, Clock, Now playing. The cards are auto-laid out on the grid.

---

## 11. Model changes (the only ones)

1. **The page font becomes per-screen.** Today the font is global, even under "This profile". It moves into the theme's Typography, as an All screens base plus a Screen override. Migration: the current global font becomes the All screens value, and screens get no override.
2. **`cfg.launchProfileId`** (from the Profiles handoff) backs "Always the same screen".
3. **The widget "Style preset" field is retired.** Default, Dark, Light, Vivid and Mono become built-in **Styles**. Migration: for each zone with a non-default value, write that preset's values as custom sections on the zone, then drop the field.
4. **There are no new stores.** Saved looks become Themes, style presets become Styles, and panel presets become Panels. These are renames in the UI only; keep the keys.
5. **Rotation pause stays runtime-only** (live state).

There are no page-level color tokens (§16-3).

---

## 12. Tokens (match these to the existing Tailwind tokens)

| Token | Value |
|---|---|
| App background / canvas well | `#0c0c0e` / `#0b0b0d` |
| Chrome (title bar, rail, panels, status bar) | `#0f0f12` |
| Raised / input | `#141418`, `#17171b` |
| Hover / active nav | `#1c1c21`; active segment `#24242a` / `#26262c` |
| Borders | `#1f1f24` (dividers), `#24242a`, `#2a2a31` (controls), `#33333a` (popovers) |
| Text | `#ededf0`, secondary `#a1a1aa`, muted `#8a8a94`, faint `#7c7c86` / `#6f6f79` |
| Accent | `oklch(0.72 0.15 255)`; accent text `oklch(0.80 0.12 255)`; tint `/ .16` |
| Live / success | `oklch(0.78 0.15 150)`; text `oklch(0.88 0.10 150)` |
| Lock / warning | `oklch(0.80 0.13 80)`; text `oklch(0.88 0.10 85)` |
| Danger | `oklch(0.75 0.15 25)`; window close `#c42b1c` |
| Type | Geist 12.5 base, 13.5 doc; section titles 15/600; labels 12; meta in Geist Mono 10.5–11; overlines in mono 10 with 0.06em tracking |
| Radius | 5 (small), 6–7 (controls), 8–10 (cards), 12–14 (dialogs), 999 (chips) |
| Sizes | Title bar 40 · Rail 72 (48 narrow) · Status bar 26 · Left panel 232 · Inspector 320 · Screens detail 340 · Theme column 360 · Control height 26–28 · Phone rows ≥ 44 |
| Popover shadow | `0 16px 48px rgba(0,0,0,.65)` |
| Focus | 2 px accent outline, 2 px offset, on every interactive element |

Icons: Material Symbols Rounded (opsz 20–24, wght 300).

---

## 13. Before → after (every current surface)

`→ Retired` means the control is removed. A link means a `↗` LinkRow pointing at the home.

**Top bar**
| Today | New home |
|---|---|
| Profile name / Edit profile switcher | Screen / page switcher → Manage screens… |
| Undo, Redo, Save | Stay |
| Kiosk view | Live › kiosk list |
| Import (InfoPanel) | Import door |
| Export (InfoPanel canvas) | Export sheet › Export a page for InfoPanel |
| ⋯ Export config | Export › Back up everything |
| ⋯ Import config… / Import InfoPanel profile… | Import door |
| ⋯ Export InfoPanel canvas… | Export sheet |
| ⋯ Copy profile JSON | Export rows › Copy JSON |
| ⋯ Command palette | Title bar command entry |
| ⋯ Keyboard shortcuts | Help › Shortcuts (and `?`) |
| ⋯ Reset everything… | Settings › Dashboard › Danger zone |
| ⋯ menu itself | → Retired |

**Rail**
| Today | New home |
|---|---|
| Profiles | Switcher + Screens |
| Theme | Theme |
| Layers, Widgets | Design › left panel |
| Gauges | Library › Gauges |
| Library | Library |
| Alerts, Dynamic Island | Alerts & Island |
| Data sources | Data |
| Help, Shortcuts | Help |
| Settings (desktop only) | Settings (both platforms) |

**Zoom bar and page tabs**
| Today | New home |
|---|---|
| Grid, rulers, zoom, Fit, left-panel toggle | Stay (the toggle moves into the tab row) |
| Resolution button | Link → Screens |
| + Add page | Stays |
| Rename, Icon…, Duplicate, Delete | Page inspector (tab right-click keeps shortcuts; double-click renames) |
| Theme… | Page inspector › Edit in Theme |
| Show on kiosk | Live |
| Cycling Play/Pause, Back to the saved setting | Live › Rotation |
| Kiosk-page marker | Stays (read-only) → opens Live |

**Profiles drawer**
| Today | New home |
|---|---|
| Import | Import door |
| New, cards, Opens now / On launch | Screens |
| Card ⋯ Rename, Duplicate, Export profile, Delete | Screen card ⋯ |
| Always open this one | Screens › When the app opens |
| Copy profile JSON | Export › Copy JSON |
| Inline pages + Add page | Screens › Pages |
| When the app opens | Screens |

**Profile inspector › Layout:** Screen (name, size, Use this window's size, Fill / Scroll) and Grid → Screens detail.

**Profile inspector › Look**
| Today | New home |
|---|---|
| Theme tokens, palettes | Theme › Colors · Start from |
| Corners | Theme › Shape & spacing |
| Font [global] | Theme › Typography (per screen, §11.1) |
| Skins | Theme › Start from |
| Saved looks; Save current look as preset | Library › Themes; Save as Theme |
| Replace the page background | Apply a theme › Include background |
| Surface, Background opacity, Background blur | Theme › Surface & effects (Opacity, Blur) |
| Apply to every widget | Section lock (Screen scope) |
| Edit widget style ↗ | → Retired |
| Background; Uploaded files popover | Theme › Background; Library › Media |
| All profiles / This profile switches | → Retired (scope bar + chips) |

**Profile inspector › Behaviour**
| Today | New home |
|---|---|
| Pages, Add page, cycle, switch every, which pages | Screens › Pages, Rotation |
| Page dots and swipe | Settings › Dashboard › Kiosk |
| Dynamic Island (duplicate) | → Retired (link in Screens) |
| Performance | Settings › Dashboard (base) + Screens › Performance (chip) |
| Clock, Show seconds, Date locale | Settings › Dashboard › Clock & date |
| Hide cursor in kiosk mode | Settings › Dashboard › Kiosk |
| Studio: Quick bar, Inspector sections | Settings › Studio |
| Connection: Data API URL, Test, Open API index | Data › Connection |
| "Server, updates and startup are in App settings ↗" | → Retired (status bar) |

**Rail Theme page**
| Today | New home |
|---|---|
| Scope list | Scope bar |
| Live preview, per-zone chips | Preview with exception badges |
| Who doesn't follow + Reset to theme | Exceptions + Make it follow |
| Style / Data / Behaviour tabs | One ordered section list |
| Lock, Unlock, Customize, Use profile | Lock toggle, chip, Reset to inherited |
| Lock all / Unlock all | Lock all (Screen scope) |

**Zone inspector**
| Today | New home |
|---|---|
| Header, Show tab | Stay |
| Save as panel preset… | Save as Panel |
| Copy / Paste style | Right-click menu |
| Use as global… ▸ | Make this the theme for… ▸ |
| Apply / Save / Delete preset ▸ | Start from a Style · Save as Style · Library › Styles |
| Style preset select | → Retired (§11.3) |
| Widget colors; Zone frame | Colors; Border & glow |
| Follows / Customize / Custom / Use theme / Locked bars | InheritChip + action line |
| Data tab | Stays, plus a link to Data |
| Send to island | Stays, plus a link to Alerts & Island |
| More (n), Reset, N changed, search, pin | Stay |
| Changed filter | → Retired |

**Drawers**
| Today | New home |
|---|---|
| Add widget (search, categories, My panels) | Design › Add widget |
| Canvas zone · Import .infopanel | Import door → Canvas zone |
| Layers (list, hide, delete, Add) | Design › Layers |
| Alerts (rules, Active now, History, defaults, editor) | Alerts & Island › Rules, History, Defaults |
| Island (all sections, notices, widgets) | Alerts & Island › Island |
| Island › Alert rules | Link → Rules |
| Island "As General" font / clock | LinkRows → Theme, Settings |

**Library and Gauges**
| Today | New home |
|---|---|
| My library / Profile assets | One library + "Used by" filter |
| Import profile, Upload | Add files… → Import door |
| Smart collections | Search filters |
| Type collections | Tabs |
| Add fonts | Import door |
| Get a font | Link in the Fonts tab |
| Gauges / Editor tabs, presets | Library › Gauges |
| Import .gauge.json / SVG / frames | Import door |
| Editor Import / Export | Import door / Export › Export a gauge |

**Dialogs, windows and tray**
| Today | New home |
|---|---|
| Data sources page | Data |
| Import InfoPanel dialog | Step 2 of the Import door (the "Lands in" step is removed) |
| Export dialog | Export › Export a page for InfoPanel |
| Desktop Settings window | Settings › App (window retired) |
| Restart bar | Settings › App banner + status bar |
| Help window | Stays; F1 / `?` open it in context |
| Tray | Stays as shortcuts; Settings → Settings › App |
| Remote control: mute, reload, dim, island | Live |

**Command palette:** rename these entries.
| Old entry | New entry |
|---|---|
| Appearance… | Theme |
| General settings… | Settings › Dashboard |
| Connection… | Data › Connection |
| Background… | Theme › Background |
| Font… | Theme › Typography |
| Apply appearance: ‹x› | Apply theme: ‹x› |
| Follow global style | Make it follow |
| Global style: all profiles / this profile | Theme scope: All screens / ‹screen› |

Also add: Open Live, Import…, Export & back up…, Manage screens…, and one entry per destination.

---

## 14. Task paths (targets)

- **Change colors for everything:** Theme → All screens → Colors. That is 2 clicks from Design. Today it takes 7 or more.
- **Give one screen its own look:** Theme → ‹screen› → edit any section (it becomes Custom here). Optionally lock it. There is no switch-flipping.
- **Back up:** Export → Save backup.
- **Change the API URL:** the status bar's Data API item → Connection.

---

## 15. Acceptance tests

- [ ] No retired label (§2.2) appears anywhere in the UI, the palette or help.
- [ ] Every row in §13 is reachable at its new home. Every link (`↗`) opens its home with the control focused.
- [ ] No setting has two editors. Searching the inspector for a linked setting shows the LinkRow, not a control.
- [ ] Inheritance chips:
  - they appear on every inheritable section, and on none of the single-scope settings;
  - they show the correct state and level for each case (inherited from All screens / Screen / Page, custom, locked, base, built-in);
  - their state is readable with color removed (check in greyscale).
- [ ] Locks:
  - locking a section at Screen scope disables that section for every widget and page of that screen, and shows `Locked by Screen`;
  - unlocking it restores any kept overrides.
- [ ] Exceptions:
  - "Make it follow" removes exactly that override;
  - "Make all follow" respects the scope (Page scope never touches the page's own sections).
- [ ] Page scope cannot customise Colors or Background; the disabled reason is shown.
- [ ] The page-font migration: the existing global font shows as All screens › Typography, and the kiosk renders the same as before.
- [ ] The Style preset migration: zones with Dark, Light, Vivid or Mono render identically after migration.
- [ ] Import:
  - it detects config, profile, `.infopanel`, gauge, frames zip, image, video and font;
  - "Replace everything" makes a backup first by default;
  - `.infopanel` then runs the existing wizard, without the "Lands in" step.
- [ ] Export: all four rows work, and Copy JSON copies the same payload as the file.
- [ ] Live:
  - every control acts on the kiosks;
  - nothing in Live marks the document dirty;
  - pausing rotation is shown in the tab-row chip and resets on kiosk reload.
- [ ] Status bar:
  - each item reflects live state and opens its target;
  - in the browser, the Update item is hidden and the Server item opens the read-only notice.
- [ ] Settings › App works on desktop, and the separate Settings window no longer opens. Tray › Settings opens Settings › App.
- [ ] Browser build: no desktop-only control is clickable, and each one is explained.
- [ ] Responsive: at 1279 px the left panel starts closed; at 900 px the inspector floats; at 390 px the bottom bar and the bottom sheet work, with rows ≥ 44 px.
- [ ] Keyboard:
  - every control is reachable;
  - the focus ring is visible;
  - chip menus open with Enter and Space;
  - Esc closes popovers;
  - F1 opens help for the focused section.
- [ ] Existing strengths are unchanged: Ctrl K, undo/redo, the right-click zone menu, quick bar pins, inspector search, per-section Reset with "N changed", and F1.

---

## 16. Open decisions (implement as written; flag them to the owner)

1. **Screens is not a rail item.** A screen is the context for every view. The always-visible switcher plus "Manage screens…" replaces a destination. If testing shows people can't find it, add it to the rail under Design. Nothing else changes.
2. **Locks live in section headers at Screen scope,** not under Advanced.
3. **No page-level color tokens.** Check this with users who theme pages per game. Adding them later is a model change: a third token level.
4. **Pages have one home,** the Page inspector. Screens edits order and rotation only.
5. **The "Dashboard" Settings tab name.** The fallback name is "Kiosk".
6. **The Island stays with Alerts,** with a link from Screens.
