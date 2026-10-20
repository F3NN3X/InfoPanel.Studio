import { describe, expect, it } from "vitest";
import { buildZip } from "@tests/lib/infopanel/__fixtures__/builders.ts";
import { assetFile, tableOf } from "@/lib/infopanel/assets/assets.ts";
import { convertible } from "@/lib/infopanel/native/modes.ts";
import { groupBindings } from "@/lib/infopanel/remap/remap.ts";
import { bundle } from "@/lib/infopanel/import/bundle.ts";
import { listEntries, readEntry } from "@/lib/infopanel/zip.ts";
import {
  buildCanvas,
  extOverrides,
  folderEntries,
  fontRequests,
  importContext,
  installedEntries,
  openStored,
  openZip,
  storeExtOf,
  uploadMime,
  uploadPlan,
  type OpenedSource,
} from "@/lib/infopanel/import/session.ts";

const enc = new TextEncoder();
const PROFILE = "<Profile><Name>Arc</Name><Width>800</Width><Height>480</Height><FontScale>1</FontScale></Profile>";
const ITEMS =
  '<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  '<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name><Font>Segoe UI</Font><FontStyle>Regular</FontStyle></DisplayItem>' +
  '<DisplayItem xsi:type="SensorDisplayItem"><Name>s</Name><SensorName>FPS</SensorName><SensorType>Plugin</SensorType><PluginSensorId>/fps-plugin/fps/fps</PluginSensorId><Font>Segoe UI</Font><FontStyle>Regular</FontStyle></DisplayItem>' +
  '<DisplayItem xsi:type="ImageDisplayItem"><Name>i</Name><FilePath>a.png</FilePath><RelativePath>true</RelativePath></DisplayItem>' +
  "</ArrayOfDisplayItem>";

