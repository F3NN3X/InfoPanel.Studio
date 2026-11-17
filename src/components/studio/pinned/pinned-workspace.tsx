import type { CSSProperties, ReactNode } from "react";
import { Pin } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { DashboardConfig, MonitorProfile, ProfilePage, ProfileView } from "@/lib/layout";
import {
  addPinnedItem,
  allPinConflicts,
  copyPinnedToSameSize,
  movePinnedItem,
  newPinnedItem,
  pinConflicts,
  sameSizeProfiles,
  updatePinnedItem,
  withChipItem,
  withChipShown,
  withHidePinned,
  withRailSlots,
} from "@/lib/pinned-edit";
import { isEdgePin, pinnedOnPage, pinnedRoom, type RailSlot } from "@/lib/pinned";
import { CHIP_SLOT_ID, chipSlot, RAIL_MODULE, railSlots } from "@/lib/rail";
import type { Appearance } from "@/lib/style-resolve";
import { zoneName } from "../inspector/zone-meta";
import { StudioShell } from "../studio-shell";
import type { useStudioLayout } from "../use-studio-layout";
import { PinnedInspector, type ItemUpdate } from "./pinned-inspector";
import { PinnedPages } from "./pinned-pages";
import { PinnedPanel } from "./pinned-panel";
import { RailEditor, useRailWidgets } from "./rail-editor";
import { RailSlotInspector } from "./rail-slot-inspector";
import type { PinnedActions } from "./use-pinned-actions";

/** What Edit shows of the pinned layer: the item selected, and the rail editor open on it (with its item selected). */
export interface PinnedView {
  id: string | null;
  rail: boolean;
  slot: string | null;
}

interface PinnedWorkspaceProps {
  config: DashboardConfig;
  stored: MonitorProfile;
  profile: ProfileView;
  page: ProfilePage;
  appearance: Appearance;
  themeScope: CSSProperties;
  layout: ReturnType<typeof useStudioLayout>;
  /** The left panel's width, and the closed panel's strip (null: open). */
  leftWidth: number;
  leftStrip: ReactNode;
  /** The canvas, drawing the pinned layer over the dimmed page. */
  canvas: ReactNode;
  pageTabs: ReactNode;
  bar: ReactNode;
  view: PinnedView;
  onView: (view: PinnedView) => void;
  /** A change to the stored profile: one undo step, `key` coalescing a field's. */
  updateStored: (fn: (p: MonitorProfile) => MonitorProfile, key?: string) => void;
  setConfig: HistorySetter;
  onPageChange: (pageId: string) => void;
  thumbsPinned: boolean;
  onThumbsPinned: (on: boolean) => void;
  toast: (text: string) => void;
  /** Unpin, move to the page (the list's buttons and menus) and a grid pin's conflict fixes. */
  actions: Pick<PinnedActions, "remove" | "moveToPage" | "fixConflict">;
}

/**
 * Edit with Pinned on (P3; mockup 08 and 13, the `editor` and `rail-editor` fixtures), in the studio's shell: the pinned
 * layer's list on the left, the canvas with the page dimmed under the layer and the pages under it, and the selected item's
 * inspector; or, for a rail, its item editor. Every change goes through `updateStored`, so it is one undo step and saves
 * into the profile's `pinned` (config v20).
 */
