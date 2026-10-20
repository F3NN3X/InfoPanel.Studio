import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { linkedItem, linkOf } from "./gauge-link";

const link = linkOf({ profileId: "p" }, { kind: "widget", zoneId: "z" })!;
const item = (id: string, at: string, updatedAt = "2026-01-01"): LibraryItem => ({
  id, kind: "gauge", name: id, createdAt: "2026-01-01", updatedAt, files: [], meta: {}, copies: [{ profileId: "p", zoneId: "z", at }],
});

describe("linkedItem", () => {
  it("picks the most recently linked item whatever the list order", () => {
    const old = item("old", "2026-01-02T00:00:00Z");
    const fresh = item("new", "2026-03-02T00:00:00Z");
    expect(linkedItem([fresh, old], link)?.id).toBe("new");
    expect(linkedItem([old, fresh], link)?.id).toBe("new");
  });

  it("falls back to the item's update time for a copy without a date", () => {
    const a = { ...item("a", ""), copies: [{ profileId: "p", zoneId: "z" }], updatedAt: "2026-02-01" };
    const b = { ...item("b", ""), copies: [{ profileId: "p", zoneId: "z" }], updatedAt: "2026-05-01" };
    expect(linkedItem([b, a], link)?.id).toBe("b");
  });

  it("ignores other zones and kinds", () => {
    expect(linkedItem([{ ...item("x", "1"), kind: "image" }], link)).toBeUndefined();
  });
});
