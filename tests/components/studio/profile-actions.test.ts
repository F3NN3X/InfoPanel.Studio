import { describe, expect, it } from "vitest";
import { defaultConfig, newPanel, newProfile, newWidget, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { duplicateProfile, uniqueProfileName, withoutProfile, withProfile } from "@/components/studio/profile-actions";

function config(activeProfile: string): DashboardConfig {
  const profiles = ["a", "b", "c"].map((id) => ({ ...newProfile(id, 1920, 1080), id }));
  return { ...defaultConfig(), profiles, activeProfile };
}

const ids = (c: DashboardConfig) => c.profiles.map((p) => p.id);

describe("withProfile", () => {
  const added = { ...newProfile("new", 800, 480), id: "new" };

  it("makes the new profile the one displays show", () => {
    const out = withProfile(config("a"), added, true);
    expect(ids(out)).toEqual(["a", "b", "c", "new"]);
    expect(out.activeProfile).toBe("new");
  });

  it("leaves what displays show alone when not activating", () => {
    expect(withProfile(config("b"), added, false).activeProfile).toBe("b");
    expect(withProfile(config("auto"), added, false).activeProfile).toBe("auto");
  });
});

describe("withoutProfile", () => {
  it("deletes a profile and leaves the pick alone", () => {
    const out = withoutProfile(config("a"), "b");
    expect(ids(out)).toEqual(["a", "c"]);
    expect(out.activeProfile).toBe("a");
  });

  it("keeps auto when any profile goes", () => {
    const out = withoutProfile(config("auto"), "a");
    expect(ids(out)).toEqual(["b", "c"]);
    expect(out.activeProfile).toBe("auto");
  });

  it("hands the pick to auto when the profile the app opens on goes", () => {
    const out = withoutProfile(config("b"), "b");
    expect(ids(out)).toEqual(["a", "c"]);
    expect(out.activeProfile).toBe("auto");
  });

  it("never deletes the last profile", () => {
    const one = { ...config("a"), profiles: config("a").profiles.slice(0, 1) };
    expect(withoutProfile(one, "a")).toBe(one);
  });

  it("returns the same config for an unknown id", () => {
    const c = config("a");
    expect(withoutProfile(c, "zzz")).toBe(c);
  });
});

/** A profile with two pages, a plain zone, a panel zone with widgets, and a rotation over the second page. */
function rich(): MonitorProfile {
  const base = newProfile("Wide", 1920, 550);
  const panel = newPanel("Stats");
  panel.widgets = [newWidget("text"), newWidget("text")];
  const zone = (id: string, module: string, extra: Partial<Placement> = {}): Placement => ({
    id, module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, ...extra,
  });
  return {
    ...base,
    pages: [
      { id: "p1", name: "Main", placements: [zone("z1", "SystemOverview", { settings: { title: "x" } })] },
      { id: "p2", name: "Two", placements: [zone("z2", "panel", { panel })] },
    ],
    rotate: { enabled: true, seconds: 30, pages: ["p2"] },
  };
}

/** Every `id` string anywhere in the value. */
function allIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allIds(v, out));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "id" && typeof v === "string") out.add(v);
      else allIds(v, out);
    }
  }
  return out;
}

describe("duplicateProfile", () => {
  const source = rich();
  const base = { ...config("auto"), profiles: [{ ...newProfile("first", 800, 480), id: "first" }, source, { ...newProfile("last", 800, 480), id: "last" }] };
  const result = duplicateProfile(base, source.id)!;
  const copy = result.config.profiles[2];

  it("inserts '<name> copy' directly below the source and returns its id", () => {
    expect(result.config.profiles.map((p) => p.id)).toEqual(["first", source.id, copy.id, "last"]);
    expect(copy.id).toBe(result.profileId);
    expect(copy.name).toBe("Wide copy");
  });

  it("shares no id with the source: profile, pages, zones, panels and widgets", () => {
    const original = allIds(source);
    const fresh = allIds(copy);
    expect(fresh.size).toBe(original.size);
    expect([...fresh].filter((id) => original.has(id))).toEqual([]);
  });

  it("remaps rotate.pages to the copy's pages", () => {
    expect(copy.rotate).toMatchObject({ enabled: true, seconds: 30 });
    expect(copy.rotate?.pages).toEqual([copy.pages[1].id]);
  });

  it("copies the content and leaves the source and the pick alone", () => {
    expect(copy.pages.map((p) => p.name)).toEqual(["Main", "Two"]);
    expect(copy.pages[0].placements[0].settings).toEqual({ title: "x" });
    expect(copy.pages[1].placements[0].panel?.widgets).toHaveLength(2);
    expect(result.config.profiles[1]).toBe(source);
    expect(result.config.activeProfile).toBe("auto");
    expect(copy.pages[0].placements[0].settings).not.toBe(source.pages[0].placements[0].settings);
  });

  it("names a second copy '<name> copy 2'", () => {
    const again = duplicateProfile(result.config, source.id)!;
    expect(again.config.profiles.find((p) => p.id === again.profileId)?.name).toBe("Wide copy 2");
  });

  it("returns null for an unknown id", () => {
    expect(duplicateProfile(base, "nope")).toBeNull();
  });
});

describe("uniqueProfileName", () => {
  const profiles = ["Main", "Main 2"].map((name) => ({ ...newProfile(name, 800, 480) }));

  it("keeps a free name and numbers a taken one", () => {
    expect(uniqueProfileName(profiles, "Wide")).toBe("Wide");
    expect(uniqueProfileName(profiles, "Main")).toBe("Main 3");
  });
});
