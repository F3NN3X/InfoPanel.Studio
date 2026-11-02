import type { ModuleSettings } from "@/modules/types";
import { entryText } from "./entries";
import { Widget, shell, num, roomy, Chip, Empty, Metric, STATE, type ShellProps } from "./kit";
import { meta, P } from "./meta/Notifications";

export { meta };



export interface NotificationsProps extends ShellProps {
  look?: ModuleSettings;
  /** The history list (default true). */
  showHistory?: boolean;
  /** Max history lines, 1-200 (default 50). */
  maxLines?: number;
}

interface Line {
  time: string;
  type: string;
  message: string;
}

/** Error and Warning keep their semantic colours; every other type is neutral. */
const typeColor = (type: string): string | undefined => (type === "Error" ? STATE.crit : type === "Warning" ? STATE.warn : undefined);

export default function Notifications(p: NotificationsProps) {
  const k = (id: string) => entryText(p.data, P, id);
  const count = num(k("notification-count"));
  const hasCount = Number.isFinite(count);
  const last = k("last-notification");
  const status = k("status");
  const max = Math.max(1, Math.round(Number(p.maxLines) || 50));
  // "time, type, message" per line
  const lines: Line[] = (k("notification-history") ?? "")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(0, max)
    .map((l) => {
      const [time, type, ...rest] = l.split(", ");
      return { time, type: type ?? "", message: rest.join(", ") };
    });
  const showHistory = (p.showHistory ?? true) && lines.length > 0;
  const worst = lines.some((l) => l.type === "Error") ? "crit" : lines.some((l) => l.type === "Warning") ? "warn" : "ok";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Notifications"}
      icon="notifications"
      right={hasCount ? <Chip>{Math.round(count)}</Chip> : undefined}
      compact={(box) =>
        // a 2x1 tile hides the compact sub line, which would lose the status: lay out the title and the status instead
        box.shape === "tile" && box.w >= 200 ? undefined : { label: "Notifications", value: hasCount ? Math.round(count) : "–", sub: last ?? status ?? "", t: hasCount && count > 0 ? worst : "ok", kind: "value", icon: "notifications" }
      }
      studio={{ label: "Notifications", value: hasCount ? Math.round(count) : "–", sub: last ?? status ?? "", rows: lines.map((l) => ({ n: l.message, v: l.time })) }}
    >
      {({ size, w, h }) => {
        if (last === undefined && !hasCount && !status) return <Empty icon="notifications" label="No notifications" />;
        if (size === "xs")
          return (
            <div className="flex h-full min-w-0 flex-col justify-center gap-0.5">
              <Metric label={h === 0 || h >= 56 ? "Notifications" : undefined} value={hasCount ? Math.round(count) : "–"} scale={h === 0 || h >= 56 ? "lg" : "md"} sub={h === 0 || h >= 72 ? last : undefined} />
              {status && (h === 0 || h >= 88) && <div className="truncate text-micro text-[color:var(--w-faint)]">{status}</div>}
            </div>
          );
        // the history shows the lines that fit (no scroll container); before the first measurement (h = 0) all of them
        // At 4x4 few lines get roomy rows and many pack tight, under a row of counts by type.
        const room = roomy(w, h);
        const rowH = room ? Math.min(30, Math.max(20, Math.floor((h - 120) / Math.max(lines.length, 5)))) : size === "lg" ? 26 : 20;
        const fit = h > 0 ? Math.max(1, Math.floor((h - (room ? 120 : 72)) / rowH)) : lines.length;
        const counts = room && showHistory ? [...lines.reduce((m, l) => m.set(l.type, (m.get(l.type) ?? 0) + 1), new Map<string, number>())] : [];
        const text = size === "lg" ? "text-sm" : "text-xs";
        return (
          <div className="flex h-full min-h-0 flex-col">
            {last && <div title={last} className={`font-medium text-[color:var(--w-fg)] ${size === "lg" ? "line-clamp-2 break-words text-base" : "truncate text-sm"}`}>{last}</div>}
            {status && <div className="mt-1 truncate text-xs text-[color:var(--w-faint)]">{status}</div>}
            {counts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {counts.map(([type, n]) => {
                  const c = typeColor(type);
                  return (
                    <Chip key={type} className={c ? "" : "text-[color:var(--w-muted)]"}>
                      <span className="tabular-nums" style={c ? { color: c } : undefined}>{n}</span>
                      {type || "Other"}
                    </Chip>
                  );
                })}
              </div>
            )}
            {showHistory && (
              <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-hidden border-t border-[color:var(--w-track)] pt-3">
                {lines.slice(0, fit).map((l, i) => {
                  const c = typeColor(l.type);
                  return (
                    <div key={i} className={`flex ${room ? "items-center" : "items-baseline"} gap-2 ${text}`} style={room ? { minHeight: rowH - 4 } : undefined}>
                      <span className="shrink-0 font-mono tabular-nums text-[color:var(--w-muted)]">{l.time}</span>
                      <span
                        className="shrink-0 rounded px-1.5 py-px text-micro tracking-wider text-[color:var(--w-muted)]"
                        style={{ background: c ? `color-mix(in oklab, ${c} 14%, transparent)` : "var(--w-track)", ...(c ? { color: c } : null) }}
                      >
                        {l.type}
                      </span>
                      <span className="min-w-0 truncate text-[color:var(--w-muted)]" title={l.message}>
                        {l.message}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
