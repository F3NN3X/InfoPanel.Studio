// @vitest-environment happy-dom
// Settings › Widget publishers: the only place a widget publisher key is trusted or removed (Phase 6a). The page sends the
// app's own commands (`trust_widget_key`, `remove_widget_key`) with what was typed, and shows what the store answers.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings, Status, WidgetKey } from "@/settings/types";

const settings = {
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
} as Settings;

const stopped = { state: "stopped", owned: false, host: "127.0.0.1", port: 3922, origin: "http://127.0.0.1:3922", appVersion: "1.2.0", debug: false } as unknown as Status;

const BUILT_IN: WidgetKey[] = [
  { id: "owner", kind: "owner", name: "InfoPanel Studio", fingerprint: null, publishers: ["infopanel", "infopanel-studio"], state: "not-set-up" },
  { id: "themely", kind: "themely", name: "Themely", fingerprint: null, publishers: ["themely"], state: "not-available" },
];
const KEY = "untrusted comment: minisign public key FD89B8C08B250DF6\nRWT2DSWLwLiJ/R3yCSMOm1bMXAq1Zu42G02bJDSXnlkLVehd0UfIXLrs";

let keys: WidgetKey[];
let refuse: string | null;

const invoke = vi.fn(async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
  switch (command) {
    case "get_settings":
      return settings;
    case "server_status":
      return stopped;
    case "update_state":
      return { state: "current", currentVersion: "1.2.0" };
    case "widget_keys":
      return keys;
    case "trust_widget_key": {
      if (refuse) throw refuse;
      const { name, publishers } = args as { name: string; publishers: string[] };
      keys = [...keys, { id: "FD89B8C08B250DF6", kind: "user", name, fingerprint: "FD89B8C08B250DF6", publishers, state: "trusted" }];
      return keys;
    }
    case "set_widget_key_pack_scripts": {
      const { id, allowed } = args as { id: string; allowed: boolean };
      keys = keys.map((k) => (k.id === id ? { ...k, packScripts: allowed } : k));
      return keys;
    }
    case "remove_widget_key":
      keys = keys.filter((k) => k.id !== (args as { id: string }).id);
      return keys;
    default:
      throw new Error(`unexpected command ${command}`);
  }
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: Record<string, unknown>) => invoke(c, a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isMaximized: async () => false, onResized: async () => () => {}, minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() }),
}));

const { SettingsApp } = await import("@/settings/app");

async function openPage() {
  const user = userEvent.setup({ delay: null });
  render(<SettingsApp />);
  await user.click(await screen.findByRole("button", { name: "Widget publishers" }));
  await screen.findByText("Themely");
  return user;
}

const calls = (command: string) => invoke.mock.calls.filter(([c]) => c === command).map(([, a]) => a);

describe("Settings › Widget publishers", () => {
  beforeEach(() => {
    keys = [...BUILT_IN];
    refuse = null;
    invoke.mockClear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the owner's empty slot and Themely's disabled one, with nothing to remove", async () => {
    await openPage();
    expect(screen.getByText("Not set up")).toBeTruthy();
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove key" })).toBeNull();
  });

  it("adds a named key with its publisher names, then removes it by its fingerprint", async () => {
    const user = await openPage();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
    await user.type(screen.getByRole("textbox", { name: /Publisher names/ }), "acme, acme-labs");
    await user.type(screen.getByRole("textbox", { name: "minisign public key" }), KEY);
    await user.click(screen.getByRole("button", { name: "Add key" }));
    expect(calls("trust_widget_key")).toEqual([{ name: "Acme", key: KEY, publishers: ["acme", "acme-labs"] }]);
    const row = (await screen.findByText("Key ID FD89B8C08B250DF6")).closest("[data-key]") as HTMLElement;
    expect(within(row).getByText("Signs for: acme, acme-labs")).toBeTruthy();
    await user.click(within(row).getByRole("button", { name: "Remove key" }));
    expect(calls("remove_widget_key")).toEqual([{ id: "FD89B8C08B250DF6" }]);
    expect(await screen.findByText("None yet.")).toBeTruthy();
  });

  it("a key you added allows pack scripts only once switched on here; a built-in key has no switch", async () => {
    keys = [...BUILT_IN, { id: "FD89B8C08B250DF6", kind: "user", name: "Acme", fingerprint: "FD89B8C08B250DF6", publishers: ["acme"], state: "trusted", packScripts: false }];
    const user = await openPage();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    const toggle = screen.getByRole("switch", { name: "Allow pack scripts for Acme" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    expect(calls("set_widget_key_pack_scripts")).toEqual([{ id: "FD89B8C08B250DF6", allowed: true }]);
    expect((await screen.findByRole("switch", { name: "Allow pack scripts for Acme" })).getAttribute("aria-checked")).toBe("true");
  });

  it("says why the store refused a key, and keeps what was typed", async () => {
    refuse = "the publisher name infopanel is reserved for a built-in key";
    const user = await openPage();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Mine");
    await user.type(screen.getByRole("textbox", { name: /Publisher names/ }), "infopanel");
    await user.type(screen.getByRole("textbox", { name: "minisign public key" }), KEY);
    await user.click(screen.getByRole("button", { name: "Add key" }));
    expect(await screen.findByText(/reserved for a built-in key/)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Mine");
  });
});
