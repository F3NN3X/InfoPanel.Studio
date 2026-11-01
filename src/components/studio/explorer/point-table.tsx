import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Copy, EyeOff, Link2, Search } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import type { DataPoint, DataSource } from "@/lib/data-points";
import type { SourcePref } from "@/lib/layout";
import type { UsageIndex } from "@/lib/data-usage";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import {
  GROUP_ROW_H,
  POINT_ROW_H,
  isBoundTo,
  pointDisplayName,
  rowAt,
  rowOffsets,
  stickyIndex,
  usedInCell,
  valueCell,
  windowRange,
  type BindOption,
  type Crumb,
  type Scope,
  type TableRow,
  type TypeFilter,
} from "./explorer-model";
import { CAPTION, Chip, TypeIcon, ToggleChip } from "./explorer-parts";
import { useCopy } from "./use-copy";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "number", label: "Numbers" },
  { value: "text", label: "Text" },
  { value: "list", label: "Lists" },
  { value: "url", label: "Links" },
];

type GroupRow = Extract<TableRow, { kind: "group" }>;

interface PointTableProps {
  crumbs: Crumb[];
  onScope: (scope: Scope) => void;
  /** A group header was clicked: scope to that container. */
  onGroup: (row: GroupRow) => void;
  /** Where a row's quick-bind button binds; null when nothing can be bound. */
  target: BindOption | null;
  onToggleBind: (point: DataPoint, bound: boolean) => void;
  shown: number;
  total: number;
  rows: TableRow[];
  values: SensorMap;
  usage: UsageIndex;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  query: string;
  onQuery: (query: string) => void;
  type: TypeFilter;
  onType: (type: TypeFilter) => void;
  hideEmpty: boolean;
  onHideEmpty: (on: boolean) => void;
  inUse: boolean;
  onInUse: (on: boolean) => void;
  /** The screens that use each key (the "Used in" column). */
  screens: Map<string, string[]>;
  /** The sources, and their display names: a row edits its source's (SPEC §10.2). */
  sources: readonly DataSource[];
  sourcePrefs: Record<string, SourcePref> | undefined;
  onDisplayName: (key: string, displayName: string | undefined) => void;
  /** Show the "Used in" column (hidden on narrow windows). */
  showUsedIn: boolean;
}

