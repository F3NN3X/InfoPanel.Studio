import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { checkValue } from "@/lib/infopanel/editor/registry.ts";
import { FRESH, infopanelExport } from "@/lib/infopanel/export/write.ts";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import { defaultItem, PROFILE, SCHEMAS, type FieldSpec, type ItemKind } from "@/lib/infopanel/schema.ts";
import { assetNames, FIXED_FIELDS, fixtures, fullItem, fullProfile, KINDS, PNG, withChildren } from "./kind-cases.ts";

const specs = (schema: unknown) => Object.entries(schema as Record<string, FieldSpec<unknown>>);

describe("every field of every kind", () => {
  it.each(KINDS)("%s: all fields set, written, read back equal", async (kind) => {
    const item = withChildren(kind);
    // The case really sets everything: only the fields with no second value keep their default.
    const kept = specs(SCHEMAS[kind]).filter(([name, spec]) => (item as unknown as Record<string, unknown>)[name] === spec.default);
    expect(kept.map(([name]) => `${kind}.${name}`)).toEqual(FIXED_FIELDS.filter((f) => f.startsWith(`${kind}.`)));

    const assets = assetNames([item]).map((name) => ({ name, bytes: PNG }));
    const back = await loadExport(entriesFromZip(infopanelExport(fullProfile(), [item], assets)));
    expect(back.items).toEqual([item]);
    expect(back.profile).toEqual({ ...fullProfile(), ...FRESH });
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    expect([...back.assets.keys()].sort()).toEqual(assets.map((a) => a.name.toLowerCase()).sort());
  });

  it("keeps unknown fields on items, frames and the profile", async () => {
    const gauge = withChildren("Gauge");
    const back = await loadExport(entriesFromZip(infopanelExport(fullProfile(), [gauge], [])));
    expect(back.profile.unknown).toEqual({ FutureProfile: "7 & Profile" });
    expect(back.items[0].unknown).toEqual({ FutureGauge: "7 & Gauge" });
    expect((back.items[0] as typeof gauge & { Images: { unknown: unknown }[] }).Images[1].unknown).toEqual({ FutureFrame1: "7 & Frame1" });
  });

  it("keeps a mixed profile in order, children and frames included", async () => {
    const mixed = fixtures().find((f) => f.name === "Kinds-mixed")!;
    const back = await loadExport(entriesFromZip(infopanelExport(mixed.profile, mixed.items, mixed.assets)));
    expect(back.items.map((i) => i.kind)).toEqual(KINDS);
    expect(back.items).toEqual(mixed.items);
  });

  it("writes numbers at their limits", async () => {
    const item = {
      ...defaultItem("Sensor"),
      X: 2147483647,
      Y: -2147483648,
      Id: 4294967295,
      MultiplicationModifier: 1e-7,
      AdditionModifier: 1e21,
      Threshold1: 123456789.125,
      Threshold2: -2.5,
    };
    const back = await loadExport(entriesFromZip(infopanelExport({ ...fullProfile(), FontScale: Math.fround(0.1) }, [item], [])));
    expect(back.items).toEqual([item]);
    expect(back.profile.FontScale).toBe(Math.fround(0.1));
  });
});

/** Inputs where a setter ignores or clamps; `null` is "ignored, the default stays". */
const BOUNDS: Record<string, [string, unknown][]> = {
  FontSize: [["0", null], ["-1", null], ["1", 1]],
  Width: [["0", null], ["-1", null], ["1", 1]],
  Height: [["0", null], ["-1", null], ["1", 1]],
  Thickness: [["0", null], ["1", 1]],
  Step: [["0", null], ["1", 1]],
  Span: [["0", null], ["1", 1], ["360", 360], ["361", null]],
  GlowRadius: [["1", 2], ["2", 2], ["20", 20], ["21", 20]],
  Format: [["%", null], ["HH:mm", "HH:mm"]],
  Type: [["FILE", "URL"]],
  // The scheme check is case-blind for http and rtsp, exact for https and rtsps.
  HttpUrl: [["ftp://a", null], ["HTTP://a", "HTTP://a"], ["HTTPS://a", null], ["https://a", "https://a"], ["", ""]],
  RtspUrl: [["http://a", null], ["RTSP://a", "RTSP://a"], ["RTSPS://a", null], ["rtsps://a", "rtsps://a"]],
};

describe("setter boundaries", () => {
  const rows = KINDS.flatMap((kind) =>
    specs(SCHEMAS[kind]).flatMap(([name, spec]) => (spec.accept ? (BOUNDS[name] ?? [[`NO ROW for ${kind}.${name}`, null]]).map(([input, stored]) => [kind, name, spec, input, stored] as const) : [])),
  );

  it("has a row for every field with a setter check", () => {
    expect(rows.filter(([, , , input]) => input.startsWith("NO ROW")).map(([, , , input]) => input)).toEqual([]);
  });

  it.each(rows)("%s.%s reads %j as the setter does", (kind, name, spec, input, stored) => {
    const xml = `<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="${kind}DisplayItem"><${name}>${input}</${name}></DisplayItem></ArrayOfDisplayItem>`;
    const { items, issues } = parseDisplayItemsXml(xml);
    const value = (items[0] as unknown as Record<string, unknown>)[name];
    expect(value).toBe(stored ?? spec.default);
    expect(issues.some((i) => i.code === "rejected-value")).toBe(stored === null && name !== "Type");
    // The editor's check agrees with the reader.
    const checked = checkValue(spec, spec.kind === "string" || spec.kind === "enum" ? input : Number(input));
    expect(checked.ok ? checked.value : spec.default).toBe(stored ?? spec.default);
  });

  it("clamps the profile's WebView limits and ignores non-positive sizes", () => {
    const read = (field: string, input: string) => (parseProfileXml(`<Profile><${field}>${input}</${field}></Profile>`).profile as unknown as Record<string, unknown>)[field];
    expect([read("WebViewAutoRefreshSeconds", "-3"), read("WebViewAutoRefreshSeconds", "0"), read("WebViewAutoRefreshSeconds", "4"), read("WebViewAutoRefreshSeconds", "5")]).toEqual([0, 0, 5, 5]);
    expect([read("WebViewMaxFps", "-5"), read("WebViewMaxFps", "240"), read("WebViewMaxFps", "241")]).toEqual([0, 240, 240]);
    for (const field of ["Width", "Height", "FontSize"]) expect([read(field, "0"), read(field, "-1")]).toEqual([PROFILE[field as "Width"].default, PROFILE[field as "Width"].default]);
  });

  it("puts the colour's # back", () => {
    const [item] = parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="TextDisplayItem"><Color>FF00AA11</Color></DisplayItem></ArrayOfDisplayItem>').items;
    expect((item as { Color: string }).Color).toBe("#FF00AA11");
  });
});

describe("fixtures", () => {
  it("has one per kind and a mixed one, each carrying the files it names", () => {
    const all = fixtures();
    expect(all.map((f) => f.name)).toEqual([...KINDS.map((k: ItemKind) => `Kind-${k}`), "Kinds-mixed", "Kinds-empty"]);
    expect(all.find((f) => f.name === "Kinds-mixed")!.assets.length).toBeGreaterThan(3);
    expect(fullItem("Image")).toMatchObject({ FilePath: "pic & more.png" });
  });
});
