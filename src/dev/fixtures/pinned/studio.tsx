import type { ReactNode } from "react";
import { ChevronRight, GripVertical, Hand, Pin, Plus, ScanLine } from "lucide-react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SettingRow } from "@/components/ui/setting-row";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { HOLD_MS } from "./hold";
import type { RailSlot } from "./rail";
import { customRail, railPinned, SCENES } from "./states";
import { PanelStage, useFixtureLook } from "./stage";

/*
 * The two studio states (design only; P3 builds them): Edit's Page / Pinned toggle with the pinned layer's list and pin
 * settings (mockup 08), and the rail editor (mockup 13). They wear the Studio chrome (`ui-*` tokens, the chrome primitives:
 * Segmented, Toggle, Button, SettingRow, StatusChip); blue is the studio's selection colour, never the panel's. The panel in the
 * canvas is the same stage the panel fixtures draw, on the fixture's Look.
 *
 * The touch rows' hints are taken from Tessera Deck's editor (host/editor/app.js, `hints`, commit efca233, MIT,
 * Copyright (c) 2026 catorendal-a11y; licences/tessera-deck-MIT.txt), reworded from a key to a rail item.
 */

const NOOP = () => {};
const SHOT_W = 1440;
const SHOT_H = 900;

function TopBar({ crumbs, children }: { crumbs: string[]; children: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-edge px-4">
      <ScanLine aria-hidden size={18} className="text-ui-3" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-body">
        {crumbs.map((c, i) => (
          <span key={c} className={cn("flex items-center gap-1.5", i === crumbs.length - 1 ? "font-medium text-ui-1" : "text-ui-3")}>
            {i > 0 && <span aria-hidden className="text-ui-4">/</span>}
            {c}
          </span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}

const Section = ({ title, count, children }: { title: ReactNode; count?: number; children: ReactNode }) => (
  <section className="border-b border-ui-edge px-4 py-3">
    <h2 className="mb-2 flex items-center gap-2 text-body font-semibold text-ui-1">
      {title}
      {count !== undefined && <span className="ml-auto text-caption font-normal text-ui-3">{count}</span>}
    </h2>
    {children}
  </section>
);

/** A layer row: name and its line under it; selected rows wear the studio's blue. */
function LayerRow({ name, line, selected, muted }: { name: string; line: string; selected?: boolean; muted?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} className={cn("block w-full rounded-ui-md px-3 py-2 text-left", FOCUS_RING, selected ? "bg-ui-blue-bg outline outline-1 outline-ui-accent" : "hover:bg-ui-hover", muted && "text-ui-3")}>
      <span className="block text-body">{name}</span>
      <span className="block text-caption text-ui-3">{line}</span>
    </button>
  );
}

/** A touch row: the gesture, what it does, and the hint under it. */
function TouchRow({ gesture, action, hint, open }: { gesture: string; action: ReactNode; hint?: string; open?: boolean }) {
  return (
    <div className="mb-2">
      <button type="button" aria-expanded={open} className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body", FOCUS_RING)}>
        <span className="text-ui-3">{gesture}</span>
        <span className="flex items-center gap-1 text-ui-1">
          {action}
          <ChevronRight aria-hidden size={14} />
        </span>
      </button>
      {hint && <p className="mt-1 px-1 text-caption text-ui-3">{hint}</p>}
    </div>
  );
}

/** The panel at `scale`, its pinned items and page as the panel draws them; `rail`: draw the selection on the rail. */
function Preview({ w, h, scale, rail }: { w: number; h: number; scale: number; rail?: boolean }) {
  const scene = SCENES.keys(w, h);
  return (
    <div className="relative shrink-0" style={{ width: w * scale, height: h * scale }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        <PanelStage w={w} h={h} pinned={scene.pinned} label="Main profile, Keys page, in the canvas">
          {scene.page}
        </PanelStage>
      </div>
      {rail && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 rounded-3 outline outline-2 outline-ui-accent" style={{ width: 84 * scale }} />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 rounded-3 outline outline-1 outline-dashed outline-ui-default" style={{ left: 84 * scale + 2, right: 0 }} />
        </>
      )}
    </div>
  );
}

/** Schematic page thumbnails (the real ones are `usePageThumb`'s), with the rail drawn over them when the box is ticked. */
function Thumbs({ pages, active }: { pages: string[]; active: string }) {
  return (
    <div className="flex gap-3">
      {pages.map((p) => (
        <button key={p} type="button" aria-pressed={p === active} className={cn("flex flex-col gap-1.5 rounded-ui-md text-left", FOCUS_RING)}>
          <span aria-hidden className={cn("flex overflow-hidden rounded-ui-md border bg-ui-chrome p-1", p === active ? "border-ui-blue" : "border-ui-edge")} style={{ width: 150, height: 86 }}>
            <span className="mr-1 rounded-2 bg-ui-control" style={{ width: 12 }} />
            <span className="grid flex-1 grid-cols-4 gap-1" style={{ gridTemplateRows: "1fr 1fr" }}>
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="rounded-2 bg-ui-tile" />
              ))}
            </span>
          </span>
          <span className={cn("text-caption", p === active ? "text-ui-1" : "text-ui-3")}>{p}</span>
        </button>
      ))}
    </div>
  );
}

