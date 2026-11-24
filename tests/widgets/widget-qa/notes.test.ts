import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { NOTES, noteText } from "@/widgets/widget-qa/notes";
import { notesProblems } from "@/widgets/widget-qa/notes-file";
import { viewPlans } from "@/widgets/widget-qa/plan";

describe("widget-qa notes", () => {
  it("names only registered widgets, and only spans, their own views or * as frames", () => {
    const bad = Object.entries(NOTES).flatMap(([id, notes]) => {
      const mod = modules.find((m) => m.id === id);
      if (!mod) return [`${id}: not a registered widget`];
      const views = new Set(viewPlans(mod).map((v) => `view:${v.id}`));
      return Object.entries(notes).flatMap(([key, note]) =>
        (key === "*" || /^\d+x\d+$/.test(key) || views.has(key)) && noteText(note).trim() ? [] : [`${id} ${key}: not a span, a view of the widget or *, or empty`]
      );
    });
    expect(bad).toEqual([]);
  });

  it("holds each note as its text or { text, status } with status open or fixed, as the dev server writes it", () => {
    expect(notesProblems(NOTES)).toEqual([]);
  });
});