export default function PinnedWorkspace(p: PinnedWorkspaceProps) {
  const { stored, page, view, onView, updateStored } = p;
  const widgets = useRailWidgets();
  const items = stored.pinned?.items ?? [];
  const item = items.find((it) => it.id === view.id);
  const index = p.config.profiles.findIndex((x) => x.id === stored.id);
  const update: ItemUpdate = (fn, key) => item && updateStored((s) => updatePinnedItem(s, item.id, fn), key);
  const canCopy = sameSizeProfiles(p.config, stored).length > 0;
  const copy = () => {
    let count = 0;
    p.setConfig((c) => {
      const r = copyPinnedToSameSize(c, stored.id);
      count = r.count;
      return r.config;
    });
    p.toast(count ? `Pinned layer copied to ${count === 1 ? "1 other profile" : `${count} other profiles`} of ${stored.width} × ${stored.height}` : `No other profile is ${stored.width} × ${stored.height}`);
  };
  const add = (kind: Parameters<typeof newPinnedItem>[0]) => {
    const made = newPinnedItem(kind);
    updateStored((s) => addPinnedItem(s, made));
    onView({ id: made.id, rail: false, slot: null });
  };
  const room = pinnedRoom(pinnedOnPage(stored.pinned, page.id, page.hidePinned));
  const area = { width: stored.width - room.left - room.right, height: stored.height - room.top - room.bottom };
  // the rail editor edits a rail on an edge; one pinned in place draws one slot per page, as on a page
  const railItem = view.rail && item && isEdgePin(item) && item.placement.module === RAIL_MODULE ? item : undefined;
  const railOpen = railItem !== undefined;
  // a grid pin's conflicts (the page widgets under its cells), and the pages that have any (their thumbnails' marker)
  const conflicts = item
    ? pinConflicts(stored, item).flatMap((c) => {
        const pg = stored.pages.find((x) => x.id === c.pageId);
        const z = pg?.placements.find((x) => x.id === c.placementId);
        return pg && z ? [{ ...c, pageName: pg.name, name: zoneName(z) }] : [];
      })
    : [];
  const conflicted = new Set(allPinConflicts(stored).map((c) => c.pageId));
  // a rail with no items stored lists one per page (`railSlots`); they are stored with the first change
  const chipOpen = railItem !== undefined && view.slot === CHIP_SLOT_ID;
  const shownSlot = railItem && view.slot ? (chipOpen ? chipSlot(railItem.placement.settings) : railSlots(railItem.rail, stored.pages).find((s) => s.id === view.slot)) : undefined;
  const changeSlots = (fn: (s: RailSlot[]) => RailSlot[], key?: string) => update((it) => withRailSlots(it, stored.pages, fn), key);

  // the rail editor brings its own preview column where the list was (the `rail-editor` fixture)
  const drawer = railOpen ? null : (p.leftStrip ?? (
    <PinnedPanel
      profile={stored}
      page={page}
      width={p.leftWidth}
      selectedId={view.id}
      onSelect={(id) => onView({ id, rail: false, slot: null })}
      onAdd={add}
      onToggleVisible={(id) => updateStored((s) => updatePinnedItem(s, id, (it) => ({ ...it, visible: !it.visible })))}
      onMove={(id, by) => updateStored((s) => movePinnedItem(s, id, by))}
      actions={p.actions}
    />
  ));
  const main = railItem ? (
    <RailEditor
      stored={stored}
      profile={p.profile}
      index={index}
      pageId={page.id}
      item={railItem}
      appearance={p.appearance}
      themeScope={p.themeScope}
      selectedSlot={shownSlot?.id ?? null}
      onSelectSlot={(slot) => onView({ ...view, slot })}
      update={update}
      onBack={() => onView({ ...view, rail: false, slot: null })}
      onCopy={copy}
      canCopy={canCopy}
      widgets={widgets}
    />
  ) : (
    <>
      {p.pageTabs}
      <div className="flex shrink-0 gap-2 border-b border-ui-subtle bg-ui-app px-4 py-2 font-ui text-caption">
        {item && <span className="inline-flex h-6 items-center rounded-ui-sm border border-ui-blue bg-ui-blue-bg px-2 text-ui-blue-text">{`${item.name ?? "Pinned widget"} · ${isEdgePin(item) ? `pinned ${item.edge}` : "pinned in place"}`}</span>}
        <span className="inline-flex h-6 items-center rounded-ui-sm border border-dashed border-ui-strong px-2 text-ui-3">{`Page area · ${page.name} · ${area.width}×${area.height} after pins`}</span>
      </div>
      {/* the zoom bar sits over the canvas, above the pages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {p.canvas}
        {p.bar}
      </div>
      <PinnedPages profile={stored} current={page.id} onSelect={p.onPageChange} showPinned={p.thumbsPinned} onShowPinned={p.onThumbsPinned} conflicted={conflicted} />
    </>
  );
  const aside = (children: ReactNode) => (
    <aside aria-label="Inspector" className={p.layout.mode !== "docked" ? "flex h-full w-full flex-col overflow-y-auto bg-ui-panel font-ui" : "flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel font-ui"}>
      {children}
    </aside>
  );
  const inspector = railItem ? (
    aside(
      shownSlot ? (
        <RailSlotInspector
          key={shownSlot.id}
          slot={shownSlot}
          pages={stored.pages}
          widgets={widgets}
          chip={chipOpen ? { shown: railItem.placement.settings?.chip !== false, onShown: (on) => update((it) => withChipShown(it, on)), profileName: stored.name } : undefined}
          onChange={(fn, key) => (chipOpen ? update((it) => withChipItem(it, fn), key) : changeSlots((all) => all.map((s) => (s.id === shownSlot.id ? fn(s) : s)), key))}
          onRemove={() => {
            changeSlots((all) => all.filter((s) => s.id !== shownSlot.id));
            onView({ ...view, slot: null });
          }}
        />
      ) : (
        <p className="px-4 py-3 text-body text-ui-3">Select an item to set its icon, what a touch does and its badge.</p>
      )
    )
  ) : item ? (
    aside(
      <PinnedInspector
        config={p.config}
        profile={stored}
        page={page}
        item={item}
        update={update}
        onHidePinned={(hide) => updateStored((s) => withHidePinned(s, page.id, hide))}
        onCopy={copy}
        onRemove={() => p.actions.remove(item.id)}
        onEditRail={() => onView({ id: item.id, rail: true, slot: null })}
        conflicts={conflicts}
        onFix={(c) => p.actions.fixConflict(c.pageId, c.placementId)}
        onMoveToPage={() => p.actions.moveToPage(item.id)}
      />
    )
  ) : (
    aside(
      <div className="px-4 py-3">
        <h2 className="flex items-center gap-2 text-title font-semibold text-ui-1">
          <Pin aria-hidden size={16} />
          Pinned layer
        </h2>
        <p className="mt-1 text-body text-ui-3">
          {items.length
            ? "Select a pinned widget, on the canvas or in the list, to set its edge, size and pages."
            : "Widgets pinned to an edge stay put on every page while the pages change beside them. Pin one with + in the list, or right-click a page widget: Pin here keeps it on its cells on every page."}
        </p>
      </div>
    )
  );
  return <StudioShell layout={p.layout} drawer={drawer} main={main} bar={null} inspector={inspector} />;
}
