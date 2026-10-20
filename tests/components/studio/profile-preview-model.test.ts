import { describe, expect, it } from "vitest";
import { fitPage } from "@/components/studio/profile-preview-model";

describe("fitPage", () => {
  it("letterboxes a wide page by width and a tall one by height", () => {
    expect(fitPage({ width: 1920, height: 480 }, 60, 38)).toEqual({ width: 60, height: 15 });
    expect(fitPage({ width: 1080, height: 1920 }, 60, 38)).toEqual({ width: 21, height: 38 });
  });

  it("falls back to 16:9 and never collapses to nothing", () => {
    expect(fitPage({ width: 0, height: 0 }, 64, 36)).toEqual({ width: 64, height: 36 });
    expect(fitPage({ width: 100000, height: 1 }, 10, 10).height).toBeGreaterThanOrEqual(1);
  });
});
