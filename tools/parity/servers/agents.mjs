// POST /api/agents/event and /api/agents/statusline: the answers to valid hooks and to every kind of ignored payload (the
// guards and the body checks are in extras.mjs). A body over the cap is not compared: Node destroys the socket, native
// answers 400 and closes. Both servers read this machine's ~/.claude and ~/.codex, so the sessions seen through
// /api/extras are only the ones this list posts (project "parity-probe"), with the clock-valued fields masked.
import { get, request, sleep } from "./lib.mjs";

const AGENT = "Content-Type: application/json\r\nX-Agent-Event: 1\r\n";
const post = (route, body, extra) => ({ ...request(`POST ${route} HTTP/1.1\r\n${AGENT}`.replace(/\r\n$/, ""), body, extra), label: `POST ${route} ${body.slice(0, 50)}` });
const hook = (name, more = {}) => JSON.stringify({ hook_event_name: name, session_id: "probe-1", cwd: "/work/parity-probe", prompt: "secret", transcript_path: "/secret.jsonl", ...more });

/** The probe's sessions from a /api/extras answer (already normalised), with the times masked. */
const probe = (transcript) =>
  transcript
    .split("\n=====\n")
    .map((part) => {
      if (!part.includes('"agents":{')) return part;
      const sessions = (part.match(/\{"key":"[0-9a-f]{12}"[^{}]*\}/g) ?? []).filter((s) => s.includes('"project":"parity-probe"')).map((s) => s.replace(/"(since|turnStart|lastTurnMs)":\d+/g, '"$1":N'));
      return `probe sessions\n${sessions.join("\n")}`;
    })
    .join("\n=====\n");

const asRaw = (api, text) => api.raw(`${text}\r\n${api.host}Connection: close\r\n\r\n`);

export const cases = [
  post("/api/agents/event?agent=claude", hook("SessionStart")),
  post("/api/agents/event?agent=codex", hook("UserPromptSubmit")),
  post("/api/agents/event?agent=gemini", hook("Stop")),
  post("/api/agents/event?agent=", hook("Stop")),
  post("/api/agents/event?agent=claude&agent=codex", hook("Stop")),
  post("/api/agents/event?agent=CLAUDE", hook("Stop")),
  ...["null", "5", '"x"', "[]", "true", "{}", '{"hook_event_name":"Stop"}', '{"session_id":"x"}', '{"hook_event_name":5,"session_id":"x"}'].map((body) => post("/api/agents/event?agent=claude", body)),
  ...["null", "5", '"x"', "[]", "{}", '{"session_id":"nobody"}', '{"rate_limits":{"five_hour":{"used_percentage":1}}}', '{"version":"2.1.0"}'].map((body) => post("/api/agents/statusline", body)),
  post("/api/agents/statusline?agent=claude", "{}"),
  post("/api/agents/event?x=1#frag", hook("Stop")),
  {
    label: "a probe session through the hooks, the statusline and the extras state",
    map: probe,
    run: async (api) => {
      const out = [];
      const send = async (route, body) => out.push(await api.raw(`POST ${route} HTTP/1.1\r\n${AGENT}${api.host}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`));
      const state = async () => out.push(await asRaw(api, "GET /api/extras HTTP/1.1"));
      await send("/api/agents/event?agent=claude", hook("UserPromptSubmit"));
      await send("/api/agents/event?agent=claude", hook("PreToolUse", { tool_name: "mcp__srv__Read" }));
      await send("/api/agents/statusline", JSON.stringify({ session_id: "probe-1", model: { display_name: "Opus" }, context_window: { used_percentage: 41.5 }, cost: { total_cost_usd: 0.25 } }));
      await sleep(450);
      await state();
      await send("/api/agents/event?agent=claude", hook("PermissionRequest", { tool_name: "Edit" }));
      await send("/api/agents/event?agent=claude", hook("SubagentStart"));
      await sleep(450);
      await state();
      await send("/api/agents/event?agent=claude", hook("Stop"));
      await sleep(450);
      await state();
      await send("/api/agents/event?agent=claude", hook("SessionEnd"));
      await sleep(450);
      await state();
      return out.join("\n=====\n");
    },
  },
  get("/api/agents/event"),
];
