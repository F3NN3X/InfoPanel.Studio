// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_AUDIO, type AudioState } from "@/lib/audio-control";

const mocks = vi.hoisted(() => ({ state: null as AudioState | null, act: vi.fn(), throttled: vi.fn() }));

vi.mock("@/lib/audio-control", async (original) => ({
  ...(await original<typeof import("@/lib/audio-control")>()),
  useAudio: () => mocks.state,
  audioAct: mocks.act,
  audioActThrottled: mocks.throttled,
}));

import { audioRefusal } from "@/lib/audio-control";
import { READ_ONLY_HINT } from "@/lib/write-refusal";
import AudioButton from "@/widgets/AudioButton";
import StreamMixer from "@/widgets/StreamMixer";

const SAMPLE: AudioState = {
  windows: {
    available: true,
    outputs: [
      { id: "o1", name: "Speakers", volume: 30, muted: false, default: true },
      { id: "o2", name: "Headset", volume: 80, muted: false, default: false },
    ],
    inputs: [{ id: "i1", name: "Studio mic", volume: 60, muted: false, default: true }],
    apps: [],
  },
  wavelink: { status: "absent", channels: [], mixes: [] },
};

beforeEach(() => {
  mocks.state = SAMPLE;
  mocks.act.mockReset();
  mocks.throttled.mockReset();
  audioRefusal.set(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StreamMixer", () => {
  it("says so when Windows audio isn't available, and when Wave Link isn't running", () => {
    mocks.state = EMPTY_AUDIO;
    render(<StreamMixer data={{}} />);
    expect(screen.getByText("Audio control isn't available")).toBeTruthy();
    cleanup();
    render(<StreamMixer data={{}} source="wavelink" />);
    expect(screen.getByText("Wave Link isn't running")).toBeTruthy();
  });

  it("shows Master first, and a tap on its tile flips the mute", () => {
    render(<StreamMixer data={{}} />);
    expect(screen.getByText("Master")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Mute Master"));
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "mute", kind: "output", id: "o1" });
  });

  it("sends the dragged level of the default output, as a throttled write", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 200, height: 20, right: 200, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
    const { container } = render(<StreamMixer data={{}} />);
    const fader = container.querySelector("[data-fader]")!;
    fireEvent.pointerDown(fader, { clientX: 50, buttons: 1 });
    fireEvent.pointerMove(fader, { clientX: 150, buttons: 1 });
    fireEvent.pointerMove(fader, { clientX: 180, buttons: 0 });
    const body = (value: number) => ({ target: "windows", op: "volume", kind: "output", id: "o1", value });
    expect(mocks.throttled.mock.calls).toEqual([
      ["w:output:o1", body(25)],
      ["w:output:o1", body(75)],
    ]);
  });

  it("offers the output devices from the chevron, and a pick makes it the default", () => {
    render(<StreamMixer data={{}} />);
    fireEvent.click(screen.getByLabelText("Output device"));
    fireEvent.click(screen.getByText("Headset"));
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "default", id: "o2" });
    fireEvent.click(screen.getByLabelText("Sound settings"));
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "settings" });
  });

  it("has no output picker or settings button for Wave Link", () => {
    mocks.state = { ...SAMPLE, wavelink: { status: "up", channels: [{ id: "c1", name: "Music", type: "Channel", level: 40, muted: false, mixes: [] }], mixes: [] } };
    render(<StreamMixer data={{}} source="wavelink" />);
    expect(screen.queryByLabelText("Output device")).toBeNull();
    expect(screen.getByText("Music")).toBeTruthy();
  });
});

describe("a refused write", () => {
  it("dims the mixer and the buttons and puts the hint on them until the refusal clears", () => {
    audioRefusal.set(true);
    const { container } = render(
      <>
        <StreamMixer data={{}} />
        <AudioButton data={{}} channel="mic" />
      </>
    );
    expect(screen.getAllByTitle(READ_ONLY_HINT)).toHaveLength(2);
    expect(container.querySelectorAll(".pointer-events-none").length).toBeGreaterThan(1);
    cleanup();
    audioRefusal.set(false);
    render(<AudioButton data={{}} channel="mic" />);
    expect(screen.queryByTitle(READ_ONLY_HINT)).toBeNull();
  });
});

describe("AudioButton", () => {
  it("mutes its channel on a tap", () => {
    render(<AudioButton data={{}} channel="mic" />);
    fireEvent.click(screen.getByLabelText("Mic"));
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "mute", kind: "input", id: "i1" });
  });

  it("switches the default output, and shows it active when it is the default", () => {
    render(<AudioButton data={{}} action="output" device="o2" />);
    const button = screen.getByLabelText("Headset");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "default", id: "o2" });
    cleanup();
    render(<AudioButton data={{}} action="output" device="o1" />);
    expect(screen.getByLabelText("Speakers").getAttribute("aria-pressed")).toBe("true");
  });

  it("does nothing for a channel that isn't there", () => {
    render(<AudioButton data={{}} channel="app:gone.exe" />);
    const button = screen.getByLabelText("Audio") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
