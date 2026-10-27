import { useEffect, useRef, useState } from "react";
import { uid, type MonitorProfile, type ProfilePage } from "@/lib/layout";
import type { PageOp } from "@/lib/page-model/model";
import { partKeyOps } from "@/lib/page-model/keys";
import { readPlacements } from "@/lib/page-model/placements-adapter";
import { hasOverlay, isTyping } from "./use-studio-shortcuts";

interface ItemSelectionDeps {
  profile: MonitorProfile;
  /** The page on the canvas, as stored. */
  page: ProfilePage;
  /** The zone selection's primary zone: selecting a zone clears the items. */
  zoneId: string | null;
  /** Clear the zone selection (selecting an item clears the zones). */
  clearZones: () => void;
  applyPageOps: (ops: readonly PageOp[], key?: string) => void;
  /** A drag is in flight: the keys stand down. */
  dragging: () => boolean;
}

/**
 * The InfoPanel items and elements selected on a screen page's canvas (Edit v3 SPEC §7.5), apart from the zone
 * selection: selecting one kind clears the other. While items are selected the keyboard (SPEC §14) acts on them,
 * ahead of the studio's zone shortcuts. A selected item an undo removes drops out.
 */
export function useItemSelection({ profile, page, zoneId, clearZones, applyPageOps, dragging }: ItemSelectionDeps) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds([]), [profile.id, page.id]);
  useEffect(() => {
    if (zoneId) setIds([]);
  }, [zoneId]);
  const live = ids.filter((id) => page.placements.some((p) => p.id === id));

  const select = (id: string, toggle: boolean) => {
    clearZones();
    setIds((now) => (toggle ? (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]) : [id]));
  };

  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (live.length === 0 || e.defaultPrevented || e.isComposing || dragging() || isTyping(document.activeElement) || hasOverlay()) return;
    const result = partKeyOps(readPlacements(profile, page), live, { key: e.key, code: e.code, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey }, uid);
    if (!result) return;
    // Taken here, so the zone shortcuts don't act on it as well.
    e.preventDefault();
    if ("clear" in result) return setIds([]);
    applyPageOps(result.ops, result.merge);
    if (result.select) setIds(result.select);
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, []);

  return { ids: live, select, clear: () => setIds([]), setIds };
}
