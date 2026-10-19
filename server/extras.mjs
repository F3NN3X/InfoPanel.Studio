// The server's extras for kiosks: OBS's on-air state, the upcoming calendar events and the coding
// agents' sessions (server/obs.mjs, server/calendar.mjs, server/agents.mjs, with Claude Code's own session
// files from server/claude-sessions.mjs), from the integrations in
// their own file (server/integrations.mjs). GET /api/extras and the SSE /events/extras carry only that state;
// GET/PUT /api/integrations is the studio's view of the settings, with secrets write-only.
//
// Node built-ins only.

import { createAgents } from "./agents.mjs";
import { createCalendar } from "./calendar.mjs";
import { readClaudeSessions } from "./claude-sessions.mjs";
import { createIntegrations } from "./integrations.mjs";
import { createObs } from "./obs.mjs";

export function createExtras({ file, log = () => {}, agentUsage, claudeSessions = () => readClaudeSessions() }) {
  const integrations = createIntegrations({ file });
  const listeners = new Set();
  const state = () => ({ obs: obs.state(), calendar: calendar.state(), agents: agents.state() });
  const publish = () => {
    const s = state();
    for (const l of listeners) l(s);
  };
  const obs = createObs({ settings: () => integrations.get().obs, onChange: publish, log });
  const calendar = createCalendar({ links: () => integrations.get().calendar.links, onChange: publish, log });
  const agents = createAgents({ onChange: publish, usage: agentUsage?.totals, codexLimits: agentUsage?.codexLimits, codexLimitsAt: agentUsage?.codexLimitsAt, claudeSessions });

  obs.reconfigure();
  void calendar.reconfigure();
  integrations.subscribe((next, prev) => {
    if (JSON.stringify(next.obs) !== JSON.stringify(prev.obs)) obs.reconfigure();
    if (JSON.stringify(next.calendar) !== JSON.stringify(prev.calendar)) void calendar.reconfigure();
  });

  return {
    state,
    integrations,
    agents,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
