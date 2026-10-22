// What the Countdown widget sends to the Dynamic Island (`src/lib/island/sources.ts`): the largest
// unit left (or "Happening now" / "N days ago") beside the time, refreshed with every data update.
import { breakdownOf, isDate, isTime, phaseOf, targetOf, unitWord } from "@/lib/countdown";
import type { DataSourceDef, SourceActivity } from "@/lib/island/sources";
import type { ModuleSettings } from "@/modules/types";
import { oneOf } from "../registry/settings-kit";

/** The activity for the widget's settings at `now`; null while no valid date is set. */
export function countdownActivity(settings: ModuleSettings, now: Date): SourceActivity | null {
  const time = isTime(settings.time) ? settings.time : "";
  const target = isDate(settings.date) ? targetOf(settings.date, time) : null;
  if (!target) return null;
  const phase = phaseOf(now, target, oneOf(settings.count, ["auto", "until", "since"]) ?? "auto", time === "");
  const first = breakdownOf(now, target, oneOf(settings.breakdown, ["auto", "days", "years", "live"]) ?? "auto")[0];
  const left = phase === "now" ? "Happening now" : `${first.value} ${unitWord(first)}${phase === "since" ? " ago" : ""}`;
  const name = typeof settings.eventName === "string" ? settings.eventName.trim() : "";
  return { id: "countdown", title: left, subtitle: name || "Countdown", color: "#f59e0b" };
}

export const countdownIsland: DataSourceDef = {
  from: "data",
  hint: "The time left beside the clock",
  defaultOn: false,
  group: "Event",
  derive: (_prev, _next, settings) => ({ activity: countdownActivity(settings, new Date()) }),
};
