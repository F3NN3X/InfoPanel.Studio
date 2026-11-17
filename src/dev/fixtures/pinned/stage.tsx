import { createContext, useContext, useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { placementContent } from "@/components/studio/placement-content";
import { tokenScope } from "@/components/widget-style";
import { wearing } from "@/components/widgets-page/recipe-preview";
import { resolveWith } from "@/lib/style-resolve";
import type { Look } from "@/looks/look";
import { PackStage, usePack } from "@/looks/pack";
import { chromeOf } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";
import type { ShellProps, WidgetMeta } from "@/widgets/core/types";
import { MarkEmptyCtx } from "@/widgets/core/primitives";
import { templateModule } from "@/widgets/module";
import { migratePlacementV19 } from "@/lib/settings-migrate.v19";
import { FIXTURE_LOOKS, fixtureLook, stageVars, type FixtureLook } from "./look";

/*
 * The panel stage of the pinned-layer fixtures: a box at the panel's exact size on a Look, a pinned item on each edge it
 * names (the rail, a bottom bar, a side panel) and the page in the space they leave ("make room", INVESTIGATION §2, the way
 * the Island's reserve pads the grid). A page zone is a real widget drawn by the kiosk's own `placementContent` from the
 * fixture sensors; a design-only part (the rail, Keys, the Island prompt) is a template module, so it wears the Look's
 * shell, material and pack exactly as a built-in widget does. Nothing here saves, fetches or reaches a server.
 */

const SENSORS = fixtureSensors();

/** The fixture's Look, loaded once, and the stage's own tokens for it. */
const LookCtx = createContext<{ id: FixtureLook; look: Look } | null>(null);
export const useFixtureLook = () => useContext(LookCtx)!;

export function LookProvider({ id, children }: { id: FixtureLook; children: ReactNode }) {
  const [look, setLook] = useState<Look>();
  useEffect(() => {
    let live = true;
    void fixtureLook(id).then((l) => live && setLook(l));
    return () => {
      live = false;
    };
  }, [id]);
  return look ? <LookCtx.Provider value={{ id, look }}>{children}</LookCtx.Provider> : null;
}

/** The design-only part's own data, handed to its component the way the builder's preview hands a draft recipe. */
const SpecCtx = createContext<unknown>(undefined);
export const useSpec = <T,>() => useContext(SpecCtx) as T;

/** A design-only widget: the template shell around `Component`, reading its data from `useSpec`. Kept out of the registry. */
export function designWidget(id: string, name: string, Component: ComponentType<ShellProps & { look?: ModuleSettings }>): DashboardModule {
  const meta: WidgetMeta = { id, name, category: "Generic", icon: "dashboard", prefixes: [], defaultSize: [1, 1], minSize: [1, 1], description: "" };
  const mod = templateModule({ meta, Component, settings: [], toProps: () => ({}) });
  // it draws from its spec, never from sensors
  mod.readsFor = () => [];
  return mod;
}

/** A zone's box: what the kiosk's `PlacementFrame` gives a widget, a box of its own size with the frame's tokens. */
function ZoneBox({ scope, style, children }: { scope?: CSSProperties; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className="relative min-h-0 min-w-0" style={{ ...style, ...scope }}>
      <MarkEmptyCtx.Provider value>{children}</MarkEmptyCtx.Provider>
    </div>
  );
}

export interface Zone {
  id: string;
  /** A registered widget id, drawn by `placementContent`. */
  module?: string;
  /** Or a design-only part, with its data. */
  design?: { mod: DashboardModule; spec: unknown };
  settings?: ModuleSettings;
  /** Its cell box on the page grid: column, row, columns, rows (1-based). */
  cell: [number, number, number, number];
}

/** One zone, in the fixture's Look: a built-in through the kiosk's renderer, a design part through its template shell. */
export function ZoneView({ zone, style }: { zone: Zone; style?: CSSProperties }) {
  const { id: lookId } = useFixtureLook();
  const own: ModuleSettings = { ...zone.settings, lookId };
  // the screen wears the Look, as a profile that picked it does: its material, tone and pack reach every zone
  const appearance = wearing(undefined, lookId);
  if (zone.design) {
    const settings = resolveWith(appearance, own, undefined, undefined, zone.design.mod.settings) ?? own;
    return (
      <ZoneBox style={style} scope={tokenScope(chromeOf(settings)) as CSSProperties}>
        <SpecCtx.Provider value={zone.design.spec}>{zone.design.mod.render(SENSORS, settings)}</SpecCtx.Provider>
      </ZoneBox>
    );
  }
  const [c, r, cs, rs] = zone.cell;
  const p = migratePlacementV19({ id: zone.id, module: zone.module ?? "", colStart: c, rowStart: r, colSpan: cs, rowSpan: rs, visible: true, settings: own });
  const out = placementContent(p, SENSORS, [], appearance);
  return (
    <ZoneBox style={style} scope={out.scope}>
      {out.content}
    </ZoneBox>
  );
}

export interface PageSpec {
  cols: number;
  rows: number;
  zones: Zone[];
}

/** The page's grid of zones, laid out in the box the pinned items leave. `gap` and `pad` as a profile's (12 px each by default). */
export function PageGrid({ page, gap = 12, pad = 12, className, style }: { page: PageSpec; gap?: number; pad?: number; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`grid h-full w-full ${className ?? ""}`}
      style={{ gap, padding: pad, gridTemplateColumns: `repeat(${page.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${page.rows}, minmax(0, 1fr))`, ...style }}
    >
      {page.zones.map((z) => (
        <ZoneView key={z.id} zone={z} style={{ gridColumn: `${z.cell[0]} / span ${z.cell[2]}`, gridRow: `${z.cell[1]} / span ${z.cell[3]}` }} />
      ))}
    </div>
  );
}

