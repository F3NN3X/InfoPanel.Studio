/// <reference types="vite/client" />
// The writer's element order and spelling against InfoPanel's own files: every corpus item and profile, element by
// element. A newer InfoPanel adds fields the file lacks, so only the elements a file has are compared; what it has
// must come in the order InfoPanel writes it (XmlSerializer: declared members, then generated ones).
import { describe, expect, it } from "vitest";
import { displayItemsXml, profileXml } from "@/lib/infopanel/export/write.ts";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import { PROFILE, SCHEMAS } from "@/lib/infopanel/schema.ts";
import { parseXml, type XmlElement } from "@/lib/infopanel/xml.ts";

const xml = import.meta.glob<string>("../corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const ids = [...new Set(Object.keys(xml).map((k) => k.split("/").at(-2) as string))];

const names = (el: XmlElement) => el.children.map((c) => c.name);

/** Every item element of a document in order, with its group children and gauge frames. */
function itemElements(els: XmlElement[]): XmlElement[] {
  return els.flatMap((el) => [el, ...itemElements(el.children.find((c) => c.name === "DisplayItems")?.children ?? []), ...itemElements(el.children.find((c) => c.name === "Images")?.children ?? [])]);
}

/** Our element names for the original's, restricted to what the original has (and, for the original, what we know). */
function compare(original: XmlElement, ours: XmlElement, known: ReadonlySet<string>) {
  const have = new Set(names(original));
  return { original: names(original).filter((n) => known.has(n) || n === "_valueType"), ours: names(ours).filter((n) => have.has(n) && (known.has(n) || n === "_valueType")) };
}

describe.skipIf(ids.length === 0)("writer order against InfoPanel's own files", () => {
  it.each(ids)("%s: Profile.xml", (id) => {
    const text = xml[`../corpus/${id}/Profile.xml`];
    const { original, ours } = compare(parseXml(text), parseXml(profileXml(parseProfileXml(text).profile)), new Set(Object.keys(PROFILE)));
    expect(ours).toEqual(original);
  });

  it.each(ids)("%s: DisplayItems.xml", (id) => {
    const text = xml[`../corpus/${id}/DisplayItems.xml`];
    const older = !text.includes("<Wrap>");
    const original = itemElements(parseXml(text).children);
    const ours = itemElements(parseXml(displayItemsXml(parseDisplayItemsXml(text).items)).children);
    expect(ours.length).toBe(original.length);
    const bad: string[] = [];
    original.forEach((el, i) => {
      const type = ours[i].attrs["xsi:type"]?.replace("DisplayItem", "") ?? "Image";
      const schema = (SCHEMAS as Record<string, object>)[type];
      // An older InfoPanel (no Wrap in any text item) laid text and image items out differently: RightAlign before Uppercase, Rotation late.
      if (older && ("Font" in schema || "ShowPanel" in schema)) return;
      const known = new Set(Object.keys(schema));
      const c = compare(el, ours[i], known);
      if (JSON.stringify(c.ours) !== JSON.stringify(c.original)) bad.push(`${i} ${type}: ${c.original.join(",")}\n   written ${c.ours.join(",")}`);
    });
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it("writes empty text as XmlSerializer does", () => {
    const profile = ids.map((id) => xml[`../corpus/${id}/Profile.xml`]).find((text) => text.includes("<WebViewUrl />")) as string;
    expect(profile).toBeDefined();
    expect(profileXml(parseProfileXml(profile).profile)).toContain("<WebViewUrl />");
  });
});
