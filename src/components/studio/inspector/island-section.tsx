import type { ReactNode } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import type { Severity } from "@/lib/alerts";
import type { IslandBus } from "@/lib/island/bus";
import {
  ISLAND_COLLAPSE_MAX,
  ISLAND_DEFAULTS,
  ISLAND_LABEL_MAX,
  ISLAND_LEAD_MAX,
  ISLAND_OFFSET_MAX,
  ISLAND_OPACITY_MIN,
  ISLAND_ROTATE_MAX,
  ISLAND_SCALE_MAX,
  ISLAND_SCALE_MIN,
  ISLAND_STATS_MAX,
  type IslandConfig,
  type IslandNotices,
  type IslandStat,
} from "@/lib/island/config";
import { cn } from "@/lib/utils";
import { FIELD, SegmentedRow, SelectRow, SliderRow, ColorRow, TextRow, ToggleRow } from "../setting-rows";
import { SensorField } from "../widget-editor/sensor-field";
import { IntegrationsCard } from "./integrations-card";

type Options = { value: string; label: string; title?: string }[];

const IDLE_OPTIONS: Options = [
  { value: "time", label: "Time" },
  { value: "time-date", label: "Time and date" },
  { value: "sensor", label: "Time and values" },
  { value: "line", label: "Line" },
  { value: "hidden", label: "Hidden" },
];
const SHAPE_OPTIONS: Options = [
  { value: "pill", label: "Pill", title: "Floats below the top edge" },
  { value: "notch", label: "Notch", title: "Sits on the top edge with curved corners, like a laptop notch" },
];
const SIZE_OPTIONS: Options = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];
const TINT_OPTIONS: Options = [
  { value: "black", label: "Black" },
  { value: "theme", label: "Theme", title: "The theme's card colour" },
  { value: "custom", label: "Custom" },
];
const BORDER_OPTIONS: Options = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "accent", label: "Accent", title: "The theme's accent colour" },
];
const WEIGHT_OPTIONS: Options = [
  { value: "regular", label: "Regular" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
  { value: "bold", label: "Bold" },
];
const MOTION_OPTIONS: Options = [
  { value: "lively", label: "Lively", title: "Springs with a little overshoot" },
  { value: "smooth", label: "Smooth", title: "Springs without overshoot" },
  { value: "off", label: "Off", title: "Changes at once" },
];

/** The bus source of the studio's preview notices. */
export const PREVIEW_SOURCE = "preview";
const PREVIEW: { severity: Severity; title: string; body: string }[] = [
  { severity: "info", title: "Preview", body: "An info notice opens for 4 s" },
  { severity: "warning", title: "GPU temperature high", body: "84 °C" },
  { severity: "critical", title: "Plugin stopped reporting", body: "Stopped reporting" },
];
let previewAt = 0;

/** The dashboard's own notices, in the order the section lists them. */
const NOTICE_ROWS: { key: keyof IslandNotices; label: string; hint: string }[] = [
  { key: "page", label: "Page name", hint: "Shows the page's name when the kiosk switches pages" },
  { key: "layout", label: "Layout updated", hint: "A short notice when a studio save reaches the kiosk" },
  { key: "plugins", label: "Plugin back", hint: "When a plugin that stopped reports again (pair it with the Plugin stopped reporting alert)" },
  { key: "onAir", label: "On air (OBS)", hint: "A red Live / Recording dot while OBS streams or records, through the server's OBS connection" },
  { key: "calendar", label: "Calendar countdown", hint: "The next event counts down beside the time, from calendar links the server fetches" },
  {
    key: "agents",
    label: "Coding agents",
    hint: "Claude Code and Codex: the session working or waiting for you beside the time, a badge while one needs you, a notice when a long turn finishes and when a plan passes 80 % or 95 %. Run node tools/agent-install.mjs once to connect them.",
  },
];

interface IslandSectionProps {
  island: IslandConfig | undefined;
  /** The bus of the island preview above the rows: "Preview an alert" plays there. */
  previewBus: IslandBus;
  onChange: (patch: Partial<IslandConfig>) => void;
  /** The sensor picker's "Open data explorer". */
  onOpenExplorer: () => void;
  /** Font and Clock format are other views' settings, shown as LinkRows (SPEC §10.3). */
  links: { font: ReactNode; clock: ReactNode };
  /** Above the rows (the screen chips, the preview pill). */
  lead: ReactNode;
  /** Under the notices, in the second column (the widgets that send to the island). */
  aside: ReactNode;
}

function Heading({ children }: { children: ReactNode }) {
  return <div className="pt-1 font-ui-mono text-[10px] font-medium uppercase tracking-[.06em] text-ui-4">{children}</div>;
}

/** A bordered card of the second column. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-ui-default p-3.5">
      <Heading>{title}</Heading>
      {children}
    </div>
  );
}

/** A threshold box: empty = none. */
function LimitBox({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-ui-4">
      {label}
      <input
        type="number"
        value={value ?? ""}
        placeholder="–"
        aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className={cn(FIELD, "h-[26px] min-w-0 flex-1 px-1.5 text-right font-ui-mono text-[11.5px]")}
      />
    </label>
  );
}

/** The live values beside the time: a sensor, a short label and the levels it turns orange and red at. */
function StatsEditor({ stats, onChange, onOpenExplorer }: { stats: IslandStat[]; onChange: (stats: IslandStat[]) => void; onOpenExplorer: () => void }) {
  // With none yet, one empty row shows; the first edit stores it.
  const list = stats.length > 0 ? stats : [{ key: "", label: "" }];
  const set = (i: number, patch: Partial<IslandStat>) => onChange(list.map((s, j) => (j === i ? withoutEmpty({ ...s, ...patch }) : s)));
  return (
    <div className="space-y-3">
      {list.map((stat, i) => (
        <div key={i} className="space-y-2 rounded-[8px] border border-ui-subtle p-2.5">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <SensorField
                label={`Value ${i + 1}`}
                value={stat.key || undefined}
                onChange={(key) => set(i, { key: key ?? "" })}
                onOpenExplorer={onOpenExplorer}
              />
            </div>
            {stats.length > 0 && (
              <button
                type="button"
                aria-label={`Remove value ${i + 1}`}
                onClick={() => onChange(stats.filter((_, j) => j !== i))}
                className="mt-[22px] flex h-7 w-7 items-center justify-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <TextRow
            label="Label"
            hint={`Before the value, up to ${ISLAND_LABEL_MAX} characters`}
            value={stat.label}
            placeholder="GPU"
            onChange={(text) => set(i, { label: text.slice(0, ISLAND_LABEL_MAX) })}
          />
          <div className="flex gap-2">
            <LimitBox label="Orange at" value={stat.warn} onChange={(warn) => set(i, { warn })} />
            <LimitBox label="Red at" value={stat.crit} onChange={(crit) => set(i, { crit })} />
          </div>
        </div>
      ))}
      {stats.length > 0 && stats.length < ISLAND_STATS_MAX && (
        <button
          type="button"
          onClick={() => onChange([...stats, { key: "", label: "" }])}
          className="flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add a value
        </button>
      )}
    </div>
  );
}

/** A stat without its unset thresholds (so a cleared box drops the key). */
function withoutEmpty(s: IslandStat): IslandStat {
  const { warn, crit, ...rest } = s;
  return { ...rest, ...(warn !== undefined && Number.isFinite(warn) ? { warn } : {}), ...(crit !== undefined && Number.isFinite(crit) ? { crit } : {}) };
}

/**
 * Alerts & Island › Island: the pill at the top centre of a screen. Alert rules reach it by picking
 * the Island display style, widgets by their "Send to island" setting. Two columns: the island's own
 * rows, then the dashboard notices and the widgets that send to it.
 */
export function IslandSection({ island, previewBus, onChange, onOpenExplorer, links, lead, aside }: IslandSectionProps) {
  const v = island ?? { ...ISLAND_DEFAULTS, enabled: false };
  // Plays in the preview only (the kiosk never hears it); each press shows the next severity.
  const preview = () => {
    const i = previewAt++ % PREVIEW.length;
    previewBus.notify({ source: PREVIEW_SOURCE, id: `p${i}`, ...PREVIEW[i], ttl: 4000 });
  };
  const rotatable = v.idle === "time-date" || v.idle === "sensor" || v.notices.calendar;
  const groups: { id: string; title: string; body: ReactNode }[] = [
    {
      id: "island-shape",
      title: "Shape",
      body: (
        <>
          <SegmentedRow label="Style" options={SHAPE_OPTIONS} value={v.shape} onChange={(shape) => onChange({ shape: shape as IslandConfig["shape"] })} />
          <SegmentedRow label="Size" options={SIZE_OPTIONS} value={v.size} onChange={(size) => onChange({ size: size as IslandConfig["size"] })} />
          <SliderRow
            label="Scale"
            hint="Fine size on top of S, M or L; the island still shrinks to fit a short screen"
            value={v.scale}
            min={ISLAND_SCALE_MIN}
            max={ISLAND_SCALE_MAX}
            step={5}
            unit="%"
            fallback={ISLAND_DEFAULTS.scale}
            onChange={(scale) => onChange({ scale })}
          />
          {v.shape === "pill" && (
            <SliderRow
              label="Offset from top"
              value={v.offsetY}
              min={0}
              max={ISLAND_OFFSET_MAX}
              unit="px"
              fallback={ISLAND_DEFAULTS.offsetY}
              onChange={(offsetY) => onChange({ offsetY })}
            />
          )}
          <ToggleRow
            label="Reserve space"
            hint="Start the widgets under the island instead of overlaying the top row"
            value={v.reserve}
            onChange={(reserve) => onChange({ reserve })}
          />
        </>
      ),
    },
    {
      id: "island-idle",
      title: "Idle",
      body: (
        <>
          <SelectRow
            label="When idle"
            hint="Values: the time and up to three live values. Line: a hairline at the top that grows into the island when something shows. Hidden: only shows while there is something to show."
            options={IDLE_OPTIONS}
            value={v.idle}
            onChange={(idle) => onChange({ idle: idle as IslandConfig["idle"] })}
          />
          {v.idle === "sensor" && <StatsEditor stats={v.stats} onChange={(stats) => onChange({ stats })} onOpenExplorer={onOpenExplorer} />}
          {rotatable && (
            <SliderRow
              label="Rotate every"
              hint="Show the date, each value and the next calendar event in turn beside the time, instead of side by side. 0 = side by side."
              value={v.rotate}
              min={0}
              max={ISLAND_ROTATE_MAX}
              step={1}
              unit="s"
              fallback={0}
              onChange={(rotate) => onChange({ rotate })}
            />
          )}
        </>
      ),
    },
    {
      id: "island-look",
      title: "Look",
      body: (
        <>
          <SegmentedRow label="Color" options={TINT_OPTIONS} value={v.tint} onChange={(tint) => onChange({ tint: tint as IslandConfig["tint"] })} />
          {v.tint === "custom" && (
            <>
              <ColorRow label="Background" value={v.bgColor} onChange={(bgColor) => onChange({ bgColor: bgColor || ISLAND_DEFAULTS.bgColor })} />
              <ColorRow label="Text" value={v.fgColor} onChange={(fgColor) => onChange({ fgColor: fgColor || ISLAND_DEFAULTS.fgColor })} />
            </>
          )}
          <SliderRow
            label="Opacity"
            hint="Below 100% the page shows through, blurred"
            value={v.opacity}
            min={ISLAND_OPACITY_MIN}
            max={100}
            step={5}
            unit="%"
            fallback={100}
            onChange={(opacity) => onChange({ opacity })}
          />
          <SegmentedRow label="Border" options={BORDER_OPTIONS} value={v.border} onChange={(border) => onChange({ border: border as IslandConfig["border"] })} />
          <ToggleRow label="Shadow" value={v.shadow} onChange={(shadow) => onChange({ shadow })} />
          {links.font}
          <SelectRow label="Weight" options={WEIGHT_OPTIONS} value={v.weight} onChange={(weight) => onChange({ weight: weight as IslandConfig["weight"] })} />
        </>
      ),
    },
    {
      id: "island-clock",
      title: "Clock",
      body: links.clock,
    },
    {
      id: "island-motion",
      title: "Motion",
      body: <SegmentedRow label="Animation" options={MOTION_OPTIONS} value={v.motion} onChange={(motion) => onChange({ motion: motion as IslandConfig["motion"] })} />,
    },
    {
      id: "island-alerts",
      title: "Alerts",
      body: (
        <>
          <SliderRow
            label="Collapse alerts after"
            hint="For screens without touch: alerts that stay until tapped shrink to a badge after this many seconds. 0 = stay open until tapped."
            value={v.collapseAfter}
            min={0}
            max={120}
            step={5}
            unit="s"
            fallback={0}
            onChange={(collapseAfter) => onChange({ collapseAfter: Math.min(ISLAND_COLLAPSE_MAX, collapseAfter) })}
          />
          <ToggleRow
            label="Group notices"
            hint="A new notification from the same app (or achievement from the same game) replaces the one shown and counts up, instead of queueing"
            value={v.group}
            onChange={(group) => onChange({ group })}
          />
        </>
      ),
    },
  ];
  const notices = (
    <>
      {NOTICE_ROWS.map((row) => (
        <ToggleRow
          key={row.key}
          label={row.label}
          hint={row.hint}
          value={v.notices[row.key]}
          onChange={(on) => onChange({ notices: { ...v.notices, [row.key]: on } })}
        />
      ))}
      {v.notices.calendar && (
        <SliderRow
          label="Count down from"
          hint="Minutes before an event the countdown starts and the island opens; it opens again when the event begins"
          value={v.calendarLead}
          min={1}
          max={ISLAND_LEAD_MAX}
          step={1}
          unit="min"
          fallback={ISLAND_DEFAULTS.calendarLead}
          onChange={(calendarLead) => onChange({ calendarLead })}
        />
      )}
      {(v.notices.onAir || v.notices.calendar) && <IntegrationsCard obs={v.notices.onAir} calendar={v.notices.calendar} />}
      <button
        type="button"
        onClick={preview}
        className="flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1"
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        Preview an alert
      </button>
      <p className="text-[11px] leading-snug text-ui-5">
        Alert rules show here when their display style is Island; widgets with “Send to island” on and the
        dashboard notices add theirs on the kiosk. The preview above plays only here, and test alerts play on the canvas.
      </p>
    </>
  );
  const enable = (
    <ToggleRow
      label="Show Dynamic Island"
      hint="A pill at the top centre of the screen with the time, alerts and live activities"
      value={v.enabled}
      onChange={(enabled) => onChange({ enabled })}
    />
  );
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-[320px] max-w-[520px] flex-1 flex-col gap-3">
        {lead}
        {enable}
        {v.enabled &&
          groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-2">
              <Heading>{g.title}</Heading>
              {g.body}
            </div>
          ))}
      </div>
      {v.enabled && (
        <div className="flex min-w-[280px] max-w-[400px] flex-1 flex-col gap-4">
          <Card title="Dashboard notices">{notices}</Card>
          {aside}
        </div>
      )}
    </div>
  );
}
