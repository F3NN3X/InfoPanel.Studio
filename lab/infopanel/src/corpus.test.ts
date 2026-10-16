/// <reference types="vite/client" />
// Parses every extracted corpus profile and checks it against an independent
// survey (scripts/corpus-expected.py). Skips when `npm run lab:extract` has
// not been run.
import { describe, expect, it } from "vitest";
import { loadExport, type ExportEntry } from "./archive.ts";
import { walkItems } from "./parse.ts";
import expected from "./__fixtures__/corpus-expected.json";

const xml = import.meta.glob<string>("../corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const indexFiles = import.meta.glob<{ id: string; entries: string[] }[]>("../corpus/index.json", {
  import: "default",
  eager: true,
});
const index = Object.values(indexFiles)[0] ?? [];

type Expected = (typeof expected)[keyof typeof expected];
const enc = new TextEncoder();

function entriesFor(id: string, names: string[]): ExportEntry[] {
  return names.map((name) => ({
    name,
    read: async () => {
      const text = xml[`../corpus/${id}/${name}`];
      if (text === undefined) throw new Error(`fixture only serves XML, not ${name}`);
      return enc.encode(text);
    },
  }));
}

const count = (keys: string[]) =>
  Object.fromEntries(
    [...new Set(keys)].sort().map((k) => [k, keys.filter((x) => x === k).length]),
  );

describe.skipIf(index.length === 0)("corpus", () => {
  it("covers every profile in the expected survey", () => {
    expect(index.map((p) => p.id).sort()).toEqual(Object.keys(expected).sort());
  });

  describe.each(index.map((p) => [p.id, p] as const))("%s", (id, entry) => {
    const exp = (expected as Record<string, Expected>)[id];
    const load = () => loadExport(entriesFor(id, entry.entries));

    it("reads the profile", async () => {
      const { profile } = await load();
      expect(profile).toMatchObject({ Width: exp.width, Height: exp.height, BackgroundColor: exp.backgroundColor });
      expect(profile.FontScale).toBe(Math.fround(exp.fontScale));
    });

    it("counts items by type and sensor type", async () => {
      const all = [...walkItems((await load()).items)].map(({ item }) => item);
      expect(all.length).toBe(exp.items);
      expect(count(all.map((i) => i.kind))).toEqual(exp.types);
      expect(count(all.flatMap((i) => ("SensorType" in i ? [i.SensorType] : [])))).toEqual(exp.sensorTypes);
    });

    it("reads gauge frame lists", async () => {
      const gauges = [...walkItems((await load()).items)].flatMap(({ item }) =>
        item.kind === "Gauge"
          ? [{ name: item.Name, frames: item.Images.length, first: item.Images[0]?.FilePath ?? null, last: item.Images.at(-1)?.FilePath ?? null }]
          : [],
      );
      expect(gauges).toEqual(exp.gauges);
    });

    it("nests groups", async () => {
      const groups = [...walkItems((await load()).items)].flatMap(({ item, depth }) =>
        item.kind === "Group" ? [{ name: item.Name, depth, children: item.DisplayItems.length }] : [],
      );
      expect(groups).toEqual(exp.groups);
    });

    it("reports exactly the fields from other InfoPanel versions, and nothing else", async () => {
      const { issues } = await load();
      const unknown = [...new Set(issues.filter((i) => i.code === "unknown-field").map((i) => `${i.kind}.${i.field}`))];
      expect(unknown.sort()).toEqual(exp.unknown);
      expect(issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    });

    it("lists assets", async () => {
      const { assets } = await load();
      expect([...assets.keys()].sort()).toEqual(exp.assets.map((a) => a.slice("assets/".length).toLowerCase()).sort());
    });
  });
});
