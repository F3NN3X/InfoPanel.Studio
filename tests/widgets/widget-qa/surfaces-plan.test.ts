import { describe, expect, it } from "vitest";
import presets from "@/components/studio/widget-presets-data";
import type { RailTarget, TouchAction } from "@/lib/pinned";
import { modules } from "@/modules";
import { QA_RAIL_ACTIONS, QA_RAIL_KINDS, qaRailSlots } from "@/widgets/widget-qa/surfaces-plan";
import { layoutPlans } from "@/widgets/widget-qa/plan";
import { LAYOUTS } from "@/widgets/layouts";

// Every slot kind and action op the rail can hold: a new one fails the type here, and the page then has to draw it.
const KINDS: Record<RailTarget["kind"], true> = { page: true, profile: true, action: true, widget: true };
const OPS: Record<TouchAction["op"], true> = { page: true, "profile-picker": true, lock: true, audio: true, obs: true, media: true, run: true };

describe("the QA page's page rail", () => {
  it("draws a slot of every kind, an action of every op, the logo, badges, a label and a slot in the foot", () => {
    const slots = qaRailSlots([{ module: "DeviceBatteries", name: "Batteries", settings: {} }]);
    expect(Object.keys(QA_RAIL_KINDS).sort()).toEqual(Object.keys(KINDS).sort());
    expect([...new Set(slots.map((s) => s.target.kind))].sort()).toEqual(Object.keys(KINDS).sort());
    expect(QA_RAIL_ACTIONS.map((a) => a.action.op).sort()).toEqual(Object.keys(OPS).sort());
    expect(slots.filter((s) => s.badge).map((s) => s.badge!.when).sort()).toEqual(["agents-waiting", "alerts", "obs-live"]);
    expect(slots.some((s) => s.label)).toBe(true);
    expect(slots.some((s) => s.target.kind === "profile" && s.icon?.from === "app")).toBe(true);
    expect(slots.some((s) => s.group === "bottom")).toBe(true);
    expect([...new Set(slots.flatMap((s) => (s.icon ? [s.icon.from] : [])))].sort()).toEqual(["app", "set", "text"]);
  });

  it("puts every widget with a rail preset in a slot of its own, so a new one is on the page the day it is added", async () => {
    const map = await presets;
    const rail = Object.entries(map).flatMap(([module, list]) => list.filter((p) => p.size === "rail").map((p) => ({ module, name: p.name, settings: p.settings })));
    expect(rail.length).toBeGreaterThan(0);
    const slots = qaRailSlots(rail);
    for (const w of rail) expect(slots.some((s) => s.target.kind === "widget" && s.target.module === w.module && s.name === w.name)).toBe(true);
  });
});

describe("the layouts rows", () => {
  it("draws every layout of every widget kind that offers more than its standard one, at its default size", () => {
    for (const m of modules) {
      const offered = LAYOUTS[m.id] ?? [];
      expect(layoutPlans(m).map((l) => l.id)).toEqual(offered.length > 1 ? offered.map((l) => l.id) : []);
    }
    expect(modules.filter((m) => layoutPlans(m).length > 0).length).toBeGreaterThanOrEqual(9);
  });
});
