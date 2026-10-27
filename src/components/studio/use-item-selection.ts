import { useEffect, useRef, useState } from "react";
import type { ProfilePage } from "@/lib/layout";

interface ItemSelectionDeps {
  profileId: string;
  /** The page on the canvas, as stored. */
  page: ProfilePage;
  /** The zone selection's primary zone: selecting a zone clears the items. */
  zoneId: string | null;
  /** Clear the zone selection (selecting an item clears the zones). */
  clearZones: () => void;
}

/**
 * The InfoPanel items and elements selected on a screen page's canvas (Edit v3 SPEC §7.5), beside the zone selection:
 * selecting one kind alone clears the other, Shift / Ctrl adds to it (a mixed selection, `use-page-layers.ts`, which
 * also takes the keyboard for it). A selected item an undo removes drops out.
 */
export function useItemSelection({ profileId, page, zoneId, clearZones }: ItemSelectionDeps) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds([]), [profileId, page.id]);
  // A zone selected alone clears the items; one added with Shift / Ctrl (`keep`) keeps them.
  const keep = useRef(false);
  useEffect(() => {
    if (zoneId && !keep.current) setIds([]);
    keep.current = false;
  }, [zoneId]);
  const live = ids.filter((id) => page.placements.some((p) => p.id === id));

  const select = (id: string, toggle: boolean) => {
    if (!toggle) clearZones();
    setIds((now) => (toggle ? (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]) : [id]));
  };

  return {
    ids: live,
    select,
    clear: () => setIds([]),
    setIds,
    /** The next zone selection change keeps the items (a zone added to a mixed selection). */
    keep: () => {
      keep.current = true;
    },
  };
}

export type ItemSelection = ReturnType<typeof useItemSelection>;
