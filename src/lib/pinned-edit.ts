/**
 * Edit's changes to the pinned layer (P3, _docs/redesign/pinned-layer): each takes the stored profile (or config) and
 * returns the next one, so a change is one `updateStored` call and one undo step. Pure: the studio's pinned chunk and the
 * tests read it, the kiosk never does.
 */
import type { ModuleSettings } from "@/modules/types";
import type { IslandConfig } from "./island/config";
import { uid, type DashboardConfig, type MonitorProfile } from "./layout";
import { normalizePinned, remapPinnedPages, type MediaKey, type PinnedEdge, type PinnedItem, type RailGroup, type RailSlot, type TouchAction } from "./pinned";
import { RAIL_MODULE, RAIL_THICKNESS, railNeed, railSlots, type RailPage, type RailParts } from "./rail";

/** What Add offers for the pinned layer: the rail and the widgets the fixtures pin, each on its usual edge and size. */
export interface PinKind {
  id: string;
  name: string;
  module: string;
  edge: PinnedEdge;
  thickness: number;
  inset?: number;
  settings?: ModuleSettings;
}

export const PIN_KINDS: readonly PinKind[] = [
  { id: "rail", name: "Page rail", module: RAIL_MODULE, edge: "left", thickness: RAIL_THICKNESS },
  { id: "now-playing", name: "Now playing bar", module: "NowPlaying", edge: "bottom", thickness: 84, inset: 12, settings: { showHeader: false } },
  { id: "agents", name: "Agents panel", module: "CodingAgents", edge: "right", thickness: 300, inset: 12 },
  { id: "status", name: "Status bar", module: "StatusBar", edge: "top", thickness: 48 },
];

/** A new item of `kind`: on all pages, making room, visible. */
export function newPinnedItem(kind: PinKind): PinnedItem {
  return {
    id: uid("pin"),
    edge: kind.edge,
    mode: "room",
    thickness: kind.thickness,
    ...(kind.inset ? { inset: kind.inset } : {}),
    show: "all",
    visible: true,
    name: kind.name,
    placement: { id: uid(kind.module), module: kind.module, ...(kind.settings ? { settings: kind.settings } : {}) },
  };
}

/** The profile with its pinned items changed by `fn`; none left drops the layer (unset = no pinned layer). */
export function withPinnedItems(p: MonitorProfile, fn: (items: PinnedItem[]) => PinnedItem[]): MonitorProfile {
  const items = fn(p.pinned?.items ?? []);
  if (items.length) return { ...p, pinned: { items } };
  const { pinned: _gone, ...rest } = p;
  return rest;
}

export const addPinnedItem = (p: MonitorProfile, item: PinnedItem): MonitorProfile => withPinnedItems(p, (items) => [...items, item]);

export const updatePinnedItem = (p: MonitorProfile, id: string, fn: (it: PinnedItem) => PinnedItem): MonitorProfile =>
  withPinnedItems(p, (items) => items.map((it) => (it.id === id ? fn(it) : it)));

export const removePinnedItem = (p: MonitorProfile, id: string): MonitorProfile => withPinnedItems(p, (items) => items.filter((it) => it.id !== id));

