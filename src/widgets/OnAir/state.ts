// The On-Air Beacon's state from the OBS flags the server sends (`ObsState` in src/lib/extras.ts). Pure.
import type { ObsState } from "@/lib/extras";

export type OnAirKind = "live" | "rec" | "both" | "off" | "unset";

/** Not configured is `unset`; a configured OBS that is not connected, or neither streaming nor recording, is `off`. */
export function onAirKind(obs: ObsState): OnAirKind {
  if (!obs.configured) return "unset";
  if (!obs.connected) return "off";
  if (obs.streaming && obs.recording) return "both";
  if (obs.streaming) return "live";
  if (obs.recording) return "rec";
  return "off";
}

export const ON_AIR_LABEL: Record<OnAirKind, string> = { live: "LIVE", rec: "REC", both: "LIVE + REC", off: "Off air", unset: "Off air" };

/** Elapsed ms as "H:MM:SS" with seconds, else "1 h 05 min" or "5 min" (the minute is the smallest step). */
export function elapsedText(ms: number, seconds: boolean): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (seconds) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
