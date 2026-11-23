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

  it("knows the half and stat steps as sizes", () => {
    expect(cn("text-label", "text-ui-4")).toBe("text-label text-ui-4");
    expect(cn("text-small", "text-stat")).toBe("text-stat");
  });

  it("lets a later radius step replace an earlier radius", () => {
    expect(cn("rounded-7", "rounded-ui-md")).toBe("rounded-ui-md");
    expect(cn("rounded-lg", "rounded-3")).toBe("rounded-3");
    expect(cn("rounded-10", "rounded-t-2")).toBe("rounded-10 rounded-t-2");
  });
});
