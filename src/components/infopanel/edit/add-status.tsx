/**
 * The Add panel's Export check statuses (Edit v3 SPEC §9.3–§9.5), loaded on a screen made for InfoPanel: what an export
 * makes of each tile's new part, from the same check the editor runs (a widget at its default rule, an element as the
 * palette makes it, an InfoPanel item as itself), and the icons and words the tiles and the details card show.
 */
import type { UserPanelPreset } from "@/lib/layout";
import { checkItems, STATUS_ORDER, STATUS_SHORT, widgetItemRow, type CheckStatus } from "@/lib/infopanel/export-check";
import { newComposite, newCores, newElement, isComposite } from "@/lib/infopanel/elements/create";
import { ELEMENTS } from "@/lib/infopanel/elements/entries";
import { defaultPalette } from "@/lib/infopanel/elements/palette";
import { newStored, readStored } from "@/lib/infopanel/import/stored";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { AddItem } from "@/components/studio/add-catalog";
import type { AddStatusKit } from "@/components/studio/add-tile-card";
import { STATUS_UI, StatusIcon } from "../export-check-panel";
import { addedMessage, widgetRecordFor } from "./widget-add";

/** The worst of some statuses (left out over a picture over approximated over as is). */
const worst = (statuses: readonly CheckStatus[]): CheckStatus => STATUS_ORDER.find((s) => statuses.includes(s)) ?? "ok";

/** Each element's status as the palette makes it: a group element's worst part. */
function elementStatuses(): Map<string, CheckStatus> {
  const { profile } = readStored(newStored({ name: "Add", width: 800, height: 480, now: new Date(0) }));
  const palette = defaultPalette(profile);
  return new Map(
    ELEMENTS.map((e) => {
      const item: DisplayItem =
        e.type === "cores" ? newCores(profile, palette, [], 0, 0) : isComposite(e.type) ? newComposite(e.type, profile, palette, [], 0, 0) : newElement(e.type, profile, palette);
      return [`element:${e.type}`, worst(checkItems([item], false).rows.map((r) => r.status))];
    }),
  );
}

/** The kit for the widget rows `widgets` (and the saved panels they may name). */
export function addStatusKit(widgets: readonly AddItem[], saved?: UserPanelPreset[]): AddStatusKit {
  const byKey = elementStatuses();
  for (const row of widgets) {
    const widget = widgetRecordFor(row, saved);
    const r = widget && widgetItemRow(newWidgetItem(widget, { x: 0, y: 0, w: 1, h: 1 }, row.name), "0");
    if (r) byKey.set(row.id, r.status);
  }
  return {
    of: (tile) => (tile.kind === "item" ? "ok" : byKey.get(tile.key)),
    Icon: StatusIcon,
    word: STATUS_SHORT,
    text: { ok: STATUS_UI.ok.text, approx: STATUS_UI.approx.text, pic: STATUS_UI.pic.text, out: STATUS_UI.out.text },
    added: (tile) => {
      const widget = tile.widget && widgetRecordFor(tile.widget, saved);
      return widget ? addedMessage(tile.name, widget) : `${tile.name} added. On InfoPanel export it exports as an InfoPanel item.`;
    },
  };
}
