// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeripheralsBlock, type PeripheralsBlockProps } from "@/components/connections/peripherals-block";
import type { PeripheralsSettings } from "@/lib/integrations";

const AT = 1_760_000_000;

/** Two devices as `GET /api/devices/battery` lists them: a charging mouse and a sleeping headset. */
const battery = {
  enabled: true,
  platform: "full",
  intervalSec: 60,
  lowPercent: 15,
  lastPoll: AT,
  error: null,
  devices: [
    { id: "a1", key: "hid:mouse", name: "Superlight", via: "Logitech", kind: "mouse", percent: 93, charging: true, asleep: false, connected: true, detail: "", hidden: false, renamed: false, updated: AT, graceSec: 0 },
    { id: "b2", key: "bt:headset", name: "Nova Pro", via: "HeadsetControl", kind: "headset", percent: 12, charging: false, asleep: true, connected: true, detail: "", hidden: false, renamed: false, updated: AT, graceSec: 0 },
  ],
};

const stored = (over: Partial<PeripheralsSettings> = {}): PeripheralsSettings => ({ enabled: false, intervalSec: 0, lowPercent: 0, hidden: [], names: {}, ...over });
const props = (over: Partial<PeripheralsBlockProps> = {}): PeripheralsBlockProps => ({ stored: stored(), onSave: vi.fn(async () => true), ...over });

const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => answer(battery));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PeripheralsBlock", () => {
  it("lists the devices it finds with their levels, drivers and states", async () => {
    render(<PeripheralsBlock {...props({ stored: stored({ enabled: true }) })} />);
    expect(((await screen.findByLabelText("Name of Superlight")) as HTMLInputElement).value).toBe("Superlight");
    expect((screen.getByLabelText("Name of Nova Pro") as HTMLInputElement).value).toBe("Nova Pro");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("93%")).toBeTruthy();
    expect(screen.getByText("12%")).toBeTruthy();
    expect(screen.getByLabelText("Charging")).toBeTruthy();
    expect(screen.getByText("Logitech")).toBeTruthy();
    expect(screen.getByText("HeadsetControl")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Asleep")).toBeTruthy();
    expect(screen.getByText("On · 2 devices")).toBeTruthy();
    expect(screen.getByText(/Last poll/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/devices/battery", { cache: "no-store" });
  });

  it("saves the whole section with the switch, the interval and the low mark", async () => {
    const p = props();
    render(<PeripheralsBlock {...p} />);
    fireEvent.click(screen.getByRole("switch", { name: "Poll device batteries" }));
    fireEvent.change(screen.getByLabelText("Poll every"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Low battery at"), { target: { value: "20" } });
    fireEvent.click(screen.getByText("Save peripherals"));
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith({ peripherals: { enabled: true, intervalSec: 120, lowPercent: 20, hidden: [], names: {} } }));
    // The readings are read again once the server has kept the change.
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("hides a device and renames another into the same save", async () => {
    const p = props({ stored: stored({ enabled: true }) });
    render(<PeripheralsBlock {...p} />);
    await screen.findByLabelText("Name of Superlight");
    fireEvent.click(screen.getByLabelText("Hide Superlight"));
    expect(screen.getByText("Hidden")).toBeTruthy();
    expect(screen.getByLabelText("Show Superlight")).toBeTruthy();
    const name = screen.getByLabelText("Name of Nova Pro");
    fireEvent.change(name, { target: { value: "Desk headset" } });
    fireEvent.blur(name);
    fireEvent.click(screen.getByText("Save peripherals"));
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith({ peripherals: { enabled: true, intervalSec: 60, lowPercent: 15, hidden: ["hid:mouse"], names: { "bt:headset": "Desk headset" } } }));
  });

  it("says when no device is supported, and asks again on Refresh now", async () => {
    fetchMock = vi.fn(async () => answer({ ...battery, devices: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PeripheralsBlock {...props({ stored: stored({ enabled: true }) })} />);
    expect(await screen.findByText(/No supported devices found/)).toBeTruthy();
    expect(screen.getByText("On · no devices")).toBeTruthy();
    fireEvent.click(screen.getByText("Refresh now"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("says the polling is off while the switch is off", async () => {
    render(<PeripheralsBlock {...props()} />);
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.getByText("Polling is off.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Detected devices" })).toBeNull();
  });
});
