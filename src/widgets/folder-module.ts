// A folder widget (`src/widgets/<kebab-id>/widget.ts`) as the DashboardModule the registry groups make: templateModule
// does the work, and the inspector data rides along for `registry.ts`, as `INSPECTOR_META` does for the group widgets.
import type { DashboardModule } from "@/modules/types";
import type { WidgetDefinition } from "./define";
import { lazyWidget } from "./lazy-widget";
import { templateModule } from "./module";
import type { InspectorMeta } from "./registry/inspector-meta";

export const folderModule = <P extends object>(d: WidgetDefinition<P>): DashboardModule & { inspectorMeta: InspectorMeta } => ({
  ...templateModule({ meta: d.meta, Component: lazyWidget(d.render.load), settings: d.settings, toProps: d.render.toProps, prefixes: d.render.reads, title: d.render.title, base: d.render.base, island: d.island }),
  ...(d.railSettings ? { railSettings: d.railSettings } : {}),
  inspectorMeta: d.inspector,
});
