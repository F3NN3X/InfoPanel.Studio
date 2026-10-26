import { describe, expect, it } from "vitest";
import { sizeFollowing } from "@/components/templates/use-size-choice";

const START = { width: 1024, height: 600 };

describe("the size a picked template comes at", () => {
  it("is its own, a preset or not, even when it fits the start size's shape", () => {
    expect(sizeFollowing({ fits: ["strip", "standard"], size: { width: 1600, height: 300 } }, START)).toEqual({ width: 1600, height: 300 });
    expect(sizeFollowing({ fits: ["standard"], size: { width: 1000, height: 700 } }, START)).toEqual({ width: 1000, height: 700 });
  });

  it("without a size of its own, is the start size when it fits that shape, else the first preset of its shape", () => {
    expect(sizeFollowing({ fits: ["standard", "tall"] }, START)).toEqual(START);
    expect(sizeFollowing({ fits: ["tall"] }, START)).toEqual({ width: 480, height: 1920 });
  });
});
