/**
 * Sensor remap (§5): the binding groups of an imported profile, each resolved to a Data API key,
 * with a key picker for the selected one. One choice fixes every item of a group. Used by Import
 * step 4 and the Remap dialog.
 */
import { useState } from "react";
import { Check, CheckCheck, CornerDownRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  candidateReason,
  confirmAll,
  filterCounts,
  inFilter,
  remapRows,
  search,
  suggest,
  withChoice,
  type CatalogIndex,
  type Group,
  type Overrides,
  type RemapFilter,
  type RemapRow,
  type RemapState,
} from "@/lib/infopanel/remap/remap";
import type { DataApiValue, Match } from "@/lib/infopanel/sensors";

export interface RemapPanelProps {
  groups: readonly Group[];
  resolved: ReadonlyMap<string, Match | null>;
  index: CatalogIndex;
  overrides: Overrides;
  /** The whole new set of choices: one change, one undo step where the caller keeps history. */
  onOverrides: (next: Map<string, string>) => void;
  /** The "N items" chip: select those items on the canvas (the Remap dialog closes). */
  onSelectItems?: (paths: string[]) => void;
}

/** A Data API value as one short line ("54 °C"). */
export function valueText(v: DataApiValue | undefined): string {
  if (!v) return "";
  if (v.value === undefined) return v.text?.split("\n")[0] ?? "";
  const n = Math.abs(v.value) >= 100 ? v.value.toFixed(0) : String(Math.round(v.value * 100) / 100);
  return `${n} ${v.unit ?? ""}`.trim();
}

const STATE: Record<RemapState, { label: string; dot: string; text: string }> = {
  matched: { label: "Matched", dot: "bg-ui-success", text: "text-ui-success" },
  confirmed: { label: "Confirmed", dot: "bg-ui-success", text: "text-ui-success" },
  chosen: { label: "Your choice", dot: "bg-ui-accent", text: "text-ui-accent-text" },
  check: { label: "Check", dot: "bg-ui-warning", text: "text-ui-warning" },
  unresolved: { label: "Unresolved", dot: "bg-ui-danger", text: "text-ui-danger" },
  unbound: { label: "Left unbound", dot: "bg-ui-5", text: "text-ui-4" },
};

const HOW: Record<string, string> = {
  ref: "exact sensor ref",
  "plugin-key": "same plugin key",
  name: "matched by name",
  suggested: "the one strong suggestion",
  chosen: "picked by you",
};

const FILTERS: { value: RemapFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "check", label: "Check" },
  { value: "unresolved", label: "Unresolved" },
  { value: "done", label: "Done" },
];

const itemsText = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

const GHOST =
  "inline-flex h-[30px] items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover disabled:opacity-50";

function KeyPicker({
  row,
  index,
  overrides,
  onChoose,
}: {
  row: RemapRow;
  index: CatalogIndex;
  overrides: Overrides;
  onChoose: (key: string | null) => void;
}) {
  const { group, match, state } = row;
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const searching = query.trim() !== "";
  const cands = searching
    ? search(index, query, 50, group).map((key) => ({ key, why: "" }))
    : suggest(group, index, 12).map((c) => ({ key: c.key, why: candidateReason(group, c) }));
  const at = Math.min(cursor, cands.length - 1);
  const how = overrides.get(group.id) === "" ? "no sensor" : match ? HOW[match.via] : "no match found";
  return (
    <div className="flex min-h-0 flex-col gap-2.5 rounded-[10px] border border-ui-default bg-ui-chrome p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-ui-1">{group.sensorName || "(no name)"}</span>
        <span className="truncate text-[11.5px] text-ui-4">
          {`${group.type} · ${group.ref ?? "no id"} · ${itemsText(group.paths.length)}`}
        </span>
        <span className={cn("text-[11.5px]", STATE[state].text)}>
          {STATE[state].label} · {how}
        </span>
      </div>
      <label className="flex h-8 items-center gap-2 rounded-lg border border-ui-strong bg-ui-app px-2.5">
        <Search className="h-4 w-4 shrink-0 text-ui-4" />
        <input
          aria-label="Search sensors"
          value={query}
          placeholder="Search keys, names, refs"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setCursor(Math.min(at + 1, cands.length - 1));
            else if (e.key === "ArrowUp") setCursor(Math.max(at - 1, 0));
            else if (e.key === "Enter" && cands[at]) onChoose(cands[at].key);
            else return;
            e.preventDefault();
          }}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ui-1 outline-none placeholder:text-ui-5"
        />
        <span className="text-[10.5px] text-ui-5">↑↓ Enter</span>
      </label>
      <span className="text-[11px] text-ui-4">{searching ? `${cands.length} matching sensors` : "Suggested"}</span>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {cands.map((c, i) => {
          const v = index.catalog.sensors[c.key];
          const on = c.key === match?.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChoose(c.key)}
              className={cn("flex items-center gap-2.5 rounded-[7px] p-2 text-left hover:bg-ui-hover", i === at && "bg-ui-active")}
            >
              <span className="w-4 shrink-0 text-ui-accent">{on && <Check className="h-4 w-4" />}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-[12.5px] text-ui-1">
                  {v?.name ?? c.key} {v?.source && <span className="text-ui-4">· {v.source}</span>}
                </span>
                <span className="truncate font-ui-mono text-[10.5px] text-ui-5">{c.key}</span>
                {c.why && <span className="text-[11px] text-ui-accent-text">{c.why}</span>}
              </span>
              <span className="max-w-[110px] shrink-0 truncate font-ui-mono text-[12px] text-ui-1" title={valueText(v)}>
                {valueText(v)}
              </span>
            </button>
          );
        })}
        {cands.length === 0 && (
          <span className="p-2 text-[12px] text-ui-4">
            {searching ? "Nothing matches. Every word must match a key, name or ref." : "No strong candidate. Search, or leave it unbound."}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 border-t border-ui-subtle pt-2.5">
        <button type="button" className={cn(GHOST, "flex-1")} onClick={() => onChoose("")}>
          Leave unbound
        </button>
        <button type="button" className={cn(GHOST, "flex-1")} disabled={!overrides.has(group.id)} onClick={() => onChoose(null)}>
          Reset to automatic
        </button>
      </div>
    </div>
  );
}

