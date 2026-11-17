/**
 * The commands a profile or a config names (pinned layer P7), for the review on import and in Settings > Actions: on keys and
 * their folders, on a widget's or a rail item's touch, and as a rail action. Apart from the runner's client (action-runner.ts),
 * which calls the server, so the import reads them without loading it.
 */
import type { DashboardConfig, MonitorProfile, Placement } from "./layout";
import { allKeys } from "./keys";
import type { PinnedPlacement, TouchAction, TouchMap } from "./pinned";
import { chipOverrides } from "./rail";

/** A command a profile names, and where: the profile, the page or the pinned layer, and the widget or key. */
export interface CommandUse {
  command: string;
  profile: string;
  where: string;
}

const GESTURE_WORDS = { tap: "tap", hold: "hold", doubleTap: "double tap" } as const;

function mapCommands(touch: TouchMap | undefined, where: string): { command: string; where: string }[] {
  return Object.entries(touch ?? {}).flatMap(([g, a]: [string, TouchAction]) => (a.op === "run" ? [{ command: a.command, where: `${where}, ${GESTURE_WORDS[g as keyof typeof GESTURE_WORDS] ?? g}` }] : []));
}

function placementCommands(p: Placement | PinnedPlacement, where: string): { command: string; where: string }[] {
  const name = p.name ?? p.module;
  return [...mapCommands(p.touch, `${where} › ${name}`), ...allKeys(p.keys ?? []).flatMap((k) => mapCommands(k.touch, `${where} › ${name} › ${k.name || "Key"}`))];
}

/** Every command a profile names: its pages' widgets and keys, its pinned widgets, keys, rail slots and the rail's profile chip. */
export function commandsIn(profile: MonitorProfile): CommandUse[] {
  const uses = [
    ...profile.pages.flatMap((page) => page.placements.flatMap((p) => placementCommands(p, page.name))),
    ...(profile.pinned?.items ?? []).flatMap((it) => [
      ...placementCommands(it.placement, "Pinned"),
      ...mapCommands(chipOverrides(it.placement.settings).touch, "Pinned › Profile chip"),
      ...(it.rail ?? []).flatMap((s) => [
        ...(s.target.kind === "action" && s.target.action.op === "run" ? [{ command: s.target.action.command, where: `Pinned › ${s.name ?? "Rail item"}` }] : []),
        ...mapCommands(s.touch, `Pinned › ${s.name ?? "Rail item"}`),
      ]),
    ]),
  ];
  return uses.map((u) => ({ ...u, profile: profile.name }));
}

/** Every command a config names, across its profiles. */
export const configCommands = (config: Pick<DashboardConfig, "profiles">): CommandUse[] => config.profiles.flatMap(commandsIn);

/** The distinct commands of `uses`, in the order first named. */
export const distinctCommands = (uses: readonly CommandUse[]): string[] => [...new Set(uses.map((u) => u.command))];
