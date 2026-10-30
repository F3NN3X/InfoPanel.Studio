// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS, EMPTY_TWITCH, type Extras } from "@/lib/extras";
import { obsRefusal } from "@/lib/obs-control";
import { READ_ONLY_HINT } from "@/lib/write-refusal";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null, act: vi.fn() }));

vi.mock("@/widgets/time-hooks", async (original) => ({
  ...(await original<typeof import("@/widgets/time-hooks")>()),
  useExtras: () => mocks.extras,
}));
vi.mock("@/lib/obs-control", async (original) => ({ ...(await original<typeof import("@/lib/obs-control")>()), obsAct: mocks.act }));

import ObsButton from "@/widgets/ObsButton";
import StreamControl from "@/widgets/StreamControl";

const connected = (obs: Partial<Extras["obs"]> = {}): Extras => ({
  ...EMPTY_EXTRAS,
  obs: {
    ...EMPTY_EXTRAS.obs,
    configured: true,
    connected: true,
    scenes: [
      { id: "u1", name: "Game", sub: "Main cam", icon: "sports_esports" },
      { id: "u2", name: "Chatting", sub: "", icon: "" },
    ],
    currentScene: "u1",
    mic: { name: "Mic/Aux", muted: false, level: 40 },
    replay: { active: true },
    ...obs,
  },
});

beforeEach(() => {
  mocks.extras = connected();
  mocks.act.mockReset();
  obsRefusal.set(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StreamControl", () => {
  it("says OBS is not connected when there is nothing to show", () => {
    mocks.extras = EMPTY_EXTRAS;
    render(<StreamControl data={{}} />);
    expect(screen.getByText("OBS not connected")).toBeTruthy();
  });

  it("sends the scene's id on a tap, and flips the mic and saves the replay", () => {
    render(<StreamControl data={{}} />);
    fireEvent.click(screen.getByLabelText("Chatting"));
    expect(mocks.act).toHaveBeenCalledWith({ op: "scene", id: "u2" });
    fireEvent.click(screen.getByLabelText("Mute mic"));
    expect(mocks.act).toHaveBeenCalledWith({ op: "mic" });
    fireEvent.click(screen.getByLabelText("Save replay"));
    expect(mocks.act).toHaveBeenCalledWith({ op: "replay" });
  });

  it("marks the current scene On air only while streaming", () => {
    const { rerender } = render(<StreamControl data={{}} />);
    expect(screen.queryByText("On air")).toBeNull();
    mocks.extras = connected({ streaming: true, uptime: 3725 });
    rerender(<StreamControl data={{}} />);
    expect(screen.getByText("On air")).toBeTruthy();
    expect(screen.getByText("1:02:05")).toBeTruthy();
  });

  it("leaves out the mic and replay tiles when asked, or when OBS has none", () => {
    mocks.extras = connected({ mic: null, replay: null });
    render(<StreamControl data={{}} />);
    expect(screen.queryByLabelText("Mute mic")).toBeNull();
    expect(screen.queryByLabelText("Save replay")).toBeNull();
    cleanup();
    mocks.extras = connected();
    render(<StreamControl data={{}} showMic={false} showReplay={false} />);
    expect(screen.queryByLabelText("Mute mic")).toBeNull();
    expect(screen.queryByLabelText("Save replay")).toBeNull();
  });

  it("renders with viewers from a platform", () => {
    mocks.extras = { ...connected({ streaming: true }), twitch: { ...EMPTY_TWITCH, signedIn: true, viewers: 120 } };
    render(<StreamControl data={{}} />);
    expect(screen.getAllByText(/watching/).length).toBeGreaterThan(0);
  });

  it("ticks the timer each second between the server's readings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mocks.extras = connected({ streaming: true, uptime: 100 });
    render(<StreamControl data={{}} />);
    expect(screen.getByText("0:01:40")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.getByText("0:01:41")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByText("0:01:43")).toBeTruthy();
  });

  it("shows itself read-only once the server has refused a write", () => {
    obsRefusal.set(true);
    render(<StreamControl data={{}} />);
    expect(screen.getAllByTitle(READ_ONLY_HINT).length).toBeGreaterThan(0);
    expect(screen.getByText(READ_ONLY_HINT)).toBeTruthy();
  });

  it("is read-only while OBS is not connected", () => {
    mocks.extras = connected({ connected: false });
    render(<StreamControl data={{}} />);
    fireEvent.click(screen.getByText("Chatting"));
    expect(mocks.act).not.toHaveBeenCalled();
  });
});

describe("ObsButton", () => {
  it("shows itself read-only once the server has refused a write", () => {
    obsRefusal.set(true);
    render(<ObsButton data={{}} action="mic" />);
    expect(screen.getByTitle(READ_ONLY_HINT)).toBeTruthy();
  });

  it("switches to its scene, rings while it is the current one and is off while OBS is not connected", () => {
    render(<ObsButton data={{}} action="scene" scene="u2" />);
    const other = screen.getByLabelText("Chatting");
    expect(other.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(other);
    expect(mocks.act).toHaveBeenCalledWith({ op: "scene", id: "u2" });
    cleanup();
    render(<ObsButton data={{}} action="scene" scene="u1" />);
    expect(screen.getByLabelText("Game").getAttribute("aria-pressed")).toBe("true");
    cleanup();
    mocks.extras = EMPTY_EXTRAS;
    render(<ObsButton data={{}} action="scene" scene="u1" />);
    expect((screen.getByLabelText("Scene") as HTMLButtonElement).disabled).toBe(true);
  });

  it("flips the mic, which shows muted, and saves the replay", () => {
    mocks.extras = connected({ mic: { name: "Mic/Aux", muted: true, level: 0 } });
    render(<ObsButton data={{}} action="mic" />);
    const mic = screen.getByLabelText("Mic off");
    expect(mic.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(mic);
    expect(mocks.act).toHaveBeenCalledWith({ op: "mic" });
    cleanup();
    render(<ObsButton data={{}} action="replay" />);
    fireEvent.click(screen.getByLabelText("Replay"));
    expect(mocks.act).toHaveBeenCalledWith({ op: "replay" });
  });
});
