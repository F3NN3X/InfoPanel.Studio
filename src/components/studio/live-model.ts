/**
 * The Live popover's actions and what it reads (SPEC §3.3), all on the control API (`lib/control.ts`): runtime state
 * the server holds. None of it touches the config, so none of it marks the document dirty or enters the undo history.
 */
import { postControl, type ControlProfile, type ControlState } from "@/lib/control";
import { cycleLabel } from "./page-tabs";

/** Dim levels the server takes: 0.1 to 0.9, and 0 is off. */
export const DIM_MAX = 0.9;
export const DIM_STEP = 0.1;
export const MUTE_MINUTES = 60;

/**
 * The state to send when a runtime toggle flips to `next`: the saved setting's own value clears the override
 * (so "following" shows again), anything else is an override.
 */
export function toggleRequest(next: boolean, saved: boolean): "on" | "off" | "saved" {
  return next === saved ? "saved" : next ? "on" : "off";
}

/** The note under the Rotation toggle: following the saved setting, or the runtime override and what the setting is. */
export function rotationNote(p: { rotating: boolean; override: ControlProfile["override"]; savedEnabled: boolean; seconds: number }): string {
  const saved = p.savedEnabled ? `every ${cycleLabel(p.seconds)}` : "off";
  if (p.override === null) return `Following the saved setting: ${saved}.`;
  return `${p.rotating ? "Running" : "Paused"} for now. Saved setting: ${saved} — resumes on reload.`;
}

/** Alerts are muted now (the server's deadline is still ahead). */
export const isMuted = (control: ControlState | null, now: number): boolean => control?.mutedUntil != null && control.mutedUntil > now;

/** The live actions of one screen's kiosks (and the global ones). Each resolves to the new state, or null when the server is unreachable. */
export const liveActions = {
  /** Show a page on every kiosk of the screen. */
  showPage: (profile: string, page: string) => postControl("page", { profile, page }),
  /** Flip the screen's page rotation for now; `saved` is its saved `rotate.enabled`. */
  setRotation: (profile: string, next: boolean, saved: boolean) => postControl("rotate", { profile, state: toggleRequest(next, saved) }),
  /** The screen's dim: 0 puts it away, else the black overlay's opacity. */
  setDim: (profile: string, level: number) =>
    postControl("kiosk", level > 0 ? { action: "dim", profile, state: "on", level } : { action: "dim", profile, state: "off" }),
  /** Mute every alert for an hour, or unmute. */
  mute: (on: boolean) => postControl("alert", { action: "mute", minutes: on ? MUTE_MINUTES : 0 }),
  /** Show or hide the screen's Dynamic Island for now; `saved` is its saved `island.enabled`. */
  setIsland: (profile: string, next: boolean, saved: boolean) => postControl("kiosk", { action: "island", profile, state: toggleRequest(next, saved) }),
  /** Reload every kiosk. */
  reload: () => postControl("kiosk", { action: "reload" }),
};
