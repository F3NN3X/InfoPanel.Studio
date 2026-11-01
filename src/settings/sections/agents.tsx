import { useEffect, useState } from "react";
import { FolderOpen, Terminal, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { useFound, useStore } from "../store";
import type { AgentName, AgentStatus, HookState, SetAgentsResult } from "../types";
import { Button, Switch } from "../ui";

const AGENT_NAMES: Record<AgentName, string> = { claude: "Claude Code", codex: "Codex" };

const CHIPS: Record<HookState, { label: string; className: string }> = {
  installed: { label: "Hooks installed", className: "bg-s-green/14 text-[oklch(0.84_0.14_150)]" },
  not_connected: { label: "Not connected", className: "bg-ui-subtle text-s-muted" },
  needs_repair: { label: "Needs repair", className: "bg-s-amber/14 text-s-amber" },
  not_found: { label: "Agent not found", className: "bg-ui-subtle text-s-muted" },
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
    <div ref={found.ref} className={cn("flex flex-wrap items-center gap-3 rounded-[9px] border border-s-divider bg-s-side px-3 py-2.5", found.className)}>
      <span className="w-24 text-[13px] font-medium">{AGENT_NAMES[item.agent]}</span>
      <span className="min-w-40 flex-1 break-all font-mono text-xs text-ui-3">{item.path}</span>
      <span className={cn("rounded-[10px] px-2 py-0.5 text-[11.5px]", chip.className)}>{chip.label}</span>
    </div>
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
    <div className="overflow-hidden rounded-xl border border-s-card-line bg-s-card">
      <div ref={found.ref} className={cn("flex items-center gap-4 px-[18px] py-4", found.className)}>
        <div className="grid h-9 w-9 place-items-center rounded-[9px] bg-ui-hover text-s-t2">
          <Terminal className="h-5 w-5" />
        </div>
        <div className="flex flex-1 flex-col gap-[3px]">
          <span className="text-sm font-medium">Connect coding agents</span>
          <span className="text-[12.5px] leading-[1.45] text-s-muted">Shows Claude Code and Codex sessions on the dashboard.</span>
        </div>
        <Switch checked={enabled} onChange={(v) => void toggle(v)} label="Connect coding agents" disabled={busy} />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-s-divider px-[18px] py-3.5">
        <span className="text-xs text-s-dim">{enabled ? "Edited files" : "Files that will be edited"}</span>
        {files.map((f) => (
          <AgentFile key={f.agent} item={f} />
        ))}
        <div className="text-pretty text-[12.5px] leading-normal text-s-muted">
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
  );
}
