import { useId, type CSSProperties } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Gauge } from "@/components/Gauge";
import { DEFAULT_GAUGE_SPEC, FittedVectorGauge } from "@/widgets/CustomGauge";
import { fraction } from "@/lib/infopanel/gauges/vector";
import { Bar as SkinBar, Ring, Spark } from "@/widgets/core/primitives";
import { useHistory } from "@/widgets/core/layout";
import { isImageUrl, resolveImageUrl } from "@/lib/image";
import { sensorAt } from "@/lib/sensors";
import { Marquee } from "@/components/ui/marquee";
import { customClockText } from "@/lib/clock-format";
import { formatClock } from "@/lib/general";
import { MARQUEE_SPACING, MARQUEE_SPEED } from "@/lib/marquee";
import { hexToHsl } from "@/lib/theme";
import { useGeneral } from "@/hooks/use-general";
import type { SensorValue } from "@/hooks/useSensors";
import type { Widget } from "@/lib/layout";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import { labelStyle } from "@/components/widget-style";
import { widgetPercent, widgetValue } from "./format";
import { useNow } from "./hooks";
import { panelNum, usePanelSkin } from "./panel-skin";

/**
 * Resolve an image widget's source URL: a static URL wins when it looks
 * like one, otherwise the bound sensor's text is used.
 */
export function imageSrc(widget: Widget, sensors: SensorMap): string | undefined {
  const s = widget.sensor ? sensorAt(sensors, widget.sensor) : undefined;
  const src =
    (widget.text && isImageUrl(widget.text, widget.sensor ?? "image")
      ? widget.text
      : undefined) ??
    (s?.text && isImageUrl(s.text, widget.sensor ?? "image")
      ? s.text
      : undefined) ??
    (widget.text && isImageUrl(widget.text, "image") ? widget.text : undefined);
  return src && resolveImageUrl(src);
}

interface Ctx {
  widget: Widget;
  sensor?: SensorValue;
  text: string;
  unit?: string;
  /** Formatted text of the widget's secondary sensor (subSensor). */
  sub?: string;
}

function colorStyle(color?: string): CSSProperties | undefined {
  return color ? { color } : undefined;
}

/** Label font size derived from a widget's value font size. */
function labelSize(widget: Widget): number | undefined {
  return widget.fontSize
    ? Math.max(9, Math.min(14, Math.round(widget.fontSize * 0.35)))
    : undefined;
}

/** Font size for a widget's secondary (sub) readout. */
function subSize(widget: Widget): number {
  return Math.max(9, Math.round((labelSize(widget) ?? 12) * 0.8));
}

/* ---------------- individual renderers ---------------- */

