// Config v20 (the pinned layer, _docs/redesign/pinned-layer INVESTIGATION §3): a profile's `pinned` items and `autoSwitch`
// rules, a page's `hidePinned` and a placement's `touch` map. The step only stamps the version; `normalizePinned` guards
// what is stored. The server's side (the 409 for a v19 save, the backup) is in config_guard.rs and routes.rs; the kiosk's
// is tests/e2e/pinned-layer.spec.ts.
import { describe, expect, it } from "vitest";
import { upgradeConfig } from "@/lib/config-upgrade";
import { CONFIG_VERSION, mergeConfig, readConfig, readImportedConfig, type StoredConfig } from "@/lib/layout";
import { importedProfile, parseProfileFile, profileFileText } from "@/components/studio/profile-file";
import { withFreshIds } from "@/components/studio/profile-actions";

const zone = (id: string, extra: object = {}) => ({ id, module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, ...extra });
const PINNED = {
  items: [
    {
      id: "rail",
      edge: "left",
      mode: "room",
      thickness: 84,
      show: "all",
      visible: true,
      placement: { id: "rail-w", module: "Clock", settings: { showHeader: false }, touch: { hold: { op: "profile-picker" } } },
      rail: [
        { id: "s1", group: "pages", target: { kind: "page", pageId: "main" }, icon: { from: "set", name: "zap" }, badge: { when: "agents-waiting" } },
        { id: "s2", group: "actions", target: { kind: "action", action: { op: "obs", body: { op: "mic" } } }, icon: { from: "image", asset: "abc.png" }, shape: "circle", tint: true },
        { id: "s3", group: "widgets", target: { kind: "widget", module: "Clock" }, touch: { tap: { op: "page", to: "two" } } },
      ],
    },
    { id: "bar", edge: "bottom", mode: "float", thickness: 84, inset: 12, show: { pages: ["two"] }, visible: false, locked: true, name: "Now playing", placement: { id: "bar-w", module: "NowPlaying" } },
  ],
};
const screen = (extra: object = {}) => ({
  id: "s",
  name: "Desk",
  width: 1024,
  height: 600,
  cols: 12,
  rows: 6,
  fit: "fill",
  pages: [
    { id: "main", name: "Main", placements: [zone("a", { touch: { tap: { op: "page", to: "next" } } })] },
    { id: "two", name: "Two", hidePinned: true, placements: [] },
  ],
  pinned: PINNED,
  autoSwitch: { exe: ["Code.exe", "obs64.exe"] },
  ...extra,
});
const stored = (version: number, profiles: unknown[]): StoredConfig => JSON.parse(JSON.stringify({ version, activeProfile: "auto", profiles })) as StoredConfig;

