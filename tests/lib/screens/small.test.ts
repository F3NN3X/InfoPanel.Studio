import { describe, expect, it } from "vitest";
import { defaultConfig, newProfile, type DashboardConfig } from "@/lib/layout";
import { sampleScreen } from "@/lib/screens/create";
import { kioskLink } from "@/lib/screens/kiosk-link";
import { moveProfile } from "@/lib/screens/order";

const config = (): DashboardConfig => ({ ...defaultConfig(), profiles: ["a", "b", "c"].map((id) => ({ ...newProfile(id, 800, 480), id })) });
const ids = (c: DashboardConfig) => c.profiles.map((p) => p.id);

describe("moveProfile", () => {
  it("moves a screen by places and clamps at the ends", () => {
    expect(ids(moveProfile(config(), "a", 1))).toEqual(["b", "a", "c"]);
    expect(ids(moveProfile(config(), "c", -1))).toEqual(["a", "c", "b"]);
    expect(ids(moveProfile(config(), "a", 9))).toEqual(["b", "c", "a"]);
  });
  it("returns the same config when nothing moves or the id is unknown", () => {
    const c = config();
    expect(moveProfile(c, "a", -1)).toBe(c);
    expect(moveProfile(c, "nope", 1)).toBe(c);
  });
});

describe("kioskLink", () => {
  it("pins a kiosk to the screen, escaping the id and trimming the origin's slash", () => {
    expect(kioskLink("http://192.168.1.5:3922/", "profile 1/x")).toBe("http://192.168.1.5:3922/?kiosk=1&profile=profile%201%2Fx");
  });
});

describe("sampleScreen", () => {
  it("is a named screen with the sample's grid and zones on its page", () => {
    const s = sampleScreen("Sample layout");
    expect(s.name).toBe("Sample layout");
    expect(s.pages).toHaveLength(1);
    expect(s.pages[0].placements.length).toBeGreaterThan(3);
    expect(s.cols).toBe(12);
    expect(s.rows).toBe(6);
  });
});
