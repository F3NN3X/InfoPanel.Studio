import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPrefs, createStudioPrefs, normalizePrefs } from "../../server/studio-prefs.mjs";

describe("studio preferences", () => {
  it("keeps only known keys with known values", () => {
    expect(normalizePrefs({ "studio.previewData": "frozen", "studio.other": 1, x: "y" })).toEqual({ "studio.previewData": "frozen" });
    expect(normalizePrefs({ "studio.previewData": "paused" })).toEqual({});
    expect(normalizePrefs(null)).toEqual({});
    expect(normalizePrefs(["live"])).toEqual({});
  });

  it("refuses a patch with an unknown key or value, whole", () => {
    expect(applyPrefs({}, { "studio.previewData": "live" })).toEqual({ prefs: { "studio.previewData": "live" } });
    expect(applyPrefs({}, { "studio.previewData": "paused" }).error).toMatch(/takes live, frozen, frozenWhenUnfocused/);
    expect(applyPrefs({}, { "studio.previewData": "live", nope: 1 }).error).toMatch(/unknown preference nope/);
    expect(applyPrefs({}, "live").error).toBeDefined();
  });

  it("reads a broken file as no preferences and replaces it on the next write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ips-prefs-"));
    try {
      const file = path.join(dir, "studio-prefs.json");
      fs.writeFileSync(file, "{not json");
      const prefs = createStudioPrefs(file);
      expect(prefs.get()).toEqual({});
      expect(prefs.apply({ "studio.previewData": "frozenWhenUnfocused" }).error).toBeUndefined();
      expect(createStudioPrefs(file).get()).toEqual({ "studio.previewData": "frozenWhenUnfocused" });
      // A refused patch leaves the file as it was.
      expect(prefs.apply({ "studio.previewData": "x" }).error).toBeDefined();
      expect(createStudioPrefs(file).get()).toEqual({ "studio.previewData": "frozenWhenUnfocused" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
