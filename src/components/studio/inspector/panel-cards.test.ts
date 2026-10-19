import { describe, expect, it } from "vitest";
import type { SheetGroup } from "../category-sheet";
import { cardsBySection, panelState } from "./panel-cards";

const card = (id: string) => ({ id, title: id, terms: [], node: null });

const visual: SheetGroup[] = [{ heading: "Panel", cards: ["panel:main", "panel:layout", "panel:widgets"].map(card) }];

describe("cardsBySection", () => {
  it("files every card under its special section", () => {
    const map = cardsBySection(visual);
    expect(map.get("panel")?.map((c) => c.id)).toEqual(["panel:main"]);
    expect(map.get("panelLayout")?.map((c) => c.id)).toEqual(["panel:layout"]);
    expect(map.get("panelWidgets")?.map((c) => c.id)).toEqual(["panel:widgets"]);
    expect(map.has("panelJson")).toBe(false);
  });
});

describe("panelState", () => {
  it("reads the layout and the code view off the cards", () => {
    expect(panelState(visual, "wrap")).toEqual({ layout: "stack", codeView: false });
    const code: SheetGroup[] = [{ heading: "Panel", cards: [card("panel:main"), card("panel:code")] }];
    expect(panelState(code, "overlay")).toEqual({ layout: "overlay", codeView: true });
  });
});
