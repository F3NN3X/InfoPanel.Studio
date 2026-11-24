import { describe, expect, it } from "vitest";
import { loadPack } from "@/looks/pack-load";
import type { Pack } from "@/looks/pack";
import { layoutNames, packParts } from "@/components/studio/theme-pack-model";

// Theme's "In this theme": the layouts a pack's Look names (look.json `layouts`) are a part of their own, by the kind's and the layout's names.
describe("the widget layouts part", () => {
  it("names each layout the Look sets, leaving out a standard or unknown one", () => {
    const pack = { look: { layouts: { Calendar: "grid-nav", alert: "slab", SensorValue: "standard", Clock: "x" } } } as unknown as Pack;
    expect(layoutNames(pack)).toEqual(["Calendar: Month navigator", "Alerts: Tone slab"]);
    expect(layoutNames(undefined)).toEqual([]);
  });

  it("is listed for Cyberspec and not for a pack that names none", async () => {
    const cyberspec = (await loadPack("cyberspec"))!;
    expect(packParts(cyberspec, cyberspec.look).find((p) => p.id === "layouts")?.value).toContain("Calendar: Month navigator");
    const paper = (await loadPack("paper"))!;
    expect(packParts(paper, paper.look).some((p) => p.id === "layouts")).toBe(false);
  });
});
