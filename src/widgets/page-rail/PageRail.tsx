import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { AppWindow, Lock, RefreshCw } from "lucide-react";
import { RailHostContext, RailItemContext, type RailHost } from "@/components/rail-host";
import { pageIcon } from "@/components/studio/page-icons";
import { audio, EMPTY_AUDIO } from "@/lib/audio-control";
import { extras } from "@/lib/extras";
import type { Placement } from "@/lib/layout";
import type { PinnedEdge, RailSlot, TouchAction } from "@/lib/pinned";
import { actionOn, chipSeries, railBadge, railDense, railGroups, railSlots, slotAction, slotName, type BadgeState, type RailBadge, type RailPage } from "@/lib/rail";
import { createRecogniser, type GestureHandlers } from "@/lib/gesture";
import type { ModuleSettings } from "@/modules/types";
import Clock from "../clock/Clock";
import { Widget, shell, hue, TONES, type ShellProps } from "../kit";
import { meta } from "./meta";

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

/** The roomy sizes from 580 px of height, else dense (a 550 px bar): a slot never goes under 48. */
const ROOMY = { slot: 56, top: 68, widget: 76, gap: 6 };
const DENSE = { slot: 48, top: 56, widget: 64, gap: 4 };
const SizeCtx = createContext(ROOMY);

/** The rail's hairline: the track colour, the Look's quiet line. */
const EDGE = "var(--w-track)";
/** The Look's series colour `n` (1–6), as `hue()` turns the accent for a second series. */
const SERIES_TURNS = [0, 60, 200, 290, 140, 30];
const series = (n: number) => hue(SERIES_TURNS[(n - 1) % SERIES_TURNS.length]);
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

/** A slot's glyph: a set icon (as page icons are), a user image or an app icon (their own colours unless tinted), or text. */
function Glyph({ slot, name, size }: { slot: RailSlot; name: string; size: number }) {
  const icon = slot.icon;
  if (!icon) return null;
  if (icon.from === "set") {
    const Cmp = pageIcon(icon.name);
    return Cmp ? <Cmp aria-hidden size={size * 0.5} strokeWidth={1.75} /> : null;
  }
  if (icon.from === "text") return <span className="text-[15px] font-bold">{icon.text}</span>;
  // an app's icon is extracted with P5; until then (or with none) a generic window
  if (icon.from === "app" && !icon.asset) return <AppWindow aria-hidden size={size * 0.5} strokeWidth={1.75} />;
  const src = assetUrl(icon.from === "app" ? icon.asset! : icon.asset);
  const radius = slot.shape === "circle" ? "9999px" : slot.shape === "rounded" ? "28%" : 0;
  const img: CSSProperties = { width: size * 0.72, height: size * 0.72, borderRadius: radius, objectFit: "cover" };
  // "Tint with theme": the image as a mask filled with the accent, the one colour Studio may add to a user image
  if (slot.tint) return <span role="img" aria-label={name} style={{ ...img, background: "var(--w-accent)", mask: `url("${src}") center / contain no-repeat` }} />;
  return <img src={src} alt={name} draggable={false} style={img} />;
}

interface SlotProps {
  slot: RailSlot;
  name: string;
  active: boolean;
  edge: PinnedEdge;
  badge?: RailBadge;
  /** A toggle action's state (a mute: on = muted, in `--w-crit`). */
  on?: boolean;
  run: (a: TouchAction) => void;
}

function SlotButton({ slot, name, active, edge, badge, on, run }: SlotProps) {
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
      <Glyph slot={slot} name={name} size={SLOT} />
      {slot.label && <span className="max-w-full truncate px-0.5 text-[11px] leading-none">{name}</span>}
      {badge && <Badge badge={badge} />}
      {named && badge && <span className="sr-only">{`, ${badge.say}`}</span>}
      {/* the page shown: a bar in the accent on the rail's outer edge */}
      {active && (edge === "left" || edge === "right") && <span aria-hidden className="absolute top-3 bottom-3 w-[3px] rounded-full" style={{ [edge]: -14, background: "var(--w-accent)" }} />}
    </button>
  );
}

/** The profile chip: the profile's colour mark and its name. The profile picker it opens comes with P4. */
function ProfileChip({ profile }: { profile: RailHost["profile"] }) {
  const { top } = useContext(SizeCtx);
  return (
    <div
      role="img"
      aria-label={`Profile: ${profile.name}`}
      className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl py-2"
      style={{ width: 68, minHeight: top - 4, background: "color-mix(in oklab, var(--w-fg) 6%, transparent)", boxShadow: `inset 0 0 0 1px ${EDGE}` }}
    >
      <span aria-hidden className="h-5 w-5 rounded-md" style={{ background: series(chipSeries(profile.index)) }} />
      <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-none">{profile.name}</span>
    </div>
  );
}

/** The logo slot (a profile slot with an image): the user's image on a card plate. The plate's choice is P5's. */
function Logo({ slot, name, run }: { slot: RailSlot; name: string; run: (a: TouchAction) => void }) {
  const { top } = useContext(SizeCtx);
  const g = useGestures(slotGestures(slot, run));
  const icon = slot.icon;
  const src = icon?.from === "image" ? icon.asset : icon?.from === "app" ? icon.asset : undefined;
  return (
    <button
      type="button"
      {...g}
      data-rail-slot={slot.id}
      aria-label={src ? undefined : name}
      className={`flex shrink-0 touch-manipulation select-none items-center justify-center rounded-2xl ${FOCUS}`}
      style={{ width: top, height: top, background: "color-mix(in oklab, var(--w-fg) 6%, transparent)", boxShadow: `inset 0 0 0 1px ${EDGE}` }}
    >
      {src ? <img src={assetUrl(src)} alt={name} draggable={false} style={{ width: top * 0.65, height: top * 0.65 }} className="object-contain" /> : <Glyph slot={slot} name={name} size={top} />}
    </button>
  );
}

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
}

function RailBody({ host, slots, edge, dense, chip, pageLock, clock, data }: RailBodyProps) {
  const size = dense ? DENSE : ROOMY;
  const { head, foot } = railGroups(slots);
  const badgeState: BadgeState = { agents: useAgents(), obs: useObs(), alerts: host.alerts, profile: host.profile.id };
  const toggles = slots.some((s) => s.target.kind === "action" && actionOn(s.target.action, EMPTY_AUDIO) !== undefined);
  const audioState = useToggleAudio(toggles);
  const one = (s: RailSlot): ReactNode => {
    const name = slotName(s, host.pages);
    if (s.target.kind === "widget") return <SlotWidget key={s.id} id={s.id} module={s.target.module} settings={s.target.settings} host={host} style={{ width: 72, height: size.widget }} />;
    if (s.target.kind === "profile" && s.icon && s.icon.from !== "set" && s.icon.from !== "text") return <Logo key={s.id} slot={s} name={name} run={host.run} />;
    return (
      <SlotButton
        key={s.id}
        slot={s}
        name={name}
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
      <nav aria-label="Pages and actions" className="flex h-full w-full flex-col items-center overflow-y-auto py-3 [scrollbar-width:none]" style={{ gap: size.gap }}>
        {chip && <ProfileChip profile={host.profile} />}
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
            <Clock data={data} face="stacked" showSeconds={false} format="24h" surface="flat" radius={0} />
          </div>
        )}
      </nav>
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
      {({ outerH }) => <RailBody host={host ?? SAMPLE_HOST} slots={slots} edge={item?.edge ?? "left"} dense={railDense(outerH)} chip={p.chip !== false} pageLock={p.pageLock !== false} clock={p.clock !== false} data={p.data} />}
    </Widget>
  );
}
