/**
 * Runs a touch action (decision 10, `TouchAction` in pinned.ts) on the kiosk: a page, the page lock, a guarded route (audio,
 * OBS, the media keys of P6), which refuse a write from another machine as they do for the widgets, the profile picker (P4,
 * where the screen has one), or a command through P7's action runner, which is off by default and runs approved commands
 * only (ips-server's actions.rs). A command marked `confirm`, and OBS's go live, ask for a hold first (`needsConfirm`): a
 * hold gesture is that hold, any other gesture opens the screen's hold-to-confirm card.
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
  /** Ask the action runner to run a command; unset where nothing may run one (false). */
  run?: (command: string) => unknown;
  /** Show the hold-to-confirm card for `action`; `go` runs it once held. Unset: an action that needs one does nothing. */
  confirm?: (action: TouchAction, go: () => void) => void;
}

/** Whether `action` asks for a hold before it runs: a command marked so, and OBS's go live or stop (owner Q3). */
export const needsConfirm = (action: TouchAction): boolean =>
  (action.op === "run" && action.confirm === true) || (action.op === "obs" && action.body.op === "stream");

/**
 * Runs `action`; false when it does nothing (a command with no runner, the profile picker without one, an action that needs
 * a hold with no card to ask for it). `held`: the gesture was a hold, which confirms it.
 */
export function runTouchAction(action: TouchAction, deps: TouchActionDeps, held = false): boolean {
  if (!held && needsConfirm(action)) {
    if (!deps.confirm) return false;
    deps.confirm(action, () => runTouchAction(action, deps, true));
    return true;
  }
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
    case "run":
      void deps.run?.(action.command);
      return deps.run !== undefined;
    default:
      return false;
  }
}
