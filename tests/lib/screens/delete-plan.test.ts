import { describe, expect, it } from "vitest";
import { withoutProfile } from "@/components/studio/profile-actions";
import { launchRule } from "@/components/studio/screens-model";
import { CANVAS_ID, defaultConfig, newProfile, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { deleteLines, deletePlan } from "@/lib/screens/delete-plan";

const zone = (id: string, module: string) => ({ id, module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true });
const withZones = (id: string, modules: string[]): MonitorProfile => {
  const base = newProfile(id, 1920, 480);
  return { ...base, id, pages: [{ ...base.pages[0], placements: modules.map((m, i) => zone(`${id}${i}`, m)) }, { id: "p2", name: "Two", placements: [] }] };
};
const config = (activeProfile: string, ids = ["a", "b"]): DashboardConfig => ({
  ...defaultConfig(),
  activeProfile,
  profiles: ids.map((id) => withZones(id, id === "a" ? [CANVAS_ID, "Clock"] : ["Clock"])),
});

describe("deletePlan", () => {
  it("counts what goes: pages, zones and InfoPanel canvases", () => {
    expect(deletePlan(config("auto"), "a")).toMatchObject({ name: "a", allowed: true, pages: 2, zones: 2, canvases: 1, launch: false, kiosks: 0 });
  });
  it("refuses the last screen", () => {
    expect(deletePlan(config("auto", ["a"]), "a")?.allowed).toBe(false);
  });
  it("flags the launch screen and counts the kiosks showing it", () => {
    expect(deletePlan(config("a"), "a", ["a", "b", "a"])).toMatchObject({ launch: true, kiosks: 2 });
    expect(deletePlan(config("a"), "b")).toMatchObject({ launch: false });
  });
  it("is null for an unknown screen", () => {
    expect(deletePlan(config("auto"), "nope")).toBeNull();
  });
  it("tells the user what goes, the launch fallback, the kiosks and the undo", () => {
    const text = deleteLines(deletePlan(config("a"), "a", ["a"])!).join("\n");
    expect(text).toContain("2 pages, 2 zones, 1 InfoPanel canvas");
    expect(text).toContain("best fit");
    expect(text).toContain("1 kiosk shows it");
    expect(text).toContain("Undo");
  });
});

describe("the rules the plan describes, as the delete applies them", () => {
  it("never deletes the last screen", () => {
    const only = config("auto", ["a"]);
    expect(withoutProfile(only, "a")).toBe(only);
  });
  it("deleting the launch screen falls back to Best fit; deleting another leaves the launch screen", () => {
    const gone = withoutProfile(config("a"), "a");
    expect(gone.activeProfile).toBe("auto");
    expect(launchRule(gone)).toBe("auto");
    expect(withoutProfile(config("a"), "b").activeProfile).toBe("a");
  });
});
