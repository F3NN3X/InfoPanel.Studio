import type { RailSlot, RailTarget, TouchAction } from "@/lib/pinned";
import type { ModuleSettings } from "@/modules/types";

/**
 * What the QA page's surfaces draw (Surfaces.tsx): the page rail with a slot of every kind, every widget that has a rail preset in a
 * slot of its own, and the app's own chrome (alerts in each tone, the island in each state, the banner and the toasts).
 * tests/widgets/widget-qa/surfaces-plan.test.ts holds the rail to every slot kind and every rail preset.
 */

/** A widget with a rail preset, as the rail editor offers it (`useRailWidgets`). */
export interface QaRailWidget {
  module: string;
  name: string;
  settings: ModuleSettings;
}

/** The pages the QA rail links to (its sample screen's), with their page icons (`pageIcon`, not the widgets' icon names). */
export const QA_RAIL_PAGES: readonly { id: string; name: string; icon: string }[] = (
  [
    ["keys", "Keys", "zap"],
    ["agents", "Agents", "bot"],
    ["mixer", "Mixer", "sliders-horizontal"],
    ["status", "Status", "activity"],
  ] as const
).map(([id, name, icon]) => ({ id, name, icon }));

/** One action of every kind a slot can run (`TouchAction`), the mic mute a toggle. */
export const QA_RAIL_ACTIONS: readonly { id: string; name: string; action: TouchAction; icon: RailSlot["icon"] }[] = [
  { id: "mute", name: "Mic", action: { op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "in1" } }, icon: { from: "set", name: "mic" } },
  { id: "obs", name: "Record", action: { op: "obs", body: { op: "record", state: "toggle" } }, icon: { from: "set", name: "video" } },
  { id: "media", name: "Play", action: { op: "media", key: "play-pause" }, icon: { from: "set", name: "play" } },
  { id: "run", name: "Run", action: { op: "run", command: "qa" }, icon: { from: "text", text: "Fx" } },
  { id: "page", name: "Next", action: { op: "page", to: "next" }, icon: { from: "set", name: "chevron-right" } },
  { id: "lock", name: "Lock", action: { op: "lock" }, icon: { from: "set", name: "lock" } },
  { id: "picker", name: "Profiles", action: { op: "profile-picker" }, icon: { from: "set", name: "users" } },
];

/** The slot kinds the QA rail draws (`RailTarget`): a new kind fails the type here and the coverage test. */
export const QA_RAIL_KINDS: Readonly<Record<RailTarget["kind"], string>> = {
  page: "page buttons (one labelled, one with each badge, one in the foot)",
  profile: "the logo (a profile slot with an app icon)",
  action: "one action of each kind, the mic mute a toggle",
  widget: "every widget with a rail preset",
};

/** The QA rail's slots: a logo, the pages (labelled, badged), every action, every rail widget, and a page in the foot. */
export function qaRailSlots(widgets: readonly QaRailWidget[]): RailSlot[] {
  const pages: RailSlot[] = QA_RAIL_PAGES.map((p, i) => ({
    id: `page:${p.id}`,
    group: "pages",
    target: { kind: "page", pageId: p.id },
    name: p.name,
    icon: { from: "set", name: p.icon },
    ...(i === 0 ? { label: true } : {}),
    ...(p.id === "agents" ? { badge: { when: "agents-waiting" } } : p.id === "status" ? { badge: { when: "obs-live" } } : p.id === "mixer" ? { badge: { when: "alerts" } } : {}),
  }));
  return [
    { id: "logo", group: "top", target: { kind: "profile" }, name: "Logo", icon: { from: "app", exe: "qa.exe" }, plate: "card" },
    ...pages,
    ...QA_RAIL_ACTIONS.map((a): RailSlot => ({ id: `action:${a.id}`, group: "actions", target: { kind: "action", action: a.action }, name: a.name, icon: a.icon })),
    ...widgets.map((w, i): RailSlot => ({ id: `widget:${w.module}:${i}`, group: "widgets", name: w.name, target: { kind: "widget", module: w.module, settings: w.settings } })),
    { id: "page:foot", group: "bottom", target: { kind: "page", pageId: "keys" }, name: "Home", icon: { from: "set", name: "house" } },
  ];
}
