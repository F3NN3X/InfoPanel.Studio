import { describe, expect, it } from "vitest";
import type { DashboardConfig, MonitorProfile, Placement } from "@/lib/layout";
import { mainPage, profileWithPage } from "@/lib/pages";
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import { allLocked } from "@/lib/theme-model";
import {
  activePresetId,
  appliedMessage,
  followAll,
  styleKey,
  toggleEnforce,
  withScopeStyle,
} from "@/components/studio/appearance-actions";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 1,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const profile = (id: string, extra: Partial<MonitorProfile> = {}): MonitorProfile => ({
  id,
  name: id,
  width: 1920,
  height: 1080,
  cols: 12,
  rows: 6,
  fit: "scroll",
  pages: [mainPage([zone("a"), zone("b", { follow: { colors: false }, settings: { accent: "#ff0000" } })])],
  ...extra,
});

const config = (extra: Partial<DashboardConfig> = {}): DashboardConfig =>
  ({ version: 3, activeProfile: "auto", profiles: [profile("p1"), profile("p2")], theme: {}, radius: 0.5, ...extra }) as DashboardConfig;

const ALL = { kind: "all" } as const;
const P1 = { kind: "profile", profileId: "p1" } as const;

describe("scope keys", () => {
  it("coalesce per scope", () => {
    expect(styleKey(ALL)).toBe("appearance-style:all");
    expect(styleKey(P1)).toBe("appearance-style:p1");
  });
});

describe("withScopeStyle", () => {
  it("edits the dashboard style and stores an empty one as none", () => {
    const set = withScopeStyle(config(), ALL, (s) => ({ ...s, accent: "#00ff00" }));
    expect(set.style).toEqual({ accent: "#00ff00" });
    expect(set.profiles[0].widgetTheme).toBeUndefined();
    expect(withScopeStyle(set, ALL, () => ({})).style).toBeUndefined();
  });

  it("edits one profile's theme values only, and keeps its locks", () => {
    const set = withScopeStyle(config(), P1, (s) => ({ ...s, radius: "8" }));
    expect(set.style).toBeUndefined();
    expect(set.profiles.map((p) => p.widgetTheme)).toEqual([{ values: { radius: "8" } }, undefined]);
    const locked = withScopeStyle(toggleEnforce(config(), { id: "p1" }), P1, () => ({}));
    expect(allLocked(locked.profiles[0].widgetTheme)).toBe(true);
    expect(locked.profiles[0].widgetTheme?.values).toBeUndefined();
  });
});

describe("toggleEnforce", () => {
  it("toggles this profile's lock-all", () => {
    const c = config();
    const on = toggleEnforce(c, c.profiles[0]);
    expect(allLocked(on.profiles[0].widgetTheme)).toBe(true);
    expect(on.profiles[1].widgetTheme).toBeUndefined();
    expect(toggleEnforce(on, on.profiles[0]).profiles[0].widgetTheme).toBeUndefined();
  });
});

describe("followAll", () => {
  it("makes every section of every widget follow, keeps the own look stored, and is a no-op when they all do", () => {
    const p = followAll(profileWithPage(profile("p1")));
    expect(p.placements.map((z) => z.follow)).toEqual([undefined, undefined]);
    expect(p.placements[1].settings).toEqual({ accent: "#ff0000" });
    expect(followAll(p)).toBe(p);
  });
});

describe("appliedMessage", () => {
  it("names the scope", () => {
    expect(appliedMessage("Glass", "all")).toBe("Applied Glass to all profiles");
    expect(appliedMessage("Glass", "profile")).toBe("Applied Glass to this profile");
  });
});

describe("activePresetId", () => {
  const glass: AppearancePreset = { id: "look-glass", name: "Glass", description: "", theme: "zinc", radius: 0.75, style: { surface: "glass", blur: "16" } };
  const dark: AppearancePreset = { id: "look-dark", name: "Dark", description: "", theme: "zinc", radius: 0.5, style: { surface: "matte-dark" } };
  const looks = [dark, glass];

  it("finds the preset whose theme, radius and style the look has", () => {
    const look = { tokens: presetTokens(glass), radius: glass.radius, style: { ...glass.style, accent: "#fff" } };
    expect(activePresetId(looks, look)).toBe("look-glass");
    expect(activePresetId(looks, { ...look, style: dark.style, radius: dark.radius })).toBe(
      "look-dark"
    );
  });

  it("is undefined for a look matching none", () => {
    expect(
      activePresetId(looks, { tokens: presetTokens(dark), radius: 0.1, style: dark.style })
    ).toBeUndefined();
  });
});
