import { useEffect, useState } from "react";
import type { AnswerLogEntry } from "@/lib/agent-requests";
import { FolderOpen, Terminal, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { useFound, useStore } from "../store";
import type { AgentName, AgentStatus, HookState, SetAgentsResult } from "../types";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Card, Group, Row, SwitchRow } from "../ui";

const AGENT_NAMES: Record<AgentName, string> = { claude: "Claude Code", codex: "Codex" };

const CHIPS: Record<HookState, { label: string; className: string }> = {
  installed: { label: "Hooks installed", className: "bg-s-green/14 text-s-ok-text" },
  not_connected: { label: "Not connected", className: "bg-s-card-line text-s-muted" },
  needs_repair: { label: "Needs repair", className: "bg-s-amber/14 text-s-amber" },
  not_found: { label: "Agent not found", className: "bg-s-card-line text-s-muted" },
};

/** Why an install or removal failed, for the error toast. */
export function failureReason(result: SetAgentsResult): string {
  for (const step of result.steps) {
    if (step.ok) continue;
    const detail = step.output?.results?.find((r) => r.status === "error")?.message;
    return step.error ?? detail ?? "The hooks could not be changed.";
  }
  return "The hooks could not be changed.";
}

function AgentFile({ item }: { item: AgentStatus }) {
  const found = useFound(`agent-${item.agent}`);
  const chip = CHIPS[item.status];
  return (
    <div ref={found.ref} className={cn("flex flex-wrap items-center gap-3 rounded-ui-menu border border-s-divider bg-s-side px-3 py-2.5", found.className)}>
      <span className="w-24 text-body font-medium">{AGENT_NAMES[item.agent]}</span>
      <span className="min-w-40 flex-1 break-all font-mono text-caption text-s-t3">{item.path}</span>
      <span className={cn("rounded-ui-lg px-2 py-0.5 text-caption", chip.className)}>{chip.label}</span>
    </div>
  );
}

/** The answers log's newest lines shown. */
const LOG_SHOWN = 50;

const ANSWERS: Record<AnswerLogEntry["answer"], { label: string; className: string }> = {
  allow: { label: "Allowed", className: "bg-s-green/14 text-s-ok-text" },
  deny: { label: "Denied", className: "bg-s-red/14 text-s-red" },
  none: { label: "To the terminal", className: "bg-s-card-line text-s-muted" },
  gone: { label: "Ended", className: "bg-s-card-line text-s-muted" },
};

/*
 * Answering from the panel (pinned layer P8, decision 5, owner Q4): per agent, off by default, read by the server at start
 * (a change asks for a restart). A request is shown and answered only in InfoPanel Studio's own prompt window on this PC
 * (src/agent-prompt/), never by a page or another device; there is no pairing. The log is read by IPC (`agent_answers_log`).
 */
function Approvals({ connected }: { connected: boolean }) {
  const { settings, save } = useStore();
  const [log, setLog] = useState<AnswerLogEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void ipc
      .agentAnswersLog()
      .then((l) => alive && setLog(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const on = settings.agentApprovals ?? [];
  const set = (agent: AgentName, v: boolean) => void save("agentApprovals", v ? [...on.filter((a) => a !== agent), agent] : on.filter((a) => a !== agent));
  const hint = (name: string) => `Shows ${name}'s permission requests in a prompt over the panel on this PC, with Deny and Hold to allow, for 25 seconds; then ${name} asks in its terminal as usual. Takes effect after a restart.`;
  return (
    <>
      <Group title="Answer from the panel" navSection="agent-approvals">
        <Card id="agent-approvals">
          {(["claude", "codex"] as const).map((agent) => (
            <SwitchRow
              key={agent}
              id={`agent-approve-${agent}`}
              label={`Answer ${AGENT_NAMES[agent]} from the panel`}
              hint={connected ? hint(AGENT_NAMES[agent]) : "Turn on Connect coding agents first."}
              checked={on.includes(agent)}
              disabled={!connected}
              onChange={(v) => set(agent, v)}
            />
          ))}
        </Card>
      </Group>
      <Group title="Answers" navSection="agent-answers">
        <Card id="agent-answers">
          {log.length === 0 ? (
            <Row label="No answers yet" hint="Every request the panel shows is logged here: allowed, denied, or sent back to the terminal." />
          ) : (
            [...log]
              .reverse()
              .slice(0, LOG_SHOWN)
              .map((e, i) => (
                <div key={`${e.at}-${i}`} className="flex flex-wrap items-center gap-3 px-4.5 py-2.5">
                  <span className={cn("rounded-ui-lg px-2 py-0.5 text-caption", ANSWERS[e.answer]?.className)}>{ANSWERS[e.answer]?.label ?? e.answer}</span>
                  <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-caption text-s-t1">{e.text || e.tool || "(no request read)"}</code>
                  <span className="text-caption text-s-muted">{[e.project, e.from, new Date(e.at).toLocaleString()].filter(Boolean).join(" · ")}</span>
                </div>
              ))
          )}
        </Card>
      </Group>
    </>
  );
}

export function AgentsSection() {
  const { settings, refreshSettings, toast } = useStore();
  const [files, setFiles] = useState<AgentStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const found = useFound("agents");
  const enabled = settings.agents.enabled;

  useEffect(() => {
    let alive = true;
    void ipc.agentsStatus().then((f) => alive && setFiles(f)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      const result = await ipc.setAgents(next);
      setFiles(result.agents);
      if (!result.ok) toast(failureReason(result), true);
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      // Whatever happened, the switch shows what the settings now say: a failed install rolls it back.
      await refreshSettings().catch(() => {});
      setBusy(false);
    }
  };

  const repair = async () => {
    setBusy(true);
    try {
      setFiles(await ipc.repairAgents());
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };

  const needsRepair = enabled && files.some((f) => f.status !== "installed" && f.status !== "not_found");

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-s-card-line bg-s-card">
        <div ref={found.ref} className={cn("flex items-center gap-4 px-4.5 py-4", found.className)}>
          <div className="grid h-9 w-9 place-items-center rounded-ui-menu bg-s-hover text-s-t2">
            <Terminal className="h-5 w-5" />
          </div>
          <div className="flex flex-1 flex-col gap-0.75">
            <span className="text-lead font-medium">Connect coding agents</span>
            <span className="text-caption leading-[1.45] text-s-muted">Shows Claude Code and Codex sessions on the dashboard</span>
          </div>
          <Toggle checked={enabled} onChange={(v) => void toggle(v)} label="Connect coding agents" disabled={busy} />
        </div>
        <div className="flex flex-col gap-2.5 border-t border-s-divider px-4.5 py-3.5">
          <span className="text-caption text-s-dim">{enabled ? "Edited files" : "Files that will be edited"}</span>
          {files.map((f) => (
            <AgentFile key={f.agent} item={f} />
          ))}
          <div className="text-pretty text-caption leading-normal text-s-muted">
            Adds hooks that run InfoPanel Studio's own small helper, and wraps your Claude Code statusline so it keeps printing as before. Each file is backed up first. Turning this off removes them.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void ipc.openAgentBackups().catch((e) => toast(errorText(e), true))}>
              <FolderOpen className="h-4 w-4" />
              Open backups
            </Button>
            <Button disabled={busy || !needsRepair} title={enabled ? undefined : "Turn on Connect coding agents first"} onClick={() => void repair()}>
              <Wrench className="h-4 w-4" />
              Repair hooks
            </Button>
          </div>
        </div>
      </div>
      <Approvals connected={enabled} />
    </>
  );
}
