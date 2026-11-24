// Notifications' `feed` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's channel inbox. Underline tabs (All and each
// type in the history, at most three more) that filter the feed, with their counter, then one row per notification: the time in mono,
// a hollow square, the type in tracked capitals in its colour (errors critical, warnings in the warning colour, the rest the accent)
// and the message under it. The status line closes the card in mono. The lines are the standard layout's, from the same entries.
import { useState } from "react";
import { entryText } from "../entries";
import { Widget, shell, num, Empty, Chip, STATE, fitRows } from "../kit";
import { FeedRow, KitTabs } from "../shared/layout-kit";
import { P } from "./meta";
import type { NotificationsProps } from "./Notifications";

/** A notification line of the history (`time, type, message`). */
export interface FeedLine {
  time: string;
  type: string;
  message: string;
}

/** The tabs a history offers: All, then its types in the order they first appear, at most three. */
export const feedTabs = (lines: readonly FeedLine[]): { id: string; label: string }[] => [
  { id: "", label: "All" },
  ...[...new Set(lines.map((l) => l.type).filter(Boolean))].slice(0, 3).map((t) => ({ id: t, label: t })),
];

const colorOf = (type: string) => (type === "Error" ? `var(--w-crit, ${STATE.crit})` : type === "Warning" ? `var(--w-warn, ${STATE.warn})` : "var(--w-accent)");

export function NotificationsFeed(p: NotificationsProps) {
  const k = (id: string) => entryText(p.data, P, id);
  const count = num(k("notification-count"));
  const status = k("status");
  const max = Math.max(1, Math.round(Number(p.maxLines) || 50));
  const lines: FeedLine[] = (k("notification-history") ?? "")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(0, max)
    .map((l) => {
      const [time, type, ...rest] = l.split(", ");
      return { time, type: type ?? "", message: rest.join(", ") };
    });
  const tabs = feedTabs(lines);
  const [picked, setTab] = useState("");
  const tab = tabs.some((t) => t.id === picked) ? picked : "";
  const shown = tab ? lines.filter((l) => l.type === tab) : lines;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Notifications"}
      icon="notifications"
      right={Number.isFinite(count) ? <Chip>{Math.round(count)}</Chip> : undefined}
    >
      {({ h }) => {
        if (!lines.length) return <Empty icon="notifications" label={k("last-notification") ?? "No notifications"} />;
        const foot = !!status && h >= 140;
        const n = Math.min(shown.length, fitRows(h - 30 - (foot ? 22 : 0), 44, 0));
        return (
          <div data-layout="feed" className="flex h-full min-h-0 min-w-0 flex-col gap-2">
            <KitTabs tabs={tabs} active={tab} onPick={setTab} />
            <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {shown.slice(0, n).map((l, i) => (
                <FeedRow key={i} rowKey={`${l.time} ${l.message}`} time={l.time} name={l.type || "Note"} text={l.message} color={colorOf(l.type)} />
              ))}
            </ul>
            {foot && (
              <div data-part="mono" className="truncate border-t border-[color:color-mix(in_srgb,var(--w-accent)_35%,transparent)] pt-1.5 text-micro uppercase tracking-[0.06em] text-[color:var(--w-muted)]">
                {status}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
