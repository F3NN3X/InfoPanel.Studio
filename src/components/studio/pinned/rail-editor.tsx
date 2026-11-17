import { useEffect, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, TriangleAlert } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusChip } from "@/components/ui/status-chip";
import type { MonitorProfile, ProfileView } from "@/lib/layout";
import { moveRailSlot, newRailSlot, pinnedHeight, RAIL_GROUP_NAMES, railOverflow, withRailSlots, type NewSlotKind } from "@/lib/pinned-edit";
import type { PinnedItem, RailSlot } from "@/lib/pinned";
import { CHIP_SLOT_ID, chipSlot, railSlots, slotName, type RailPage } from "@/lib/rail";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";
import { ITEM, POPUP } from "../menu-styles";
import { isCodeId, isRecipeId } from "@/widgets/recipe/resolve";
import { loadUserRailWidgets } from "@/widgets/recipe/use-recipes";
import { loadWidgetPresets } from "../widget-presets";
import type { ItemUpdate } from "./pinned-inspector";
import { PinnedCanvas } from "./pinned-canvas";

/** A widget a rail slot can hold: one with a preset at the rail's size (decision 8). */
export interface RailWidget {
  module: string;
  name: string;
  settings: ModuleSettings;
}

/**
 * The widgets with a rail preset: the built-in ones, loaded with the presets (their own chunk), then the user's recipes with a
 * rail preset and code widgets that offer themselves for the rail (P6), from the recipes' chunk. A user widget list that can't be
 * read leaves the built-in ones.
 */
