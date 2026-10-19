import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse";
import { allSections, inspectorTabs, type InspectorContext } from "../inspector-model";
import { fromCss, GRID_FIELDS, ipDefault, ipGroups, ipOwn, ipShown, ipValue, toCss } from "./infopanel-defs";

const [bar, group] = parseDisplayItemsXml(
  '<ArrayOfDisplayItem xmlns:xsi="x">' +
    '<DisplayItem xsi:type="BarDisplayItem"><Name>b</Name><SensorType>Libre</SensorType><Width>120</Width><Color>#80FF0000</Color></DisplayItem>' +
    '<DisplayItem xsi:type="GroupDisplayItem"><Name>g</Name><DisplayItems /></DisplayItem>' +
    "</ArrayOfDisplayItem>",
).items;

describe("ipGroups", () => {
  it("leaves the position grid to its section and gathers the colours", () => {
    const groups = ipGroups("Bar");
    const keys = groups.flatMap((g) => g.defs.map((d) => d.key));
    for (const f of GRID_FIELDS) expect(keys).not.toContain(f);
    const colours = groups.find((g) => g.id === "ip-colours");
    expect(colours?.defs.every((d) => d.type === "color")).toBe(true);
    expect(groups.filter((g) => g.id !== "ip-colours").every((g) => g.defs.every((d) => d.type !== "color"))).toBe(true);
  });

  it("puts the raw binding last, as advanced", () => {
    const groups = ipGroups("Bar");
    const sensor = groups.findIndex((g) => g.title === "Binding ids");
    expect(groups[sensor].advanced).toBe(true);
    expect(groups.slice(sensor).every((g) => g.advanced)).toBe(true);
  });

  it("maps field kinds to setting types", () => {
    const defs = ipGroups("Bar").flatMap((g) => g.defs);
    expect(defs.find((d) => d.key === "Hidden")?.type).toBe("boolean");
    expect(defs.find((d) => d.key === "SensorType")?.type).toBe("select");
    expect(defs.find((d) => d.key === "Name")?.type).toBe("text");
  });
});

describe("colours", () => {
  it("shows #AARRGGBB as #rrggbb and keeps the alpha on write", () => {
    expect(toCss("#80FF0000")).toBe("#ff0000");
    expect(fromCss("#00ff00", "#80FF0000")).toBe("#8000FF00");
    expect(fromCss("#00ff00", "")).toBe("#FF00FF00");
  });
});

describe("values", () => {
  it("counts only fields that differ from InfoPanel's defaults", () => {
    const own = ipOwn(bar, ipGroups("Bar"));
    expect(own.Name).toBe("b");
    expect(own.Color).toBe("#ff0000");
    expect(own).not.toHaveProperty("Hidden");
  });

  it("shows a colour row as #rrggbb", () => {
    const def = ipGroups("Bar").flatMap((g) => g.defs).find((d) => d.key === "Color")!;
    expect(ipShown(bar, def)).toBe("#ff0000");
  });

  it("checks a value as InfoPanel's setter would", () => {
    expect(ipValue(bar, "Color", "#0000ff")).toEqual({ ok: true, value: "#800000FF" });
    expect(ipValue(bar, "Hidden", true)).toEqual({ ok: true, value: true });
    const bad = ipValue(bar, "SensorType", "Nope");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toMatch(/^InfoPanel needs .* The value isn’t stored\.$/);
    expect(ipValue(bar, "NotAField", 1)).toEqual({ ok: false, reason: "not a field of this item" });
  });

  it("knows each field's default", () => {
    expect(ipDefault(bar, "Hidden")).toBe(false);
    expect(ipDefault(bar, "Nope")).toBeUndefined();
  });
});

describe("infopanel inspector sections", () => {
  const ctx = (item: typeof bar, over: Partial<Extract<InspectorContext, { kind: "infopanel" }>> = {}): InspectorContext => ({
    kind: "infopanel",
    groups: ipGroups(item.kind as Parameters<typeof ipGroups>[0]),
    group: item.kind === "Group",
    bound: false,
    unknown: false,
    ...over,
  });

  it("has no tabs", () => {
    expect(inspectorTabs(ctx(bar))).toEqual([]);
  });

  it("orders Draw as, Position (with the group's other fields), Sensor, the kind's groups, Unknown", () => {
    const ids = allSections(ctx(bar, { bound: true, unknown: true })).map((s) => s.id);
    expect(ids.slice(0, 3)).toEqual(["ip-mode", "ip-position", "ip-binding"]);
    // The raw binding fields are their own (advanced) section, never merged into Sensor.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe("ip-unknown");
    expect(ids.filter((id) => id === "ip-position")).toHaveLength(1);
    expect(ids).toContain("ip-colours");
  });

  it("gives a group no mode or position section, and no sensor when unbound", () => {
    const ids = allSections(ctx(group)).map((s) => s.id);
    expect(ids).not.toContain("ip-mode");
    expect(ids).not.toContain("ip-binding");
    expect(ids.some((id) => id.startsWith("ip-"))).toBe(true);
  });
});
