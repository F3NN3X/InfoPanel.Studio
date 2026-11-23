// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audioRefusal, EMPTY_AUDIO, type AudioState } from "@/lib/audio-control";
import { READ_ONLY_HINT } from "@/lib/write-refusal";

const mocks = vi.hoisted(() => ({ audio: null as AudioState | null, act: vi.fn() }));

vi.mock("@/lib/audio-control", async (original) => ({
  ...(await original<typeof import("@/lib/audio-control")>()),
  useAudio: () => mocks.audio,
  audioAct: mocks.act,
  audioActThrottled: vi.fn(),
}));

import MixerSolo from "@/widgets/mixer-solo/MixerSolo";

const app = (id: string, muted: boolean) => ({ id, name: id, deviceId: "d1", volume: 50, muted, peak: 0 });
const state = (apps: ReturnType<typeof app>[]): AudioState =>
  ({
    ...EMPTY_AUDIO,
    windows: { ...EMPTY_AUDIO.windows, outputs: [{ id: "d1", name: "Speakers", default: true, volume: 80, muted: false }], apps },
  }) as AudioState;

beforeEach(() => {
  mocks.audio = state([app("game.exe", false), app("discord.exe", false), app("music.exe", true)]);
  mocks.act.mockReset();
  audioRefusal.set(false);
});
afterEach(cleanup);

describe("MixerSolo", () => {
  it("mutes the live others on a tap, never Master, and not the one already muted", () => {
    render(<MixerSolo data={{}} channel="app:game.exe" />);
    fireEvent.click(screen.getByLabelText("Solo game.exe"));
    expect(mocks.act).toHaveBeenCalledTimes(1);
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "mute", kind: "app", id: "discord.exe" });
  });

  it("says Solo with the count once the others are muted, and a tap unmutes them again", () => {
    // another channel than the first test's: what a solo muted is remembered per channel for the page's life
    mocks.audio = state([app("game.exe", true), app("discord.exe", false), app("music.exe", true)]);
    render(<MixerSolo data={{}} channel="app:discord.exe" />);
    expect(screen.getByText("Solo · 2 muted")).toBeTruthy();
    expect(screen.getByLabelText("End solo of discord.exe").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByLabelText("End solo of discord.exe"));
    expect(mocks.act).toHaveBeenCalledTimes(2);
  });

  it("is off with no other channel to mute, or a channel that is gone", () => {
    mocks.audio = state([app("game.exe", false)]);
    render(<MixerSolo data={{}} channel="app:game.exe" />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<MixerSolo data={{}} channel="app:nope.exe" />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a reload during a solo still restores only what the solo muted", async () => {
    localStorage.clear();
    mocks.audio = state([app("game.exe", false), app("discord.exe", false), app("music.exe", true)]);
    render(<MixerSolo data={{}} channel="app:game.exe" />);
    fireEvent.click(screen.getByLabelText("Solo game.exe"));
    cleanup();
    mocks.act.mockReset();
    // the page reloads: a fresh module reads the record from storage, and the mixer now shows the solo
    vi.resetModules();
    const { default: Reloaded } = await import("@/widgets/mixer-solo/MixerSolo");
    mocks.audio = state([app("game.exe", false), app("discord.exe", true), app("music.exe", true)]);
    render(<Reloaded data={{}} channel="app:game.exe" />);
    fireEvent.click(screen.getByLabelText("End solo of game.exe"));
    expect(mocks.act).toHaveBeenCalledTimes(1);
    expect(mocks.act).toHaveBeenCalledWith({ target: "windows", op: "mute", kind: "app", id: "discord.exe" });
  });

  it("shows itself read-only once the server has refused a write", () => {
    audioRefusal.set(true);
    render(<MixerSolo data={{}} channel="app:game.exe" />);
    expect(screen.getByTitle(READ_ONLY_HINT)).toBeTruthy();
  });
});