describe("v20: the pinned layer", () => {
  it("a v19 config upgrades to v20 unchanged in meaning: the same profiles a v20 one with the same fields reads as", async () => {
    const plain = screen({ pinned: undefined, autoSwitch: undefined });
    const up = upgradeConfig(stored(19, [plain]));
    // a later format (v21's grid pins) stamps its own version over v20's, as the older steps' tests read it
    expect(CONFIG_VERSION).toBeGreaterThanOrEqual(20);
    expect(up.version).toBe(CONFIG_VERSION);
    expect(up.profiles).toEqual(mergeConfig(stored(20, [plain])).profiles);
    expect(up.profiles[0].pinned).toBeUndefined();
    // a v19 dev build's fields the format now names come through the upgrade as stored
    const early = upgradeConfig(stored(19, [screen()]));
    expect(early.profiles[0].pinned).toEqual(PINNED);
    expect((await readConfig(stored(19, [screen()]))).profiles).toEqual(early.profiles);
  });

  it("an older version's config (v16) upgrades to v20 with no pinned layer, and its pages draw as they did", () => {
    const v16 = upgradeConfig(stored(16, [screen({ pinned: undefined, autoSwitch: undefined, pages: [{ id: "main", name: "Main", placements: [zone("a")] }] })]));
    expect(v16.version).toBe(CONFIG_VERSION);
    expect(v16.profiles[0].pinned).toBeUndefined();
    expect(v16.profiles[0].pages[0]).toEqual({ id: "main", name: "Main", placements: [zone("a")] });
  });

  it("round-trips the pinned layer, hidePinned, touch and autoSwitch through a save and a load", async () => {
    const once = mergeConfig(stored(20, [screen()]));
    const p = once.profiles[0];
    expect(p.pinned).toEqual(PINNED);
    expect(p.autoSwitch).toEqual({ exe: ["Code.exe", "obs64.exe"] });
    expect(p.pages[1].hidePinned).toBe(true);
    expect(p.pages[0].placements[0].touch).toEqual({ tap: { op: "page", to: "next" } });
    const twice = await readConfig(JSON.parse(JSON.stringify(once)));
    expect(JSON.parse(JSON.stringify(twice))).toEqual(JSON.parse(JSON.stringify(once)));
    // an outside file (a config file import) goes through the upgrade and keeps them too
    expect((await readImportedConfig(JSON.parse(JSON.stringify(once)))).profiles[0].pinned).toEqual(PINNED);
  });

  it("drops what it cannot read: bad items, slots and actions naming a missing page, unknown actions, a hidePinned that isn't true", () => {
    const item = (extra: object) => ({ id: "x", edge: "top", mode: "room", thickness: 40, show: "all", visible: true, placement: { id: "w", module: "Clock" }, ...extra });
    const read = (pinned: unknown, pages: object[] = [{ id: "main", name: "Main", placements: [] }]) => mergeConfig(stored(20, [screen({ pinned, pages })])).profiles[0];
    // an item with no id, a repeated id, an unknown edge, no thickness or no widget
    const items = [item({ id: "" }), item({}), item({ name: "again" }), item({ id: "e", edge: "middle" }), item({ id: "t", thickness: 0 }), item({ id: "p", placement: { id: "w" } })];
    expect(read({ items }).pinned?.items.map((i) => i.id)).toEqual(["x"]);
    // its grid box and visibility never stay on the placement; a bad mode is room, a fractional size whole
    const kept = read({ items: [item({ mode: "sideways", thickness: 40.6, placement: { id: "w", module: "Clock", colStart: 3, px: { x: 1, y: 1, w: 1, h: 1 }, visible: false } })] }).pinned?.items[0];
    expect(kept).toEqual(item({ thickness: 41 }));
    // a page that is gone leaves the show list and takes its slot and page actions with it; an unknown action, gesture or badge goes
    const rail = [
      { id: "a", group: "pages", target: { kind: "page", pageId: "gone" } },
      { id: "b", group: "actions", target: { kind: "action", action: { op: "explode" } } },
      { id: "c", group: "nowhere", target: { kind: "profile" } },
      { id: "d", group: "top", target: { kind: "profile" }, badge: { when: "rain" }, touch: { tap: { op: "page", to: "gone" }, swipe: { op: "lock" }, hold: { op: "lock" } }, icon: { from: "set" } },
    ];
    const guarded = read({ items: [item({ show: { pages: ["main", "gone", "main"] }, rail, placement: { id: "w", module: "Clock", touch: { tap: { op: "run" } } } })] }).pinned?.items[0];
    expect(guarded?.show).toEqual({ pages: ["main"] });
    expect(guarded?.rail).toEqual([{ id: "d", group: "top", target: { kind: "profile" }, touch: { hold: { op: "lock" } } }]);
    expect(guarded?.placement).toEqual({ id: "w", module: "Clock" });
    // nothing left, or not a layer: no pinned layer
    expect(read({ items: [item({ edge: 3 })] }).pinned).toBeUndefined();
    expect(read([item({})]).pinned).toBeUndefined();
    const pages = read(undefined, [{ id: "main", name: "Main", hidePinned: "yes", placements: [zone("a", { touch: { tap: { op: "nope" } } })] }]).pages;
    expect(pages[0].hidePinned).toBeUndefined();
    expect(pages[0].placements[0].touch).toBeUndefined();
    expect(mergeConfig(stored(20, [screen({ autoSwitch: { exe: ["", 4, " a.exe ", "a.exe"] } })])).profiles[0].autoSwitch).toEqual({ exe: ["a.exe"] });
  });

  it("keeps a logo's plate through a save and a load, and drops one it does not know (P5)", async () => {
    const logo = (plate: unknown) => ({ id: "logo", group: "top", target: { kind: "profile" }, icon: { from: "image", asset: `${"a".repeat(64)}.svg` }, ...(plate === undefined ? {} : { plate }) });
    const read = (plate: unknown) => mergeConfig(stored(20, [screen({ pinned: { items: [{ ...PINNED.items[0], rail: [logo(plate)] }] } })])).profiles[0].pinned?.items[0].rail?.[0];
    for (const plate of ["none", "card", "contrast"]) expect(read(plate)).toEqual(logo(plate));
    expect(read("glass")).toEqual(logo(undefined));
    expect(read(undefined)).toEqual(logo(undefined));
    const once = mergeConfig(stored(20, [screen({ pinned: { items: [{ ...PINNED.items[0], rail: [logo("contrast")] }] } })]));
    expect(JSON.parse(JSON.stringify(await readConfig(JSON.parse(JSON.stringify(once)))))).toEqual(JSON.parse(JSON.stringify(once)));
  });

  it("a profile file carries the pinned layer, hidePinned and autoSwitch through export and import", async () => {
    const profile = mergeConfig(stored(20, [screen()])).profiles[0];
    const parsed = await parseProfileFile(profileFileText(profile));
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.profile).toEqual(profile);
    // a v19 file upgrades and keeps them
    const older = await parseProfileFile(JSON.stringify({ type: "infopanel-studio-profile", version: 1, configVersion: 19, profile: screen() }));
    if ("error" in older) throw new Error(older.error);
    expect(older.upgradedFrom).toBe(19);
    expect(older.profile.pinned).toEqual(PINNED);
  });

  it("an imported or duplicated profile's pinned layer follows its pages to their fresh ids", () => {
    const config = mergeConfig(stored(20, [screen()]));
    const copy = importedProfile(config, config.profiles[0]);
    const [main, two] = copy.pages.map((p) => p.id);
    expect(main).not.toBe("main");
    const [rail, bar] = copy.pinned!.items;
    expect(rail.rail?.[0].target).toEqual({ kind: "page", pageId: main });
    expect(rail.rail?.[2].touch).toEqual({ tap: { op: "page", to: two } });
    expect(bar.show).toEqual({ pages: [two] });
    expect(rail.placement.id).not.toBe("rail-w");
    expect(copy.pages[0].placements[0].touch).toEqual({ tap: { op: "page", to: "next" } });
    // and the source is left alone
    expect(config.profiles[0].pinned).toEqual(PINNED);
    expect(withFreshIds({ ...config.profiles[0], pinned: undefined }).pinned).toBeUndefined();
  });
});

