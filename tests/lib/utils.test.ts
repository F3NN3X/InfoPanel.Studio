import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a type-scale size next to a text colour", () => {
    expect(cn("text-micro", "text-ui-4")).toBe("text-micro text-ui-4");
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-micro", "text-caption")).toBe("text-caption");
  });

  it("lets a stock or arbitrary size replace a type-scale size", () => {
    expect(cn("text-micro", "text-sm")).toBe("text-sm");
    expect(cn("text-[10px]", "text-micro")).toBe("text-micro");
  });
});