/** A PNG header of a size: enough for the sniffer. */
function png(w: number, h: number, salt = 0): Uint8Array {
  const b = new Uint8Array(33 + salt);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

async function exportZip(extra: { name: string; data: Uint8Array }[] = []) {
  return buildZip([
    { name: "Profile.xml", text: PROFILE, method: 8 },
    { name: "DisplayItems.xml", text: ITEMS, method: 0 },
    { name: "assets/a.png", data: png(64, 32), method: 0 },
    ...extra.map((e) => ({ ...e, method: 0 as const })),
  ]);
}

describe("opening a source", () => {
  it("opens an .infopanel: parsed items, the asset table, the file name as its name", async () => {
    const s = await openZip("C:\\x\\ARC v2.infopanel", await exportZip());
    expect(s.name).toBe("ARC v2");
    expect(s.origin).toBe("file");
    expect(s.parsed.items.map((i) => i.kind)).toEqual(["Text", "Sensor", "Image"]);
    expect([...s.assets.keys()]).toEqual(["a.png"]);
    expect(s.assets.get("a.png")).toMatchObject({ type: "png", width: 64, height: 32 });
    expect(s.restore).toBeUndefined();
  });

  it("refuses what is not a zip, and an export without its XML, with a message", async () => {
    await expect(openZip("x.infopanel", enc.encode("hello"))).rejects.toThrow(/not a zip/);
    const noXml = await buildZip([{ name: "assets/a.png", data: png(1, 1), method: 0 }]);
    await expect(openZip("x.infopanel", noXml)).rejects.toThrow(/Profile\.xml is missing/);
  });

  it("opens a saved .canvas.zip with its choices back", async () => {
    const source = await openZip("Arc.infopanel", await exportZip());
    const g = groupBindings(source.parsed.items)[0];
    const stored = buildCanvas({
      source, name: "Arc", mode: "infopanel", resolved: new Map([[g.id, { key: "plugins.fps", via: "chosen" }]]),
      overrides: new Map([[g.id, "plugins.fps"]]), dataApi: null, uploaded: new Map(),
    });
    const reopened = await openZip("Arc.canvas.zip", bundle(stored, source.assets, new Map()));
    expect(reopened.name).toBe("Arc");
    expect(reopened.restore?.overrides).toEqual(new Map([[g.id, "plugins.fps"]]));
    expect(reopened.restore?.defaultMode).toBe("infopanel");
    expect(reopened.restore?.keys.get("1")).toEqual({ key: "plugins.fps", via: "chosen" });
    expect([...reopened.assets.keys()]).toEqual(["a.png"]);
  });

  it("keeps a screenshot id on the stored form, but a .canvas.zip carries neither the id nor the file", async () => {
    const shot = `${"d".repeat(64)}.png`;
    const source = await openZip("Arc.infopanel", await exportZip());
    const base = { source, name: "Arc", mode: "infopanel" as const, resolved: new Map(), overrides: new Map(), dataApi: null, uploaded: new Map() };
    const stored = buildCanvas({ ...base, screenshot: shot });
    expect(stored.screenshot).toBe(shot);
    expect(buildCanvas(base)).not.toHaveProperty("screenshot");
    const zip = bundle(stored, source.assets, new Map());
    expect(listEntries(zip).some((e) => e.name.includes("d".repeat(64)))).toBe(false);
    const reopened = await openZip("Arc.canvas.zip", zip);
    expect(reopened.restore?.screenshot).toBeUndefined();
    expect(JSON.stringify(stored)).toContain(shot);
    expect(new TextDecoder().decode(await readEntry(zip, listEntries(zip).find((e) => e.name === "canvas.json")!))).not.toContain(shot);
  });

  it("finds the export inside a picked folder, one level down too", async () => {
    const read = async () => new Uint8Array();
    const { name, entries } = folderEntries([
      { path: "Downloads/ARCv2/Profile.xml", read },
      { path: "Downloads/ARCv2/DisplayItems.xml", read },
      { path: "Downloads/ARCv2/assets/a.png", read },
      { path: "Downloads/notes.txt", read },
    ]);
    expect(name).toBe("ARCv2");
    expect(entries.map((e) => e.name)).toEqual(["Profile.xml", "DisplayItems.xml", "assets/a.png"]);
    expect(() => folderEntries([{ path: "x/readme.txt", read }])).toThrow(/no Profile\.xml/);
  });

  it("reads an installed profile's files from the server routes", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(new Uint8Array([1]));
    }) as typeof fetch;
    const entries = installedEntries({ guid: "g-1", name: "P", bytes: 1, assets: ["a b.png"] }, fake);
    expect(entries.map((e) => e.name)).toEqual(["Profile.xml", "DisplayItems.xml", "assets/a b.png"]);
    await Promise.all(entries.map((e) => e.read()));
    expect(urls).toEqual([
      "/api/infopanel/installed/g-1/Profile.xml",
      "/api/infopanel/installed/g-1/DisplayItems.xml",
      "/api/infopanel/installed/g-1/assets/a%20b.png",
    ]);
    const failing = installedEntries({ guid: "g", name: "P", bytes: 1, assets: [] }, (async () => new Response("", { status: 404 })) as typeof fetch);
    await expect(failing[0].read()).rejects.toThrow(/404/);
  });
});

describe("uploading", () => {
  it("takes each stored type as the asset store does; Matroska as WebM; nothing for other files", () => {
    expect(uploadMime({ type: "png", bytes: png(1, 1) })).toBe("image/png");
    expect(uploadMime({ type: "video", bytes: WEBM })).toBe("video/webm");
    expect(uploadMime({ type: "video", bytes: new Uint8Array(8) })).toBe("video/mp4");
    expect(uploadMime({ type: "other", bytes: new Uint8Array(8) })).toBeNull();
  });

  it("plans one upload per distinct file", async () => {
    const table = tableOf([
      await assetFile("a.png", png(2, 2), "export"),
      await assetFile("copy.png", png(2, 2), "export"),
      await assetFile("x.bin", enc.encode("??"), "export"),
    ]);
    expect(uploadPlan(table).map((u) => [u.file.name, u.mime])).toEqual([["a.png", "image/png"]]);
  });

  it("records the store's extension only where it differs from the type's usual one", async () => {
    const a = await assetFile("a.png", png(2, 2), "export");
    const v = await assetFile("v.mkv", WEBM, "export");
    const table = tableOf([a, v]);
    const uploaded = new Map([
      [a.hash, `${a.hash}.png`],
      [v.hash, `${v.hash}.webm`],
    ]);
    expect(extOverrides(table, uploaded)).toEqual(new Map([[v.hash, "webm"]]));
    expect(storeExtOf(`${v.hash}.webm`)).toBe("webm");
  });
});

