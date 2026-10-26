import { describe, expect, it } from "vitest";
import { VERDICT_LABEL, classify, holdVerdict, reasonFor, type BottleneckInput, type HoldState } from "@/widgets/core/bottleneck";

const base: BottleneckInput = { gpuLoad: 50, cpuLoad: 30, cpuMaxCore: 40, vramUsed: 4000, vramTotal: 16000, fps: 120, gpuTemp: 60, thermalThrottle: false, powerThrottle: false };
const NO_SENSORS: BottleneckInput = { ...base, gpuLoad: NaN, cpuLoad: NaN, cpuMaxCore: NaN, vramUsed: NaN, vramTotal: NaN, fps: NaN, gpuTemp: NaN };

describe("classify", () => {
  it("is idle with no game and a quiet machine, and with no sensors at all", () => {
    expect(classify({ ...base, fps: 0, gpuLoad: 5 })).toBe("idle");
    expect(classify(NO_SENSORS)).toBe("idle");
  });

  it("calls a busy GPU with no frame counter a game", () => {
    expect(classify({ ...base, fps: NaN, gpuLoad: 98 })).toBe("gpu");
  });

  it("is GPU-bound at the GPU limit and CPU-bound on a busy core while the GPU has room", () => {
    expect(classify({ ...base, gpuLoad: 98, cpuMaxCore: 61 })).toBe("gpu");
    expect(classify({ ...base, gpuLoad: 92.9, cpuMaxCore: 40 })).toBe("balanced");
    expect(classify({ ...base, gpuLoad: 70, cpuMaxCore: 90 })).toBe("cpu");
    expect(classify({ ...base, gpuLoad: 70, cpuMaxCore: 84.9 })).toBe("balanced");
  });

  it("does not call the CPU the limit while the GPU is nearly full, and uses total load without a busiest core", () => {
    expect(classify({ ...base, gpuLoad: 91, cpuMaxCore: 99 })).toBe("balanced");
    expect(classify({ ...base, gpuLoad: 70, cpuMaxCore: NaN, cpuLoad: 90 })).toBe("cpu");
  });

  it("puts throttling above VRAM above the loads", () => {
    const hot = { ...base, gpuLoad: 99, vramUsed: 15900 };
    expect(classify({ ...hot, thermalThrottle: true, powerThrottle: true })).toBe("thermal");
    expect(classify({ ...hot, powerThrottle: true })).toBe("power");
    expect(classify(hot)).toBe("vram");
    expect(classify({ ...hot, vramUsed: 15199 })).toBe("gpu");
  });

  it("ignores throttle flags outside a game", () => {
    expect(classify({ ...base, fps: 0, gpuLoad: 3, thermalThrottle: true })).toBe("idle");
  });

  it("honours custom limits", () => {
    expect(classify({ ...base, gpuLoad: 80 }, { gpuAt: 75, cpuAt: 85, vramAt: 95 })).toBe("gpu");
  });
});

describe("reasonFor", () => {
  it("gives the loads and the frame rate, in small type", () => {
    expect(reasonFor("gpu", { ...base, gpuLoad: 98, cpuMaxCore: 61 })).toBe("GPU 98 % · CPU busiest core 61 % · 120 fps");
  });

  it("names the VRAM, the throttle and the idle state", () => {
    expect(reasonFor("vram", { ...base, vramUsed: 15900 })).toBe("VRAM 99 % · 15900 of 16000 MB");
    expect(reasonFor("thermal", { ...base, gpuTemp: 84.4 })).toContain("GPU 84 °C");
    expect(reasonFor("idle", { ...base, fps: 0, gpuLoad: 4 })).toBe("No game running · GPU 4 %");
    expect(VERDICT_LABEL.cpu).toBe("CPU-bound");
  });

  it("leaves out what the machine does not report", () => {
    expect(reasonFor("balanced", NO_SENSORS)).toBe("");
  });
});

describe("holdVerdict", () => {
  const hold = 5000;
  it("shows the first verdict at once", () => {
    expect(holdVerdict(undefined, "gpu", 0, hold)).toEqual({ shown: "gpu", since: 0 });
  });

  it("keeps the shown verdict until the candidate has held for the whole time", () => {
    let s: HoldState | undefined = holdVerdict(undefined, "gpu", 0, hold);
    s = holdVerdict(s, "cpu", 1000, hold);
    expect(s.shown).toBe("gpu");
    s = holdVerdict(s, "cpu", 5999, hold);
    expect(s.shown).toBe("gpu");
    s = holdVerdict(s, "cpu", 6000, hold);
    expect(s.shown).toBe("cpu");
    expect(s.pending).toBeUndefined();
  });

  it("restarts the clock when the candidate flips back or changes", () => {
    let s: HoldState | undefined = holdVerdict(undefined, "gpu", 0, hold);
    s = holdVerdict(s, "cpu", 1000, hold);
    s = holdVerdict(s, "gpu", 4000, hold); // back to the shown one: nothing pending
    expect(s.pending).toBeUndefined();
    s = holdVerdict(s, "cpu", 4500, hold);
    s = holdVerdict(s, "cpu", 9000, hold); // only 4.5 s since the new start
    expect(s.shown).toBe("gpu");
    s = holdVerdict(s, "vram", 9500, hold);
    s = holdVerdict(s, "cpu", 10_000, hold);
    expect(s).toMatchObject({ shown: "gpu", pending: "cpu", since: 10_000 });
  });

  it("flickering between two candidates never changes the shown verdict", () => {
    let s: HoldState | undefined = holdVerdict(undefined, "balanced", 0, hold);
    for (let t = 1000; t <= 60_000; t += 1000) s = holdVerdict(s, t % 2000 ? "gpu" : "cpu", t, hold);
    expect(s.shown).toBe("balanced");
  });
});
