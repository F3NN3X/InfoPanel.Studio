import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { pickModules } from "@/widgets/widget-qa/plan";

describe("widget-qa parity", () => {
  it("lists every registered widget, so a new one is on the page the day it is added", () => {
    const listed = pickModules(modules, TEMPLATE_MODULES).map((m) => m.id).sort();
    expect(listed).toEqual(modules.map((m) => m.id).sort());
  });

  it("shows exactly the module= ids when given, legacy ones included", () => {
    expect(pickModules(modules, TEMPLATE_MODULES, ["StreamDeck", "CpuMonitor"]).map((m) => m.id).sort()).toEqual(["CpuMonitor", "StreamDeck"]);
  });
});
