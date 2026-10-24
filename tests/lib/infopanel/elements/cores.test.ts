import { describe, expect, it } from "vitest";
import { coresLayout } from "@/lib/infopanel/elements/apply.ts";
import { detectCores } from "@/lib/infopanel/elements/cores.ts";
import type { DataApiValue } from "@/lib/infopanel/sensors.ts";

const v = (name: string, ref?: string): DataApiValue => ({ value: 1, unit: "%", name, ...(ref ? { ref } : {}) });

describe("detectCores", () => {
  it.each<[string, Record<string, DataApiValue>, string[]]>([
    [
      "AMD cores, without the total and Core Max, in core order",
      {
        a: v("AMD Ryzen 9 CPU Total", "libre:/amdcpu/0/load/0"),
        b: v("AMD Ryzen 9 CPU Core Max", "libre:/amdcpu/0/load/1"),
        c: v("AMD Ryzen 9 CPU Core #10", "libre:/amdcpu/0/load/11"),
        d: v("AMD Ryzen 9 CPU Core #2", "libre:/amdcpu/0/load/3"),
      },
      ["d", "c"],
    ],
    [
      "Intel threads, core then thread",
      {
        a: v("CPU Core #2 Thread #1", "libre:/intelcpu/0/load/3"),
        b: v("CPU Core #1 Thread #2", "libre:/intelcpu/0/load/2"),
        c: v("CPU Core #1 Thread #1", "libre:/intelcpu/0/load/1"),
      },
      ["c", "b", "a"],
    ],
    ["the first CPU only", { a: v("Core #1", "libre:/amdcpu/1/load/2"), b: v("Core #1", "libre:/amdcpu/0/load/2") }, ["b"]],
    [
      "nothing that is not a CPU load with a ref",
      {
        gpu: v("GPU Core #1", "libre:/gpu-nvidia/0/load/0"),
        clock: v("CPU Core #1", "libre:/intelcpu/0/clock/1"),
        noRef: v("CPU Core #1"),
        hwinfo: v("Core #1", "hwinfo:-1/1/0/2"),
      },
      [],
    ],
  ])("finds %s", (_label, sensors, keys) => {
    expect(detectCores(sensors).map((c) => c.key)).toEqual(keys);
  });
});

describe("coresLayout", () => {
  it("puts bars side by side with the gap, on whole pixels, filling the width", () => {
    const boxes = coresLayout({ orientation: "horizontal", gap: 2, width: 40, height: 30 }, 100, 50, 4);
    expect(boxes.map((b) => b.x)).toEqual([100, 111, 121, 132]);
    expect(boxes.at(-1)!.x + boxes.at(-1)!.width).toBe(140);
    expect(boxes.every((b) => b.y === 50 && b.height === 30)).toBe(true);
  });

  it("stacks them down when vertical, and never gives a bar 0 px", () => {
    const boxes = coresLayout({ orientation: "vertical", gap: 4, width: 100, height: 10 }, 0, 0, 8);
    expect(boxes.every((b) => b.height >= 1 && b.width === 100 && b.x === 0)).toBe(true);
    expect(coresLayout({ orientation: "vertical", gap: 4, width: 100, height: 10 }, 0, 0, 0)).toEqual([]);
  });
});
