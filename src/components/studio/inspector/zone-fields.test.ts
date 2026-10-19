import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import { PANEL_SETTINGS } from "@/modules/standard-settings";
import type { ModuleSetting } from "@/modules/types";
import { allSections, sourceState, widgetContext } from "../inspector-model";
import { modules } from "@/modules";
import {
  followFields,
  shownValue,
  shownValues,
  withFollow,
  withoutSettings,
  withSettings,
  zoneDefs,
  zoneLookValues,
} from "./zone-fields";

const zone = (patch: Partial<Placement>): Placement => ({
  id: "z",
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
  ...patch,
});

const accent: ModuleSetting = { key: "accent", label: "Accent", type: "color", default: "" };
const title: ModuleSetting = { key: "label", label: "Title", type: "text", default: "" };

describe("withSettings / withFollow", () => {
  it("stores an edit as it is, whatever the section follows (no flip to custom)", () => {
    const next = withSettings(zone({}), { accent: "#ff0000" });
    expect(next.settings).toEqual({ accent: "#ff0000" });
    expect(next.follow).toBeUndefined();
  });

  it("drops settings", () => {
    expect(withoutSettings(zone({ settings: { accent: "#fff", label: "x" } }), ["accent"]).settings).toEqual({ label: "x" });
  });

  it("Customize and Use theme flip one section and keep the own values (SPEC §9: they come back)", () => {
    const own = zone({ settings: { accent: "#ff0000" } });
    const custom = withFollow(own, "colors", false);
    expect(custom.follow).toEqual({ colors: false });
    const back = withFollow(custom, "colors", true);
    expect(back.follow).toBeUndefined();
    expect(back.settings).toEqual({ accent: "#ff0000" });
    expect(shownValue(zoneLookValues(withFollow(back, "colors", false), {}), "accent", accent)).toBe("#ff0000");
  });
});

describe("shownValue", () => {
  const appearance = { base: { accent: "#00ff00" } };

  it("shows the own value in a custom section, the theme's while it follows", () => {
    const own = zone({ settings: { accent: "#ff0000", label: "CPU" }, follow: { colors: false } });
    expect(shownValue(zoneLookValues(own, appearance), "accent", accent)).toBe("#ff0000");
    const following = zoneLookValues({ ...own, follow: undefined }, appearance);
    expect(shownValue(following, "accent", accent)).toBe("#00ff00");
    // Other settings always show their own value.
    expect(shownValue(following, "label", title)).toBe("CPU");
  });

  it("starts a custom section at the theme's value", () => {
    expect(shownValue(zoneLookValues(zone({ follow: { colors: false } }), appearance), "accent", accent)).toBe("#00ff00");
  });

  it("falls back to the default and collects every key", () => {
    const values = zoneLookValues(zone({}), {});
    expect(shownValues(values, [accent, title])).toEqual({ accent: "", label: "" });
  });

  it("reads a colour row with a palette role from its role while Widget colors follows", () => {
    const cpu = modules.find((m) => m.id === "SystemOverview")!.settings!.find((d) => d.key === "cpuColor")!;
    expect(cpu.role).toBe("s1");
    const own = zone({ settings: { cpuColor: "#ff0000" } });
    const theme = { profile: { values: { s1: "#0000ff" } } };
    expect(shownValue(zoneLookValues(own, theme), "cpuColor", cpu)).toBe("#0000ff");
    // no theme colour: the row's default ("" = the widget's own palette), not the inactive own value
    expect(shownValue(zoneLookValues(own, {}), "cpuColor", cpu)).toBe("");
    expect(sourceState(cpu, zoneLookValues(own, theme))).toBe("default");
    const custom = { ...own, follow: { palette: false } };
    expect(shownValue(zoneLookValues(custom, theme), "cpuColor", cpu)).toBe("#ff0000");
    expect(sourceState(cpu, zoneLookValues(custom, theme))).toBe("here");
    expect(followFields(own, {}, () => {}).readOnly?.(cpu)).toBe(true);
  });

  it("gives visibleIf the resolved values (Glow color shows for a theme glow)", () => {
    const defs = modules.find((m) => m.id === "SystemOverview")!.settings!;
    const glowColor = defs.find((d) => d.key === "glowColor")!;
    const shown = shownValues(zoneLookValues(zone({}), { profile: { values: { glow: "soft" } } }), defs);
    expect(glowColor.visibleIf?.(shown)).toBe(true);
    const stored = shownValues(zoneLookValues(zone({ settings: { glow: "soft" } }), {}), defs);
    expect(glowColor.visibleIf?.(stored)).toBe(false);
  });
});

describe("followFields", () => {
  const sections = allSections(widgetContext(modules.find((m) => m.id === "SystemOverview")!));
  const colors = sections.find((s) => s.id === "colors")!;
  const header = sections.find((s) => s.id === "header")!;

  it("gives followable sections a bar and read-only rows while they follow", () => {
    const edits: Placement[] = [];
    const z = zone({ settings: { accent: "#ff0000" } });
    const f = followFields(z, { profileName: "Desk" }, (fn) => edits.push(fn(z)));
    expect(f.follow?.(header)).toBeUndefined();
    const bar = f.follow?.(colors);
    expect(bar).toMatchObject({ mode: "theme", from: "the profile theme · Desk" });
    expect(f.readOnly?.(accent)).toBe(true);
    expect(f.readOnly?.(title)).toBe(false);
    expect(f.readOnly?.({ ...accent, perWidget: true })).toBe(false);
    bar?.onCustomize();
    expect(edits[0].follow).toEqual({ colors: false });
  });

  it("unlocks the rows of a custom section; Use theme follows again", () => {
    const edits: Placement[] = [];
    const z = zone({ follow: { colors: false } });
    const f = followFields(z, {}, (fn) => edits.push(fn(z)));
    expect(f.readOnly?.(accent)).toBe(false);
    f.follow?.(colors)?.onUseTheme();
    expect(edits[0].follow).toBeUndefined();
  });

  it("keeps a locked section read-only with no switch to customize it (SPEC §9: Locked)", () => {
    const z = zone({ follow: { colors: false } });
    const f = followFields(z, { profile: { locks: { colors: true } } }, () => {});
    expect(f.follow?.(colors)?.mode).toBe("locked");
    expect(f.readOnly?.(accent)).toBe(true);
  });
});

describe("zoneDefs", () => {
  it("gives a panel the panel schema and an unknown module none", () => {
    expect(zoneDefs(zone({ module: "panel", panel: { title: "P", widgets: [] } as unknown as Placement["panel"] }))).toBe(
      PANEL_SETTINGS
    );
    expect(zoneDefs(zone({ module: "blank" }))).toEqual([]);
  });
});