/** One step up (`-1`, towards the top of the list, which is the outer edge) or down; past an end it stays. */
export function moveInList<T extends { id: string }>(list: readonly T[], id: string, by: -1 | 1): T[] {
  const at = list.findIndex((x) => x.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export const movePinnedItem = (p: MonitorProfile, id: string, by: -1 | 1): MonitorProfile => withPinnedItems(p, (items) => moveInList(items, id, by));

/** The Show on choice: all pages, this page alone, or a list. */
export type ShowChoice = "this" | "some" | "all";

export function showChoice(item: Pick<PinnedItem, "show">, pageId: string): ShowChoice {
  if (item.show === "all") return "all";
  return item.show.pages.length === 1 && item.show.pages[0] === pageId ? "this" : "some";
}

/** The item shown on `choice`: "some" keeps a list it has (else starts from this page), "this" is the page alone. */
export function withShow(item: PinnedItem, choice: ShowChoice, pageId: string): PinnedItem {
  if (choice === "all") return { ...item, show: "all" };
  if (choice === "some" && item.show !== "all") return item;
  return { ...item, show: { pages: [pageId] } };
}

/** One page ticked on or off in the item's list, in the profile's page order. */
export function withShownPage(item: PinnedItem, pageId: string, on: boolean, order: readonly string[]): PinnedItem {
  const now = new Set(item.show === "all" ? order : item.show.pages);
  if (on) now.add(pageId);
  else now.delete(pageId);
  return { ...item, show: { pages: order.filter((id) => now.has(id)) } };
}

/** A page's "Hide the pinned layer" on or off (`ProfilePage.hidePinned`, stored only when on). */
export function withHidePinned(p: MonitorProfile, pageId: string, hide: boolean): MonitorProfile {
  return {
    ...p,
    pages: p.pages.map((pg) => {
      if (pg.id !== pageId) return pg;
      if (hide) return { ...pg, hidePinned: true };
      const { hidePinned: _off, ...rest } = pg;
      return rest;
    }),
  };
}

/** The Island's edge: its own, else the top (a pack's default edge is not known here). */
const islandEdge = (island: IslandConfig): PinnedEdge => island.edge ?? "top";

/**
 * Whether a top or bottom item meets the Island: an Island on, on the same edge. The Island draws over the item there,
 * and with "Reserve space" the page starts under both (QUESTIONS P1 5).
 */
export function islandClash(island: IslandConfig | undefined, item: Pick<PinnedItem, "edge" | "visible">): boolean {
  return !!island?.enabled && item.visible && (item.edge === "top" || item.edge === "bottom") && islandEdge(island) === item.edge;
}

/** The other profiles a "Use on every profile of this size" reaches: the same width and height. */
export const sameSizeProfiles = (config: DashboardConfig, from: MonitorProfile): MonitorProfile[] =>
  config.profiles.filter((p) => p.id !== from.id && p.width === from.width && p.height === from.height);

/**
 * Decision 6: the profile's pinned layer copied to every other profile of its size, replacing theirs. Profiles have their
 * own pages, so a page the layer names goes to the page in the same place there (the first to the first); one past
 * their last page is dropped (`normalizePinned`). Each widget gets a fresh id. One undo step.
 */
export function copyPinnedToSameSize(config: DashboardConfig, fromId: string): { config: DashboardConfig; count: number } {
  const from = config.profiles.find((p) => p.id === fromId);
  if (!from?.pinned) return { config, count: 0 };
  const targets = new Set(sameSizeProfiles(config, from).map((p) => p.id));
  if (!targets.size) return { config, count: 0 };
  const profiles = config.profiles.map((p) => {
    if (!targets.has(p.id)) return p;
    const ids = new Map(from.pages.flatMap((pg, i) => (p.pages[i] ? [[pg.id, p.pages[i].id] as const] : [])));
    const layer = normalizePinned(remapPinnedPages(from.pinned!, ids, (module) => uid(module)), p.pages.map((pg) => pg.id));
    return withPinnedItems(p, () => layer?.items ?? []);
  });
  return { config: { ...config, profiles }, count: targets.size };
}

/** A pinned item's height on a profile, px: a side item runs the height less its inset at each end. */
export const pinnedHeight = (item: Pick<PinnedItem, "edge" | "thickness" | "inset">, profileHeight: number): number =>
  item.edge === "left" || item.edge === "right" ? profileHeight - 2 * (item.inset ?? 0) : item.thickness;

/** The rail's parts as its settings say (each on unless set off). */
export const railParts = (settings: ModuleSettings | undefined, rotates: boolean): RailParts => ({
  chip: settings?.chip !== false,
  pageLock: settings?.pageLock !== false,
  clock: settings?.clock !== false,
  rotates,
});

/** Owner Q9: the height the rail's items need against the height it has, when they don't fit; null when they do. */
export function railOverflow(item: PinnedItem, profile: Pick<MonitorProfile, "height" | "pages" | "rotate">): { need: number; have: number } | null {
  const have = pinnedHeight(item, profile.height);
  const need = railNeed(railSlots(item.rail, profile.pages), railParts(item.placement.settings, profile.rotate?.enabled === true && profile.pages.length > 1), have);
  return need > have ? { need: Math.round(need), have } : null;
}

/** The rail's slots changed by `fn`, from the ones it draws: with none stored, its one slot per page are stored first. */
export function withRailSlots(item: PinnedItem, pages: readonly RailPage[], fn: (slots: RailSlot[]) => RailSlot[]): PinnedItem {
  return { ...item, rail: fn(railSlots(item.rail, pages)) };
}

/** What Add item makes: a page (the first one the rail lacks), an action (next page), the profile, or a widget slot. */
export type NewSlotKind = "page" | "action" | "profile" | "widget";

export function newRailSlot(kind: NewSlotKind, slots: readonly RailSlot[], pages: readonly RailPage[], widget?: { module: string; settings?: ModuleSettings; name?: string }): RailSlot {
  const id = uid("slot");
  if (kind === "page") {
    const shown = new Set(slots.flatMap((s) => (s.target.kind === "page" ? [s.target.pageId] : [])));
    const page = pages.find((p) => !shown.has(p.id)) ?? pages[0];
    return { id, group: "pages", target: { kind: "page", pageId: page.id }, ...(page.icon ? { icon: { from: "set", name: page.icon } } : {}) };
  }
  if (kind === "action") return { id, group: "actions", target: { kind: "action", action: { op: "page", to: "next" } }, icon: { from: "set", name: "play" } };
  if (kind === "profile") return { id, group: "top", target: { kind: "profile" }, icon: { from: "text", text: "P" } };
  return { id, group: "widgets", target: { kind: "widget", module: widget?.module ?? "Clock", ...(widget?.settings ? { settings: widget.settings } : {}) }, ...(widget?.name ? { name: widget.name } : {}) };
}

/** A rail slot one step up or down among the slots of its group (the other groups' slots keep their places). */
export function moveRailSlot(all: readonly RailSlot[], id: string, by: -1 | 1): RailSlot[] {
  const slot = all.find((s) => s.id === id);
  if (!slot) return [...all];
  const moved = moveInList(all.filter((s) => s.group === slot.group), id, by);
  let k = 0;
  return all.map((s) => (s.group === slot.group ? moved[k++] : s));
}

/** The groups as the editor lists them, top to bottom (the rail's order). */
export const RAIL_GROUP_NAMES: readonly [RailGroup, string][] = [
  ["top", "Top"],
  ["pages", "Pages"],
  ["actions", "Actions"],
  ["widgets", "Widgets"],
  ["bottom", "Bottom"],
];

/** What the audio and OBS actions can name now: this PC's devices (the audio stream) and OBS's scenes (the extras). */
export interface TouchSources {
  outputs: readonly { id: string; name: string }[];
  inputs: readonly { id: string; name: string }[];
  scenes: readonly { id: string; name: string }[];
}

export const NO_TOUCH_SOURCES: TouchSources = { outputs: [], inputs: [], scenes: [] };

/** A touch action as the editor lists it: its value in the list, its label and the group it is listed under. */
export interface TouchChoice {
  value: string;
  label: string;
  group: "Panel" | "Media" | "Audio" | "OBS";
  action: TouchAction;
}

const MEDIA_CHOICES: readonly [MediaKey, string][] = [
  ["play-pause", "Play or pause"],
  ["next", "Next track"],
  ["previous", "Previous track"],
];

const mute = (kind: "output" | "input", id: string): TouchAction => ({ op: "audio", body: { target: "windows", op: "mute", kind, id } });

/**
 * The touch actions the editor offers, P6's safe set, each through a route the kiosk already guards: a page, next,
 * previous, the page lock and the profile picker; the media keys; muting one of this PC's devices; an OBS scene and the
 * OBS mic. Running a command is P7's.
 */
export function touchChoices(pages: readonly RailPage[], sources: TouchSources = NO_TOUCH_SOURCES): TouchChoice[] {
  return [
    ...pages.map((p): TouchChoice => ({ value: `page:${p.id}`, label: `Open page: ${p.name}`, group: "Panel", action: { op: "page", to: p.id } })),
    { value: "page:next", label: "Next page", group: "Panel", action: { op: "page", to: "next" } },
    { value: "page:prev", label: "Previous page", group: "Panel", action: { op: "page", to: "prev" } },
    { value: "lock", label: "Page lock: rotate or stay", group: "Panel", action: { op: "lock" } },
    { value: "profile-picker", label: "Profiles", group: "Panel", action: { op: "profile-picker" } },
    ...MEDIA_CHOICES.map(([key, label]): TouchChoice => ({ value: `media:${key}`, label: `Media: ${label.toLowerCase()}`, group: "Media", action: { op: "media", key } })),
    ...sources.inputs.map((d): TouchChoice => ({ value: `mute:input:${d.id}`, label: `Mute or unmute: ${d.name}`, group: "Audio", action: mute("input", d.id) })),
    ...sources.outputs.map((d): TouchChoice => ({ value: `mute:output:${d.id}`, label: `Mute or unmute: ${d.name}`, group: "Audio", action: mute("output", d.id) })),
    ...sources.scenes.map((sc): TouchChoice => ({ value: `obs:scene:${sc.id}`, label: `OBS scene: ${sc.name}`, group: "OBS", action: { op: "obs", body: { op: "scene", id: sc.id } } })),
    { value: "obs:mic", label: "OBS: mute or unmute the mic", group: "OBS", action: { op: "obs", body: { op: "mic" } } },
  ];
}

/**
 * The value a stored action reads as in `touchChoices` ("" for none). One the editor doesn't offer (a command, an audio
 * or OBS action of another shape) is `other` and kept as stored.
 */
export function touchValue(action: TouchAction | undefined): string {
  if (!action) return "";
  switch (action.op) {
    case "page":
      return `page:${action.to}`;
    case "lock":
    case "profile-picker":
      return action.op;
    case "media":
      return `media:${action.key}`;
    case "audio": {
      const b = action.body;
      const plain = b.target === "windows" && b.op === "mute" && (b.kind === "input" || b.kind === "output") && typeof b.id === "string" && b.muted === undefined;
      return plain ? `mute:${String(b.kind)}:${String(b.id)}` : "other";
    }
    case "obs": {
      const b = action.body;
      if (b.op === "mic") return "obs:mic";
      return b.op === "scene" && typeof b.id === "string" ? `obs:scene:${b.id}` : "other";
    }
    default:
      return "other";
  }
}

/** The name of a stored action the list doesn't hold now (a device not connected, a scene OBS doesn't list, a command). */
export function keptLabel(action: TouchAction): string {
  if (action.op === "audio" && touchValue(action) !== "other") return "Mute or unmute a device not connected now";
  if (action.op === "obs" && touchValue(action) !== "other") return "An OBS scene OBS doesn't list now";
  return "Set in the config (kept)";
}
