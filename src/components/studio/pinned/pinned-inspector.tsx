import { Grid3x3, Hand, LayoutPanelLeft, Pin, TriangleAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingRow as UiSettingRow } from "@/components/ui/setting-row";
import { Toggle } from "@/components/ui/toggle";
import type { DashboardConfig, MonitorProfile, ProfilePage } from "@/lib/layout";
import { islandClash, PIN_MIN_THICKNESS, pinnedThicknessMax, railOverflow, sameSizeProfiles, showChoice, withShow, withShownPage, type ShowChoice } from "@/lib/pinned-edit";
import { PINNED_EDGES, type PinnedEdge, type PinnedItem } from "@/lib/pinned";
import { RAIL_MODULE } from "@/lib/rail";
import { modules } from "@/modules";
import type { ModuleSetting, ModuleSettingValue } from "@/modules/types";
import { PanelSection } from "../panel-section";
import { SettingRow } from "../setting-control";
import { SegmentedRow, SliderRow, TextRow } from "../setting-rows";
import { KeysEditor } from "../keys-editor";
import { TouchRows } from "../touch-rows";

/** A change to the item; `key` coalesces the steps of one field (a slider's drag is one undo step). */
export type ItemUpdate = (fn: (it: PinnedItem) => PinnedItem, key?: string) => void;

interface PinnedInspectorProps {
  config: DashboardConfig;
  profile: MonitorProfile;
  page: ProfilePage;
  item: PinnedItem;
  update: ItemUpdate;
  onHidePinned: (hide: boolean) => void;
  onCopy: () => void;
  onRemove: () => void;
  onEditRail: () => void;
}

const EDGE_LABELS: Record<PinnedEdge, string> = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" };

/** The widget's own settings the inspector lists here: the simple kinds a pinned widget's look needs, shown while they apply. */
const listed = (def: ModuleSetting, values: Record<string, ModuleSettingValue>) =>
  !def.hidden && !def.section && !def.optionsFrom && ["boolean", "select", "number", "text"].includes(def.type) && (def.visibleIf?.(values) ?? true);

/**
 * The inspector for a pinned item (mockup 08, the `editor` fixture): Pin (the pages it shows on, its edge, make room or
 * float, its size and inset, the page's own "hide", the copy to the other profiles of its size), the widget's settings,
 * and for a rail its items and what a touch does. Every change is one undo step and saves into the profile's `pinned`.
 */
