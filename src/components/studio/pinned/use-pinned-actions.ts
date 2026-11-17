import type { Dispatch, SetStateAction } from "react";
import { uid, type MonitorProfile, type ProfilePage } from "@/lib/layout";
import type { PinnedEdge } from "@/lib/pinned";
import { autoPlace } from "../add-place";
import { moduleDropSize } from "../drop-ghost";
import { moduleMinSize } from "../studio-modules";
import { zoneName } from "../inspector/zone-meta";
import type { PinnedView } from "./pinned-workspace";

export const NO_PIN: PinnedView = { id: null, rail: false, slot: null };

interface PinnedActionsDeps {
  stored: MonitorProfile;
  /** The page on the canvas. */
  page: ProfilePage;
  /** A change to the stored profile: one undo step. */
  updateStored: (fn: (p: MonitorProfile) => MonitorProfile, key?: string) => void;
  view: PinnedView;
  setView: Dispatch<SetStateAction<PinnedView>>;
  /** Edit shows the pinned layer (true) or the page (false). */
  setPinnedOn: (on: boolean) => void;
  /** A widget moved onto the page: show it, selected. */
  onPlaced: (placementId: string) => void;
  toast: (text: string) => void;
}

const edits = () => import("@/lib/pinned-edit");

const EDGE_WORDS = { top: "the top", bottom: "the bottom", left: "the left edge", right: "the right edge" } as const;

/**
 * What the studio does with the pinned layer outside its inspector: pin a page widget to an edge (Edit then shows the
 * pinned layer with it selected), unpin an item, move it back to the page's first free spot. Each is one undo step.
 */
export function usePinnedActions({ stored, page, updateStored, view, setView, setPinnedOn, onPlaced, toast }: PinnedActionsDeps) {
  const pin = (placementId: string, edge: PinnedEdge) => {
    const placement = page.placements.find((x) => x.id === placementId);
    if (!placement) return;
    const id = uid("pin");
    const name = zoneName(placement);
    // the edit helpers are the pinned editor's chunk: loaded when one is chosen, not with the studio
    void edits().then((m) => {
      updateStored((p) => m.pinPlacement(p, page.id, placementId, edge, { id, name }));
      setPinnedOn(true);
      setView({ id, rail: false, slot: null });
    });
    toast(`Pinned ${name} to ${EDGE_WORDS[edge]}; it stays on every page`);
  };

  const remove = (id: string) => {
    void edits().then((m) => updateStored((p) => m.removePinnedItem(p, id)));
    setView((v) => (v.id === id ? NO_PIN : v));
  };

  /** The selected item unpinned; false when none is selected. */
  const removeSelected = (): boolean => {
    if (!view.id) return false;
    remove(view.id);
    return true;
  };

  const moveToPage = (id: string) => {
    const item = stored.pinned?.items.find((it) => it.id === id);
    if (!item) return;
    const { module, settings } = item.placement;
    const rect = autoPlace(stored, page.placements, moduleDropSize(module, stored, settings), moduleMinSize(module, settings));
    if (!rect) return void toast("No free space on this page; make room or remove a widget first");
    void edits().then((m) => {
      updateStored((p) => m.unpinToPage(p, id, page.id, rect));
      setView(NO_PIN);
      setPinnedOn(false);
      onPlaced(item.placement.id);
    });
    toast(`Moved ${item.name ?? "the widget"} to ${page.name}`);
  };

  return { pin, remove, removeSelected, moveToPage };
}

export type PinnedActions = ReturnType<typeof usePinnedActions>;
