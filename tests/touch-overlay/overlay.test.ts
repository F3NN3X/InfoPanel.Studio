import { describe, expect, it } from "vitest";
import { parseRoute } from "@/touch-overlay/overlay";

describe("the touch setup overlay's route", () => {
  it("reads each overlay and its argument from the hash", () => {
    expect(parseRoute("#setup/0.2")).toEqual({ kind: "setup", radius: 0.2 });
    expect(parseRoute("#pair/Edge%20%232%20%2F%20%C3%BCn%C3%AF")).toEqual({ kind: "pair", name: "Edge #2 / ünï" });
    expect(parseRoute("#calibrate/Left")).toEqual({ kind: "calibrate", name: "Left" });
    expect(parseRoute("#identify/Left")).toEqual({ kind: "identify", name: "Left" });
  });

  it("shows nothing for an unknown or out-of-range route", () => {
    expect(parseRoute("")).toEqual({ kind: "none" });
    expect(parseRoute("#settings")).toEqual({ kind: "none" });
    expect(parseRoute("#setup/x")).toEqual({ kind: "none" });
    expect(parseRoute("#setup/0.9")).toEqual({ kind: "none" });
    expect(parseRoute("#pair/%E0%A4%A")).toEqual({ kind: "pair", name: "%E0%A4%A" });
  });
});
