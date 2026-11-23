import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Copy, ImageOff, Link2, Plus } from "lucide-react";
import { PulseDot } from "@/components/pulse-dot";
import { FOCUS_RING } from "@/components/ui/button";
import { Sparkline, sparkSummary } from "@/components/ui/sensor-row";
import type { HistoryRecorder } from "@/lib/data-history";
import { resolveImageUrl } from "@/lib/image";
import type { DataPoint } from "@/lib/data-points";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import {
  GROUP_ROW_H,
  POINT_ROW_H,
  changedText,
  isBoundTo,
  isImagePoint,
  rowAt,
  rowOffsets,
  splitNumber,
  stickyIndex,
  streamPath,
  usedInChips,
  valueCell,
  windowRange,
  type BindOption,
  type GroupRow,
  type TableRow,
} from "./explorer-model";
import type { Usage, UsageIndex } from "@/lib/data-usage";
import { TypeIcon } from "./explorer-parts";
import { useCopy } from "./use-copy";

/** The table's columns: Sensor, Now, Unit, Last 60 s, Used in (wide windows only) and the row actions. */
const COLS = {
  wide: "grid-cols-[minmax(0,1.6fr)_88px_52px_136px_minmax(0,1fr)_92px]",
  narrow: "grid-cols-[minmax(0,1.6fr)_88px_52px_136px_92px]",
};

interface PointTableProps {
  rows: TableRow[];
  values: SensorMap;
  recorder: HistoryRecorder;
  usage: UsageIndex;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** A group header's chevron: fold or unfold that container. */
  onToggleGroup: (id: string) => void;
  /** The point keys of the rows now drawn (the window over the list), so only those are recorded. */
  onVisible: (keys: string[]) => void;
  /** Where a row's quick-bind button binds; null when nothing can be bound. */
  target: BindOption | null;
  onToggleBind: (point: DataPoint, bound: boolean) => void;
  /** The screens that use each key, and the alert rules that watch it (the "Used in" column). */
  screens: Map<string, string[]>;
  alerts: Map<string, { id: string; name: string }[]>;
  apiBase: string;
  /** Show the "Used in" column (hidden on narrow windows). */
  showUsedIn: boolean;
  /** The Data API is connected: the NOW header shows a pulsing dot (none otherwise). */
  live: boolean;
}

/** The Data page's point table: its header and the virtualised list of grouped sensor rows. */
export function PointTable({ rows, values, recorder, usage, selectedKey, onSelect, onToggleGroup, onVisible, target, onToggleBind, screens, alerts, apiBase, showUsedIn, live }: PointTableProps) {
  const cols = showUsedIn ? COLS.wide : COLS.narrow;
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <div className={cn("grid gap-3 whitespace-nowrap border-b border-ui-subtle px-4 py-2 text-caption font-medium text-ui-3", cols)}>
        <span>Sensor</span>
        <span className="flex items-center justify-end gap-1.5">
          {live && <PulseDot color="var(--ui-ok)" pulse label="Live" className="h-1.5 w-1.5 shrink-0 rounded-full" />}
          Now
        </span>
        <span>Unit</span>
        <span>Last 60 s</span>
        {showUsedIn && <span>Used in</span>}
        <span />
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-body text-ui-3">No data points match these filters</div>
      ) : (
        <VirtualRows
          rows={rows}
          onToggleGroup={onToggleGroup}
          onVisible={onVisible}
          renderPoint={(p, tabIndex) => (
            <PointRow
              point={p}
              tabIndex={tabIndex}
              cols={cols}
              values={values}
              recorder={recorder}
              usedBy={usage.byKey.get(p.key) ?? []}
              selected={p.key === selectedKey}
              onSelect={onSelect}
              screens={screens.get(p.key)}
              alerts={alerts.get(p.key)}
              apiBase={apiBase}
              showUsedIn={showUsedIn}
              target={target}
              onToggleBind={onToggleBind}
            />
          )}
        />
      )}
    </div>
  );
}

interface VirtualRowsProps {
  rows: TableRow[];
  onToggleGroup: (id: string) => void;
  onVisible: (keys: string[]) => void;
  renderPoint: (point: DataPoint, tabIndex: 0 | -1) => ReactNode;
}

const rowKey = (row: TableRow): string => (row.kind === "group" ? `g:${row.id}` : row.point.key);

/** Up and Down move between the drawn rows and group headers. */
function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const here = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-row]") : null;
  if (!here || e.target !== here) return;
  const next = e.key === "ArrowDown" ? here.parentElement?.nextElementSibling : here.parentElement?.previousElementSibling;
  const row = next?.querySelector<HTMLElement>("[data-row]");
  if (!row) return;
  e.preventDefault();
  row.focus();
}

/**
 * A fixed-row-height window over the flat list; the current group header stays pinned on top. It reports the point keys
 * it draws, so the history records those rows and no others. The caller keys it on the filters, so a new result list
 * starts scrolled to the top.
 */
