import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { infopanelExport } from "@/lib/infopanel/export/write.ts";
import { widgetPaths } from "@/lib/infopanel/native/widget-item.ts";
import { fullProfile } from "./kind-cases.ts";
import { widgetExport } from "./widget-cases.ts";

describe("Studio widget items, exported for InfoPanel each way", () => {
  it("writes a recreated widget as one Group, a snapshot as its Image, and nothing for the rest", async () => {
    const made = await widgetExport(fullProfile());
    expect(widgetPaths(made.page)).toHaveLength(4);
    const read = await loadExport(entriesFromZip(made.bytes));
    expect(read.items.map((i) => [i.kind, i.Name])).toEqual([
      ["Text", "Title"],
      ["Group", "Weather"],
      ["Image", "Weather picture"],
    ]);
    const group = read.items[1] as Extract<(typeof read.items)[number], { kind: "Group" }>;
    // Recreate is the widget's picture with its values on top: the picture and its file come back on reimport.
    expect(group.DisplayItems[0]).toMatchObject({ kind: "Image", FilePath: "Weather_background_1.png", RelativePath: true });
    expect(group.DisplayItems.length).toBeGreaterThan(1);
    expect(read.items[2]).toMatchObject({ FilePath: "Weather_picture_1.png", RelativePath: true });
    expect([...read.assets.keys()].sort()).toEqual(["weather_background_1.png", "weather_picture_1.png"]);
  });

  it("an unconverted widget item never reaches the file", async () => {
    const made = await widgetExport(fullProfile());
    expect(infopanelExport(made.profile, made.page, [])).toEqual(infopanelExport(made.profile, made.page.slice(0, 1), []));
  });
});
