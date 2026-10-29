import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { updateFrom } from "@/lib/config-update";
import { updateText } from "@/lib/config-update-text";
import { CONFIG_VERSION } from "@/lib/layout";

describe("updateFrom", () => {
  it("updates a config with screens below this build's version", () => {
    expect(updateFrom({ version: CONFIG_VERSION - 1, profiles: [] })).toBe(CONFIG_VERSION - 1);
    expect(updateFrom({ profiles: [] })).toBe(0);
  });
  it("leaves a current or newer config, or one with no screens, alone", () => {
    expect(updateFrom({ version: CONFIG_VERSION, profiles: [] })).toBeUndefined();
    expect(updateFrom({ version: CONFIG_VERSION + 1, profiles: [] })).toBeUndefined();
    expect(updateFrom({ version: 3 })).toBeUndefined();
    expect(updateFrom(null)).toBeUndefined();
  });
  it("is the version the desktop app checks (ips-server's CONFIG_VERSION)", () => {
    const rust = readFileSync("src-tauri/crates/ips-server/src/lib.rs", "utf8").match(/pub const CONFIG_VERSION: u32 = (\d+);/);
    expect(Number(rust?.[1])).toBe(CONFIG_VERSION);
  });
});

describe("updateText", () => {
  it("names both versions before, and the backup after", () => {
    expect(updateText({ state: "ask", from: 15 }).body).toContain(`format 15) will be updated to format ${CONFIG_VERSION}`);
    expect(updateText({ state: "done", from: 15, backup: "C:/data/config.backup-before-v16.json" }).body).toContain("config.backup-before-v16.json");
    expect(updateText({ state: "failed", from: 15, error: "Offline." }).body).toBe("Your screens were not changed. Offline.");
  });
});
