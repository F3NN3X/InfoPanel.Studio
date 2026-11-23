import { useState } from "react";
import { FIELD, StackRow } from "@/components/studio/setting-rows";
import type { IntegrationsPatch, PublicIntegrations, SceneLooks } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { useExtras } from "@/widgets/time-hooks";
import { ConnectionStatus, type StatusTone } from "./connection-status";
import { ObsStreamingFields } from "./obs-streaming-fields";

export const BUTTON = "flex h-(--ui-h-control) items-center gap-1.5 rounded-ui-sm border border-ui-default px-2.5 text-caption text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-50";

/** The Save button while the form holds a change: the page's one primary action. */
const BUTTON_ACCENT = "flex h-(--ui-h-control) items-center gap-1.5 rounded-ui-sm border border-transparent bg-s-accent px-2.5 text-caption font-semibold text-s-win hover:brightness-110 disabled:opacity-50";

export interface ObsBlockProps {
  stored: PublicIntegrations["obs"];
  streaming: NonNullable<PublicIntegrations["streaming"]>["obs"] | undefined;
  onSave: (patch: IntegrationsPatch) => Promise<boolean>;
}

/**
 * The OBS WebSocket connection and the Streaming widgets' OBS settings. The password is sent once and never shown
 * again; the block saves with its own button (no auto-save).
 */
export function ObsBlock({ stored, streaming, onSave }: ObsBlockProps) {
  const [host, setHost] = useState(stored.host || "127.0.0.1");
  const [port, setPort] = useState(String(stored.port));
  const [password, setPassword] = useState("");
  const [mic, setMic] = useState(streaming?.mic ?? "");
  const [looks, setLooks] = useState<SceneLooks>(streaming?.scenes ?? {});
  const live = useExtras().obs;
  const status = !live.configured ? "Not set up" : live.connected ? (live.streaming ? "Connected · live" : live.recording ? "Connected · recording" : "Connected") : "Waiting for OBS";
  const tone: StatusTone = !live.configured ? "idle" : live.connected ? "ok" : "warn";
  // Nothing saved yet counts as a change, so the first Save connects with the defaults.
  const dirty = !stored.host || host !== stored.host || port !== String(stored.port) || password !== "" || mic !== (streaming?.mic ?? "") || JSON.stringify(looks) !== JSON.stringify(streaming?.scenes ?? {});
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-caption font-semibold text-ui-1">
        OBS WebSocket
        <ConnectionStatus tone={tone}>{status}</ConnectionStatus>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <label className="flex flex-col gap-1.5 text-small text-ui-2">
          Host
          <input aria-label="OBS host" value={host} onChange={(e) => setHost(e.target.value)} className={cn(FIELD, "h-7.5 w-full")} />
        </label>
        <label className="flex flex-col gap-1.5 text-small text-ui-2">
          Port
          <input aria-label="OBS port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={cn(FIELD, "h-7.5 w-full")} />
        </label>
      </div>
      <StackRow label="Password" hint="OBS › Tools › WebSocket Server Settings. Saved on the dashboard server only; leave blank to keep the saved one.">
        <input
          aria-label="OBS password"
          type="password"
          autoComplete="off"
          value={password}
          placeholder={stored.hasPassword ? "Saved" : "Not set"}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(FIELD, "h-7.5 w-full")}
        />
      </StackRow>
      <ObsStreamingFields mic={mic} inputs={live.inputs} scenes={live.scenes} looks={looks} onMic={setMic} onLook={(id, look) => setLooks((prev) => ({ ...prev, [id]: look }))} />
      <div className="flex gap-2">
        <button
          type="button"
          className={dirty ? BUTTON_ACCENT : BUTTON}
          disabled={!dirty}
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