export function PinnedInspector({ config, profile, page, item, update, onHidePinned, onCopy, onRemove, onEditRail }: PinnedInspectorProps) {
  const mod = modules.find((m) => m.id === item.placement.module);
  const values: Record<string, ModuleSettingValue> = Object.fromEntries((mod?.settings ?? []).map((d) => [d.key, item.placement.settings?.[d.key] ?? d.default]));
  const rail = item.placement.module === RAIL_MODULE;
  const choice = showChoice(item, page.id);
  const order = profile.pages.map((p) => p.id);
  const clash = islandClash(profile.island, item);
  const overflow = rail ? railOverflow(item, profile) : null;
  const others = sameSizeProfiles(config, profile).length;
  const side = item.edge === "left" || item.edge === "right";
  const setSetting = (key: string, value: ModuleSettingValue) =>
    update((it) => ({ ...it, placement: { ...it.placement, settings: { ...it.placement.settings, [key]: value } } }), `pinned:${item.id}:${key}`);
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3">
        <h2 className="truncate text-title font-semibold text-ui-1">{item.name ?? mod?.title ?? item.placement.module}</h2>
        <p className="text-caption text-ui-3">
          {mod?.title ?? item.placement.module} · {item.thickness} px {side ? "wide" : "high"}
        </p>
      </div>
      <PanelSection id="pinned-pin" title="Pin" icon={Pin}>
        <TextRow label="Name" value={item.name ?? ""} placeholder={mod?.title} onChange={(name) => update((it) => (name ? { ...it, name } : withoutName(it)), `pinned:${item.id}:name`)} />
        <SegmentedRow
          label="Show on"
          value={choice}
          onChange={(v) => update((it) => withShow(it, v as ShowChoice, page.id))}
          options={[
            { value: "this", label: "This page" },
            { value: "some", label: "Some pages" },
            { value: "all", label: "All pages" },
          ]}
        />
        {choice === "some" && (
          <fieldset className="space-y-1">
            <legend className="sr-only">Pages it shows on</legend>
            {profile.pages.map((p) => (
              <UiSettingRow key={p.id} label={p.name}>
                <Toggle checked={item.show === "all" || item.show.pages.includes(p.id)} onChange={(on) => update((it) => withShownPage(it, p.id, on, order))} label={`Show on ${p.name}`} />
              </UiSettingRow>
            ))}
          </fieldset>
        )}
        <SegmentedRow label="Edge" value={item.edge} onChange={(v) => update((it) => ({ ...it, edge: v as PinnedEdge }))} options={PINNED_EDGES.map((e) => ({ value: e, label: EDGE_LABELS[e] }))} />
        {clash && (
          <p role="note" className="flex gap-1.5 text-caption text-ui-warn">
            <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The Island is on this edge too and draws over this widget. Move one of them, or turn off Reserve space so the page starts under the Island alone.
          </p>
        )}
        <SegmentedRow
          label="Page content"
          value={item.mode}
          onChange={(v) => update((it) => ({ ...it, mode: v === "float" ? "float" : "room" }))}
          options={[
            { value: "room", label: "Make room" },
            { value: "float", label: "Float on top" },
          ]}
        />
        <p className="text-caption text-ui-3">{item.mode === "room" ? "Pages lay out in the space it leaves." : "It lies over the page, which keeps its whole space."}</p>
        <SliderRow label="Size" value={item.thickness} min={PIN_MIN_THICKNESS} max={pinnedThicknessMax(item.edge, profile)} unit="px" fallback={item.thickness} onChange={(n) => update((it) => ({ ...it, thickness: Math.max(1, Math.round(n)) }), `pinned:${item.id}:size`)} />
        <SliderRow
          label="Off the edge"
          hint={side ? "Its distance from the screen's edge, and from the top and bottom." : "Its distance from the screen's edge."}
          value={item.inset ?? 0}
          min={0}
          max={48}
          unit="px"
          fallback={0}
          onChange={(n) => update((it) => (n > 0 ? { ...it, inset: Math.round(n) } : withoutInset(it)), `pinned:${item.id}:inset`)}
        />
        <UiSettingRow label={`Hide the pinned layer on ${page.name}`}>
          <Toggle checked={page.hidePinned === true} onChange={onHidePinned} label={`Hide the pinned layer on ${page.name}`} />
        </UiSettingRow>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button small disabled={others === 0} title={others === 0 ? `No other profile is ${profile.width} × ${profile.height}` : undefined} onClick={onCopy}>
            Use on every profile of this size
          </Button>
          <Button small variant="ghost" icon={<Trash2 />} onClick={onRemove}>
            Unpin
          </Button>
        </div>
      </PanelSection>
      {mod && (
        <PanelSection id="pinned-widget" title={rail ? "Rail" : mod.title} icon={LayoutPanelLeft}>
          {(mod.settings ?? []).filter((d) => listed(d, values)).map((def) => (
            <SettingRow key={def.key} def={def} value={values[def.key]} onChange={(v) => setSetting(def.key, v)} sources={null} />
          ))}
          {rail && (
            <>
              {overflow && (
                <p role="note" className="flex gap-1.5 text-caption text-ui-warn">
                  <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {`Its items need ${overflow.need} px and the rail is ${overflow.have} px high: the last ones scroll. Remove some, or turn off the clock or the chip.`}
                </p>
              )}
              <Button small className="mt-1" onClick={onEditRail}>
                Edit rail items
              </Button>
            </>
          )}
        </PanelSection>
      )}
      {rail && (
        <PanelSection id="pinned-touch" title="Touch" icon={Hand}>
          <TouchLine gesture="Tap a page icon" action="Open the page" />
          <TouchLine gesture="Tap Auto or Locked" action="Rotate pages, or stay" />
          <TouchLine gesture="Swipe on the page" action="Next or previous page" />
          <p className="text-caption text-ui-3">An item's own tap, hold and double tap are set in Edit rail items.</p>
        </PanelSection>
      )}
      {item.placement.module === "Keys" && (
        <PanelSection id="pinned-keys" title="Keys" icon={Grid3x3}>
          <KeysEditor
            keys={item.placement.keys}
            pages={profile.pages}
            onChange={(keys, key) =>
              update((it) => {
                const { keys: _old, ...placement } = it.placement;
                return { ...it, placement: keys ? { ...placement, keys } : placement };
              }, key && `pinned:${item.id}:${key}`)
            }
          />
        </PanelSection>
      )}
      {mod && !rail && (
        <PanelSection id="pinned-touch" title="Touch" icon={Hand}>
          <TouchRows
            touch={item.placement.touch}
            pages={profile.pages}
            onChange={(touch, g) =>
              update((it) => {
                const { touch: _old, ...placement } = it.placement;
                return { ...it, placement: touch ? { ...placement, touch } : placement };
              }, `pinned:${item.id}:touch:${g}`)
            }
          />
        </PanelSection>
      )}
    </div>
  );
}

function withoutName(it: PinnedItem): PinnedItem {
  const { name: _gone, ...rest } = it;
  return rest;
}

function withoutInset(it: PinnedItem): PinnedItem {
  const { inset: _gone, ...rest } = it;
  return rest;
}

function TouchLine({ gesture, action }: { gesture: string; action: string }) {
  return (
    <div className="flex min-h-[30px] items-center justify-between gap-3 text-body">
      <span className="text-ui-3">{gesture}</span>
      <span className="text-ui-1">{action}</span>
    </div>
  );
}
