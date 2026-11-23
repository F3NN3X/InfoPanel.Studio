import { cn } from "@/lib/utils";
import type { Phase } from "@/settings/types";
import type { NavTarget } from "./studio-nav";
import type { ApiLink } from "./use-data-api-grace";

/** The server as the status bar knows it: the desktop shell's (port, LAN, phase) or the page's own host. */
export type StatusServer =
  | { kind: "desktop"; port: number; lan?: boolean; phase?: Phase }
  | { kind: "browser"; host: string };

export type SaveState = "unsaved" | "saved" | "offline";

export interface StatusBarData {
  dataApi: { state: ApiLink; latencyMs?: number | null; base: string };
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
  /** The kiosks' rotation is paused: the chip's dot is amber. */
  paused?: boolean;
  /** The sidebar carries the Data API, the server, the update and the restart: only the kiosks and the save state stay here. */
  sidebar?: boolean;
  /** The editor's hints, from 960 px: how parts snap at the start, the canvas's gestures at the end. */
  hints?: { snap?: string; canvas: string };
  /** The top bar shows the saved state (from 960 px). */
  saveInBar?: boolean;
  onNavigate: (target: NavTarget) => void;
  onOpenLive: () => void;
}

export type Tone = "ok" | "warn" | "bad" | "idle";

const DOT: Readonly<Record<Tone, string>> = {
  ok: "rounded-full bg-ui-ok",
  warn: "rotate-45 rounded-[1px] bg-ui-warn",
  bad: "rounded-2 bg-ui-danger",
  idle: "rounded-full border border-ui-hint",
};

const TEXT: Readonly<Record<Tone, string>> = {
  ok: "text-ui-3",
  warn: "text-ui-warn-text",
  bad: "text-ui-danger",
  idle: "text-ui-3",
};

export interface Item {
  id: string;
  label: string;
  tone: Tone;
  tip: string;
  onClick: () => void;
}

const API_TONE: Readonly<Record<ApiLink, Tone>> = { connected: "ok", slow: "warn", reconnecting: "warn", offline: "bad" };

export function serverItem(server: StatusServer, go: (t: NavTarget) => void): Item {
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

export const updateItem = (version: string, go: (t: NavTarget) => void): Item => ({
  id: "update",
  label: `Update ${version} available`,
  tone: "warn",
  tip: "Open updates",
  onClick: () => go({ view: "settings", tab: "app", section: "updates" }),
});

export const restartItem = (go: (t: NavTarget) => void): Item => ({
  id: "restart",
  label: "Restart server to apply",
  tone: "warn",
  tip: "Server settings changed: restart the server to apply them",
  onClick: () => go({ view: "settings", tab: "app", section: "server" }),
});

const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  unsaved: "Unsaved changes",
  saved: "All changes saved",
  offline: "Offline · edits kept locally",
};

/**
 * The 28 px status bar (SPEC §3.4): Data API, server, kiosks, an update
 * and a pending restart, each a button to its home; the save state at the
 * end. Narrow windows show the dots only. Beside the sidebar it keeps the
 * kiosks and the save state, and the editor's snap and gesture hints. Pure: `useStatusBar` feeds it.
 */
export function StatusBar({ dataApi, server, kiosks, update, restartNeeded, save, kioskChip, paused, sidebar, hints, saveInBar, onNavigate, onOpenLive }: StatusBarProps) {
  const latency = typeof dataApi.latencyMs === "number" ? ` · ${dataApi.latencyMs} ms` : "";
  const items: Item[] = sidebar ? [] : [
    {
      id: "data-api",
      label: `Data API · ${dataApi.state}`,
      tone: API_TONE[dataApi.state],
      tip: `Data API at ${dataApi.base.replace(/^https?:\/\//, "")}${latency} — open Data`,
      onClick: () => onNavigate({ view: "data", section: "connection", control: "url" }),
    },
    serverItem(server, onNavigate),
    ...(update && server.kind === "desktop" ? [updateItem(update, onNavigate)] : []),
    ...(restartNeeded ? [restartItem(onNavigate)] : []),
  ];
  return (
    <footer className="flex h-7 shrink-0 items-center gap-0.5 border-t border-ui-subtle bg-ui-chrome px-2 font-ui text-micro text-ui-3">
      {hints?.snap && (
        <span data-testid="snap-label" className="whitespace-nowrap px-2">
          {hints.snap}
        </span>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.tip}
          aria-description={item.tip}
          onClick={item.onClick}
          className={cn(
            "flex h-5.5 items-center gap-1.5 whitespace-nowrap rounded-5 px-2 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
            TEXT[item.tone]
          )}
        >
          <span aria-hidden className={cn("h-1.75 w-1.75 shrink-0", DOT[item.tone])} />
          <span className="max-bar:sr-only">{item.label}</span>
        </button>
      ))}
      {kioskChip && (
        // Plain text with a dot like its neighbours: green while a kiosk is attached, amber when the rotation is paused, hollow with none.
        <button
          type="button"
          title="Open Live control"
          onClick={onOpenLive}
          className={cn(
            "flex h-5.5 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-5 px-2 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
            TEXT[kiosks > 0 ? "ok" : "idle"]
          )}
        >
          <span aria-hidden className={cn("h-1.75 w-1.75 shrink-0", DOT[kiosks === 0 ? "idle" : paused ? "warn" : "ok"])} />
          <span className="truncate max-bar:sr-only">{kioskChip}</span>
        </button>
      )}
      <div className="flex-1" />
      {hints && <span className="truncate px-2">{hints.canvas}</span>}
      {!saveInBar && (
        <span role="status" className="whitespace-nowrap px-2">
          {SAVE_TEXT[save]}
        </span>
      )}
    </footer>
  );
}
