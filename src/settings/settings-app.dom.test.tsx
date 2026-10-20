// @vitest-environment happy-dom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings, Status, UpdateState } from "./types";

const settingsDefaults: Settings = {
  listen: "local",
  port: 3922,
  allowedHosts: [],
  autoRestart: true,
  startAtLogin: true,
  openStudioOnLaunch: true,
  startServer: true,
  closeToTray: true,
  rememberBounds: true,
  zoom: 100,
  checkForUpdates: true,
  updateChannel: "stable",
  autoDownload: false,
  agents: { enabled: false },
  debug: false,
};

const running: Status = {
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
  pid: 10,
  startedAt: Date.now(),
  runningConfig: { listen: "local", port: 3922, debug: false, allowedHosts: [] },
  errorCode: null,
  failedAt: null,
  suggestedPort: null,
};
const idle: UpdateState = { state: "current", currentVersion: "1.2.0" };

/** The saved settings the fake backend holds; set_setting changes them like the real one. */
let saved: Settings;
const invoke = vi.fn(async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
  switch (command) {
    case "get_settings":
      return saved;
    case "server_status":
      return running;
    case "update_state":
      return idle;
    case "list_local_addresses":
      return ["192.168.1.20"];
    case "get_diagnostics":
      return { debug: false, samples: 0, latestTime: null, series: [], logsDir: "C:\\logs", sampleEverySecs: 30, status: running };
    case "server_stats":
      return { clients: 2, rssBytes: 83_000_000, uptimeMs: 3_600_000 };
    case "set_setting": {
      const { key, value } = args as { key: keyof Settings; value: never };
      saved = { ...saved, [key]: value };
      const rc = running.runningConfig!;
      return { ok: true, restartRequired: saved.port !== rc.port, settings: saved };
    }
    default:
      throw new Error(`unexpected command ${command}`);
  }
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: Record<string, unknown>) => invoke(c, a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

const { SettingsApp } = await import("./app");

const setCalls = () => invoke.mock.calls.filter(([c]) => c === "set_setting").map(([, a]) => a);

async function openServerPage() {
  const user = userEvent.setup();
  render(<SettingsApp />);
  await user.click(await screen.findByRole("button", { name: "Server" }));
  return { user, port: await screen.findByRole("textbox", { name: "Port" }) };
}

describe("the settings window", () => {
  beforeEach(() => {
    saved = { ...settingsDefaults };
    invoke.mockClear();
  });

  it("saves a toggle right away and says so", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await user.click(await screen.findByRole("switch", { name: "Close to tray" }));
    expect(setCalls()).toEqual([{ key: "closeToTray", value: false }]);
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Close to tray" }).getAttribute("aria-checked")).toBe("false");
  });

  it("raises the restart bar for a changed port and Undo puts the running one back", async () => {
    const { user, port } = await openServerPage();
    await user.clear(port);
    await user.type(port, "3923");
    await user.tab();
    await waitFor(() => expect(setCalls()).toEqual([{ key: "port", value: 3923 }]));
    expect(await screen.findByText("Restart the server to apply: port 3923.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(setCalls().at(-1)).toEqual({ key: "port", value: 3922 }));
    await waitFor(() => expect(screen.queryByText(/Restart the server to apply/)).toBeNull());
    expect((port as HTMLInputElement).value).toBe("3922");
  });

  it("does not save an invalid port or raise the bar", async () => {
    const { user, port } = await openServerPage();
    await user.clear(port);
    await user.type(port, "80");
    await user.tab();
    expect(await screen.findByText("Use a number from 1024 to 65535.")).toBeTruthy();
    expect(port.getAttribute("aria-invalid")).toBe("true");
    await act(async () => {});
    expect(setCalls()).toEqual([]);
    expect(screen.queryByText(/Restart the server to apply/)).toBeNull();
  });

  it("keeps the last of two fast toggles when the first answer comes back late", async () => {
    const user = userEvent.setup();
    // Hold set_setting answers so they can be released in any order.
    const pending: (() => void)[] = [];
    const backend = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (command, args) => {
      if (command !== "set_setting") return backend(command, args);
      const { key, value } = args as { key: keyof Settings; value: never };
      const snapshot = { ...saved, [key]: value };
      saved = snapshot;
      return new Promise((resolve) => pending.push(() => resolve({ ok: true, restartRequired: false, settings: snapshot })));
    });
    render(<SettingsApp />);
    const toggle = await screen.findByRole("switch", { name: "Close to tray" });
    await user.click(toggle);
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    // The second answer first, then the stale first one.
    await act(async () => pending[1]());
    await act(async () => pending[0]());
    expect(screen.getByRole("switch", { name: "Close to tray" }).getAttribute("aria-checked")).toBe("true");
    invoke.mockImplementation(backend);
  });
});
