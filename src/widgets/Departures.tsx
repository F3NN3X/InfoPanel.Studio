import type { ModuleSettings } from "@/modules/types";
import { entryText } from "./entries";
import { Widget, shell, Chip, Empty, Metric, Num, type ShellProps } from "./kit";
import { meta, P } from "./meta/Departures";

export { meta };



export interface DeparturesProps extends ShellProps {
  look?: ModuleSettings;
  /** The status line under the rows (default true). */
  showStatus?: boolean;
}

interface Departure {
  i: number;
  line?: string;
  dest?: string;
  time?: string;
}

/** The `dep_N_line` / `dep_N_dest` / `dep_N_time` rows that exist (N is set by the plugin's NumberOfResults). */
function departures(d: ShellProps["data"]): Departure[] {
  const indexes = new Set<number>();
  for (const key of Object.keys(d)) {
    const m = key.slice(P.length).match(/^dep_(\d+)_(line|dest|time)$/);
    if (key.startsWith(P) && m) indexes.add(parseInt(m[1], 10));
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((i) => ({ i, line: entryText(d, P, `dep_${i}_line`), dest: entryText(d, P, `dep_${i}_dest`), time: entryText(d, P, `dep_${i}_time`) }))
    .filter((r) => r.line || r.dest || r.time);
}

export default function Departures(p: DeparturesProps) {
  const station = entryText(p.data, P, "station_name");
  const status = entryText(p.data, P, "status");
  const rows = departures(p.data);
  const first = rows[0];
  const showStatus = (p.showStatus ?? true) && !!status;
  const next = first ? [first.line, first.dest].filter(Boolean).join(" · ") : "";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? station ?? "Departures"}
      icon="departure_board"
      right={rows.length > 0 ? <Chip>{rows.length}</Chip> : undefined}
      compact={(box) =>
        // a 2x1 tile hides the compact sub line, which would lose the status: lay out the next departure and the status instead
        box.shape === "tile" && box.w >= 200 ? undefined : { label: station ?? "Departures", value: first?.time ?? "--:--", sub: next, kind: "text", icon: "departure_board" }
      }
      studio={{ label: station ?? "Departures", value: first?.time ?? "--:--", sub: next, rows: rows.map((r) => ({ n: `${r.line ?? "·"} ${r.dest ?? "—"}`, v: r.time ?? "--:--" })) }}
    >
      {({ size, h }) => {
        if (!station && rows.length === 0) return <Empty icon="departure_board" label="No upcoming departures" />;
        if (size === "xs")
          return (
            <div className="flex h-full min-w-0 flex-col justify-center gap-1">
              <Metric label={station ?? "Departures"} value={first?.time ?? "--:--"} scale="md" sub={next} />
              {showStatus && <div className="truncate text-[10px] text-[color:var(--w-faint)]">{status}</div>}
            </div>
          );
        // before the first measurement (h = 0) every row renders
        const n = h > 0 ? Math.max(1, Math.floor((h - (showStatus ? 28 : 0)) / 46)) : rows.length;
        return (
          <div className="flex h-full min-h-0 flex-col">
            {rows.length > 0 ? (
              <div className="min-h-0 flex-1 divide-y divide-[color:var(--w-track)] overflow-hidden">
                {rows.slice(0, n).map((r) => (
                  <div key={r.i} className="flex items-center gap-4 py-2">
                    <Num className="min-w-14 shrink-0 whitespace-nowrap text-lg text-[color:var(--w-fg)]" weight={600}>
                      {r.time ?? "--:--"}
                    </Num>
                    <Chip className="w-10 justify-center">{r.line ?? "·"}</Chip>
                    <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--w-fg)]" title={r.dest}>
                      {r.dest ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[color:var(--w-muted)]">No upcoming departures</div>
            )}
            {showStatus && <div className="mt-3 shrink-0 truncate text-xs text-[color:var(--w-faint)]">{status}</div>}
          </div>
        );
      }}
    </Widget>
  );
}
