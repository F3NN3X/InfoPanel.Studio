// @vitest-environment happy-dom
import { render, screen, waitFor, within } from "@testing-library/react";
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
      return new Promise((resolve) => {
        finishSetup = () => {
          // As the backend writes it: the touched panel gets the port, its monitor and the monitor's size.
          const [first, ...rest] = view.effective.panels;
          view = { ...view, effective: { ...view.effective, panels: [{ ...first, device: { ...first.device, port: "USBROOT(0)-4.2" }, monitor: { name: "\\\\.\\DISPLAY4", position: null } }, ...rest] } };
          resolve([{ port: "USBROOT(0)-4.2", monitor: "\\\\.\\DISPLAY4" }]);
        };
      });
    case "touch_cancel":
      finishSetup?.();
      return undefined;
    case "touch_identify":
      return undefined;
    default:
      throw new Error(`unexpected command ${command}`);
  }
});

/** The screen choice Settings › Touch posts on the control channel. */
const control = vi.hoisted(() => ({ post: vi.fn(async () => null) }));
vi.mock("@/lib/control", async (importOriginal) => ({ ...(await importOriginal<object>()), postControl: control.post }));

/** The server as Settings › Touch reads it: the control state's named displays, and the config's screens. */
function serve(displays: unknown[]) {
  const body = (url: string) => (url.startsWith("/api/control") ? { displays } : { profiles: [{ id: "desk", name: "Desk" }, { id: "strip", name: "Strip" }] });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(body(url)))));
}
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

  afterEach(() => {
    vi.unstubAllGlobals();
    control.post.mockClear();
  });

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

  it("guides a panel's setup step by step, and opens again at the first step not done", async () => {
    saved.experimentalTouch = true;
    screens = [{ vid: 0x222a, pid: 0x1, port: "USBROOT(0)-4.2", serial: null, product: "ILITEK-TP", driver: "WinUSB", ready: true }];
    const user = await openTouchPage();
    await user.click(await screen.findByRole("button", { name: "Set up a panel…" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("listitem", { current: "step" }).textContent).toContain("Pair it with its screen"));

    await user.click(within(dialog).getByRole("button", { name: "Pair…" }));
    expect(await within(dialog).findByText(/Tap the circle on the panel's screen/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(within(dialog).getByRole("listitem", { current: "step" }).textContent).toContain("Size and rotation"), { timeout: 3000 });
    expect((within(dialog).getByRole("spinbutton", { name: "Width" }) as HTMLInputElement).value).toBe("1920");

    await user.click(within(dialog).getByRole("radio", { name: "90°" }));
    await user.click(within(dialog).getByRole("button", { name: "Looks right" }));
    await waitFor(() => expect(within(dialog).getByRole("listitem", { current: "step" }).textContent).toContain("Show its kiosk in InfoPanel"));
    expect(touchSets()).toContainEqual({ key: "panels.0.panel.rotation", value: "90" });
    expect(within(dialog).getByText("http://127.0.0.1:3922/?kiosk=1&touch=panel-1")).toBeTruthy();

    // Closed and opened again: it resumes where it was.
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getAllByRole("button", { name: "Continue setup…" })[0]);
    const again = await screen.findByRole("dialog");
    expect(within(again).getByRole("listitem", { current: "step" }).textContent).toContain("Show its kiosk in InfoPanel");
  });

  it("starts at turning touch on, and at the driver while Windows owns the touchscreen", async () => {
    screens = [{ vid: 0x222a, pid: 0x1, port: "USBROOT(0)-4.2", serial: null, product: "ILITEK-TP", driver: "HidUsb", ready: false }];
    const user = await openTouchPage();
    await user.click(screen.getByRole("button", { name: "Set up a panel…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("listitem", { current: "step" }).textContent).toContain("Turn on touch panels");
    await user.click(within(dialog).getByRole("button", { name: "Turn on touch panels" }));
    expect(saved.experimentalTouch).toBe(true);
    await waitFor(() => expect(within(dialog).getByRole("listitem", { current: "step" }).textContent).toContain("Pick the touchscreen"), { timeout: 3000 });
    expect(within(dialog).getByText(/Windows owns it/)).toBeTruthy();
    expect(within(dialog).getByText("222A")).toBeTruthy();
  });

  it("names a panel set up from a display after the display, so its kiosk is that display", async () => {
    saved.experimentalTouch = true;
    screens = [{ vid: 0x222a, pid: 0x1, port: "USBROOT(0)-4.2", serial: null, product: "ILITEK-TP", driver: "WinUSB", ready: true }];
    localStorage.setItem("infopanel.touch-intent", JSON.stringify({ action: "setup", display: "hall", at: Date.now() }));
    window.location.hash = "#touch/setup";
    const user = userEvent.setup({ delay: null });
    render(<SettingsApp />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Set up touch on hall")).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Pair…" })).toBeTruthy());
    await user.click(within(dialog).getByRole("button", { name: "Pair…" }));
    await user.click(await within(dialog).findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(touchSets()).toContainEqual({ key: "panels.0.id", value: "hall" }), { timeout: 3000 });
    window.location.hash = "";
  });

  it("picks the screen a panel shows on the control channel, and says when its link pins one instead", async () => {
    saved.experimentalTouch = true;
    const shown = { name: "panel-1", screen: "follow", firstSeen: 0, lastSeen: 0, online: true, address: "127.0.0.1", shows: "desk" };
    serve([shown]);
    const user = await openTouchPage();
    const pick = await screen.findByRole("combobox", { name: "Screen for Panel 1" });
    await waitFor(() => expect(within(pick).getAllByRole("option")).toHaveLength(3));
    await waitFor(() => expect((pick as HTMLSelectElement).disabled).toBe(false));
    await user.selectOptions(pick, "strip");
    expect(control.post).toHaveBeenCalledWith("display", { action: "assign", display: "panel-1", screen: "strip" });
    expect(screen.queryByText(/Pinned by its link/)).toBeNull();
    expect(screen.getByText("http://127.0.0.1:3922/?kiosk=1&touch=panel-1").textContent).not.toContain("profile=");
  });

  it("says a panel's link pins its screen when its address has &profile= in it", async () => {
    saved.experimentalTouch = true;
    serve([{ name: "panel-1", screen: "strip", firstSeen: 0, lastSeen: 0, online: true, address: "127.0.0.1", shows: "desk" }]);
    await openTouchPage();
    expect(await screen.findByText(/Pinned by its link to Desk/)).toBeTruthy();
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
