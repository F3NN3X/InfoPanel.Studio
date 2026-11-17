import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { lookPresetId } from "@/components/studio/look-gallery-model";
import {
  choiceOf,
  kioskPreview,
  previewOrder,
  scopeOf,
  scopeText,
  secondsLeft,
  stepPreview,
  type PreviewItem,
} from "@/components/studio/theme-live-preview-model";

const saved: AppearancePreset = { id: "look-1", name: "Mine", description: "", theme: "zinc", radius: 0.5, style: {} };
const item = (id: string): PreviewItem => ({ id, name: id, preset: { ...saved, id }, look: true });

describe("previewOrder", () => {
  it("lists Browse's groups in order: saved, imported packs, theme packs, plain themes; a shadowed pack has no card", () => {
    const order = previewOrder([saved], [{ id: "my-pack", name: "My pack" }, { id: "term", name: "Shadowed" }], ["classic", "term", "nixie"], []);
    expect(order.map((i) => i.id)).toEqual(["look-1", "my-pack", "term", "classic", "nixie"]);
    expect(order.map((i) => i.look)).toEqual([false, true, true, true, true]);
    expect(order[2].preset.id).toBe(lookPresetId("term"));
  });

  it("gives a sample theme its own colours", () => {
    const sample: AppearancePreset = { ...saved, id: lookPresetId("paper"), theme: "slate", radius: 1 };
    expect(previewOrder([], [], ["paper"], [sample])[0].preset).toMatchObject({ theme: "slate", radius: 1, style: { lookId: "paper" } });
  });
});

describe("stepPreview", () => {
  const order = ["a", "b", "c"].map(item);

  it("steps and wraps both ways", () => {
    expect(stepPreview(order, undefined, "a", 1)?.id).toBe("b");
    expect(stepPreview(order, undefined, "c", 1)?.id).toBe("a");
    expect(stepPreview(order, undefined, "a", -1)?.id).toBe("c");
  });

  it("starts at an end when nothing is shown, or the shown one is filtered out", () => {
    expect(stepPreview(order, undefined, undefined, 1)?.id).toBe("a");
    expect(stepPreview(order, ["b", "c"], "a", -1)?.id).toBe("c");
  });

  it("steps through the cards the filters leave, and has nowhere to go with one", () => {
    expect(stepPreview(order, ["c", "a"], "c", 1)?.id).toBe("a");
    expect(stepPreview(order, ["b"], "b", 1)).toBeUndefined();
    expect(stepPreview([], undefined, undefined, 1)).toBeUndefined();
  });
});

describe("scopes", () => {
  const screen = { level: "screen", profileId: "p1" } as const;
  const page = { level: "page", profileId: "p1", pageId: "g" } as const;

  it("names what the preview draws and Apply writes", () => {
    expect(scopeOf("all", page)).toEqual({ kind: "all" });
    expect(scopeOf("screen", page)).toEqual({ kind: "profile", profileId: "p1" });
    expect(scopeOf("page", page)).toEqual({ kind: "page", profileId: "p1", pageId: "g" });
    // A page choice before the view's level has moved to the page is still the screen.
    expect(scopeOf("page", screen)).toEqual({ kind: "profile", profileId: "p1" });
    expect([choiceOf(screen), choiceOf(page)]).toEqual(["screen", "page"]);
  });

  it("says where in the bar", () => {
    expect([scopeText("all", "Desk", "Main"), scopeText("screen", "Desk", "Main"), scopeText("page", "Desk", "Main")]).toEqual(["all screens", "Desk", "Desk › Main page"]);
  });
});

describe("the kiosks", () => {
  it("count down in whole seconds, never below 0", () => {
    expect([secondsLeft(60_000, 0), secondsLeft(60_000, 59_001), secondsLeft(60_000, 61_000)]).toEqual([60, 1, 0]);
  });

  it("get the preset without its template-only zone looks", () => {
    const sent = kioskPreview({ preset: { ...saved, zoneLook: { values: { opacity: 0.5 } } }, look: false, scope: { kind: "all" }, keepBackground: false });
    expect(sent.preset).toEqual(saved);
  });
});