export function RemapPanel({ groups, resolved, index, overrides, onOverrides, onSelectItems }: RemapPanelProps) {
  const rows = remapRows(groups, index, resolved, overrides);
  const counts = filterCounts(rows);
  const [filter, setFilter] = useState<RemapFilter>("all");
  const shown = rows.filter((r) => inFilter(r.state, filter));
  const firstOpen = rows.find((r) => r.state === "unresolved" || r.state === "check");
  const [selId, setSelId] = useState<string | null>(firstOpen?.group.id ?? rows[0]?.group.id ?? null);
  const sel = rows.find((r) => r.group.id === selId) ?? shown[0] ?? null;
  const bindings = groups.reduce((n, g) => n + g.paths.length, 0);

  if (rows.length === 0) {
    return <p className="text-[12.5px] text-ui-3">No item reads a sensor: nothing to remap.</p>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="radiogroup" aria-label="Filter" className="flex gap-0.5 rounded-[7px] border border-ui-default bg-ui-raised p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium",
                filter === f.value ? "bg-ui-active text-ui-1" : "text-ui-3 hover:text-ui-1",
              )}
            >
              {f.label}
              <span className="font-ui-mono text-[10.5px] text-ui-4">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-ui-4">
          {`${bindings} bindings in ${rows.length} groups · ${counts.done} done · ${counts.check} to check · ${counts.unresolved} unresolved`}
        </span>
        <span className="flex-1" />
        {counts.check > 0 && (
          <button type="button" className={GHOST} onClick={() => onOverrides(confirmAll(rows, overrides))}>
            <CheckCheck className="h-4 w-4 text-ui-warning" /> Confirm all {counts.check} suggestions
          </button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.25fr)_minmax(280px,1fr)] gap-3.5 max-md:grid-cols-1">
        <div className="min-h-0 overflow-y-auto rounded-[10px] border border-ui-default">
          {shown.map((r) => {
            const v = r.match ? index.catalog.sensors[r.match.key] : undefined;
            const selected = sel?.group.id === r.group.id;
            return (
              <div
                key={r.group.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setSelId(r.group.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setSelId(r.group.id);
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-ui-subtle px-3 py-2.5 outline-none hover:bg-ui-tile focus-visible:bg-ui-hover",
                  selected && "bg-ui-hover shadow-[inset_2px_0_0_var(--ui-accent)]",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATE[r.state].dot)} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[12.5px] font-medium text-ui-1">
                    {r.group.sensorName || "(no name)"}
                    <span className="font-normal text-ui-4"> · {r.group.type}</span>
                  </span>
                  <span className={cn("flex items-center gap-1.5 truncate text-[11.5px]", r.match ? "text-ui-2" : "text-ui-5")}>
                    <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ui-5" />
                    {r.match ? (v?.name ?? r.match.key) : r.state === "unbound" ? "no sensor" : "no match"}
                    {v?.source && <span className="text-ui-4">{v.source}</span>}
                  </span>
                </div>
                {v && (
                  <span className="max-w-[96px] shrink-0 truncate font-ui-mono text-[11.5px] text-ui-2" title={valueText(v)}>
                    {valueText(v)}
                  </span>
                )}
                <span className={cn("w-[84px] shrink-0 text-[11px]", STATE[r.state].text)}>{STATE[r.state].label}</span>
                <button
                  type="button"
                  title={onSelectItems ? "Select these items on the canvas" : `${itemsText(r.group.paths.length)} read this sensor`}
                  disabled={!onSelectItems}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItems?.(r.group.paths);
                  }}
                  className="shrink-0 whitespace-nowrap rounded-[5px] bg-ui-hover px-[7px] py-0.5 font-ui-mono text-[11px] text-ui-2 enabled:hover:bg-ui-active"
                >
                  {itemsText(r.group.paths.length)}
                </button>
                {r.state === "check" && r.match && (
                  <button
                    type="button"
                    title="Confirm suggestion"
                    aria-label={`Confirm ${r.group.sensorName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOverrides(withChoice(overrides, r.group.id, r.match!.key));
                    }}
                    className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md border border-ui-strong bg-ui-raised text-ui-warning hover:bg-ui-hover"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
          {shown.length === 0 && <p className="p-3 text-[12px] text-ui-4">Nothing in this filter.</p>}
        </div>
        {sel && (
          <KeyPicker
            key={sel.group.id}
            row={sel}
            index={index}
            overrides={overrides}
            onChoose={(key) => onOverrides(withChoice(overrides, sel.group.id, key))}
          />
        )}
      </div>
    </div>
  );
}
