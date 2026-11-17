/**
 * Runs a touch action (decision 10, `TouchAction` in pinned.ts) on the kiosk: a page, the page lock, or a guarded route
 * (audio, OBS, the media keys of P6), which refuse a write from another machine as they do for the widgets, or the profile
 * picker (P4, where the screen has one). `run` waits for P7's runner, which is off by default: it does nothing here and
 * says so (`false`).
 */
import type { AudioAction } from "./audio-control";
import type { ObsAction } from "./obs-control";
import type { MediaKey, TouchAction } from "./pinned";

export interface TouchActionDeps {
  /** Show a page: an id, or the next or previous one. */
  page: (to: string) => void;
  /** Toggle the profile's page rotation (the page lock). */
  toggleRotate: () => void;
  audio: (body: AudioAction) => unknown;
  obs: (body: ObsAction) => unknown;
  /** Press a media key on the PC. */
  media: (key: MediaKey) => unknown;
  /** Open the profile picker; unset where the screen has none (false). */
  picker?: () => void;
}

/** Runs `action`; false when it does nothing (a command, the profile picker without one). */
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
    case "media":
      void deps.media(action.key);
      return true;
    case "profile-picker":
      deps.picker?.();
      return deps.picker !== undefined;
    default:
      return false;
  }
}
