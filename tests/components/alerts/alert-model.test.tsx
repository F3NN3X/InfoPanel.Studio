import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { ActiveAlert } from "@/lib/alerts";
import type { ModuleInfo } from "@/lib/data-usage";
import { PANEL_ID, type Placement, type ProfileView } from "@/lib/layout";
import { AlertLayer, ZoneHighlights } from "@/components/alerts/alert-layer";
import {
  ageLabel,
  backdropOf,
  cardClasses,
  countdownFraction,
  groupBySlot,
  highlightZones,
  slotOf,
  visibleAlerts,
} from "@/components/alerts/alert-model";

const alert = (id: string, over: Partial<ActiveAlert> = {}, display: Partial<ActiveAlert["display"]> = {}): ActiveAlert => ({
  id,
  ruleId: "r",
  name: `Alert ${id}`,
  severity: "warning",
  text: "body",
  startedAt: 1000,
  acknowledged: false,
  display: { style: "toast", position: "top-right", backdrop: "none", size: "m", seconds: 10, ...display },
  ...over,
});

describe("visibleAlerts", () => {
  it("drops acknowledged and quiet alerts and other profiles", () => {
    const list = [
      alert("a"),
      alert("b", { acknowledged: true }),
      alert("c", { quiet: true }),
      alert("d", { profiles: ["p2"] }),
      alert("e", { profiles: ["p1"] }),
    ];
    expect(visibleAlerts(list, "p1").map((a) => a.id)).toEqual(["a", "e"]);
    expect(visibleAlerts(list, undefined).map((a) => a.id)).toEqual(["a"]);
  });
});

describe("slots", () => {
  it("stacks newest first, shows three and counts the rest", () => {
    const list = [1, 2, 3, 4, 5].map((n) => alert(`a${n}`, { startedAt: n }));
    const [slot] = groupBySlot(list);
    expect(slot.key).toBe("top-right");
    expect(slot.shown.map((a) => a.id)).toEqual(["a5", "a4", "a3"]);
    expect(slot.more).toBe(2);
  });

  it("maps banners to the top or bottom edge, other styles keep their position", () => {
    expect(slotOf(alert("a", {}, { style: "banner", position: "bottom-left" }))).toBe("banner-bottom");
    expect(slotOf(alert("a", {}, { style: "banner", position: "center" }))).toBe("banner-top");
    expect(slotOf(alert("a", {}, { style: "overlay", position: "center" }))).toBe("center");
  });

  it("takes the strongest backdrop", () => {
    expect(backdropOf([alert("a"), alert("b", {}, { backdrop: "dim" })])).toBe("dim");
    expect(backdropOf([alert("a", {}, { backdrop: "dim" }), alert("b", {}, { backdrop: "blur" })])).toBe("blur");
    expect(backdropOf([alert("a")])).toBe("none");
  });
});

describe("look", () => {
  it("styles by display style and size", () => {
    expect(cardClasses(alert("a", {}, { style: "toast", size: "s" }))).toContain("w-[260px]");
    expect(cardClasses(alert("a", {}, { style: "banner" }))).toContain("w-full");
    expect(cardClasses(alert("a", {}, { style: "overlay", size: "l" }))).toContain("w-[760px]");
  });

  it("counts down from startedAt and is null when it stays until acknowledged", () => {
    const a = alert("a");
    expect(countdownFraction(a, 1000)).toBe(1);
    expect(countdownFraction(a, 6000)).toBe(0.5);
    expect(countdownFraction(a, 99_000)).toBe(0);
    expect(countdownFraction(alert("b", {}, { seconds: 0 }), 5000)).toBeNull();
  });

  it("labels the age", () => {
    const a = alert("a", { startedAt: 0 });
    expect(ageLabel(a, 30_000)).toBe("now");
    expect(ageLabel(a, 120_000)).toBe("2 min");
    expect(ageLabel(a, 3 * 3_600_000)).toBe("3 h");
  });

  it("renders roles, title and body", () => {
    const html = renderToString(
      <AlertLayer alerts={[alert("a"), alert("b", { severity: "info" })]} onAck={() => {}} />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Alert a");
    expect(html).toContain("body");
    expect(renderToString(<AlertLayer alerts={[]} onAck={() => {}} />)).toBe("");
  });
});

const zone = (id: string, over: Partial<Placement> = {}): Placement =>
  ({ id, module: "m", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, ...over }) as Placement;
const MODS: ModuleInfo[] = [{ id: "m", title: "M", prefixes: ["cpu."], settings: [] }];
const view = (placements: Placement[]) => ({ cols: 4, rows: 2, placements }) as unknown as ProfileView;

describe("highlightZones", () => {
  const profile = view([
    zone("z1"),
    zone("z2", { module: PANEL_ID, panel: { title: "P", widgets: [{ id: "w", kind: "value", sensor: "gpu.temp" }] } } as Partial<Placement>),
    zone("z3", { module: "other" }),
    zone("z4", { visible: false }),
  ]);

  it("rings the listed zones that are on the page", () => {
    const a = alert("a", { highlight: { zones: ["z3", "z4", "gone"] } });
    expect([...highlightZones([a], profile, MODS).keys()]).toEqual(["z3"]);
  });

  it("falls back to the zones that read the key", () => {
    expect([...highlightZones([alert("a", { highlight: { key: "gpu.temp" } })], profile, MODS).keys()]).toEqual(["z2"]);
    expect([...highlightZones([alert("a", { highlight: { key: "cpu.load" } })], profile, MODS).keys()]).toEqual(["z1"]);
  });

  it("keeps the strongest severity per zone", () => {
    const list = [
      alert("a", { severity: "critical", highlight: { zones: ["z1"] } }),
      alert("b", { severity: "info", highlight: { zones: ["z1"] } }),
    ];
    expect(highlightZones(list, profile, MODS).get("z1")).toBe("critical");
  });

  it("renders a ring per zone", () => {
    const html = renderToString(
      <ZoneHighlights alerts={[alert("a", { highlight: { zones: ["z1"] } })]} profile={profile} />
    );
    expect(html).toContain('data-alert-ring="z1"');
    expect(renderToString(<ZoneHighlights alerts={[]} profile={profile} />)).toBe("");
  });
});
