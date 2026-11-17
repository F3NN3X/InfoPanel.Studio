import { describe, expect, it } from "vitest";
import type { ControlDisplay } from "@/lib/control";
import { displayOfPanel, linkPin, monitorLabel, panelKioskUrl, panelLine, panelOfDisplay, panelState, PANEL_STATE_TEXT } from "@/lib/touch/panels";

const connected = { status: "Connected", interface: 0, report_len: 64, port: "USBROOT(0)-4.2" } as const;
const paired = { device: { vid: null, pid: null, port: "USBROOT(0)-4.2" } };
const unpaired = { device: { vid: null, pid: null, port: null } };
const display = (over: Partial<ControlDisplay>): ControlDisplay => ({ name: "panel-1", screen: "follow", firstSeen: 0, lastSeen: 0, online: true, address: "127.0.0.1", shows: "a", ...over });

describe("panelState", () => {
  it("is off while touch is off, for a display with no panel, and for a stopped device", () => {
    expect(panelState({ enabled: false, entry: paired, status: connected, screens: [] })).toBe("off");
    expect(panelState({ enabled: true, entry: undefined, status: undefined, screens: [] })).toBe("off");
    expect(panelState({ enabled: true, entry: paired, status: { status: "Stopped" }, screens: [] })).toBe("off");
  });

  it("is ready only connected and paired; connected and not pinned is not paired", () => {
    expect(panelState({ enabled: true, entry: paired, status: connected, screens: [] })).toBe("ready");
    expect(panelState({ enabled: true, entry: unpaired, status: connected, screens: [] })).toBe("not-paired");
  });

  it("blames the driver when a touchscreen Windows owns is plugged in, else says the panel isn't connected", () => {
    expect(panelState({ enabled: true, entry: paired, status: { status: "Disconnected" }, screens: [{ ready: false }] })).toBe("needs-driver");
    expect(panelState({ enabled: true, entry: paired, status: { status: "Disconnected" }, screens: [{ ready: true }] })).toBe("not-connected");
    expect(panelState({ enabled: true, entry: paired, status: { status: "Error", message: "x" }, screens: null })).toBe("not-connected");
    expect(panelState({ enabled: true, entry: paired, status: null, screens: null })).toBe("not-connected");
  });

  it("has words for every state", () => {
    expect(Object.values(PANEL_STATE_TEXT)).toEqual(["Off", "Needs driver", "Not paired", "Panel not connected", "Ready"]);
  });
});

describe("a panel and its display", () => {
  it("has a kiosk URL on this computer with no profile pin", () => {
    const url = panelKioskUrl(3922, "panel-1");
    expect(url).toBe("http://127.0.0.1:3922/?kiosk=1&touch=panel-1");
    expect(url).not.toContain("profile=");
  });

  it("is the display named after its id, and an id that can't be a display name has none", () => {
    const panels = [{ id: "panel-1" }, { id: "has space" }];
    expect(panelOfDisplay(panels, "panel-1")).toBe(panels[0]);
    expect(panelOfDisplay(panels, "has space")).toBeUndefined();
    expect(panelOfDisplay(panels, undefined)).toBeUndefined();
    expect(displayOfPanel([display({})], { id: "panel-1" })?.name).toBe("panel-1");
    expect(displayOfPanel([display({})], { id: "has space" })).toBeUndefined();
  });

  it("reads a link's &profile= pin as a display that shows another screen than the one chosen", () => {
    expect(linkPin(display({ screen: "a", shows: "b" }))).toBe("b");
    expect(linkPin(display({ screen: "a", shows: "a" }))).toBeUndefined();
    expect(linkPin(display({ screen: "follow", shows: "b" }))).toBeUndefined();
    expect(linkPin(undefined)).toBeUndefined();
  });
});

describe("panelLine", () => {
  const entry = { name: "Panel 1", monitor: { name: "\\\\.\\DISPLAY4", position: null } };
  it("says where touches go when ready and shown, and what is missing otherwise", () => {
    expect(panelLine("ready", entry, true)).toBe("Ready: touches go to the kiosk on DISPLAY4");
    expect(panelLine("ready", { ...entry, monitor: null }, true)).toBe("Ready: touches go to the kiosk on its display");
    expect(panelLine("ready", entry, false)).toBe("Connected, but no display shows its kiosk yet");
    expect(panelLine("not-paired", entry, false)).toBe("Connected, but not paired with its screen yet");
    expect(panelLine("needs-driver", entry, false)).toContain("WinUSB");
  });

  it("drops a monitor's device prefix", () => {
    expect(monitorLabel("\\\\.\\DISPLAY4")).toBe("DISPLAY4");
    expect(monitorLabel("DELL")).toBe("DELL");
  });
});
