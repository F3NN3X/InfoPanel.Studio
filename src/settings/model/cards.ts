import type { Status, UpdateState } from "../types";

export type Tone = "green" | "grey" | "red" | "amber" | "blue";

export type ServerIcon = "running" | "stopped" | "error" | "restarting";

/** A fix-it the error callout offers. */
export type CalloutAction =
  | { kind: "use-port"; port: number }
  | { kind: "logs" }
  | { kind: "use-foreign" }
  | { kind: "stop-foreign" };

export interface Callout {
  message: string;
  actions: CalloutAction[];
}

export interface ServerCard {
  tone: Tone;
  icon: ServerIcon;
  title: string;
  detail: string;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  callout?: Callout;
}

/** Hours, minutes and seconds of a time of day in the local zone: `02:30:51`. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The address to show: the machine's LAN IP when the server listens on every interface. */
export function displayAddress(host: string, port: number, lanIp: string | null): string {
  return `${host === "0.0.0.0" && lanIp ? lanIp : host}:${port}`;
}

/**
 * What the server page and the sidebar pill show for a server state (SPEC 5.1). `foreign_dashboard`
 * is the one flavour the spec doesn't draw: another InfoPanel Studio server (for example
 * start-dashboard.bat) holds the port.
 */
export function serverCard(status: Status, lanIp: string | null = null, now: number = Date.now()): ServerCard {
  const address = displayAddress(status.host, status.port, lanIp);
  switch (status.state) {
    case "running":
      return {
        tone: "green",
        icon: "running",
        title: "Server running",
        detail: `On ${address}${status.startedAt ? ` · up ${formatUptime(now - status.startedAt)}` : ""}${status.owned ? "" : " · started by another program"}`,
        canStart: false,
        canStop: status.owned,
        canRestart: true,
      };
    case "stopped":
      return {
        tone: "grey",
        icon: "stopped",
        title: "Server stopped",
        detail: `The kiosk shows "can't connect" until you start it.`,
        canStart: true,
        canStop: false,
        canRestart: false,
      };
    case "starting":
    case "restarting":
      return {
        tone: "amber",
        icon: "restarting",
        title: status.state === "starting" ? "Starting…" : "Restarting…",
        detail: `Coming back on ${address}`,
        canStart: false,
        canStop: false,
        canRestart: false,
      };
    default:
      return {
        tone: "red",
        icon: "error",
        title: "Server couldn't start",
        detail: status.failedAt ? `Failed at ${clock(status.failedAt)}` : "It isn't running.",
        canStart: status.state !== "foreign_dashboard",
        canStop: false,
        canRestart: false,
        callout: callout(status),
      };
  }
}

/** The inline explanation of a failed start. */
export function callout(status: Status): Callout {
  const { port } = status;
  if (status.state === "foreign_dashboard") {
    const version = status.foreignVersion ? ` (version ${status.foreignVersion})` : "";
    return {
      message: `Another InfoPanel Studio server${version} is already running on port ${port}, for example from start-dashboard.bat. Use it, stop it, or pick another port.`,
      actions: [{ kind: "use-foreign" }, { kind: "stop-foreign" }],
    };
  }
  const code = status.errorCode ?? (status.state === "port_in_use" ? "EADDRINUSE" : "OTHER");
  if (code === "EADDRINUSE") {
    const free = status.suggestedPort;
    return {
      message: `Port ${port} is already in use by another app. Pick a free port, then start the server.`,
      actions: free ? [{ kind: "use-port", port: free }] : [],
    };
  }
  if (code === "EACCES") {
    return {
      message: `Windows blocked port ${port}. Pick another port, then start the server.`,
      actions: [{ kind: "logs" }],
    };
  }
  return { message: status.message ?? "The server stopped unexpectedly.", actions: [{ kind: "logs" }] };
}

export type UpdateIcon = "verified" | "checking" | "available" | "downloading" | "ready" | "error";
export type UpdateAction = "check" | "download" | "cancel" | "install";

export interface UpdateCard {
  tone: Tone;
  icon: UpdateIcon;
  title: string;
  detail: string;
  /** 0 to 1 while downloading; null when the size isn't known. */
  progress: number | null;
  primary: { action: UpdateAction; label: string; kind: "neutral" | "accent" | "green"; disabled: boolean };
}

const MB = 1024 * 1024;

export function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** `checked 4 min ago`: coarse, for the update card. */
export function ago(then: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

/** What the Updates page shows for an updater state (SPEC 5.3). */
export function updateCard(u: UpdateState, now: number): UpdateCard {
  const check = { action: "check" as const, label: "Check now", kind: "neutral" as const, disabled: false };
  switch (u.state) {
    case "checking":
      return {
        tone: "blue",
        icon: "checking",
        title: "Checking…",
        detail: `Version ${u.currentVersion}`,
        progress: null,
        primary: { ...check, disabled: true },
      };
    case "available":
      return {
        tone: "blue",
        icon: "available",
        title: `Version ${u.version} is available`,
        detail: `You have ${u.currentVersion}${u.total ? ` · ${megabytes(u.total)} download` : ""}`,
        progress: null,
        primary: { action: "download", label: "Download", kind: "accent", disabled: false },
      };
    case "downloading": {
      const done = u.downloaded ?? 0;
      return {
        tone: "blue",
        icon: "downloading",
        title: `Downloading ${u.version}`,
        detail: u.total ? `${(done / MB).toFixed(1)} of ${megabytes(u.total)}` : megabytes(done),
        progress: u.total ? Math.min(1, done / u.total) : null,
        primary: { action: "cancel", label: "Cancel", kind: "neutral", disabled: false },
      };
    }
    case "ready":
      return {
        tone: "green",
        icon: "ready",
        title: `${u.version} is ready to install`,
        detail: "The app and kiosk server restart; takes about 10 s.",
        progress: null,
        primary: { action: "install", label: "Restart and update", kind: "green", disabled: false },
      };
    case "installing":
      return {
        tone: "green",
        icon: "ready",
        title: `Installing ${u.version}`,
        detail: "The app restarts when it is done.",
        progress: null,
        primary: { action: "install", label: "Installing…", kind: "green", disabled: true },
      };
    case "error":
      return {
        tone: "red",
        icon: "error",
        title: "Couldn't check for updates",
        detail: u.error ?? "Something went wrong.",
        progress: null,
        primary: { ...check, label: "Try again" },
      };
    default:
      return {
        tone: "green",
        icon: "verified",
        title: "You're up to date",
        detail: `Version ${u.currentVersion}${u.checkedAt ? ` · checked ${ago(u.checkedAt, now)}` : ""}`,
        progress: null,
        primary: check,
      };
  }
}

/** `2h 14m`, `14m`, or seconds for the first minute. */
export function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
