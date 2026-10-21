import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { DeviceChecklist } from "@/components/ui/device-checklist";
import { COMMON_LOCALES, resolveGeneral, type GeneralSettings, type MotionChoice } from "@/lib/general";
import type { PageRotate, ProfilePage } from "@/lib/layout";
import type { PerformanceOverride } from "@/lib/performance";
import { cn } from "@/lib/utils";
import { trackPointer } from "../pointer-drag";
import { FIELD, InlineRow, SegmentedRow, SelectRow, StackRow, ToggleRow } from "../setting-rows";
import {
  FPS_OPTIONS,
  MOTION_OPTIONS,
  ROTATE_DEFAULT_SECONDS,
  ROTATE_MAX_SECONDS,
  ROTATE_MIN_SECONDS,
  ROTATE_PRESETS,
  clampSeconds,
  dropRow,
  rotatePreset,
} from "./behaviour-model";
import { ScopeNote } from "./profile-look";
import type { LookScope } from "./profile-scope";

/** Dashboard › Behaviour: pages, performance, clock and date, display. */

const HELP = "text-pretty text-[11px] leading-snug text-ui-5";

/** A page-order drag in flight: the page and the row it would land on. */
interface Drag {
  id: string;
  to: number;
}

/** The profile's pages as rows: a handle to drag them into order, their index and name, and delete. */
function PageList({
  pages,
  onMove,
  onAdd,
  onDelete,
}: {
  pages: ProfilePage[];
  onMove: (id: string, toIndex: number) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const stop = useRef<() => void>(undefined);
  const [drag, setDrag] = useState<Drag | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const start = (e: React.PointerEvent, from: number) => {
    e.preventDefault();
    // The rows as they sit now: the rows move while dragging, the drop math keeps to these.
    const rects = rows.current.map((el) => el?.getBoundingClientRect() ?? new DOMRect());
    const id = pages[from].id;
    let to = from;
    setDrag({ id, to });
    stop.current = trackPointer(
      (ev) => {
        to = dropRow(rects, from, ev.clientY);
        setDrag({ id, to });
      },
      (cancelled) => {
        setDrag(null);
        if (!cancelled && to !== from) onMove(id, to);
      }
    );
  };
  // While dragging, the page shows where it would land.
  const shown = drag
    ? (() => {
        const rest = pages.filter((p) => p.id !== drag.id);
        const moved = pages.find((p) => p.id === drag.id);
        return moved ? [...rest.slice(0, drag.to), moved, ...rest.slice(drag.to)] : pages;
      })()
    : pages;
  return (
    <div className="space-y-1">
      <ul className="flex flex-col gap-0.5">
        {shown.map((page, i) => (
          <li
            key={page.id}
            ref={(el) => {
              rows.current[pages.findIndex((p) => p.id === page.id)] = el;
            }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-1 text-[12.5px]",
              drag?.id === page.id ? "border-ui-accent bg-ui-raised text-ui-1" : "border-transparent text-ui-2 hover:bg-ui-hover"
            )}
          >
            <button
              type="button"
              aria-label={`Drag ${page.name} to reorder`}
              title="Drag to reorder"
              onPointerDown={(e) => start(e, pages.findIndex((p) => p.id === page.id))}
              className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ui-5 hover:text-ui-2 active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span className="w-4 shrink-0 text-right font-ui-mono text-[10.5px] text-ui-5">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{page.name}</span>
            {pages.length > 1 && (
              <button
                type="button"
                aria-label={`Delete ${page.name}`}
                title="Delete page"
                onClick={() => onDelete(page.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ui-4 hover:bg-ui-danger/15 hover:text-ui-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ui-3 hover:bg-ui-hover hover:text-ui-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add page
      </button>
    </div>
  );
}

/** Seconds between pages: a draft that commits on Enter or blur, clamped to 3–3600. */
function SecondsInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = clampSeconds(draft);
    if (n === null) return setDraft(String(value));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      min={ROTATE_MIN_SECONDS}
      max={ROTATE_MAX_SECONDS}
      step={1}
      value={draft}
      aria-label="Seconds per page"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(FIELD, "h-[26px] w-[64px] shrink-0 px-1.5 text-right font-ui-mono text-[11.5px]")}
    />
  );
}

/**
 * Pages: reorder, add and delete them; cycle through them on the kiosk (the interval, which
 * pages); and the kiosk's page dots and swipe, which every profile shares.
 */
export function PagesBody({
  pages,
  rotate,
  onMove,
  onAdd,
  onDelete,
  onRotate,
  pageNav,
  onPageNav,
}: {
  pages: ProfilePage[];
  rotate: PageRotate | undefined;
  onMove: (id: string, toIndex: number) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRotate: (patch: Partial<PageRotate>) => void;
  pageNav: boolean;
  onPageNav: (on: boolean) => void;
}) {
  const seconds = rotate?.seconds ?? ROTATE_DEFAULT_SECONDS;
  const ticked = (rotate?.pages ?? []).filter((id) => pages.some((p) => p.id === id));
  return (
    <div className="space-y-3">
      <PageList pages={pages} onMove={onMove} onAdd={onAdd} onDelete={onDelete} />
      <ToggleRow
        label="Cycle through pages"
        hint="Step through the profile's pages on the kiosk, in the order above"
        value={rotate?.enabled ?? false}
        onChange={(enabled) => onRotate({ enabled })}
      />
      {rotate?.enabled && (
        <>
          <SegmentedRow
            label="Switch every"
            options={ROTATE_PRESETS}
            value={rotatePreset(seconds)}
            onChange={(v) => onRotate({ seconds: Number(v) })}
          />
          <InlineRow label="Seconds" hint="3 to 3600">
            <SecondsInput value={seconds} onCommit={(s) => onRotate({ seconds: s })} />
          </InlineRow>
          {pages.length > 1 && (
            <StackRow label="Pages" hint="None ticked cycles through every page">
              <DeviceChecklist
                label="Pages to cycle"
                devices={pages.map((p) => ({ id: p.id, label: p.name }))}
                value={ticked}
                onChange={(ids) => onRotate({ pages: ids.length > 0 ? ids : undefined })}
              />
            </StackRow>
          )}
          <p className={HELP}>A touch or a remote page switch pauses it for 30 s.</p>
        </>
      )}
      <ToggleRow
        label="Page dots and swipe"
        hint="In the kiosk: tap a dot or swipe to switch pages; long-press the dots to pause or resume cycling"
        value={pageNav}
        onChange={onPageNav}
      />
      <p className={HELP}>Applies to all profiles.</p>
    </div>
  );
}

/** Frame rate limit and Animations: the dashboard's, or this profile's own. */
export function PerformanceBody({
  scope,
  count,
  name,
  general,
  performance,
  onGeneral,
  onPerformance,
}: {
  scope: LookScope;
  count: number;
  name: string;
  general: GeneralSettings | undefined;
  /** This profile's override (read while the scope is This profile). */
  performance: PerformanceOverride | undefined;
  onGeneral: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
  onPerformance: (patch: PerformanceOverride) => void;
}) {
  const shared = resolveGeneral({ general });
  const all = scope === "all";
  const fps = all ? shared.maxFps : (performance?.maxFps ?? shared.maxFps);
  const motion = all ? shared.motion : (performance?.motion ?? shared.motion);
  return (
    <div className="space-y-3">
      <ScopeNote scope={scope} count={count} name={name} />
      <SegmentedRow
        label="Frame rate limit"
        hint="Lower uses less CPU and GPU. The most frames a second animations redraw (gradients, meters, smooth graphs); the kiosk URL's &fps= overrides it."
        options={FPS_OPTIONS}
        value={String(fps)}
        onChange={(v) => (all ? onGeneral("maxFps", v === "60" ? undefined : Number(v)) : onPerformance({ maxFps: Number(v) }))}
      />
      <SegmentedRow
        label="Animations"
        hint="Reduced disables animations: a background video shows its poster, meters and waveforms are calm, gradients and the clock colon hold still. Follow system uses the operating system's setting."
        options={MOTION_OPTIONS}
        value={motion}
        onChange={(v) => (all ? onGeneral("motion", v === "system" ? undefined : (v as MotionChoice)) : onPerformance({ motion: v as MotionChoice }))}
      />
    </div>
  );
}

const CLOCKS = [
  { value: "auto", label: "Locale" },
  { value: "24", label: "24 h" },
  { value: "12", label: "12 h" },
];

/** The locale options: System, the common locales, and a saved one not among them. */
function localeOptions(current: string): { value: string; label: string }[] {
  const known = current === "" || COMMON_LOCALES.some((l) => l.value === current);
  return [
    { value: "", label: "System" },
    ...COMMON_LOCALES.map((l) => ({ value: l.value, label: `${l.label} · ${l.value}` })),
    ...(known ? [] : [{ value: current, label: current }]),
  ];
}

/** Clock and date: how every clock and date reads, on every profile. */
export function ClockBody({
  general,
  hours,
  onHours,
  onGeneral,
}: {
  general: GeneralSettings | undefined;
  /** The all-profiles style's `clock` (auto | 24 | 12); undefined = Locale. */
  hours: string | undefined;
  onHours: (value: string | undefined) => void;
  onGeneral: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
}) {
  const g = resolveGeneral({ general });
  return (
    <div className="space-y-3">
      <SegmentedRow
        label="Clock"
        hint="Locale follows the date & time locale below. Every clock that follows the theme's Units & format reads it."
        options={CLOCKS}
        value={hours === "12" || hours === "24" ? hours : "auto"}
        onChange={(v) => onHours(v === "auto" ? undefined : v)}
      />
      <ToggleRow label="Show seconds" value={g.showSeconds} onChange={(v) => onGeneral("showSeconds", v ? undefined : false)} />
      <SelectRow
        label="Date locale"
        hint="For the Clock widget: the date's order and names follow the locale, and so does the clock when it is set to Locale."
        options={localeOptions(g.locale)}
        value={g.locale}
        onChange={(v) => onGeneral("locale", v === "" ? undefined : v)}
      />
      <p className={HELP}>Applies to all profiles.</p>
    </div>
  );
}

/** Display: the kiosk's mouse cursor. */
export function DisplayBody({ hideCursor, onHideCursor }: { hideCursor: boolean; onHideCursor: (on: boolean) => void }) {
  return (
    <div className="space-y-3">
      <ToggleRow label="Hide cursor in kiosk mode" value={hideCursor} onChange={onHideCursor} />
      <p className={HELP}>Applies to all profiles.</p>
    </div>
  );
}
