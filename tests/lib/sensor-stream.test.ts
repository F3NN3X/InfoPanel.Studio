import { describe, expect, it } from "vitest";
import { mergeEvent, namespaceOf, planStreams, sameSensor, touches } from "@/lib/sensor-stream";

const v = (value: number, extra: object = {}) => ({ value, unit: "%", ...extra });

describe("sameSensor", () => {
  it("compares every rendered field", () => {
    expect(sameSensor(v(1), v(1))).toBe(true);
    expect(sameSensor(v(1), v(2))).toBe(false);
    expect(sameSensor(v(1), v(1, { max: 5 }))).toBe(false);
    expect(sameSensor({ text: "a", unit: "" }, { text: "b", unit: "" })).toBe(false);
    expect(sameSensor(undefined, v(1))).toBe(false);
    expect(sameSensor(undefined, undefined)).toBe(true);
  });
});

describe("mergeEvent", () => {
  const prev = { "a.x": v(1), "a.y": v(2), "b.z": v(3) };

  it("returns the same map when nothing changed", () => {
    const { values, changed } = mergeEvent(prev, { timestamp: 1, sensors: { "a.x": v(1) } }, null);
    expect(values).toBe(prev);
    expect(changed).toEqual([]);
  });

  it("copies on write and keeps unchanged objects", () => {
    const { values, changed } = mergeEvent(prev, { timestamp: 1, sensors: { "a.x": v(9) } }, null);
    expect(values).not.toBe(prev);
    expect(prev["a.x"].value).toBe(1);
    expect(values["a.x"].value).toBe(9);
    expect(values["a.y"]).toBe(prev["a.y"]);
    expect(changed).toEqual(["a.x"]);
  });

  it("adds new keys and drops removed ones", () => {
    const { values, changed } = mergeEvent(
      prev,
      { timestamp: 1, sensors: { "a.n": v(4) }, removed: ["a.y", "missing"] },
      null
    );
    expect(values["a.n"].value).toBe(4);
    expect("a.y" in values).toBe(false);
    expect(changed.sort()).toEqual(["a.n", "a.y"]);
  });

  it("on a reset drops keys under the prefix the full set lacks, and only those", () => {
    const { values, changed } = mergeEvent(prev, { timestamp: 1, sensors: { "a.x": v(1) } }, "a.");
    expect(Object.keys(values).sort()).toEqual(["a.x", "b.z"]);
    expect(changed).toEqual(["a.y"]);
  });

  it("tolerates a message without sensors", () => {
    expect(mergeEvent(prev, { timestamp: 1 }, null).values).toBe(prev);
  });
});

describe("namespaceOf", () => {
  it("maps plugin keys to their plugin and others to the top level", () => {
    expect(namespaceOf("plugins.media-plugin.media.title")).toBe("plugins.media-plugin.");
    expect(namespaceOf("plugins.yr-weather-plugin.")).toBe("plugins.yr-weather-plugin.");
    expect(namespaceOf("plugins.InfoPanel.SteamAPI.")).toBe("plugins.InfoPanel.");
    expect(namespaceOf("plugins.")).toBe("plugins.");
    expect(namespaceOf("libre.cpu_load")).toBe("libre.");
    expect(namespaceOf("system.cpu.")).toBe("system.");
  });
});

describe("planStreams", () => {
  it("keeps namespaces apart within the limit", () => {
    expect(planStreams(["system.", "plugins.a.", "plugins.b."], 4)).toEqual([
      "plugins.a.",
      "plugins.b.",
      "system.",
    ]);
  });

  it("folds plugin namespaces past the limit", () => {
    expect(planStreams(["system.", "libre.", "plugins.a.", "plugins.b.", "plugins.c."], 4)).toEqual([
      "libre.",
      "plugins.",
      "system.",
    ]);
  });

  it("falls back to the unfiltered stream when folding is not enough", () => {
    expect(planStreams(["a.", "b.", "c.", "d.", "plugins.x."], 4)).toEqual([""]);
  });

  it("lets plugins. cover the plugin namespaces", () => {
    expect(planStreams(["plugins.", "plugins.a.", "libre."], 4)).toEqual(["libre.", "plugins."]);
  });
});

describe("touches", () => {
  it("matches changed keys against prefixes", () => {
    expect(touches(["a.x"], ["a."])).toBe(true);
    expect(touches(["a.x"], ["b."])).toBe(false);
    expect(touches(["a.x"], null)).toBe(true);
    expect(touches([], null)).toBe(false);
    expect(touches(["a.x"], [])).toBe(false);
  });
});
