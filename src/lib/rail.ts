/**
 * The page rail's model (decision 8, _docs/redesign/pinned-layer INVESTIGATION §3): one widget, `PageRail`, whose ordered
 * slots a pinned item stores (`PinnedItem.rail`). A slot is a page link, the profile, an action or a widget with a rail
 * preset. A rail with no slots stored draws one per page of its profile. Badges read the same state the Island does: the
 * agents waiting (extras), OBS on air (extras) and the alerts shown (the control channel).
 */
import type { ActiveAlert } from "./alerts";
import type { Agents } from "./agents";
import type { AudioState } from "./audio-control";
import type { ObsState } from "./extras";
import type { RailGroup, RailSlot, TouchAction, TouchGesture } from "./pinned";

/** The rail widget's module id. */
export const RAIL_MODULE = "PageRail";
/** A rail's width across its edge, design px (the fixtures' 84). */
export const RAIL_THICKNESS = 84;
/** Under this height the rail draws its dense sizes (a 1920 x 550 bar), so a full rail still fits. */
export const RAIL_DENSE_BELOW = 580;

/** Whether a rail `h` px tall draws its dense sizes. */
export const railDense = (h: number): boolean => h < RAIL_DENSE_BELOW;

/** The roomy sizes from 580 px of height, else dense (a 550 px bar): a slot never goes under 48. */
export interface RailSize {
  slot: number;
  top: number;
  widget: number;
  gap: number;
}
export const RAIL_SIZES: { roomy: RailSize; dense: RailSize } = {
  roomy: { slot: 56, top: 68, widget: 76, gap: 6 },
  dense: { slot: 48, top: 56, widget: 64, gap: 4 },
};

/** A page as the rail knows it. */
export interface RailPage {
  id: string;
  name: string;
  icon?: string;
}

/** The slots a rail draws: its own, or (none stored) one per page, with the page's icon. */
export function railSlots(stored: readonly RailSlot[] | undefined, pages: readonly RailPage[]): RailSlot[] {
  if (stored?.length) return [...stored];
  return pages.map((p) => ({ id: `page:${p.id}`, group: "pages", target: { kind: "page", pageId: p.id }, name: p.name, ...(p.icon ? { icon: { from: "set", name: p.icon } } : {}) }));
}

/** The groups above the rail's spacer, top to bottom; `bottom` goes under it, by the page lock and the clock. */
const HEAD: readonly RailGroup[] = ["top", "pages", "actions", "widgets"];

/** A rail's slots in their groups: the non-empty head groups in order, and the foot. */
export function railGroups(slots: readonly RailSlot[]): { head: RailSlot[][]; foot: RailSlot[] } {
  return { head: HEAD.map((g) => slots.filter((s) => s.group === g)).filter((g) => g.length > 0), foot: slots.filter((s) => s.group === "bottom") };
}

const ACTION_NAMES: Record<TouchAction["op"], string> = {
  page: "Go to a page",
  "profile-picker": "Profiles",
  lock: "Page lock",
  audio: "Audio",
  obs: "OBS",
  media: "Media",
  run: "Run a command",
};

/** The name a slot is known by (its button's accessible name): its own, else its page's, else what it is. */
export function slotName(slot: RailSlot, pages: readonly RailPage[]): string {
  if (slot.name) return slot.name;
  const t = slot.target;
  if (t.kind === "page") return pages.find((p) => p.id === t.pageId)?.name ?? "Page";
  if (t.kind === "profile") return "Profile";
  if (t.kind === "action") return ACTION_NAMES[t.action.op];
  return t.module;
}

/** What a badge reads: the state the Island is fed from. */
export interface BadgeState {
  agents: Pick<Agents, "sessions">;
  obs: Pick<ObsState, "streaming">;
  /** The alerts shown on this kiosk now (`visibleAlerts`). */
  alerts: readonly Pick<ActiveAlert, "severity" | "page">[];
  /** The profile shown, for an alert that names its page's profile. */
  profile: string;
}

