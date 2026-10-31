// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamDeckState } from "@/lib/streamdeck";

const mocks = vi.hoisted(() => ({ state: null as StreamDeckState | null, act: vi.fn() }));

vi.mock("@/lib/streamdeck", async (original) => ({
  ...(await original<typeof import("@/lib/streamdeck")>()),
  useStreamDeck: () => mocks.state,
  deckAct: mocks.act,
}));

import { StreamDeckDevicePicker, StreamDeckGridPicker } from "@/components/studio/streamdeck-pickers";
import type { ModuleSetting } from "@/modules/types";

const def = (key: string, label: string): ModuleSetting => ({ key, label, type: "select", default: "" });
const deck = { id: "d1", name: "IPStudio", cols: 5, rows: 3, status: "ready" as const, page: { current: 0, total: 0 }, keys: [] };

beforeEach(() => {
  mocks.state = { enabled: true, pairingCode: "", devices: [deck] };
  mocks.act.mockReset();
});
afterEach(cleanup);

describe("StreamDeckDevicePicker", () => {
  it("lists the devices with their grid and keeps a stored id the server no longer has", () => {
    render(<StreamDeckDevicePicker def={def("device", "Device")} value="gone" onChange={vi.fn()} />);
    expect(screen.getByText("IPStudio · 5×3")).toBeTruthy();
    expect(screen.getByText("gone (gone)")).toBeTruthy();
  });

  it("creates a device and selects the new id", async () => {
    mocks.act.mockResolvedValue({ ok: true, status: 200, data: { id: "d2" } });
    const onChange = vi.fn();
    render(<StreamDeckDevicePicker def={def("device", "Device")} value="" onChange={onChange} />);
    fireEvent.click(screen.getByText("New device"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("d2"));
    expect(mocks.act).toHaveBeenCalledWith({ op: "create" });
  });

  it("says plainly when the server refuses", async () => {
    mocks.act.mockResolvedValue({ ok: false, status: 400, error: "Too many devices" });
    render(<StreamDeckDevicePicker def={def("device", "Device")} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("New device"));
    expect(await screen.findByText("Too many devices")).toBeTruthy();
  });
});

describe("StreamDeckGridPicker", () => {
  it("writes the grid to the device, not to the widget, from a preset or the selects", () => {
    mocks.act.mockResolvedValue({ ok: true, status: 204 });
    render(<StreamDeckGridPicker def={def("grid", "Grid")} deviceId="d1" />);
    fireEvent.click(screen.getByText("8×4"));
    expect(mocks.act).toHaveBeenLastCalledWith({ op: "grid", device: "d1", cols: 8, rows: 4 });
    fireEvent.change(screen.getByLabelText("Rows"), { target: { value: "2" } });
    expect(mocks.act).toHaveBeenLastCalledWith({ op: "grid", device: "d1", cols: 5, rows: 2 });
  });

  it("asks for a device first when none is picked", () => {
    render(<StreamDeckGridPicker def={def("grid", "Grid")} deviceId="" />);
    expect(screen.getByText("Pick a device first")).toBeTruthy();
  });
});
