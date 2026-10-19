# InfoPanel Lab features in the Studio: implementation spec

Source brief: *InfoPanel Import Lab — Design Brief* (Oct 17, 2026).
Concept: `Studio Lab.dc.html` (open it in a browser and use the "Concept screens" strip at the top to jump between states). Shared pieces: `GaugeRender.dc.html` (vector gauge renderer) and `AssetThumb.dc.html` (thumbnail for any library item).

The concept is a **behaviour and layout reference**. Build it with the app's stack (React 19, Tailwind 4, Base UI, lucide icons), the `--ui-*` tokens and the existing inspector registry. Map Material Symbols names to the nearest lucide icons.

**Rules from the brief, still binding**
- One drag, one field change or one bulk action = **one undo step**. Asset edits share the editor history.
- Shortcuts never fire while focus is in an input, textarea or select.
- The canvas item inspector **extends the registry** with InfoPanel item kinds. Don't hand-build a panel per kind. Native items use the existing widget inspector.
- **No feature loss.** The checklist in §11 maps every lab feature to a screen.
- The canvas renders in all three shells: web studio, Tauri desktop app and kiosk page.

---

## 1. Placement decisions (settled)

| Question from the brief | Decision |
|---|---|
| Where do Assets, Fonts and Gauges live? | A new **Library** rail item opens a full-width page. Gauges have their own page (§6), reached from Library › Gauges & bars and from a gauge item's "Edit gauge…". |
| Library scope | Two tabs: **My library** (the user's reusable content) and **Profile assets · <profile>** (the active profile's files, i.e. the lab's assets table). |
| Library model | **Copy semantics.** Placing a library item into a profile copies it in; "Save to My library" copies a profile asset out. Copies are independent, so users can keep variations of the same item. Storage still dedupes identical bytes by SHA-256 under the hood, but that's invisible to the user. |
| Does the report gate the import? | **Yes: review before commit.** Nothing is written until Save. |
| Does remap block the import? | **Yes**, until every group is matched, confirmed, picked, or deliberately **Left unbound**. "Leave unbound" is a valid answer, so it never fully blocks. |
| How does Both mode present? | **One canvas.** Every item keeps both forms and starts native; flip per item or all at once, and compare with the screenshot overlay. |
| Showing faithful vs native on the canvas | Hidden by default. **Show modes** tints every item. The item tree always shows a small mode dot. The selection badge names the mode. |
| Gauge builder density | **Two modes on one page:** Gauges (browse every gauge with a live preview) and Editor (the parts list toggles each of the ~20 part groups). Presets sit in a strip in the editor. |

---

## 2. Navigation

- **Rail:** add **Library** (`photo_library` → lucide `Images`) between Profiles and Data sources.
- **Top bar right:** add **Import** and **Export** text buttons before Save. They also stay in the profile menu next to the existing import/export items.
- **Add widget panel:** add a **Canvas zone · Import .infopanel** card that opens the Import dialog with destination "Canvas zone in <current profile>".

---

## 3. Library page

Layout: page header (56px) above a three-column body: `216px sidebar | fluid main | 320px detail`.

### Header
`Library` · tab segment [My library | Profile assets · <profile>] · search (max 520px) · **view toggle [Grid | Shelves]** (My library only, default Grid) · spacer · Import profile · **Upload** (primary).

### Search ("search everything")
- Searches name, type, pixel size, kind and auto-tags. **Every word must match** (case-insensitive). It runs across all collections.
- Grid view only. Typing in Shelves view shows the grid of results.

### Sidebar collections (counts on the right)
- **Smart:** All items, Recent, Unused (0 copies placed), Large files (> 1 MB), Duplicates (identical bytes, or perceptually identical images), Suggested for theme.
- **Media:** Images, Videos, Backgrounds, Icons, SVG templates, Fonts.
- **Made by you:** Gauges & bars, Saved panels, Style presets, Imported canvases.
- An item can sit in several collections; for example, a background is also an image.

### Grid view (default)
- Sticky toolbar: collection title, item count, **auto-tag chips** (the 7 most frequent in the current list; click to filter, click again to clear), and sort (Recently added, Name, File size, Most used).
- Cleanup banner (All items only): "N duplicates · N unused · N large files", with shortcut buttons.
- The first tile is a dashed **Drop files or click** upload tile. Drop also works anywhere on the page.
- Cards: 16:10 thumbnail (`AssetThumb`), name, mono meta line, and a flag chip (Unused / Duplicate). Single-click selects, double-click opens (a gauge opens the editor, a font opens Fonts). **Cards can be dragged** onto the canvas (§8).

### Shelves view
- A row of "Needs attention" cards on top (duplicate / unused / large, each with one action), then horizontal shelves: Suggested backgrounds (each shows its reason), Recent, Gauges & bars, Videos, Saved panels & styles. Each shelf has **See all →**, which switches to that collection in the grid.

### Detail pane (selected item)
- Large preview, name, meta.
- **Primary action by kind:** image/video → Set as background · gauge → Open in editor · canvas → Open canvas · style → Apply to selection · panel → Add to profile · font → Show font.
- **Secondary actions:** Add to canvas, **Duplicate as variant**, Optimise (images), Export `.gauge.json` (gauges), Export… / Re-import… (canvases).
- **Duplicate notice** with a **Merge** action (one undo step; library references repoint to the kept item).
- **Theme suggestion** line when the item is suggested.
- **Video:** Loop, Muted, Poster frame. **SVG template:** the variables that drive it (`--value`, `--percent`).
- **Facts:** type, size, length, file size, added, stored hash (mono, truncated).
- **Auto tags**, as chips.
- **Copies placed:** the copy count plus a list of places (each jumps to that profile/zone). Copy text: "N copies placed · editing this one changes none of them".

### Smart behaviours

| Behaviour | Rule |
|---|---|
| Auto-tag | On upload, read the real type and pixel size from the file header. Add: Dark/Light (mean luminance), 1–2 dominant hue names, Wide/Tall/Square (aspect), Transparent (alpha present), Animated (GIF/APNG/WebP frames, video), Loop (video with no audio track or user flag). |
| Duplicates | Identical SHA-256 = duplicate. Same pixel size and perceptual hash distance ≤ 4 = "looks identical" (also flagged). |
| Large | Over 1 MB, or stored more than 1.5× larger than its largest drawn size. |
| Theme suggestion | For the active profile's theme, rank Backgrounds by: (1) contrast with the theme text colour ≥ 4.5:1 at the median luminance, (2) hue distance from the accent, (3) low detail (edge density). Show the top 3 with a one-line reason, e.g. "Same blues as the Midnight accent". |
| Usage | The copy count is kept on the library item; "jump to uses" opens the profile and selects the item. |

### Profile assets tab (the lab's files table)
- **Summary line:** "N files · size · N external".
- **Finding chips** that filter the table: Unused, Identical, Larger than drawn (1.5×), Over 1 MB, Missing.
- **Actions:** Add files (dedupe by bytes), **Replace by name…**, **Optimise images…**, **Clean up N** (primary; removes unused, merges identical, downscales to drawn size; one undo step).
- **Columns:** preview, name (mono), type, pixels, drawn at, size, uses (click to select the uses on the canvas), findings, then row actions: **Save a copy to My library**, Use for selection, Replace… (every use follows; a type change repoints), Remove (clears its uses).
- **"Outside the profile":** URL and absolute-path images, listed separately with a note.
- **Optimise drawer** (right, 440px): Format [Same type | WebP], Quality slider, Size cap [None | Drawn size | 50 %]. Live **before → after** table; animated files are skipped; files under 5 % smaller are "kept as is". Footer: "Saves X across N files", then Apply (one undo step).
- **Replace by name drawer:** groups the picked files into Will replace / Identical, skipped / **Ambiguous** (pick a target per file) / No match. Apply replaces in one undo step.

### Fonts (Library › Fonts)
- **"Requested by <profile>" table:** status dot, requested family · style, drawn with, how it got there (Data API / supplied / system / fallback / missing), items (click to select those text items), licence, and an action (**Get <family>** for missing, "InfoPanel fallback" when switched).
- A missing font can be switched back to InfoPanel's fallback for each request.
- **My fonts:** cards with a live sample (`14:32 54°C`), family, licence, faces · size · origin.
- **Add fonts:** ttf, otf, ttc, zip; each file is validated.
- **Get a font** (in the detail pane): source [Fontsource | Font Squirrel], search, a result card with preview, licence box and face checkboxes (faces the profile needs are pre-checked and labelled "needed by N items"), then "Add <family> · N faces". Afterwards the request resolves and the items redraw.
- **Licence values:** May share (green) · Check licence (amber) · Do not share (red). Show embedding permission too.

---

## 4. Import dialog

- **Size:** 960×640 max, with a step rail on the left (210px): **1 Source · 2 Mode · 3 Review · 4 Sensors · 5 Save**. Done steps show a check and can be clicked to go back; later steps can't be clicked. Each step shows a one-line summary under its name.
- **Source:** three cards: File or folder (`.infopanel`, extracted folder, `.canvas.zip`), Installed in InfoPanel (list read-only from `%LOCALAPPDATA%\InfoPanel`), Saved canvas.
  - **Upload progress:** a file card with a progress bar and "Uploading assets · 11.4 of 19.0 MB". Parsing starts as soon as the XML arrives. Continue unlocks when the upload completes, and the footer notes "Large assets keep uploading while you read".
- **Mode:** radio cards for Faithful, Native where possible (Recommended), and Both, each with a counts line ("71 native · 15 InfoPanel"). The choice is applied as one undo step.
- **Review (the report):**
  - **Summary tiles:** Items, Native, Sensors (to fix), Assets (size, findings), Fonts (missing), Gauges.
  - **Accordion rows** with drill-down: Why N items stay InfoPanel · App features native mode needs (with item counts) · Items by kind · Assets · Fonts · Data API on this PC · Parse notes.
  - Continue reads "Looks right, continue".
- **Sensors:** the remap panel (§5). Continue is disabled while any group is unresolved; the footer explains why.
- **Save:** Name; Lands in [New profile, sized like the InfoPanel one | Canvas zone in <current profile>]; "Also save the stored form (.canvas.zip) to the Library"; and a summary line. **Import <name>** commits the whole import as one undo step, then opens the canvas zone.

---

## 5. Sensor remap

The same panel appears in Import step 4 and as a dialog reopened from the zone toolbar (**Remap** button with a red count badge of check + unresolved).

- **Filter segment** with counts: All · Check · Unresolved · Done. Next to it, a summary line and **Confirm all N suggestions**.
- **Left: group list.**
  - Each row shows: status dot, the original sensor name · hardware, ↳ the mapped key name and hardware, live value, status label, an **N items** chip (selects those items on the canvas and closes the dialog), and a ✓ confirm button on Check rows.
  - The selected row gets an accent bar on its left edge.
- **Right: key picker** for the selected group.
  - Header: name, hardware · source · items, then status · reason.
  - Search: "every word must match" over key, name and ref; ↑↓ moves through results and Enter picks.
  - Ranked suggestions, each with a reason ("Strong · same reading type and name"), live value and the key in mono.
  - Footer: **Leave unbound** · **Reset to automatic**.
- **Resolution order:** user choice → automatic (exact ref, plugin key, HWiNFO name) → a suggestion when exactly one candidate is strong.
- **Statuses:** Matched / Confirmed (green), Your choice (accent), Check (amber), Unresolved (red), Left unbound (grey).

---

## 6. Gauges page

The page header has a segment **[Gauges | Editor]**.

### Gauges (browse)
- **Main area:** sections **Presets** ("Customising one makes your own copy"), **In <profile>**, and **My library**, each a grid of square live thumbnails. Single-click selects, double-click edits.
- **Header actions:** Import .gauge.json / SVG · **New gauge**.
- **Right pane:** a large live preview with **play** and a value scrubber; name, kind · source, and copies placed. Primary button: **Customise a copy** (presets) or **Edit**. Secondary: Add to canvas, Duplicate, Export.

### Editor
- **Header:** ← back to Gauges · name and kind label · Import · Export · **Save to library** (saves a copy).
- **Preset strip** under the header. Picking a preset replaces the current spec (one undo step) and names it "<preset> copy".
- **Left: parts list,** grouped Core · Indicator · Scale · Text · Decor · Effects · Liquid.
  - Each part has a toggle. Shape and Fill are always on, so their toggles are dimmed.
  - Parts that don't apply to the current shape are hidden: needle is arc only; wave, shine and bubbles are liquid only; icon row is bar only.
  - Clicking a row selects it for the inspector.
- **Centre:** preview on a dark stage, a play button that sweeps 0–100 and back, and a value scrubber. Below sits "Theme colours follow '<theme>'".
- **Right: inspector for the selected part only,** with a header Add/Remove part button.

| Part | Fields |
|---|---|
| Shape | Type [Arc, Bar, Liquid, Grid]; Arc: Sweep 90–360°, Thickness; Bar: Thickness; Liquid: Tank [Round, Rect, Diamond, Hex]; Grid: Light cells [In order, Random, Middle] |
| Fill | Mode [Solid, Gradient, Zones, Thresholds]; colour palettes; Follow dashboard theme |
| Track | Opacity |
| Needle | Style [Line, Taper, Arrow, Dot] |
| Ticks / Labels | Count 3–21 / on major ticks |
| Value text / Title | Size, Suffix / Text |
| Pattern | [Stripes, Dots, Chevrons] (moving) |
| Glow / Shadow | Strength / on |
| Background, Rings, Marker, Icon row, Centre icon, Wave, Shine, Bubbles | On/off (extend as needed) |

- **Image-sequence gauges** (from In <profile>): the centre shows a **frame filmstrip** (selected range highlighted, the current frame marked) and tools: Reverse, Resample…, Duplicate, Replace…, Remove. The right pane shows: Frames per second, **Recolour** (hue, saturation, brightness; previewed live, applied to every frame in one undo step), and **Convert to vector** (the original frames are kept).
- **Bake bar** (bottom): status dot plus "InfoPanel export · Frames out of date / baked", and a **Bake frames** button. Baking is only for `.infopanel`; the dashboard always draws live.
- **SVG templates:** the user's own SVG, driven by `--value` and `--percent`, with animations kept. It's sanitised on load (max 256 KB). Library frames are stored once each, keyed by hash.
- **`.gauge.json`** is the lab's `VectorGauge` shape (`src/lib/infopanel/gauges/vector.ts`): `{format: "infopanel-gauge", version: 1, name, gauge}`, written and read by `src/lib/infopanel/gauges/spec-file.ts`, with the gauge normalised like any untrusted spec. The concept's flat `GaugeRender` object (`{shape, sweep, thick, …}`) is internal to the concept's renderer and is not the file format; there is no converter.
- **Image sequences** have no spec to put in a `.gauge.json`. Export on one downloads `<name>.gauge-frames.zip`: a `manifest.json` (`format: "infopanel-gauge-frames"`, `version`, `name`, `frameCount`, `frames` in order, `width`, `height`, `min`, `max`, `animationSpeed`) and the frames as PNG under `frames/`. **Import frames (.zip)** in the header reads it back into My library (`src/lib/gauge-studio/frames-zip.ts`); it refuses a wrong format or version, a count that does not match, anything but PNG, and more than 512 frames, 8 MB a frame or 128 MB in all.

---

## 7. Canvas zone editing

- **Left: Items** (the InfoPanel item tree).
  - Rows have: an indent per depth, a group chevron, a kind icon, the name, a **mode dot** (blue native · amber InfoPanel · red can't convert), a lock icon, and a **visibility checkbox** (InfoPanel's Hidden flag).
  - Selection: Shift selects a range, Ctrl adds. A legend sits at the bottom.
- **Toolbar,** left to right:
  - Undo, Redo
  - Duplicate (Ctrl+D), Group (Ctrl+G), Ungroup (Ctrl+Shift+G), draw order Up/Down, Delete
  - **Draw all as [InfoPanel | Native]**, a bulk action that is one undo step
  - **Show modes** toggle, which opens a legend strip with counts
  - Sensors [Unbound | Live | Mock]: Mock shows a slider per bound item in the inspector
  - **Remap** with its badge
  - **Compare**, which opens a strip with an opacity slider and uses a difference blend
- **Canvas:** the profile at native size, scaled to fit, drawn in InfoPanel's draw order.
  - **Select:** a selected item gets a 1.5px accent outline, a **badge** above it ("Native · Bar" or "InfoPanel · Text · glow"), and 8 resize handles (only for one unrotated, unlocked, non-group item).
  - **Move:** drag to move; arrow keys nudge 1px, Shift+arrow 10px. Locked items select but don't move.
  - **Show modes tint:** native items get a blue wash, InfoPanel items amber, and items that can't convert red hatching.
- **Inspector (308px):**
  - **Header:** item name, "InfoPanel · <kind>".
  - **Draw as [InfoPanel | Native].**
    - **Native:** a card naming the dashboard widget, then "Lost while native" (amber list) and "Uses app feature" (chips).
    - **InfoPanel:** a line saying the theme doesn't apply.
    - **Can't convert:** a red note with the reason and the feature it needs; the Native option is disabled.
  - **Position:** X, Y, W, H (mono), plus rotation and flip.
    - **Invalid values:** the field gets a red border and the message "InfoPanel needs W ≥ 1. The value isn't stored." The last valid value stays in the model.
  - **Sensor:** a button showing the status dot, mapped key · hardware, "was <original>" and the live value. It opens Remap.
  - **Kind section:** generated from the InfoPanel kind schema in the registry. A gauge also gets **Edit gauge…**.
  - **Colours.**
  - **Unknown fields:** read-only, mono, "exported as they came".

---

## 8. Drag from the library

- Library cards (grid, shelves and gauge thumbnails) carry `{libraryItemId}` in the drag data.
- **Dropping on the canvas:** an image or video becomes an image item, a gauge becomes a gauge widget, a style is applied to the item under the cursor, and a panel becomes a panel zone. Show a drop ghost at the drawn size.
- **Dropping on the background slot** (Profile › Background) sets the background.
- Every drop **copies** the item into the profile and adds 1 to the library item's copy count. One undo step.

---

## 9. Export dialog

- **Two output cards:**
  - **Stored form:** `<name>.canvas.zip` with `canvas.json` (infopanel-canvas v1) plus assets and fonts by SHA-256.
  - **.infopanel for InfoPanel:** `Profile.xml` + `DisplayItems.xml` in InfoPanel's field order, with numbers printed as .NET prints them.
- **.infopanel options:** Bake stale vector gauges first (with a count) · Leave unused assets out (count · size).
- **Font licences review:** one row per font (family, how it was supplied, licence). A "do not share" font gets a choice: **Include anyway | Leave out | Swap for <alternative>**. Including one shows a warning, and the save note names it.
- **`.infopanel` and fonts:** the licence review applies to `.canvas.zip` only, the package that carries font files; an `.infopanel` export says in one line that fonts are not included and InfoPanel uses the PC's installed fonts.
- **Contents summary** (mono file list) · file name · estimated size · Export.

---

## 10. States to build (not drawn in the concept)

| Where | State | Behaviour |
|---|---|---|
| Library | First run / empty | The upload tile fills the grid width: "Drop images, videos, fonts or an .infopanel here". Shelves are hidden. |
| Library | Upload in progress | A bottom-right tray lists files with progress bars; it collapses to a pill. A duplicate says "Already in your library, kept the existing copy". Validation errors (bad font, SVG over 256 KB, unsafe SVG) show per file. |
| Library | Search with no results | "Nothing matches. Every word must match a name, tag, type or size." (in the concept) |
| Import | Parse failure | The Source step shows the file card in red with the parser message and the line; there's no Continue. |
| Import | Partial parse | Review shows "Parse notes" open, with the issues. Unknown fields are kept. |
| Import | Data API offline | The "Data API on this PC" row reads "Not reachable", and the Live sensor source is disabled with a tooltip. |
| Canvas | Missing asset | The item draws a hatched placeholder plus a broken-image icon. Profile assets › Missing filter, with Replace… |
| Canvas | Missing font | Text draws with the fallback face. The Fonts row offers Get or Use fallback. |
| Any | Server offline | The Save dot stays on and the top bar shows "Offline · edits kept locally". |
| Gauge editor | Unsaved changes on back | Confirm: Save to library / Discard / Cancel. |

The responsive rules from `handoff_widget_editing/SPEC.md` apply to the canvas zone inspector. Below 900px, the Library detail pane becomes a bottom sheet and the Gauges page stacks preview over the inspector.

---

## 11. Lab feature → screen checklist

| Lab panel | Feature | Where |
|---|---|---|
| Profile picker | Corpus / installed / saved canvas; screenshot marker | Import › Source; Library › Imported canvases; Compare |
| Import | Mode, report, save stored form, export | Import › Mode/Review/Save; Export dialog |
| Compare / editor | Toolbar, canvas, handles, tree, inspector, overlay | Canvas zone (§7) |
| Remap sensors | Groups, statuses, key picker, confirm all | Remap (§5) |
| Gauges | List, preview/play, retime, frames, recolour, vector builder, presets, library, convert, .gauge.json, SVG templates, bake | Gauges page (§6) |
| Assets | Files table, uses, cleanup, downscale, optimise, replace, replace by name, URL/absolute lists | Library › Profile assets (§3) |
| Fonts | Requests, resolved faces, missing + pack, library, add, Fontsource/Font Squirrel, licence (declared by the file), embedding, fallback switch | Library › Fonts; Export licence review |
| Sensors | Unbound / Live / Mock, bindings | Canvas toolbar; inspector Sensor section; Remap |

## 12. Files
- `Studio Lab.dc.html`: all screens; use the top strip to switch.
- `GaugeRender.dc.html`: reference vector gauge renderer (SVG). The text layer is built with `createElement` because SVG `<text>` can't contain HTML.
- `AssetThumb.dc.html`: thumbnail rules per kind.
- `support.js`: the runtime for opening the concept files locally.