function VirtualRows({ rows, onToggleGroup, onVisible, renderPoint }: VirtualRowsProps) {
  const ref = useRef<HTMLDivElement>(null);
  /** The row that is the list's one Tab stop: the last focused one, else the first drawn. */
  const [active, setActive] = useState<string | null>(null);
  /** A row Home or End asked for that may still be scrolled out. */
  const pending = useRef<string | null>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const offsets = useMemo(() => rowOffsets(rows), [rows]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { start, end } = windowRange(offsets, view.top, view.height);
  const pinned = rows[stickyIndex(rows, rowAt(offsets, view.top))];
  const drawn = rows.slice(start, end);
  const keys = drawn.flatMap((r) => (r.kind === "point" ? [r.point.key] : [])).join("\n");

  const stop = drawn.some((r) => rowKey(r) === active) ? active : drawn[0] && rowKey(drawn[0]);

  /** Focus the row Home or End asked for once it is drawn. */
  const focusPending = () => {
    if (pending.current === null) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(pending.current)}"] [data-row]`);
    if (!el) return;
    pending.current = null;
    el.focus();
  };
  useEffect(focusPending, [start, end]);

  useEffect(() => onVisible(keys === "" ? [] : keys.split("\n")), [keys, onVisible]);
  useEffect(() => () => onVisible([]), [onVisible]);

  return (
    <div
      ref={ref}
      onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
      onKeyDown={(e) => {
        onListKeyDown(e);
        if ((e.key !== "Home" && e.key !== "End") || e.altKey || e.ctrlKey || e.metaKey) return;
        if (!(e.target instanceof Element) || e.target !== e.target.closest("[data-row]")) return;
        const at = e.key === "Home" ? 0 : rows.length - 1;
        e.preventDefault();
        pending.current = rowKey(rows[at]);
        setActive(pending.current);
        e.currentTarget.scrollTop = offsets[at];
        setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight });
        focusPending();
      }}
      onFocus={(e) => {
        const key = e.target instanceof Element && e.target.hasAttribute("data-row") ? e.target.parentElement?.getAttribute("data-key") : null;
        if (key) setActive(key);
      }}
      className="relative min-h-0 flex-1 overflow-y-auto"
    >
      {pinned?.kind === "group" && (
        <div className="sticky top-0 z-10 h-0">
          <GroupHeader row={pinned} onToggle={onToggleGroup} pinned tabIndex={-1} />
        </div>
      )}
      <div className="relative" style={{ height: offsets[offsets.length - 1] }}>
        {drawn.map((row, i) => (
          <div
            key={rowKey(row)}
            data-key={rowKey(row)}
            className="absolute inset-x-0"
            style={{ top: offsets[start + i], height: row.kind === "group" ? GROUP_ROW_H : POINT_ROW_H }}
          >
            {row.kind === "group" ? <GroupHeader row={row} onToggle={onToggleGroup} tabIndex={rowKey(row) === stop ? 0 : -1} /> : renderPoint(row.point, rowKey(row) === stop ? 0 : -1)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** `pinned` is the copy that sticks to the top: for the pointer only, the real header stays in the list for the keyboard and screen readers. */
function GroupHeader({ row, onToggle, pinned, tabIndex }: { row: GroupRow; onToggle: (id: string) => void; pinned?: boolean; tabIndex: 0 | -1 }) {
  return (
    <div
      data-row={pinned ? undefined : ""}
      role="button"
      tabIndex={tabIndex}
      aria-hidden={pinned || undefined}
      aria-expanded={!row.collapsed}
      aria-label={`${row.title}${row.sub ? ` ${row.sub}` : ""}, ${row.count} ${row.count === 1 ? "point" : "points"}`}
      onClick={() => onToggle(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(row.id);
        }
      }}
      style={{ height: GROUP_ROW_H }}
      className={cn("flex cursor-pointer items-center gap-2 border-b border-ui-subtle bg-ui-app px-4 focus-visible:-outline-offset-2", FOCUS_RING)}
    >
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-ui-hint transition-transform", row.collapsed && "-rotate-90")} aria-hidden />
      <span className="truncate text-body font-medium text-ui-1">{row.title}</span>
      {row.sub && <span className="truncate text-caption text-ui-3">· {row.sub}</span>}
      {row.pushed && <span className="rounded-ui-sm border border-ui-strong px-1.5 text-caption text-ui-3">Pushed</span>}
      <span className="ml-auto whitespace-nowrap text-caption text-ui-3">
        {row.count} {row.count === 1 ? "point" : "points"}
      </span>
    </div>
  );
}

/** A picture's thumbnail; when the link does not load, the picture icon in its place. A new link tries again. */
export function Thumb({ src, className }: { src: string; className?: string }) {
  return <ThumbImage key={src} src={src} className={className} />;
}

function ThumbImage({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={cn("grid place-items-center rounded-ui-sm bg-ui-raised text-ui-hint", className)}>
      <ImageOff className="h-4 w-4" aria-hidden />
    </span>
  ) : (
    <img src={resolveImageUrl(src)} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("rounded-ui-sm object-cover", className)} />
  );
}

interface PointRowProps {
  point: DataPoint;
  /** 0 on the list's one Tab stop, -1 on the rest. */
  tabIndex: 0 | -1;
  cols: string;
  values: SensorMap;
  recorder: HistoryRecorder;
  usedBy: Usage[];
  selected: boolean;
  onSelect: (key: string) => void;
  screens: string[] | undefined;
  alerts: { id: string; name: string }[] | undefined;
  apiBase: string;
  showUsedIn: boolean;
  target: BindOption | null;
  onToggleBind: (point: DataPoint, bound: boolean) => void;
}

/** The row's actions are pointer shortcuts (tab index -1): the keyboard has them in the detail pane, and Up and Down walk the rows. */
const ROW_ACTION = cn(
  "flex h-6 w-6 items-center justify-center rounded-ui-sm text-ui-hint hover:bg-ui-hover hover:text-ui-1 [&_svg]:h-3.5 [&_svg]:w-3.5",
  FOCUS_RING
);
/** A hover action shows on hover and when focus is inside the row. */
const ON_HOVER = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100";

function PointRow({ point, tabIndex, cols, values, recorder, usedBy, selected, onSelect, screens, alerts, apiBase, showUsedIn, target, onToggleBind }: PointRowProps) {
  const copy = useCopy();
  const cell = valueCell(point, values);
  const split = point.type === "number" ? splitNumber(cell.text) : null;
  const image = isImagePoint(point);
  const bound = isBoundTo(usedBy, target);
  const bindTitle = target ? `${bound ? "Unbind from" : "Bind to"} ${target.label}` : "Bind";
  const samples = point.type === "number" ? recorder.history.get(point.key) : [];
  const used = usedInChips(screens, alerts);
  const unit = point.type === "number" ? (split?.unit ?? values[point.key]?.unit ?? point.unit) : "";
  return (
    <div
      data-row
      role="button"
      tabIndex={tabIndex}
      aria-current={selected}
      aria-label={`${point.name}, ${cell.text}`}
      onClick={() => onSelect(point.key)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(point.key);
        }
      }}
      style={{ height: POINT_ROW_H }}
      className={cn(
        "group relative grid cursor-pointer items-center gap-3 border-b border-ui-row px-4 transition-colors duration-(--ui-dur-fast) ease-ui focus-visible:-outline-offset-2",
        FOCUS_RING,
        cols,
        selected ? "bg-ui-raised after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-ui-accent" : "hover:bg-ui-hover"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-ui-md bg-ui-raised">
          <TypeIcon type={point.type} image={image} className="h-4 w-4 text-ui-hint" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body text-ui-1">{point.name}</span>
          <span className="truncate font-ui-mono text-caption text-ui-hint">{point.key}</span>
        </div>
      </div>
      <span
        title={cell.text}
        className={cn(
          "truncate text-right font-ui-mono text-body tabular-nums",
          cell.tone === "number" && "text-ui-1",
          cell.tone === "text" && "text-ui-2",
          cell.tone === "empty" && "text-ui-4"
        )}
      >
        {split ? split.num : cell.text}
      </span>
      <span className="truncate font-ui-mono text-caption text-ui-hint">{unit}</span>
      <div className="min-w-0 text-caption text-ui-3">
        {point.type === "number" ? (
          <Sparkline samples={samples} label={sparkSummary(point.name, samples, unit)} selected={selected} className="w-30" />
        ) : image ? (
          <Thumb src={values[point.key]?.text?.trim() || point.raw} className="h-7 w-7" />
        ) : point.type === "empty" ? null : (
          <span className="block truncate">{changedText(recorder.changesOf(point.key), Date.now())}</span>
        )}
      </div>
      {showUsedIn && (
        <span title={used.title || undefined} className="flex min-w-0 items-center gap-1 overflow-hidden">
          {used.chips.length === 0 ? (
            <span className="text-caption text-ui-4">—</span>
          ) : (
            used.chips.map((c) => (
              <span key={c} className="truncate rounded-ui-sm border border-ui-strong px-1.5 text-caption text-ui-2">
                {c}
              </span>
            ))
          )}
          {used.more > 0 && <span className="shrink-0 text-caption text-ui-3">+{used.more}</span>}
        </span>
      )}
      <div className="flex justify-end gap-0.5">
        <button
          type="button"
          aria-label={`Copy key of ${point.name}`}
          title="Copy key"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            copy(point.key);
          }}
          className={cn(ROW_ACTION, ON_HOVER)}
        >
          <Copy aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Copy link of ${point.name}`}
          title="Copy link"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            copy(`${apiBase}${streamPath(point.key)}`);
          }}
          className={cn(ROW_ACTION, ON_HOVER)}
        >
          <Link2 aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`${bindTitle}: ${point.name}`}
          aria-pressed={bound}
          title={bindTitle}
          tabIndex={-1}
          disabled={!target}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBind(point, bound);
          }}
          className={cn(ROW_ACTION, "disabled:opacity-40", bound && "text-ui-accent")}
        >
          {bound ? <Check aria-hidden /> : <Plus aria-hidden />}
        </button>
      </div>
    </div>
  );
}