/** Edit with Pinned on (mockup 08): the pinned layer's items, the canvas with the rail selected, its pin and rail settings. */
export function EditorScreen({ w, h }: { w: number; h: number }) {
  const scale = Math.min(820 / w, 460 / h);
  return (
    <div className="studio-root flex flex-col overflow-hidden bg-ui-app font-ui text-ui-1" style={{ width: SHOT_W, height: SHOT_H }}>
      <TopBar crumbs={["Screens", `Touch panel ${w}×${h}`, "Main profile"]}>
        <Segmented
          size="bar"
          label="Edit the page or the pinned layer"
          value="pinned"
          onChange={NOOP}
          options={[
            { value: "page", label: "Page" },
            { value: "pinned", label: (<span className="flex items-center gap-1.5"><Pin aria-hidden size={14} />Pinned</span>) },
          ]}
        />
        <Button>Test mode</Button>
        <Button variant="primary">Send to panel</Button>
      </TopBar>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Layers" className="w-65 shrink-0 overflow-auto border-r border-ui-edge">
          <Section title={<><Pin aria-hidden size={14} />Pinned layer</>} count={2}>
            <LayerRow name="Page rail" line="Left edge · all pages" selected />
            <LayerRow name="Now playing bar" line="Bottom · Status, Widgets" />
            {/* decision 1: the agent prompt is the Island's, shown here for reference and not stored in the layer */}
            <LayerRow name="Agent prompt" line="From the Island · while an agent waits" muted />
          </Section>
          <Section title="Page · Keys" count={4}>
            {["Keys", "Now Playing", "Timer", "Keys"].map((n, i) => (
              <p key={i} className="px-3 py-1.5 text-body text-ui-3">
                {n}
              </p>
            ))}
          </Section>
        </aside>
        <main aria-label="Canvas" className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6">
          <div className="flex gap-2 text-caption">
            <span className="inline-flex h-6 items-center rounded-ui-sm border border-ui-blue bg-ui-blue-bg px-2 text-ui-blue-text">Page rail · pinned left</span>
            <span className="inline-flex h-6 items-center rounded-ui-sm border border-dashed border-ui-strong px-2 text-ui-3">{`Page area · Keys · ${w - 84}×${h} after pins`}</span>
          </div>
          <Preview w={w} h={h} scale={scale} rail />
          <div className="mt-2 flex items-center justify-between">
            <h2 className="text-body font-semibold">Pages in Main</h2>
            <label className="flex items-center gap-2 text-body text-ui-2">
              <Toggle checked onChange={NOOP} label="Show the pinned layer on thumbnails" />
              Show the pinned layer on thumbnails
            </label>
          </div>
          <Thumbs pages={["Keys", "Agents", "Mixer", "Status", "Widgets"]} active="Keys" />
        </main>
        <aside aria-label="Inspector" className="w-80 shrink-0 overflow-auto border-l border-ui-edge">
          <div className="px-4 py-3">
            <h2 className="text-title font-semibold">Page rail</h2>
            <p className="text-caption text-ui-3">Navigation widget · 84 px wide</p>
          </div>
          <Section title="Pin">
            <p className="mb-1 text-caption text-ui-3">Show on</p>
            <Segmented value="all" onChange={NOOP} label="Show on" options={[{ value: "this", label: "This page" }, { value: "some", label: "Some pages" }, { value: "all", label: "All pages" }]} />
            <p className="mb-1 mt-3 text-caption text-ui-3">Edge</p>
            <Segmented value="left" onChange={NOOP} label="Edge" options={["Left", "Right", "Top", "Bottom"].map((e) => ({ value: e.toLowerCase(), label: e }))} />
            <p className="mb-1 mt-3 text-caption text-ui-3">Page content</p>
            <Segmented value="room" onChange={NOOP} label="Page content" options={[{ value: "room", label: "Make room" }, { value: "float", label: "Float on top" }]} />
            <p className="mt-1 text-caption text-ui-3">Pages lay out in the space the rail leaves.</p>
            <SettingRow label="Hide on this page">
              <Toggle checked={false} onChange={NOOP} label="Hide on this page" />
            </SettingRow>
            <Button small className="mt-1">Use on every profile of this size</Button>
          </Section>
          <Section title="Rail">
            {["Profile chip", "Page lock", "Clock", "Badge pages that need you"].map((l) => (
              <SettingRow key={l} label={l}>
                <Toggle checked onChange={NOOP} label={l} />
              </SettingRow>
            ))}
            <Button small className="mt-1">Edit rail items</Button>
          </Section>
          <Section title="Touch">
            <TouchRow gesture="Tap a page icon" action="Open page" />
            <TouchRow gesture="Tap the profile chip" action="Profile picker" />
            <TouchRow gesture="Hold the profile chip" action="Lock profile" />
            <TouchRow gesture="Swipe on the page" action="Next or previous page" />
          </Section>
        </aside>
      </div>
    </div>
  );
}

