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
  studioRefresh: "idle",
  releaseHiddenStudio: "after10m",
  reduceUnfocusedAnimation: true,
  openStudioIn: "appWindow",
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
let updateNow: UpdateState = idle;

/** The saved settings the fake backend holds; set_setting changes them like the real one. */
let saved: Settings;
const invoke = vi.fn(async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
  switch (command) {
    case "get_settings":
      return saved;
    case "server_status":
      return running;
    case "update_state":
      return updateNow;
    case "list_local_addresses":
      return ["192.168.1.20"];
    case "get_diagnostics":
      return { debug: false, samples: 0, latestTime: null, series: [], logsDir: "C:\\logs", sampleEverySecs: 30, status: running };
    case "default_browser_kind":
      return "other";
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
    updateNow = idle;
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

  it("saves where the studio opens and hints when the default browser isn't Chromium", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SettingsApp />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Open the studio in" }), "defaultBrowser");
    expect(setCalls()).toEqual([{ key: "openStudioIn", value: "defaultBrowser" }]);
    expect(await screen.findByText(/isn't Chromium-based/)).toBeTruthy();
    // Opening it at every login is now a browser window each time: said, not changed.
    expect(screen.getByText(/every login opens a new browser window/)).toBeTruthy();
    expect(saved.openStudioOnLaunch).toBe(true);
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


  it("tells a Stable user about a newer beta and switches the channel on request", async () => {
    updateNow = { ...idle, newerBeta: "1.3.0-beta.35" };
    const user = userEvent.setup({ delay: null });
    render(<SettingsApp />);
    await user.click(await screen.findByRole("button", { name: "Updates" }));
    expect(await screen.findByText(/Version 1\.3\.0-beta\.35 is on the Beta channel/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Switch to Beta and check" }));
    expect(setCalls()).toEqual([{ key: "updateChannel", value: "beta" }]);
  });

  it("links the debug tools from Diagnostics only while the server runs with debug mode", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<SettingsApp />);
    await user.click(await screen.findByRole("button", { name: "Diagnostics" }));
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    unmount();

    running.runningConfig!.debug = true;
    try {
      render(<SettingsApp />);
      await user.click(await screen.findByRole("button", { name: "Diagnostics" }));
      const [qa, lab] = await screen.findAllByRole("button", { name: "Open" });
      await user.click(qa);
      await user.click(lab);
      expect(invoke).toHaveBeenCalledWith("open_external", { url: "http://127.0.0.1:3922/widget-qa" });
      expect(invoke).toHaveBeenCalledWith("open_external", { url: "http://127.0.0.1:3922/lab/" });
    } finally {
      running.runningConfig!.debug = false;
    }
  });
});
