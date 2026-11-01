import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { DEFAULT_STATE, widgetLinks } from "@/widgets/widget-qa/params";
import { gallerySpan, pickModules, viewPlans } from "@/widgets/widget-qa/plan";

describe("widget-qa parity", () => {
  it("lists every registered widget, so a new one is on the page the day it is added", () => {
    const listed = pickModules(modules, TEMPLATE_MODULES).map((m) => m.id).sort();
    expect(listed).toEqual(modules.map((m) => m.id).sort());
  });

  it("gives a widget with views a row of them, each at its size and no smaller than its minimum, picked by the view key", () => {
    const mod = {
      viewKey: "layout",
      defaultSize: [3, 2] as [number, number],
      minCols: 2,
      minRows: 1,
      views: [
        { id: "a", name: "A" },
        { id: "b", name: "B", defaultSize: [1, 1] as [number, number], applies: { sparkline: true } },
        { id: "c", name: "C", defaultSize: [1, 1] as [number, number], minSize: [1, 1] as [number, number] },
      ],
    };
    expect(viewPlans(mod)).toEqual([
      { id: "a", name: "A", c: 3, r: 2, settings: { layout: "a" } },
      { id: "b", name: "B", c: 2, r: 1, settings: { sparkline: true, layout: "b" } },
      { id: "c", name: "C", c: 1, r: 1, settings: { layout: "c" } },
    ]);
    expect(viewPlans({ ...mod, views: [mod.views[0]] })).toEqual([]);
    // Every registered view is planned within its widget's minimum.
    for (const m of modules) for (const v of viewPlans(m)) expect(v.c >= 1 && v.r >= 1).toBe(true);
  });

  it("sizes a gallery to the widget's default, never under its minimum, and links each widget to itself and its galleries", () => {
    expect(gallerySpan({ defaultSize: [1, 1], minCols: 2, minRows: 2 }, [3, 2])).toEqual([2, 2]);
    expect(gallerySpan({}, [3, 2])).toEqual([3, 2]);
    const links = widgetLinks({ ...DEFAULT_STATE, skin: "cyber", q: "deck" }, "StreamDeck");
    expect(links.solo).toBe("?widget-qa&module=StreamDeck&skin=cyber");
    expect(links.skins).toBe("?widget-qa&skin=cyber&q=deck&gallery=StreamDeck#galleries");
  });

  it("shows exactly the module= ids when given, legacy ones included", () => {
    expect(pickModules(modules, TEMPLATE_MODULES, ["StreamDeck", "CpuMonitor"]).map((m) => m.id).sort()).toEqual(["CpuMonitor", "StreamDeck"]);
  });
});
