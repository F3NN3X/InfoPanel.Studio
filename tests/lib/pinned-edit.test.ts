// Edit's changes to the pinned layer (`lib/pinned-edit.ts`, P3): each is one step on the stored profile, and what it
// stores survives the v20 guard (`normalizePinned`), so a save keeps it.
import { describe, expect, it } from "vitest";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { normalizePinned, normalizeTouchAction, type PinnedItem, type RailSlot } from "@/lib/pinned";
import {
  addPinnedItem,
  copyPinnedToSameSize,
  islandClash,
  moveRailSlot,
  movePinnedItem,
  newPinnedItem,
  pinBlocked,
  pinnedThicknessMax,
  pinPlacement,
  unpinToPage,
  keptLabel,
  touchChoices,
  touchValue,
  newRailSlot,
  PIN_KINDS,
  railOverflow,
  removePinnedItem,
  showChoice,
  updatePinnedItem,
  withChipItem,
  withChipShown,
  withHidePinned,
  withRailSlots,
  withShow,
  withShownPage,
} from "@/lib/pinned-edit";
import { chipSlot, railNeed } from "@/lib/rail";
import type { IslandConfig } from "@/lib/island/config";

const page = (id: string) => ({ id, name: id.toUpperCase(), placements: [] });
const profile = (id: string, w = 1024, h = 600, pages = ["a", "b", "c"]): MonitorProfile =>
  ({ id, name: id, width: w, height: h, cols: 4, rows: 3, pages: pages.map(page) }) as unknown as MonitorProfile;
const kind = (id: string) => PIN_KINDS.find((k) => k.id === id)!;
const rail = (extra: Partial<PinnedItem> = {}): PinnedItem => ({ ...newPinnedItem(kind("rail")), id: "rail", ...extra });

describe("adding, changing, ordering and removing items", () => {
  it("adds a rail on the left, 84 px, making room on every page; the guard keeps it as made", () => {
    const p = addPinnedItem(profile("s"), rail());
    expect(p.pinned?.items[0]).toMatchObject({ edge: "left", mode: "room", thickness: 84, show: "all", visible: true, placement: { module: "PageRail" } });
    expect(normalizePinned(p.pinned, ["a", "b", "c"])).toEqual(p.pinned);
  });

  it("changes one item, moves it in the list and drops the layer with its last item", () => {
    const bar = { ...newPinnedItem(kind("now-playing")), id: "bar" };
    let p = addPinnedItem(addPinnedItem(profile("s"), rail()), bar);
    p = updatePinnedItem(p, "bar", (it) => ({ ...it, edge: "top", mode: "float" }));
    expect(p.pinned?.items[1]).toMatchObject({ edge: "top", mode: "float", inset: 12 });
    p = movePinnedItem(p, "bar", -1);
    expect(p.pinned?.items.map((i) => i.id)).toEqual(["bar", "rail"]);
    expect(movePinnedItem(p, "bar", -1).pinned?.items.map((i) => i.id)).toEqual(["bar", "rail"]);
    p = removePinnedItem(removePinnedItem(p, "bar"), "rail");
    expect("pinned" in p).toBe(false);
  });
});

describe("Show on and Hide on this page", () => {
  it("reads and sets all pages, this page alone, or a list in the pages' order", () => {
    const it0 = rail();
    expect(showChoice(it0, "a")).toBe("all");
    const one = withShow(it0, "this", "b");
    expect(one.show).toEqual({ pages: ["b"] });
    expect(showChoice(one, "b")).toBe("this");
    expect(showChoice(one, "a")).toBe("some");
    const two = withShownPage(one, "a", true, ["a", "b", "c"]);
    expect(two.show).toEqual({ pages: ["a", "b"] });
    expect(withShow(two, "some", "c")).toBe(two);
    expect(withShownPage(withShow(two, "all", "a"), "c", false, ["a", "b", "c"]).show).toEqual({ pages: ["a", "b"] });
  });

  it("stores hidePinned only while it is on", () => {
    const on = withHidePinned(profile("s"), "b", true);
    expect(on.pages[1].hidePinned).toBe(true);
    expect("hidePinned" in withHidePinned(on, "b", false).pages[1]).toBe(false);
  });
});

