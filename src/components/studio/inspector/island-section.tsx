import { Fragment, type ReactNode } from "react";
import { Activity, Bell, BellRing, Clock, Moon, Palette, Play, Plus, Shapes, Trash2, type LucideIcon } from "lucide-react";
import type { Severity } from "@/lib/alerts";
import { FONT_CATALOG } from "@/lib/fonts";
import { islandBus } from "@/lib/island/bus";
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
import { PanelSection, SectionPad } from "../panel-section";
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
const SECONDS_OPTIONS: Options = [
  { value: "general", label: "As General", title: "Dashboard › General › Clock" },
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
];
const HOURS_OPTIONS: Options = [
  { value: "general", label: "As General", title: "Dashboard › General › Clock" },
  { value: "24", label: "24 h" },
  { value: "12", label: "12 h" },
];
const MOTION_OPTIONS: Options = [
  { value: "lively", label: "Lively", title: "Springs with a little overshoot" },
  { value: "smooth", label: "Smooth", title: "Springs without overshoot" },
  { value: "off", label: "Off", title: "Changes at once" },
];
const FONTS = FONT_CATALOG.map((f) => ({ value: f.id, label: f.id === "system" ? "Page font" : f.label }));

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
  onChange: (patch: Partial<IslandConfig>) => void;
  /** The sensor picker's "Open data explorer". */
  onOpenExplorer: () => void;
  /** The left panel: each group is an inspector section, and the switch sits above them. */
  sections?: boolean;
}

function Heading({ children }: { children: ReactNode }) {
  return <div className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-ui-4">{children}</div>;
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
 * Dashboard › Profile › Dynamic Island (and the Dynamic Island panel): the pill at the top centre of
 * the profile. Alert rules reach it by picking the Island display style, widgets by their "Send to
 * island" setting.
 */
export function IslandSection({ island, onChange, onOpenExplorer, sections = false }: IslandSectionProps) {
  const v = island ?? { ...ISLAND_DEFAULTS, enabled: false };
  // Plays on the canvas only (the studio's own bus); each press shows the next severity.
  const preview = () => {
    const i = previewAt++ % PREVIEW.length;
    islandBus.notify({ source: PREVIEW_SOURCE, id: `p${i}`, ...PREVIEW[i], ttl: 4000 });
  };
  const rotatable = v.idle === "time-date" || v.idle === "sensor" || v.notices.calendar;
  const groups: { id: string; title: string; icon: LucideIcon; body: ReactNode }[] = [
    {
      id: "island-shape",
      title: "Shape",
      icon: Shapes,
      body: (
        <>
          <SegmentedRow label="Style" options={SHAPE_OPTIONS} value={v.shape} onChange={(shape) => onChange({ shape: shape as IslandConfig["shape"] })} />
          <SegmentedRow label="Size" options={SIZE_OPTIONS} value={v.size} onChange={(size) => onChange({ size: size as IslandConfig["size"] })} />
          <SliderRow
            label="Scale"
            hint="Fine size on top of S, M or L; the island still shrinks to fit a short profile"
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
            hint="Start the zones under the island instead of overlaying the top row"
            value={v.reserve}
            onChange={(reserve) => onChange({ reserve })}
          />
        </>
      ),
    },
    {
      id: "island-idle",
      title: "Idle",
      icon: Moon,
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
      icon: Palette,
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
          <SelectRow label="Font" options={FONTS} value={v.font} onChange={(font) => onChange({ font })} />
          <SelectRow label="Weight" options={WEIGHT_OPTIONS} value={v.weight} onChange={(weight) => onChange({ weight: weight as IslandConfig["weight"] })} />
        </>
      ),
    },
    {
      id: "island-clock",
      title: "Clock",
      icon: Clock,
      body: (
        <>
          <SegmentedRow label="Seconds" options={SECONDS_OPTIONS} value={v.seconds} onChange={(seconds) => onChange({ seconds: seconds as IslandConfig["seconds"] })} />
          <SegmentedRow label="Hours" options={HOURS_OPTIONS} value={v.hours} onChange={(hours) => onChange({ hours: hours as IslandConfig["hours"] })} />
        </>
      ),
    },
    {
      id: "island-motion",
      title: "Motion",
      icon: Activity,
      body: <SegmentedRow label="Animation" options={MOTION_OPTIONS} value={v.motion} onChange={(motion) => onChange({ motion: motion as IslandConfig["motion"] })} />,
    },
    {
      id: "island-alerts",
      title: "Alerts",
      icon: Bell,
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
    {
      id: "island-notices",
      title: "Dashboard notices",
      icon: BellRing,
      body: (
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
            dashboard notices above add theirs on the kiosk. On the canvas the island plays only test alerts and previews.
          </p>
        </>
      ),
    },
  ];
  const enable = (
    <ToggleRow
      label="Show Dynamic Island"
      hint="A pill at the top centre of the profile with the time, alerts and live activities"
      value={v.enabled}
      onChange={(enabled) => onChange({ enabled })}
    />
  );
  if (sections)
    return (
      <>
        <div className="border-b border-[#1c1c21] py-1.5">
          <SectionPad>{enable}</SectionPad>
        </div>
        {v.enabled &&
          groups.map((g, i) => (
            <PanelSection key={g.id} id={g.id} title={g.title} icon={g.icon} defaultOpen={i === 0}>
              {g.body}
            </PanelSection>
          ))}
      </>
    );
  return (
    <div className="space-y-3">
      {enable}
      {v.enabled &&
        groups.map((g) => (
          <Fragment key={g.id}>
            <Heading>{g.title}</Heading>
            {g.body}
          </Fragment>
        ))}
    </div>
  );
}