/** A drawn badge: a dot, or a word (LIVE); `say` is what a screen reader hears after the slot's name. */
export interface RailBadge {
  text?: string;
  tone: "warn" | "crit";
  say: string;
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/**
 * A slot's badge now, from its rule: `agents-waiting` while a session waits for you; `alerts` while an alert is shown (on a
 * page slot, only one that goes to that page); `obs-live` while OBS streams. None when the rule holds nothing.
 */
export function railBadge(slot: RailSlot, state: BadgeState): RailBadge | undefined {
  switch (slot.badge?.when) {
    case "agents-waiting": {
      const n = state.agents.sessions.filter((s) => s.state === "waiting").length;
      return n ? { tone: "warn", say: count(n, "an agent needs you", "agents need you") } : undefined;
    }
    case "alerts": {
      const t = slot.target;
      const shown = t.kind === "page" ? state.alerts.filter((a) => a.page?.page === t.pageId && (!a.page.profile || a.page.profile === state.profile)) : state.alerts;
      if (!shown.length) return undefined;
      return { tone: shown.some((a) => a.severity === "critical") ? "crit" : "warn", say: count(shown.length, "an alert", "alerts") };
    }
    case "obs-live":
      return state.obs.streaming ? { text: "LIVE", tone: "crit", say: "live on OBS" } : undefined;
    default:
      return undefined;
  }
}

/** What a gesture on a slot does: its own touch map first; else a tap does what the slot is (its page, its action, the profile). */
export function slotAction(slot: RailSlot, gesture: TouchGesture): TouchAction | undefined {
  const own = slot.touch?.[gesture];
  if (own || gesture !== "tap") return own;
  const t = slot.target;
  if (t.kind === "page") return { op: "page", to: t.pageId };
  if (t.kind === "action") return t.action;
  if (t.kind === "profile") return { op: "profile-picker" };
  return undefined;
}

const MUTE_KINDS = { output: "outputs", input: "inputs", app: "apps" } as const;

/** A toggle action's state: a Windows mute is on while its device or app is muted. Undefined: the action is not a toggle. */
export function actionOn(action: TouchAction, audio: Pick<AudioState, "windows">): boolean | undefined {
  if (action.op !== "audio") return undefined;
  const b = action.body;
  if (b.target !== "windows" || b.op !== "mute" || typeof b.id !== "string" || !Object.hasOwn(MUTE_KINDS, String(b.kind))) return undefined;
  const list: readonly { id: string; muted: boolean }[] = audio.windows[MUTE_KINDS[b.kind as keyof typeof MUTE_KINDS]];
  return list.find((d) => d.id === b.id)?.muted === true;
}

/** The series colour (1–6) of a profile's chip: by its place among the profiles, so each keeps its own. */
export const chipSeries = (index: number): number => (Math.max(0, index) % 6) + 1;

/** What the rail draws besides its slots (the widget's settings), and whether the profile rotates (the page lock shows only then). */
export interface RailParts {
  chip: boolean;
  pageLock: boolean;
  clock: boolean;
  rotates: boolean;
}

/** The rail's padding top and bottom, a rule between groups (1 px and its margins), the page lock and the clock, px. */
const RAIL_PAD = 24;
const RULE_H = 9;
const LOCK_H = 48;
const CLOCK_H = 44;
/** The chip's content (its mark and name) when that is taller than its minimum. */
const CHIP_CONTENT_H = 52;

/**
 * The height a rail's slots and parts need, px, as `PageRail` lays them out at `h` px tall: its padding, the chip, each
 * group's slots with a rule between groups, the spacer, the foot, the page lock and the clock, with the gap between each.
 * More than `h` and the last ones scroll (owner Q9: the editor warns).
 */
export function railNeed(slots: readonly RailSlot[], parts: RailParts, h: number): number {
  const size = railDense(h) ? RAIL_SIZES.dense : RAIL_SIZES.roomy;
  const { head, foot } = railGroups(slots);
  const one = (s: RailSlot) =>
    s.target.kind === "widget" ? size.widget : s.target.kind === "profile" && s.icon && s.icon.from !== "set" && s.icon.from !== "text" ? size.top : size.slot;
  const heights = [
    ...(parts.chip ? [Math.max(size.top - 4, CHIP_CONTENT_H)] : []),
    ...head.flatMap((group, i) => [...(i > 0 || parts.chip ? [RULE_H] : []), ...group.map(one)]),
    0, // the spacer
    ...foot.map(one),
    ...(parts.pageLock && parts.rotates ? [LOCK_H] : []),
    ...(parts.clock ? [CLOCK_H] : []),
  ];
  return RAIL_PAD + heights.reduce((n, x) => n + x, 0) + size.gap * (heights.length - 1);
}