describe("islandClash", () => {
  const island = (edge?: "top" | "bottom", enabled = true) => ({ enabled, ...(edge ? { edge } : {}) }) as unknown as IslandConfig;

  it("warns for a visible item on the Island's edge (top when unset), never for a side or with the Island off", () => {
    expect(islandClash(island(), { edge: "top", visible: true })).toBe(true);
    expect(islandClash(island("bottom"), { edge: "bottom", visible: true })).toBe(true);
    expect(islandClash(island("bottom"), { edge: "top", visible: true })).toBe(false);
    expect(islandClash(island(), { edge: "left", visible: true })).toBe(false);
    expect(islandClash(island(undefined, false), { edge: "top", visible: true })).toBe(false);
    expect(islandClash(island(), { edge: "top", visible: false })).toBe(false);
    expect(islandClash(undefined, { edge: "top", visible: true })).toBe(false);
  });
});

describe("copyPinnedToSameSize (decision 6)", () => {
  const slots: RailSlot[] = [
    { id: "s1", group: "pages", target: { kind: "page", pageId: "a" } },
    { id: "s3", group: "pages", target: { kind: "page", pageId: "c" } },
  ];
  const source = addPinnedItem(profile("main"), rail({ show: { pages: ["a", "c"] }, rail: slots }));
  const same = profile("coding", 1024, 600, ["x", "y"]);
  const other = profile("big", 1920, 550, ["q"]);
  const config = { profiles: [source, same, other] } as unknown as DashboardConfig;

  it("copies the layer to the other profiles of the size, page for page by place, with fresh widget ids", () => {
    const r = copyPinnedToSameSize(config, "main");
    expect(r.count).toBe(1);
    const copied = r.config.profiles[1].pinned!.items[0];
    // a and c are the first and third pages: c has no third page there, so it goes
    expect(copied.show).toEqual({ pages: ["x"] });
    expect(copied.rail?.map((s) => s.target)).toEqual([{ kind: "page", pageId: "x" }]);
    expect(copied.placement.id).not.toBe(source.pinned!.items[0].placement.id);
    expect(r.config.profiles[0]).toBe(source);
    expect(r.config.profiles[2]).toBe(other);
  });

  it("changes nothing without another profile of the size, or a layer to copy", () => {
    const alone = { profiles: [source, other] } as unknown as DashboardConfig;
    expect(copyPinnedToSameSize(alone, "main")).toEqual({ config: alone, count: 0 });
    expect(copyPinnedToSameSize(config, "coding")).toEqual({ config, count: 0 });
  });
});

describe("the rail's items", () => {
  const pages = [
    { id: "a", name: "A", icon: "zap" },
    { id: "b", name: "B" },
  ];

  it("stores the one-per-page slots with the first change, then the change", () => {
    const it0 = rail();
    const next = withRailSlots(it0, pages, (s) => [...s, newRailSlot("action", s, pages)]);
    expect(next.rail?.map((s) => s.id).slice(0, 2)).toEqual(["page:a", "page:b"]);
    expect(next.rail?.[2]).toMatchObject({ group: "actions", target: { kind: "action", action: { op: "page", to: "next" } } });
  });

  it("adds a page slot for the first page the rail lacks", () => {
    const s = newRailSlot("page", [{ id: "x", group: "pages", target: { kind: "page", pageId: "a" } }], pages);
    expect(s.target).toEqual({ kind: "page", pageId: "b" });
  });

  it("moves a slot within its group, the other groups' slots staying where they are", () => {
    const all: RailSlot[] = [
      { id: "p1", group: "pages", target: { kind: "page", pageId: "a" } },
      { id: "act", group: "actions", target: { kind: "action", action: { op: "lock" } } },
      { id: "p2", group: "pages", target: { kind: "page", pageId: "b" } },
    ];
    expect(moveRailSlot(all, "p2", -1).map((s) => s.id)).toEqual(["p2", "act", "p1"]);
    expect(moveRailSlot(all, "act", 1).map((s) => s.id)).toEqual(["p1", "act", "p2"]);
  });
});

describe("railOverflow (owner Q9)", () => {
  const many = (n: number): RailSlot[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, group: "pages", target: { kind: "page", pageId: "a" } }));

  it("measures the chip, slots, rules, foot and clock as the rail lays them out", () => {
    // roomy: 24 padding + chip 64 + rule 9 + 2 slots of 56 + spacer + clock 44, six gaps of 6
    expect(railNeed(many(2), { chip: true, pageLock: true, clock: true, rotates: false }, 600)).toBe(24 + 64 + 9 + 112 + 0 + 44 + 5 * 6);
    // dense under 580 px, the page lock only while the pages rotate
    expect(railNeed(many(1), { chip: false, pageLock: true, clock: false, rotates: true }, 550)).toBe(24 + 48 + 0 + 48 + 2 * 4);
  });

  it("warns when the items need more than the rail's height, which a side item's inset shortens", () => {
    const p = profile("s");
    expect(railOverflow(rail({ rail: many(5) }), p)).toBeNull();
    expect(railOverflow(rail({ rail: many(9) }), p)).toEqual({ need: expect.any(Number), have: 600 });
    expect(railOverflow(rail({ rail: many(7) }), p)).toBeNull();
    expect(railOverflow(rail({ rail: many(7), inset: 60 }), p)?.have).toBe(480);
    // 480 px is dense: 7 slots need 505 there
    // fewer parts, more room
    expect(railOverflow(rail({ rail: many(9), placement: { id: "r", module: "PageRail", settings: { chip: false, clock: false } } }), p)).toBeNull();
  });
});

