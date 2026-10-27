import { describe, expect, it } from "vitest";
import { asExported } from "@/lib/infopanel/export-view";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";

const text = (extra: Record<string, unknown> = {}) => ({ ...defaultItem("Text"), ...extra }) as DisplayItem;
const group = (kids: DisplayItem[]) => ({ ...defaultItem("Group"), DisplayItems: kids }) as DisplayItem;

describe("asExported (the InfoPanel view)", () => {
  it("draws every item as InfoPanel, drops letter spacing and hides what the export leaves out, nested too", () => {
    const items = [text({ native: true }), group([text({ letterSpacing: 5 }), text()])];
    const view = asExported(items, new Set(["1.1"]));
    expect((view[0] as { native?: boolean }).native).toBe(false);
    const kids = (view[1] as Extract<DisplayItem, { kind: "Group" }>).DisplayItems;
    expect((kids[0] as { letterSpacing?: number }).letterSpacing).toBe(0);
    expect(kids[1].Hidden).toBe(true);
  });

  it("never changes the items it was given, and gives the same array back when nothing differs", () => {
    const items = [text({ native: true, letterSpacing: 2 })];
    const copy = structuredClone(items);
    asExported(items, new Set(["0"]));
    expect(items).toEqual(copy);
    const plain = [text()];
    expect(asExported(plain, new Set())).toBe(plain);
  });
});
