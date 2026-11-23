import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Lock, RefreshCw } from "lucide-react";
import { pageIcon } from "@/components/studio/page-icons";
import { Widget, shell, type ShellProps } from "@/widgets/kit";
import { designWidget, useSpec, ZoneView, type Zone } from "./stage";

/*
 * The page rail (design only; P2 builds it): one widget with ordered slots, each a page, an action or a widget that has a
 * rail preset (decision 8, INVESTIGATION §3 `RailSlot`). It draws inside the template shell, so its card, material and
 * pack come from the Look like any widget's. Colours are the Look's tokens: the active page and a toggle that is on use
 * `--w-accent`, a badge the status colours, icons from the set `--w-fg` (or a series colour), and a user image its own.
 * Every slot is at least 48 px square, so a finger finds it (44 px is the floor).
 */

export type RailIcon =
  | { from: "set"; name: string; series?: number }
  | { from: "image"; src: string }
  | { from: "app"; exe: string; src: string }
  | { from: "text"; text: string };

export type RailTarget = { kind: "page"; pageId: string } | { kind: "profile" } | { kind: "action"; action: string } | { kind: "widget"; zone: Zone };

export interface RailSlot {
  id: string;
  /** The item's name: the button's accessible name, and a user image's alt text. */
  name: string;
  group: "top" | "pages" | "actions" | "widgets";
  target: RailTarget;
  icon?: RailIcon;
  shape?: "as-is" | "rounded" | "circle";
  /** Draw a set icon or an image in the accent instead of its own colours ("Tint with theme"). */
  tint?: boolean;
  /** The name under the icon. */
  label?: boolean;
  /** A badge from a fixed list of states: a dot (agents waiting) or a word (LIVE while OBS streams); `say` is what a screen reader hears. */
  badge?: { text?: string; tone: "warn" | "crit"; say: string };
  /** A toggle action's state (the mic: on = muted, drawn in `--w-crit`). */
  on?: boolean;
  /** The logo's plate: none, the card colour, or the text colour for a logo that would vanish on the page (a light logo on a light Look). */
  plate?: "none" | "card" | "contrast";
}

export interface RailSpec {
  /** The panel edge the rail is pinned to. */
  edge: "left" | "right";
  /** The profile chip: its name and its colour (a series index). */
  profile: { name: string; series: number };
  slots: RailSlot[];
  activePage: string;
  /** Auto: pages rotate as the profile says; locked: this page stays. */
  lock: "auto" | "locked" | null;
  /** The time and date at the foot: the Clock widget's rail preset (decision 8), drawn here until P2 gives Clock one. */
  clock: boolean;
  /** Show the profile chip (off when a logo slot is first). */
  chip: boolean;
}

/** The Look's series colour `n` (1–6). */
export const series = (n: number) => `var(--w-series-${n})`;

/** The rail's sizes: roomy from 580 px of height, else dense (a 550 px bar), so a full custom rail still fits; a slot never goes under 48. */
const ROOMY = { slot: 56, top: 68, widget: 76, gap: 6 };
const DENSE = { slot: 48, top: 56, widget: 64, gap: 4 };
const SizeCtx = createContext(ROOMY);

function Badge({ badge }: { badge: NonNullable<RailSlot["badge"]> }) {
  const color = `var(--w-${badge.tone})`;
  if (!badge.text) return <span aria-hidden className="absolute right-1 top-1 h-3 w-3 rounded-full" style={{ background: color, boxShadow: "0 0 0 2px var(--w-card)" }} />;
  return (
    <span aria-hidden className="absolute -right-1 top-0 rounded px-1 text-nano font-bold leading-3.5 tracking-wide" style={{ color, background: "var(--w-card)", boxShadow: `inset 0 0 0 1.5px ${color}` }}>
      {badge.text}
    </span>
  );
}

