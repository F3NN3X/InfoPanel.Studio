import { describe, expect, it } from "vitest";
import { rebindChosen, sensorOfCatalog } from "@/lib/infopanel/editor/bind.ts";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import { bindingRef, type BoundItem } from "@/lib/infopanel/sensors.ts";

const items = parseDisplayItemsXml(
  '<ArrayOfDisplayItem xmlns:xsi="x">' +
    '<DisplayItem xsi:type="SensorDisplayItem"><SensorName>CPU</SensorName><SensorType>Libre</SensorType><LibreSensorId>/cpu/0</LibreSensorId></DisplayItem>' +
    '<DisplayItem xsi:type="GroupDisplayItem"><DisplayItems><DisplayItem xsi:type="BarDisplayItem"><SensorName>GPU</SensorName><SensorType>Libre</SensorType><LibreSensorId>/gpu/0</LibreSensorId></DisplayItem></DisplayItems></DisplayItem>' +
    "</ArrayOfDisplayItem>",
).items;
const sensorOf = sensorOfCatalog({ "plugins.p.c.fps": { name: "FPS", ref: "plugin:/p/c/fps" } });

describe("rebindChosen (the import's remap choices)", () => {
  it("writes a chosen sensor into the native binding, inside groups too, and keeps each record", () => {
    const r = rebindChosen(items, () => ({ key: "plugins.p.c.fps", via: "chosen" }), sensorOf);
    const [cpu, group] = r.items;
    const bar = (group as Extract<typeof group, { kind: "Group" }>).DisplayItems[0];
    for (const item of [cpu, bar]) {
      expect(bindingRef(item as BoundItem)).toBe("plugin:/p/c/fps");
      expect(r.keyOf(item)).toEqual({ key: "plugins.p.c.fps", via: "chosen" });
    }
  });

  it("leaves automatic matches, left unbound, and unknown keys as they were", () => {
    for (const rec of [{ key: "plugins.p.c.fps", via: "exact" as const }, { via: "unbound" as const }, { key: "nope", via: "chosen" as const }]) {
      const r = rebindChosen(items, () => rec, sensorOf);
      expect(bindingRef(r.items[0] as BoundItem)).toBe("libre:/cpu/0");
      expect(r.keyOf(r.items[0])).toEqual(rec);
    }
  });
});
