import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ActionLayer from "@/components/action-confirm";
import { AlertLayer } from "@/components/alerts/alert-layer";
import { DynamicIsland } from "@/components/island/dynamic-island";
import { pageSkinOf } from "@/components/island/island-look";
import { RailHostContext, RailItemContext, type RailHost } from "@/components/rail-host";
import { LivePlacement, placementContent } from "@/components/studio/placement-content";
import { loadWidgetPresets } from "@/components/studio/widget-presets";
import { DEFAULT_ALERT_DISPLAY, type ActiveAlert, type AlertDisplayFull, type Severity } from "@/lib/alerts";
import { createIslandBus, type IslandBus } from "@/lib/island/bus";
import { ISLAND_DEFAULTS, type IslandConfig } from "@/lib/island/config";
import type { Placement } from "@/lib/layout";
import type { RailSlot } from "@/lib/pinned";
import type { Appearance } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { checkAdoption, type CheckOptions, type Flag } from "./adoption";
import { SENSORS } from "./Frame";
import { QA_RAIL_PAGES, qaRailSlots, type QaRailWidget } from "./surfaces-plan";

/**
 * The app's own surfaces on the QA page, drawn by the kiosk's components under the worn Look: the page rail (a slot of every kind and
 * every widget with a rail preset, then the rail a kiosk draws by default), the alerts in each tone and the banner, the island in each
 * state, and the action note toast. Each is a `[data-qa-surface]` frame the adoption check reads; the rail is chrome (`data-qa-chrome`):
 * a pack decoration on any of its items is flagged.
 */

export interface SurfaceView {
  appearance?: Appearance;
  live: boolean;
  adoption?: CheckOptions;
}

/** A widget a rail slot draws, as the kiosk's rail host draws it (App.tsx `railHost.zone`): its zone content in the slot's box. */
function SlotZone({ p, style, view }: { p: Placement; style: CSSProperties; view: SurfaceView }) {
  if (view.live) return <LivePlacement placement={p} appearance={view.appearance}>{({ content, scope }) => <div style={{ ...style, ...scope }}>{content}</div>}</LivePlacement>;
  const r = placementContent(p, SENSORS, [], view.appearance);
  return <div style={{ ...style, ...r.scope }}>{r.content}</div>;
}

/** How long a surface gets to settle before the adoption check reads it (as a frame's, `SETTLE_MS`). */
const SETTLE_MS = 1500;

