# Profiles panel + Dashboard inspector: audit (spec section 0)

Read-only audit of the code as of `main` (8e251f3). Paths are relative to the repo root. "config.json" means the dashboard
config (`DashboardConfig`, `src/lib/layout.ts:228`): held in the studio, saved to the server's `config.json` through
`/api/config` (`src/lib/dashboard-server.ts:10`) and mirrored to browser localStorage `infopanel-dashboard:config:v1`
(`src/lib/layout.ts:~468`). Every setting below is in that config unless the Where column says otherwise.

## Findings that change the spec (read first)

1. There is no `cfg.autoProfile`. Auto-pick is `config.activeProfile === "auto"` (`activeProfile: string`, an id or `"auto"`;
   `layout.ts:231`, default `"auto"` at `:309`). Turning it off writes `activeProfile = <id of the profile displays show>`
   (`profiles-panel.tsx:320`, `use-studio-mutations.ts:388`). So "Always the same profile" already has a stored form
   (`activeProfile = id`) and `launchProfileId` would duplicate it. See Q1.
2. Clicking a profile card today runs `onActivate(id)`, which sets `activeProfile = id` and so switches auto-pick OFF
   (`profiles-panel.tsx:214`, `studio-view.tsx:193`). The spec's card click ("edit this profile") and "When the app opens" are
   coupled in the current code.
3. A third concept the spec does not mention: **Pin for editing** (`pinnedId`, localStorage `studio.pinnedProfile`, studio-only,
   `pinned-profile.ts`). The studio edits `editedProfileId` (pin, else what displays show), while displays follow
   `activeProfile`. The card has a Pin button and a check mark for "shown on displays" (`profiles-panel.tsx:268-296`).
   Help documents it (`src/help/articles/profiles.md:40-49`). The design has no equivalent.
4. "Force global style" does not exist. It became per-section **locks** on the profile's widget theme
   (`profile.widgetTheme.locks`, 11 sections; `theme-model.ts:59-66`, `allLocked` `:224`) in config v6. The only UI is
   Studio > Theme (`theme-editor.tsx:124` "Lock all / Unlock all") and the palette command `toggle-enforce`
   (`use-studio-commands.ts:182`). It is a boolean per section and per profile only (no dashboard level, no Inherit state).
   There is no "Global style tab"; the "Global style editor" is the Theme editor (Studio > Theme, `theme-editor.tsx`).
5. `general.motion` and `general.maxFps` ARE the dashboard-level Motion and Max FPS (the "Dashboard" value of the
   per-profile Performance). They sit in General > Performance, not General > Display. They cannot move to App Settings
   (they are dashboard config read by the kiosk). See Q5.
6. Corner radius is not in Appearance. It is `profile.radius` (rem), edited in the Profile section; `config.radius` (default 0.5)
   has no editor in the Dashboard inspector (only presets write it, `appearance-preset-apply.ts`).
7. Dashboard 12/24 h clock is not in `general`; it is the themed `clock` of the all-profiles style (`config.style.clock`,
   `general-panel.tsx:68`, `general.ts:80`).

## 1. Components

