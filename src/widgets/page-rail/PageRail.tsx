import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { AppWindow, Lock, RefreshCw } from "lucide-react";
import { RailHostContext, RailItemContext, type RailHost } from "@/components/rail-host";
import { pageIcon } from "@/components/studio/page-icons";
import { audio, EMPTY_AUDIO } from "@/lib/audio-control";
import { extras } from "@/lib/extras";
import type { Placement } from "@/lib/layout";
import type { PinnedEdge, RailPlate, RailSlot, TouchAction } from "@/lib/pinned";
import { actionOn, chipSeries, imageAlt, RAIL_SIZES, railBadge, railDense, railGroups, railSlots, slotAction, slotName, type BadgeState, type RailBadge, type RailPage } from "@/lib/rail";
import { createRecogniser, type GestureHandlers } from "@/lib/gesture";
import type { ModuleSettings } from "@/modules/types";
import Clock from "../clock/Clock";
import { Widget, shell, TONES, type ShellProps } from "../kit";
import { useLogoPlate } from "./logo-plate";
import { meta } from "./meta";
import { ProfilePicker } from "./ProfilePicker";
import { series } from "./series";

export { meta };

/*
 * The page rail (decision 8), as the `rail` and `custom-rail` fixtures draw it (src/dev/fixtures/pinned/rail.tsx): the
 * profile chip, the slots in their groups with a rule between groups, then the page lock and the Clock at its rail preset
 * at the foot. Colours are the Look's tokens: the page shown and a toggle that is on use `--w-accent` and `--w-crit`, a
 * badge the status tones, a set icon `--w-fg`, and a user image its own colours. Every target is at least 48 px (44 is the
 * floor). A tap, a hold and a double tap go through one recogniser (`src/lib/gesture.ts`).
 */

export interface PageRailProps extends ShellProps {
  look?: ModuleSettings;
  chip?: boolean;
  pageLock?: boolean;
  clock?: boolean;
}

const { roomy: ROOMY, dense: DENSE } = RAIL_SIZES;
const SizeCtx = createContext(ROOMY);

/** The rail's hairline: the track colour, the Look's quiet line. */
const EDGE = "var(--w-track)";
/** Keyboard focus: a ring in the accent, outside the target. */
const FOCUS = "focus-visible:[outline:2px_solid_var(--w-accent)] focus-visible:[outline-offset:2px]";


/** Without a screen around it (Widget QA, a preview), the rail draws the fixtures' Main profile. */
const SAMPLE_PAGES: RailPage[] = (
  [
    ["keys", "Keys", "zap"],
    ["agents", "Agents", "bot"],
    ["mixer", "Mixer", "sliders-horizontal"],
    ["status", "Status", "activity"],
    ["widgets", "Widgets", "layout-dashboard"],
  ] as const
).map(([id, name, icon]) => ({ id, name, icon }));
const SAMPLE_HOST: RailHost = { pages: SAMPLE_PAGES, current: "keys", profile: { id: "main", name: "Main", index: 0 }, lock: "auto", alerts: [], run: () => {} };
const SAMPLE_SLOTS: RailSlot[] = railSlots(undefined, SAMPLE_PAGES).map((s) => (s.id === "page:agents" ? { ...s, badge: { when: "agents-waiting" } } : s));

const useAgents = () => useSyncExternalStore(extras.subscribe, () => extras.getState().agents, () => extras.getState().agents);
const useObs = () => useSyncExternalStore(extras.subscribe, () => extras.getState().obs, () => extras.getState().obs);

/** The gestures of one target, from the recogniser: pointer events, a keyboard click and the raw-USB `tp-gesture`. */
function useGestures(handlers: GestureHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const rec = useMemo(() => createRecogniser(() => latest.current), []);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    const onRaw = (e: Event) => {
      const g = (e as CustomEvent<{ gesture: { type: string } }>).detail?.gesture;
      if (g) rec.gesture(g.type);
    };
    el?.addEventListener("tp-gesture", onRaw);
    return () => {
      el?.removeEventListener("tp-gesture", onRaw);
      rec.dispose();
    };
  }, [rec]);
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => rec.down(e.clientX, e.clientY),
    onPointerMove: (e: React.PointerEvent) => rec.move(e.clientX, e.clientY),
    onPointerUp: () => rec.up(),
    onPointerCancel: () => rec.cancel(),
    onPointerLeave: () => rec.cancel(),
    // a click the keyboard made (Enter, Space) is a tap; a pointer's click was the recogniser's
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) latest.current.tap?.();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

/** A slot's gestures: its touch map's, a tap doing what the slot is. */
const slotGestures = (slot: RailSlot, run: (a: TouchAction) => void): GestureHandlers =>
  Object.fromEntries((["tap", "hold", "doubleTap"] as const).flatMap((g) => {
    const action = slotAction(slot, g);
    return action ? [[g, () => run(action)]] : [];
  }));

