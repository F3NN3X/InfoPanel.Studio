import { describe, expect, it } from "vitest";
import type { AssetFile } from "@/lib/infopanel/assets/assets";
import { tableOf } from "@/lib/infopanel/assets/assets";
import { openCanvas } from "@/lib/infopanel/canvas";
import { isGauge } from "@/lib/infopanel/gauges/frames";
import { toStored } from "@/lib/infopanel/import/stored";
import { parseProfileXml } from "@/lib/infopanel/parse";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { libraryFramesOf } from "./canvas-gauge";

const profile = parseProfileXml("<Profile><Name>Rig</Name><Width>800</Width><Height>480</Height></Profile>").profile;
const file = (name: string, hash: string, type: AssetFile["type"] = "png"): AssetFile => ({ name, bytes: new Uint8Array(3), hash, type, origin: "export" });
const frame = (name: string) => ({ ...defaultItem("Image"), Name: name, Type: "FILE", FilePath: name, RelativePath: true });

function gaugeWith(files: AssetFile[], names: string[]) {
  const item = { ...defaultItem("Gauge"), Images: names.map(frame) } as DisplayItem;
  const stored = toStored({ name: "Rig", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: [item], fonts: [], assets: tableOf(files), keyOf: () => null });
  const open = openCanvas(stored);
  return { open, item: open.items[0] };
}

describe("libraryFramesOf", () => {
  it("names each frame by its store id and file name, in order", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const { open, item } = gaugeWith([file("One.PNG", a), file("two.jpg", b, "jpeg")], ["one.png", "two.jpg"]);
    expect(isGauge(item)).toBe(true);
    if (isGauge(item)) expect(libraryFramesOf(open, item)).toEqual([{ id: `${a}.png`, name: "One.PNG" }, { id: `${b}.jpg`, name: "two.jpg" }]);
  });

  it("keeps a repeated frame in place", () => {
    const a = "a".repeat(64);
    const { open, item } = gaugeWith([file("f.png", a)], ["f.png", "f.png"]);
    if (isGauge(item)) expect(libraryFramesOf(open, item)?.map((f) => f.id)).toEqual([`${a}.png`, `${a}.png`]);
  });

  it("is null for no frames, a frame that is no asset, or a type the store does not hold", () => {
    const a = "a".repeat(64);
    const none = gaugeWith([], []);
    if (isGauge(none.item)) expect(libraryFramesOf(none.open, none.item)).toBeNull();
    const missing = gaugeWith([file("f.png", a)], ["f.png", "gone.png"]);
    if (isGauge(missing.item)) expect(libraryFramesOf(missing.open, missing.item)).toBeNull();
    const other = gaugeWith([file("f.dat", a, "other")], ["f.dat"]);
    if (isGauge(other.item)) expect(libraryFramesOf(other.open, other.item)).toBeNull();
  });
});