/** What a rail item is, for its row: a page, an action or a widget, and where its icon comes from. */
const SOURCE: Record<string, string> = { set: "Icon set", image: "Image", app: "App icon", text: "Text" };

function ItemRow({ slot, line, selected }: { slot: RailSlot; line: string; selected?: boolean }) {
  const src = slot.target.kind === "widget" ? "Recipe" : SOURCE[slot.icon?.from ?? "set"];
  return (
    <li className={cn("flex items-center gap-3 rounded-ui-md border px-3", selected ? "border-ui-blue bg-ui-blue-bg" : "border-ui-edge bg-ui-raised")} style={{ minHeight: 56 }}>
      <GripVertical aria-hidden size={16} className="text-ui-4" />
      <span className="min-w-0 flex-1">
        <span className="block text-body">{slot.name}</span>
        <span className="block truncate text-caption text-ui-3">{line}</span>
      </span>
      <StatusChip tone="neutral" dot={false}>{src}</StatusChip>
    </li>
  );
}

const LINES: Record<string, string> = {
  logo: "Tap: profile picker · Hold: lock profile",
  "p-mine": "Opens page",
  "p-stream": "Opens page · LIVE badge while OBS streams",
  "p-home": "Opens page",
  "a-chat": "Opens Chat.exe",
  "a-mic": "Mic toggle · follows Windows",
  "w-cpu": "Your recipe · one value, ring",
};

/** The actions a touch gesture can run, as the Hold row's open list shows them; the two behind a switch are marked off. */
const ACTIONS: { name: string; group: string; off?: string; hold?: boolean }[] = [
  { name: "Open page", group: "Panel" },
  { name: "Mute or unmute the mic", group: "Audio" },
  { name: "Switch OBS scene", group: "OBS" },
  { name: "Go live / stop (OBS)", group: "OBS", off: "Off until you turn it on in Settings", hold: true },
  { name: "Run a command", group: "Computer", off: "Off until you turn on actions in Settings", hold: true },
];

function ActionList() {
  return (
    <div role="listbox" aria-label="Hold action" className="mb-2 overflow-hidden rounded-ui-md border border-ui-menu bg-ui-raised shadow-ui-menu">
      {ACTIONS.map((a) => (
        <div key={a.name} role="option" aria-selected={a.name === "Go live / stop (OBS)"} aria-disabled={!!a.off} className={cn("flex min-h-9 items-center gap-2 px-3 py-1", a.name === "Go live / stop (OBS)" && "bg-ui-hover")}>
          <span className="min-w-0 flex-1">
            <span className={cn("block text-body", a.off ? "text-ui-3" : "text-ui-1")}>{a.name}</span>
            {a.off && <span className="block text-caption text-ui-3">{a.off}</span>}
          </span>
          {a.hold && (
            <span className="flex items-center gap-1 text-caption text-ui-3">
              <Hand aria-hidden size={12} />
              Hold {HOLD_MS / 1000} s
            </span>
          )}
          <StatusChip tone={a.off ? "warn" : "neutral"} dot={!!a.off} className="shrink-0">{a.off ? "Off" : a.group}</StatusChip>
        </div>
      ))}
    </div>
  );
}