function Stat({ widget, text, unit, sub }: Ctx) {
  const ls = labelSize(widget);
  const sk = usePanelSkin();
  return (
    <div className="flex flex-col gap-0.5" style={{ textAlign: widget.align }}>
      {widget.label && (
        <div
          className="wp-label tracking-wide text-muted-foreground"
          style={{ ...labelStyle(), fontSize: ls ?? "0.75rem" }}
        >
          {widget.label}
        </div>
      )}
      <div
        className="wp-value font-bold tracking-tight tabular-nums text-foreground"
        style={{
          fontSize: widget.fontSize ?? "1.5rem",
          ...panelNum(sk, 700),
          ...colorStyle(widget.color),
        }}
      >
        {text}
        {unit && (
          <span
            className="wp-unit ml-1 font-normal text-muted-foreground"
            style={{ fontSize: ls ?? "0.75rem" }}
          >
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div
          className="wp-sub tabular-nums text-muted-foreground"
          style={{ fontSize: subSize(widget) }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function Value({ widget, text, unit, sub }: Ctx) {
  const ls = labelSize(widget);
  const sk = usePanelSkin();
  return (
    <div className="flex flex-col" style={{ textAlign: widget.align }}>
      <div className="flex items-baseline gap-1">
        <span
          className="wp-value font-semibold tabular-nums text-foreground"
          style={{
            fontSize: widget.fontSize ?? "1.125rem",
            ...panelNum(sk, 600),
            ...colorStyle(widget.color),
          }}
        >
          {text}
          {unit && (
            <span
              className="wp-unit ml-0.5 font-normal text-muted-foreground"
              style={{ fontSize: ls ?? "0.75rem" }}
            >
              {unit}
            </span>
          )}
        </span>
        {widget.label && (
          <span
            className="wp-label text-muted-foreground"
            style={{ ...labelStyle("none"), fontSize: ls ?? "0.75rem" }}
          >
            {widget.label}
          </span>
        )}
      </div>
      {sub && (
        <span
          className="wp-sub tabular-nums text-muted-foreground"
          style={{ fontSize: subSize(widget) }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function Bar({ widget, sensor, text, unit }: Ctx) {
  const pct = widgetPercent(sensor, widget);
  const sk = usePanelSkin();
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="wp-label truncate text-muted-foreground">
          {widget.label ?? "—"}
        </span>
        <span className="wp-value tabular-nums text-foreground" style={sk ? panelNum(sk, 400) : undefined}>
          {text}
          {unit && (
            <span className="wp-unit ml-0.5 text-muted-foreground">{unit}</span>
          )}
        </span>
      </div>
      {sk ? (
        // The core meter in the skin's style; `pct` already carries `inverted`. Its fill reads `--accent` as a color.
        <div className="wp-bar-track" style={{ "--accent": widget.color ?? "hsl(var(--primary))" } as CSSProperties}>
          <SkinBar value={pct} className="h-2" />
        </div>
      ) : (
        <div className="wp-bar-track h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="wp-bar-fill h-full rounded-full bg-primary transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              ...(widget.color ? { backgroundColor: widget.color } : {}),
            }}
          />
        </div>
      )}
    </div>
  );
}

function GaugeWidget({ widget, sensor, text, unit }: Ctx) {
  const pct = widgetPercent(sensor, widget);
  const sk = usePanelSkin();
  if (sk) {
    // The core ring: its thickness scales with the skin's `ring`; the number sits inside, the label under it.
    const size = widget.size ?? 80;
    return (
      <div className="wp-gauge flex shrink-0 flex-col items-center gap-1.5" style={{ width: size }}>
        <Ring value={pct} thickness={8} color={widget.color ?? "hsl(var(--accent))"} className="w-full">
          <span
            className="tabular-nums text-foreground"
            style={{ fontSize: widget.size ? Math.round(widget.size * 0.28) : 14, ...panelNum(sk, 600) }}
          >
            {text}
            {unit && <span className="ml-0.5 font-normal text-muted-foreground" style={{ fontSize: "0.7em" }}>{unit}</span>}
          </span>
        </Ring>
        {widget.label && <span className="wp-label text-[10px] uppercase tracking-wide text-muted-foreground">{widget.label}</span>}
      </div>
    );
  }
  const scope = widget.color
    ? ({ "--accent": hexToHsl(widget.color) } as CSSProperties)
    : undefined;
  return (
    <div style={scope} className="wp-gauge shrink-0">
      <Gauge
        label={widget.label ?? ""}
        value={text}
        unit={unit}
        percent={pct}
        size={widget.size ?? 80}
        fontSize={widget.size ? Math.round(widget.size * 0.28) : undefined}
      />
    </div>
  );
}

/** A panel's Custom gauge: the zone widget's drawing at `width` px wide (default 120). */
function VectorGaugeWidget({ widget, sensor }: { widget: Widget; sensor?: SensorValue }) {
  const id = useId();
  const g = widget.vector ?? DEFAULT_GAUGE_SPEC;
  const value = sensor?.value;
  const frac = fraction(value !== undefined && Number.isFinite(value) ? value : null, g.scale?.min ?? 0, g.scale?.max ?? 100);
  const w = widget.width ?? 120;
  return (
    <div className="wp-gauge flex shrink-0 flex-col items-center gap-1.5" style={{ width: w }}>
      <FittedVectorGauge gauge={g} p={frac} id={id} width={w} height={Math.round((w * g.height) / g.width)} />
      {widget.label && <span className="wp-label text-[10px] uppercase tracking-wide text-muted-foreground">{widget.label}</span>}
    </div>
  );
}

function Sparkline({ widget, sensor }: { widget: Widget; sensor?: SensorValue }) {
  const eased = useHistory(sensor?.value ?? NaN, widget.history ?? 40, 1);
  // The core seeds a first sample as two points; this panel always drew it as one.
  const history = eased.length === 2 && eased[0] === eased[1] ? eased.slice(0, 1) : eased;
  const sk = usePanelSkin();
  const last = history[history.length - 1];
  const W = 200;
  const H = 48;

  const points =
    history.length > 1
      ? (() => {
          const min = Math.min(...history);
          const max = Math.max(...history);
          const range = max - min || 1;
          return history
            .map((v, i) => {
              const x = (i / (history.length - 1)) * W;
              const y = H - 2 - ((v - min) / range) * (H - 6);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
        })()
      : undefined;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="wp-label truncate text-muted-foreground">
          {widget.label ?? "graph"}
        </span>
        <span
          className="wp-value tabular-nums text-foreground"
          style={sk ? { ...panelNum(sk, 400), ...colorStyle(widget.color) } : colorStyle(widget.color)}
        >
          {last !== undefined ? Math.round(last) : "—"}
        </span>
      </div>
      {sk ? (
        // The core graph in the skin's style (history length = the widget's `history`).
        <Spark values={history} className="wp-spark h-12" color={widget.color ?? "hsl(var(--accent))"} />
      ) : (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="wp-spark h-12 w-full"
      >
        {points ? (
          <>
            <polyline
              points={`0,${H} ${points} ${W},${H}`}
              fill={widget.color ? `${widget.color}22` : undefined}
              stroke="none"
            />
            <polyline
              points={points}
              fill="none"
              stroke={widget.color ?? "hsl(var(--accent))"}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <line
            x1={0}
            y1={H / 2}
            x2={W}
            y2={H / 2}
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      )}
    </div>
  );
}

function Table({ widget, lines }: { widget: Widget; lines: string[] }) {
  const font = usePanelSkin()?.num;
  const rows = widget.rows ?? 7;
  const size = widget.fontSize
    ? Math.max(10, Math.round(widget.fontSize * 0.55))
    : undefined;
  const cols = widget.columns && widget.columns > 1 ? widget.columns : 0;

  // N-column mode: split each line on ", " into a CSS-grid of cells, with an
  // optional static header row on top (friends table, weather forecast, …).
  if (cols > 0) {
    const header = (widget.header ?? "")
      .split(", ")
      .map((h) => h.trim())
      .filter(Boolean);
    return (
      <div
        className="wp-table grid gap-x-2 gap-y-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          fontSize: size ?? "0.75rem",
          textAlign: widget.align,
          fontFamily: font,
        }}
      >
        {header.map((h, j) => (
          <div
            key={`h-${j}`}
            className="truncate uppercase tracking-wide text-muted-foreground/70"
            style={{ fontSize: size ? Math.max(9, size - 3) : "0.625rem" }}
            title={h}
          >
            {h}
          </div>
        ))}
        {lines.slice(0, rows).map((line, i) =>
          line
            .split(", ")
            .map((cell, j) => (
              <div
                key={`r-${i}-${j}`}
                className={
                  j === 0
                    ? "truncate font-medium text-foreground/90"
                    : "truncate tabular-nums text-muted-foreground"
                }
                title={cell}
              >
                {cell || "—"}
              </div>
            ))
        )}
        {lines.length === 0 && (
          <div className="col-span-full text-muted-foreground/60">
            no data
          </div>
        )}
      </div>
    );
  }

  // Default two-part mode: a leading head and the rest, right aligned.
  return (
    <div className="wp-table space-y-1" style={font ? { fontFamily: font } : undefined}>
      {lines.slice(0, rows).map((line, i) => {
        const idx = line.indexOf(", ");
        const head = idx > 0 ? line.slice(0, idx) : line;
        const rest = idx > 0 ? line.slice(idx + 2) : "";
        return (
          <div
            key={i}
            className="flex items-baseline justify-between gap-3"
            style={{
              fontSize: size ?? "0.75rem",
              textAlign: widget.align,
            }}
          >
            <span className="shrink-0 font-medium text-foreground/85">
              {head}
            </span>
            {rest && (
              <span
                className="min-w-0 truncate text-right tabular-nums text-muted-foreground"
                title={rest}
              >
                {rest}
              </span>
            )}
          </div>
        );
      })}
      {lines.length === 0 && (
        <div
          className="text-muted-foreground/60"
          style={{ fontSize: size ?? "0.75rem" }}
        >
          no data
        </div>
      )}
    </div>
  );
}

function Text({ widget, text }: { widget: Widget; text: string }) {
  const ls = labelSize(widget);
  const sk = usePanelSkin();
  return (
    <div
      className="flex min-w-0 flex-col gap-0.5"
      style={{ textAlign: widget.align }}
    >
      {widget.label && (
        <div
          className="wp-label tracking-wide text-muted-foreground"
          style={{ ...labelStyle(), fontSize: ls ?? "0.75rem" }}
        >
          {widget.label}
        </div>
      )}
      <div
        className={cn(
          "wp-value break-words text-foreground/90",
          !text && "text-muted-foreground/60"
        )}
        style={{
          fontSize: widget.fontSize ?? "0.875rem",
          whiteSpace: "pre-line",
          fontFamily: sk?.font,
          ...colorStyle(widget.color),
        }}
      >
        {widget.scroll ? (
          <Marquee speed={widget.scrollSpeed ?? MARQUEE_SPEED} spacing={widget.scrollSpacing ?? MARQUEE_SPACING}>
            {text || "—"}
          </Marquee>
        ) : (
          text || "—"
        )}
      </div>
    </div>
  );
}

function ImageWidget({ widget, src }: { widget: Widget; src?: string }) {
  const h = widget.height;
  return (
    <div className="relative">
      {src ? (
        <img
          src={src}
          alt={widget.label ?? "image"}
          className={cn(
            "w-full rounded-md object-cover",
            h ? "min-h-0" : "max-h-40"
          )}
          style={h ? { maxHeight: h } : undefined}
          loading="lazy"
        />
      ) : (
        <div
          className="flex w-full items-center justify-center rounded-md bg-muted text-muted-foreground/50"
          style={h ? { height: h } : { height: "6rem" }}
        >
          <ImageIcon className="h-6 w-6" />
        </div>
      )}
      {widget.label && (
        <div className="wp-label mt-1 text-xs tracking-wide text-muted-foreground" style={labelStyle()}>
          {widget.label}
        </div>
      )}
    </div>
  );
}

function Clock({ widget }: { widget: Widget }) {
  const now = useNow(1000);
  // 12 / 24 h, seconds and the locale come from General settings.
  const { time, date } = formatClock(now, useGeneral());
  const mode = widget.clock ?? "both";
  const sk = usePanelSkin();
  // A format shows time or date alone, in the time's size (InfoPanel's Clock and Calendar).
  const custom = mode === "both" ? null : customClockText(now, mode, widget.format);
  if (custom !== null) {
    return (
      <div
        className="wp-clock-time font-bold tracking-tight tabular-nums"
        style={{ ...colorStyle(widget.color), textAlign: widget.align, fontSize: widget.fontSize ?? "2.25rem", ...panelNum(sk, 700) }}
      >
        {custom}
      </div>
    );
  }
  return (
    <div
      className="flex flex-col"
      style={{ ...colorStyle(widget.color), textAlign: widget.align }}
    >
      {mode !== "date" && (
        <div
          className="wp-clock-time font-bold tracking-tight tabular-nums"
          style={{ fontSize: widget.fontSize ?? "2.25rem", ...panelNum(sk, 700) }}
        >
          {time}
        </div>
      )}
      {mode !== "time" && (
        <div
          className="wp-clock-date text-muted-foreground"
          style={
            widget.fontSize
              ? {
                  fontSize: Math.max(10, Math.round(widget.fontSize * 0.22)),
                }
              : undefined
          }
        >
          {date}
        </div>
      )}
    </div>
  );
}

/**
 * Decorative shape — a vertical/horizontal bar, a rounded rectangle, or a
 * circle. Sizes are driven by `thickness` (px) and the cell it occupies.
 */
function Shape({ widget }: { widget: Widget }) {
  const t = widget.thickness ?? 4;
  const color = widget.color ?? "hsl(var(--accent))";
  const radius = Math.min(t, widget.shape === "rect" ? 8 : t);
  // Soft glow for bars (hex colors; non-hex values are ignored by CSS).
  const glow = `0 0 ${Math.max(6, t * 1.5)}px ${color}66`;
  switch (widget.shape ?? "vbar") {
    case "hbar":
      return (
        <div
          className="wp-shape"
          style={{
            height: t,
            width: "100%",
            minWidth: 24,
            borderRadius: radius,
            backgroundColor: color,
            boxShadow: glow,
          }}
        />
      );
    case "rect":
      return (
        <div
          className="wp-shape h-full min-h-6 w-full"
          style={{ borderRadius: radius, backgroundColor: color }}
        />
      );
    case "circle":
      return (
        <div
          className="wp-shape self-center"
          style={{
            width: t,
            height: t,
            borderRadius: "50%",
            backgroundColor: color,
          }}
        />
      );
    case "vbar":
    default:
      return (
        <div
          className="wp-shape h-full min-h-6"
          style={{
            width: t,
            minWidth: t,
            borderRadius: radius,
            backgroundColor: color,
            boxShadow: glow,
          }}
        />
      );
  }
}

/* ---------------- dispatcher ---------------- */

interface WidgetViewProps {
  widget: Widget;
  sensors: SensorMap;
  /** Studio canvas: a widget that needs a sensor and has none says so. */
  studio?: boolean;
}

/** Kinds that show nothing useful without a bound sensor (or static text). */
const SENSOR_KINDS: ReadonlySet<Widget["kind"]> = new Set(["stat", "value", "bar", "gauge", "customGauge", "sparkline", "table"]);

/**
 * Resolve a widget's bound sensor + display text, then dispatch to the
 * matching renderer. Hidden widgets render nothing. In the studio an
 * unbound widget adds a "pick a sensor" hint (`.wp-hint`) under itself.
 */
export function WidgetView({ widget, sensors, studio }: WidgetViewProps) {
  const view = <WidgetBody widget={widget} sensors={sensors} />;
  if (!studio || !widget.visible || widget.sensor || widget.text || !SENSOR_KINDS.has(widget.kind)) return view;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {view}
      <span
        className="wp-hint text-[10px] italic text-muted-foreground/60"
        style={{ textAlign: widget.align ?? (widget.kind === "gauge" ? "center" : undefined) }}
      >
        pick a sensor
      </span>
    </div>
  );
}

/** The widget's own renderer for its kind. */
function WidgetBody({ widget, sensors }: Omit<WidgetViewProps, "studio">) {
  if (!widget.visible) return null;
  const s = widget.sensor ? sensorAt(sensors, widget.sensor) : undefined;
  const { text, unit } = widgetValue(s, widget);
  const subS = widget.subSensor ? sensors[widget.subSensor] : undefined;
  const sub = subS ? widgetValue(subS, widget).text : undefined;
  const ctx: Ctx = { widget, sensor: s, text, unit, sub };

  switch (widget.kind) {
    case "stat":
      return <Stat {...ctx} />;
    case "value":
      return <Value {...ctx} />;
    case "bar":
      return <Bar {...ctx} />;
    case "gauge":
      return <GaugeWidget {...ctx} />;
    case "customGauge":
      return <VectorGaugeWidget widget={widget} sensor={s} />;
    case "sparkline":
      return <Sparkline widget={widget} sensor={s} />;
    case "table": {
      const raw = s?.text ?? widget.text ?? "";
      const lines = raw.split("\n").filter((l) => l.trim() !== "");
      return (
        <div className="w-full">
          {widget.label && (
            <div className="wp-label mb-1 text-xs text-muted-foreground">
              {widget.label}
            </div>
          )}
          <Table widget={widget} lines={lines} />
        </div>
      );
    }
    case "text":
      return (
        <Text
          widget={widget}
          text={widget.sensor ? text : (widget.text ?? "")}
        />
      );
    case "image": {
      const src = imageSrc(widget, sensors);
      return <ImageWidget widget={widget} src={src} />;
    }
    case "clock":
      return <Clock widget={widget} />;
    case "shape":
      return <Shape widget={widget} />;
    default:
      return null;
  }
}