/** A slot's glyph: a set icon (lucide, as page icons are), a user image or an app icon (their own colours unless tinted), or text. */
function Glyph({ slot, size }: { slot: RailSlot; size: number }) {
  const icon = slot.icon;
  if (!icon) return null;
  if (icon.from === "set") {
    const Cmp = pageIcon(icon.name);
    return Cmp ? <Cmp aria-hidden size={size * 0.5} strokeWidth={1.75} style={{ color: icon.series ? series(icon.series) : undefined }} /> : null;
  }
  if (icon.from === "text") return <span className="text-title font-bold">{icon.text}</span>;
  const radius = slot.shape === "circle" ? "9999px" : slot.shape === "rounded" ? "28%" : 0;
  const img: CSSProperties = { width: size * 0.72, height: size * 0.72, borderRadius: radius, objectFit: "cover" };
  // "Tint with theme": the image as a mask filled with the accent, the one colour Studio may add to a user image.
  if (slot.tint) return <span role="img" aria-label={slot.name} style={{ ...img, background: "var(--w-accent)", mask: `url(${icon.src}) center / contain no-repeat` }} />;
  return <img src={icon.src} alt={slot.name} draggable={false} style={img} />;
}

function SlotButton({ slot, active, edge, children }: { slot: RailSlot; active: boolean; edge: RailSpec["edge"]; children?: ReactNode }) {
  const { slot: SLOT } = useContext(SizeCtx);
  const on = slot.on === true;
  const image = slot.icon?.from === "image" || slot.icon?.from === "app";
  // an untinted image names the button by its alt (the item's name); otherwise the label does
  const named = image && !slot.tint;
  return (
    <button
      type="button"
      data-rail-slot={slot.id}
      aria-current={active ? "page" : undefined}
      aria-pressed={slot.target.kind === "action" && slot.on !== undefined ? on : undefined}
      aria-label={named ? undefined : `${slot.name}${slot.badge ? `, ${slot.badge.say}` : ""}`}
      className="relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition-colors"
      style={{
        width: SLOT + (slot.label ? 8 : 0),
        minHeight: SLOT,
        color: on ? "var(--w-crit)" : active ? "var(--w-fg)" : "var(--w-muted)",
        background: on ? "color-mix(in oklab, var(--w-crit) 14%, transparent)" : active ? "color-mix(in oklab, var(--w-fg) 9%, transparent)" : undefined,
        boxShadow: on ? "inset 0 0 0 1px color-mix(in oklab, var(--w-crit) 45%, transparent)" : undefined,
      }}
    >
      {children ?? <Glyph slot={slot} size={SLOT} />}
      {slot.label && <span className="max-w-full truncate px-0.5 text-micro leading-none">{slot.name}</span>}
      {slot.badge && <Badge badge={slot.badge} />}
      {named && slot.badge && <span className="sr-only">{`, ${slot.badge.say}`}</span>}
      {/* the active page's marker: a bar in the accent on the rail's outer edge, drawn by the rail so it stays while pages move */}
      {active && <span aria-hidden className="absolute top-3 bottom-3 w-0.75 rounded-full" style={{ [edge]: -14, background: "var(--w-accent)" }} />}
    </button>
  );
}

