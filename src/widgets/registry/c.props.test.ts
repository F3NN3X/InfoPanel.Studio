import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModuleSettings, SensorMap } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import type { NowPlayingProps } from "../NowPlaying";
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

describe("NowPlaying visualiser colour", () => {
  it("keeps a saved colour showing when no colour mode was ever chosen", () => {
    expect(propsFor({ vizColor1: "#d10a0a" }).vizLook?.colorMode).toBe("ramp");
    expect(propsFor({ vizColor1: "#d10a0a" }).vizRamp).toBe("#d10a0a");
    // the key before config v8, still read
    expect(propsFor({ vizRamp: "#d10a0a" }).vizLook?.colorMode).toBe("ramp");
  });
});