| Piece | Where |
|---|---|
| Profiles rail panel (list, header, "New profile") | `src/components/studio/profiles-panel.tsx:194` `ProfilesPanel` (header `:222-236`, rows `:238-309`) |
| Row meta line `WxH . CxR . Fill . N pages` | `profiles-panel.tsx:48` `profileMeta` (used also by other callers; grep before changing) |
| Row thumbnail | `profiles-panel.tsx:254` `ProfilePreview` 104x60 (`profile-preview.tsx`, `profile-preview-model.ts` `fitPage`) |
| Row menu "..." (Rename, Size grid and spacing, Copy profile JSON, Delete) | `profiles-panel.tsx:54` `RowMenu` |
| Delete confirm | `profiles-panel.tsx:115` `DeleteDialog` (AlertDialog; says undo with Ctrl+Z brings it back) |
| Inline rename | `profiles-panel.tsx:~147` `RenameInput` (exported; page tabs reuse it) |
| Footer "Auto-pick by window size" toggle + "Showing/Would show X" | `profiles-panel.tsx:313-326` |
| Drawer host | `studio-drawers.tsx:27`; props assembled `studio-view.tsx:339-358` |
| Page tabs above the canvas | `src/components/studio/page-tabs.tsx:179` `PageTabs`; mounted `studio-view.tsx:481`; rotate toggle slot `page-tabs.tsx:322-326` -> `rotate-toggle.tsx` |
| Nothing-selected inspector | `studio-inspector.tsx:~139` renders `DocumentInspector` -> `document-inspector.tsx:119/124` |
| Header "Dashboard / <profile> . nothing selected" | `zone-inspector-parts.tsx:250` `DashboardHeader` |
| Tabs Profile / Appearance / General, search, Changed N, footer | `inspector/inspector-view.tsx`: `Tabs` `:110`, search + Changed `:~388-412`, `Footer` "What the dots mean" `:152` |
| Section registry (ids, titles, tabs) | `inspector-model.ts:376-432` `dashboardSections`; `DashboardTab` `:47` |
| Section bodies | `document-inspector.tsx:211-340` (`parts` switch) |
| Profile tab bodies | `inspector/profile-sections.tsx`: `ProfileFields :97`, `ProfileInherit :212`, `ProfilePerformance :277`, `AutoPick :310`, `AutoRotate :351` |
| Dynamic Island body | `inspector/island-section.tsx` `IslandSection` (also used by the Dynamic Island panel, `island-panel.tsx`) |
| Appearance bodies | `appearance-panel.tsx` (Scope), `skin-gallery.tsx`, `appearance-gallery.tsx`, `surface-picker.tsx` (`SurfacePicker`, `CardEffects`), `theme-panel.tsx`, `profile-theme-panel.tsx`, `background-panel.tsx`, `background-editor.tsx`, `background-video.tsx` |
| General bodies | `general-panel.tsx:68` `generalCards`; Studio card inline `document-inspector.tsx:313`; `data-api-panel.tsx` |
| Edits (config writers) | `use-document-props.ts` (theme, style, background, general, dataApiUrl), `use-studio-mutations.ts` (profile add/remove/activate `:372-388`, `setRotate :368`, pages) |

**Shared with the widget inspector** (zone/panel/multi inspectors use the same code): `InspectorView` (tabs, search box,
Changed N, accordion sections, "More" rows, footer legend), `SettingsSearch` (`zone-inspector-parts.tsx:379`), `SettingSection`
(`setting-card.tsx`), `SourceDot` and `DotLegend` (`inspector/source-dot.tsx`), `InspectorNote`, `SectionPad`,
`inspector-prefs.ts` (remembered tab per context key "dashboard"), and the row kit `setting-rows.tsx`
(`SegmentedRow`, `SliderRow`, `ToggleRow`, `SelectRow`, `InlineRow`, `StackRow`). Dashboard-only: `DashboardHeader`,
the `dashboardSections` registry and `DocumentInspector`. The spec's "remove search and Changed from this view" needs a
per-context switch in `InspectorView` (it has none today); the widget inspector must keep them. The palette's jumps
(`DOCUMENT_CARD`, `document-inspector.tsx:30`; `ui.openDocumentTab`) and "Go to setting" search use the dashboard section ids and
the tab ids `profile|appearance|general` (`studio-inspector.tsx:~75`, `setInspectorTab("dashboard", ...)`); renaming tabs needs those updated.

## 2. Settings table (everything the sections render today)

Scope: dashboard = `DashboardConfig` level, applies to all profiles; profile = on `MonitorProfile`; general = `config.general`
(dashboard-wide, "app-like" but in config.json); app = Tauri settings.json (none are in these sections); browser = localStorage
(studio-only view prefs). Section column = where it shows today. New home = spec section 4 (marked NEW / NOT IN 4 where relevant).

### Profile tab

