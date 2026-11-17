import { useEffect } from "react";
import { agentPromptRoom, isTauri } from "@/lib/desktop";
import { pinnedPlacement } from "@/lib/pinned";
import type { MonitorProfile } from "@/lib/layout";

/*
 * The kiosk's part in agent approvals (pinned layer P8): none in the page. A request is read and answered only in
 * InfoPanel Studio's own prompt window (src/agent-prompt/), never by a page the server serves, where any widget's code runs
 * too. In the desktop app's window the kiosk only tells the app its page area without the pinned rails (Q12), so the prompt
 * sits centred on it; a screen that doesn't follow the agents sends nothing. In a browser it does nothing: the prompt still
 * opens on the PC running InfoPanel Studio, else the agent asks in its terminal.
 */

/** Whether a screen follows the coding agents, so the prompt is placed over it. */
export function screenFollowsAgents(stored: MonitorProfile): boolean {
  if (stored.island?.enabled === true && stored.island.notices?.agents === true) return true;
  const placements = [...stored.pages.flatMap((p) => p.placements), ...(stored.pinned?.items ?? []).map(pinnedPlacement)];
  if (placements.some((p) => p.module === "CodingAgents")) return true;
  return (stored.pinned?.items ?? []).some((it) => (it.rail ?? []).some((s) => s.badge?.when === "agents-waiting"));
}

export interface AgentPromptHostProps {
  stored: MonitorProfile;
  /** The room the pinned items take on each edge, px. */
  room: { left: number; right: number; top: number; bottom: number };
}

export function AgentPromptHost({ stored, room }: AgentPromptHostProps) {
  const follows = screenFollowsAgents(stored);
  const { left, right, top, bottom } = room;
  useEffect(() => {
    if (!follows || !isTauri()) return;
    const send = () =>
      void agentPromptRoom({ left, top, width: Math.max(0, window.innerWidth - left - right), height: Math.max(0, window.innerHeight - top - bottom) }).catch(() => {});
    send();
    window.addEventListener("resize", send);
    return () => window.removeEventListener("resize", send);
  }, [follows, left, right, top, bottom]);
  return null;
}
