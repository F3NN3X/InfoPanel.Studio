import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/layout";
import { ISLAND_DEFAULTS, withIsland } from "@/lib/island/config";
import { ISLAND_LOOKS, showsLook, withIslandLook } from "@/lib/island/looks";

describe("applying an Island look", () => {
  const look = ISLAND_LOOKS.find((l) => l.id === "glass")!.look;
  const base = defaultConfig();
  const config = {
    ...base,
    profiles: [
      withIsland(base.profiles[0], { idle: "time-date", rotate: 5, enabled: true }),
      { ...base.profiles[0], id: "other", island: undefined },
    ],
  };

  it("sets the look on one screen, keeps its other settings, and turns the island on", () => {
    const next = withIslandLook(config, look, "other");
    expect(next.profiles[0]).toBe(config.profiles[0]);
    expect(next.profiles[1].island).toMatchObject({ ...look, enabled: true, idle: ISLAND_DEFAULTS.idle });
  });

  it("sets it on every screen, each keeping what it had", () => {
    const next = withIslandLook(config, look, "all");
    expect(next.profiles[0].island).toMatchObject({ ...look, idle: "time-date", rotate: 5, enabled: true });
    expect(next.profiles[1].island?.opacity).toBe(look.opacity);
  });
});

describe("showsLook", () => {
  const classic = ISLAND_LOOKS.find((l) => l.id === "classic")!.look;
  const paper = ISLAND_LOOKS.find((l) => l.id === "paper")!.look;

  it("an island set to a look shows it, and one field changed doesn't", () => {
    expect(showsLook({ ...classic }, classic)).toBe(true);
    expect(showsLook({ ...classic, shadow: false }, classic)).toBe(false);
  });

  it("colors a black or theme tint never draws don't count; a custom tint's do", () => {
    expect(showsLook({ ...classic, bgColor: "#123456", fgColor: "#abcdef" }, classic)).toBe(true);
    expect(showsLook({ ...paper, bgColor: "#123456" }, paper)).toBe(false);
  });
});
