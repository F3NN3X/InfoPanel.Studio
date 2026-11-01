import { describe, expect, it } from "vitest";
import { rovingTarget } from "@/lib/roving";

describe("rovingTarget", () => {
  it("moves with the arrows and wraps at both ends", () => {
    expect(rovingTarget("ArrowRight", 0, 3)).toBe(1);
    expect(rovingTarget("ArrowRight", 2, 3)).toBe(0);
    expect(rovingTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(rovingTarget("ArrowDown", 1, 3)).toBe(2);
    expect(rovingTarget("ArrowUp", 1, 3)).toBe(0);
  });

  it("jumps to the ends with Home and End", () => {
    expect(rovingTarget("Home", 2, 4)).toBe(0);
    expect(rovingTarget("End", 0, 4)).toBe(3);
  });

  it("ignores other keys and an empty row", () => {
    expect(rovingTarget("a", 0, 3)).toBeNull();
    expect(rovingTarget("ArrowRight", 0, 0)).toBeNull();
  });
});
