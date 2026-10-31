// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamDeckBlock, type StreamDeckBlockProps } from "@/components/connections/streamdeck-block";
import type { Deck, StreamDeckState } from "@/lib/streamdeck";

afterEach(cleanup);

const deck = (over: Partial<Deck> = {}): Deck => ({ id: "d1", name: "IPStudio", cols: 5, rows: 3, status: "pairing", page: { current: 0, total: 0 }, keys: [], ...over });
const state = (over: Partial<StreamDeckState> = {}): StreamDeckState => ({ enabled: true, pairingCode: "AB12CD", devices: [deck()], ...over });
const props = (over: Partial<StreamDeckBlockProps> = {}): StreamDeckBlockProps => ({
  state: state(),
  onEnable: vi.fn(async () => true),
  act: vi.fn(async () => ({ ok: true, status: 204 })),
  ...over,
});

describe("StreamDeckBlock", () => {
  it("shows the pairing code big with its note and sends Pair", () => {
    const p = props();
    render(<StreamDeckBlock {...p} />);
    expect(screen.getByLabelText("Pairing code").textContent).toBe("AB12CD");
    expect(screen.getByText(/Confirm the same code in the Stream Deck app/)).toBeTruthy();
    expect(screen.getByText("Waiting for pairing", { selector: "span.text-ui-4" })).toBeTruthy();
    fireEvent.click(screen.getByText("Pair"));
    expect(p.act).toHaveBeenCalledWith({ op: "pair" });
  });

  it("hides the code once a device is ready, and says the app is absent plainly", () => {
    const { rerender } = render(<StreamDeckBlock {...props({ state: state({ devices: [deck({ status: "ready" })] }) })} />);
    expect(screen.queryByLabelText("Pairing code")).toBeNull();
    rerender(<StreamDeckBlock {...props({ state: state({ devices: [deck({ status: "absent" })] }) })} />);
    expect(screen.getByText("The Stream Deck app isn't running", { selector: "span.text-ui-4" })).toBeTruthy();
  });

  it("lists a device with its grid, renames it in place and adds another", async () => {
    const p = props();
    render(<StreamDeckBlock {...p} />);
    expect(screen.getByText("5×3")).toBeTruthy();
    const name = screen.getByLabelText("Name of IPStudio");
    fireEvent.change(name, { target: { value: "Desk deck" } });
    fireEvent.blur(name);
    await waitFor(() => expect(p.act).toHaveBeenCalledWith({ op: "rename", device: "d1", name: "Desk deck" }));
    fireEvent.click(screen.getByText("Add device"));
    expect(p.act).toHaveBeenCalledWith({ op: "create" });
  });

  it("asks in the page before forgetting, and says when the app may still list the device", async () => {
    const act = vi.fn(async () => ({ ok: true, status: 200, data: { appDevice: "kept" as const } }));
    render(<StreamDeckBlock {...props({ act })} />);
    fireEvent.click(screen.getByText("Forget"));
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm forget"));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ op: "forget", device: "d1" }));
    expect(await screen.findByText(/may still list it/)).toBeTruthy();
  });

  it("turns the connection on with the switch and shows the server's refusal", async () => {
    const p = props({ state: state({ enabled: false, devices: [] }), act: vi.fn(async () => ({ ok: false, status: 400, error: "That name is taken" })) });
    render(<StreamDeckBlock {...p} />);
    fireEvent.click(screen.getByRole("switch", { name: "Connect to the Stream Deck app" }));
    expect(p.onEnable).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("Add device"));
    expect(await screen.findByText("That name is taken")).toBeTruthy();
  });
});
