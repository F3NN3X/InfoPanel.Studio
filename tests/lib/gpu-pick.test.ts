import { describe, expect, it } from "vitest";
import { preferredGpu } from "@/lib/gpu-pick";

describe("preferredGpu", () => {
  const mem: Record<string, number> = { nvidia_geforce_rtx_4060: 8192, nvidia_geforce_rtx_4090: 24576 };
  const memory = (id: string) => mem[id] ?? NaN;

  it("picks a card over integrated graphics, even with no memory reading", () => {
    expect(preferredGpu(["amd_radeon_tm__graphics", "amd_radeon_rx_7900_xtx"], memory)).toBe("amd_radeon_rx_7900_xtx");
    expect(preferredGpu(["intel_r__uhd_graphics_770", "nvidia_geforce_rtx_4060"], memory)).toBe("nvidia_geforce_rtx_4060");
  });

  it("picks the card with the most memory, then by id", () => {
    expect(preferredGpu(["nvidia_geforce_rtx_4060", "nvidia_geforce_rtx_4090"], memory)).toBe("nvidia_geforce_rtx_4090");
    expect(preferredGpu(["b_gpu", "a_gpu"], memory)).toBe("a_gpu");
  });

  it("reads integrated graphics when there is nothing else, and nothing from no GPUs", () => {
    expect(preferredGpu(["intel_arc_graphics"], memory)).toBe("intel_arc_graphics");
    expect(preferredGpu([], memory)).toBeUndefined();
  });
});
