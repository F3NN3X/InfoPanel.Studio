import { useEffect, useState } from "react";
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import type { ActiveAlert, AlertHistoryEntry, Severity } from "@/lib/alerts";
import { postControl } from "@/lib/control";
import { cn } from "@/lib/utils";
import { spanText } from "./alerts-history-model";

export const HISTORY_URL = "/api/alerts/history";

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

const LOOK: Record<Severity, { icon: LucideIcon; tone: string; card: string }> = {
  info: { icon: Info, tone: "text-ui-accent-text", card: "border-ui-default" },
  warning: { icon: TriangleAlert, tone: "text-ui-warn", card: "border-ui-warn/40 bg-ui-warn/6" },
  critical: { icon: OctagonAlert, tone: "text-ui-danger", card: "border-ui-danger/40 bg-ui-danger/6" },
};

/** "Active now": the alerts the server holds, each with its value, how long, on how many screens, Acknowledge and Dismiss. */
export function ActiveNow({ active, now, screens }: { active: readonly ActiveAlert[]; now: number; screens: number }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Active now">
      <h2 className="text-caption font-medium text-ui-3">Active now · {active.length}</h2>
      {active.length === 0 && <p className="text-caption text-ui-3">Nothing active</p>}
      {active.map((a) => {
        const { icon: Icon, tone, card } = LOOK[a.severity];
        const count = a.profiles?.length || screens;
        return (
          <article key={a.id} className={cn("flex gap-2.5 rounded-12 border p-3.5", card)}>
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-label={a.severity} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-body font-medium text-ui-1">{a.name}</span>
                {a.test && <StatusChip tone="neutral" dot={false} className="h-5 px-2 text-micro">Test</StatusChip>}
                {a.quiet && <StatusChip tone="neutral" dot={false} className="h-5 px-2 text-micro">Quiet</StatusChip>}
              </div>
              <p className="truncate text-caption text-ui-3" title={a.text}>
                {a.text && <span className="font-ui-mono text-ui-2">{a.text} · </span>}
                for {spanText(now - a.startedAt)} · {count} {count === 1 ? "screen" : "screens"}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <Button small disabled={a.acknowledged} onClick={() => void postControl("alert", { id: a.id, action: "ack" })}>
                  {a.acknowledged ? "Acknowledged" : "Acknowledge"}
                </Button>
                <Button small variant="ghost" onClick={() => void postControl("alert", { id: a.id, action: "dismiss" })}>
                  Dismiss
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