/** The Data view's point table: breadcrumb, search, filters and the virtualised list (Sensor · Now · Display name · Used in). */
export function PointTable({
  crumbs,
  onScope,
  onGroup,
  target,
  onToggleBind,
  shown,
  total,
  rows,
  values,
  usage,
  selectedKey,
  onSelect,
  query,
  onQuery,
  type,
  onType,
  hideEmpty,
  onHideEmpty,
  inUse,
  onInUse,
  screens,
  sources,
  sourcePrefs,
  onDisplayName,
  showUsedIn,
}: PointTableProps) {
  const cols = showUsedIn ? "grid-cols-[1.5fr_90px_1.2fr_1fr_56px]" : "grid-cols-[1.4fr_90px_1.2fr_56px]";
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <div className="space-y-2.5 border-b border-ui-subtle px-4 pb-2.5 pt-3">
        <div className="flex flex-wrap items-center gap-1 text-[12.5px] leading-[1.25]">
          {crumbs.map((c, i) => {
            const tone = i === crumbs.length - 1 ? "font-semibold text-ui-1" : "text-ui-4";
            return (
              <span key={`${i}:${c.label}`} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-4 w-4 text-ui-hint" aria-hidden />}
                {c.scope ? (
                  <button
                    type="button"
                    onClick={() => c.scope && onScope(c.scope)}
                    className={cn("rounded px-1 py-0.5 hover:bg-ui-hover", tone)}
                  >
                    {c.label}
                  </button>
                ) : (
                  <span className={cn("px-1 py-0.5", tone)}>{c.label}</span>
                )}
              </span>
            );
          })}
          <span className="ml-1.5 whitespace-nowrap font-ui-mono text-[11px] text-ui-4">
            {shown} of {total}
          </span>
          <span className="ml-auto text-[11.5px] font-normal text-ui-4">Display names apply to every screen.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] max-w-[380px] flex-[1_1_220px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-4" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search key, name or value"
              aria-label="Search key, name or value"
              className="h-[30px] w-full rounded-[7px] border border-ui-default bg-ui-app pl-8 pr-2 text-[12.5px] text-ui-1 placeholder:text-ui-4 focus:border-ui-accent/60 focus:outline-none"
            />
          </div>
          <Segmented label="Type" options={TYPE_OPTIONS} value={type} onChange={onType} />
          <ToggleChip active={hideEmpty} onClick={() => onHideEmpty(!hideEmpty)}>
            <EyeOff className="h-[15px] w-[15px]" />
            Hide empty
          </ToggleChip>
          <ToggleChip active={inUse} onClick={() => onInUse(!inUse)}>
            <Link2 className="h-[15px] w-[15px]" />
            In use
          </ToggleChip>
        </div>
      </div>

      <div className={cn("grid gap-3 whitespace-nowrap border-b border-ui-subtle px-4 py-[7px]", CAPTION, cols)}>
        <span>Sensor</span>
        <span>Now</span>
        <span>Display name</span>
        {showUsedIn && <span>Used in</span>}
        <span />
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-[12.5px] text-ui-4">No data points match these filters.</div>
      ) : (
        <VirtualRows
          key={`${crumbs.map((c) => c.label).join(">")}|${query}|${type}|${hideEmpty}|${inUse}|${shown}`}
          rows={rows}
          onGroup={onGroup}
          renderPoint={(p) => (
            <PointRow
              point={p}
              cols={cols}
              values={values}
              usage={usage}
              selected={p.key === selectedKey}
              onSelect={onSelect}
              screens={screens}
              sources={sources}
              sourcePrefs={sourcePrefs}
              onDisplayName={onDisplayName}
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
  onGroup: (row: GroupRow) => void;
  renderPoint: (point: DataPoint) => ReactNode;
}

/**
 * A fixed-row-height window over the flat list; the current group header stays pinned on top.
 * The caller keys it on the filters, so a new result list starts scrolled to the top.
 */
function VirtualRows({ rows, onGroup, renderPoint }: VirtualRowsProps) {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={ref}
      onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
      className="relative min-h-0 flex-1 overflow-y-auto"
    >
      {pinned?.kind === "group" && (
        <div className="sticky top-0 z-10 h-0">
          <GroupHeader row={pinned} onGroup={onGroup} />
        </div>
      )}
      <div className="relative" style={{ height: offsets[offsets.length - 1] }}>
        {rows.slice(start, end).map((row, i) => (
          <div
            key={row.kind === "group" ? `g:${row.id}` : row.point.key}
            className="absolute inset-x-0"
            style={{ top: offsets[start + i], height: row.kind === "group" ? GROUP_ROW_H : POINT_ROW_H }}
          >
            {row.kind === "group" ? <GroupHeader row={row} onGroup={onGroup} /> : renderPoint(row.point)}
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupHeader({ row, onGroup }: { row: GroupRow; onGroup: (row: GroupRow) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onGroup(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onGroup(row);
        }
      }}
      style={{ height: GROUP_ROW_H }}
      className="flex cursor-pointer items-center gap-2 border-b border-ui-subtle bg-ui-chrome px-4"
    >
      <span className="truncate text-[12px] font-semibold text-ui-1">{row.title}</span>
      {row.sourceName !== row.title && <span className="truncate text-[11px] text-ui-4">{row.sourceName}</span>}
      <span className="ml-auto font-ui-mono text-micro text-ui-hint">{row.count}</span>
    </div>
  );
}

interface PointRowProps {
  point: DataPoint;
  cols: string;
  values: SensorMap;
  usage: UsageIndex;
  selected: boolean;
  onSelect: (key: string) => void;
  screens: Map<string, string[]>;
  sources: readonly DataSource[];
  sourcePrefs: Record<string, SourcePref> | undefined;
  onDisplayName: (key: string, displayName: string | undefined) => void;
  showUsedIn: boolean;
  target: BindOption | null;
  onToggleBind: (point: DataPoint, bound: boolean) => void;
}

const ROW_ACTION = "flex h-6 w-6 items-center justify-center rounded-[5px] hover:bg-ui-default";

function PointRow({ point, cols, values, usage, selected, onSelect, screens, sources, sourcePrefs, onDisplayName, showUsedIn, target, onToggleBind }: PointRowProps) {
  const copy = useCopy();
  const usedBy = usage.byKey.get(point.key) ?? [];
  const cell = valueCell(point, values);
  const used = usedInCell(screens.get(point.key));
  const display = pointDisplayName(sources, point, sourcePrefs);
  const bound = isBoundTo(usedBy, target);
  const bindTitle = target ? `${bound ? "Unbind from" : "Bind to"} ${target.label}` : "Bind";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected}
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
        "grid cursor-pointer items-center gap-3 border-b border-ui-raised px-4 transition-colors",
        cols,
        selected ? "bg-ui-accent/12" : "hover:bg-ui-tile"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <TypeIcon type={point.type} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[12.5px] text-ui-1">{point.name}</span>
            {point.kind && <Chip>{point.kind}</Chip>}
          </div>
          <div className="truncate font-ui-mono text-micro text-ui-hint">{point.key}</div>
        </div>
      </div>
      <span
        title={cell.text}
        className={cn(
          "truncate text-[12px]",
          cell.tone === "number" && "font-ui-mono text-ui-1",
          cell.tone === "text" && "text-ui-2",
          cell.tone === "empty" && "text-[#5f5f68]"
        )}
      >
        {cell.text}
      </span>
      {display ? (
        <input
          key={display.value}
          defaultValue={display.value}
          placeholder={display.name}
          aria-label={`Display name for ${point.name}`}
          title="Renames this point's source on every screen"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const value = e.currentTarget.value.trim();
            if (value !== display.value) onDisplayName(display.key, value || undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              e.currentTarget.value = display.value; // the blur that follows must not save the edit
              e.currentTarget.blur();
            }
          }}
          className="h-6 min-w-0 rounded border border-ui-default bg-ui-app px-1.5 text-[12px] text-ui-1 placeholder:text-ui-4 focus:border-ui-accent/60 focus:outline-none"
        />
      ) : (
        <span className="truncate text-[12px] text-ui-hint">—</span>
      )}
      {showUsedIn && (
        <span title={used.used ? (screens.get(point.key) ?? []).join(", ") : undefined} className={cn("truncate text-[11.5px]", used.used ? "text-ui-accent-text" : "text-ui-disabled")}>
          {used.text}
        </span>
      )}
      <div className="flex justify-end gap-0.5">
        <button
          type="button"
          aria-label={`Copy key of ${point.name}`}
          title="Copy key"
          onClick={(e) => {
            e.stopPropagation();
            copy(point.key);
          }}
          className={cn(ROW_ACTION, "text-ui-4 hover:text-ui-1")}
        >
          <Copy className="h-[11px] w-[11px]" />
        </button>
        <button
          type="button"
          aria-label={`${bindTitle}: ${point.name}`}
          aria-pressed={bound}
          title={bindTitle}
          disabled={!target}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBind(point, bound);
          }}
          className={cn(ROW_ACTION, "disabled:opacity-40", bound ? "text-ui-accent" : "text-ui-4")}
        >
          <Link2 className="h-[11px] w-[11px]" />
        </button>
      </div>
    </div>
  );
}
