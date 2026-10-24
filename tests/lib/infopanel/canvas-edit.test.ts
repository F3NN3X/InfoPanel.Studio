import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import { isBound, type BoundItem } from "@/lib/infopanel/sensors.ts";
import { readStored, toStored } from "@/lib/infopanel/import/stored.ts";
import { openCanvas } from "@/lib/infopanel/canvas.ts";
import { storedCanvasKeys } from "@/lib/infopanel/canvas-keys.ts";
import { duplicate, group, itemAt, moveBy, setField } from "@/lib/infopanel/editor/ops.ts";
import { groupId, indexCatalog } from "@/lib/infopanel/remap/remap.ts";
import { STARTERS } from "@/lib/infopanel/gauges/presets.ts";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector.ts";
import { loadExport, entriesFromZip } from "@/lib/infopanel/archive.ts";
import { sensorOfCatalog } from "@/lib/infopanel/editor/bind.ts";
import { infopanelExport } from "@/lib/infopanel/export/write.ts";
import { bindingRef, buildCatalog } from "@/lib/infopanel/sensors.ts";
import { newItem } from "@/lib/infopanel/editor/create.ts";
import {
  allMode,
  bindItem,
  changedGroups,
  checkGeometry,
  drawAllAs,
  editContext,
  editItems,
  editKeyOf,
  editKeys,
  flatPaths,
  freeAssetName,
  withDroppedGauge,
  withDroppedImage,
  itemModes,
  itemOverrides,
  livePaths,
  MOCK_DEFAULT,
  modeTally,
  rangeSelect,
  sensorView,
  storeItems,
  withGroupKeys,
  withRemap,
  importOf,
} from "@/lib/infopanel/canvas-edit.ts";

