import { describe, expect, it } from "vitest";
import { defaultConfig, newProfile, type DashboardConfig } from "@/lib/layout";
import { withoutProfile } from "@/components/studio/profile-actions";

function config(activeProfile: string): DashboardConfig {
  const profiles = ["a", "b", "c"].map((id) => ({ ...newProfile(id, 1920, 1080), id }));
  return { ...defaultConfig(), profiles, activeProfile };
}

const ids = (c: DashboardConfig) => c.profiles.map((p) => p.id);

describe("withoutProfile", () => {
  it("deletes a profile that is not edited and leaves the pick alone", () => {
    const out = withoutProfile(config("a"), "b", "a");
    expect(ids(out)).toEqual(["a", "c"]);
    expect(out.activeProfile).toBe("a");
  });

  it("keeps auto when an auto-resolved profile other than the edited one goes", () => {
    const out = withoutProfile(config("auto"), "c", "a");
    expect(ids(out)).toEqual(["a", "b"]);
    expect(out.activeProfile).toBe("auto");
  });

  it("hands the pick to auto when the edited profile goes", () => {
    const out = withoutProfile(config("auto"), "a", "a");
    expect(ids(out)).toEqual(["b", "c"]);
    expect(out.activeProfile).toBe("auto");
  });

  it("hands the pick to auto when the pinned profile goes", () => {
    const out = withoutProfile(config("b"), "b", "a");
    expect(ids(out)).toEqual(["a", "c"]);
    expect(out.activeProfile).toBe("auto");
  });

  it("never deletes the last profile", () => {
    const one = { ...config("a"), profiles: config("a").profiles.slice(0, 1) };
    expect(withoutProfile(one, "a", "a")).toBe(one);
  });

  it("returns the same config for an unknown id", () => {
    const c = config("a");
    expect(withoutProfile(c, "zzz", "a")).toBe(c);
  });
});