export function useRailWidgets(): readonly RailWidget[] {
  const [list, setList] = useState<readonly RailWidget[]>([]);
  useEffect(() => {
    let alive = true;
    const own = loadUserRailWidgets().catch((): RailWidget[] => []);
    void Promise.all([loadWidgetPresets(), own]).then(([map, user]) => {
      if (!alive) return;
      setList([
        ...Object.entries(map).flatMap(([module, presets]) =>
          presets.filter((p) => p.size === "rail").map((p) => ({ module, name: `${modules.find((m) => m.id === module)?.title ?? module} · ${p.name}`, settings: p.settings }))
        ),
        ...user,
      ]);
    });
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

const SOURCE = { set: "Icon set", image: "Image", app: "App icon", text: "Text" } as const;

/** What a slot does, for its row's line. */
function lineOf(slot: RailSlot, pages: readonly RailPage[], hidden = false): string {
  const t = slot.target;
  const own = slot.touch && Object.keys(slot.touch).length > 0 ? " · own touch" : "";
  if (slot.id === CHIP_SLOT_ID) return `The profile chip${hidden ? " · hidden" : ""}${own}`;
  const badge = slot.badge ? " · badge" : "";
  if (t.kind === "page") return `Opens ${pages.find((p) => p.id === t.pageId)?.name ?? "a page"}${badge}${own}`;
  if (t.kind === "profile") return `The profile${own}`;
  if (t.kind === "widget") return `${modules.find((m) => m.id === t.module)?.title ?? (isRecipeId(t.module) || isCodeId(t.module) ? "Your" : t.module)} widget${own}`;
  return `Action${badge}${own}`;
}

interface RailEditorProps {
  stored: MonitorProfile;
  profile: ProfileView;
  index: number;
  pageId: string;
  item: PinnedItem;
  appearance: Appearance;
  /** The screen's theme variables, so the preview wears the Look. */
  themeScope: CSSProperties;
  selectedSlot: string | null;
  onSelectSlot: (id: string | null) => void;
  update: ItemUpdate;
  onBack: () => void;
  onCopy: () => void;
  canCopy: boolean;
  widgets: readonly RailWidget[];
}

/**
 * The rail editor (mockup 13, the `rail-editor` fixture): the rail as the panel draws it, its items in their groups (Top,
 * Pages, Actions, Widgets, Bottom) with their order, Add item, and the warning when they don't fit its height (owner Q9).
 * A rail with no items stored lists one per page; the first change stores them.
 */
export function RailEditor({ stored, profile, index, pageId, item, appearance, themeScope, selectedSlot, onSelectSlot, update, onBack, onCopy, canCopy, widgets }: RailEditorProps) {
  const slots = railSlots(item.rail, stored.pages);
  const chip = chipSlot(item.placement.settings);
  const chipHidden = item.placement.settings?.chip === false;
  const h = pinnedHeight(item, stored.height);
  const overflow = railOverflow(item, stored);
  const scale = Math.min(1, 640 / Math.max(1, h));
  const change = (fn: (s: RailSlot[]) => RailSlot[]) => update((it) => withRailSlots(it, stored.pages, fn));
  const add = (kind: NewSlotKind, widget?: RailWidget) => {
    const slot = newRailSlot(kind, slots, stored.pages, widget);
    change((s) => [...s, slot]);
    onSelectSlot(slot.id);
  };
  const side = item.edge === "left" || item.edge === "right";
  // the rail drawn alone, as the canvas draws it, in a box of its own size
  const alone: PinnedItem = { ...item, edge: side ? item.edge : "left", inset: 0, mode: "room", show: "all", visible: true };
  return (
    <div className="flex min-h-0 flex-1 bg-ui-app font-ui text-ui-1">
      <aside aria-label="Preview" className="flex w-[180px] shrink-0 flex-col items-center gap-2 overflow-hidden border-r border-ui-subtle py-4">
        <p className="text-caption text-ui-3">{`Preview · ${item.thickness} × ${h}`}</p>
        <div style={{ width: item.thickness * scale, height: h * scale }}>
          <div
            data-theme-scope=""
            className="relative origin-top-left overflow-hidden bg-background text-foreground"
            style={{ ...themeScope, width: item.thickness, height: h, transform: `scale(${scale})` }}
            // a press on an item selects it in the list; the rail itself never acts here
            onClickCapture={(e) => {
              const id = (e.target as Element).closest?.("[data-rail-slot]")?.getAttribute("data-rail-slot");
              e.preventDefault();
              e.stopPropagation();
              if (id && (id === CHIP_SLOT_ID || slots.some((s) => s.id === id))) onSelectSlot(id);
            }}
          >
            <PinnedCanvas stored={{ ...stored, height: h }} profile={profile} index={index} pageId={pageId} items={[alone]} appearance={appearance} padding={0} editing={false} selectedId={null} onSelect={() => {}} />
          </div>
        </div>
        <p className="px-4 text-center text-caption text-ui-3">Tap an item in the preview to select it.</p>
      </aside>
      <main aria-label="Rail items" className="min-w-0 flex-1 overflow-auto px-8 py-5">
        <Button small variant="ghost" icon={<ArrowLeft />} onClick={onBack}>
          Pinned layer
        </Button>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title font-semibold">Rail items</h1>
            <p className="text-body text-ui-3">Each item is a page, an action, the profile or one of your widgets. Use the arrows to change the order.</p>
          </div>
          <Menu.Root>
            <Menu.Trigger render={<Button icon={<Plus />} />}>Add item</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-[80]">
                <Menu.Popup className={POPUP}>
                  <Menu.Item className={ITEM} onClick={() => add("page")}>
                    A page
                  </Menu.Item>
                  <Menu.Item className={ITEM} onClick={() => add("action")}>
                    An action
                  </Menu.Item>
                  <Menu.Item className={ITEM} onClick={() => add("profile")}>
                    The profile or a logo
                  </Menu.Item>
                  {widgets.map((w) => (
                    <Menu.Item key={`${w.module}:${w.name}`} className={ITEM} onClick={() => add("widget", w)}>
                      {w.name}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        {overflow && (
          <p role="note" className="mt-3 flex gap-1.5 rounded-ui-md border border-ui-warn/40 px-3 py-2 text-body text-ui-warn">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {`These items need ${overflow.need} px and the rail is ${overflow.have} px high, so the last ones scroll on the panel. Remove some, or turn off the clock or the profile chip.`}
          </p>
        )}
        {RAIL_GROUP_NAMES.map(([group, title]) => {
          const inGroup = slots.filter((s) => s.group === group);
          // the profile chip heads Top, ahead of a logo; it is a setting of the rail, so it has no place to move to
          const rows = group === "top" ? [chip, ...inGroup] : inGroup;
          if (!rows.length) return null;
          return (
            <section key={group} className="mt-4">
              <h2 className="mb-1.5 text-caption font-semibold text-ui-3">{title}</h2>
              <ul className="flex flex-col gap-1.5">
                {rows.map((s) => {
                  const selected = s.id === selectedSlot;
                  const isChip = s.id === CHIP_SLOT_ID;
                  const i = inGroup.indexOf(s);
                  const source = s.target.kind === "widget" ? "Widget" : isChip && !s.icon ? "Colour mark" : SOURCE[s.icon?.from ?? "set"];
                  return (
                    <li key={s.id} className={cn("flex min-h-14 items-center gap-2 rounded-ui-md border pr-2", selected ? "border-ui-blue bg-ui-blue-bg" : "border-ui-edge bg-ui-raised")}>
                      <button type="button" aria-pressed={selected} onClick={() => onSelectSlot(s.id)} className={cn("min-w-0 flex-1 self-stretch rounded-ui-md px-3 text-left", FOCUS_RING)}>
                        <span className="block text-body">{isChip ? (s.name ?? stored.name) : slotName(s, stored.pages)}</span>
                        <span className="block truncate text-caption text-ui-3">{lineOf(s, stored.pages, chipHidden)}</span>
                      </button>
                      <StatusChip tone="neutral" dot={false}>
                        {source}
                      </StatusChip>
                      <IconButton label="Move up" size={26} disabled={isChip || i === 0} onClick={() => change((all) => moveRailSlot(all, s.id, -1))}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Move down" size={26} disabled={isChip || i === inGroup.length - 1} onClick={() => change((all) => moveRailSlot(all, s.id, 1))}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-ui-md border border-ui-edge bg-ui-raised px-4 py-3">
          <h2 className="text-body font-semibold">Rail look</h2>
          <span className="text-body text-ui-3">
            Colours <span className="text-ui-1">Follow the Look</span>
          </span>
          <span className="text-body text-ui-3">
            Width <span className="text-ui-1">{`${item.thickness} px`}</span>
          </span>
          <Button small disabled={!canCopy} onClick={onCopy}>
            Use on every profile of this size
          </Button>
        </section>
      </main>
    </div>
  );
}