/** A badge in its status tone: a dot, or a word on a tint of the tone (the widget's card shows through, on any Look). */
function Badge({ badge }: { badge: RailBadge }) {
  const color = TONES[badge.tone];
  if (!badge.text) return <span aria-hidden className="absolute right-1 top-1 h-3 w-3 rounded-full" style={{ background: color }} />;
  return (
    <span aria-hidden className="absolute -right-1 top-0 rounded px-1 text-[10px] font-bold leading-[14px] tracking-wide" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
      {badge.text}
    </span>
  );
}

/** An asset's URL (`ASSETS_URL` in src/lib/assets.ts, written out: importing it would split that module out of the studio's entry). */
const assetUrl = (id: string) => `/api/assets/${encodeURIComponent(id)}`;

/** A slot's glyph: a set icon (as page icons are), a user image or an app icon (their own colours unless tinted), or text. `alt`: a user image's alt text. */
function Glyph({ slot, name, alt = name, size }: { slot: RailSlot; name: string; alt?: string; size: number }) {
  const icon = slot.icon;
  if (!icon) return null;
  if (icon.from === "set") {
    const Cmp = pageIcon(icon.name);
    return Cmp ? <Cmp aria-hidden size={size * 0.5} strokeWidth={1.75} /> : null;
  }
  if (icon.from === "text") return <span className="text-[15px] font-bold">{icon.text}</span>;
  // an app whose icon could not be read (not running, not installed) shows a generic window
  if (icon.from === "app" && !icon.asset) return <AppWindow aria-hidden size={size * 0.5} strokeWidth={1.75} />;
  const src = assetUrl(icon.from === "app" ? icon.asset! : icon.asset);
  const radius = slot.shape === "circle" ? "9999px" : slot.shape === "rounded" ? "28%" : 0;
  const img: CSSProperties = { width: size * 0.72, height: size * 0.72, borderRadius: radius, objectFit: "cover" };
  // "Tint with theme": the image as a mask filled with the accent, the one colour Studio may add to a user image
  if (slot.tint) return <span role="img" aria-label={alt} style={{ ...img, background: "var(--w-accent)", mask: `url("${src}") center / contain no-repeat` }} />;
  return <img src={src} alt={alt} draggable={false} style={img} />;
}

interface SlotProps {
  slot: RailSlot;
  name: string;
  /** A user image's alt text: the name and what a tap does. */
  alt: string;
  active: boolean;
  edge: PinnedEdge;
  badge?: RailBadge;
  /** A toggle action's state (a mute: on = muted, in `--w-crit`). */
  on?: boolean;
  run: (a: TouchAction) => void;
}

function SlotButton({ slot, name, alt, active, edge, badge, on, run }: SlotProps) {
  const { slot: SLOT } = useContext(SizeCtx);
  const g = useGestures(slotGestures(slot, run));
  const lit = on === true;
  const image = slot.icon?.from === "image" || (slot.icon?.from === "app" && !!slot.icon.asset);
  // an untinted image names the button by its alt (the item's name); otherwise the label does
  const named = image && !slot.tint;
  return (
    <button
      type="button"
      {...g}
      data-rail-slot={slot.id}
      aria-current={active ? "page" : undefined}
      aria-pressed={on}
      aria-label={named ? undefined : `${name}${badge ? `, ${badge.say}` : ""}`}
      className={`relative flex shrink-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-xl transition-colors motion-safe:active:scale-[0.97] ${FOCUS}`}
      style={{
        width: SLOT + (slot.label ? 8 : 0),
        minHeight: SLOT,
        color: lit ? "var(--w-crit)" : active ? "var(--w-fg)" : "var(--w-muted)",
        background: lit ? "color-mix(in oklab, var(--w-crit) 14%, transparent)" : active ? "color-mix(in oklab, var(--w-fg) 9%, transparent)" : undefined,
        boxShadow: lit ? "inset 0 0 0 1px color-mix(in oklab, var(--w-crit) 45%, transparent)" : undefined,
      }}
    >
      <Glyph slot={slot} name={name} alt={alt} size={SLOT} />
      {slot.label && <span className="max-w-full truncate px-0.5 text-[11px] leading-none">{name}</span>}
      {badge && <Badge badge={badge} />}
      {named && badge && <span className="sr-only">{`, ${badge.say}`}</span>}
      {/* the page shown: a bar in the accent on the rail's outer edge */}
      {active && (edge === "left" || edge === "right") && <span aria-hidden className="absolute top-3 bottom-3 w-[3px] rounded-full" style={{ [edge]: -14, background: "var(--w-accent)" }} />}
    </button>
  );
}

/**
 * The profile chip: the profile's colour mark and its name. A tap or a hold opens the profile picker (P4); where the
 * screen has no picker (the studio, a preview, a kiosk whose link pins its profile) it is a label.
 */
