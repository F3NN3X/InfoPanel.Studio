// The layout variants (look.json `layouts`): what each widget kind, the kiosk's alerts and the island draw besides their standard
// layout, so a Look can name one per kind, the user can override it per widget (Layout) and the validator can refuse an unknown kind
// or layout. Pure data plus two readers: the validator, the zones and the studio read it, and it loads no widget component.
import type { ModuleSetting } from "@/modules/types";
import type { WidgetLayout } from "./core/types";
import { meta as calendar } from "./calendar/meta";
import { meta as dayPlanner } from "./day-planner/meta";
import { meta as networkThroughput } from "./network-throughput/meta";
import { meta as notifications } from "./notifications/meta";
import { meta as sensorValue } from "./meta/SensorValue";
import { meta as steamFriends } from "./steam-friends/meta";
import { meta as systemOverview } from "./system-overview/meta";
import { meta as visualizer } from "./visualizer/meta";
import { meta as weather } from "./weather/meta";

/** Every kind's first layout: today's, which a Look that names none (and every old config) draws. */
export const STANDARD_LAYOUT = "standard";
/** The zone setting that overrides the Look's choice (`auto`: the Look's). */
export const LAYOUT_KEY = "lookLayout";

/** The layouts of the app's own chrome, named in `layouts` by these lower-case keys (no widget kind is lower case). */
export const CHROME_LAYOUTS: Readonly<Record<"alert" | "island", readonly WidgetLayout[]>> = {
  alert: [
    { id: STANDARD_LAYOUT, name: "Standard" },
    { id: "slab", name: "Tone slab" },
  ],
  island: [
    { id: STANDARD_LAYOUT, name: "Standard" },
    { id: "slab", name: "Tone slab" },
  ],
};

/** The widget kinds that offer layouts (`meta.layouts`); `tests/widgets/layouts.test.ts` holds this list to the registry. */
const WIDGETS = [calendar, dayPlanner, networkThroughput, notifications, sensorValue, steamFriends, systemOverview, visualizer, weather];

/** Every kind a Look may name in `layouts`, with the layouts it offers. */
export const LAYOUTS: Readonly<Record<string, readonly WidgetLayout[]>> = {
  ...Object.fromEntries(WIDGETS.map((m) => [m.id, m.layouts ?? []])),
  ...CHROME_LAYOUTS,
};

/** The kind's display name: the widget's, or the chrome's. */
export const layoutKindName = (kind: string): string =>
  kind === "alert" ? "Alerts" : kind === "island" ? "Island" : (WIDGETS.find((m) => m.id === kind)?.name ?? kind);

/** Whether `kind` offers `id` (a prototype key or a kind it does not know is no layout). */
export const offers = (kind: string, id: unknown): id is string =>
  typeof id === "string" && Object.hasOwn(LAYOUTS, kind) && LAYOUTS[kind].some((l) => l.id === id);

/**
 * The layout a zone of `kind` draws: the user's pick (`standard` keeps today's whatever the Look says), else the Look's, else the
 * standard one. Undefined means the standard layout, so a widget that draws today's writes the same markup as before.
 */
export function layoutOf(kind: string, looks: Readonly<Record<string, string>> | undefined, pick?: unknown): string | undefined {
  const chosen = offers(kind, pick) ? pick : looks && Object.hasOwn(looks, kind) && offers(kind, looks[kind]) ? looks[kind] : undefined;
  return chosen === STANDARD_LAYOUT ? undefined : chosen;
}

/** The inspector's Layout row for a widget that offers more than one layout: Auto follows the theme. */
export const layoutSetting = (layouts: readonly WidgetLayout[]): ModuleSetting => ({
  key: LAYOUT_KEY,
  label: "Layout",
  type: "select",
  default: "auto",
  options: [{ value: "auto", label: "Theme's choice" }, ...layouts.map((l) => ({ value: l.id, label: l.name }))],
  keywords: ["layout", "variant", "theme", "pack"],
  hint: "How this widget lays out its data. Theme's choice draws the layout the theme pack names for it, else the standard one.",
  group: "Layout",
});
