import { lazy, Suspense, useSyncExternalStore } from "react";
import { extras } from "@/lib/extras";
import { pinnedPlacement } from "@/lib/pinned";
import type { MonitorProfile } from "@/lib/layout";

/*
 * Where the kiosk's agent prompt comes from (pinned layer P8): while the extras say a session waits, the prompt's chunk loads
 * and asks the server for the permission requests on their own guarded route (`useAgentRequests`), and shows the first one.
 * Only a screen that already follows the agents (the Island's agents notices, a Coding Agents widget, or a rail badge for
 * waiting agents) listens, so a screen without them opens no extras stream for it.
 */

const AgentPromptLayer = lazy(() => import("./agent-prompt").then((m) => ({ default: m.AgentPromptLayer })));

/** Whether a screen follows the coding agents, so its kiosk may show their requests. */
export function screenFollowsAgents(stored: MonitorProfile): boolean {
  if (stored.island?.enabled === true && stored.island.notices?.agents === true) return true;
  const placements = [...stored.pages.flatMap((p) => p.placements), ...(stored.pinned?.items ?? []).map(pinnedPlacement)];
  if (placements.some((p) => p.module === "CodingAgents")) return true;
  return (stored.pinned?.items ?? []).some((it) => (it.rail ?? []).some((s) => s.badge?.when === "agents-waiting"));
}

const anyWaiting = () => extras.getState().agents.sessions.some((s) => s.state === "waiting");

function Listening({ room }: { room: { left: number; right: number; top: number; bottom: number } }) {
  const waiting = useSyncExternalStore(extras.subscribe, anyWaiting, anyWaiting);
  if (!waiting) return null;
  return (
    <Suspense fallback={null}>
      <AgentPromptLayer room={room} />
    </Suspense>
  );
}

export function AgentPromptHost({ stored, room }: { stored: MonitorProfile; room: { left: number; right: number; top: number; bottom: number } }) {
  return screenFollowsAgents(stored) ? <Listening room={room} /> : null;
}
