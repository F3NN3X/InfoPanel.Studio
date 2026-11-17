import type { Dispatch, SetStateAction } from "react";
import { uid, type MonitorProfile, type ProfilePage } from "@/lib/layout";
import { pinBlocked } from "@/lib/pin-blocked";
import type { PinnedCells, PinnedEdge } from "@/lib/pinned";
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
  /** Page widgets pinned in place: they leave the page's selection. */
  onPinnedHere: () => void;
  toast: (text: string) => void;
}

const edits = () => import("@/lib/pinned-edit");
const placing = () => import("./pinned-placing");

const EDGE_WORDS = { top: "the top", bottom: "the bottom", left: "the left edge", right: "the right edge" } as const;

/**
 * What the studio does with the pinned layer outside its inspector: pin a page widget to an edge (Edit then shows the
 * pinned layer with it selected) or in place (Edit stays on the page, where it stays), unpin an item, move it back to
 * the page (a grid pin to its own cells when they are free), move a page widget out from under a grid pin, and set a grid
 * pin's cells. Each is one undo step.
 */
export function usePinnedActions({ stored, page, updateStored, view, setView, setPinnedOn, onPlaced, onPinnedHere, toast }: PinnedActionsDeps) {
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

  /** Pin here: the page's widgets pinned in place, keeping their cells, as one step (the "3 in a row" of the owner's ask). */
  const pinHere = (placementIds: readonly string[]) => {
    const placements = placementIds.flatMap((id) => page.placements.find((x) => x.id === id && !pinBlocked(x) && !x.px) ?? []);
    if (!placements.length) return;
    const ids = placements.map(() => uid("pin"));
    const names = placements.map(zoneName);
    void edits().then((m) => updateStored((p) => m.pinInPlace(p, page.id, placements.map((x) => x.id), { ids, names })));
    onPinnedHere();
    toast(placements.length === 1 ? `Pinned ${names[0]} in place; it keeps its cells on every page` : `Pinned ${placements.length} widgets in place; they keep their cells on every page`);
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
    void Promise.all([placing(), edits()]).then(([where, m]) => {
      const rect = where.spotBack(stored, page.id, item);
      if (!rect) return toast("No free space on this page; make room or remove a widget first");
      updateStored((p) => m.unpinToPage(p, id, page.id, rect));
      setView(NO_PIN);
      setPinnedOn(false);
      onPlaced(item.placement.id);
      toast(`Moved ${item.name ?? "the widget"} to ${page.name}`);
    });
  };

  /** A conflict's Move: the page widget under a grid pin to the first free spot of its page. */
  const fixConflict = (pageId: string, placementId: string) => {
    const target = stored.pages.find((p) => p.id === pageId);
    const zone = target?.placements.find((z) => z.id === placementId);
    if (!target || !zone) return;
    void Promise.all([placing(), edits()]).then(([where, m]) => {
      const rect = where.conflictSpot(stored, pageId, zone);
      if (!rect) return toast(`No free space on ${target.name} for ${zoneName(zone)}; make room or remove a widget first`);
      updateStored((p) => m.moveZoneTo(p, pageId, placementId, rect));
      toast(`Moved ${zoneName(zone)} on ${target.name}`);
    });
  };

  /** A grid pin moved or sized on the canvas. */
  const setCells = (id: string, at: PinnedCells) => void edits().then((m) => updateStored((p) => m.withCells(p, id, at)));

  return { pin, pinHere, remove, removeSelected, moveToPage, fixConflict, setCells };
}

export type PinnedActions = ReturnType<typeof usePinnedActions>;