function ProfileChip({ host }: { host: RailHost }) {
  const { top } = useContext(SizeCtx);
  const open = () => host.run({ op: "profile-picker" });
  const g = useGestures({ tap: open, hold: open });
  const picker = host.profiles;
  const face = (
    <>
      <span aria-hidden className="h-5 w-5 rounded-md" style={{ background: series(chipSeries(host.profile.index)) }} />
      <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-none">{host.profile.name}</span>
    </>
  );
  const style: CSSProperties = { width: 68, minHeight: top - 4, background: "color-mix(in oklab, var(--w-fg) 6%, transparent)", boxShadow: picker?.open ? "inset 0 0 0 2px var(--w-accent)" : `inset 0 0 0 1px ${EDGE}` };
  const box = "flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl py-2";
  if (!picker)
    return (
      <div role="img" aria-label={`Profile: ${host.profile.name}`} className={box} style={style}>
        {face}
      </div>
    );
  return (
    <button type="button" {...g} data-rail-slot="profile" aria-haspopup="dialog" aria-expanded={picker.open} aria-label={`Profile: ${host.profile.name}`} className={`${box} touch-manipulation select-none ${FOCUS}`} style={style}>
      {face}
    </button>
  );
}

/** A logo's plate: the card colour, the text colour (it keeps a light logo seen on a light Look), or none. */
const PLATES: Record<RailPlate, CSSProperties> = {
  none: {},
  card: { background: "color-mix(in oklab, var(--w-fg) 6%, transparent)", boxShadow: `inset 0 0 0 1px ${EDGE}` },
  contrast: { background: "var(--w-fg)", boxShadow: `inset 0 0 0 1px ${EDGE}` },
};

/**
 * The logo slot (a profile slot with an image): the user's image on its plate, the user's choice or one read from the
 * image (owner Q8). Its alt text is the item's name and what a tap does (owner Q10).
 */
function Logo({ slot, name, alt, run }: { slot: RailSlot; name: string; alt: string; run: (a: TouchAction) => void }) {
  const { top } = useContext(SizeCtx);
  const g = useGestures(slotGestures(slot, run));
  const icon = slot.icon;
  const src = icon?.from === "image" ? icon.asset : icon?.from === "app" ? icon.asset : undefined;
  const url = src ? assetUrl(src) : undefined;
  const plate = useLogoPlate(url, slot.plate, g.ref);
  return (
    <button
      type="button"
      {...g}
      data-rail-slot={slot.id}
      data-plate={plate}
      aria-label={url ? undefined : name}
      className={`flex shrink-0 touch-manipulation select-none items-center justify-center rounded-2xl ${FOCUS}`}
      style={{ width: top, height: top, color: "var(--w-fg)", ...PLATES[plate] }}
    >
      {url ? <img src={url} alt={alt} draggable={false} style={{ width: top * 0.65, height: top * 0.65 }} className="object-contain" /> : <Glyph slot={slot} name={name} size={top} />}
    </button>
  );
}

/**
 * The clock's text in the rail's own colours: a flat Clock would set the dark surface's (near white), which vanished on a
 * light Look (QUESTIONS P-B10). Its shell applies `style` last, so these take the rail's values.
 */
const RAIL_TEXT = { "--w-fg": "inherit", "--w-muted": "inherit", "--w-faint": "inherit", "--w-track": "inherit" } as CSSProperties;

const Rule = () => <span aria-hidden className="my-1 h-px w-10 shrink-0" style={{ background: EDGE }} />;

/** The page lock: Auto (pages rotate) or Locked (this page stays). A tap turns it. */
function PageLock({ lock, run }: { lock: "auto" | "locked"; run: (a: TouchAction) => void }) {
  const Cmp = lock === "auto" ? RefreshCw : Lock;
  const g = useGestures({ tap: () => run({ op: "lock" }) });
  return (
    <button
      type="button"
      {...g}
      aria-pressed={lock === "locked"}
      aria-label={lock === "auto" ? "Pages rotate. Tap to stay on this page" : "Stays on this page. Tap to rotate pages"}
      className={`flex h-12 w-[60px] shrink-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-xl ${FOCUS}`}
      style={{ color: "var(--w-muted)", boxShadow: `inset 0 0 0 1px ${EDGE}` }}
    >
      <Cmp aria-hidden size={18} strokeWidth={1.75} />
      <span className="text-[11px] leading-none">{lock === "auto" ? "Auto" : "Locked"}</span>
    </button>
  );
}