describe("the touch actions the rail editor offers", () => {
  it("include the profile picker (P4), read back as itself and stored as the guard keeps it", () => {
    const picker = touchChoices([]).find((c) => c.value === "profile-picker");
    expect(picker?.action).toEqual({ op: "profile-picker" });
    expect(touchValue({ op: "profile-picker" })).toBe("profile-picker");
    expect(normalizeTouchAction(picker?.action)).toEqual({ op: "profile-picker" });
    expect(touchValue({ op: "run", command: "calc.exe" })).toBe("other");
  });

  it("offer P6's safe set: media keys, a device's mute and OBS scenes, each read back as itself and kept by the guard", () => {
    const sources = { outputs: [{ id: "spk", name: "Speakers" }], inputs: [{ id: "mic", name: "Mic" }], scenes: [{ id: "u1", name: "Game" }] };
    const choices = touchChoices([{ id: "home", name: "Home" }], sources);
    expect(choices.map((c) => c.value)).toEqual([
      "page:home",
      "page:next",
      "page:prev",
      "lock",
      "profile-picker",
      "media:play-pause",
      "media:next",
      "media:previous",
      "mute:input:mic",
      "mute:output:spk",
      "obs:scene:u1",
      "obs:mic",
    ]);
    for (const c of choices) {
      expect(touchValue(c.action), c.value).toBe(c.value);
      expect(normalizeTouchAction(c.action), c.value).toEqual(c.action);
    }
    expect(choices.find((c) => c.value === "mute:input:mic")?.label).toBe("Mute or unmute: Mic");
    // no command is ever offered (P7)
    expect(choices.some((c) => c.action.op === "run")).toBe(false);
    // with nothing connected, the media keys and the OBS mic are still there
    expect(touchChoices([]).filter((c) => c.group !== "Panel").map((c) => c.value)).toEqual(["media:play-pause", "media:next", "media:previous", "obs:mic"]);
  });

  it("read an action of a shape the editor doesn't make as other, and name a kept one", () => {
    expect(touchValue({ op: "audio", body: { target: "windows", op: "volume", kind: "input", id: "mic", value: 3 } })).toBe("other");
    expect(touchValue({ op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "mic", muted: true } })).toBe("other");
    expect(touchValue({ op: "obs", body: { op: "replay" } })).toBe("other");
    expect(keptLabel({ op: "audio", body: { target: "windows", op: "mute", kind: "output", id: "gone" } })).toBe("Mute or unmute a device not connected now");
    expect(keptLabel({ op: "obs", body: { op: "scene", id: "gone" } })).toBe("An OBS scene OBS doesn't list now");
    expect(keptLabel({ op: "run", command: "calc.exe" })).toBe("Set in the config (kept)");
  });
});

