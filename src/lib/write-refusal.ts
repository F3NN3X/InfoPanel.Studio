/**
 * Whether the server turned a control write away (403: another machine with remote editing off). The control widgets
 * (the audio ones and the OBS ones) read it to show themselves read-only instead of looking enabled; one flag per client.
 */

import { useSyncExternalStore } from "react";

/** The tooltip (and the hint, where there is room) of a control that cannot write from this screen. */
export const READ_ONLY_HINT = "Read-only on this screen";

export interface Refusal {
  get: () => boolean;
  set: (refused: boolean) => void;
  subscribe: (fn: () => void) => () => void;
  /** The flag, live. */
  use: () => boolean;
}

export function createRefusal(): Refusal {
  let refused = false;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  };
  const get = () => refused;
  return {
    get,
    subscribe,
    set(next) {
      if (next === refused) return;
      refused = next;
      for (const l of listeners) l();
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}
