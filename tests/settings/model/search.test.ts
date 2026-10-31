import { describe, expect, it } from "vitest";
import { PAGES } from "@/settings/pages";
import { searchSettings } from "@/settings/model/search";

describe("settings search, Connections", () => {
  it("finds the OBS, calendar and Twitch rows on the Connections page", () => {
    for (const query of ["obs password", "obs mic", "obs scenes", "calendar links", "twitch sign-in", "twitch chat channel"]) {
      const hits = searchSettings(query);
      expect(hits.length, query).toBeGreaterThan(0);
      expect(hits.every((h) => h.section === "connections"), query).toBe(true);
    }
  });

  it("has a page for the section", () => {
    expect(PAGES.connections.subtitle).toContain("OBS");
  });
});
