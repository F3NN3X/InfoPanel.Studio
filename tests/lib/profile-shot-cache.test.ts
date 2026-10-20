import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/layout";
import { profileRev, pruneShots, type ShotMap } from "@/lib/profile-shot-cache";

describe("profileRev", () => {
  const config = defaultConfig();
  const profile = config.profiles[0];

  it("is the same for the same profile and dashboard", () => {
    expect(profileRev(profile, config)).toBe(profileRev({ ...profile }, { ...config }));
  });

  it("changes with a profile field", () => {
    expect(profileRev({ ...profile, name: "Other" }, config)).not.toBe(profileRev(profile, config));
    expect(profileRev({ ...profile, cols: profile.cols + 1 }, config)).not.toBe(profileRev(profile, config));
  });

  it("changes with the dashboard fields the page inherits", () => {
    const rev = profileRev(profile, config);
    expect(profileRev(profile, { ...config, theme: { ...config.theme, background: "1 2% 3%" } })).not.toBe(rev);
    expect(profileRev(profile, { ...config, background: { type: "color", color: "#123456" } })).not.toBe(rev);
  });
});

describe("pruneShots", () => {
  const shot = (at: number, size = 10) => ({ rev: "r", dataUrl: "x".repeat(size), at });
  const map: ShotMap = { a: shot(1), b: shot(3), c: shot(2) };

  it("drops the shots of deleted profiles", () => {
    expect(Object.keys(pruneShots(map, ["a", "c"]))).toEqual(["c", "a"]);
  });

  it("keeps everything under the cap", () => {
    expect(pruneShots(map, ["a", "b", "c"], 30)).toEqual(map);
  });

  it("drops the oldest first when over the cap", () => {
    expect(Object.keys(pruneShots(map, ["a", "b", "c"], 25)).sort()).toEqual(["b", "c"]);
    expect(Object.keys(pruneShots(map, ["a", "b", "c"], 10))).toEqual(["b"]);
  });

  it("with no cap keeps every existing profile", () => {
    expect(Object.keys(pruneShots(map, ["a", "b"], Infinity)).sort()).toEqual(["a", "b"]);
  });

  it("does not change the map it is given", () => {
    pruneShots(map, ["b"], 5);
    expect(Object.keys(map)).toEqual(["a", "b", "c"]);
  });
});
