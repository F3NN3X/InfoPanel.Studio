import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { LAYOUT_KEY, LAYOUTS, layoutOf, layoutSetting, STANDARD_LAYOUT } from "@/widgets/layouts";

// The layout variants (look.json `layouts`): the registry the validator reads is the widgets' own `meta.layouts`, a zone draws the
// user's pick over the Look's, and a Look that names none (every pack but Cyberspec, every old config) draws the standard layouts.
describe("the layout registry", () => {
  it("lists every widget that declares layouts, each starting with the standard one", () => {
    const declared = modules.filter((m) => (m.settings ?? []).some((s) => s.key === LAYOUT_KEY)).map((m) => m.id).sort();
    const widgets = Object.keys(LAYOUTS).filter((k) => k !== "alert" && k !== "island").sort();
    expect(declared).toEqual(widgets);
    for (const [kind, list] of Object.entries(LAYOUTS)) {
      expect(list[0]?.id, kind).toBe(STANDARD_LAYOUT);
      expect(list.length, kind).toBeGreaterThan(1);
      expect(new Set(list.map((l) => l.id)).size, kind).toBe(list.length);
    }
  });

  it("gives a widget with layouts the Layout row (Theme's choice first) and every other widget none", () => {
    const cal = modules.find((m) => m.id === "Calendar")?.settings?.find((s) => s.key === LAYOUT_KEY);
    expect(cal?.default).toBe("auto");
    expect(cal?.options?.map((o) => o.value)).toEqual(["auto", "standard", "grid-nav"]);
    expect((modules.find((m) => m.id === "Clock")?.settings ?? []).some((s) => s.key === LAYOUT_KEY)).toBe(false);
    expect(layoutSetting(LAYOUTS.alert).options?.[0]).toEqual({ value: "auto", label: "Theme's choice" });
  });
});

describe("layoutOf", () => {
  const looks = { Calendar: "grid-nav", SensorValue: "nope", alert: "slab" };
  it("is the Look's layout for a kind it names, and nothing (the standard layout) otherwise", () => {
    expect(layoutOf("Calendar", looks)).toBe("grid-nav");
    expect(layoutOf("alert", looks)).toBe("slab");
    expect(layoutOf("Calendar", undefined)).toBeUndefined();
    expect(layoutOf("DayPlanner", looks)).toBeUndefined();
    // an id the kind does not offer, a kind that offers none, a prototype key
    expect(layoutOf("SensorValue", looks)).toBeUndefined();
    expect(layoutOf("Clock", { Clock: "grid-nav" })).toBeUndefined();
    expect(layoutOf("toString", JSON.parse('{"toString":"standard"}'))).toBeUndefined();
    expect(layoutOf("Calendar", { Calendar: STANDARD_LAYOUT })).toBeUndefined();
  });

  it("takes the user's pick over the Look's: Auto follows it, Standard keeps today's, a stale value is ignored", () => {
    expect(layoutOf("Calendar", looks, "auto")).toBe("grid-nav");
    expect(layoutOf("Calendar", looks, STANDARD_LAYOUT)).toBeUndefined();
    expect(layoutOf("Calendar", undefined, "grid-nav")).toBe("grid-nav");
    expect(layoutOf("Calendar", looks, "gone")).toBe("grid-nav");
    expect(layoutOf("Calendar", looks, 3)).toBe("grid-nav");
  });
});

describe("the built-in packs", () => {
  const dir = "src/looks/packs";
  const named = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const look = JSON.parse(readFileSync(`${dir}/${d.name}/look.json`, "utf8")) as { layouts?: Record<string, string> };
      return look.layouts ? [d.name] : [];
    });

  it("leave the layouts alone but for Cyberspec, so they draw as before", () => {
    expect(named).toEqual(["cyberspec"]);
  });
});
