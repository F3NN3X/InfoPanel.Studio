import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installerAsset, manifest } from "../tools/updater-manifest.mjs";

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "updater-manifest.mjs");

describe("updater manifest", () => {
  it("names the installer without spaces and points the url at the tag", () => {
    expect(installerAsset("1.2.0")).toEqual({
      name: "InfoPanel-Studio_1.2.0_x64-setup.exe",
      url: "https://github.com/F3NN3X/InfoPanel.Studio/releases/download/v1.2.0/InfoPanel-Studio_1.2.0_x64-setup.exe",
    });
  });

  it("points a beta at its own prerelease tag", () => {
    expect(installerAsset("1.3.0-beta.1").url).toBe(
      "https://github.com/F3NN3X/InfoPanel.Studio/releases/download/v1.3.0-beta.1/InfoPanel-Studio_1.3.0-beta.1_x64-setup.exe",
    );
  });

  it("is Tauri's static format for windows-x86_64", () => {
    expect(manifest({ version: "1.2.0", notes: "n", pubDate: "2026-01-01T00:00:00.000Z", signature: "sig", url: "https://x/y.exe" })).toEqual({
      version: "1.2.0",
      notes: "n",
      pub_date: "2026-01-01T00:00:00.000Z",
      platforms: { "windows-x86_64": { signature: "sig", url: "https://x/y.exe" } },
    });
  });

  it("the CLI reads the signature and notes and writes latest.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "updater-manifest-"));
    try {
      fs.writeFileSync(path.join(dir, "a.sig"), "SIGNATURE\n");
      fs.writeFileSync(path.join(dir, "notes.md"), "### Added\n- a thing\n");
      const out = path.join(dir, "latest.json");
      const run = spawnSync(process.execPath, [TOOL, "--version=1.2.0", `--sig=${path.join(dir, "a.sig")}`, `--notes=${path.join(dir, "notes.md")}`, `--out=${out}`]);
      expect(run.status).toBe(0);
      const json = JSON.parse(fs.readFileSync(out, "utf8"));
      expect(json.version).toBe("1.2.0");
      expect(json.notes).toBe("### Added\n- a thing");
      expect(json.platforms["windows-x86_64"].signature).toBe("SIGNATURE");
      expect(json.platforms["windows-x86_64"].url).toContain("/v1.2.0/InfoPanel-Studio_1.2.0_x64-setup.exe");
      expect(Number.isNaN(Date.parse(json.pub_date))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the CLI fails without its arguments", () => {
    expect(spawnSync(process.execPath, [TOOL]).status).toBe(1);
  });
});
