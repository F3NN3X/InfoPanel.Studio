import { describe, expect, it } from "vitest";
import type { Status, UpdateState } from "@/settings/types";
import { callout, serverCard, updateCard } from "@/settings/model/cards";

const base: Status = {
  state: "running",
  owned: true,
  host: "127.0.0.1",
  port: 3922,
  origin: "http://127.0.0.1:3922",
  studioUrl: "http://127.0.0.1:3922/?studio=1",
  kioskUrl: "http://127.0.0.1:3922/?kiosk=1",
  message: null,
  foreignVersion: null,
  appVersion: "1.2.0",
  debug: false,
  pid: 1,
  startedAt: 1,
  runningConfig: null,
  errorCode: null,
  failedAt: null,
  suggestedPort: null,
};
const status = (patch: Partial<Status>): Status => ({ ...base, ...patch });

describe("serverCard", () => {
  it("running offers Stop and Restart, with the LAN IP for a network server", () => {
    const card = serverCard(base, null, 1 + 134 * 60_000);
    expect(card).toMatchObject({ tone: "green", title: "Server running", detail: "On 127.0.0.1:3922 · up 2h 14m", canStop: true, canRestart: true, canStart: false });
    expect(serverCard(status({ host: "0.0.0.0" }), "192.168.1.20", 1 + 5000).detail).toBe("On 192.168.1.20:3922 · up 5s");
  });

  it("a server the app did not start can be restarted but not stopped", () => {
    expect(serverCard(status({ owned: false }))).toMatchObject({ canStop: false, canRestart: true });
  });

  it("stopped offers Start; starting and restarting offer nothing", () => {
    expect(serverCard(status({ state: "stopped" }))).toMatchObject({ tone: "grey", canStart: true, canStop: false });
    for (const state of ["starting", "restarting"] as const) {
      expect(serverCard(status({ state }))).toMatchObject({ tone: "amber", icon: "restarting", canStart: false, canStop: false, canRestart: false });
    }
  });

  it("a failed start is red, with the callout for its cause", () => {
    expect(serverCard(status({ state: "failed", errorCode: "OTHER", message: "exit 1" }))).toMatchObject({ tone: "red", title: "Server couldn't start", canStart: true });
  });
});

describe("callout", () => {
  it("port in use suggests the free port", () => {
    const c = callout(status({ state: "failed", errorCode: "EADDRINUSE", suggestedPort: 3923 }));
    expect(c.message).toBe("Port 3922 is already in use by another app. Pick a free port, then start the server.");
    expect(c.actions).toEqual([{ kind: "use-port", port: 3923 }]);
    // The port_in_use state without a code is the same failure.
    expect(callout(status({ state: "port_in_use", suggestedPort: 3930 })).actions).toEqual([{ kind: "use-port", port: 3930 }]);
    expect(callout(status({ state: "failed", errorCode: "EADDRINUSE" })).actions).toEqual([]);
  });

  it("EACCES says Windows blocked the port and points at the logs", () => {
    const c = callout(status({ state: "failed", errorCode: "EACCES" }));
    expect(c.message).toContain("Windows blocked port 3922");
    expect(c.actions).toEqual([{ kind: "logs" }]);
  });

  it("anything else shows the message and View logs", () => {
    expect(callout(status({ state: "failed", errorCode: "OTHER", message: "exit code 1" }))).toEqual({ message: "exit code 1", actions: [{ kind: "logs" }] });
    expect(callout(status({ state: "failed" })).actions).toEqual([{ kind: "logs" }]);
  });

  it("another dashboard server can be used", () => {
    const c = callout(status({ state: "foreign_dashboard", foreignVersion: "1.1.0" }));
    expect(c.message).toContain("version 1.1.0");
    expect(c.actions.map((a) => a.kind)).toEqual(["use-foreign"]);
    expect(serverCard(status({ state: "foreign_dashboard" })).canStart).toBe(false);
  });
});

describe("updateCard", () => {
  const now = Date.UTC(2026, 9, 20, 12, 0, 0);
  const update = (patch: Partial<UpdateState>): UpdateState => ({ state: "current", currentVersion: "1.2.0", ...patch });

  it("current shows when it last checked and offers Check now", () => {
    const card = updateCard(update({ checkedAt: now - 4 * 60_000 }), now);
    expect(card).toMatchObject({ title: "You're up to date", detail: "Version 1.2.0 · checked 4 min ago", primary: { action: "check", disabled: false } });
  });

  it("checking disables the button", () => {
    expect(updateCard(update({ state: "checking" }), now).primary).toMatchObject({ action: "check", disabled: true });
  });

  it("available offers the download with its size", () => {
    const card = updateCard(update({ state: "available", version: "1.3.0", total: 48 * 1024 * 1024 }), now);
    expect(card).toMatchObject({ title: "Version 1.3.0 is available", detail: "You have 1.2.0 · 48.0 MB download", primary: { action: "download", kind: "accent" } });
  });

  it("downloading shows the progress and offers Cancel", () => {
    const card = updateCard(update({ state: "downloading", version: "1.3.0", downloaded: 10 * 1024 * 1024, total: 40 * 1024 * 1024 }), now);
    expect(card).toMatchObject({ title: "Downloading 1.3.0", detail: "10.0 of 40.0 MB", progress: 0.25, primary: { action: "cancel" } });
    expect(updateCard(update({ state: "downloading", version: "1.3.0", downloaded: 1024 * 1024 }), now).progress).toBeNull();
  });

  it("ready offers Restart and update; installing is disabled", () => {
    expect(updateCard(update({ state: "ready", version: "1.3.0" }), now).primary).toMatchObject({ action: "install", label: "Restart and update", kind: "green", disabled: false });
    expect(updateCard(update({ state: "installing", version: "1.3.0" }), now).primary.disabled).toBe(true);
  });

  it("an error shows the reason and offers Try again", () => {
    expect(updateCard(update({ state: "error", error: "offline" }), now)).toMatchObject({ tone: "red", title: "Couldn't check for updates", detail: "offline", primary: { label: "Try again", action: "check" } });
  });
});
