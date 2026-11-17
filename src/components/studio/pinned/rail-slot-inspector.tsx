import { useEffect, useState } from "react";
import { Bell, Hand, Image as ImageIcon, LayoutPanelLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconGrid, type IconGridItem } from "@/components/ui/icon-grid";
import { appIcon, AssetError, assetIdOf, ASSETS_URL } from "@/lib/assets";
import { RAIL_GROUP_NAMES, touchChoices, touchValue } from "@/lib/pinned-edit";
import type { BadgeRule, RailGroup, RailIcon, RailPlate, RailShape, RailSlot } from "@/lib/pinned";
import { slotName, type RailPage } from "@/lib/rail";
import { MediaField } from "../media-field";
import { PAGE_ICONS } from "../page-icons";
import { PanelSection } from "../panel-section";
import { SegmentedRow, SelectRow, TextRow, ToggleRow } from "../setting-rows";
import { actionOptions, pickAction, TouchRows, useTouchSources } from "../touch-rows";
import type { RailWidget } from "./rail-editor";

const ICONS: IconGridItem[] = Object.entries(PAGE_ICONS).map(([name, Icon]) => ({ id: name, label: name, icon: <Icon /> }));

const KIND_LINES = { page: "Rail item · opens a page", profile: "Rail item · the profile", action: "Rail item · runs an action", widget: "Rail item · a widget" } as const;

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

/** A program name the server reads an icon for: a file name ending in .exe. */
const EXE = /^[^\\/:]+\.exe$/i;
/** How long typing rests before the icon is read, ms. */
const READ_AFTER_MS = 600;

type AppIconStatus = { state: "idle" } | { state: "reading" } | { state: "error"; message: string };

/**
 * An app icon's file: read by the server once the program's name rests (P5), and stored on the item with the same undo
 * step as the name. A failure says why and offers another try (a program that was not running may be now).
 */