/** The rail editor (mockup 13): the preview, the items by group, and the selected item's icon, shape, touch and badge. */
export function RailEditorScreen({ h }: { h: number }) {
  const rail = customRail("stream");
  const { look } = useFixtureLook();
  const groups = [
    ["Top", rail.slots.filter((s) => s.group === "top")],
    ["Pages", rail.slots.filter((s) => s.group === "pages")],
    ["Actions", rail.slots.filter((s) => s.group === "actions")],
    ["Widgets", rail.slots.filter((s) => s.group === "widgets")],
  ] as const;
  const stream = rail.slots.find((s) => s.id === "p-stream")!;
  return (
    <div className="studio-root flex flex-col overflow-hidden bg-ui-app font-ui text-ui-1" style={{ width: SHOT_W, height: SHOT_H }}>
      <TopBar crumbs={["Screens", "Touch panel 1024×600", "Studio profile", "Page rail"]}>
        <Button>Save as preset</Button>
        <Button variant="primary">Send to panel</Button>
      </TopBar>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Preview" style={{ width: 180 }} className="flex shrink-0 flex-col items-center gap-2 overflow-hidden border-r border-ui-edge py-4">
          <p className="text-caption text-ui-3">{`Preview · 84 × ${h}`}</p>
          <div className="origin-top" style={{ transform: `scale(${Math.min(1, 700 / h)})` }}>
            <PanelStage w={84} h={h} pinned={[railPinned(rail)]} label="The rail as the panel draws it">
              {null}
            </PanelStage>
          </div>
          <p className="px-4 text-center text-caption text-ui-3">Tap an item in the preview to select it</p>
        </aside>
        <main aria-label="Rail items" className="min-w-0 flex-1 overflow-auto px-8 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-title font-semibold">Rail items</h1>
              <p className="text-body text-ui-3">Drag to reorder. Each item is a page, an action or one of your widgets.</p>
            </div>
            <Button icon={<Plus />}>Add item</Button>
          </div>
          {groups.map(([title, slots]) => (
            <section key={title} className="mt-4">
              <h2 className="mb-1.5 text-caption font-semibold text-ui-3">{title}</h2>
              <ul className="flex flex-col gap-1.5">
                {slots.map((s) => (
                  <ItemRow key={s.id} slot={s} line={LINES[s.id] ?? ""} selected={s.id === "p-stream"} />
                ))}
              </ul>
            </section>
          ))}
          <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-ui-md border border-ui-edge bg-ui-raised px-4 py-3">
            <h2 className="text-body font-semibold">Rail look</h2>
            <span className="text-body text-ui-3">
              Colours <span className="text-ui-1">{`Follow the Look · ${look.name}`}</span>
            </span>
            <span className="text-body text-ui-3">
              Width <span className="text-ui-1">84 px · icons</span>
            </span>
            <Button small>Use on every profile of this size</Button>
          </section>
        </main>
        <aside aria-label="Inspector" className="w-90 shrink-0 overflow-auto border-l border-ui-edge">
          <div className="px-4 py-3">
            <h2 className="text-title font-semibold">{stream.name}</h2>
            <p className="text-caption text-ui-3">Rail item · opens a page</p>
          </div>
          <Section title="Icon">
            <Segmented value="image" onChange={NOOP} label="Icon from" options={[{ value: "set", label: "Icon set" }, { value: "app", label: "App" }, { value: "image", label: "Image" }, { value: "text", label: "Text" }]} />
            <div className="mt-3 flex items-center gap-3 rounded-ui-md border border-dashed border-ui-strong p-3">
              <img src={stream.icon?.from === "image" ? stream.icon.src : ""} alt={stream.name} className="h-14 w-14 rounded-full" />
              <div className="min-w-0">
                <p className="text-body">stream-logo.svg</p>
                <p className="text-caption text-ui-3">Vector · shown at 40 px</p>
                <div className="mt-1.5 flex gap-1.5">
                  <Button small>Replace</Button>
                  <Button small>Crop</Button>
                </div>
              </div>
            </div>
            <p className="mt-1.5 text-caption text-ui-3">PNG, SVG, WebP or GIF. Drop a file here, or paste. Its name is the alt text.</p>
            <p className="mb-1 mt-3 text-caption text-ui-3">Shape</p>
            <Segmented value="circle" onChange={NOOP} label="Shape" options={[{ value: "as-is", label: "As is" }, { value: "rounded", label: "Rounded" }, { value: "circle", label: "Circle" }]} />
            <SettingRow label="Tint with the theme colour">
              <Toggle checked={false} onChange={NOOP} label="Tint with the theme colour" />
            </SettingRow>
            <SettingRow label="Label under the icon">
              <Toggle checked={false} onChange={NOOP} label="Label under the icon" />
            </SettingRow>
          </Section>
          <Section title="Touch">
            <TouchRow gesture="Tap" action="Open page: Stream" hint="Runs when you tap the item." />
            <TouchRow gesture="Hold" action="Go live / stop (OBS)" hint="Runs when you hold the item for about half a second instead of the tap." open />
            <ActionList />
            <TouchRow gesture="Double tap" action="Nothing" hint="Runs when you tap twice quickly. An item with a double tap waits a moment before its tap runs." />
          </Section>
          <Section title="Badge">
            <TouchRow gesture="Show when" action="OBS is streaming → LIVE" />
          </Section>
        </aside>
      </div>
    </div>
  );
}
