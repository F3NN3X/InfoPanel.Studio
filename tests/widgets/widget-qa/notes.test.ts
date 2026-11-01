import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { NOTES } from "@/widgets/widget-qa/notes";
import { viewPlans } from "@/widgets/widget-qa/plan";

describe("widget-qa notes", () => {
  it("names only registered widgets, and only spans, their own views or * as frames", () => {
    const bad = Object.entries(NOTES).flatMap(([id, notes]) => {
      const mod = modules.find((m) => m.id === id);
      if (!mod) return [`${id}: not a registered widget`];
      const views = new Set(viewPlans(mod).map((v) => `view:${v.id}`));
      return Object.entries(notes).flatMap(([key, text]) =>
        (key === "*" || /^\d+x\d+$/.test(key) || views.has(key)) && text.trim() ? [] : [`${id} ${key}: not a span, a view of the widget or *, or empty`]
      );
    });
    expect(bad).toEqual([]);
  });
});
