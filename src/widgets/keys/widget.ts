// Keys: Studio's own key grid (pinned layer P7, owner Q2). What the registry needs; the component is its own chunk. Its keys
// are stored on the placement (`Placement.keys`, src/lib/keys.ts), not in its settings; the screen runs their actions
// (`src/components/rail-host.ts`). The Elgato Stream Deck widget is a different widget and stays as it is.
import { defineWidget, NONE } from "../define";
import { boolSetting, numberSetting } from "../shared/settings-kit";
import type { KeysProps } from "./Keys";
import { meta } from "./meta";

export default defineWidget({
  meta,
  inspector: { header: "yes", compact: NONE },
  settings: [
    numberSetting("columns", "Columns", 0, { group: "Grid", tab: "show", min: 0, max: 12, hint: "0 picks them from the widget's shape." }),
    boolSetting("legend", "Legend", false, { group: "Grid", tab: "show", hint: "Says what one dot and two dots mean, in the header." }),
  ],
  render: {
    load: () => import("./Keys"),
    toProps: (s): Pick<KeysProps, "columns" | "legend"> => ({
      columns: typeof s.columns === "number" && s.columns > 0 ? Math.min(12, Math.round(s.columns)) : undefined,
      legend: s.legend === true,
    }),
  },
});
