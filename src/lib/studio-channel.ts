/**
 * Messages between the Settings window and the Studio window. Both load from the dashboard server's origin (the
 * desktop app points its Settings window there too, and a browser opens Settings as a tab of it), so a
 * `BroadcastChannel` reaches every Studio page on it, in the desktop app and in a browser alike.
 *
 * - `settings`: a Settings change the server took (and its revision); the Studio applies the same patch to its
 *   working copy and sends the revision with its pushes, so a push already on the wire can't undo it.
 * - `replaced`: the saved config was replaced (Reset everything…); the Studio reloads it.
 * - `open`: show a Studio view, e.g. Screens at a screen (from a Settings link).
 */

import type { SettingsPatch } from "@/lib/settings-patch";

export type StudioMessage =
  | { type: "settings"; patch: SettingsPatch; rev: number }
  | { type: "replaced" }
  | { type: "open"; target: { view: "screens"; profileId?: string; section?: string } };

const CHANNEL = "infopanel-studio";

const channel = (): BroadcastChannel | null => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL));

/** Tell the other windows on this origin (a window never receives its own message). */
export function postStudioMessage(message: StudioMessage): void {
  const c = channel();
  if (!c) return;
  c.postMessage(message);
  c.close();
}

/** Calls `handler` with each message another window posts; returns the unsubscribe. */
export function onStudioMessage(handler: (message: StudioMessage) => void): () => void {
  const c = channel();
  if (!c) return () => {};
  c.onmessage = (e: MessageEvent<StudioMessage>) => {
    if (e.data && typeof e.data === "object" && typeof e.data.type === "string") handler(e.data);
  };
  return () => c.close();
}
