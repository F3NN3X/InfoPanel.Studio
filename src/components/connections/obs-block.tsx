import { useState } from "react";
import { FIELD, StackRow } from "@/components/studio/setting-rows";
import type { IntegrationsPatch, PublicIntegrations, SceneLooks } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { useExtras } from "@/widgets/time-hooks";
import { ObsStreamingFields } from "./obs-streaming-fields";

export const BUTTON = "flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-50";

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