describe("the stored form of an import", () => {
  const open = async () => openZip("Arc.infopanel", await exportZip());

  it("sets every item's mode: native where it converts, none for Faithful; 'Both' starts native", async () => {
    const source = await open();
    const ctx = importContext(source.parsed.profile, source.assets, new Map());
    const native = new Set(convertible(source.parsed.items, ctx));
    expect(native.size).toBeGreaterThan(0);
    for (const mode of ["native", "both"] as const) {
      const s = buildCanvas({ source, name: "Arc", mode, resolved: new Map(), overrides: new Map(), dataApi: null, uploaded: new Map() });
      expect(s.items.map((it, i) => it.$?.mode === "native" === native.has(String(i)))).toEqual([true, true, true]);
      expect(s.defaultMode).toBe(mode);
    }
    const faithful = buildCanvas({ source, name: "Arc", mode: "infopanel", resolved: new Map(), overrides: new Map(), dataApi: null, uploaded: new Map() });
    expect(faithful.items.every((it) => it.$?.mode === undefined)).toBe(true);
  });

  it("takes the chosen name, the remapped keys, the font requests and the store's extensions", async () => {
    const source: OpenedSource = await open();
    const g = groupBindings(source.parsed.items)[0];
    const a = source.assets.get("a.png")!;
    const s = buildCanvas({
      source, name: "My Arc", mode: "infopanel", resolved: new Map([[g.id, { key: "plugins.fps", via: "plugin-key" }]]),
      overrides: new Map(), dataApi: null, uploaded: new Map([[a.hash, `${a.hash}.png`]]),
      now: new Date("2026-10-17T00:00:00Z"),
    });
    expect(s.source).toEqual({ name: "My Arc", origin: "file", importedAt: "2026-10-17T00:00:00.000Z" });
    expect(s.profile.Name).toBe("My Arc");
    expect(s.items[1].$).toEqual({ key: "plugins.fps", via: "exact" });
    expect(s.fonts).toEqual([{ request: { font: "Segoe UI", style: "Regular", bold: false, italic: false }, use: "infopanel" }]);
    expect(s.assets).toEqual([{ name: "a.png", hash: a.hash, type: "png", size: a.bytes.length }]);
  });

  it("counts font requests per text item", async () => {
    const source = await open();
    expect([...fontRequests(source.parsed.items).values()].map((r) => r.count)).toEqual([2]);
  });
});

describe("reopening a stored form from the asset store", () => {
  it("reads each file by hash, refuses bytes that do not match, and restores the choices", async () => {
    const source = await openZip("Arc.infopanel", await exportZip());
    const g = groupBindings(source.parsed.items)[0];
    const stored = buildCanvas({ source, name: "Arc", mode: "native", resolved: new Map(), overrides: new Map([[g.id, ""]]), dataApi: null, uploaded: new Map() });
    const a = source.assets.get("a.png")!;
    const asked: string[] = [];
    const good = await openStored(JSON.parse(JSON.stringify(stored)), async (hash, ext, type) => {
      asked.push(`${hash.slice(0, 6)}:${ext ?? ""}:${type}`);
      return hash === a.hash ? a.bytes : null;
    });
    expect(asked).toEqual([`${a.hash.slice(0, 6)}::png`]);
    expect(good.restore).toMatchObject({ defaultMode: "native", missing: [], overrides: new Map([[g.id, ""]]) });
    expect([...good.assets.keys()]).toEqual(["a.png"]);

    const tampered = await openStored(stored, async () => png(9, 9));
    expect(tampered.restore?.missing).toEqual(["a.png"]);
    expect(tampered.assets.size).toBe(0);
    await expect(openStored({ format: "nope" }, async () => null)).rejects.toThrow(/Not an imported InfoPanel canvas/);
  });
});
