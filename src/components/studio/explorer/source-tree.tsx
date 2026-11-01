import { useState } from "react";
import { ChevronDown, Database, Eye, EyeOff, MoreHorizontal, Pencil, Search, type LucideIcon } from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import { CATEGORIES, type DataSource, type Health } from "@/lib/data-points";
import type { SourcePref } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { prefKeyOf, type Scope } from "./explorer-model";
import { CAPTION, HEALTH_LABEL, StatusDot } from "./explorer-parts";
import { sourceIcon } from "./source-icons";

const HEALTHS: Health[] = ["ok", "warn", "off"];

interface SourceTreeProps {
  /** Sources after the filter field and health chip. */
  sources: DataSource[];
  counts: Record<Health, number>;
  totalPoints: number;
  scope: Scope;
  onScope: (scope: Scope) => void;
  query: string;
  onQuery: (query: string) => void;
  health: Health | null;
  onHealth: (health: Health | null) => void;
  sourcePrefs: Record<string, SourcePref> | undefined;
  onPrefsChange: (key: string, pref: Partial<SourcePref>) => void;
}

interface PrefMenu {
  x: number;
  y: number;
  key: string;
}

/** The Data view's source tree (under the Connection card): filter, health chips, "All data points" and the categorised sources. */
export function SourceTree({
  sources,
  counts,
  totalPoints,
  scope,
  onScope,
  query,
  onQuery,
  health,
  onHealth,
  sourcePrefs,
  onPrefsChange,
}: SourceTreeProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<PrefMenu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const searching = query.trim() !== "";

  /** The label, overflow menu and rename field of the row that edits preference `key`. */
  const prefProps = (key: string | null, name: string) => {
    const pref = key ? sourcePrefs?.[key] : undefined;
    return {
      label: pref?.displayName?.trim() || name,
      muted: pref?.enabled === false,
      onMenu:
        key === null ? undefined : (rect: DOMRect) => setMenu({ x: rect.left, y: rect.bottom + 4, key }),
      rename:
        key !== null && renaming === key
          ? {
              value: pref?.displayName ?? "",
              placeholder: name,
              onCommit: (value: string) => {
                setRenaming(null);
                onPrefsChange(key, { displayName: value.trim() || undefined });
              },
              onCancel: () => setRenaming(null),
            }
          : undefined,
    };
  };

  const menuEntries = (m: PrefMenu): ContextMenuEntry[] => {
    const enabled = sourcePrefs?.[m.key]?.enabled !== false;
    return [
      {
        id: "visibility",
        label: enabled ? "Hide in dashboard" : "Show in dashboard",
        icon: enabled ? <EyeOff /> : <Eye />,
        onSelect: () => onPrefsChange(m.key, { enabled: !enabled }),
      },
      { id: "rename", label: "Rename…", icon: <Pencil />, onSelect: () => setRenaming(m.key) },
    ];
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col font-ui max-sm:min-h-[260px] max-sm:flex-none">
      <div className="flex flex-col gap-2 px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-4" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Filter sources"
            aria-label="Filter sources"
            className="h-[30px] w-full rounded-[7px] border border-ui-default bg-ui-app pl-8 pr-2 text-[12.5px] text-ui-1 placeholder:text-ui-4 focus:border-ui-accent/60 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {HEALTHS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={health === h}
              onClick={() => onHealth(health === h ? null : h)}
              className={cn(
                "inline-flex h-6 items-center gap-[5px] whitespace-nowrap rounded-full border px-2 text-[11px] text-ui-2 transition-colors",
                health === h ? "border-[#3a3a44] bg-ui-default" : "border-ui-default hover:bg-ui-hover"
              )}
            >
              <StatusDot health={h} />
              {counts[h]} {HEALTH_LABEL[h]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-3">
        <Row
          kind="all"
          selected={scope.kind === "all"}
          onClick={() => onScope({ kind: "all" })}
          icon={Database}
          label="All data points"
          count={totalPoints}
        />
        {sources.length === 0 && <div className="px-2 py-3 text-xs text-ui-4">No sources match.</div>}
        {CATEGORIES.map((category) => {
          const inCategory = sources.filter((s) => s.category === category);
          if (inCategory.length === 0) return null;
          return (
            <div key={category} className="mt-2.5 flex flex-col gap-px">
              <span className={cn(CAPTION, "px-2 pb-1")}>{category}</span>
              {inCategory.map((s) => {
                const expandable = s.containers.length > 1;
                const expanded = expandable && (searching || open[s.id] === true);
                return (
                  <div key={s.id} className="flex flex-col gap-px">
                    <Row
                      kind="source"
                      selected={scope.kind === "source" && scope.id === s.id}
                      onClick={() => {
                        onScope({ kind: "source", id: s.id });
                        if (expandable) setOpen((o) => ({ ...o, [s.id]: true }));
                      }}
                      icon={sourceIcon(s)}
                      {...prefProps(prefKeyOf(s), s.name)}
                      count={s.count}
                      status={s.status}
                      chevron={expandable ? (expanded ? "open" : "closed") : "none"}
                      chevronDisabled={searching}
                      onChevron={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                    />
                    {expanded &&
                      s.containers.map((c) => (
                        <Row
                          key={c.id}
                          kind="container"
                          selected={scope.kind === "container" && scope.id === c.id}
                          onClick={() => onScope({ kind: "container", id: c.id, sourceId: s.id })}
                          {...prefProps(prefKeyOf(s, c), c.title)}
                          count={c.points.length}
                          dimmed={c.status === "warn"}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries(menu)} onClose={() => setMenu(null)} />}
    </div>
  );
}

interface RowProps {
  /** The "All data points" row, a source row (chevron, icon, health dot) or a container row. */
  kind: "all" | "source" | "container";
  selected: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: LucideIcon;
  status?: Health;
  /** The container reports no data. */
  dimmed?: boolean;
  /** Hidden from the dashboard by its preference. */
  muted?: boolean;
  /** "none" keeps the chevron's room so sources line up. */
  chevron?: "open" | "closed" | "none";
  /** A filtered tree is forced open, so the chevron has nothing to do. */
  chevronDisabled?: boolean;
  onChevron?: () => void;
  /** Opens the row's show / rename menu, anchored at its button. */
  onMenu?: (anchor: DOMRect) => void;
  /** Swaps the label for a text field. */
  rename?: { value: string; placeholder: string; onCommit: (value: string) => void; onCancel: () => void };
}

const ROW_BOX: Record<RowProps["kind"], string> = {
  all: "gap-[9px] rounded-[7px] px-2 py-[7px]",
  source: "gap-1.5 rounded-[7px] py-1.5 pl-0.5 pr-2",
  container: "gap-2 rounded-md py-[5px] pl-[46px] pr-2",
};

function Row({
  kind,
  selected,
  onClick,
  label,
  count,
  icon: Icon,
  status,
  dimmed,
  muted,
  chevron = "none",
  chevronDisabled,
  onChevron,
  onMenu,
  rename,
}: RowProps) {
  const labelTone = selected
    ? "text-white"
    : kind === "container"
      ? dimmed
        ? "text-ui-4"
        : "text-[#b4b4bc]"
      : kind === "all"
        ? "text-ui-1"
        : "text-ui-2";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer items-center transition-colors",
        ROW_BOX[kind],
        selected ? "bg-ui-accent-soft" : "hover:bg-ui-hover"
      )}
    >
      {kind === "source" && (
        <button
          type="button"
          aria-label={chevron === "none" ? undefined : `${chevron === "open" ? "Collapse" : "Expand"} ${label}`}
          aria-expanded={chevron === "none" ? undefined : chevron === "open"}
          aria-hidden={chevron === "none" || undefined}
          tabIndex={chevron === "none" ? -1 : 0}
          disabled={chevronDisabled || chevron === "none"}
          onClick={(e) => {
            e.stopPropagation();
            onChevron?.();
          }}
          className={cn(
            "grid h-[18px] w-[18px] shrink-0 place-items-center text-ui-hint hover:text-ui-1 disabled:hover:text-ui-hint",
            chevron === "none" ? "opacity-0" : chevronDisabled && "opacity-40"
          )}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", chevron !== "open" && "-rotate-90")} />
        </button>
      )}
      {Icon && <Icon className={cn("shrink-0 text-ui-4", kind === "all" ? "h-[17px] w-[17px]" : "h-4 w-4")} />}
      {rename ? (
        <input
          autoFocus
          defaultValue={rename.value}
          placeholder={rename.placeholder}
          aria-label={`Display name for ${rename.placeholder}`}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => rename.onCommit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              e.currentTarget.value = rename.value; // the blur that follows must not save the edit
              rename.onCancel();
            }
          }}
          className="h-6 min-w-0 flex-1 rounded border border-ui-default bg-ui-app px-1.5 text-[12px] text-ui-1 placeholder:text-ui-4 focus:border-ui-accent/60 focus:outline-none"
        />
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            kind === "container" ? "text-[12px]" : "text-[12.5px]",
            kind === "all" && "font-medium",
            labelTone,
            muted && "line-through opacity-60"
          )}
        >
          {label}
        </span>
      )}
      <span className={cn("font-ui-mono text-micro tabular-nums", kind === "all" ? "text-ui-4" : "text-ui-hint")}>{count}</span>
      {onMenu && (
        <button
          type="button"
          aria-label={`Options for ${label}`}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e.currentTarget.getBoundingClientRect());
          }}
          className={cn(
            "absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-ui-hover text-ui-3 opacity-0 hover:bg-ui-active hover:text-ui-1 focus-visible:opacity-100 group-hover:opacity-100",
            status ? "right-5" : "right-2"
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}
      {status && <StatusDot health={status} />}
    </div>
  );
}
