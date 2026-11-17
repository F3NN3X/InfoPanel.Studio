import { useState } from "react";
import { Bell, Hand, Image as ImageIcon, LayoutPanelLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconGrid, type IconGridItem } from "@/components/ui/icon-grid";
import { assetIdOf, ASSETS_URL } from "@/lib/assets";
import { RAIL_GROUP_NAMES, touchChoices, touchValue } from "@/lib/pinned-edit";
import type { BadgeRule, RailGroup, RailIcon, RailShape, RailSlot, TouchAction, TouchGesture, TouchMap } from "@/lib/pinned";
import { slotName, type RailPage } from "@/lib/rail";
import { MediaField } from "../media-field";
import { PAGE_ICONS } from "../page-icons";
import { PanelSection } from "../panel-section";
import { SegmentedRow, SelectRow, TextRow, ToggleRow } from "../setting-rows";
import type { RailWidget } from "./rail-editor";

/*
 * The touch rows' hints are taken from Tessera Deck's editor (host/editor/app.js, `hints`, commit efca233, MIT,
 * Copyright (c) 2026 catorendal-a11y; licences/tessera-deck-MIT.txt), reworded from a key to a rail item, as the
 * `rail-editor` fixture has them (INVESTIGATION §10).
 */

const ICONS: IconGridItem[] = Object.entries(PAGE_ICONS).map(([name, Icon]) => ({ id: name, label: name, icon: <Icon /> }));

const KIND_LINES = { page: "Rail item · opens a page", profile: "Rail item · the profile", action: "Rail item · runs an action", widget: "Rail item · a widget" } as const;

const GESTURES: { g: TouchGesture; label: string; hint: string }[] = [
  { g: "tap", label: "Tap", hint: "Runs when you tap the item." },
  { g: "hold", label: "Hold", hint: "Runs when you hold the item for about half a second instead of the tap." },
  { g: "doubleTap", label: "Double tap", hint: "Runs when you tap twice quickly. An item with a double tap waits a moment before its tap runs." },
];

const BADGES: { value: BadgeRule | ""; label: string }[] = [
  { value: "", label: "No badge" },
  { value: "agents-waiting", label: "An agent waits for you" },
  { value: "alerts", label: "An alert shows" },
  { value: "obs-live", label: "OBS is streaming: LIVE" },
];

/** A fresh icon of `from` (not an image, which waits for its file), keeping the old one when it is of that kind. */
function iconFrom(from: "set" | "text" | "app", name: string, old: RailIcon | undefined): RailIcon {
  if (old?.from === from) return old;
  if (from === "set") return { from: "set", name: "layout-dashboard" };
  if (from === "text") return { from: "text", text: name.slice(0, 2) || "A" };
  return { from: "app", exe: "" };
}

function withTouch(slot: RailSlot, g: TouchGesture, action: TouchAction | undefined): RailSlot {
  const touch: TouchMap = { ...slot.touch };
  if (action) touch[g] = action;
  else delete touch[g];
  const { touch: _old, ...rest } = slot;
  return Object.keys(touch).length ? { ...rest, touch } : rest;
}

interface RailSlotInspectorProps {
  slot: RailSlot;
  pages: readonly RailPage[];
  widgets: readonly RailWidget[];
  onChange: (fn: (s: RailSlot) => RailSlot, key?: string) => void;
  onRemove: () => void;
}

/**
 * A rail item's inspector (mockup 13): what it is (its page, action or widget, and its group), its icon (from the icon
 * set, an app, an image or text; shape, tint and label), what a tap, a hold and a double tap do, and its badge. The name is
 * the image's alt text and the button's name. An app's icon is extracted in a later update; until then it shows a window.
 */
