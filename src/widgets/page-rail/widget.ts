// Page Rail: the pinned layer's rail (decision 8). What the registry needs; the component is its own chunk. Its slots are
// stored on the pinned item (`PinnedItem.rail`, src/lib/pinned.ts), not in its settings (but for the chip's overrides, `chipItem`); the screen it is on gives it the
// pages, the page shown and the actions (`src/components/rail-host.ts`).
import { defineWidget, NONE } from "../define";
import { boolSetting } from "../shared/settings-kit";
import type { PageRailProps } from "./PageRail";
import { meta } from "./meta";

export default defineWidget({
  meta,
  inspector: { header: "none", compact: NONE },
  settings: [
    boolSetting("chip", "Profile chip", true, { group: "Rail", tab: "show" }),
    boolSetting("pageLock", "Page lock", true, { group: "Rail", tab: "show", hint: "Auto or Locked, when the profile rotates its pages." }),
    boolSetting("clock", "Clock", true, { group: "Rail", tab: "show", hint: "The Clock at its rail preset, at the foot." }),
  ],
  render: {
    load: () => import("./PageRail"),
    // `chipItem` is not a listed setting, so the resolved `s` has no such key: it is read from the saved values
    toProps: (s, saved): Pick<PageRailProps, "chip" | "chipItem" | "pageLock" | "clock"> => ({ chip: s.chip !== false, ...(typeof saved?.chipItem === "string" ? { chipItem: saved.chipItem } : {}), pageLock: s.pageLock !== false, clock: s.clock !== false }),
  },
  // Migrations stay central; the sample is the central fixture data: without a screen around it (Widget QA, a preview) the
  // rail draws a sample profile's five pages.
});