function useAppIcon(icon: RailIcon | undefined, onChange: RailSlotInspectorProps["onChange"], key: string): { status: AppIconStatus; retry: () => void } {
  const [status, setStatus] = useState<AppIconStatus>({ state: "idle" });
  const [tries, setTries] = useState(0);
  const exe = icon?.from === "app" && !icon.asset && EXE.test(icon.exe.trim()) ? icon.exe.trim() : undefined;
  useEffect(() => {
    setStatus({ state: "idle" });
    if (!exe) return;
    let alive = true;
    const timer = setTimeout(() => {
      setStatus({ state: "reading" });
      appIcon(exe).then(
        (asset) => {
          if (!alive) return;
          setStatus({ state: "idle" });
          onChange((s) => (s.icon?.from === "app" && s.icon.exe.trim() === exe ? { ...s, icon: { ...s.icon, asset: asset.id } } : s), key);
        },
        (e: unknown) => alive && setStatus({ state: "error", message: e instanceof AssetError ? e.message : "The icon could not be read." })
      );
    }, READ_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // onChange is the inspector's, new each render; the read follows the name and the tries only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exe, tries]);
  return { status, retry: () => setTries((n) => n + 1) };
}

const PLATES: { value: RailPlate | ""; label: string }[] = [
  { value: "", label: "Auto" },
  { value: "none", label: "None" },
  { value: "card", label: "Card" },
  { value: "contrast", label: "Contrast" },
];

interface RailSlotInspectorProps {
  slot: RailSlot;
  pages: readonly RailPage[];
  widgets: readonly RailWidget[];
  onChange: (fn: (s: RailSlot) => RailSlot, key?: string) => void;
  onRemove: () => void;
  /** The profile chip, a rail setting and not a slot: it is shown or hidden (not removed), stays in Top and has no badge. */
  chip?: {
    shown: boolean;
    onShown: (on: boolean) => void;
    /** The profile's name: the chip's text until it has one of its own. */
    profileName: string;
  };
}

/**
 * A rail item's inspector (mockup 13): what it is (its page, action or widget, and its group), its icon (from the icon
 * set, an app, an image or text; shape, tint and label), what a tap, a hold and a double tap do, and its badge. The name is
 * the image's alt text and the button's name. An app's icon is read by the server from the program; a logo (the profile
 * with an image) has a plate, automatic unless set.
 */
export function RailSlotInspector({ slot, pages, widgets, onChange, onRemove, chip }: RailSlotInspectorProps) {
  const name = chip ? (slot.name ?? chip.profileName) : slotName(slot, pages);
  const t = slot.target;
  const choices = touchChoices(pages, useTouchSources());
  const icon = slot.icon;
  // "Image" picked: the slot keeps its icon until a file is chosen (an image with no file draws nothing)
  const [pending, setPending] = useState(false);
  const from = pending ? "image" : (icon?.from ?? (chip ? "default" : "set"));
  const key = (field: string) => `rail:${slot.id}:${field}`;
  const app = useAppIcon(icon, onChange, key("exe"));
  const logo = t.kind === "profile" && (icon?.from === "image" || icon?.from === "app");
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3">
        <h2 className="truncate text-title font-semibold text-ui-1">{name}</h2>
        <p className="text-caption text-ui-3">{chip ? "Rail item · the profile chip" : KIND_LINES[t.kind]}</p>
      </div>
      <PanelSection id="rail-item" title="Item" icon={LayoutPanelLeft}>
        <TextRow
          label={chip ? "Text" : "Name"}
          hint={chip ? "What the chip says under its icon, and what a screen reader says. Empty is the profile's name." : "What a screen reader says, and an image's alt text."}
          value={slot.name ?? ""}
          placeholder={chip ? chip.profileName : name}
          onChange={(v) => onChange((s) => (v ? { ...s, name: v } : (({ name: _n, ...rest }) => rest)(s)), key("name"))}
        />
        {!chip && <SelectRow label="Group" value={slot.group} onChange={(g) => onChange((s) => ({ ...s, group: g as RailGroup }))} options={RAIL_GROUP_NAMES.map(([value, label]) => ({ value, label }))} />}
        {t.kind === "page" && (
          <SelectRow label="Page" value={t.pageId} onChange={(pageId) => onChange((s) => ({ ...s, target: { kind: "page", pageId } }))} options={pages.map((p) => ({ value: p.id, label: p.name }))} />
        )}
        {t.kind === "action" && (
          <SelectRow
            label="Action"
            value={touchValue(t.action)}
            onChange={(v) => {
              const action = pickAction(choices, v, t.action);
              if (action) onChange((s) => ({ ...s, target: { kind: "action", action } }));
            }}
            options={actionOptions(choices, "Choose an action", t.action).slice(1)}
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
              if (v === "default") onChange(({ icon: _gone, ...s }) => s);
              else if (v !== "image") onChange((s) => ({ ...s, icon: iconFrom(v as "set" | "text" | "app", name, s.icon) }));
            }}
            options={[
              ...(chip ? [{ value: "default", label: "Colour mark" }] : []),
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
              {app.status.state === "error" ? (
                <div role="alert" className="flex items-center gap-2 text-caption text-ui-danger">
                  <span className="min-w-0 flex-1">{app.status.message}</span>
                  <Button small variant="ghost" onClick={app.retry}>
                    Try again
                  </Button>
                </div>
              ) : (
                <p className="text-caption text-ui-3" aria-live="polite">
                  {app.status.state === "reading" ? `Reading the icon of ${icon.exe.trim()}…` : icon.asset ? "The program's own icon, read from it on this computer." : "The program's file name, such as Chat.exe. Its icon is read from it on this computer; until then the rail shows a window."}
                </p>
              )}
            </>
          )}
          {from === "image" && (
            <>
              <MediaField
                label="Image"
                kind="image"
                svg
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
          {logo && (
            <>
              <SegmentedRow
                label="Plate"
                value={slot.plate ?? ""}
                onChange={(v) => onChange((s) => {
                  const { plate: _old, ...rest } = s;
                  return v ? { ...rest, plate: v as RailPlate } : rest;
                })}
                options={PLATES}
              />
              <p className="text-caption text-ui-3">What sits behind the logo. Auto picks one from the image: none for one that fills its square, the text colour for one that would fade into the rail.</p>
            </>
          )}
          <ToggleRow label="Tint with the theme colour" value={slot.tint === true} onChange={(on) => onChange((s) => ({ ...s, tint: on }))} />
          <ToggleRow label="Label under the icon" value={slot.label === true} onChange={(on) => onChange((s) => ({ ...s, label: on }))} />
        </PanelSection>
      )}
      <PanelSection id="rail-touch" title="Touch" icon={Hand}>
        <TouchRows
          touch={slot.touch}
          pages={pages}
          tapNone={chip ? "Open profiles" : "What the item is"}
          holdNone={chip ? "Open profiles" : undefined}
          onChange={(touch) =>
            onChange((s) => {
              const { touch: _old, ...rest } = s;
              return touch ? { ...rest, touch } : rest;
            })
          }
        />
      </PanelSection>
      {!chip && <PanelSection id="rail-badge" title="Badge" icon={Bell}>
        <SelectRow
          label="Show when"
          value={slot.badge?.when ?? ""}
          onChange={(v) => onChange((s) => {
            const { badge: _old, ...rest } = s;
            return v ? { ...rest, badge: { when: v as BadgeRule } } : rest;
          })}
          options={BADGES}
        />
      </PanelSection>}
      <div className="px-4 py-3">
        {chip ? (
          <ToggleRow label="Show the profile chip" value={chip.shown} onChange={chip.onShown} />
        ) : (
          <Button small variant="ghost" icon={<Trash2 />} onClick={onRemove}>
            Remove from the rail
          </Button>
        )}
      </div>
    </div>
  );
}
