// Config v21 (a widget pinned in place, owner feedback after the pinned layer's P8): a pinned item with `at`, the cells of
// the profile's grid it keeps on every page it shows on. The step only stamps the version; `normalizePinned` guards the
// cells against the grid. The server's side (the 409 for a v20 save, the backup) is in config_guard.rs and routes.rs; the
// kiosk's and the editor's in tests/e2e/pinned-editor.spec.ts.
import { describe, expect, it } from "vitest";
import { upgradeConfig } from "@/lib/config-upgrade";
import { CONFIG_VERSION, mergeConfig, readConfig, readImportedConfig, type StoredConfig } from "@/lib/layout";
import { copyPinnedToSameSize } from "@/lib/pinned-edit";
import { importedProfile, parseProfileFile, profileFileText } from "@/components/studio/profile-file";

const zone = (id: string, col: number) => ({ id, module: "Clock", colStart: col, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true });
const cell = (colStart: number, extra: object = {}) => ({ colStart, rowStart: 1, colSpan: 1, rowSpan: 1, ...extra });
const grid = (id: string, at: unknown, extra: object = {}) => ({ id, at, show: "all", visible: true, placement: { id: `${id}-w`, module: "Clock" }, ...extra });
const EDGE = { id: "bar", edge: "bottom", mode: "room", thickness: 84, show: "all", visible: true, placement: { id: "bar-w", module: "NowPlaying" } };
const PINNED = { items: [EDGE, grid("cpu", cell(1)), grid("gpu", cell(2), { show: { pages: ["two"] }, locked: true, name: "GPU" }), grid("ram", cell(3, { rowSpan: 2 }))] };
const screen = (extra: object = {}) => ({
  id: "s",
  name: "Desk",
  width: 1024,
  height: 600,
  cols: 4,
  rows: 3,
  fit: "fill",
  pages: [
    { id: "main", name: "Main", placements: [zone("a", 4)] },
    { id: "two", name: "Two", placements: [] },
  ],
  pinned: PINNED,
  ...extra,
});
const stored = (version: number, profiles: unknown[]): StoredConfig => JSON.parse(JSON.stringify({ version, activeProfile: "auto", profiles })) as StoredConfig;

describe("v21: widgets pinned in place", () => {
  it("a v20 config upgrades to v21 unchanged in meaning, its edge items as they were", () => {
    const edgeOnly = screen({ pinned: { items: [EDGE] } });
    const up = upgradeConfig(stored(20, [edgeOnly]));
    expect(CONFIG_VERSION).toBe(21);
    expect(up.version).toBe(21);
    expect(up.profiles).toEqual(mergeConfig(stored(21, [edgeOnly])).profiles);
    expect(up.profiles[0].pinned).toEqual({ items: [EDGE] });
  });

  it("round-trips grid pins beside an edge item through a save and a load, and an outside file", async () => {
    const once = mergeConfig(stored(21, [screen()]));
    expect(once.profiles[0].pinned).toEqual(PINNED);
    const twice = await readConfig(JSON.parse(JSON.stringify(once)));
    expect(JSON.parse(JSON.stringify(twice))).toEqual(JSON.parse(JSON.stringify(once)));
    expect((await readImportedConfig(JSON.parse(JSON.stringify(once)))).profiles[0].pinned).toEqual(PINNED);
  });

  it("drops cells it cannot read, rounds fractions and keeps cells inside the profile's grid", () => {
    const read = (items: unknown[]) => mergeConfig(stored(21, [screen({ pinned: { items } })])).profiles[0].pinned?.items;
    // no cells, a zero, a negative, text, Infinity, a missing span: dropped
    const bad = [grid("a", null), grid("b", cell(0)), grid("c", cell(-2)), grid("d", cell(1, { colSpan: "2" })), grid("e", cell(1, { rowSpan: Infinity })), grid("f", { colStart: 1, rowStart: 1, colSpan: 1 })];
    expect(read(bad)).toBeUndefined();
    // fractions are whole; past the 4 x 3 grid the span shrinks to it and the start moves back so it ends inside
    expect(read([grid("x", cell(1.6, { colSpan: 1.2 }))])?.[0].at).toEqual(cell(2));
    expect(read([grid("x", { colStart: 4, rowStart: 3, colSpan: 2, rowSpan: 2 })])?.[0].at).toEqual({ colStart: 3, rowStart: 2, colSpan: 2, rowSpan: 2 });
    expect(read([grid("x", { colStart: 9, rowStart: 1, colSpan: 9, rowSpan: 1 })])?.[0].at).toEqual({ colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 1 });
    // `at` makes it a grid pin: a stored edge, mode or thickness beside it is not kept
    expect(read([{ ...grid("x", cell(1)), edge: "left", mode: "float", thickness: 40 }])?.[0]).toEqual(grid("x", cell(1)));
    // its widget's own box never stays on the placement, as for an edge item
    expect(read([grid("x", cell(1), { placement: { id: "w", module: "Clock", colStart: 3, visible: false } })])?.[0].placement).toEqual({ id: "w", module: "Clock" });
  });

  it("a profile file carries grid pins and says format 21, and a file from a newer format is refused", async () => {
    const profile = mergeConfig(stored(21, [screen()])).profiles[0];
    const text = profileFileText(profile);
    expect(JSON.parse(text).configVersion).toBe(21);
    const parsed = await parseProfileFile(text);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.profile.pinned).toEqual(PINNED);
    // an older build reads this format as newer than its own and refuses it, as this build refuses the next format
    const newer = await parseProfileFile(JSON.stringify({ ...JSON.parse(text), configVersion: CONFIG_VERSION + 1 }));
    expect(newer).toEqual({ error: expect.stringMatching(/newer version/) });
  });

  it("an imported profile's grid pins follow its pages to their fresh ids and keep their cells", () => {
    const config = mergeConfig(stored(21, [screen()]));
    const copy = importedProfile(config, config.profiles[0]);
    const two = copy.pages[1].id;
    const gpu = copy.pinned!.items[2];
    expect(gpu.show).toEqual({ pages: [two] });
    expect(gpu.at).toEqual(cell(2));
    expect(gpu.placement.id).not.toBe("gpu-w");
  });

  it("a copy to a profile of the same size with a smaller grid keeps the cells inside its grid", () => {
    const config = mergeConfig(stored(21, [screen(), screen({ id: "t", cols: 2, rows: 1, pinned: undefined })]));
    const items = copyPinnedToSameSize(config, "s").config.profiles[1].pinned?.items;
    // RAM, 1 x 2 at column 3 of 4 x 3, on a 2 x 1 grid: one row high, in its last column
    expect(items?.map((it) => it.at)).toEqual([undefined, cell(1), cell(2), cell(2)]);
  });
});