/** One surface: its box (what the check reads), a caption and its flags. */
function SurfaceFigure({ name, view, chrome, caption, style, children }: { name: string; view: SurfaceView; chrome?: boolean; caption: string; style: CSSProperties; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const { adoption } = view;
  useEffect(() => {
    if (!adoption) return setFlags([]);
    const t = setTimeout(() => box.current && setFlags(checkAdoption(box.current, { ...adoption, chrome })), SETTLE_MS);
    return () => clearTimeout(t);
  }, [adoption, chrome]);
  return (
    <figure data-qa-surface={name} data-qa-chrome={chrome ? "" : undefined} className="m-0 flex flex-col gap-1">
      <div ref={box} data-qa-box className="relative" style={style}>
        {children}
      </div>
      <figcaption className="flex items-center gap-2 font-mono text-nano">
        <span className="opacity-60">{caption}</span>
        {adoption && flags.length > 0 && (
          <span data-qa-flags={flags.length} title={flags.map((f) => `${f.kind} ${f.prop} ${f.value}  ${f.at}`).join("\n")} className="rounded bg-amber-500/20 px-1 text-amber-400">
            {flags.length} theme {flags.length === 1 ? "flag" : "flags"}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** The widgets with a rail preset (as the rail editor lists them), each with the preset's view and settings. */
function useRailWidgets(): readonly QaRailWidget[] {
  const [list, setList] = useState<readonly QaRailWidget[]>([]);
  useEffect(() => {
    let alive = true;
    void loadWidgetPresets().then((map) => {
      if (!alive) return;
      setList(
        Object.entries(map).flatMap(([module, presets]) =>
          presets.filter((p) => p.size === "rail").map((p) => {
            const mod = modules.find((m) => m.id === module);
            return { module, name: `${mod?.title ?? module} · ${p.name}`, settings: { ...(p.view ? { [mod?.viewKey ?? "view"]: p.view } : {}), ...p.settings } };
          })
        )
      );
    });
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

const RAIL_W = 84;
const alert = (id: string, severity: Severity, title: string, text: string, display: Partial<AlertDisplayFull>, page?: string): ActiveAlert => ({
  id,
  ruleId: id,
  name: title,
  severity,
  title,
  text,
  startedAt: Date.now(),
  acknowledged: false,
  // no countdown: the cards stay while the page is read
  display: { ...DEFAULT_ALERT_DISPLAY, seconds: 0, ...display },
  ...(page ? { page: { page } } : {}),
});

/** The rail's sample alert: the Mixer page's badge. */
const RAIL_ALERTS = [alert("rail", "critical", "Mic clipping", "", { style: "toast" }, "mixer")];

/** A rail as a kiosk draws it: the PageRail zone in a pinned item's box, its host the screen's (pages, lock, alerts, slot widgets). */
function Rail({ slots, view }: { slots: readonly RailSlot[] | undefined; view: SurfaceView }) {
  const host: RailHost = useMemo(
    () => ({ pages: QA_RAIL_PAGES, current: "keys", profile: { id: "main", name: "Main", index: 0 }, lock: "auto", alerts: RAIL_ALERTS, run: () => {}, zone: (p, style) => <SlotZone p={p} style={style} view={view} /> }),
    [view]
  );
  const item = useMemo(() => ({ slots, edge: "left" as const }), [slots]);
  const rail: Placement = { id: "qa-rail", module: "PageRail", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true };
  return (
    <RailHostContext.Provider value={host}>
      <RailItemContext.Provider value={item}>
        <SlotZone p={rail} style={{ position: "absolute", inset: 0 }} view={view} />
      </RailItemContext.Provider>
    </RailHostContext.Provider>
  );
}

const ALERTS: ActiveAlert[] = [
  alert("qa-info", "info", "Backup done", "Nightly backup finished in 4 min", { position: "bottom-left" }),
  alert("qa-warning", "warning", "GPU hot", "GPU at 84 °C for 2 min", { position: "bottom" }),
  alert("qa-critical", "critical", "Drive failing", "Disk 2 reports reallocated sectors", { position: "bottom-right" }),
  alert("qa-banner", "warning", "Data API", "InfoPanel's Data API is not answering", { style: "banner" }),
];

/** A box the kiosk's fixed layers (the alerts, the action note) are drawn in: a transform makes it their containing block. */
const contained = (width: number, height: number): CSSProperties => ({ width, height, transform: "translateZ(0)", overflow: "hidden" });

interface IslandState {
  name: string;
  config: Partial<IslandConfig>;
  play: (bus: IslandBus) => void;
}

const notice = (severity: Severity, title: string, body: string) => (bus: IslandBus) => bus.notify({ source: "qa", id: severity, severity, title, body, ttl: 0 });
const ISLAND_STATES: IslandState[] = [
  { name: "idle", config: {}, play: () => {} },
  { name: "idle-date", config: { idle: "time-date" }, play: () => {} },
  { name: "line", config: { idle: "line" }, play: () => {} },
  { name: "skin", config: { placement: "skin" }, play: () => {} },
  { name: "expanded-info", config: {}, play: notice("info", "Build finished", "web · 42 s") },
  { name: "expanded-warning", config: {}, play: notice("warning", "GPU hot", "84 °C for 2 min") },
  { name: "expanded-critical", config: {}, play: notice("critical", "Drive failing", "Disk 2 reallocated sectors") },
  // the notice collapses after a second: the time with its badge
  { name: "compact", config: { collapseAfter: 1 }, play: notice("warning", "GPU hot", "84 °C") },
  { name: "activity", config: {}, play: (bus) => bus.setActivity({ source: "qa", id: "agent", title: "Claude Code", subtitle: "Thinking", progress: 0.4, pulse: true }) },
];

function IslandFrame({ state, view }: { state: IslandState; view: SurfaceView }) {
  const bus = useMemo(() => createIslandBus(), []);
  const config = useMemo(() => ({ ...ISLAND_DEFAULTS, ...state.config }), [state.config]);
  useEffect(() => state.play(bus), [bus, state]);
  const skin = useMemo(() => pageSkinOf(view.appearance), [view.appearance]);
  return (
    <SurfaceFigure name={`island-${state.name}`} view={view} caption={`island · ${state.name}`} style={{ width: 560, height: 150, overflow: "hidden" }}>
      <DynamicIsland config={config} alerts={[]} placement="absolute" page={{ width: 1280, height: 720 }} skin={skin} bus={bus} />
    </SurfaceFigure>
  );
}

export function Surfaces({ view }: { view: SurfaceView }) {
  const widgets = useRailWidgets();
  const slots = useMemo(() => qaRailSlots(widgets), [widgets]);
  // the rail a kiosk draws for a screen of these pages with the battery slot: one slot per page, then the device status
  const kiosk = useMemo(() => [...qaRailSlots([]).filter((s) => s.group === "pages"), ...slots.filter((s) => s.target.kind === "widget" && s.target.module === "DeviceBatteries").slice(0, 1)], [slots]);
  const lookId = pageSkinOf(view.appearance).lookId;
  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-start gap-6">
        <SurfaceFigure name="rail" view={view} chrome caption={`page rail · every slot kind · ${widgets.length} rail widgets`} style={{ width: RAIL_W, height: 1500 }}>
          <Rail slots={slots} view={view} />
        </SurfaceFigure>
        <SurfaceFigure name="rail-kiosk" view={view} chrome caption="page rail · a kiosk's (550 px)" style={{ width: RAIL_W, height: 550 }}>
          <Rail slots={kiosk} view={view} />
        </SurfaceFigure>
        <div className="flex flex-col gap-4">
          <SurfaceFigure name="alerts" view={view} caption="alerts · info, warning, critical and the banner" style={contained(960, 380)}>
            <AlertLayer alerts={ALERTS} onAck={() => {}} lookId={lookId} />
          </SurfaceFigure>
          <SurfaceFigure name="toast" view={view} caption="toast · the action note" style={contained(560, 140)}>
            <ActionLayer confirm={null} note="Command started: backup.ps1" room={{ left: 0, right: 0, top: 0, bottom: 0 }} onCancel={() => {}} onNoteDone={() => {}} />
          </SurfaceFigure>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {ISLAND_STATES.map((s) => (
          <IslandFrame key={s.name} state={s} view={view} />
        ))}
      </div>
    </div>
  );
}
