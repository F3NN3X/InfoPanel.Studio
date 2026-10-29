import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { FAN_MAX_RPM, oneEditorFixture } from "@/dev/fixtures/one-editor";
import { fraction } from "@/lib/infopanel/gauges/vector";
import capture from "../../lib/infopanel/__fixtures__/hwinfo-capture.json";
import { FIXTURE_NAMES } from "@/dev/fixtures/types";
import { openCanvas } from "@/lib/infopanel/canvas";
import { itemAt } from "@/lib/infopanel/editor/ops";
import { widgetBox, widgetOf } from "@/lib/infopanel/native/widget-item";
import { CANVAS_ID } from "@/lib/layout";
import { isFreePage } from "@/lib/free-pages";
import { exportCheck } from "@/lib/infopanel/export-check";

// The eight Edit v3 reference states the Playwright specs open: each must name a screen, page and selection that exist.

describe("the one-editor fixtures", () => {
  it("has a fixture for every name and none for another", () => {
    for (const name of FIXTURE_NAMES) expect(oneEditorFixture(name), name).toBeDefined();
    expect(oneEditorFixture("nope")).toBeUndefined();
    expect(oneEditorFixture("toString")).toBeUndefined();
  });

  it.each(FIXTURE_NAMES)("%s: its route, selection and config resolve", (name) => {
    const fixture = oneEditorFixture(name)!;
    const profile = fixture.config.profiles.find((p) => p.id === fixture.route.profileId)!;
    const page = profile.pages.find((p) => p.id === fixture.route.pageId)!;
    expect(page).toBeDefined();
    expect(fixture.config.activeProfile).toBe(profile.id);
    // A selected id is a part on the page or one of its groups (layersG opens with Overlay selected).
    for (const id of fixture.selection) expect(page.placements.some((p) => p.id === id) || (page.groups ?? []).some((g) => g.id === id), id).toBe(true);
    // A saved config merged back keeps every placement and canvas.
    const merged = upgradeConfig(JSON.parse(JSON.stringify(fixture.config)));
    expect(merged.profiles[0].pages[0].placements.map((p) => p.id)).toEqual(page.placements.map((p) => p.id));
  });

  it("Desk panel holds its five widgets on the 4 x 3 grid", () => {
    const { config } = oneEditorFixture("screen")!;
    const [desk] = config.profiles;
    expect([desk.width, desk.height, desk.cols, desk.rows]).toEqual([1024, 600, 4, 3]);
    expect(desk.pages[0].placements.map((p) => [p.colStart, p.rowStart, p.colSpan, p.rowSpan])).toEqual([[1, 1, 2, 2], [3, 1, 2, 2], [1, 3, 1, 1], [2, 3, 1, 1], [3, 3, 2, 1]]);
    expect(oneEditorFixture("export")!.config.profiles[0].madeFor).toBe("infopanel");
    expect(desk.madeFor).toBe("studio");
  });

  it("Neon Rig is an imported 800 x 480 Free page; the selected item exists in its canvas", () => {
    const fixture = oneEditorFixture("profile")!;
    const [neon] = fixture.config.profiles;
    expect([neon.width, neon.height, neon.cols, neon.rows, neon.madeFor, isFreePage(neon, neon.pages[0])]).toEqual([800, 480, 8, 5, "infopanel", true]);
    const zone = neon.pages[0].placements[0];
    expect(zone.module).toBe(CANVAS_ID);
    const items = openCanvas(zone.canvas!).items;
    expect(fixture.canvasSelection).toHaveLength(1);
    expect(itemAt(items, fixture.canvasSelection![0])?.Name).toBe("CPU temp");
  });

  it("Neon Rig's check reads 7 as is and 1 approximated: NEON RIG's letter spacing (acceptance 24)", () => {
    const [neon] = oneEditorFixture("profile")!.config.profiles;
    const check = exportCheck(neon, neon.pages[0]);
    expect(check.counts).toEqual({ ok: 7, approx: 1, pic: 0, out: 0 });
    expect(check.rows.find((r) => r.status === "approx")).toMatchObject({ name: "NEON RIG", why: "Letter spacing (5 px) is dropped" });
  });

  it("the Add state has Weather at COL 7 ROW 5 W 2 H 1's box, and Layers F nests it with the Fan gauge", () => {
    const items = (name: string) => openCanvas(oneEditorFixture(name)!.config.profiles[0].pages[0].placements[0].canvas!).items;
    const added = items("addw").at(-1)!;
    expect(widgetOf(added)?.module).toBe("Weather");
    expect(widgetBox(added)).toMatchObject({ x: 600, y: 384, w: 200, h: 96 });
    // v15: its cells are stored, in step with the box.
    expect(widgetOf(added)?.cell).toEqual({ col: 7, row: 5, cols: 2, rows: 1 });
    const right = items("layersF").find((i) => i.Name === "Right column");
    expect(right?.kind === "Group" && right.DisplayItems.map((i) => i.Name)).toEqual(["Fan gauge", "Weather"]);
  });

  // Sign-off round 3: the Fan gauge's range holds the capture's fan reading, so its ring shows it rather than a full one.
  it("Neon Rig's Fan gauge reads the capture's fan inside its range", () => {
    const fan = openCanvas(oneEditorFixture("profile")!.config.profiles[0].pages[0].placements[0].canvas!).items.find((i) => i.Name === "Fan gauge");
    expect(fan?.kind).toBe("Gauge");
    if (fan?.kind !== "Gauge") return;
    const rpm = capture["hwinfo.gpu_fan1"].value;
    expect(fraction(rpm, fan.MinValue, fan.MaxValue)).toBeGreaterThan(0.2);
    expect(fraction(rpm, fan.MinValue, fan.MaxValue)).toBeLessThan(1);
    expect(fan.MaxValue).toBe(FAN_MAX_RPM);
  });

  // Sign-off round 1: each state opens as its reference does.
  it("opens alt, layersF, layersG and addw on the reference's selection", () => {
    const alt = oneEditorFixture("alt")!;
    const altPage = alt.config.profiles[0].pages[0];
    expect(alt.selection).toEqual(["title"]);
    expect(altPage.groups ?? []).toEqual([]);
    expect(altPage.placements.find((p) => p.id === "title")?.groupId).toBeUndefined();
    expect(oneEditorFixture("layersG")!.selection).toEqual(["overlay"]);
    const layersF = oneEditorFixture("layersF")!;
    const items = openCanvas(layersF.config.profiles[0].pages[0].placements[0].canvas!).items;
    expect(itemAt(items, layersF.canvasSelection![0])?.Name).toBe("Weather");
    expect(oneEditorFixture("addw")!.added).toBe("Weather");
  });
});