// P7 folds the Keys widget's keys (`Placement.keys`) and a command's `confirm` into v20: no release carries v20 yet.
describe("v20: keys and commands (P7)", () => {
  const KEYS = [
    { id: "k1", name: "Notes", icon: { from: "set", name: "file-text" }, series: 3, touch: { tap: { op: "run", command: 'notepad.exe "a b.txt"', confirm: true }, hold: { op: "page", to: "two" } } },
    { id: "f", name: "Apps", icon: { from: "image", asset: "abc.png" }, keys: [{ id: "k2", name: "Calc", touch: { doubleTap: { op: "obs", body: { op: "stream", state: "toggle" } } } }] },
  ];
  const keysScreen = () => screen({ pages: [{ id: "main", name: "Main", placements: [zone("k", { module: "Keys", keys: KEYS })] }, { id: "two", name: "Two", placements: [] }] });

  it("round-trips a page's keys, their folders and a command's confirm through a save and a load, and a profile file", async () => {
    const once = mergeConfig(stored(20, [keysScreen()]));
    expect(once.profiles[0].pages[0].placements[0].keys).toEqual(KEYS);
    const twice = await readConfig(JSON.parse(JSON.stringify(once)));
    expect(JSON.parse(JSON.stringify(twice))).toEqual(JSON.parse(JSON.stringify(once)));
    const parsed = await parseProfileFile(profileFileText(once.profiles[0]));
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.profile.pages[0].placements[0].keys).toEqual(KEYS);
    // a pinned Keys widget keeps its keys too
    const pinned = mergeConfig(stored(20, [screen({ pinned: { items: [{ ...PINNED.items[1], visible: true, placement: { id: "kw", module: "Keys", keys: KEYS } }] } })]));
    expect(pinned.profiles[0].pinned?.items[0].placement.keys).toEqual(KEYS);
  });

  it("drops a key it cannot read, a folder in a folder, an empty command and a confirm that isn't true", () => {
    const keys = [
      { id: "", name: "No id" },
      { id: "a", name: "A", series: 9, icon: { from: "nowhere" }, touch: { tap: { op: "run", command: "   " }, hold: { op: "run", command: "calc.exe", confirm: "yes" } } },
      { id: "a", name: "Again" },
      { id: "b" },
      { id: "f", name: "F", keys: [{ id: "g", name: "G", keys: [{ id: "h", name: "H" }] }, "x"] },
    ];
    const read = mergeConfig(stored(20, [screen({ pages: [{ id: "main", name: "Main", placements: [zone("k", { module: "Keys", keys })] }] })])).profiles[0].pages[0].placements[0].keys;
    expect(read).toEqual([
      { id: "a", name: "A", touch: { hold: { op: "run", command: "calc.exe" } } },
      { id: "f", name: "F", keys: [{ id: "g", name: "G" }] },
    ]);
    // not a list: no keys
    expect(mergeConfig(stored(20, [screen({ pages: [{ id: "main", name: "Main", placements: [zone("k", { keys: "x" })] }] })])).profiles[0].pages[0].placements[0].keys).toBeUndefined();
  });

  it("an imported profile's keys follow its pages to their fresh ids, a folder's included", () => {
    const config = mergeConfig(stored(20, [screen({ pages: [{ id: "main", name: "Main", placements: [zone("k", { module: "Keys", keys: [{ id: "f", name: "F", keys: [{ id: "g", name: "G", touch: { tap: { op: "page", to: "two" } } }] }, { id: "h", name: "H", touch: { hold: { op: "page", to: "main" } } }] })] }, { id: "two", name: "Two", placements: [] }] })]));
    const copy = importedProfile(config, config.profiles[0]);
    const [main, two] = copy.pages.map((p) => p.id);
    const keys = copy.pages[0].placements[0].keys!;
    expect(keys[0].keys?.[0].touch).toEqual({ tap: { op: "page", to: two } });
    expect(keys[1].touch).toEqual({ hold: { op: "page", to: main } });
  });
});
