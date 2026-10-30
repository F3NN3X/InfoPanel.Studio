import { useEffect, useState, useSyncExternalStore } from "react";
import { Plus, Trash2 } from "lucide-react";
import { extras } from "@/lib/extras";
import { fetchIntegrations, saveIntegrations, type IntegrationsPatch, type PublicIntegrations, type SceneLooks } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { FIELD, StackRow } from "../setting-rows";
import { ObsStreamingFields } from "./obs-streaming-fields";

const BUTTON = "flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-50";

/** What the server knows now (connected, events, a fetch error), for the status lines. */
const useExtras = () => useSyncExternalStore(extras.subscribe, extras.getState, extras.getState);

/**
 * The server-side settings the island's On air and Calendar notices need. They are not part of the
 * dashboard config: the server keeps them in their own file, the password and the links are sent
 * once and never shown again, and each block saves with its own button (no auto-save).
 */
export function IntegrationsCard({ obs, calendar }: { obs: boolean; calendar: boolean }) {
  const [stored, setStored] = useState<PublicIntegrations | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetchIntegrations()
      .then((s) => alive && setStored(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  const save = async (patch: IntegrationsPatch) => {
    try {
      setStored(await saveIntegrations(patch));
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  if (!stored) return error ? <p className="text-[11px] text-ui-danger">{error}</p> : null;
  return (
    <div className="space-y-3 rounded-[8px] border border-ui-default p-2.5">
      {obs && <ObsBlock stored={stored.obs} streaming={stored.streaming?.obs} onSave={save} />}
      {calendar && <CalendarBlock stored={stored.calendar.links} onSave={(links) => save({ calendar: { links } })} />}
      {error && <p className="text-[11px] text-ui-danger">{error}</p>}
    </div>
  );
}

function ObsBlock({ stored, streaming, onSave }: { stored: PublicIntegrations["obs"]; streaming: NonNullable<PublicIntegrations["streaming"]>["obs"] | undefined; onSave: (patch: IntegrationsPatch) => Promise<boolean> }) {
  const [host, setHost] = useState(stored.host || "127.0.0.1");
  const [port, setPort] = useState(String(stored.port));
  const [password, setPassword] = useState("");
  const [mic, setMic] = useState(streaming?.mic ?? "");
  const [looks, setLooks] = useState<SceneLooks>(streaming?.scenes ?? {});
  const live = useExtras().obs;
  const status = !live.configured ? "Not set up" : live.connected ? (live.streaming ? "Connected · live" : live.recording ? "Connected · recording" : "Connected") : "Waiting for OBS";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[12px] font-semibold text-ui-1">
        OBS WebSocket
        <span className="text-[11px] font-normal text-ui-4">{status}</span>
      </div>
      <div className="flex gap-2">
        <StackRow label="Host">
          <input aria-label="OBS host" value={host} onChange={(e) => setHost(e.target.value)} className={cn(FIELD, "h-[30px] w-full")} />
        </StackRow>
        <div className="w-[76px] shrink-0">
          <StackRow label="Port">
            <input aria-label="OBS port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={cn(FIELD, "h-[30px] w-full")} />
          </StackRow>
        </div>
      </div>
      <StackRow label="Password" hint="OBS › Tools › WebSocket Server Settings. Saved on the dashboard server only; leave blank to keep the saved one.">
        <input
          aria-label="OBS password"
          type="password"
          autoComplete="off"
          value={password}
          placeholder={stored.hasPassword ? "Saved" : "None"}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(FIELD, "h-[30px] w-full")}
        />
      </StackRow>
      <ObsStreamingFields mic={mic} inputs={live.inputs} scenes={live.scenes} looks={looks} onMic={setMic} onLook={(id, look) => setLooks((prev) => ({ ...prev, [id]: look }))} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={async () => {
            // The scenes OBS lists now keep their looks; a scene it no longer lists is dropped.
            const kept = Object.fromEntries(live.scenes.flatMap((s) => (looks[s.id] ? [[s.id, looks[s.id]]] : [])));
            const scenes = live.scenes.length ? kept : looks;
            const patch: IntegrationsPatch = { obs: { host: host.trim(), port: Number(port) || 4455, ...(password ? { password } : {}) }, streaming: { obs: { mic, scenes } } };
            if (await onSave(patch)) setPassword("");
          }}
        >
          Save OBS
        </button>
        {stored.host && (
          <button type="button" className={BUTTON} onClick={() => void onSave({ obs: { host: "", password: "" } })}>
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function CalendarBlock({ stored, onSave }: { stored: PublicIntegrations["calendar"]["links"]; onSave: (links: NonNullable<IntegrationsPatch["calendar"]>["links"]) => Promise<boolean> }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const live = useExtras().calendar;
  const next = live.events.find((e) => !e.allDay && e.end > Date.now());
  const keep = stored.map((l) => ({ id: l.id }));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[12px] font-semibold text-ui-1">
        Calendar links
        <span className="truncate pl-2 text-[11px] font-normal text-ui-4">{stored.length === 0 ? "None" : next ? `Next: ${next.title}` : "No events in 36 h"}</span>
      </div>
      {stored.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-[12px] text-ui-2">
          <span className="min-w-0 flex-1 truncate">{l.label || l.host}</span>
          <span className="truncate text-[11px] text-ui-5">{l.label ? l.host : ""}</span>
          <button type="button" aria-label={`Remove ${l.label || l.host}`} className="text-ui-4 hover:text-ui-danger" onClick={() => void onSave(keep.filter((k) => k.id !== l.id))}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {live.error && <p className="text-[11px] text-ui-danger">{live.error}</p>}
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