| Section | Label | Stored key | Type / range | Default | Scope | Stored | New home |
|---|---|---|---|---|---|---|---|
| Profile | Name | `profile.name` | string | "Main display" first profile; new = "WxH" (`use-studio-mutations.ts:373`) | profile | config.json | 4.1 Screen > Name |
| Profile | Design size (select) | `profile.width`, `profile.height` | presets 1920x550, 1920x1080, 2560x720, 1280x400, 1024x600, 800x480, else "Custom" (`inspector/profile-grid.ts:34`) | 1920x1080 / window size for new | profile | config.json | 4.1 Screen > Design size. Today a non-preset shows as the trailing "Custom", spec wants it shown first |
| Profile | Width, Height (number fields) | same | int >= 1, no max (`parseSize`) | | profile | config.json | 4.1 (not in spec; keep, Design size needs a way to type a size) |
| Profile | Grid columns | `profile.cols` | int 2-24 (`changeCols`, `studio-actions.ts:414`); refused if a zone would fall outside | 12 (6 if width <= 1280 on new) | profile | config.json | 4.1 Grid > Columns (stepper) |
| Profile | Grid rows | `profile.rows` | int 1-24 (`studio-actions.ts:431`) | 6 (4 if height <= 700 on new) | profile | config.json | 4.1 Grid > Rows. Spec says 1-20, app is 1-24 |
| Profile | Fit mode | `profile.fit` | `"fill"` / `"scroll"` | scroll (new: fill if h <= 700 and w >= 1600) | profile | config.json | 4.1 "When it doesn't fit" |
| Profile | Gap | `profile.gap` | int px 0-200 (`MAX_SPACING`, `profile-grid.ts:13`); slider 0-64 (stretches to the value); empty = default | 12 (`DEFAULT_GRID_GAP`) | profile | config.json | 4.1 Gap slider. Spec 0-48, app slider 0-64 |
| Profile | Padding | `profile.padding` | int px 0-200; slider 0-64; empty = default | unset: fill kiosk 0, fill studio 12, scroll 24 (`profilePadding`) | profile | config.json | 4.1 "Edge padding" |
| Profile | Corner radius | `profile.radius` | rem 0-1.5 step 0.05; shows `config.radius` (0.5) when unset | unset = dashboard | profile | config.json | 4.2 Theme > Corners. NOTE the spec says "Corners (the old Corner radius)" inside Theme; here it is NOT governed by the Theme Inherit/Custom (the Theme switch keeps `radius` as is, `profile-sections.tsx:231`) |
| Profile | Delete profile | `config.profiles` | action; disabled for the only profile; no confirm dialog here (the panel row has one) | | | config.json | Panel card menu (4/2). Inspector button has NO confirmation (`profile-sections.tsx:~180`) |
| This profile | Theme: Inherit / Custom | `profile.theme` (`Partial<ThemeTokens>`) | undefined = Inherit; Custom copies dashboard tokens | unset | profile | config.json | 4.2 Theme header switch (`Inherit` = All profiles) |
| This profile | Style: Inherit / Custom | `profile.widgetTheme.values` (`ModuleSettings`) | undefined = Inherit; Custom = `{}` then own keys (`withThemeValues`) | unset | profile | config.json | 4.2 Widget style header switch |
| This profile | Background: Inherit / Custom / None | `profile.background` (`PageBackground`) | undefined = Inherit; `{type:"none"}` = None; anything else = Custom (starts from dashboard bg or `{type:"color",color:"#0b0b0f"}`) | unset | profile | config.json | 4.2 Background switch. There is NO `pr.bg='None'` string: None is `{type:"none"}`, so "This profile + None" is `{type:"none"}` and "This profile + other" is the typed background; Inherit = key absent |
| Profile selection | Auto-pick profile | `config.activeProfile === "auto"` | `"auto"` or profile id | `"auto"` | dashboard | config.json | Footer "When the app opens" (Q1) |
| Auto-rotate | Auto-rotate pages | `profile.rotate.enabled` | bool | false (unset rotate = off) | profile | config.json | 4.3 Pages > "Cycle through pages" |
| Auto-rotate | Seconds per page | `profile.rotate.seconds` | free number, clamp 3-3600 (`profile-sections.tsx:~322`; `pages.ts:20-22`) | 15 | profile | config.json | 4.3 "Switch every". There are no 10s/30s/1min/5min options, only a number box |
| Auto-rotate | Pages (checklist, shown with 2+ pages) | `profile.rotate.pages` | `string[]` page ids; empty/unset = all | unset | profile | config.json | NOT IN 4: keep under Cycle (a page subset). Page-level reorder decides cycle order |
| Dynamic Island | see below | `profile.island` (`IslandConfig`, `lib/island/config.ts:56`) | | unset = no island (UI shows `enabled:false`) | profile | config.json | 4.3 Dynamic Island |
| Performance | Max FPS | `profile.performance.maxFps` | 5/15/30/60/0 (0 = Unlimited, `ticker.ts:8`); "Dashboard" = key removed | unset | profile | config.json | 4.3 Performance (All profiles = no override) |
| Performance | Motion | `profile.performance.motion` | `"reduce"` / `"full"` ("Dashboard" = key removed). The type also allows `"system"` (`performance.ts:10`, `normalizePerformance`) but the UI never offers it | unset | profile | config.json | 4.3 Animations. Spec lists Follow system / Reduced / Full: "Follow system" at profile scope would be a stored `"system"` (distinct from no override); decide, see Q4 |

