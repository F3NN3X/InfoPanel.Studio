import { describe, expect, it } from "vitest";
import { versionRefusal } from "./config-guard.mjs";

const text = (version) => JSON.stringify({ version, profiles: [] });

describe("versionRefusal", () => {
  it("refuses a save older than the stored config", () => {
    expect(versionRefusal(text(3), { version: 2 })).toEqual({
      status: 409,
      message: "a newer dashboard version saved this config; reload",
    });
  });
  it("treats a missing incoming version as 0", () => {
    expect(versionRefusal(text(3), {})?.status).toBe(409);
    expect(versionRefusal(text(1), { profiles: [] })?.status).toBe(409);
  });
  it("refuses a v3 client once a v4 build saved (legacy module ids migrated)", () => {
    expect(versionRefusal(text(4), { version: 3 })?.status).toBe(409);
    expect(versionRefusal(text(4), { version: 4 })).toBeNull();
    expect(versionRefusal(text(3), { version: 4 })).toBeNull();
  });
  it("refuses a v4 client once a v5 build saved (canvases moved to the canvas store)", () => {
    expect(versionRefusal(text(5), { version: 4 })?.status).toBe(409);
    expect(versionRefusal(text(4), { version: 5 })).toBeNull();
  });
  it("accepts an equal or newer save", () => {
    expect(versionRefusal(text(3), { version: 3 })).toBeNull();
    expect(versionRefusal(text(2), { version: 3 })).toBeNull();
  });
  it("accepts when the stored config has no version", () => {
    expect(versionRefusal("{}", { version: 1 })).toBeNull();
    expect(versionRefusal("{}", {})).toBeNull();
  });
  it("accepts when the stored text is unreadable", () => {
    expect(versionRefusal("not json", { version: 1 })).toBeNull();
    expect(versionRefusal("", { version: 1 })).toBeNull();
  });
  it("ignores a non-numeric stored version", () => {
    expect(versionRefusal(JSON.stringify({ version: "9" }), { version: 1 })).toBeNull();
  });
});
