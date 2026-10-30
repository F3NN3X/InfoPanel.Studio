// The template widgets as dashboard modules; `src/modules/index.ts` appends them to the registry.
import { isDeviceKind, type DashboardModule } from "@/modules/types";
import { GROUP_A } from "./registry/a";
import { GROUP_B } from "./registry/b";
import { GROUP_C } from "./registry/c";
import { GROUP_D } from "./registry/d";
import { GROUP_E } from "./registry/e";
import { GROUP_HISTORY } from "./registry/history";
import { GROUP_STREAM_AUDIO } from "./registry/stream-audio";
import { GROUP_STREAM_OBS } from "./registry/stream-obs";
import { TIME_WIDGETS } from "./registry/time";
import { fitSettings, INSPECTOR_META } from "./registry/inspector-meta";

/** The device kind of a widget's `device` / `devices` row. */
const deviceKindOf = (m: DashboardModule): DashboardModule["deviceKind"] => {
  const from = m.settings?.find((d) => d.key === "device" || d.key === "devices")?.optionsFrom;
  return isDeviceKind(from) ? from : undefined;
};

/** Each with its inspector metadata (header, small zones, ...; `inspector-meta.ts`) and the Fit rows it can draw. */
export const TEMPLATE_MODULES: DashboardModule[] = [...GROUP_A, ...GROUP_B, ...GROUP_C, ...GROUP_D, ...GROUP_E, ...TIME_WIDGETS, ...GROUP_HISTORY, ...GROUP_STREAM_AUDIO, ...GROUP_STREAM_OBS].map((m) => {
  const meta = INSPECTOR_META[m.id];
  const kind = deviceKindOf(m);
  return {
    ...m,
    ...meta,
    ...(meta ? { settings: fitSettings(m.settings ?? [], meta.compact) } : {}),
    ...(kind ? { deviceKind: kind } : {}),
  };
});
