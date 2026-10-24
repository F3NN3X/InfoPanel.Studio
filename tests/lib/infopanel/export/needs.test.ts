import { describe, expect, it } from "vitest";
import { fontsToInstall, sensorNote, sensorSources } from "@/lib/infopanel/export/needs.ts";
import { defaultItem, type DisplayItem, type GroupItem } from "@/lib/infopanel/schema.ts";

const text = (Font: string): DisplayItem => ({ ...defaultItem("Text"), Font });
const bound = (kind: "Sensor" | "Bar" | "Gauge", over: Record<string, unknown>): DisplayItem => ({ ...defaultItem(kind), ...over }) as DisplayItem;

describe("fontsToInstall", () => {
  it("lists the families Windows doesn't ship, once each, from groups too", () => {
    const group: GroupItem = { ...defaultItem("Group"), DisplayItems: [text("barlow"), text("Segoe UI")] };
    expect(fontsToInstall([text("Barlow"), text("segoe ui"), text("JetBrains Mono"), text(""), text("  "), group])).toEqual(["Barlow", "JetBrains Mono"]);
  });

  it("is empty for items without a font or with Windows fonts only", () => {
    expect(fontsToInstall([defaultItem("Shape"), text("Arial"), text("Consolas")])).toEqual([]);
  });
});

describe("sensor sources", () => {
  const items = [
    bound("Sensor", { SensorType: "Libre", LibreSensorId: "/cpu/0/load/0" }),
    bound("Bar", { SensorType: "HwInfo", Id: 5 }),
    bound("Gauge", { SensorType: "Plugin", PluginSensorId: "/p/c/e" }),
    bound("Sensor", { SensorType: "Plugin", PluginSensorId: "" }),
  ];

  it("counts items per source and leaves out those with no sensor chosen", () => {
    expect(sensorSources(items)).toEqual({ hwinfo: 1, libre: 1, plugin: 1 });
  });

  it("says what the other PC needs, by source", () => {
    expect(sensorNote(sensorSources(items))).toBe(
      "Reads HWiNFO (1), LibreHardwareMonitor (1), plugin (1) sensors. HWiNFO sensors are matched by name on import; Libre and plugin sensors must exist on the other PC with the same ids.",
    );
    expect(sensorNote({ hwinfo: 2, libre: 0, plugin: 0 })).toBe("Reads HWiNFO (2) sensors. HWiNFO sensors are matched by name on import.");
    expect(sensorNote({ hwinfo: 0, libre: 0, plugin: 0 })).toBeNull();
  });
});