Dynamic Island (`profile.island`; defaults `ISLAND_DEFAULTS`, `lib/island/config.ts:104`; editor `island-section.tsx`). Every key is per profile, config.json.
`enabled` (bool, defaults true in the model, shows false when `island` is unset) is "Show Dynamic Island". It also controls the always-on
clock pill, not only alerts. Under it, in 7 groups:
Shape: `shape` pill|notch (pill); `size` s|m|l (m); `scale` 80-150 step 5 % (100); `offsetY` 0-64 px, pill only (8); `reserve` bool (false).
Idle: `idle` time|time-date|sensor|line|hidden (time); `stats[]` max 3 of `{key,label<=12,warn?,crit?}` (empty); `rotate` 0-60 s (0).
Look: `tint` black|theme|custom (black); `bgColor` (#000000), `fgColor` (#ffffff) for custom; `opacity` 30-100 step 5 (100); `border` none|subtle|accent (none); `shadow` bool (true); `font` font id (system); `weight` regular|medium|semibold|bold (semibold).
Clock: `seconds` general|show|hide (general); `hours` general|24|12 (general).
Motion: `motion` lively|smooth|off (lively).
Alerts: `collapseAfter` 0-600 s, slider 0-120 step 5 (0); `group` bool (false).
Dashboard notices: `notices.page|layout|plugins|onAir|calendar|agents` bool (all false); `calendarLead` 1-120 min (10), shown when calendar is on; "Preview an alert" button (not stored).
There is no "position" or "duration" setting (spec 4.3 mentions both): position is `shape` + `offsetY`; alert duration is not configurable here
(info notice preview is 4 s, `island-section.tsx:~113`).

### Appearance tab

| Section | Label | Stored key | Type / range | Default | Scope | Stored | New home |
|---|---|---|---|---|---|---|---|
| Scope | Apply to: All profiles / This profile | none: React state `target` in `DocumentSheet` (`document-inspector.tsx:~157`) | `"all"`/`"profile"` | "profile" if the profile has its own `widgetTheme` or `background`, else "all"; resets per profile (`key={profile.id}`) | view state | not stored | Replaced by the per-section switches (4.2). What it wrote: it only chose the TARGET of Skins/presets, Theme and surface, and Page background edits: all -> `config.theme`, `config.style`, `config.background`; profile -> `profile.theme`, `profile.widgetTheme.values`, `profile.background` (`use-document-props.ts:25-45`, `appearance-actions.ts`). Not a stored setting. The Widget style switch takes over the `style` target; the Theme and Background switches take theirs |
| Scope | Widget theme / "Theme editor" button | opens Studio > Theme | | | | | 4.2 Widget style > "Edit widget style" (`onOpenTheme` = `editGlobalTheme("profile")`, `studio-inspector.tsx:~80`) |
| Skins | Skin gallery | `style.skin` (+ `style.surface = "auto"`) at target | skin pack name or auto | auto | target | config.json | 4.2 Look: not in 4. Presets/Skins have no home in the spec: keep (suggest under Widget style) |
| Skins | Saved looks (presets) + "Save current look" + "Replace the page background" | `config.appearancePresets` (user) + built-ins; applying writes theme tokens, radius, style (and optionally background) at target | | | dashboard list | config.json | NOT IN 4: keep. Spec 4.2 says "Preset swatches in a 3-column grid (the existing presets)" which is the THEME presets (`THEME_PRESETS`, `theme.ts:68`), not these Appearance presets. Both exist |
| Theme and surface | Surface | `style.surface` | auto/glass/matte-light/matte-dark/theme (`standard-settings.ts:57`; picker adds skin card) | glass (auto when a skin is set) | target | config.json | 4.2 Widget style (NOT IN 4) |
| Theme and surface | Background opacity | `style.surfaceOpacity` | 0-100 step 5 % | 100 | target | config.json | 4.2 Widget style (NOT IN 4) |
| Theme and surface | Background blur | `style.blur` | auto("Off") or px option | auto | target | config.json | 4.2 Widget style (NOT IN 4) |
| Theme and surface | Theme swatches (3-col grid) | `config.theme` (all) or `profile.theme` (profile) | `THEME_PRESETS` (zinc, ...) matched by token equality; edited = "Custom" | zinc (`DEFAULT_THEME`) | target | config.json | 4.2 Theme |
| Theme and surface | Primary, Accent, Background, Foreground, Card, Card text | `theme.<token>` as HSL triplet text (`"H S% L%"`) | `theme-rows.ts:7` VISIBLE_TOKENS | | target | config.json | 4.2 Theme. The spec puts only "Accent colour" outside "More"; the app shows 6 always |
| Theme and surface | More: Primary text, Secondary, Muted, Muted text, Destructive, Border, Ring | same | ADVANCED_TOKENS | | target | config.json | 4.2 Theme > More. Tokens popover, popover-foreground, secondary-foreground, accent-foreground, destructive-foreground, input exist in `ThemeTokens` (`theme.ts:10`) with no editor row |
| Theme and surface | "This profile" Inherit/Custom (inside the profile target) | `profile.theme` | | | profile | config.json | Duplicates "This profile > Theme" (`profile-theme-panel.tsx:35`); collapses into the Theme header switch |
| Page background | Mode Inherit / Custom / None (profile target only) | `profile.background` | see above | | profile | config.json | Duplicates "This profile > Background" (`background-panel.tsx:~75`); collapses |
| Page background | Type | `background.type` | none, color, gradient, image, video (`appearance.ts:12`). Profile target omits "none" from the type list (it uses the mode switch) | none | target | config.json | 4.2 Background. Spec's design left Gradient out; the app has it |
| Page background | Color | `background.color` | CSS colour | #0b0b0f | | config.json | |
| Page background | Gradient From / To / Angle | `background.gradient.{from,to,angle}` | angle 0-359 | #1e1b4b, #0b0b0f, 160 | | config.json | |
| Page background | Image / Video source | `background.src` (+ Library picker, drag from Library) | url | | | config.json | Drop-zone button |
| Page background | Video: Poster, Loop, Muted, Speed | `poster`, `loop` (true), `muted` (true), `rate` (1) | | | | config.json | NOT IN 4: keep (More) |
| Page background | Fit | `background.fit` | cover, contain, stretch, center, tile (video: no tile) | cover | | config.json | 4.2 More |
| Page background | Position | `background.position.{x,y}` | start/center/end, hidden when fit = stretch | center | | config.json | 4.2 More |
| Page background | Fill (behind) | `background.color` | | #0b0b0f | | config.json | NOT IN 4: keep (More) |
| Page background | Dim | `background.dim` | 0-100 % | 0 | | config.json | 4.2. Shown for gradient + image + video, NOT colour (`background-editor.tsx:~149`); spec says every type but None |
| Page background | Tint, Tint opacity | `background.tint`, `tintOpacity` | colour; 0-100 % | #000000, 0 (30 on first tint) | | config.json | 4.2 More |
| Page background | Blur | `background.blur` | 0-40 px (`MAX_BLUR`) | 0 | | config.json | 4.2 More |

### General tab

| Section | Label | Stored key | Type / range | Default | Scope | Stored | New home |
|---|---|---|---|---|---|---|---|
| Type | Font | `general.font` | font id (`FONT_CATALOG`) | system | dashboard | config.json | 4.4: App Settings > General (see Q8, needs config access) |
| Clock and date | Clock 12/24 | `config.style.clock` (NOT `general`) | auto (unset) / 24 / 12 | locale | dashboard | config.json | 4.4 |
| Clock and date | Show seconds | `general.showSeconds` | bool | true | dashboard | config.json | 4.4 |
| Clock and date | Date locale | `general.locale` | "" (System) or one of 14 `COMMON_LOCALES`, or a saved other | "" | dashboard | config.json | 4.4 |
| Performance | Max FPS | `general.maxFps` | 5/15/30/60/0 | 60 | dashboard | config.json | 4.3 Performance, "All profiles" value (stays in dashboard config) |
| Performance | Motion | `general.motion` | system / reduce / full | system | dashboard | config.json | 4.3 Animations, "All profiles" value |
| Display | Hide cursor in kiosk mode | `general.hideCursor` | bool | false | dashboard | config.json | 4.4 |
| Display | Page dots and swipe | `general.kioskPageNav` | bool | false | dashboard | config.json | 4.4 (or beside Cycle through pages: it also enables long-press pause) |
| Studio | Quick bar | localStorage `studio.quickBar` | bool | | browser | browser only | NOT IN 4 (studio view pref; App Settings cannot read browser storage when in a separate window, see Q8) |
| Studio | Inspector sections: One open / Many open | `useAccordionPref` (`inspector-prefs.ts`) | | one | browser | browser only | NOT IN 4 |
| Connection | Data API URL + Test connection | `config.dataApiUrl` | http(s) URL | `http://127.0.0.1:3921` (`data-api.ts:7`) | dashboard | config.json | 4.4 |

Not an inspector row, but nearby: "Inspector position" does not exist in General. Dock/float/sheet is a studio layout mode
(`use-studio-layout.ts`, localStorage `studio.dockCollapsed` and layout prefs), reached from the top bar, not the Dashboard tab.
No setting here is in Tauri settings.json.

## 3. Mapping summary and items outside spec section 4

- Moves as the spec says: Name, Design size, Grid, Fit, Gap, Padding (Layout); Theme tokens + preset swatches, Background
  (Look); Pages/rotate, Island, Performance (Behaviour).
- Outside section 4 (keep, closest section): Width/Height number fields (Layout, Screen); `rotate.pages` subset (Behaviour > Pages/Cycle);
  Skin gallery, Appearance presets (saved looks) incl. "Replace the page background", Surface, Background opacity, Background blur
  (Look > Widget style); video Poster/Loop/Muted/Speed and image Fill colour (Look > Background > More); the 7 theme tokens without
  editor rows stay unreachable; Studio card (Quick bar, Inspector sections; browser prefs); `general.kioskPageNav` / `hideCursor`.
- Corner radius (`profile.radius`) is outside the Theme switch semantics (see table).
- The Pin button/check mark and "Copy profile JSON" exist today and are not in the design (Q2, Q3).

## 4. Answers to the spec's questions

**Q1 Last-used profile when auto-pick is off? launchProfileId?** Yes, effectively. With `activeProfile = <id>` the kiosk and studio
show that id (`resolveProfile`, `layout.ts:573-580`; unknown id falls back to auto on load, `layout.ts:515-517`). The "last used" is
whichever profile was last chosen/added, because every card click, new profile (`withProfile`, `profile-actions.ts:8`) and toggle-off
writes `activeProfile`. Studio vs kiosk: the studio shows `editedProfileId` = pin (localStorage) else `resolveProfile(config, innerWidth,
innerHeight)` (`pinned-profile.ts:11`, `App.tsx:127`); a kiosk page resolves `kioskProfileId` = `?profile=` URL pin, then the server
control channel's profile override (runtime, not config; `control.ts:96`), else `config.activeProfile` / best fit for `window.inner*`
(`App.tsx:123-131`). Note the control-channel override and `?profile=` beat any launch rule. Conclusion: "Always" = `activeProfile=<id>`
already; a separate `launchProfileId` is only needed if card click stops writing `activeProfile` (Q-open 1). Delete of the shown or edited
profile resets to "auto" (`withoutProfile`, `profile-actions.ts:20-27`).

**Q2 Duplicate/copy profile, delete with confirm, single-profile export?** Profile duplicate: none (grep finds only `duplicatePage`,
`pages.ts:146`, and zone duplicate). "Copy profile JSON" (clipboard, one profile) exists: `config-file.ts:8`, row menu `profiles-panel.tsx:92`,
top bar `studio-top-bar.tsx:216`, palette `commands.ts:134`. There is no single-profile file export and no single-profile import
(file export is the whole config, `exportConfigFile`, `config-file.ts:21`; "Import InfoPanel profile" is the unrelated .infopanel import).
Delete with confirmation: yes in the panel (`DeleteDialog`, `profiles-panel.tsx:115`, disabled/hidden for the last profile via
`canDelete`); the inspector's Delete button has no confirmation. So "Export profile" would be a new feature (or reuse Copy profile JSON);
Duplicate needs a deep copy with fresh ids (`clonePlacement`/`clonePanel` exist in `layout.ts`, page ids and `rotate.pages` must be remapped).

**Q3 Page order stored, reorderable today?** Yes. Order is `profile.pages` array order (`MonitorProfile.pages`). Tabs drag-reorder
today (`PageTabs` `onMove` -> `movePage`, `pages.ts:111`, `use-studio-mutations.ts:340`, drop math `page-tabs.tsx:48`). Rotation and
page dots follow array order (`rotationPages`). Duplicate and delete page also exist (`duplicatePage`, `removePage`, last page cannot be removed).
No new field needed; the Behaviour page list only needs to call `movePageTo`.

**Q4 Pause on touch/click?** Yes, automatic and not configurable. In kiosk, any pointerdown on a rotating profile posts `touch`
(throttled to once per 5 s, `App.tsx:72,189-196`); the server holds rotation 30 s after a touch or a remote page switch
(`server/control.mjs:14,118`). The page-dots long-press toggles pause/resume (`page-dots.tsx:5,54`) and requires `general.kioskPageNav`.
The studio tab bar has a runtime Play/Pause (`rotate-toggle.tsx`, `control` override, not in config). The inspector note already says
"a touch or a remote page switch pauses it for 30 s" (`profile-sections.tsx:~383`). So no setting exists for "Pause when I touch";
show it as an info line, or omit.

**Q5 general.motion same key as Performance Motion?** Yes: `general.motion` (dashboard) is what the profile override falls back to
(`resolvePerformance`, `performance.ts:50-56`: URL > `profile.performance` > `general` > default). Same for `maxFps`. The Display card
has only hideCursor and kioskPageNav. There is no second "Display motion" key; keep it only in Performance (All profiles). The island has
its own unrelated `island.motion`.

**Q6 Dot colours for dashboard vs profile source?** `--ui-dot-dashboard: oklch(0.76 0.11 190)` (teal) and `--ui-dot-profile:
oklch(0.74 0.13 300)` (purple), `src/index.css:121-122`, Tailwind tokens `bg-ui-dot-dashboard` / `bg-ui-dot-profile` (`:155-156`),
used by `SourceDot` (`inspector/source-dot.tsx:6-13`). They match the spec's teal/purple values. Their tooltips are "From the dashboard
style" / "From the profile style". Accent is `--ui-accent: oklch(0.72 0.15 255)` (`:115`).

**Q7 Scroll row height, grid limits, gap/padding ranges?** `SCROLL_ROW_H = 120` (`layout.ts:58`), used by the kiosk grid
(`App.tsx:523`), canvas (`studio-canvas.tsx:395,412`), `profile-page.tsx:52`, import. Columns 2-24, rows 1-24 (`studio-actions.ts:414-440`).
Gap and padding 0-200 px in the model (`profile-grid.ts:13`), sliders 0-64 (`profile-sections.tsx:53`). Defaults: gap 12, padding
0/12/24 (see table). Spec's 1-24 columns, 1-20 rows, gap 0-48 do not match; use the app's.

**Q8 Can the Settings window reach `general`? Is the studio usable without the desktop app?** No access today. `src/settings/` talks only to
Rust through Tauri `invoke` (`settings/ipc.ts`, keys in `settings/types.ts`: listen, port, zoom, startAtLogin, updates, agents, debug...),
it has no `/api/config` call (no reference to `dashboard-server`/`CONFIG_URL` under `src/settings`), and it is a separate window/page
(`settings.html`, own Vite entry; `docs/redesign/app-settings/STATUS.md`). Dashboard config lives in the server's config.json and the
studio window's memory/undo history. The studio also runs in a plain browser (kiosk and browser studio bundles never load Tauri;
`lib/desktop.ts:1-12` wrappers are no-ops; the rail's Settings button renders only `isTauri()`, `left-rail.tsx:167`; Help opens a server
page in a browser, `desktop.ts:~36`). So in a browser App Settings is unreachable, and `general.*`, `style.clock` and `dataApiUrl` are
dashboard config shared by the kiosk, so moving them to App Settings would leave browser users with no way to change font, clock, locale,
motion/FPS default, cursor, page dots or the Data API URL, and the Settings window would need a new config-write path that does not race
the studio's undo history/save. Recommendation: keep the General content in the studio (the spec's temporary disclosure) unless the
owner accepts a browser fallback.

