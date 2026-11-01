import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, CircleCheck, CirclePause, CircleStop, Copy, ExternalLink, Monitor, Network, Play, RefreshCw, RotateCcw, Shield, type LucideIcon } from "lucide-react";
import { HELP_LINKS } from "@/help/links";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { displayAddress, formatUptime, megabytes, serverCard, type CalloutAction, type ServerIcon } from "../model/cards";
import { parseHosts, parsePort } from "../model/restart";
import { useFound, useStore } from "../store";
import type { ForeignInfo, Listen, ServerStats } from "../types";
import { Button, Card, Group, HeroCard, radioProps, Row, StateTile, SwitchRow, useFlag } from "../ui";

const SERVER_ICONS: Record<ServerIcon, LucideIcon> = { running: CircleCheck, stopped: CirclePause, error: CircleAlert, restarting: RefreshCw };

/** How often the stats strip refreshes while the page is open. */
const STATS_MS = 5000;
/** How long a typed port waits for more digits before it is saved. */
const PORT_DEBOUNCE_MS = 600;

function StatusCard() {
  const { status, lanIp, setStatus, save, toast, go } = useStore();
  const card = serverCard(status, lanIp, Date.now());
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [foreign, setForeign] = useState<ForeignInfo | null>(null);
  const running = status.state === "running";
  const Icon = SERVER_ICONS[card.icon];

  useEffect(() => {
    if (!running) return setStats(null);
    let alive = true;
    const poll = () => document.visibilityState === "visible" && void ipc.serverStats().then((s) => alive && setStats(s)).catch(() => {});
    poll();
    const timer = setInterval(poll, STATS_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [running]);

  useEffect(() => {
    if (status.state !== "foreign_dashboard") return setForeign(null);
    let alive = true;
    void ipc.foreignServerInfo().then((info) => alive && setForeign(info)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [status.state]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  const start = () => run(async () => setStatus(await ipc.startServer()));
  const stop = () => run(async () => setStatus(await ipc.stopServer()));
  const restart = () => run(async () => setStatus(await ipc.restartServer()));
  const useForeign = () =>
    run(async () => {
      const r = await ipc.useForeignServer();
      if (!r.ok) toast(r.message, true);
    });
  const usePort = (port: number) =>
    run(async () => {
      if ((await save("port", port)).ok) setStatus(await ipc.startServer());
    });

  const act = (a: CalloutAction) => {
    switch (a.kind) {
      case "use-port":
        return <CalloutButton key={a.kind} onClick={() => void usePort(a.port)} disabled={busy}>{`Use ${a.port}`}</CalloutButton>;
      case "logs":
        return <CalloutButton key={a.kind} onClick={() => go("logs")}>View logs</CalloutButton>;
      case "use-foreign":
        return foreign?.adoptable ? <CalloutButton key={a.kind} onClick={() => void useForeign()} disabled={busy}>Use it</CalloutButton> : null;
    }
  };

  const cells = [
    { k: "Address", v: running ? displayAddress(status.host, status.port, lanIp) : "—" },
    { k: "Uptime", v: running && stats?.uptimeMs != null ? formatUptime(stats.uptimeMs) : "—" },
    { k: "Clients", v: running ? String(stats?.clients ?? 0) : "0" },
    { k: "Memory", v: running && stats?.rssBytes != null ? megabytes(stats.rssBytes) : "—" },
  ];

  return (
    <HeroCard id="server-card" className="flex flex-col gap-[18px] p-5">
      <div className="flex flex-wrap items-center gap-3.5">
        <StateTile tone={card.tone}>
          <Icon className={cn("h-6 w-6", card.icon === "restarting" && "animate-spin")} />
        </StateTile>
        <div className="flex min-w-[140px] flex-1 flex-col gap-[3px]">
          <span className="text-base font-semibold">{card.title}</span>
          <span className="text-[12.5px] text-s-muted">{card.detail}</span>
        </div>
        <div className="flex gap-2">
          {card.canStop && (
            <Button size="md" disabled={busy} onClick={() => void stop()}>
              <CircleStop className="h-[17px] w-[17px]" />
              Stop
            </Button>
          )}
          {card.canRestart && (
            <Button size="md" disabled={busy} onClick={() => void restart()}>
              <RotateCcw className="h-[17px] w-[17px]" />
              Restart
            </Button>
          )}
          {card.canStart && (
            <Button kind="accent" size="md" disabled={busy} onClick={() => void start()}>
              <Play className="h-[17px] w-[17px]" />
              Start server
            </Button>
          )}
        </div>
      </div>
      {card.callout && (
        <div role="alert" className="flex flex-wrap items-center gap-2.5 rounded-[9px] border border-s-red/30 bg-s-red/10 px-3 py-2.5 text-[12.5px] text-[oklch(0.85_0.08_25)]">
          <CircleAlert className="h-[17px] w-[17px] shrink-0" />
          <span className="min-w-[140px] flex-1">{card.callout.message}</span>
          {card.callout.actions.map(act)}
          {status.state !== "foreign_dashboard" && (
            <CalloutButton onClick={() => void ipc.openHelp(HELP_LINKS.serverWontStart).catch((e) => toast(errorText(e), true))}>Learn more</CalloutButton>
          )}
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-px overflow-hidden rounded-[10px] border border-s-divider bg-s-divider">
        {cells.map((c) => (
          <div key={c.k} className="flex flex-col gap-1 bg-s-side px-3.5 py-3">
            <span className="text-[11.5px] text-s-dim">{c.k}</span>
            <span className="truncate font-mono text-[15px] font-medium">{c.v}</span>
          </div>
        ))}
      </div>
    </HeroCard>
  );
}

function CalloutButton({ children, onClick, disabled }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 cursor-pointer whitespace-nowrap rounded-[7px] border border-s-red/40 bg-transparent px-2.5 text-xs text-[oklch(0.9_0.06_25)] hover:bg-s-red/10 disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

const LISTEN_OPTIONS: { value: Listen; icon: LucideIcon; label: string }[] = [
  { value: "local", icon: Monitor, label: "Only this PC (localhost)" },
  { value: "lan", icon: Network, label: "Local network" },
];

function ListenRow() {
  const { settings, save, lanIp } = useStore();
  const found = useFound("listen");
  return (
    <div ref={found.ref} className={cn("flex flex-col gap-2.5 px-[18px] py-3.5", found.className)}>
      <div className="flex flex-col gap-[3px]">
        <span className="text-[13.5px] font-medium">Who can connect</span>
        <span className="text-[12.5px] text-s-muted">Where the kiosk and studio are allowed to load from.</span>
      </div>
      <div role="radiogroup" aria-label="Who can connect" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
        {LISTEN_OPTIONS.map((o) => {
          const on = settings.listen === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void save("listen", o.value)}
              {...radioProps(LISTEN_OPTIONS.map((x) => x.value), settings.listen, o.value, (v) => void save("listen", v))}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-left text-s-t1",
                on ? "border-s-accent bg-s-accent/10" : "border-s-input-line bg-s-input hover:bg-s-divider"
              )}
            >
              <o.icon className={cn("mt-px h-5 w-5 shrink-0", on ? "text-s-accent-text" : "text-s-muted")} />
              <span className="flex flex-col gap-[3px]">
                <span className="text-[13px] font-medium">{o.label}</span>
                <span className="font-mono text-xs text-s-muted">{o.value === "local" ? "127.0.0.1" : `0.0.0.0${lanIp ? ` · ${lanIp}` : ""}`}</span>
              </span>
            </button>
          );
        })}
      </div>
      {settings.listen === "lan" && (
        <div className="flex items-start gap-2 text-[12.5px] leading-[1.45] text-[oklch(0.86_0.1_80)]">
          <Shield className="mt-px h-4 w-4 shrink-0" />
          Anyone on your network can open the kiosk and the studio. Windows may ask to allow it through the firewall.
        </div>
      )}
    </div>
  );
}

function PortRow() {
  const { settings, save, setPortInvalid } = useStore();
  const [draft, setDraft] = useState(String(settings.port));
  const input = useRef<HTMLInputElement>(null);
  const parsed = parsePort(draft);

  // The last value sent: a rejected port isn't sent again until the field holds something else.
  const tried = useRef<number | null>(null);
  // Saved: typing that port again later (after an Undo) is a new attempt.
  const clearOnSuccess = (r: { ok: boolean }) => {
    if (r.ok) tried.current = null;
  };
  // Undo and "Use <port>" change the saved port from outside the field.
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(String(settings.port));
  }, [settings.port]);

  useEffect(() => {
    setPortInvalid(parsed === null);
    return () => setPortInvalid(false);
  }, [parsed, setPortInvalid]);

  const commit = () => {
    if (parsed === null || parsed === settings.port) return;
    tried.current = parsed;
    void save("port", parsed).then(clearOnSuccess);
  };
  useEffect(() => {
    if (parsed === null || parsed === settings.port || parsed === tried.current) return;
    const timer = setTimeout(() => {
      tried.current = parsed;
      void save("port", parsed).then(clearOnSuccess);
    }, PORT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [parsed, settings.port, save]);

  return (
    <Row id="port" label="Port" hint={parsed === null ? "Use a number from 1024 to 65535." : "1024 – 65535"} hintClass={parsed === null ? "text-s-red" : undefined} hintAlert={parsed === null}>
      <input
        ref={input}
        value={draft}
        inputMode="numeric"
        maxLength={5}
        aria-label="Port"
        aria-invalid={parsed === null}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={cn("h-[34px] w-24 rounded-lg border bg-s-input px-2.5 text-right font-mono text-[13.5px] text-s-t1 outline-none", parsed === null ? "border-s-red" : "border-s-input-line")}
      />
    </Row>
  );
}

/** The extra host names the request guard accepts; only meaningful on the network. */
function AllowedHostsRow() {
  const { settings, save } = useStore();
  const [draft, setDraft] = useState(settings.allowedHosts.join(", "));
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // A rejected entry stays in the field, with the reason, for the user to fix.
  const rejected = useRef(false);

  useEffect(() => {
    if (!rejected.current && document.activeElement !== input.current) setDraft(settings.allowedHosts.join(", "));
  }, [settings.allowedHosts]);

  const commit = async () => {
    const hosts = parseHosts(draft);
    if (hosts.join("\n") === settings.allowedHosts.join("\n")) return setError(null);
    rejected.current = true;
    const result = await save("allowedHosts", hosts);
    rejected.current = !result.ok;
    setError(result.ok ? null : (result.error ?? "Not saved."));
  };
  return (
    <Row
      id="allowed-hosts"
      label="Allowed host names"
      hint={error ?? "Extra names other devices use to reach the PC running InfoPanel Studio, comma separated. Requests for any other name are refused."}
      hintClass={error ? "text-s-red" : undefined}
      hintAlert={!!error}
    >
      <input
        ref={input}
        value={draft}
        placeholder="panel.lan, kiosk"
        aria-label="Allowed host names"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === "Enter" && void commit()}
        className="h-[34px] w-60 max-w-full rounded-lg border border-s-input-line bg-s-input px-2.5 text-[13px] text-s-t1 outline-none"
      />
    </Row>
  );
}

function KioskCard() {
  const { settings, status, lanIp, toast } = useStore();
  const [copied, flash] = useFlag();
  const found = useFound("kiosk");
  // The running server's config, not unsaved edits.
  const listen = status.runningConfig?.listen ?? settings.listen;
  const port = status.runningConfig?.port ?? settings.port;
  const url = `http://${listen === "lan" && lanIp ? lanIp : "127.0.0.1"}:${port}/?kiosk=1`;
  const copy = () => void navigator.clipboard.writeText(url).then(flash, () => toast("Could not copy.", true));
  return (
    <Group title="Kiosk">
      <div ref={found.ref} className={cn("flex flex-col gap-3 rounded-xl border border-s-card-line bg-s-card px-[18px] py-4", found.className)}>
        <span className="text-[12.5px] leading-[1.45] text-s-muted">Paste this into InfoPanel. It has to use the same port as the server.</span>
        <div className="flex flex-wrap gap-2">
          <div className="flex h-9 min-w-0 basis-40 flex-1 items-center truncate rounded-lg border border-s-track-line bg-s-win px-3 font-mono text-[13px]">{url}</div>
          <Button size="md" className="h-9" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="md" className="h-9" onClick={() => void ipc.openExternal(url).catch((e) => toast(errorText(e), true))}>
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>
        </div>
      </div>
    </Group>
  );
}

export function ServerSection() {
  const { settings, save } = useStore();
  return (
    <>
      <StatusCard />
      <Group title="Network">
        <Card>
          <ListenRow />
          <PortRow />
          {settings.listen === "lan" && <AllowedHostsRow />}
          {settings.listen === "lan" && (
            <SwitchRow
              id="allow-remote-edit"
              label="Allow editing from other devices"
              hint="Off: other devices can view the dashboard and kiosks, but only this computer can change it. Stream Deck and kiosk control keep working."
              checked={settings.allowRemoteEdit}
              onChange={(v) => void save("allowRemoteEdit", v)}
            />
          )}
          <SwitchRow
            id="auto-restart"
            label="Restart automatically if it crashes"
            hint="Up to 3 tries a minute, then it stays stopped and logs why."
            checked={settings.autoRestart}
            onChange={(v) => void save("autoRestart", v)}
          />
        </Card>
      </Group>
      <KioskCard />
    </>
  );
}
