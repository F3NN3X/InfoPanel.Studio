/**
 * Runs a touch action (decision 10, `TouchAction` in pinned.ts) on the kiosk: a page, the page lock, or an existing guarded
 * route (audio, OBS), which refuse a write from another machine as they do for the widgets, or the profile picker (P4,
 * where the screen has one). Media keys have no route yet (QUESTIONS P1 8); `run` waits for P7's runner, which is off by
 * default. Those do nothing here and say so (`false`).
 */
import type { AudioAction } from "./audio-control";
import type { ObsAction } from "./obs-control";
import type { TouchAction } from "./pinned";

export interface TouchActionDeps {
  /** Show a page: an id, or the next or previous one. */
  page: (to: string) => void;
  /** Toggle the profile's page rotation (the page lock). */
  toggleRotate: () => void;
  audio: (body: AudioAction) => unknown;
  obs: (body: ObsAction) => unknown;
  /** Open the profile picker; unset where the screen has none (false). */
  picker?: () => void;
}

/** Runs `action`; false when it does nothing (media keys, a command, the profile picker without one). */
export function runTouchAction(action: TouchAction, deps: TouchActionDeps): boolean {
  switch (action.op) {
    case "page":
      deps.page(action.to);
      return true;
    case "lock":
      deps.toggleRotate();
      return true;
    case "audio":
      void deps.audio(action.body as unknown as AudioAction);
      return true;
    case "obs":
      void deps.obs(action.body as unknown as ObsAction);
      return true;
    case "profile-picker":
      deps.picker?.();
      return deps.picker !== undefined;
    default:
      return false;
  }
}
