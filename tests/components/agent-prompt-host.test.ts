import { describe, expect, it } from "vitest";
import { screenFollowsAgents } from "@/components/agent-prompt-host";
import type { MonitorProfile } from "@/lib/layout";

// Which kiosks listen for agents' permission requests (pinned layer P8): only a screen that already follows the agents, so
// no other screen opens the extras stream for them.

const screen = (extra: Partial<MonitorProfile> = {}, modules: string[] = ["Clock"]): MonitorProfile =>
  ({
    id: "s",
    name: "S",
    width: 1024,
    height: 600,
    cols: 4,
    rows: 2,
    pages: [{ id: "p", name: "P", placements: modules.map((module, i) => ({ id: `z${i}`, module, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true })) }],
    ...extra,
  }) as unknown as MonitorProfile;

describe("screenFollowsAgents", () => {
  it("is off for a screen without the agents", () => {
    expect(screenFollowsAgents(screen())).toBe(false);
    expect(screenFollowsAgents(screen({ island: { enabled: true, notices: { agents: false } } } as Partial<MonitorProfile>))).toBe(false);
  });

  it("is on for a Coding Agents widget, the Island's agents notices, or a rail badge for waiting agents", () => {
    expect(screenFollowsAgents(screen({}, ["CodingAgents"]))).toBe(true);
    expect(screenFollowsAgents(screen({ island: { enabled: true, notices: { agents: true } } } as Partial<MonitorProfile>))).toBe(true);
    const rail = { items: [{ id: "r", edge: "left", mode: "room", thickness: 84, show: "all", visible: true, placement: { id: "r", module: "PageRail" }, rail: [{ id: "a", group: "pages", target: { kind: "page", pageId: "p" }, badge: { when: "agents-waiting" } }] }] };
    expect(screenFollowsAgents(screen({ pinned: rail } as Partial<MonitorProfile>))).toBe(true);
  });
});
