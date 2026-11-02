import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FIELD, StackRow } from "@/components/studio/setting-rows";
import type { IntegrationsPatch, PublicIntegrations } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { useExtras } from "@/widgets/time-hooks";
import { BUTTON } from "./obs-block";

export interface CalendarBlockProps {
  stored: PublicIntegrations["calendar"]["links"];
  onSave: (links: NonNullable<IntegrationsPatch["calendar"]>["links"]) => Promise<boolean>;
}

/** The calendar (ICS) links the island and the day widgets read; the links are sent once and never shown again. */
export function CalendarBlock({ stored, onSave }: CalendarBlockProps) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const live = useExtras().calendar;
  const next = live.events.find((e) => !e.allDay && e.end > Date.now());
  const keep = stored.map((l) => ({ id: l.id }));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-caption font-semibold text-ui-1">
        Calendar links
        <span className="truncate pl-2 text-micro font-normal text-ui-4">{stored.length === 0 ? "None" : next ? `Next: ${next.title}` : "No events in 36 h"}</span>
      </div>
      {stored.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-caption text-ui-2">
          <span className="min-w-0 flex-1 truncate">{l.label || l.host}</span>
          <span className="truncate text-micro text-ui-hint">{l.label ? l.host : ""}</span>
          <button type="button" aria-label={`Remove ${l.label || l.host}`} className="text-ui-4 hover:text-ui-danger" onClick={() => void onSave(keep.filter((k) => k.id !== l.id))}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {live.error && (
        <p role="alert" className="text-micro text-ui-danger">
          {live.error}
        </p>
      )}
      <StackRow label="Add an ICS link" hint="Google: Settings › your calendar › Secret address in iCal format. Outlook: Publish calendar › ICS. Saved on the dashboard server only.">
        <input aria-label="Calendar link" type="url" autoComplete="off" value={url} placeholder="https://…/basic.ics" onChange={(e) => setUrl(e.target.value)} className={cn(FIELD, "h-[30px] w-full")} />
      </StackRow>
      <div className="flex gap-2">
        <input aria-label="Calendar name" value={label} placeholder="Name (optional)" onChange={(e) => setLabel(e.target.value)} className={cn(FIELD, "h-[30px] min-w-0 flex-1")} />
        <button
          type="button"
          className={BUTTON}
          disabled={url.trim() === ""}
          onClick={async () => {
            if (await onSave([...keep, { url: url.trim(), label: label.trim() }])) {
              setUrl("");
              setLabel("");
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </button>
      </div>
    </div>
  );
}
