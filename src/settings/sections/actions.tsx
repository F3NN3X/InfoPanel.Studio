import { useCallback, useEffect, useState } from "react";
import { CONFIG_URL } from "@/lib/dashboard-server";
import { configCommands, distinctCommands, type CommandUse } from "@/lib/action-commands";
import { actionsLog, actionsState, changeActions, type ActionsState, type LogEntry } from "@/lib/action-runner";
import { readConfig, type StoredConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { useStore } from "../store";
import { Button, Card, Group, Row, SwitchRow } from "../ui";

/*
 * Settings › Actions (pinned layer P7, decision 4, owner Q3): the switches for running commands from the panel and for going
 * live in OBS (both off by default, read by the server at start, so a change asks for a restart), test mode, every command the
 * dashboard names with its approval, and the log of every run. Approving works on this PC only: the server refuses it from
 * another device, whatever "Allow editing from other devices" says.
 */

/** The log's newest lines shown. */
const LOG_SHOWN = 50;

const OUTCOMES: Record<LogEntry["outcome"], { label: string; className: string }> = {
  ran: { label: "Ran", className: "bg-s-green/14 text-s-ok-text" },
  dry: { label: "Test", className: "bg-s-card-line text-s-muted" },
  refused: { label: "Refused", className: "bg-s-amber/14 text-s-amber" },
  failed: { label: "Failed", className: "bg-s-red/14 text-s-red" },
};

const REASONS: Record<string, string> = {
  remote: "from another device",
  off: "running commands is off",
  unapproved: "not approved",
  command: "not a command",
};

/** What the server and the config say, read when the page opens and after every change. */
function useActions() {
  const [state, setState] = useState<ActionsState | null | undefined>();
  const [uses, setUses] = useState<CommandUse[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const load = useCallback(async () => {
    const [s, entries] = await Promise.all([actionsState(), actionsLog()]);
    setState(s);
    setLog(entries);
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (res.ok) setUses(configCommands(await readConfig((await res.json()) as StoredConfig)));
    } catch {
      setUses([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { state, uses, log, load, setState };
}

function CommandRow({ command, where, approved, busy, onChange }: { command: string; where: string[]; approved: boolean; busy: boolean; onChange: (approve: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 px-[18px] py-3.5" data-command={command}>
      <div className="flex min-w-48 flex-1 flex-col gap-[3px]">
        {/* the whole command, never cut: it wraps */}
        <code className="whitespace-pre-wrap break-all font-mono text-caption text-s-t1">{command}</code>
        {where.length > 0 ? <span className="text-caption text-s-muted">{where.join(" · ")}</span> : <span className="text-caption text-s-muted">Not used on any screen now</span>}
      </div>
      <span className={cn("rounded-ui-lg px-2 py-0.5 text-caption", approved ? "bg-s-green/14 text-s-ok-text" : "bg-s-card-line text-s-muted")}>{approved ? "Approved" : "Off"}</span>
      <Button kind={approved ? "danger" : "neutral"} disabled={busy} onClick={() => onChange(!approved)}>
        {approved ? "Remove approval" : "Approve"}
      </Button>
    </div>
  );
}

export function ActionsSection() {
  const { settings, save } = useStore();
  const { state, uses, log, load, setState } = useActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const change = async (c: { approve?: string[]; revoke?: string[]; testMode?: boolean }) => {
    setBusy(true);
    const r = await changeActions(c);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setError(undefined);
    setState(r);
    void load();
  };
  const used = distinctCommands(uses);
  // approved commands no screen names now stay listed, so they can be taken back
  const orphans = (state?.approved ?? []).filter((c) => !used.includes(c));
  return (
    <>
      <Group title="From the panel">
        <Card>
          <SwitchRow
            id="action-runner"
            label="Run commands from the panel"
            hint="Keys and touch actions may start programs on this PC: only the commands approved below, and only from this PC's kiosk unless editing from other devices is on. Takes effect after a restart."
            checked={settings.actionRunner === true}
            onChange={(v) => void save("actionRunner", v)}
          />
          <SwitchRow
            id="obs-stream-control"
            label="Go live and stop in OBS from the panel"
            hint="Offers OBS: go live or stop as a touch action. It always asks for a 0.6 s hold first. Takes effect after a restart."
            checked={settings.obsStreamControl === true}
            onChange={(v) => void save("obsStreamControl", v)}
          />
          <SwitchRow
            id="action-test-mode"
            label="Test mode"
            hint="Commands are checked and logged but never started: the panel says what would run."
            checked={state?.testMode === true}
            disabled={!state || busy}
            onChange={(v) => void change({ testMode: v })}
          />
        </Card>
      </Group>
      <Group title="Commands" navSection="action-commands">
        <Card id="action-commands">
          {state === null && <Row label="The server can't be reached" hint="Start the server to see and approve the commands your screens run." />}
          {state && used.length + orphans.length === 0 && <Row label="No commands yet" hint="A key or a touch action that runs a command shows here, off until you approve it." />}
          {state &&
            [...used, ...orphans].map((c) => (
              <CommandRow
                key={c}
                command={c}
                where={uses.filter((u) => u.command === c).map((u) => `${u.profile} › ${u.where}`)}
                approved={state.approved.includes(c)}
                busy={busy}
                onChange={(approve) => void change(approve ? { approve: [c] } : { revoke: [c] })}
              />
            ))}
        </Card>
        {error && (
          <p role="alert" className="m-0 pl-0.5 text-caption text-s-red">
            {error}
          </p>
        )}
      </Group>
      <Group title="Log" navSection="action-log">
        <Card id="action-log">
          {log.length === 0 ? (
            <Row label="Nothing has run yet" hint="Every command the panel asks for is logged here: run, tested, refused or failed." />
          ) : (
            [...log]
              .reverse()
              .slice(0, LOG_SHOWN)
              .map((e, i) => (
                <div key={`${e.at}-${i}`} className="flex flex-wrap items-center gap-3 px-[18px] py-2.5">
                  <span className={cn("rounded-ui-lg px-2 py-0.5 text-caption", OUTCOMES[e.outcome]?.className)}>{OUTCOMES[e.outcome]?.label ?? e.outcome}</span>
                  <code className="min-w-0 flex-1 break-all font-mono text-caption text-s-t1">{e.command ?? "(no command read)"}</code>
                  <span className="text-caption text-s-muted">
                    {[e.reason ? (REASONS[e.reason] ?? e.reason) : "", e.from, new Date(e.at).toLocaleString()].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))
          )}
        </Card>
      </Group>
    </>
  );
}
