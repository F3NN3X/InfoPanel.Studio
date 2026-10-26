// Template widgets, group A: system and hardware (see docs/redesign/phase9/brief-9.3c-templates.md).
import type { DashboardModule } from "@/modules/types";
import { templateModule } from "../module";
import { lazyWidget } from "../lazy-widget";
import * as M from "../meta";
import { THERMALS_SETTINGS } from "./hardware-settings";
import * as S from "./a-settings";
import { SYSTEM_OVERVIEW_SETTINGS, systemOverviewProps } from "./system-overview";

export const GROUP_A: DashboardModule[] = [
  templateModule({
    meta: M.SystemOverview,
    Component: lazyWidget(() => import("../SystemOverview")),
    settings: SYSTEM_OVERVIEW_SETTINGS,
    toProps: systemOverviewProps,
  }),
  templateModule({ meta: M.MenuBar, Component: lazyWidget(() => import("../MenuBar")), settings: S.MENUBAR_SETTINGS, toProps: S.menuBarProps }),
  templateModule({ meta: M.KpiTiles, Component: lazyWidget(() => import("../KpiTiles")), settings: S.KPITILES_SETTINGS, toProps: S.kpiTilesProps }),
  templateModule({ meta: M.StatusTracker, Component: lazyWidget(() => import("../StatusTracker")), settings: S.STATUSTRACKER_SETTINGS, toProps: S.statusTrackerProps }),
  templateModule({ meta: M.SystemStatus, Component: lazyWidget(() => import("../SystemStatus")), settings: S.SYSTEMSTATUS_SETTINGS, toProps: S.systemStatusProps }),
  templateModule({ meta: M.Vitals, Component: lazyWidget(() => import("../Vitals")), settings: S.VITALS_SETTINGS, toProps: S.vitalsProps }),
  templateModule({ meta: M.ServiceHealth, Component: lazyWidget(() => import("../ServiceHealth")), settings: S.SERVICEHEALTH_SETTINGS, toProps: S.serviceHealthProps }),
  templateModule({ meta: M.ProcessList, Component: lazyWidget(() => import("../ProcessList")), settings: S.PROCESSLIST_SETTINGS, toProps: S.processListProps }),
  templateModule({ meta: M.Uptime, Component: lazyWidget(() => import("../Uptime")), settings: S.UPTIME_SETTINGS, toProps: S.uptimeProps }),
  templateModule({ meta: M.CpuMonitor, Component: lazyWidget(() => import("../CpuMonitor")), settings: S.CPUMONITOR_SETTINGS, toProps: S.cpuMonitorProps }),
  templateModule({ meta: M.CoreHeatmap, Component: lazyWidget(() => import("../CoreHeatmap")), settings: S.COREHEATMAP_SETTINGS, toProps: S.coreHeatmapProps }),
  templateModule({ meta: M.GpuRings, Component: lazyWidget(() => import("../GpuRings")), settings: S.GPURINGS_SETTINGS, toProps: S.gpuRingsProps }),
  templateModule({ meta: M.GpuMonitor, Component: lazyWidget(() => import("../GpuMonitor")), settings: S.GPUMONITOR_SETTINGS, toProps: S.gpuMonitorProps }),
  templateModule({ meta: M.MemoryUsage, Component: lazyWidget(() => import("../MemoryUsage")), settings: S.MEMORYUSAGE_SETTINGS, toProps: S.memoryUsageProps }),
  templateModule({ meta: M.Thermals, Component: lazyWidget(() => import("../Thermals")), settings: [...THERMALS_SETTINGS, ...S.THERMALS_EXTRA_SETTINGS], toProps: S.thermalsProps }),
  templateModule({ meta: M.PowerDraw, Component: lazyWidget(() => import("../PowerDraw")), settings: S.POWERDRAW_SETTINGS, toProps: S.powerDrawProps }),
  templateModule({ meta: M.Fans, Component: lazyWidget(() => import("../Fans")), settings: S.FANS_SETTINGS, toProps: S.fansProps }),
];
