import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseProfileXml } from "../src/lib/infopanel/parse.ts";
import { createInstalledProfiles, isAssetName, isGuid, profilesFromXml } from "./infopanel-local.mjs";

const G1 = "70538526-f13f-4074-bb42-f6892d6e42d4";
const PROFILES =
  '<?xml version="1.0"?><ArrayOfProfile xmlns:xsi="x">' +
  `<Profile><Guid>${G1}</Guid><Name>A &amp; B</Name><Width>600</Width></Profile>` +
  "<Profile><Guid>../../etc</Guid><Name>bad</Name></Profile>" +
  "</ArrayOfProfile>";

describe("profilesFromXml", () => {
  it("lists each profile with its own element, skipping invalid guids", () => {
    const list = profilesFromXml(PROFILES);
    expect(list.map((p) => [p.guid, p.name])).toEqual([[G1, "A & B"]]);
    expect(parseProfileXml(list[0].xml).profile).toMatchObject({ Name: "A & B", Width: 600 });
  });
});

describe("path guards", () => {
  it("accepts guids and plain file names only", () => {
    expect(isGuid(G1)).toBe(true);
    expect(isGuid("..")).toBe(false);
    expect(["a.png", "Donut_00001.png", "with space.gif"].every(isAssetName)).toBe(true);
    expect(["..", ".", "a/b.png", "a\\b.png", "C:x", ""].some(isAssetName)).toBe(false);
  });
});

describe("createInstalledProfiles", () => {
  const withData = async (fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infopanel-data-"));
    try {
      fs.writeFileSync(path.join(dir, "profiles.xml"), PROFILES);
      fs.mkdirSync(path.join(dir, "profiles"));
      fs.writeFileSync(path.join(dir, "profiles", `${G1}.xml`), "<ArrayOfDisplayItem/>");
      fs.mkdirSync(path.join(dir, "assets", G1), { recursive: true });
      fs.writeFileSync(path.join(dir, "assets", G1, "logo.png"), "png");
      await fn(createInstalledProfiles(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("lists the profiles with their sizes and asset names", () =>
    withData(async (installed) => {
      expect(await installed.list()).toEqual([{ guid: G1, name: "A & B", bytes: 21, assets: ["logo.png"] }]);
    }));

  it("reads a profile's files and nothing else", () =>
    withData(async (installed) => {
      expect(await installed.read(G1, ["Profile.xml"])).toContain("<Width>600</Width>");
      expect(String(await installed.read(G1, ["DisplayItems.xml"]))).toBe("<ArrayOfDisplayItem/>");
      expect(String(await installed.read(G1, ["assets", "logo.png"]))).toBe("png");
      expect(await installed.read(G1, ["assets", "missing.png"])).toBeNull();
      expect(await installed.read(G1, ["assets", ".."])).toBeNull();
      expect(await installed.read(G1, ["..", "profiles.xml"])).toBeNull();
      expect(await installed.read("../x", ["Profile.xml"])).toBeNull();
    }));

  it("is empty when InfoPanel is not installed", async () => {
    expect(await createInstalledProfiles(path.join(os.tmpdir(), "no-infopanel-here")).list()).toEqual([]);
  });
});
