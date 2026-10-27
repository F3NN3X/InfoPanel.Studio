/**
 * A screen's page as the page model (Edit v3 SPEC §3.4): `placements[]` order is the z-order (the last on top), a
 * widget is a placement on its cells, an InfoPanel item or element a placement of `ITEM_ID` holding it
 * (`Placement.item`) on cells or placed freely (`Placement.px`), and groups are the page's `groups` with each member's
 * `groupId`. Reading and writing back with no change gives the same page, object for object.
 */
import { ITEM_ID, SCROLL_ROW_H, type MonitorProfile, type PageGroup, type Placement, type ProfilePage } from "../layout.ts";
import { profileGap, profilePadding } from "../profile-grid.ts";
import type { StoredItem } from "../infopanel/import/stored.ts";
import { atBox } from "./stored-items.ts";
import { applyOps, boxOf, nearestCells, samePlace, type GroupNode, type LayerNode, type PageGrid, type PageModel, type PageOp, type PartKind, type PartNode, type PartPlace } from "./model.ts";

type GridProfile = Pick<MonitorProfile, "width" | "height" | "cols" | "rows" | "fit" | "gap" | "padding">;

/** The screen's grid in its design px: the whole page, the cells inside the kiosk's padding (a scrolling page's rows fixed). */
export function screenGrid(profile: GridProfile): PageGrid {
  const padding = profilePadding(profile, true);
  const gap = profileGap(profile);
  const height = profile.fit === "fill" ? profile.height : 2 * padding + profile.rows * SCROLL_ROW_H + (profile.rows - 1) * gap;
  return { cols: profile.cols, rows: profile.rows, gap, padding, width: profile.width, height };
}

/** What a placement is: an item placement's item or element, else a widget. */
export function kindOfPlacement(p: Placement): PartKind {
  if (p.module !== ITEM_ID) return "widget";
  return p.item?.$?.element ? "element" : "item";
}

/** A placement's place: an item's `px` when it has one, else its cells. */
function placeOf(p: Placement): PartPlace {
  if (p.px && p.module === ITEM_ID) return { px: p.px };
  return { cell: { col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan } };
}

const itemName = (item: StoredItem | undefined): string | undefined => (typeof item?.Name === "string" && item.Name ? item.Name : undefined);

function partOf(p: Placement, nameOf: (p: Placement) => string): PartNode {
  const kind = kindOfPlacement(p);
  return {
    type: "part",
    id: p.id,
    kind,
    name: kind === "widget" ? nameOf(p) : (itemName(p.item) ?? p.item?.kind ?? "Item"),
    place: placeOf(p),
    ...(p.locked ? { locked: true } : {}),
    ...(p.visible ? {} : { hidden: true }),
    ref: { backing: "placement", placement: p },
  };
}

const groupNode = (g: PageGroup): GroupNode => ({
  type: "group",
  id: g.id,
  name: g.name,
  ...(g.locked ? { locked: true } : {}),
  ...(g.hidden ? { hidden: true } : {}),
  children: [],
  ref: { backing: "group", group: g },
});

/**
 * The page as a model. A group sits where its topmost member is; a group with no members at the bottom of its parent.
 * `nameOf` names a widget (the studio's widget names); unset, its module id.
 */
