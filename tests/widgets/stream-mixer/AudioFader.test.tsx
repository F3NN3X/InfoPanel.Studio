// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioState } from "@/lib/audio-control";

const mocks = vi.hoisted(() => ({ state: null as AudioState | null }));

vi.mock("@/lib/audio-control", async (original) => ({ ...(await original<typeof import("@/lib/audio-control")>()), useAudio: () => mocks.state }));

import AudioFader from "@/widgets/audio-fader/AudioFader";
import { MASTER_COLOR } from "@/widgets/stream-mixer/channels";

const AUDIO: AudioState = {
  windows: {
    available: true,
    outputs: [{ id: "o1", name: "Speakers", volume: 30, muted: false, default: true }],
    inputs: [],
    apps: [],
  },
  wavelink: { status: "absent", channels: [], mixes: [] },
};

afterEach(cleanup);

describe("AudioFader", () => {
  it("colours the master channel with the --w-master token, so a light card can darken it", () => {
    mocks.state = AUDIO;
    render(<AudioFader data={{}} channel="master" />);
    const mute = screen.getByLabelText(/^Mute /) as HTMLElement;
    expect(mute.style.color).toBe(MASTER_COLOR);
    expect(MASTER_COLOR).toMatch(/^var\(--w-master,/);
  });
});
