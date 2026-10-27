import { Cast } from "lucide-react";
import type { DataApiState } from "@/lib/data-api";
import { cn } from "@/lib/utils";
import type { Phase } from "@/settings/types";
import type { NavTarget } from "./studio-nav";

/** The server as the status bar knows it: the desktop shell's (port, LAN, phase) or the page's own host. */
export type StatusServer =
  | { kind: "desktop"; port: number; lan?: boolean; phase?: Phase }
  | { kind: "browser"; host: string };

export type SaveState = "unsaved" | "saved" | "offline";

export interface StatusBarData {
  dataApi: { state: DataApiState; latencyMs?: number | null; base: string };
  server: StatusServer;
  /** Kiosks connected now. */
  kiosks: number;
  /** Desktop: the version an update offers (none: no item). */
  update?: string;
  /** Desktop: saved server settings the running server has not picked up. */
  restartNeeded: boolean;
  save: SaveState;
}

export interface StatusBarProps extends StatusBarData {
  /** Edit: what the kiosks show ("Kiosks show Main · rotation paused"), a button that opens Live. */
  kioskChip?: string;
  onNavigate: (target: NavTarget) => void;
  onOpenLive: () => void;
}

type Tone = "ok" | "warn" | "bad" | "idle";

const DOT: Readonly<Record<Tone, string>> = {
  ok: "bg-ui-success",
  warn: "bg-ui-warning",
  bad: "bg-ui-danger",
  idle: "bg-ui-5",
};

const TEXT: Readonly<Record<Tone, string>> = {
  ok: "text-ui-3",
  warn: "text-[oklch(0.88_0.10_85)]",
  bad: "text-ui-danger",
  idle: "text-ui-3",
};

interface Item {
  id: string;
  label: string;
  tone: Tone;
  tip: string;
  onClick: () => void;
}

const API_TONE: Readonly<Record<DataApiState, Tone>> = { connected: "ok", slow: "warn", unreachable: "bad" };

function serverItem(server: StatusServer, go: (t: NavTarget) => void): Item {
  if (server.kind === "browser") {
    return {
      id: "server",
      label: `Served by ${server.host}`,
      tone: "ok",
      tip: "App settings live in the desktop app",
      onClick: () => go({ view: "settings", tab: "app" }),
    };
  }
  const phase = server.phase ?? "running";
  const running = phase === "running";
  const label = running ? `Server · :${server.port}${server.lan ? " · LAN" : ""}` : `Server · ${phase.replace(/_/g, " ")}`;
  const tone: Tone = running ? "ok" : phase === "starting" || phase === "restarting" ? "warn" : "bad";
  return { id: "server", label, tone, tip: "Server settings", onClick: () => go({ view: "settings", tab: "app", section: "server" }) };
}

const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  unsaved: "Unsaved changes",
  saved: "All changes saved",
  offline: "Offline · edits kept locally",
};

/**
 * The 26 px status bar (SPEC §3.4): Data API, server, kiosks, an update
 * and a pending restart, each a button to its home; the save state at the
 * end. Narrow windows show the dots only. Pure: `useStatusBar` feeds it.
 */
export function StatusBar({ dataApi, server, kiosks, update, restartNeeded, save, kioskChip, onNavigate, onOpenLive }: StatusBarProps) {
  const latency = typeof dataApi.latencyMs === "number" ? ` · ${dataApi.latencyMs} ms` : "";
  const kioskItem: Item = {
    id: "kiosks",
    label: kiosks === 0 ? "No kiosks" : `${kiosks} kiosk${kiosks === 1 ? "" : "s"}`,
    tone: kiosks === 0 ? "idle" : "ok",
    tip: "Live control",
    onClick: onOpenLive,
  };
  const items: Item[] = [
    {
      id: "data-api",
      label: `Data API · ${dataApi.state}`,
      tone: API_TONE[dataApi.state],
      tip: `Data API at ${dataApi.base.replace(/^https?:\/\//, "")}${latency} — open Data`,
      onClick: () => onNavigate({ view: "data", section: "connection", control: "url" }),
    },
    serverItem(server, onNavigate),
    kioskItem,
    ...(update && server.kind === "desktop"
      ? [
          {
            id: "update",
            label: `Update ${update} available`,
            tone: "warn" as const,
            tip: "Open updates",
            onClick: () => onNavigate({ view: "settings", tab: "app", section: "updates" }),
          },
        ]
      : []),
    ...(restartNeeded
      ? [
          {
            id: "restart",
            label: "Restart server to apply",
            tone: "warn" as const,
            tip: "Server settings changed: restart the server to apply them",
            onClick: () => onNavigate({ view: "settings", tab: "app", section: "server" }),
          },
        ]
      : []),
  ];
  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-0.5 border-t border-ui-subtle bg-ui-chrome px-2 font-ui text-[11.5px] text-ui-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.tip}
          onClick={item.onClick}
          className={cn(
            "flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
            TEXT[item.tone]
          )}
        >
          <span aria-hidden className={cn("h-[7px] w-[7px] shrink-0 rounded-full", DOT[item.tone])} />
          <span className="max-[959px]:sr-only">{item.label}</span>
        </button>
      ))}
      {kioskChip && (
        <button
          type="button"
          title="Open Live control"
          onClick={onOpenLive}
          className="flex h-[20px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-[oklch(0.78_0.15_150/0.5)] px-2 text-[11px] text-[oklch(0.88_0.10_150)] transition-colors hover:bg-[oklch(0.78_0.15_150/0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <Cast aria-hidden className="h-3 w-3 shrink-0" />
          <span className="truncate max-[959px]:sr-only">{kioskChip}</span>
        </button>
      )}
      <div className="flex-1" />
      <span role="status" className="whitespace-nowrap px-2 max-[959px]:sr-only">
        {SAVE_TEXT[save]}
      </span>
    </footer>
  );
}