**Q9 Background types and options?** Type none, color, gradient, image, video. Options listed in the Appearance table (color; gradient
from/to/angle; image/video source via Library or drag; video poster/loop/muted/speed; fit, position, fill; dim, tint, tint opacity, blur).
Profile may inherit (absent), be None (`{type:"none"}`), or custom.

**Q10 Thumbnails and best-fit location?** Thumbnails: real screenshots, not a vector render. `ProfileShots` (`profile-shots.tsx:105`)
captures the edited canvas with `captureShot` (`lib/profile-shot.ts`, modern-screenshot, WebP, 320 px wide), cached by revision
(`lib/profile-shot-cache.ts`, max 2 MB, `profile-shot-store.ts` `useShot`), drawn by `ProfilePreview` letterboxed on the profile's
theme background (`profile-preview.tsx`). A profile never opened shows only the background. Spec 64x40 means reducing from 104x60 (a
shot is 320 wide so it scales). Best fit: `resolveProfile(config, windowW, windowH)` (`layout.ts:573`), score = |dw| + |dh|/4 (width
dominates), with `activeProfile` pin first; the "Opens now" profile is the panel's existing `autoProfileId`
(`resolveProfile({...config, activeProfile:"auto"}, w, h)`, `studio-view.tsx:349`); the window size is `windowSize` from
`window.innerWidth/innerHeight` (`App.tsx:93-96,444`). Reuse these; the design's exact-match/aspect stand-in must not ship. Caveat: the
studio window size is not the kiosk's; "Opens now" in the studio is for the studio window, which is only true for a kiosk when
the kiosk window has the same size (the desktop Kiosk view resizes the window to the profile, `App.tsx:349`).

