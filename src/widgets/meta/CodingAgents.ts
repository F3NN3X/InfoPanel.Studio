// CodingAgents's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "CodingAgents",
  name: "Coding Agents",
  category: "System",
  icon: "smart_toy",
  prefixes: [],
  defaultSize: [3, 3],
  minSize: [1, 1],
  blurb: "Claude Code and Codex sessions and usage",
  tags: "claude codex ai agents tokens",
  views: [
    { id: "full", name: "Full" },
    { id: "summary", name: "Summary", blurb: "Plan limits, today and sessions" },
    { id: "limits", name: "Limits", blurb: "Plan limit bars only" },
  ],
  description:
    "Claude Code and Codex: each session working, waiting for you or done (with its model and cost), the plan's 5-hour and weekly use, tokens per day, and this week's split by model and project. Connect them once with node tools/agent-install.mjs.",
};
