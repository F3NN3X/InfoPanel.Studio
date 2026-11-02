import { Info, TriangleAlert, Unplug, type LucideIcon } from "lucide-react";
import type { DataContainer, Health } from "@/lib/data-points";
import { sourcePrefKey, type SourcePref } from "@/lib/layout";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { CopyField } from "./explorer-parts";
import { useCopy } from "./use-copy";

interface GroupSummaryProps {
  title: string;
  sub: string;
  /** Rows of the stats list (data points, numeric, live, empty, in use). */
  stats: { label: string; value: number }[];
  /** Shown only for a source or container that is empty, zero or offline. */
  note: { health: Health; text: string } | null;
  containers: DataContainer[];
  /** The group's stream route and the URL that is copied; null for "All". */
  stream: { path: string; url: string } | null;
  /** The plugin whose containers carry show / rename preferences; null for other sources. */
  prefPlugin: string | null;
  sourcePrefs: Record<string, SourcePref> | undefined;
  onPrefsChange: (key: string, pref: Partial<SourcePref>) => void;
}

const NOTE_ICON: Record<Health, { icon: LucideIcon; tone: string; bg: string }> = {
  ok: { icon: Info, tone: "text-ui-accent-text", bg: "bg-ui-raised" },
  warn: { icon: TriangleAlert, tone: "text-ui-warning", bg: "bg-ui-warning/10" },
  off: { icon: Unplug, tone: "text-ui-3", bg: "bg-ui-raised" },
};

/** The right column with no point selected: counts, a status callout, the group's stream route and source preferences. */
export function GroupSummary({
  title,
  sub,
  stats,
  note,
  containers,
  stream,
  prefPlugin,
  sourcePrefs,
  onPrefsChange,
}: GroupSummaryProps) {
  const copy = useCopy();
  const noteLook = note ? NOTE_ICON[note.health] : null;
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui text-ui-2">
      <div className="flex flex-col gap-[3px]">
        <span className="text-[14px] font-semibold text-ui-1">{title}</span>
        <span className="text-[11.5px] text-ui-4">{sub}</span>
      </div>

      {note && noteLook && (
        <div className={cn("flex items-start gap-[9px] rounded-lg px-3 py-2.5", noteLook.bg)}>
          <noteLook.icon className={cn("h-[17px] w-[17px] shrink-0", noteLook.tone)} aria-hidden />
          <span className="flex-1 text-caption leading-[1.45] text-[#d4d4da]">{note.text}</span>
        </div>
      )}

      <div className="flex flex-col">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex justify-between gap-3 whitespace-nowrap border-b border-s-divider py-2 text-[12.5px]"
          >
            <span className="text-ui-2">{s.label}</span>
            <span className="font-ui-mono text-caption text-ui-1">{s.value}</span>
          </div>
        ))}
      </div>

      {stream && <CopyField label="Stream this group" value={stream.url} display={stream.path} get onCopy={copy} />}

      {prefPlugin && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold text-ui-1">Show in dashboard</span>
          {containers.map((c) => {
            const key = sourcePrefKey(prefPlugin, c.id.slice(prefPlugin.length + 1));
            const pref = sourcePrefs?.[key];
            return (
              <div key={c.id} className="rounded-md border border-ui-default bg-ui-tile p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-caption text-ui-1">{c.title}</span>
                  <Toggle
                    label={`Show ${c.title} in dashboard`}
                    checked={pref?.enabled !== false}
                    onChange={(enabled) => onPrefsChange(key, { enabled })}
                  />
                </div>
                <input
                  value={pref?.displayName ?? ""}
                  onChange={(e) => onPrefsChange(key, { displayName: e.target.value || undefined })}
                  placeholder={c.title}
                  aria-label={`Display name for ${c.title}`}
                  className="h-7 w-full rounded border border-ui-default bg-ui-app px-2 text-caption text-ui-1 placeholder:text-ui-4 focus:border-ui-accent/60 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      )}

      <span className="text-caption leading-[1.5] text-ui-4">
        Select a data point to see its live value, history and which widgets use it.
      </span>
    </div>
  );
}