const DEFAULT_GAUGE_SPEC = normalizeGauge(STARTERS[0].gauge);
const gid = (item: DisplayItem) => groupId(item as BoundItem);
const parse = (body: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${body}</ArrayOfDisplayItem>`).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>480</Height></Profile>").profile;

const ITEMS = parse(
  '<DisplayItem xsi:type="SensorDisplayItem"><Name>cpu</Name><SensorName>CPU</SensorName><SensorType>Libre</SensorType><LibreSensorId>/cpu/0</LibreSensorId></DisplayItem>' +
    '<DisplayItem xsi:type="GroupDisplayItem"><Name>grp</Name><DisplayItems>' +
    '<DisplayItem xsi:type="SensorDisplayItem"><Name>gpu</Name><SensorName>GPU</SensorName><SensorType>Libre</SensorType><LibreSensorId>/gpu/0</LibreSensorId></DisplayItem>' +
    '<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name><Font>Orbitron</Font></DisplayItem>' +
    "</DisplayItems></DisplayItem>" +
    '<DisplayItem xsi:type="SensorDisplayItem"><Name>fan</Name><SensorName>Fan</SensorName><SensorType>Libre</SensorType><LibreSensorId>/fan/0</LibreSensorId></DisplayItem>',
);

function canvas() {
  const gpu = (ITEMS[1] as Extract<DisplayItem, { kind: "Group" }>).DisplayItems[0];
  const keys = new Map<DisplayItem, string>([
    [ITEMS[0], "libre.cpu"],
    [gpu, "libre.gpu"],
  ]);
  const s = toStored({
    name: "ARCv2",
    origin: "file",
    dataApi: null,
    defaultMode: "infopanel",
    profile,
    items: ITEMS,
    fonts: [],
    assets: new Map(),
    keyOf: (item) => (keys.has(item) ? { key: keys.get(item), via: "exact" } : isBound(item) ? { via: "unresolved" } : null),
  });
  return openCanvas(JSON.parse(JSON.stringify(s)));
}

describe("editItems / storeItems", () => {
  it("carries each bound item's key on the item, through reorder, group and duplicate", () => {
    const open = canvas();
    const items = editItems(open);
    expect(editKeyOf(items[0])).toBe("libre.cpu");
    expect(editKeyOf(itemAt(items, "1.0")!)).toBe("libre.gpu");
    expect(editKeyOf(items[2])).toBeNull();

    const dup = duplicate(items, ["0"]);
    const grouped = group(dup.items, ["0", "2"]);
    const stored = storeItems(open.stored, open.profile, grouped!.items);
    expect(storedCanvasKeys(stored)).toEqual(["libre.cpu", "libre.gpu"]);
    const reopened = editItems(openCanvas(JSON.parse(JSON.stringify(stored))));
    const keys = flatPaths(reopened).map((p) => editKeyOf(itemAt(reopened, p)!));
    expect(keys.filter((k) => k === "libre.cpu")).toHaveLength(2);
  });

  it("keeps the source and assets, and writes the edited geometry", () => {
    const open = canvas();
    const moved = moveBy(editItems(open), ["0"], 5, -3);
    const stored = storeItems(open.stored, open.profile, moved);
    expect(stored.source).toEqual(open.stored.source);
    expect(stored.assets).toBe(open.stored.assets);
    const again = openCanvas(JSON.parse(JSON.stringify(stored)));
    expect(again.items[0].X).toBe(open.items[0].X + 5);
    expect(again.items[0].Y).toBe(open.items[0].Y - 3);
  });

  it("keeps the screenshot the canvas kept for Compare through an edit", () => {
    const shot = `${"d".repeat(64)}.png`;
    const open = canvas();
    const stored = storeItems({ ...open.stored, screenshot: shot }, open.profile, editItems(open));
    expect(stored.screenshot).toBe(shot);
    expect(storeItems(open.stored, open.profile, editItems(open))).not.toHaveProperty("screenshot");
  });

  it("lists the fonts the items ask for, keeping a known font's choice", () => {
    const open = canvas();
    const stored = storeItems(open.stored, open.profile, editItems(open));
    expect(stored.fonts.map((f) => f.request.font)).toContain("Orbitron");
    expect(stored.fonts.every((f) => f.use === "infopanel")).toBe(true);
  });
});

describe("modes", () => {
  it("tallies native, InfoPanel and stuck items, groups left out", () => {
    const open = canvas();
    const items = editItems(open);
    const modes = itemModes(items, editContext(open));
    expect(modes.has("1")).toBe(false);
    const t = modeTally(modes);
    expect(t.native + t.infopanel + t.stuck).toBe(4);
  });

  it("draws every convertible item one way as one change; nothing changes the same array back", () => {
    const open = canvas();
    const ctx = editContext(open);
    const items = editItems(open);
    const native = drawAllAs(items, itemModes(items, ctx), true);
    expect(allMode(itemModes(native, ctx))).toBe("native");
    expect(drawAllAs(native, itemModes(native, ctx), true)).toBe(native);
    expect(allMode(itemModes(drawAllAs(native, itemModes(native, ctx), false), ctx))).toBe("infopanel");
  });
});

describe("tree selection", () => {
  it("selects a range in tree order, either way round", () => {
    const items = editItems(canvas());
    expect(flatPaths(items)).toEqual(["0", "1", "1.0", "1.1", "2"]);
    expect(rangeSelect(items, "0", "1.0")).toEqual(["0", "1", "1.0"]);
    expect(rangeSelect(items, "2", "1.1")).toEqual(["1.1", "2"]);
    expect(rangeSelect(items, "9", "2")).toEqual(["2"]);
  });

  it("drops paths that are gone", () => {
    expect(livePaths(editItems(canvas()), ["0", "1.1", "1.5", "7"])).toEqual(["0", "1.1"]);
  });
});

describe("checkGeometry", () => {
  it("takes whole numbers", () => {
    expect(checkGeometry("Bar", "X", " -12 ")).toEqual({ ok: true, value: -12 });
    expect(checkGeometry("Bar", "Width", "40")).toEqual({ ok: true, value: 40 });
  });

  it("refuses what InfoPanel would, with the inspector's message", () => {
    expect(checkGeometry("Bar", "Width", "0")).toEqual({ ok: false, message: "InfoPanel needs W ≥ 1. The value isn’t stored." });
    expect(checkGeometry("Bar", "X", "1.5")).toMatchObject({ ok: false, message: expect.stringContaining("whole number") });
    expect(checkGeometry("Bar", "Y", "abc")).toMatchObject({ ok: false, message: expect.stringContaining("Y as a number") });
    expect(checkGeometry("Bar", "Height", "")).toMatchObject({ ok: false });
  });

  it("lets text size itself (0) but never go negative", () => {
    expect(checkGeometry("Text", "Width", "0")).toEqual({ ok: true, value: 0 });
    expect(checkGeometry("Text", "Height", "-1")).toEqual({ ok: false, message: "InfoPanel needs H ≥ 0. The value isn’t stored." });
  });
});

describe("sensors", () => {
  it("lists the keys the items read", () => {
    expect(editKeys(editItems(canvas()))).toEqual(["libre.cpu", "libre.gpu"]);
  });

  it("live keeps keys and values; unbound reads nothing; mock gives each group its value", () => {
    const open = canvas();
    const ctx = editContext(open);
    const items = editItems(open);
    const live = { "libre.cpu": { value: 42, unit: "%" } };
    expect(sensorView("live", ctx, [], new Map(), live)).toEqual({ ctx, values: live });

    const unbound = sensorView("unbound", ctx, [], new Map(), live);
    expect(unbound.ctx.keyOf(items[0] as BoundItem)).toBeNull();
    expect(unbound.values).toEqual({});

    const cpu = gid(items[0]);
    const fan = gid(items[2]);
    const mock = sensorView("mock", ctx, [cpu, fan], new Map([[cpu, 70]]), live);
    expect(mock.values[mock.ctx.keyOf(items[0] as BoundItem)!]).toEqual({ value: 70, unit: "" });
    // An item without a key still reads its mock value.
    expect(mock.values[mock.ctx.keyOf(items[2] as BoundItem)!]).toEqual({ value: MOCK_DEFAULT, unit: "" });
    expect(mock.ctx.keyOf(itemAt(items, "1.1") as BoundItem)).toBeNull();
  });
});

describe("remap on edited items", () => {
  it("reads the user's own choices back from the items", () => {
    const items = editItems(canvas());
    const cpu = gid(items[0]);
    const fan = gid(items[2]);
    expect(itemOverrides(items).size).toBe(0);
    const chosen = withGroupKeys(items, (item) => (gid(item) === cpu ? { key: "x.cpu", via: "chosen" } : { via: "unbound" }), new Set([cpu, fan]));
    expect(itemOverrides(chosen)).toEqual(new Map([[cpu, "x.cpu"], [fan, ""]]));
  });

  it("rewrites only the changed groups, so an offline catalog never clears the others", () => {
    const items = editItems(canvas());
    const fan = gid(items[2]);
    const next = withGroupKeys(items, () => ({ via: "unresolved" }), new Set([fan]));
    expect(editKeyOf(next[0])).toBe("libre.cpu");
    expect(editKeyOf(itemAt(next, "1.0")!)).toBe("libre.gpu");
  });

  it("names the groups whose choice changed", () => {
    expect(changedGroups(new Map([["a", "k"], ["b", ""]]), new Map([["a", "k"], ["c", "z"]]))).toEqual(new Set(["b", "c"]));
  });

  it("a field edit keeps the item's record", () => {
    const items = editItems(canvas());
    expect(editKeyOf(setField(items, "0", "Name", "renamed")[0])).toBe("libre.cpu");
  });
});

describe("library drops", () => {
  const file = { name: "logo.png", hash: "f".repeat(64), type: "png" as const, size: 10, width: 1600, height: 400 };

  it("names a file apart from the canvas's own, ignoring case", () => {
    const assets = [{ name: "Logo.png", hash: "a".repeat(64), type: "png" as const, size: 1 }, { name: "logo (2).png", hash: "b".repeat(64), type: "png" as const, size: 1 }];
    expect(freeAssetName(assets, "logo.png")).toBe("logo (3).png");
    expect(freeAssetName(assets, "other")).toBe("other");
  });

  it("adds an Image item centred on the drop, at most half the profile, with its file", () => {
    const open = canvas();
    const r = withDroppedImage(open.stored, open.profile, editItems(open), file, { x: 400, y: 240 });
    expect(r.path).toBe("3");
    const again = openCanvas(JSON.parse(JSON.stringify(r.stored)));
    const img = again.items[3] as Extract<DisplayItem, { kind: "Image" }>;
    expect([img.kind, img.FilePath, img.RelativePath, img.Width, img.Height, img.X, img.Y]).toEqual(["Image", "logo.png", true, 400, 100, 200, 190]);
    expect(r.stored.assets.at(-1)).toMatchObject({ name: "logo.png", hash: file.hash });
    expect(storedCanvasKeys(r.stored)).toEqual(["libre.cpu", "libre.gpu"]);
  });

  it("reuses a file the canvas already has", () => {
    const open = canvas();
    const first = withDroppedImage(open.stored, open.profile, editItems(open), file, { x: 0, y: 0 });
    const reopened = openCanvas(JSON.parse(JSON.stringify(first.stored)));
    const second = withDroppedImage(reopened.stored, reopened.profile, editItems(reopened), { ...file, name: "copy.png" }, { x: 0, y: 0 });
    expect(second.stored.assets).toHaveLength(first.stored.assets.length);
  });

  describe("a gauge", () => {
    const frame = (c: string, name: string) => ({ name, hash: c.repeat(64), type: "png" as const, size: 5, width: 200, height: 100 });
    const range = { min: 10, max: 90, animationSpeed: 4 };
    const gaugeAt = (r: { stored: ReturnType<typeof canvas>["stored"]; path: string }) => openCanvas(JSON.parse(JSON.stringify(r.stored))).items[Number(r.path)] as Extract<DisplayItem, { kind: "Gauge" }> & { vector?: { width: number } };

    it("a vector spec becomes a Gauge item at the spec's size, centred, keeping the spec and the range", () => {
      const open = canvas();
      const vector = { ...DEFAULT_GAUGE_SPEC, width: 200, height: 200 };
      const r = withDroppedGauge(open.stored, open.profile, editItems(open), { name: "Ring", vector, ...range }, { x: 400, y: 240 });
      expect(r.path).toBe("3");
      const g = gaugeAt(r);
      expect([g.kind, g.Name, g.X, g.Y, g.Width, g.Height, g.MinValue, g.MaxValue, g.AnimationSpeed]).toEqual(["Gauge", "Ring", 300, 140, 200, 200, 10, 90, 4]);
      expect(g.vector?.width).toBe(200);
      expect(g.Images).toHaveLength(0);
      expect(storedCanvasKeys(r.stored)).toEqual(["libre.cpu", "libre.gpu"]);
    });

    it("limits the size to half the profile, keeping the shape", () => {
      const open = canvas();
      const vector = { ...DEFAULT_GAUGE_SPEC, width: 1600, height: 400 };
      const g = gaugeAt(withDroppedGauge(open.stored, open.profile, editItems(open), { name: "Wide", vector, ...range }, { x: 400, y: 240 }));
      expect([g.Width, g.Height]).toEqual([400, 100]);
    });

    it("frames join the canvas's files as the Images list; the same bytes are reused", () => {
      const open = canvas();
      const frames = [frame("a", "f0.png"), frame("b", "f1.png"), frame("a", "f0-copy.png")];
      const r = withDroppedGauge(open.stored, open.profile, editItems(open), { name: "Seq", frames, ...range }, { x: 400, y: 240 });
      const g = gaugeAt(r);
      expect(g.Images.map((i) => [i.FilePath, i.Type, i.RelativePath])).toEqual([["f0.png", "FILE", true], ["f1.png", "FILE", true], ["f0.png", "FILE", true]]);
      expect([g.Width, g.Height]).toEqual([200, 100]);
      expect(r.stored.assets.slice(-2).map((a) => a.name)).toEqual(["f0.png", "f1.png"]);
      expect(r.stored.assets).toHaveLength(open.stored.assets.length + 2);
    });
  });
});

describe("native bindings follow the chosen sensor", () => {
  const sensors = {
    "libre.amd": { name: "Core (Tctl/Tdie)", ref: "libre:/amdcpu/0/temperature/2", unit: "°C" },
    "hwinfo.fps": { name: "Framerate", ref: "hwinfo:-1/4026535920/0/134217728" },
    "plugins.old": { name: "Old build" },
  };
  const sensorOf = sensorOfCatalog(sensors);

  it("a remap choice, exported to .infopanel, reads the remapped sensor", async () => {
    const items = editItems(canvas());
    const cpu = gid(items[0]);
    const next = withGroupKeys(items, (item) => (gid(item) === cpu ? { key: "hwinfo.fps", via: "chosen" } : null), new Set([cpu]), sensorOf);
    expect(editKeyOf(next[0])).toBe("hwinfo.fps");
    const stored = storeItems(canvas().stored, profile, next);
    const back = await loadExport(entriesFromZip(infopanelExport(profile, readStored(stored).items, [])));
    expect(back.items[0]).toMatchObject({ SensorType: "HwInfo", HwInfoRemoteIndex: -1, Id: 4026535920, Instance: 0, EntryId: 134217728, SensorName: "Framerate" });
    // The other groups keep their own binding.
    expect(bindingRef(back.items[2] as BoundItem)).toBe("libre:/fan/0");
  });

  it("a sensor the Data API gives no ref for binds the preview only", () => {
    const items = editItems(canvas());
    const next = bindItem(items[0], { key: "plugins.old", name: "Old build" });
    expect(editKeyOf(next)).toBe("plugins.old");
    expect(bindingRef(next as BoundItem)).toBe("libre:/cpu/0");
    expect((next as BoundItem).SensorName).toBe("CPU");
  });

  it("bindItem writes the type, ids and name, and our key as chosen", () => {
    const next = bindItem(editItems(canvas())[0], sensorOf("libre.amd")!);
    expect(next).toMatchObject({ SensorType: "Libre", LibreSensorId: "/amdcpu/0/temperature/2", SensorName: "Core (Tctl/Tdie)", $import: { key: "libre.amd", via: "chosen" } });
  });
});

describe("Reset to automatic after a remap choice", () => {
  const sensors = {
    "libre.cpu": { name: "CPU", ref: "libre:/cpu/0" },
    "hwinfo.fps": { name: "Framerate", ref: "hwinfo:-1/4026535920/0/134217728" },
  };
  const index = indexCatalog(buildCatalog(sensors));
  const sensorOf = sensorOfCatalog(sensors);
  /** The items saved and opened again, as the studio does between edits. */
  const reopen = (items: DisplayItem[]) => editItems(openCanvas(JSON.parse(JSON.stringify(storeItems(canvas().stored, profile, items)))));
  const choose = () => {
    const items = editItems(canvas());
    return reopen(withRemap(items, itemOverrides(items), new Map([[gid(items[0]), "hwinfo.fps"]]), index, sensorOf));
  };

  it("puts the imported binding back, resolves it again, and exports it", async () => {
    const chosen = choose();
    expect(bindingRef(chosen[0] as BoundItem)).toBe("hwinfo:-1/4026535920/0/134217728");
    expect(importOf(chosen[0])?.original).toMatchObject({ SensorType: "Libre", LibreSensorId: "/cpu/0", SensorName: "CPU" });

    const reset = reopen(withRemap(chosen, itemOverrides(chosen), new Map(), index, sensorOf));
    expect(reset[0]).toMatchObject({ SensorType: "Libre", LibreSensorId: "/cpu/0", SensorName: "CPU" });
    expect(importOf(reset[0])).toEqual({ key: "libre.cpu", via: "exact" });
    const back = await loadExport(entriesFromZip(infopanelExport(profile, readStored(storeItems(canvas().stored, profile, reset)).items, [])));
    expect(back.items[0]).toMatchObject({ SensorType: "Libre", LibreSensorId: "/cpu/0", SensorName: "CPU" });
  });

  it("keeps the first original through a second choice", () => {
    const chosen = choose();
    const again = withRemap(chosen, itemOverrides(chosen), new Map([[gid(chosen[0]), "libre.cpu"]]), index, sensorOf);
    expect(importOf(again[0])?.original).toMatchObject({ LibreSensorId: "/cpu/0" });
  });

  it("an older stored form without the original still loads, and resets from the binding it has", () => {
    const old = JSON.parse(JSON.stringify(storeItems(canvas().stored, profile, choose())));
    delete old.items[0].$.original;
    const opened = openCanvas(old);
    expect(opened.issues).toEqual([]);
    const items = editItems(opened);
    const reset = withRemap(items, itemOverrides(items), new Map(), index, sensorOf);
    expect(bindingRef(reset[0] as BoundItem)).toBe("hwinfo:-1/4026535920/0/134217728");
    expect(importOf(reset[0])).toEqual({ key: "hwinfo.fps", via: "exact" });
  });

  it("an item the import never saw keeps no original", () => {
    const next = bindItem(newItem("Sensor", profile), sensorOf("hwinfo.fps")!);
    expect(importOf(next)).toEqual({ key: "hwinfo.fps", via: "chosen" });
  });
});

describe("a bound table's column format", () => {
  it("is the plugin's when the Data API reports it, else InfoPanel's default", () => {
    const table = newItem("TableSensor", profile);
    const chosen = { key: "plugins.t", name: "Top", ref: "plugin:/t/top" };
    expect(bindItem(table, { ...chosen, format: "0:150|1:60" })).toMatchObject({ TableFormat: "0:150|1:60", PluginSensorId: "/t/top" });
    expect(bindItem(table, chosen)).toMatchObject({ TableFormat: "0:10|1:10|2:10|3:10|4:10|5:10" });
    expect(sensorOfCatalog({ "plugins.t": { name: "Top", ref: "plugin:/t/top", table: { columns: [], rows: [], format: "0:150" } } })("plugins.t")).toMatchObject({ format: "0:150" });
  });
});
