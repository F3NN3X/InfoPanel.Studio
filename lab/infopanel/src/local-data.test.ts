import { describe, expect, it } from "vitest";
import { isAssetName, isGuid, profilesFromXml } from "./local-data.ts";
import { parseProfileXml } from "@/lib/infopanel/parse.ts";

const G1 = "70538526-f13f-4074-bb42-f6892d6e42d4";

describe("profilesFromXml", () => {
  const xml =
    '<?xml version="1.0"?><ArrayOfProfile xmlns:xsi="x">' +
    `<Profile><Guid>${G1}</Guid><Name>A &amp; B</Name><Width>600</Width></Profile>` +
    "<Profile><Guid>../../etc</Guid><Name>bad</Name></Profile>" +
    "</ArrayOfProfile>";

  it("lists each profile with its own element, skipping invalid guids", () => {
    const list = profilesFromXml(xml);
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
