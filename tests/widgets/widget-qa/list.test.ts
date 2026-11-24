import { describe, expect, it } from "vitest";
import type { DashboardModule } from "@/modules/types";
import { linkedWidget, listGroups, rowHidden, rowStatus, stepWidget } from "@/widgets/widget-qa/list";
import type { Section } from "@/widgets/widget-qa/plan";

const mod = (id: string, title = id) => ({ id, title }) as DashboardModule;
const sections: Section[] = [
  { category: "System", id: "cat-system", mods: [mod("CpuMonitor", "CPU"), mod("FramePacing", "Frame Pacing")] },
  { category: "Time", id: "cat-time", mods: [mod("Clock")] },
  { category: "Media", id: "cat-media", mods: [mod("NowPlayingMini", "Now Playing Mini")] },
];
const merged = new Map([
  ["FramePacing", "FPS Monitor"],
  ["NowPlayingMini", "Now Playing"],
]);

describe("widget-qa widget list", () => {
  it("lists each category's own widgets, and the merged-away ones last in a group of their own, each naming its survivor", () => {
    expect(listGroups(sections, merged)).toEqual([
      { id: "cat-system", title: "System", rows: [{ id: "CpuMonitor", title: "CPU" }] },
      { id: "cat-time", title: "Time", rows: [{ id: "Clock", title: "Clock" }] },
      {
        id: "merged",
        title: "Merged away",
        rows: [
          { id: "FramePacing", title: "Frame Pacing", mergedInto: "FPS Monitor" },
          { id: "NowPlayingMini", title: "Now Playing Mini", mergedInto: "Now Playing" },
        ],
      },
    ]);
    // no merged widget shown: no group for them
    expect(listGroups(sections.slice(1, 2), merged).map((g) => g.id)).toEqual(["cat-time"]);
  });

  it("dots a widget red for an issue before amber for a flag, and leaves one not read yet unchecked", () => {
    expect(rowStatus(undefined)).toBe("unchecked");
    expect(rowStatus({ checked: 0, issues: 0, flags: 0 })).toBe("unchecked");
    expect(rowStatus({ checked: 2, issues: 1, flags: 3 })).toBe("issues");
    expect(rowStatus({ checked: 2, issues: 0, flags: 3 })).toBe("flags");
    expect(rowStatus({ checked: 2, issues: 0, flags: 0 })).toBe("clean");
  });

  it("hides a row as the page hides its widget: clean under Issues, and clean under Theme flags only while the check runs", () => {
    const clean = { checked: 3, issues: 0, flags: 0 };
    const off = { issues: false, flagged: false, flagsChecked: true };
    expect(rowHidden(clean, off)).toBe(false);
    expect(rowHidden(clean, { ...off, issues: true })).toBe(true);
    expect(rowHidden({ ...clean, issues: 1 }, { ...off, issues: true })).toBe(false);
    expect(rowHidden(undefined, { ...off, issues: true })).toBe(false);
    expect(rowHidden(clean, { ...off, flagged: true })).toBe(true);
    // with no Look worn nothing is flag-checked, so the page hides nothing for it and neither does the list
    expect(rowHidden(clean, { ...off, flagged: true, flagsChecked: false })).toBe(false);
  });

  it("steps j and k through the rows, from the first or the last when none is current, and holds at the ends", () => {
    const ids = ["A", "B", "C"];
    expect(stepWidget(ids, "", 1)).toBe("A");
    expect(stepWidget(ids, "", -1)).toBe("C");
    expect(stepWidget(ids, "A", 1)).toBe("B");
    expect(stepWidget(ids, "C", 1)).toBe("C");
    expect(stepWidget(ids, "A", -1)).toBe("A");
    // a current widget the filters took out starts again from an end
    expect(stepWidget(ids, "Z", 1)).toBe("A");
    expect(stepWidget([], "A", 1)).toBeUndefined();
  });

  it("starts from the widget a link names: its section, one of its frames, or the one module= widget", () => {
    expect(linkedWidget("#CpuMonitor", undefined)).toBe("CpuMonitor");
    expect(linkedWidget("#CpuMonitor--view-gauge", undefined)).toBe("CpuMonitor");
    expect(linkedWidget("", ["Clock"])).toBe("Clock");
    expect(linkedWidget("", ["Clock", "CpuMonitor"])).toBe("");
    for (const anchor of ["#cat-system", "#galleries", "#surfaces"]) expect(linkedWidget(anchor, undefined)).toBe("");
  });
});
