// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings, Status, Touchscreen, TouchConfig, TouchView } from "@/settings/types";

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
  experimentalTouch: false,
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
  runningConfig: { listen: "lan", port: 3922, debug: false, allowedHosts: [], allowRemoteEdit: false },
  errorCode: null,
  failedAt: null,
  suggestedPort: null,
};

const config: TouchConfig = {
  panels: [{ id: "panel-1", name: "Panel 1", device: { vid: null, pid: null, port: null }, monitor: null, panel: { width_px: 1920, height_px: 550, rotation: "0", flip_x: false, flip_y: false, calibration: null } }],
  gestures: { slop_px: 12, long_press_ms: 500, double_tap_gap_ms: 280, swipe_min_px: 60, flick_min_speed: 0.5, multi_finger_window_ms: 120 },
  prediction_ms: 16,
  touch_dots: false,
  debug: false,
  actions: {},
  testing: { enabled: false, virtual_panels: 1, replay: "all", size: [1920, 550] },
};

let saved: Settings;
let view: TouchView;
let screens: Touchscreen[];
/** What touch_set refuses, as the backend would: its reasons. */
let refuse: string[] | null;
/** Ends the running touch_setup, as tapping the last display would. */
let finishSetup: (() => void) | undefined;

const invoke = vi.fn(async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
  switch (command) {
    case "get_settings":
      return saved;
    case "server_status":
      return running;
    case "update_state":
      return { state: "current", currentVersion: "1.2.0" };
    case "list_local_addresses":
      return ["192.168.1.20"];
    case "set_setting": {
      const { key, value } = args as { key: keyof Settings; value: never };
      saved = { ...saved, [key]: value };
      return { ok: true, restartRequired: false, settings: saved };
    }
    case "touch_view":
      return { ...view, enabled: saved.experimentalTouch };
    case "touch_set":
      if (refuse) throw refuse;
      return undefined;
    case "touch_screens":
      return screens;
    case "touch_setup":
      return new Promise((resolve) => (finishSetup = () => resolve([{ port: "USBROOT(0)-4.2", monitor: "\\\\.\\DISPLAY4" }])));
    case "touch_cancel":
      finishSetup?.();
      return undefined;
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

const touchSets = () => invoke.mock.calls.filter(([c]) => c === "touch_set").map(([, a]) => a);

async function openTouchPage() {
  const user = userEvent.setup({ delay: null });
  render(<SettingsApp />);
  await user.click(await screen.findByRole("button", { name: "Touch" }));
  return user;
}

describe("Settings › Touch", () => {
  beforeEach(() => {
    saved = { ...settingsDefaults };
    view = { enabled: false, file: {}, file_error: null, effective: config, defaults: config, issues: [], panels: [], path: "C:\\cfg\\touch.json" };
    screens = [];
    refuse = null;
    invoke.mockClear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("is off by default, shows no panels, and turns on with its switch", async () => {
    const user = await openTouchPage();
    expect(screen.getByText("Experimental")).toBeTruthy();
    expect(screen.queryByText("Panels")).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Touch panels" }));
    expect(saved.experimentalTouch).toBe(true);
    expect(await screen.findByText("Panels")).toBeTruthy();
  });

  it("gives each panel a kiosk URL on this computer, even when the server listens on the network", async () => {
    saved.experimentalTouch = true;
    await openTouchPage();
    expect(await screen.findByText("http://127.0.0.1:3922/?kiosk=1&touch=panel-1")).toBeTruthy();
  });

  it("writes the panel list out before the first change to one panel", async () => {
    saved.experimentalTouch = true;
    const user = await openTouchPage();
    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Left bar{Enter}");
    expect(touchSets()).toEqual([
      { key: "panels", value: [{}] },
      { key: "panels.0.name", value: "Left bar" },
    ]);
  });

  it("says why touch.json refused a change", async () => {
    saved.experimentalTouch = true;
    refuse = ["gestures: slop_px must be > 0"];
    const user = await openTouchPage();
    const slop = await screen.findByRole("spinbutton", { name: "Tap slop" });
    await user.clear(slop);
    await user.type(slop, "0{Enter}");
    expect(await screen.findByText("Not saved: gestures: slop_px must be > 0")).toBeTruthy();
  });

  it("runs Set up panels until it is finished, then says what it bound", async () => {
    saved.experimentalTouch = true;
    const user = await openTouchPage();
    await user.click(await screen.findByRole("button", { name: "Set up panels…" }));
    expect(await screen.findByText(/Tap the circle on each touch display/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pair…" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("Set up \\\\.\\DISPLAY4.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up panels…" })).toBeTruthy();
  });

  it("shows the Zadig steps with the exact USB id for a touchscreen Windows still owns", async () => {
    saved.experimentalTouch = true;
    screens = [{ vid: 0x222a, pid: 0x1, port: "USBROOT(0)-4.2", serial: null, product: "ILITEK-TP", driver: "HidUsb", ready: false }];
    await openTouchPage();
    expect(await screen.findByText(/Windows owns it/)).toBeTruthy();
    expect(screen.getByText("222A")).toBeTruthy();
    expect(screen.getByText("0001")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Uninstall…" })).toBeNull();
  });
});