## 5. Adaptations (where the design must bend) and open questions

Adaptations
1. Storage names: use `activeProfile` ("auto" | id), not `cfg.autoProfile`; keep the card-click, Pin and "shown on displays" semantics
   or decouple them deliberately (finding 1-3). `launchProfileId` is likely unnecessary.
2. Inherit/Custom/None: map All profiles = key absent (`profile.theme`, `profile.widgetTheme.values`, `profile.background` undefined);
   This profile = present; Background None stays `{type:"none"}`. Switching All profiles drops the key (data kept only if the UI
   confirms; today "Inherit" already drops it for theme and background).
3. Widget style header: "All profiles" edits `config.style`, "This profile" edits `profile.widgetTheme.values` (the old Scope "style" target).
   "Apply to every widget" is not a boolean: it is 11 per-section locks (Lock all in the Theme editor). Show a toggle = all locked,
   and an indeterminate state when only some sections are locked; locks exist only at profile level (no dashboard lock), so the
   toggle belongs on the This-profile side or only the Theme editor.
4. "Edit widget style" opens the existing Theme editor (Studio > Theme, `ui.openTheme`), which is a full page mode, not a drawer; a back
   button means returning to Design mode.
5. Corners: `profile.radius` is always per profile; the Theme All/This switch should not hide it, or the radius needs its own dashboard
   write to `config.radius`.
