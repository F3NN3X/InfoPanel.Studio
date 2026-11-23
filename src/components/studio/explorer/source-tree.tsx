import { useState } from "react";
import { ChevronDown, Database, Eye, EyeOff, MoreHorizontal, Pencil, Search, type LucideIcon } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { FIELD_BOX } from "@/components/ui/field";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import type { DataSource, Health } from "@/lib/data-points";
import type { SourcePref } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { prefKeyOf, type Scope } from "./explorer-model";
import { GROUP_LABEL, HEALTH_LABEL, StatusDot } from "./explorer-parts";
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

/** The Sources list in the Data page's left column: All points and each source with its count and health dot, then the filter field and health chips. */
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
      onMenu: key === null ? undefined : (rect: DOMRect) => setMenu({ x: rect.left, y: rect.bottom + 4, key }),
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
    <section aria-label="Sources" className="flex flex-col gap-3 px-3 pt-4 font-ui">
      <h2 className={cn(GROUP_LABEL, "m-0 px-2")}>Sources</h2>
      <div className="flex flex-col gap-0.5">
        <Row kind="all" selected={scope.kind === "all"} onClick={() => onScope({ kind: "all" })} icon={Database} label="All points" count={totalPoints} />
        {sources.length === 0 && <div className="px-2 py-3 text-caption text-ui-3">No sources match</div>}
        {sources.map((s) => {
          const expandable = s.containers.length > 1;
          const expanded = expandable && (searching || open[s.id] === true);
          return (
            <div key={s.id} className="flex flex-col gap-0.5">
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

      <div className="flex flex-col gap-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-hint" strokeWidth={1.5} aria-hidden />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Filter sources"
            aria-label="Filter sources"
            className={cn(FIELD_BOX, "h-7 w-full pl-8 pr-2 text-caption")}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HEALTHS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={health === h}
              onClick={() => onHealth(health === h ? null : h)}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-ui-sm border px-2 text-caption transition-colors duration-(--ui-dur-fast) ease-ui",
                FOCUS_RING,
                health === h ? "border-ui-accent text-ui-1" : "border-ui-strong text-ui-3 hover:text-ui-1"
              )}
            >
              <StatusDot health={h} />
              {counts[h]} {HEALTH_LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries(menu)} onClose={() => setMenu(null)} />}
    </section>
  );
}

interface RowProps {
  /** The "All points" row, a source row (chevron, icon, health dot) or a container row. */
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

function Row({ kind, selected, onClick, label, count, icon: Icon, status, dimmed, muted, chevron = "none", chevronDisabled, onChevron, onMenu, rename }: RowProps) {
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
        "group relative flex h-8 cursor-pointer items-center gap-2 rounded-ui-md pr-2 transition-colors duration-(--ui-dur-fast) ease-ui",
        FOCUS_RING,
        kind === "container" ? "pl-9" : kind === "source" ? "pl-0.5" : "pl-2",
        selected ? "bg-ui-raised" : "hover:bg-ui-hover"
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
            "grid h-4.5 w-4.5 shrink-0 place-items-center rounded-ui-sm text-ui-hint hover:text-ui-1 disabled:hover:text-ui-hint",
            FOCUS_RING,
            chevron === "none" ? "opacity-0" : chevronDisabled && "opacity-40"
          )}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", chevron !== "open" && "-rotate-90")} aria-hidden />
        </button>
      )}
      {Icon && <Icon className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />}
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
          className={cn(FIELD_BOX, "h-6 min-w-0 flex-1 px-1.5 text-caption")}
        />
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            selected ? "text-ui-1" : kind === "container" && dimmed ? "text-ui-hint" : "text-ui-2",
            muted && "line-through opacity-60"
          )}
        >
          {label}
        </span>
      )}
      <span className="font-ui-mono text-caption tabular-nums text-ui-hint">{count}</span>
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
            "absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-ui-sm bg-ui-hover text-ui-3 opacity-0 hover:bg-ui-active hover:text-ui-1 focus-visible:opacity-100 group-hover:opacity-100",
            FOCUS_RING,
            status ? "right-7" : "right-2"
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      {status ? <StatusDot health={status} /> : kind !== "all" && <span className="w-1.5 shrink-0" aria-hidden />}
    </div>
  );
}
