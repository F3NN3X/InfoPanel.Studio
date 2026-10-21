# Implementation plan

Work in phases. Each phase ends in a working app, with the old entry points still reachable until the phase that retires them. Commit at the end of every phase.

## Phase 0: Audit (no UI changes)

1. Find the components for:
   - the top bar and its ⋯ menu;
   - the rail and each of its drawers or pages;
   - the page tabs;
   - the profile inspector (Layout / Look / Behaviour);
   - the zone inspector;
   - the rail Theme page, Library, Gauges, Data sources, Alerts and Island;
   - the Import InfoPanel dialog and the Export dialog;
   - the desktop Settings window, the tray menu, and the command palette registry.
2. Write `IA_AUDIT.md`. For **every** control in `SPEC.md` §13 (before → after), record:
   - its component file;
   - its store key and scope (`cfg` global, profile, page, zone, `settings.json`, or browser localStorage);
   - its new home.
   Flag any control that isn't in §13, and give it the closest home.
3. Confirm the style resolution function. The order must be: built-in → All profiles → Profile (+ locks) → Page → Widget. Note its name. The inheritance chip (§5) reads from it.
4. List every import and export code path, and map it to one of the 7 real operations in §9.

**Checkpoint:** the audit is complete and every row has a home.

## Phase 1: Shared building blocks

- `InheritChip` (§5). Pure, with props `state`, `from`, `onReset`, `onJump`, `onCustomise`. Also build its menu.
- `useInheritance(path, scope)`. Returns `{state, from, fromName, resolvedValue, parentValue, reset(), customise(), jump()}`, built on the existing resolver.
- `LinkRow`: a read-only row that shows the current value and a `↗` link to the home (§4.4).
- `StatusBar` (§3.4) with live data: Data API ping, server state, kiosk count, update state and dirty state.

**Checkpoint:** a Storybook page or a dev route shows all chip states.

## Phase 2: Shell

- Title bar (§3.1): the screen/page switcher popover, the Ctrl K entry, and one **Import** button and one **Export** button. For now they open the existing dialogs. Also add the **Live** button and Save. Window controls render only in Tauri.
- Rail (§3.2): labelled. Design, Theme, Library, Data, Alerts & Island; Help and Settings at the bottom. All of them are full views. Remove the drawer behaviour.
- Move Layers and Add widget into the Design left panel (§6.1).
- Status bar.

**Checkpoint:** every old rail item is reachable from the new rail or from Design.

## Phase 3: Design mode

- Page inspector when nothing is selected (§6.4). Retire the profile mega-inspector, after Phases 4 and 5 give its contents new homes. Until then, link to the old places.
- Zone inspector: replace the follow/custom/locked bars with `InheritChip` (§6.3). Replace the "Style preset" select and the preset submenus with **Start from a Style / Save as Style / Make this the theme for…**.
- Page tabs: remove the Play/Pause control and the ⋯ › Theme… item. Add the kiosk marker that opens Live (§6.2).

## Phase 4: Theme editor

- One editor with a scope bar (§7).
- Merge Look › Theme, Look › Widget style, Look › Background and the rail Theme page into it.
- Add the Exceptions list, per-section locks and Lock all.
- Apply the page-font model change (§11.1).

**Checkpoint:** the three task paths in §14 each take the number of steps listed there.

## Phase 5: Screens, Settings, Data, Alerts & Island, Library

- Screens view (§8). Move in Profile › Layout, the Profiles drawer, Behaviour › Pages and cycling, and the launch rule.
- Settings with Dashboard / Studio / App tabs (§10). Port the desktop Settings window into the App tab. Tray "Settings" now opens the studio at Settings › App.
- Data: absorbs Behaviour › Connection.
- Alerts & Island: tabs Rules / Island / Defaults / History. Remove the island duplicate from Behaviour.
- Library: tabs Themes / Styles / Panels / Gauges / Media / Fonts / Canvases. Gauges moves in, and its editor opens from an item.

## Phase 6: Import, Export and Live

- The Import door: drag-and-drop anywhere, plus the button. It detects the file type and routes it (§9.1).
- The Export & back up sheet (§9.2).
- The Live popover, wired to the existing remote-control API (§3.3).

## Phase 7: Clean-up

- Remove all retired labels (§2.2), the old drawers, the ⋯ menu duplicates, and the "Applies to all profiles" notes.
- Update the command palette (§13, last group).
- Narrow and phone layouts (§3.5).
- First-run flow (§10.5).
- Help article links: update the F1 targets.

**Final checkpoint:** run through §15 (acceptance) in full, in both desktop and browser builds.