export type Edge = "left" | "right" | "top" | "bottom";

/** A pinned item on the stage: its edge, its thickness across that edge (design px) and what it draws. */
export interface Pinned {
  id: string;
  edge: Edge;
  size: number;
  zone: Zone;
  /** Its margin from the panel's edge, px (a bar or panel sits off the edge like a zone, the page's padding then parts it from the page; the rail is flush). A side panel keeps it off the top and bottom too. */
  inset?: number;
}

/** The page box after the pinned items have made room: the padding each edge's items add. */
export function roomFor(pinned: readonly Pinned[]): Record<Edge, number> {
  const room = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const p of pinned) room[p.edge] += p.size + (p.inset ?? 0);
  return room;
}

interface StageProps {
  w: number;
  h: number;
  pinned: readonly Pinned[];
  /** The page area's content (a page grid, two sliding pages, a dimmed page under a sheet). */
  children: ReactNode;
  /** Drawn over everything (the Island, a sheet). */
  overlay?: ReactNode;
  /** A screen reader's name for the panel. */
  label: string;
  /** A modal sheet is open over the panel: the page and the pinned items are inert behind it. */
  modal?: boolean;
}

/**
 * The stage's own rules, in this dev chunk: the release CSS leaves src/dev out (`@source not "./dev"` in index.css), so a
 * utility class only the fixtures used would not exist. The focus ring is the Look's `focus-ring`; a key dips on press,
 * unless motion is reduced.
 */
const STAGE_CSS = `
[data-panel-stage] :is(button, textarea):focus-visible { outline: 2px solid var(--w-focus); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) { [data-panel-stage] [data-press]:active { transform: scale(0.97); } }
`;

/** The panel at its exact size on the fixture's Look: its page colour and pack layers, the pinned items, then the page. */
export function PanelStage({ w, h, pinned, children, overlay, label, modal }: StageProps) {
  const { id, look } = useFixtureLook();
  const pack = usePack(id);
  const room = roomFor(pinned);
  const mode = FIXTURE_LOOKS[id];
  const item = (p: Pinned) => {
    const across = p.edge === "left" || p.edge === "right";
    const at = pinnedOffset(pinned, p);
    const box: CSSProperties = across
      ? { [p.edge]: at, top: p.inset ?? 0, bottom: p.inset ?? 0, width: p.size }
      : { [p.edge]: at, left: room.left + 12, right: room.right + 12, height: p.size };
    return <ZoneView key={p.id} zone={p.zone} style={{ position: "absolute", ...box }} />;
  };
  // the reading and focus order follows the eye: what is pinned to the left or top edge, then the page, then the rest
  const leading = (p: Pinned) => p.edge === "left" || p.edge === "top";
  return (
    <main aria-label={label} data-mode={mode} data-panel-stage="" className="relative isolate overflow-hidden" style={{ width: w, height: h, ...stageVars(look, mode) }}>
      <style>{STAGE_CSS}</style>
      <PackStage pack={pack} page={{ width: w, height: h }} className="absolute inset-0 -z-10" overlayClassName="absolute inset-0 z-10" />
      <div className="contents" inert={modal}>
        {pinned.filter(leading).map(item)}
        <div className="absolute" style={{ left: room.left, right: room.right, top: room.top, bottom: room.bottom }}>
          {children}
        </div>
        {pinned.filter((p) => !leading(p)).map(item)}
      </div>
      {overlay}
    </main>
  );
}

/** How far a pinned item sits from its edge: the items before it on that edge, and its own inset. */
function pinnedOffset(all: readonly Pinned[], p: Pinned): number {
  const before = all.slice(0, all.indexOf(p)).filter((o) => o.edge === p.edge);
  return before.reduce((n, o) => n + o.size + (o.inset ?? 0), 0) + (p.inset ?? 0);
}
