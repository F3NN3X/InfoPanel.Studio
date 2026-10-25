import { describe, expect, it } from "vitest";
import { newStored } from "@/lib/infopanel/import/stored";
import { defaultConfig, newProfile, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { importedProfile, parseProfileFile, PROFILE_FILE_TYPE, profileFileText, screenPayload } from "@/components/studio/profile-file";

function profile(): MonitorProfile {
  const base = newProfile("Wide", 1920, 550);
  return {
    ...base,
    gap: 8,
    pages: [
      { id: "p1", name: "Main", placements: [{ id: "z1", module: "SystemOverview", colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 2, visible: true }] },
      { id: "p2", name: "Two", placements: [] },
    ],
    rotate: { enabled: true, seconds: 20, pages: ["p2"] },
  };
}

const ok = (text: string): MonitorProfile => {
  const parsed = parseProfileFile(text);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.profile;
};
const error = (text: string): string => {
  const parsed = parseProfileFile(text);
  if (!("error" in parsed)) throw new Error("accepted");
  return parsed.error;
};

describe("profile file", () => {
  it("round-trips a profile through export and import", () => {
    const source = profile();
    expect(ok(profileFileText(source))).toEqual(source);
  });

  it("round-trips an InfoPanel screen with its canvas, and does not import the edit time", () => {
    const canvas = newStored({ name: "Desk", width: 800, height: 480, now: new Date("2026-10-25T10:00:00Z") });
    const source = profile();
    source.updatedAt = "2026-10-25T10:00:00.000Z";
    source.pages[0].placements.push({ id: "c1", module: "infopanel", colStart: 1, rowStart: 3, colSpan: 4, rowSpan: 2, visible: true, canvas });
    const back = ok(profileFileText(source));
    expect(back.pages[0].placements[1].canvas).toEqual(canvas);
    expect(back.updatedAt).toBeUndefined();
    expect(screenPayload({ ...defaultConfig(), profiles: [source] }, source)).toMatchObject({ name: "Wide.json" });
  });

  it("keeps the screen's page font through export and import, and drops an unknown one", () => {
    const source = { ...profile(), font: "inter" as const };
    expect(ok(profileFileText(source)).font).toBe("inter");
    expect(ok(JSON.stringify({ ...profile(), font: "comic" })).font).toBeUndefined();
  });

  it("carries the envelope that tells it from other JSON", () => {
    const file = JSON.parse(profileFileText(profile()));
    expect(file).toMatchObject({ type: PROFILE_FILE_TYPE, version: 1 });
  });

  it("takes a bare profile as Copy profile JSON gives it", () => {
    const source = profile();
    expect(ok(JSON.stringify(source, null, 2))).toEqual(source);
  });

  it("upgrades an old-version profile: legacy zones move onto a first page", () => {
    const { pages: _pages, ...rest } = profile();
    const legacy = { ...rest, placements: [{ id: "z1", module: "SystemOverview", colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 2, visible: true }] };
    const upgraded = ok(JSON.stringify({ type: PROFILE_FILE_TYPE, version: 1, configVersion: 2, profile: legacy }));
    expect(upgraded.pages).toHaveLength(1);
    expect(upgraded.pages[0].placements.map((p) => p.id)).toEqual(["z1"]);
    expect(upgraded).not.toHaveProperty("placements");
  });

  it("rejects files that are not a profile", () => {
    expect(error("not json")).toMatch(/JSON/);
    expect(error("[]")).toMatch(/Not a profile/);
    expect(error(JSON.stringify(defaultConfig()))).toMatch(/Not a profile/);
    expect(error(JSON.stringify({ type: PROFILE_FILE_TYPE, version: 1, profile: null }))).toMatch(/Not a profile/);
  });

  it("rejects a profile that fails normalisation: no name or size", () => {
    const { name: _name, ...nameless } = profile();
    expect(error(JSON.stringify(nameless))).toMatch(/name and a size/);
    expect(error(JSON.stringify({ ...profile(), width: "wide" }))).toMatch(/name and a size/);
    expect(error(JSON.stringify({ ...profile(), height: 0 }))).toMatch(/name and a size/);
  });

  it("rejects a grid or size outside the studio's limits", () => {
    for (const bad of [{ cols: NaN }, { cols: "abc" }, { cols: 1e9 }, { cols: 1 }, { rows: 0 }, { rows: 25 }, { width: 1e12 }, { height: 20001 }]) {
      expect(error(JSON.stringify({ ...profile(), ...bad }))).toMatch(/grid|name and a size/);
    }
    expect(ok(JSON.stringify({ ...profile(), cols: 24, rows: 24, width: 20000 })).cols).toBe(24);
  });

  it("drops an unknown fit and keeps only the known fields", () => {
    const parsed = ok(JSON.stringify({ ...profile(), fit: "stretch", evil: "x".repeat(50), pages: [{ ...profile().pages[0], junk: 1 }] }));
    expect(parsed.fit).toBeUndefined();
    expect(parsed).not.toHaveProperty("evil");
    expect(parsed.pages[0]).not.toHaveProperty("junk");
    expect(parsed.pages[0].name).toBe("Main");
  });

  it("refuses a file over 5 MB", () => {
    expect(error(" ".repeat(5 * 1024 * 1024 + 1))).toMatch(/over 5 MB/);
  });

  it("drops canvas zones that hold only a ref and counts them", () => {
    const source = profile();
    source.pages[0].placements.push({ ...source.pages[0].placements[0], id: "c1", module: "infopanel", canvasRef: "abc.json" });
    const parsed = parseProfileFile(JSON.stringify(source));
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.skippedCanvases).toBe(1);
    expect(parsed.profile.pages[0].placements.map((p) => p.id)).toEqual(["z1"]);
  });

  it("rejects a file from a newer version", () => {
    expect(error(JSON.stringify({ type: PROFILE_FILE_TYPE, version: 99, profile: profile() }))).toMatch(/newer/);
    expect(error(JSON.stringify({ type: PROFILE_FILE_TYPE, version: 1, configVersion: 99, profile: profile() }))).toMatch(/newer/);
  });
});