describe("pinning a page widget and moving it back", () => {
  const widget = { id: "m1", module: "NowPlaying", colStart: 2, rowStart: 1, colSpan: 2, rowSpan: 1, visible: false, settings: { showHeader: false }, name: "Music" };
  const withWidget = (over: Record<string, unknown> = {}): MonitorProfile => {
    const p = profile("s", 1000, 600, ["a", "b"]);
    return { ...p, fit: "scroll", gap: 10, padding: 20, pages: [{ id: "a", name: "A", placements: [{ ...widget, ...over }, { ...widget, id: "m2", module: "Clock" }] }, page("b")] } as unknown as MonitorProfile;
  };

  it("moves the widget from the page into the layer: module and settings kept, new pin id, room, all pages, visible", () => {
    const next = pinPlacement(withWidget(), "a", "m1", "top", { id: "pin-x", name: "Music" });
    expect(next.pages[0].placements.map((x) => x.id)).toEqual(["m2"]);
    expect(next.pinned?.items).toEqual([
      { id: "pin-x", edge: "top", mode: "room", thickness: 120, show: "all", visible: true, name: "Music", placement: { id: "m1", module: "NowPlaying", settings: { showHeader: false }, name: "Music" } },
    ]);
    expect(normalizePinned(next.pinned, ["a", "b"])).toEqual(next.pinned);
  });

  it("takes the width for a side, the rows and gaps for a top or bottom, and clamps to the inspector's range", () => {
    const side = pinPlacement(withWidget(), "a", "m1", "left").pinned!.items[0];
    // two of four 232.5 px columns (1000 less 20 padding each side and three 10 px gaps) and the gap between them, within half the width
    expect(side.thickness).toBe(475);
    const tall = pinPlacement(withWidget({ rowSpan: 4 }), "a", "m1", "bottom").pinned!.items[0];
    expect(tall.thickness).toBe(pinnedThicknessMax("bottom", { width: 1000, height: 600 }));
    expect(pinnedThicknessMax("bottom", { width: 1000, height: 600 })).toBe(300);
    const small = pinPlacement({ ...withWidget(), fit: "fill", rows: 40 } as MonitorProfile, "a", "m1", "top").pinned!.items[0];
    expect(small.thickness).toBe(24);
  });

  it("keeps a lock as the item's, and leaves the profile alone for a widget that can't be pinned or isn't there", () => {
    expect(pinPlacement(withWidget({ locked: true }), "a", "m1", "top").pinned!.items[0]).toMatchObject({ locked: true });
    const blocked = withWidget({ module: "blank" });
    expect(pinBlocked(blocked.pages[0].placements[0])).toMatch(/Blank/);
    expect(pinPlacement(blocked, "a", "m1", "top")).toBe(blocked);
    const p = withWidget();
    expect(pinPlacement(p, "a", "nope", "top")).toBe(p);
    expect(pinBlocked({ module: "infopanel", canvasRef: "c1" })).toMatch(/canvas/);
    expect(pinBlocked({ module: "item", item: {} as never })).toMatch(/item/);
  });

  it("round-trips: pin, then move back, gives the widget on the page at the given spot and an empty layer", () => {
    const pinned = pinPlacement(withWidget(), "a", "m1", "right", { id: "pin-x" });
    const back = unpinToPage(pinned, "pin-x", "b", { col: 1, row: 2, cols: 2, rows: 1 });
    expect(back.pinned).toBeUndefined();
    expect(back.pages[1].placements).toEqual([{ id: "m1", module: "NowPlaying", settings: { showHeader: false }, name: "Music", colStart: 1, rowStart: 2, colSpan: 2, rowSpan: 1, visible: true }]);
  });

  it("does not move a rail to a page, nor an unknown item", () => {
    const withRail = addPinnedItem(withWidget(), rail());
    expect(unpinToPage(withRail, "rail", "a", { col: 1, row: 1, cols: 1, rows: 1 })).toBe(withRail);
    expect(unpinToPage(withRail, "nope", "a", { col: 1, row: 1, cols: 1, rows: 1 })).toBe(withRail);
  });
});

describe("the rail's profile chip overrides", () => {
  const base = rail();
  it("a chip with no change stores nothing, so the rail stays as it was", () => {
    expect(withChipItem(base, (c) => c)).toEqual(base);
    expect(chipSlot(base.placement.settings)).toMatchObject({ id: "chip", group: "top", target: { kind: "profile" }, label: true });
  });

  it("stores only what differs, beside the rail's own settings, and the guard keeps it; undoing the field drops the key", () => {
    const withSettings = { ...base, placement: { ...base.placement, settings: { clock: false } } };
    const edited = withChipItem(withSettings, (c) => ({ ...c, icon: { from: "set", name: "zap" }, label: false, touch: { hold: { op: "lock" } } }));
    expect(edited.placement.settings).toEqual({ clock: false, chipItem: JSON.stringify({ icon: { from: "set", name: "zap" }, label: false, touch: { hold: { op: "lock" } } }) });
    const layer = normalizePinned({ items: [edited] }, ["a", "b", "c"]);
    expect(chipSlot(layer!.items[0].placement.settings)).toMatchObject({ icon: { from: "set", name: "zap" }, label: false, touch: { hold: { op: "lock" } } });
    expect(withChipItem(edited, ({ icon: _i, label: _l, touch: _t, ...c }) => ({ ...c, label: true })).placement.settings).toEqual({ clock: false });
  });

  it("shows or hides the chip through its own setting, on by default", () => {
    const off = withChipShown(base, false);
    expect(off.placement.settings).toEqual({ chip: false });
    expect(withChipShown(off, true)).toEqual(base);
  });

  it("ignores a stored chipItem that is not JSON", () => {
    expect(chipSlot({ chipItem: "{nope" })).toEqual(chipSlot(undefined));
  });
});
