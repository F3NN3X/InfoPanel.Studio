// Coding Agents: Claude Code and Codex sessions, plan use and tokens. What the registry needs; the component is its own
// chunk.
import type { ModuleSettings } from "@/modules/types";
import { BOTH, defineWidget } from "../define";
import { boolOf, boolSetting, enumSetting, oneOf, viewOnly, viewSetting } from "../shared/settings-kit";
import type { CodingAgentsProps } from "./CodingAgents";
import { meta } from "./meta";

/** The settings that only apply to the Full view. */
const full = viewOnly(meta, "full");

export default defineWidget({
  meta,
  // A summary card and a dense view of its own.
  inspector: { header: "yes", compact: BOTH },
  settings: [
    viewSetting(meta, { group: "Agents" }),
    enumSetting(
      "agents",
      "Agents",
      "both",
      [
        { value: "both", label: "Claude and Codex" },
        { value: "claude", label: "Claude Code" },
        { value: "codex", label: "Codex" },
      ],
      { group: "Agents" }
    ),
    full(boolSetting("showPlan", "Plan use", true, { group: "Plan limits", hint: "The 5-hour and weekly windows, from the statusline (Claude) and the session files (Codex)" })),
    full(boolSetting("showSessions", "Sessions", true, { group: "Sessions", hint: "Each session: working with its tool, waiting for you, done" })),
    full(boolSetting("showUsage", "Tokens per day", true, { group: "Tokens", hint: "Today's tokens and the last five weeks, read from the transcripts" })),
    full(boolSetting("showBreakdown", "Breakdown", true, { group: "Tokens", hint: "This week's tokens by model and project, and today's by type, read from the transcripts" })),
    full(
      enumSetting("limitStyle", "Limit style", "bars", [{ value: "bars", label: "Bars" }, { value: "rings", label: "Rings" }], {
        group: "Plan limits",
        hint: "Rings fall back to bars when the cell is too small for them",
        visibleIf: (v) => v.showPlan !== false,
      })
    ),
    enumSetting("percent", "Show limits as", "used", [{ value: "used", label: "Used" }, { value: "left", label: "Left" }], { group: "Plan limits", visibleIf: (v) => v.showPlan !== false }),
    full(
      enumSetting("history", "History", "bars", [{ value: "bars", label: "Daily bars" }, { value: "heatmap", label: "Heatmap" }], {
        group: "Tokens",
        hint: "The heatmap moves beside the rest in a wide cell, and falls back to bars when it does not fit",
        visibleIf: (v) => v.showUsage !== false,
      })
    ),
  ],
  render: {
    load: () => import("./CodingAgents"),
    toProps: (s: ModuleSettings): Partial<CodingAgentsProps> => ({
      view: oneOf(s.view, ["full", "summary", "limits", "sessions"] as const),
      agents: oneOf(String(s.agents), ["both", "claude", "codex"] as const),
      showPlan: boolOf(s.showPlan),
      showSessions: boolOf(s.showSessions),
      showUsage: boolOf(s.showUsage),
      showBreakdown: boolOf(s.showBreakdown),
      limitStyle: oneOf(s.limitStyle, ["bars", "rings"] as const),
      percent: oneOf(s.percent, ["used", "left"] as const),
      history: oneOf(s.history, ["bars", "heatmap"] as const),
    }),
  },
  // Migrations and sample stay central (the default): no migration steps of its own today. It reads the server's agent
  // extras (src/lib/extras.ts), not sensors, so it draws without sensor keys (module.tsx SENSORLESS).
});