describe("importedProfile", () => {
  const config: DashboardConfig = { ...defaultConfig(), profiles: [{ ...profile(), id: "a" }] };

  it("gives fresh ids and a name no other profile has", () => {
    const imported = importedProfile(config, profile());
    expect(imported.id).not.toBe(profile().id);
    expect(imported.name).toBe("Wide 2");
    expect(imported.pages.map((p) => p.id)).not.toContain("p1");
    expect(imported.pages[0].placements[0].id).not.toBe("z1");
    expect(imported.rotate?.pages).toEqual([imported.pages[1].id]);
  });

  it("keeps a name that is free", () => {
    expect(importedProfile({ ...config, profiles: [] }, profile()).name).toBe("Wide");
  });
});

describe("screenPayload", () => {
  it("is the profile file, which is exactly what Copy JSON copies, and the door reads it back", () => {
    const wide = profile();
    const config: DashboardConfig = { ...defaultConfig(), profiles: [wide] };
    const payload = screenPayload(config, wide);
    if ("error" in payload) throw new Error(payload.error);
    expect(payload.name).toBe("Wide.json");
    expect(payload.text).toBe(profileFileText(wide));
    expect(JSON.parse(payload.text)).toMatchObject({ type: PROFILE_FILE_TYPE, profile: { name: "Wide" } });
    expect(ok(payload.text)).toEqual(ok(profileFileText(wide)));
  });

  it("has no payload for a screen with a canvas that is not loaded", () => {
    const base = profile();
    const withRef = { ...base, pages: [{ ...base.pages[0], placements: [{ id: "c", module: "infopanel-canvas", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, canvasRef: "cnv_x" }] }, base.pages[1]] } as MonitorProfile;
    const payload = screenPayload({ ...defaultConfig(), profiles: [withRef] }, withRef);
    expect(payload).toEqual({ error: "Not exported: a canvas in this profile is not loaded" });
  });
});