/** The profile chip: the profile's colour mark and its name. Tap opens the profile picker, hold locks the profile. */
function ProfileChip({ profile, open }: { profile: RailSpec["profile"]; open: boolean }) {
  const { top } = useContext(SizeCtx);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Profile: ${profile.name}`}
      className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl py-2"
      style={{ width: 68, minHeight: top - 4, background: "color-mix(in oklab, var(--w-fg) 6%, transparent)", boxShadow: open ? "inset 0 0 0 2px var(--w-accent)" : "inset 0 0 0 1px var(--w-edge)" }}
    >
      <span aria-hidden className="h-5 w-5 rounded-md" style={{ background: series(profile.series) }} />
      <span className="max-w-full truncate px-1 text-caption font-semibold leading-none">{profile.name}</span>
    </button>
  );
}

/** The logo slot: the user's image on its plate. A plate in the text colour keeps a light logo visible on a light Look. */
function Logo({ slot }: { slot: RailSlot }) {
  const plate = slot.plate ?? "card";
  const { top } = useContext(SizeCtx);
  const bg = plate === "contrast" ? "var(--w-fg)" : plate === "card" ? "color-mix(in oklab, var(--w-fg) 6%, transparent)" : undefined;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-rail-slot={slot.id}
      className="flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: top, height: top, background: bg, boxShadow: plate === "none" ? undefined : "inset 0 0 0 1px var(--w-edge)" }}
    >
      {slot.icon && slot.icon.from !== "set" && slot.icon.from !== "text" ? <img src={slot.icon.src} alt={slot.name} draggable={false} style={{ width: top * 0.65, height: top * 0.65 }} className="object-contain" /> : <Glyph slot={slot} size={top} />}
    </button>
  );
}

const Rule = () => <span aria-hidden className="my-1 h-px w-10 shrink-0" style={{ background: "var(--w-edge)" }} />;

/** The page lock: Auto (pages rotate) or Locked (this page stays). */
function PageLock({ lock }: { lock: "auto" | "locked" }) {
  const Cmp = lock === "auto" ? RefreshCw : Lock;
  return (
    <button
      type="button"
      aria-pressed={lock === "locked"}
      aria-label={lock === "auto" ? "Pages rotate. Tap to stay on this page" : "Stays on this page. Tap to rotate pages"}
      className="flex h-12 w-15 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl"
      style={{ color: "var(--w-muted)", boxShadow: "inset 0 0 0 1px var(--w-edge)" }}
    >
      <Cmp aria-hidden size={18} strokeWidth={1.75} />
      <span className="text-micro leading-none">{lock === "auto" ? "Auto" : "Locked"}</span>
    </button>
  );
}

/** The clock at the rail's foot: 24-hour time over the short date, in the text colours. */
function RailClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  return (
    <time dateTime={now.toISOString()} className="flex shrink-0 flex-col items-center pb-1 leading-tight">
      <span className="text-[20px] font-semibold tabular-nums">{time}</span>
      <span className="text-caption" style={{ color: "var(--w-muted)" }}>
        {date}
      </span>
    </time>
  );
}

/** The rail's slots in their groups, top to bottom, with a rule between groups. `picker`: the profile picker is open. */
export function RailBody({ spec, picker = false, dense = false }: { spec: RailSpec; picker?: boolean; dense?: boolean }) {
  const groups = (["top", "pages", "actions", "widgets"] as const).map((g) => spec.slots.filter((s) => s.group === g)).filter((g) => g.length);
  const size = dense ? DENSE : ROOMY;
  return (
    <SizeCtx.Provider value={size}>
    <nav aria-label="Pages and actions" className="flex h-full w-full flex-col items-center py-3" style={{ gap: size.gap }}>
      {spec.chip && <ProfileChip profile={spec.profile} open={picker} />}
      {groups.map((slots, i) => (
        <div key={slots[0].group} className="contents">
          {(i > 0 || spec.chip) && <Rule />}
          {slots.map((s) =>
            s.target.kind === "profile" ? (
              <Logo key={s.id} slot={s} />
            ) : s.target.kind === "widget" ? (
              <div key={s.id} data-rail-slot={s.id} className="w-18 shrink-0" style={{ height: size.widget }}>
                <ZoneView zone={s.target.zone} style={{ height: "100%" }} />
              </div>
            ) : (
              <SlotButton key={s.id} slot={s} active={s.target.kind === "page" && s.target.pageId === spec.activePage} edge={spec.edge} />
            )
          )}
        </div>
      ))}
      <div className="flex-1" />
      {spec.lock && <PageLock lock={spec.lock} />}
      {spec.clock && <RailClock />}
    </nav>
    </SizeCtx.Provider>
  );
}

/** The rail widget: its slots in the template shell, edge to edge. */
function RailView(p: ShellProps) {
  const spec = useSpec<{ rail: RailSpec; picker?: boolean }>();
  return (
    <Widget {...shell(p)} showHeader={false} bleed design={null}>
      {({ outerH }) => <RailBody spec={spec.rail} picker={spec.picker} dense={outerH < 580} />}
    </Widget>
  );
}

export const RAIL = designWidget("dev.PageRail", "Page rail", RailView);
