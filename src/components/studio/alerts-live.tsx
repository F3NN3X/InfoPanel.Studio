import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { ActiveAlert, AlertHistoryEntry } from "@/lib/alerts";
import { postControl } from "@/lib/control";
import { ageText } from "./alerts-model";
import { SeverityDot } from "./alerts-fields";

export const HISTORY_URL = "/api/alerts/history";
const HISTORY_SHOWN = 50;

/**
 * The server's alert history (newest first), fetched on mount and again whenever the active list
 * changes (an alert starting, being acknowledged or clearing is what changes history).
 */
export function useAlertHistory(active: readonly ActiveAlert[]): AlertHistoryEntry[] {
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const signature = active.map((a) => `${a.id}${a.acknowledged ? "!" : ""}`).join(",");
  useEffect(() => {
    let live = true;
    fetch(HISTORY_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list: unknown) => live && Array.isArray(list) && setHistory(list as AlertHistoryEntry[]))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signature]);
  return history;
}

const BUTTON =
  "flex h-6 items-center gap-1 rounded-md border border-ui-strong px-1.5 text-[11px] text-ui-2 hover:bg-ui-hover hover:text-ui-1";

/** "Active now": the alerts the server holds, each with Acknowledge and Dismiss. */
export function ActiveList({ active, now }: { active: readonly ActiveAlert[]; now: number }) {
  if (active.length === 0) return <p className="text-[11.5px] text-ui-4">Nothing active.</p>;
  return (
    <ul className="space-y-1.5">
      {active.map((a) => (
        <li key={a.id} className="rounded-lg border border-ui-default bg-ui-app p-2">
          <div className="flex items-center gap-1.5">
            <SeverityDot severity={a.severity} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ui-1">{a.name}</span>
            {a.test && <Tag>test</Tag>}
            {a.quiet && <Tag>quiet</Tag>}
            <span className="shrink-0 font-ui-mono text-micro text-ui-4">{ageText(a.startedAt, now)}</span>
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-ui-3" title={a.text}>
            {a.text}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={a.acknowledged}
              onClick={() => void postControl("alert", { id: a.id, action: "ack" })}
              className={`${BUTTON} disabled:opacity-40`}
            >
              <Check className="h-3 w-3" /> {a.acknowledged ? "Acknowledged" : "Acknowledge"}
            </button>
            <button type="button" onClick={() => void postControl("alert", { id: a.id, action: "dismiss" })} className={BUTTON}>
              <X className="h-3 w-3" /> Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Tag({ children }: { children: string }) {
  return <span className="shrink-0 rounded bg-ui-active px-1 text-[10px] uppercase tracking-wide text-ui-3">{children}</span>;
}

/** The last 50 history entries, with test / quiet / dismissed tags. */
export function HistoryList({ history, now }: { history: readonly AlertHistoryEntry[]; now: number }) {
  if (history.length === 0) return <p className="text-[11.5px] text-ui-4">No alerts yet.</p>;
  return (
    <ul className="space-y-1.5">
      {history.slice(0, HISTORY_SHOWN).map((h) => (
        <li key={h.id} className="flex items-center gap-1.5 text-[11.5px]">
          <SeverityDot severity={h.severity} />
          <span className="min-w-0 flex-1 truncate text-ui-2" title={h.text}>
            {h.name}
          </span>
          {h.test && <Tag>test</Tag>}
          {h.quiet && <Tag>quiet</Tag>}
          {h.dismissed && <Tag>dismissed</Tag>}
          <span className="shrink-0 font-ui-mono text-micro text-ui-4">{ageText(h.startedAt, now)}</span>
        </li>
      ))}
    </ul>
  );
}
