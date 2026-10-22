import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import type { ModuleSetting } from "@/modules/types";
import { buildCommands, matchScore, rankCommands, type CommandState } from "@/components/studio/commands";

const zone = (id: string, colStart: number, rowStart: number, visible = true): Placement => ({
  id,
  module: "blank",
  colStart,
  rowStart,
  colSpan: 1,
  rowSpan: 1,
  visible,
});

const setting = (key: string, label: string, group?: string): ModuleSetting => ({
  key,
  label,
  type: "number",
  default: 0,
  group,
});

const base: CommandState = {
  insertables: [
    { kind: "module", id: "SystemOverview", title: "System Overview" },
    { kind: "panel", id: "cpu", title: "CPU" },
  ],
  profiles: [{ id: "p1", name: "Desk", width: 1920, height: 1080 }],
  pages: [{ id: "main", name: "Main" }],
  currentPage: "main",
  placements: [zone("b", 3, 2), zone("a", 1, 1)],
  selected: null,
  context: null,
  widget: null,
  canPasteWidget: false,
  canUndo: false,
  canRedo: false,
  showGrid: true,
  enforced: false,
  appearancePresets: [],
};

const ids = (state: CommandState) => buildCommands(state).map((c) => c.id);

describe("buildCommands", () => {
  it("offers adding every widget and panel, profiles with Auto, and zones in reading order", () => {
    const list = ids(base);
    expect(list).toContain("add:module:SystemOverview");
    expect(list).toContain("add:panel:cpu");
    expect(list).toContain("profile:auto");
    expect(list).toContain("profile:p1");
    expect(list.filter((id) => id.startsWith("select:"))).toEqual(["select:a", "select:b"]);
    for (const id of ["save", "export", "import", "shortcuts", "grid", "zoom-fit"]) {
      expect(list).toContain(id);
    }
    expect(list).toContain("drawer:add");
    // One entry per destination, plus Live, Manage screens and Help (SPEC §13), and none of the retired "Open drawer" ones.
    for (const id of ["live", "manage-screens", "help", "go:design", "go:library", "go:data", "go:alerts", "go:settings:app", "theme", "settings"]) {
      expect(list).toContain(id);
    }
    expect(list.filter((id) => id.startsWith("drawer:"))).toEqual(["drawer:add", "drawer:layers"]);
  });

  it("lists undo / redo only when there is something to undo / redo", () => {
    expect(ids(base)).not.toContain("undo");
    expect(ids(base)).not.toContain("redo");
    const list = ids({ ...base, canUndo: true, canRedo: true });
    expect(list).toContain("undo");
    expect(list).toContain("redo");
  });

  it("adds the selected zone's actions and its settings and the card jumps", () => {
    const glow: ModuleSetting = { ...setting("glow", "Glow", "Border, glow & CSS"), section: "border" };
    const threshold = setting("warnAt", "Warn at", "Thresholds");
    const commands = buildCommands({
      ...base,
      selected: zone("a", 1, 1, false),
      context: { kind: "widget", defs: [glow, threshold] },
    });
    const byId = new Map(commands.map((c) => [c.id, c]));
    expect(byId.get("zone:visible")?.label).toBe("Show zone");
    expect(byId.has("zone:duplicate")).toBe(true);
    expect(byId.has("zone:remove")).toBe(true);
    expect(byId.has("zone:pick")).toBe(true);
    const glowId = [...byId.keys()].find((id) => id.endsWith(":glow"))!;
    expect(byId.get(glowId)?.action).toMatchObject({ type: "goto-setting", key: "glow" });
    expect(byId.get(glowId)?.hint).toBe("Border & glow");
    expect(byId.get("zone:card:colors")?.action).toEqual({ type: "goto-card", id: "colors" });
    const warnId = [...byId.keys()].find((id) => id.endsWith(":warnAt"))!;
    expect(byId.get(warnId)?.action).toMatchObject({ type: "goto-setting", key: "warnAt" });
    expect(byId.get(warnId)?.hint).toBe("Thresholds");
  });

});

describe("matchScore / rankCommands", () => {
  it("ranks prefix over word start over substring", () => {
    expect(matchScore("System", "sys")).toBe(3);
    expect(matchScore("Add widget: System", "sys")).toBe(2);
    expect(matchScore("Filesystem", "sys")).toBe(1);
    expect(matchScore("Add widget: System", "add sys")).toBe(0.5);
    expect(matchScore("Zoom in", "sys")).toBe(0);
  });

  it("filters and orders commands, keeping the original order for ties", () => {
    const commands = buildCommands(base);
    const ranked = rankCommands(commands, "sys");
    expect(ranked[0].id).toBe("add:module:SystemOverview");
    expect(ranked.every((c) => matchScore(c.label, "sys") > 0)).toBe(true);
    expect(rankCommands(commands, "  ")).toEqual(commands);
    expect(rankCommands(commands, "zoom").map((c) => c.id)).toEqual(["zoom-fit", "zoom-in", "zoom-out"]);
  });

});

describe("buildCommands with several zones selected", () => {
  const a = zone("a", 1, 1);
  const b = zone("b", 3, 2, false);

  it("offers hide, duplicate and remove for the whole selection only", () => {
    const list = buildCommands({ ...base, selected: b, selection: [a, b] });
    const group = list.filter((c) => c.group === "Selected zones");
    expect(group.map((c) => c.label)).toEqual(["Duplicate 2 zones", "Hide 2 zones", "Remove 2 zones"]);
    expect(list.some((c) => c.id === "zone:pick")).toBe(false);
  });

});

describe("buildCommands page commands", () => {
  const two = { ...base, pages: [{ id: "main", name: "Main" }, { id: "g", name: "Games" }] };
  const pageIds = (state: CommandState) => ids(state).filter((id) => id.startsWith("page:"));

  it("offers going to each page, adding, duplicating and renaming; no stepping or deleting with one page", () => {
    expect(pageIds(base)).toEqual(["page:go:main", "page:add", "page:duplicate", "page:rename"]);
  });

  it("adds next, previous and delete with several pages", () => {
    expect(pageIds(two)).toEqual([
      "page:go:main",
      "page:go:g",
      "page:add",
      "page:next",
      "page:prev",
      "page:duplicate",
      "page:rename",
      "page:delete",
    ]);
  });

});
