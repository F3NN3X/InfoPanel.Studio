import { AGENT_COLORS, type AgentId } from "@/lib/agents";
import { seriesColour, type SkinContext } from "../kit";

/** An agent's colour: the Look's Series 1 (Claude Code) or 2 (Codex) in the skin context `sk`, else the agent's own brand colour. */
export const agentColour = (sk: Pick<SkinContext, "series">, id: AgentId): string => seriesColour(sk, id === "claude" ? 1 : 2, AGENT_COLORS[id]);