6. Layout limits: columns 2-24, rows 1-24 (spec 1-24 / 1-20), gap and padding sliders 0-64, boxes up to 200. Scroll help text uses 120 px.
7. Cycle interval: current control is a free number (3-3600 s). Presets 10 s / 30 s / 1 min / 5 min are a new control over the same key.
   "Pause when I touch" is not a setting; omit or show a static line.
8. Island: no position/duration settings. The "Show pop-up alerts" label understates `enabled`, which also hides the idle clock pill.
   Keep all 7 groups (about 40 keys) under the toggle.
9. Profile "Duplicate", "Export profile" and "Always open this one" are NEW. Export has no single-profile file path (only clipboard JSON).
10. Search and Changed N are needed by the widget inspector; hiding them for the dashboard needs a prop on `InspectorView`, and the dashboard's
    section registry/palette jumps (`DOCUMENT_CARD`, `inspector-model.ts:376`, tab ids) must be re-pointed to Layout/Look/Behaviour.
11. "What the dots mean" footer: the dashboard inspector has the legend (shared `Footer`); decide whether the new view keeps it, since the
    dot states (default/dashboard/profile/here/overriding) no longer apply to the new tabs.
12. General tab: stays in the studio (temporary disclosure) because App Settings has no config path and the studio runs in browsers (Q8).

Open questions for the owner
1. Should clicking a profile card still set `activeProfile` (turning auto off), or become edit-only (then `launchProfileId` is justified and Best fit/Always
   needs its own state)? And what happens to Pin for editing?
2. Keep the Pin feature in the new cards? (The design omits it.)
3. "Export profile": clipboard JSON (exists), a new single-profile file, or hide it?
4. Per-profile Animations: should "Follow system" at profile scope be a stored `"system"` override or the same as All profiles (no override)?
5. "Apply to every widget" with 11 per-section locks: toggle for all, or keep section locks in the Theme editor only?
6. May General (font, clock, locale, hide cursor, page dots, Data API URL) stay in the studio, since App Settings cannot read config.json and the studio runs in a browser?
7. Where do Skins, Appearance presets, Surface, card opacity/blur and the Studio view prefs (Quick bar, Inspector sections) go in Look/Behaviour?
8. Card tag "Opens now" is computed for the studio window size; acceptable when the kiosk window differs?
