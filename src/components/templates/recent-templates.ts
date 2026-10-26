/**
 * The New wizards' Recently used section: the last three templates this browser created from, per kind (screen or
 * InfoPanel profile), newest first. Blank and Library items are never listed. Storage that can't be read, or holds
 * anything but a list of ids, is an empty list; storage that can't be written is left as it was.
 */
import { parseRecent, withRecent } from "../studio/add-recent";

export type WizardKind = "screen" | "ip";

export const recentKey = (kind: WizardKind): string => `studio.newWizard.recent.${kind}`;

/** The stored ids, newest first. */
export function readRecent(kind: WizardKind): string[] {
  try {
    return parseRecent(localStorage.getItem(recentKey(kind)));
  } catch {
    return [];
  }
}

/** `id` made the newest; the list it leaves. */
export function pushRecent(kind: WizardKind, id: string): string[] {
  const next = withRecent(readRecent(kind), id);
  try {
    localStorage.setItem(recentKey(kind), JSON.stringify(next));
  } catch {
    // Storage unavailable: nothing is remembered.
  }
  return next;
}