export function RailSlotInspector({ slot, pages, widgets, onChange, onRemove }: RailSlotInspectorProps) {
  const name = slotName(slot, pages);
  const t = slot.target;
  const choices = touchChoices(pages);
  const icon = slot.icon;
  // "Image" picked: the slot keeps its icon until a file is chosen (an image with no file draws nothing)
  const [pending, setPending] = useState(false);
  const from = pending ? "image" : (icon?.from ?? "set");
  const key = (field: string) => `rail:${slot.id}:${field}`;
  const actionOptions = (none: string, stored: TouchAction | undefined) => [
    { value: "", label: none },
    ...choices.map((c) => ({ value: c.value, label: c.label })),
    ...(touchValue(stored) === "other" ? [{ value: "other", label: "Set in the config (kept)" }] : []),
  ];
  const pick = (value: string, stored: TouchAction | undefined): TouchAction | undefined => (value === "other" ? stored : choices.find((c) => c.value === value)?.action);
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3">
        <h2 className="truncate text-title font-semibold text-ui-1">{name}</h2>
        <p className="text-caption text-ui-3">{KIND_LINES[t.kind]}</p>
      </div>
      <PanelSection id="rail-item" title="Item" icon={LayoutPanelLeft}>
        <TextRow label="Name" hint="What a screen reader says, and an image's alt text." value={slot.name ?? ""} placeholder={name} onChange={(v) => onChange((s) => (v ? { ...s, name: v } : (({ name: _n, ...rest }) => rest)(s)), key("name"))} />
        <SelectRow label="Group" value={slot.group} onChange={(g) => onChange((s) => ({ ...s, group: g as RailGroup }))} options={RAIL_GROUP_NAMES.map(([value, label]) => ({ value, label }))} />
        {t.kind === "page" && (
          <SelectRow label="Page" value={t.pageId} onChange={(pageId) => onChange((s) => ({ ...s, target: { kind: "page", pageId } }))} options={pages.map((p) => ({ value: p.id, label: p.name }))} />
        )}
        {t.kind === "action" && (
          <SelectRow
            label="Action"
            value={touchValue(t.action)}
            onChange={(v) => {
              const action = pick(v, t.action);
              if (action) onChange((s) => ({ ...s, target: { kind: "action", action } }));
            }}
            options={actionOptions("Choose an action", t.action).slice(1)}
          />
        )}
        {t.kind === "widget" && widgets.length > 0 && (
          <SelectRow
            label="Widget"
            value={widgets.find((w) => w.module === t.module)?.name ?? ""}
            onChange={(v) => {
              const w = widgets.find((x) => x.name === v);
              if (w) onChange((s) => ({ ...s, target: { kind: "widget", module: w.module, settings: w.settings } }));
            }}
            options={widgets.map((w) => ({ value: w.name, label: w.name }))}
          />
        )}
      </PanelSection>
      {t.kind !== "widget" && (
        <PanelSection id="rail-icon" title="Icon" icon={ImageIcon}>
          <SegmentedRow
            label="Icon from"
            value={from}
            onChange={(v) => {
              setPending(v === "image" && icon?.from !== "image");
              if (v !== "image") onChange((s) => ({ ...s, icon: iconFrom(v as "set" | "text" | "app", name, s.icon) }));
            }}
            options={[
              { value: "set", label: "Icon set" },
              { value: "app", label: "App" },
              { value: "image", label: "Image" },
              { value: "text", label: "Text" },
            ]}
          />
          {from === "set" && (
            <IconGrid icons={ICONS} value={icon?.from === "set" ? icon.name : ""} onChange={(n) => onChange((s) => ({ ...s, icon: { from: "set", name: n } }))} columns={7} label="Icon" />
          )}
          {from === "text" && icon?.from === "text" && <TextRow label="Text" value={icon.text} onChange={(text) => onChange((s) => ({ ...s, icon: { from: "text", text } }), key("text"))} />}
          {from === "app" && icon?.from === "app" && (
            <>
              <TextRow label="Program" placeholder="Chat.exe" value={icon.exe} onChange={(exe) => onChange((s) => ({ ...s, icon: { from: "app", exe } }), key("exe"))} />
              <p className="text-caption text-ui-3">The program's own icon comes in a later update; until then the rail shows a window.</p>
            </>
          )}
          {from === "image" && (
            <>
              <MediaField
                label="Image"
                kind="image"
                preview="thumb"
                value={icon?.from === "image" ? `${ASSETS_URL}/${encodeURIComponent(icon.asset)}` : undefined}
                onChange={(src) => {
                  const asset = assetIdOf(src);
                  if (!asset) return;
                  setPending(false);
                  onChange((s) => ({ ...s, icon: { from: "image", asset } }));
                }}
              />
              <p className="text-caption text-ui-3">PNG, SVG, WebP or GIF from the Library or your computer. It keeps its own colours; the item's name is its alt text.</p>
            </>
          )}
          <SegmentedRow
            label="Shape"
            value={slot.shape ?? "as-is"}
            onChange={(v) => onChange((s) => ({ ...s, shape: v as RailShape }))}
            options={[
              { value: "as-is", label: "As is" },
              { value: "rounded", label: "Rounded" },
              { value: "circle", label: "Circle" },
            ]}
          />
          <ToggleRow label="Tint with the theme colour" value={slot.tint === true} onChange={(on) => onChange((s) => ({ ...s, tint: on }))} />
          <ToggleRow label="Label under the icon" value={slot.label === true} onChange={(on) => onChange((s) => ({ ...s, label: on }))} />
        </PanelSection>
      )}
      <PanelSection id="rail-touch" title="Touch" icon={Hand}>
        {GESTURES.map(({ g, label, hint }) => (
          <div key={g}>
            <SelectRow label={label} value={touchValue(slot.touch?.[g])} onChange={(v) => onChange((s) => withTouch(s, g, pick(v, s.touch?.[g])))} options={actionOptions(g === "tap" ? "What the item is" : "Nothing", slot.touch?.[g])} />
            <p className="text-caption text-ui-3">{hint}</p>
          </div>
        ))}
      </PanelSection>
      <PanelSection id="rail-badge" title="Badge" icon={Bell}>
        <SelectRow
          label="Show when"
          value={slot.badge?.when ?? ""}
          onChange={(v) => onChange((s) => {
            const { badge: _old, ...rest } = s;
            return v ? { ...rest, badge: { when: v as BadgeRule } } : rest;
          })}
          options={BADGES}
        />
      </PanelSection>
      <div className="px-4 py-3">
        <Button small variant="ghost" icon={<Trash2 />} onClick={onRemove}>
          Remove from the rail
        </Button>
      </div>
    </div>
  );
}
