import { DISPLAY_FOLLOW, postControl, type ControlDisplay } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function seenAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

interface DisplaysListProps {
  displays: readonly ControlDisplay[];
  profiles: readonly Pick<MonitorProfile, "id" | "name">[];
}

/**
 * The named displays (kiosk links with `?display=<name>`): online or not, when last seen, and the screen each one shows.
 * "Follow" leaves the choice to "When the app opens". A display appears the first time its link is opened.
 */
export function DisplaysList({ displays, profiles }: DisplaysListProps) {
  if (displays.length === 0) return null;
  const now = Date.now();
  return (
    <section aria-label="Displays" className="flex flex-col gap-2 rounded-[10px] border border-ui-default bg-ui-panel p-3.5">
      <span className="text-body font-medium text-ui-1">Displays</span>
      <ul className="flex flex-col divide-y divide-ui-default">
        {displays.map((d) => (
          <li key={d.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 text-[12.5px] first:pt-0 last:pb-0">
            <span className="flex min-w-[120px] items-center gap-1.5 font-medium text-ui-1">
              <span
                role="img"
                aria-label={d.online ? "Online" : "Offline"}
                className={cn("h-2 w-2 rounded-full", d.online ? "bg-ui-accent" : "border border-ui-strong")}
              />
              {d.name}
            </span>
            <span className="min-w-[110px] text-ui-3">
              {d.online ? "Online" : `Offline · seen ${seenAgo(d.lastSeen, now)}`}
            </span>
            <span className="min-w-[90px] font-ui-mono text-[11.5px] text-ui-3">{d.online ? (d.address ?? "") : ""}</span>
            <select
              aria-label={`Screen for ${d.name}`}
              value={d.screen}
              onChange={(e) => void postControl("display", { action: "assign", display: d.name, screen: e.target.value })}
              className="ml-auto h-7 max-w-[200px] cursor-pointer rounded-md border border-ui-strong bg-ui-hover px-1.5 text-caption text-ui-1 outline-none focus:border-ui-accent"
            >
              <option value={DISPLAY_FOLLOW}>Follow “When the app opens”</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void postControl("display", { action: "forget", display: d.name })}
              className="h-7 rounded-[7px] border border-ui-strong px-2.5 text-caption text-ui-1 hover:bg-ui-hover"
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
