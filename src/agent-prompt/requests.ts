/**
 * The prompt window's side of agent approvals (src-tauri/src/agent_prompt.rs): the requests read with `agent_requests` and
 * kept current by the `agent-requests` events the app sends this window, and the answers given with `agent_answer`. Both
 * commands are granted to this window alone (capabilities/agent-prompt.json); nothing here goes over HTTP.
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { parseRequests, type AgentRequest, type Behavior } from "@/lib/agent-requests";

/** The event the app sends with the requests waiting (agent_prompt.rs `REQUESTS_EVENT`). */
export const REQUESTS_EVENT = "agent-requests";

/** The requests waiting now; none when the app can't say. */
export async function fetchRequests(): Promise<AgentRequest[]> {
  try {
    return parseRequests(await invoke("agent_requests"), Date.now());
  } catch {
    return [];
  }
}

/** Answers request `id`. False when it no longer waits (answered, back in the terminal) or the app refused. Never throws. */
export async function answerRequest(id: string, behavior: Behavior): Promise<boolean> {
  try {
    return (await invoke<boolean>("agent_answer", { id, behavior })) === true;
  } catch {
    return false;
  }
}

/** The requests waiting, read once and then as the app sends them. */
export function useAgentRequests(): AgentRequest[] {
  const [list, setList] = useState<AgentRequest[]>([]);
  useEffect(() => {
    let alive = true;
    // listen first, then read, so a change between the two is not missed
    const off = getCurrentWebviewWindow().listen<unknown>(REQUESTS_EVENT, (e) => alive && setList(parseRequests(e.payload, Date.now())));
    void off.then(() => fetchRequests()).then((got) => alive && setList(got));
    return () => {
      alive = false;
      void off.then((f) => f()).catch(() => {});
    };
  }, []);
  return list;
}
