import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { nativeExport, nativeItems, NATIVE_CASE } from "./native-cases.ts";
import { fullProfile } from "./kind-cases.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";

const kindsOf = (items: readonly DisplayItem[]): string[] => items.flatMap((i) => [i.kind, ...(i.kind === "Group" ? kindsOf(i.DisplayItems) : [])]);

describe("converted native widgets, exported for InfoPanel", () => {
  it("covers every item kind the conversions make", () => {
    const kinds = new Set(kindsOf(nativeItems(fullProfile())));
    for (const k of ["Sensor", "Text", "Bar", "Gauge", "Graph", "TableSensor", "Clock", "Calendar", "Shape", "Image", "HttpImage", "Group"]) expect(kinds.has(k), k).toBe(true);
  });

  it("writes an .infopanel that reads back with every item and its sensor binding", async () => {
    const made = await nativeExport(fullProfile());
    expect(made.name).toBe(NATIVE_CASE);
    const read = await loadExport(entriesFromZip(made.bytes));
    expect(kindsOf(read.items)).toEqual(kindsOf(made.items));
    const bound = kindsOf(read.items.filter((i) => i.kind === "Sensor" && "PluginSensorId" in i && i.PluginSensorId));
    expect(bound.length).toBeGreaterThan(0);
  });
});