/** A widget in a slot (one with a rail preset): drawn by the screen as a kiosk zone, in a box of the slot's size. */
function SlotWidget({ id, module, settings, host, style }: { id: string; module: string; settings?: ModuleSettings; host: RailHost; style: CSSProperties }) {
  const placement: Placement = useMemo(() => ({ id, module, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { showHeader: false, ...settings } }), [id, module, settings]);
  return (
    <div data-rail-slot={id} className="relative shrink-0" style={style}>
      {host.zone?.(placement, { position: "absolute", inset: 0 })}
    </div>
  );
}

/** The audio state, read only while a slot shows a toggle (it opens the audio stream). */
function useToggleAudio(on: boolean) {
  const sub = useMemo(() => (on ? audio.subscribe : () => () => {}), [on]);
  return useSyncExternalStore(sub, audio.getState, audio.getState);
}

interface RailBodyProps {
  host: RailHost;
  slots: readonly RailSlot[];
  edge: PinnedEdge;
  dense: boolean;
  chip: boolean;
  pageLock: boolean;
  clock: boolean;
  data: ShellProps["data"];
  /** The rail's shell, for the profile picker's card. */
  look: ShellProps;
}

/** The rail's box on screen while the profile picker is open (it is drawn beside it). */
function useOpenRect(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => setRect(open ? (ref.current?.getBoundingClientRect() ?? null) : null), [open]);
  return { ref, rect };
}

function RailBody({ host, slots, edge, dense, chip, pageLock, clock, data, look }: RailBodyProps) {
  const size = dense ? DENSE : ROOMY;
  const { head, foot } = railGroups(slots);
  const badgeState: BadgeState = { agents: useAgents(), obs: useObs(), alerts: host.alerts, profile: host.profile.id };
  const toggles = slots.some((s) => s.target.kind === "action" && actionOn(s.target.action, EMPTY_AUDIO) !== undefined);
  const audioState = useToggleAudio(toggles);
  const picker = host.profiles;
  const { ref: navRef, rect } = useOpenRect(!!picker?.open);
  const one = (s: RailSlot): ReactNode => {
    const name = slotName(s, host.pages);
    const alt = imageAlt(s, name, host.pages);
    if (s.target.kind === "widget") return <SlotWidget key={s.id} id={s.id} module={s.target.module} settings={s.target.settings} host={host} style={{ width: 72, height: size.widget }} />;
    if (s.target.kind === "profile" && s.icon && s.icon.from !== "set" && s.icon.from !== "text") return <Logo key={s.id} slot={s} name={name} alt={alt} run={host.run} />;
    return (
      <SlotButton
        key={s.id}
        slot={s}
        name={name}
        alt={alt}
        edge={edge}
        active={s.target.kind === "page" && s.target.pageId === host.current}
        badge={railBadge(s, badgeState)}
        on={s.target.kind === "action" ? actionOn(s.target.action, audioState) : undefined}
        run={host.run}
      />
    );
  };
  return (
    <SizeCtx.Provider value={size}>
      {/* more slots than the rail's height holds scroll, the foot with them (the editor warns of it, owner Q9) */}
      <nav ref={navRef} aria-label="Pages and actions" className="flex h-full w-full flex-col items-center overflow-y-auto py-3 [scrollbar-width:none]" style={{ gap: size.gap }}>
        {chip && <ProfileChip host={host} />}
        {head.map((group, i) => (
          <div key={group[0].group} className="contents">
            {(i > 0 || chip) && <Rule />}
            {group.map(one)}
          </div>
        ))}
        <div className="flex-1" />
        {foot.map(one)}
        {pageLock && host.lock && <PageLock lock={host.lock} run={host.run} />}
        {/* the Clock at its rail preset (Clock's presets.ts `rail`): the time over the short date, flat on the rail */}
        {clock && (
          <div data-rail-slot="clock" className="relative shrink-0" style={{ width: 72, height: 44 }}>
            <Clock data={data} face="stacked" showSeconds={false} format="24h" surface="flat" radius={0} style={RAIL_TEXT} />
          </div>
        )}
      </nav>
      {picker?.open && rect && <ProfilePicker profiles={picker} current={host.profile.id} edge={edge} rail={rect} look={look} host={navRef.current?.closest("main") ?? document.body} />}
    </SizeCtx.Provider>
  );
}

/** The rail widget: its slots in the template shell, edge to edge. */
export default function PageRail(p: PageRailProps) {
  const host = useContext(RailHostContext);
  const item = useContext(RailItemContext);
  const slots = useMemo(() => (host ? railSlots(item?.slots, host.pages) : SAMPLE_SLOTS), [host, item?.slots]);
  return (
    <Widget {...shell(p)} showHeader={false} bleed design={null}>
      {({ outerH }) => <RailBody host={host ?? SAMPLE_HOST} slots={slots} edge={item?.edge ?? "left"} dense={railDense(outerH)} chip={p.chip !== false} pageLock={p.pageLock !== false} clock={p.clock !== false} data={p.data} look={p} />}
    </Widget>
  );
}
