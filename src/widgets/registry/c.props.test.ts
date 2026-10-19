import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModuleSettings, SensorMap } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import { levelDevice, type NowPlayingProps } from "../NowPlaying";
import { GROUP_C } from "./c";

const seen = vi.hoisted(() => [] as NowPlayingProps[]);
vi.mock("../NowPlaying", async (orig) => ({
  ...(await orig<typeof import("../NowPlaying")>()),
  default: (p: NowPlayingProps) => {
    seen.push(p);
    return null;
  },
}));

const SENSORS = fixtureSensors() as SensorMap;
const nowPlaying = GROUP_C.find((m) => m.id === "NowPlaying")!;
const propsFor = (saved: ModuleSettings) => {
  seen.length = 0;
  renderToString(nowPlaying.render(SENSORS, saved));
  return seen.at(-1)!;
};

describe("NowPlaying visualiser device", () => {
  it("follows the loudest live device when unset or Auto, like the legacy media modules", () => {
    expect(propsFor({}).vizDevice).toBe("");
    expect(propsFor({ liveSource: "" }).vizDevice).toBe("");
    expect(propsFor({ liveSource: "audio-meter-x" }).vizDevice).toBe("audio-meter-x");
    // the shared key since config v7 (Auto = "auto")
    expect(propsFor({ device: "audio-meter-x" }).vizDevice).toBe("audio-meter-x");
    expect(propsFor({ device: "auto" }).vizDevice).toBe("");
  });

  it("picks the loudest device for Auto, not the silent default", () => {
    const d = {
      "plugins.audio-level-meter.default-audio.audio-level": "0",
      "plugins.audio-level-meter.audio-meter-a.audio-level": "93.6",
      "plugins.audio-level-meter.audio-meter-b.audio-level": "18",
    };
    expect(levelDevice(d, "")).toBe("audio-meter-a");
    expect(levelDevice(d, "audio-meter-b")).toBe("audio-meter-b");
  });
});

describe("NowPlaying visualiser colour", () => {
  it("keeps a saved colour showing when no colour mode was ever chosen", () => {
    expect(propsFor({ vizRamp: "#d10a0a" }).vizLook?.colorMode).toBe("ramp");
  });
  it("honours an explicit colour mode over the saved colour", () => {
    expect(propsFor({ vizRamp: "#d10a0a", vizColorMode: "follow" }).vizLook?.colorMode).toBe("follow");
  });
  it("follows the theme when nothing is saved", () => {
    expect(propsFor({}).vizLook?.colorMode).toBeUndefined();
  });
});
