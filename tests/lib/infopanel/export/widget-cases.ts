/**
 * A Free page with Studio widget items exported each way (one-editor SPEC §7.4): a Weather widget recreated (its
 * picture and its values spliced in as one Group), one as a snapshot (a stand-in picture), one left out, and a Timer, which
 * can't convert. The conversion's DOM reading is the editor's (widget-export.ts); this case writes what it splices in,
 * so the export test and import-check (lab/infopanel/scripts/import-check.mts) see the items InfoPanel gets.
 */
import { assetFile, type Doc } from "../../../../src/lib/infopanel/assets/assets.ts";
import { storeItems } from "../../../../src/lib/infopanel/canvas-edit.ts";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import { newItem } from "../../../../src/lib/infopanel/editor/create.ts";
import { infopanelFile } from "../../../../src/lib/infopanel/export/studio-export.ts";
import { newStored, readStored } from "../../../../src/lib/infopanel/import/stored.ts";
import { make, type ConvertContext } from "../../../../src/lib/infopanel/native/items.ts";
import { CONVERTERS } from "../../../../src/lib/infopanel/native/modules/index.ts";
import { joinFiles, newWidgetItem, placeConverted, replaceWidgets, widgetBox, widgetOf, widgetRule } from "../../../../src/lib/infopanel/native/widget-item.ts";
import { defaultItem, type DisplayItem, type Profile } from "../../../../src/lib/infopanel/schema.ts";
import { png } from "./element-cases.ts";
import { NATIVE_SENSORS } from "./native-cases.ts";

export const WIDGET_CASE = "Widgets-14a";

/** The page as the editor holds it: InfoPanel items and widget items, one per rule. */
export function widgetPage(profile: Profile): DisplayItem[] {
  const box = (y: number) => ({ x: 20, y, w: 360, h: 140 });
  return [
    { ...newItem("Text", profile), Name: "Title", X: 20, Y: 0 } as DisplayItem,
    newWidgetItem({ module: "Weather" }, box(20), "Weather"),
    newWidgetItem({ module: "Weather", onInfoPanel: "snapshot" }, box(180), "Weather picture"),
    newWidgetItem({ module: "Weather", onInfoPanel: "leave" }, box(340), "Weather left out"),
    newWidgetItem({ module: "Timer" }, box(500), "Timer"),
  ];
}

/** The page with each widget converted by its rule, its pictures as stand-ins, and the exported .infopanel bytes. */
export async function widgetExport(base: Profile): Promise<{ profile: Profile; doc: Doc; bytes: Uint8Array; page: DisplayItem[] }> {
  const named = { ...base, Name: WIDGET_CASE, Width: 800, Height: 700 };
  const stored = JSON.parse(JSON.stringify(storeItems(newStored({ name: WIDGET_CASE, width: named.Width, height: named.Height }), named, widgetPage(named))));
  const { profile, items } = readStored(stored);
  const ctx: ConvertContext = { look: profile, palette: defaultPalette(profile), sensors: NATIVE_SENSORS, notes: [] };
  const shot = await assetFile("Weather_picture_1.png", png(360, 140, 14), "added");
  let assets: Doc["assets"] = new Map();
  const made = new Map<string, DisplayItem[]>();
  for (const [i, host] of items.entries()) {
    const widget = widgetOf(host);
    if (!widget) continue;
    const rule = widgetRule(widget);
    const b = widgetBox(host);
    if (rule === "recreate") {
      // As the conversion makes it: the widget's picture with its values hidden, the values on top, in one Group.
      const back = await assetFile("Weather_background_1.png", png(360, 140, 15), "added");
      const chrome = make("Image", ctx, b, "Weather background", { Type: "FILE", FilePath: back.name, RelativePath: true });
      const group = { ...defaultItem("Group"), Name: "Weather", X: b.x, Y: b.y, DisplayItems: [chrome, ...CONVERTERS.Weather(b, ctx, {})] } as DisplayItem;
      const joined = joinFiles(assets, [back], [group]);
      assets = joined.assets;
      made.set(String(i), placeConverted(joined.items, host, rule));
    }
    if (rule === "snapshot") {
      const image = make("Image", ctx, b, host.Name, { Type: "FILE", FilePath: shot.name, RelativePath: true });
      const joined = joinFiles(assets, [shot], [image]);
      assets = joined.assets;
      made.set(String(i), placeConverted(joined.items, host, rule));
    }
  }
  const doc: Doc = { items: replaceWidgets(items, (_, path) => made.get(path) ?? []), assets };
  return { profile, doc, page: items, bytes: infopanelFile(profile, doc).bytes };
}
