import { describe, expect, it } from "vitest";
import { activeChanges, overrideCount, settingsError } from "@/widgets/widget-qa/changes";
import { DEFAULT_STATE, parseParams, serializeParams, type QaState } from "@/widgets/widget-qa/params";

const at = (search: string) => parseParams(`?widget-qa&${search}`);
/** The state after each chip's ×, one at a time. */
const cleared = (s: QaState) => activeChanges(s).map((c) => ({ ...s, ...c.clear }));

describe("widget-qa active changes", () => {
  it("is empty at the default state, so the row is not drawn", () => {
    expect(activeChanges(DEFAULT_STATE)).toEqual([]);
    expect(activeChanges(parseParams("?widget-qa"))).toEqual([]);
  });

  it("names every param away from its default, and each × puts exactly that one back", () => {
    const s = at("module=CpuMonitor,Clock&spans=2x2&cell=150&gap=4&skin=cyber&variant=studio&surface=glass&graph=line&meter=pill&accent=%234ade80&radius=lg&theme=paper&settings=%7B%7D&data=stress&q=cpu&gallery=Clock&eager=1&grid=1&noted=1&look=cyberspec&lookVariant=crimson&fx=calm&script=0&flagged=1&surfaces=0&issues=1&below=1&focus=Clock");
    const changes = activeChanges(s, { look: "Cyberspec", variant: "Crimson" });
    expect(changes.map((c) => c.label)).toEqual([
      "Look: Cyberspec · Crimson",
      "Effects: Calm",
      "Pack script off",
      "Skin: cyber",
      "Density: Dense",
      "Surface: glass",
      "Graph style: line",
      "Meter style: pill",
      "Accent: #4ade80",
      "Corners: lg",
      "Settings: {}",
      "Cell 150",
      "Gap 4",
      "Sizes: 2x2",
      "Grid drawn",
      "Data: Stress (reloads)",
      "Page background: paper",
      "Galleries: Clock",
      "App surfaces hidden",
      "Mount every frame",
      "Only: CpuMonitor, Clock",
      "Filter: cpu",
      "Theme flags only",
      "Notes only",
      "Issues only",
      "Sizes under the minimum shown",
      "Focus: Clock",
    ]);
    // every param the URL carries has a chip: clearing them all leaves the bare page
    const all: QaState = Object.assign({ ...s }, ...changes.map((c) => c.clear));
    expect(serializeParams(all)).toBe("?widget-qa");
    // and each × drops one chip, and only its own
    for (const [i, next] of cleared(s).entries()) expect(activeChanges(next).map((c) => c.key)).toEqual(changes.filter((_, j) => j !== i).map((c) => c.key));
  });

  it("clears a Look with its variant, and names a Look by its id until its name has loaded", () => {
    const s = at("look=cyberspec&lookVariant=crimson");
    expect(activeChanges(s).map((c) => c.label)).toEqual(["Look: cyberspec · crimson"]);
    expect(activeChanges(s)[0].clear).toEqual({ look: "", lookVariant: "" });
    expect(activeChanges(at("look=term")).map((c) => c.label)).toEqual(["Look: term"]);
  });

  it("shortens a long settings JSON in its chip", () => {
    const [chip] = activeChanges(at(`settings=${encodeURIComponent(JSON.stringify({ surface: "glass", accent: "#ff0000", radius: "lg" }))}`));
    expect(chip.label.length).toBeLessThanOrEqual("Settings: ".length + 32);
    expect(chip.label.endsWith("…")).toBe(true);
  });
});

describe("widget-qa overrides", () => {
  it("counts the overrides that go over every placement, the raw settings included", () => {
    expect(overrideCount(DEFAULT_STATE)).toBe(0);
    expect(overrideCount(at("skin=cyber&accent=%23f87171&settings=%7B%7D"))).toBe(3);
    // the Look, the grid and the data are not overrides
    expect(overrideCount(at("look=term&cell=150&data=stress"))).toBe(0);
  });

  it("applies only a settings JSON that parses to an object, and says why another does not", () => {
    expect(settingsError("")).toBeUndefined();
    expect(settingsError('{"surface":"glass"}')).toBeUndefined();
    expect(settingsError('{"surface":')).toMatch(/JSON|Unexpected|end/i);
    expect(settingsError("[1]")).toMatch(/not an object/);
    expect(settingsError("3")).toMatch(/not an object/);
  });
});
