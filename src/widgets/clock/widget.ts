// Clock: the time and date as a digital, analog, line, figure or stacked face (the stacked one is its rail preset's). What the registry needs; the component is its own
// chunk.
import { clockOf } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { DENSE, defineWidget } from "../define";
import { boolSetting, enumSetting, formatSetting, pass } from "../shared/settings-kit";
import type { ClockProps } from "./Clock";
import { meta } from "./meta";

export default defineWidget({
  meta,
  // The title only, a dense view of its own; the clock format.
  inspector: { header: "title-only", compact: DENSE, fmt: ["clock"] },
  settings: [
    enumSetting("face", "Face", "digital", [{ value: "digital", label: "Digital" }, { value: "analog", label: "Analog" }, { value: "line", label: "Line" }, { value: "figure", label: "Figure" }, { value: "stacked", label: "Stacked" }], { group: "Face" }),
    boolSetting("showSeconds", "Seconds", true, { group: "Time & date" }),
    boolSetting("showDate", "Date", true, { group: "Time & date" }),
    // Themed (config v7 moved the Clock's `format` here); 24 h stays this widget's own default.
    formatSetting("clock", { default: "24" }),
  ],
  render: {
    load: () => import("./Clock"),
    toProps: (s: ModuleSettings): Partial<ClockProps> => {
      const clock = clockOf(s);
      return { ...pass<Partial<ClockProps>>("showSeconds", "showDate", "face")(s), format: clock === "12" ? "12h" : clock === "24" ? "24h" : "auto" };
    },
  },
  // Migrations and sample stay central (the default): settings-migrate.ts has its v7 `format` → `clock`, title-only and
  // no-card entries; the sample is src/widgets/__fixtures__/snapshot.json, with no widget-qa demo settings. It draws
  // without sensor keys (module.tsx SENSORLESS).
});
