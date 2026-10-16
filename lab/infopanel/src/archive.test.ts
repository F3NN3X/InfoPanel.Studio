import { describe, expect, it } from "vitest";
import { loadExport, type ExportEntry } from "./archive.ts";

const enc = new TextEncoder();
const entry = (name: string, text: string): ExportEntry => ({ name, read: async () => enc.encode(text) });

describe("loadExport", () => {
  it("matches entry names case-insensitively and accepts backslashes", async () => {
    const parsed = await loadExport([
      entry("PROFILE.XML", "﻿<Profile><Width>800</Width></Profile>"),
      entry("displayitems.xml", "<ArrayOfDisplayItem/>"),
      entry("Assets\\Bg.PNG", "png"),
      entry("assets/frames/f1.png", "png"),
      entry("readme.txt", "x"),
    ]);
    expect(parsed.profile.Width).toBe(800);
    expect(parsed.items).toEqual([]);
    expect([...parsed.assets.keys()]).toEqual(["bg.png", "frames/f1.png"]);
    expect(new TextDecoder().decode(await parsed.assets.get("bg.png")!.read())).toBe("png");
  });

  it("fails clearly when a required entry is missing", async () => {
    await expect(loadExport([entry("Profile.xml", "<Profile/>")])).rejects.toThrow(/DisplayItems\.xml is missing/);
  });
});
