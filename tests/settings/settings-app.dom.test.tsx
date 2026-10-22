// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings, Status, UpdateState } from "@/settings/types";

const settingsDefaults: Settings = {
  listen: "local",
  port: 3922,
  allowedHosts: [],
  allowRemoteEdit: false,
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
  runningConfig: { listen: "local", port: 3922, debug: false, allowedHosts: [], allowRemoteEdit: false },
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

const { SettingsApp } = await import("@/settings/app");

const setCalls = () => invoke.mock.calls.filter(([c]) => c === "set_setting").map(([, a]) => a);

async function openServerPage() {
  const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
    render(<SettingsApp />);
    await user.click(await screen.findByRole("switch", { name: "Close to tray" }));
    expect(setCalls()).toEqual([{ key: "closeToTray", value: false }]);
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Close to tray" }).getAttribute("aria-checked")).toBe("false");
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

});