export function readPlacements(profile: MonitorProfile, page: ProfilePage, nameOf: (p: Placement) => string = (p) => p.module): PageModel {
  const groups = page.groups ?? [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const nodes = new Map<string, GroupNode>();
  const root: LayerNode[] = [];
  const childrenOf = (id: string | undefined): LayerNode[] => (id === undefined ? root : ensure(id).children);
  // A group's node, put into its parent when first met (its parents first).
  const ensure = (id: string): GroupNode => {
    const known = nodes.get(id);
    if (known) return known;
    const g = byId.get(id)!;
    const node = groupNode(g);
    nodes.set(id, node);
    childrenOf(g.parentId !== undefined && byId.has(g.parentId) ? g.parentId : undefined).push(node);
    return node;
  };
  for (const p of [...page.placements].reverse()) {
    const into = p.groupId !== undefined && byId.has(p.groupId) ? p.groupId : undefined;
    childrenOf(into).push(partOf(p, nameOf));
  }
  for (const g of groups) ensure(g.id);
  return { pageId: page.id, grid: screenGrid(profile), snapItems: page.snapItems !== false, root };
}

/** The parts bottom first, each with the group it sits in. */
function flatten(nodes: readonly LayerNode[], parent: string | undefined, out: { part: PartNode; groupId?: string }[], groups: { node: GroupNode; parentId?: string }[]) {
  for (const n of [...nodes].reverse()) {
    if (n.type === "group") {
      groups.push({ node: n, parentId: parent });
      flatten(n.children, n.id, out, groups);
    } else out.push({ part: n, ...(parent !== undefined ? { groupId: parent } : {}) });
  }
}

/** A part as its placement, the one it was read from when nothing changed. */
function placementOf(grid: PageGrid, part: PartNode, groupId: string | undefined): Placement {
  const ref = part.ref;
  const base: Placement =
    ref.backing === "placement"
      ? ref.placement
      : { id: part.id, module: ITEM_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, item: ref.item };
  const fresh = ref.backing !== "placement";
  const kind = kindOfPlacement(base);
  // A widget never sits in px.
  const place: PartPlace = kind === "widget" && "px" in part.place ? { cell: nearestCells(grid, part.place.px) } : part.place;
  const moved = fresh || !samePlace(place, placeOf(base));
  const name = kind === "widget" ? undefined : part.name;
  const renamed = name !== undefined && name !== (itemName(base.item) ?? base.item?.kind ?? "Item");
  const same =
    !fresh && !moved && !renamed && Boolean(base.locked) === Boolean(part.locked) && base.visible === !part.hidden && base.groupId === groupId;
  if (same) return base;
  const { px: _px, groupId: _g, locked: _l, ...rest } = base;
  const cells = "cell" in place ? place.cell : moved ? nearestCells(grid, place.px, true) : { col: base.colStart, row: base.rowStart, cols: base.colSpan, rows: base.rowSpan };
  // The item's own X / Y / size follow its place, so InfoPanel and the kiosk read the box the editor shows.
  const at = base.item && moved ? atBox(base.item, boxOf(grid, place)) : base.item;
  const item = at && renamed ? { ...at, Name: name } : at;
  return {
    ...rest,
    colStart: cells.col,
    rowStart: cells.row,
    colSpan: cells.cols,
    rowSpan: cells.rows,
    visible: !part.hidden,
    ...("px" in place ? { px: place.px } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
    ...(part.locked ? { locked: true } : {}),
    ...(item ? { item } : {}),
  };
}

function pageGroupOf(node: GroupNode, parentId: string | undefined): PageGroup {
  const base: PageGroup = node.ref?.backing === "group" ? node.ref.group : { id: node.id, name: node.name };
  const same = base.name === node.name && Boolean(base.locked) === Boolean(node.locked) && Boolean(base.hidden) === Boolean(node.hidden) && base.parentId === parentId;
  if (same && node.ref) return base;
  const { parentId: _p, locked: _l, hidden: _h, ...rest } = base;
  return { ...rest, name: node.name, ...(parentId !== undefined ? { parentId } : {}), ...(node.locked ? { locked: true } : {}), ...(node.hidden ? { hidden: true } : {}) };
}

/** The model written back into the page; the same page when nothing changed. */
export function writePlacements(page: ProfilePage, model: PageModel): ProfilePage {
  const parts: { part: PartNode; groupId?: string }[] = [];
  const nodes: { node: GroupNode; parentId?: string }[] = [];
  flatten(model.root, undefined, parts, nodes);
  const placements = parts.map(({ part, groupId }) => placementOf(model.grid, part, groupId));
  // The groups in the order the page lists them, new ones after.
  const kept = new Map(nodes.map(({ node, parentId }) => [node.id, pageGroupOf(node, parentId)]));
  const before = page.groups ?? [];
  const groups = [...before.filter((g) => kept.has(g.id)).map((g) => kept.get(g.id)!), ...[...kept.values()].filter((g) => !before.some((b) => b.id === g.id))];
  const samePlacements = placements.length === page.placements.length && placements.every((p, i) => p === page.placements[i]);
  const sameGroups = groups.length === before.length && groups.every((g, i) => g === before[i]);
  const snapSame = (page.snapItems !== false) === model.snapItems;
  if (samePlacements && sameGroups && snapSame) return page;
  const { groups: _g, snapItems: _s, ...rest } = page;
  return {
    ...rest,
    placements: samePlacements ? page.placements : placements,
    ...(groups.length ? { groups: sameGroups ? before : groups } : {}),
    ...(model.snapItems ? {} : { snapItems: false }),
  };
}

/** The page after `ops`, through the model; the same page when they change nothing. */
export function applyPlacements(profile: MonitorProfile, page: ProfilePage, ops: readonly PageOp[]): ProfilePage {
  const model = readPlacements(profile, page);
  const next = applyOps(model, ops);
  return next === model ? page : writePlacements(page, next);
}
