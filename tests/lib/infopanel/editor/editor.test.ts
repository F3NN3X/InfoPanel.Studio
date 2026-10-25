import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import { SCHEMAS } from "@/lib/infopanel/schema.ts";
import { commit, redo, start, undo } from "@/lib/infopanel/editor/history.ts";
import { groupItems, ungroupAt } from "@/lib/infopanel/editor/groups.ts";
import { duplicate, itemAt, moveBy, removeAll, reorder, setBox, setField, topmost } from "@/lib/infopanel/editor/ops.ts";
import { checkValue, fieldsOf, labelOf } from "@/lib/infopanel/editor/registry.ts";

const item = (type: string, fields = "") => `<DisplayItem xsi:type="${type}DisplayItem">${fields}</DisplayItem>`;
const parse = (body: string) =>
  parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + body + "</ArrayOfDisplayItem>").items;

// 0: a, 1: g { 1.0: b, 1.1: c }, 2: d
const tree = parse(
  item("Text", "<Name>a</Name><X>0</X><Y>0</Y>") +
    item("Group", "<Name>g</Name><X>5</X><Y>5</Y><DisplayItems>" + item("Text", "<Name>b</Name><X>10</X><Y>10</Y>") + item("Text", "<Name>c</Name><X>20</X><Y>20</Y>") + "</DisplayItems>") +
    item("Text", "<Name>d</Name><X>30</X><Y>30</Y>"),
);
const names = (items: typeof tree): unknown =>
  items.map((i) => (i.kind === "Group" ? { [i.Name]: names(i.DisplayItems) } : i.Name));

describe("ops", () => {
  it("moves a group with all of its children, and does not move a child twice", () => {
    const moved = moveBy(tree, ["1", "1.0"], 3, -2);
    expect([itemAt(moved, "1")!.X, itemAt(moved, "1.0")!.X, itemAt(moved, "1.1")!.Y]).toEqual([8, 13, 18]);
    expect(itemAt(tree, "1.0")!.X).toBe(10); // unchanged original
  });

  it("removes several items, nested ones included", () => {
    expect(names(removeAll(tree, ["0", "1.1"]))).toEqual([{ g: ["b"] }, "d"]);
    expect(names(removeAll(tree, ["1", "1.0"]))).toEqual(["a", "d"]);
  });

  it("reorders within the parent and reports the new path", () => {
    const r = reorder(tree, "1.0", 1);
    expect([names(r.items), r.path]).toEqual([["a", { g: ["c", "b"] }, "d"], "1.1"]);
    expect(reorder(tree, "0", -1).path).toBe("0");
  });

  it("groups siblings at the first one's place and ungroups in place", () => {
    const g = groupItems(tree, ["2", "0"], "new") as Extract<ReturnType<typeof groupItems>, { ok: true }>;
    expect([names(g.items), g.path]).toEqual([[{ new: ["a", "d"] }, { g: ["b", "c"] }], "0"]);
    const u = ungroupAt(tree, "1")!;
    expect([names(u.items), u.paths]).toEqual([["a", "b", "c", "d"], ["1", "2"]]);
  });

  it("duplicates next to each original, offset by 10 px, with correct paths", () => {
    const d = duplicate(tree, ["0", "2"]);
    expect(names(d.items)).toEqual(["a", "a", { g: ["b", "c"] }, "d", "d"]);
    expect(d.paths.map((p) => itemAt(d.items, p)!.X)).toEqual([40, 10]);
    expect(d.paths.sort()).toEqual(["1", "4"]);
  });

  it("writes a resize back to the item's own fields", () => {
    const img = parse(item("Image", "<Scale>200</Scale>") + item("Text", "<Height>0</Height>") + item("Shape"));
    let t = setBox(img, "0", { x: 1.4, y: 2, width: 100, height: 50 });
    expect(itemAt(t, "0")).toMatchObject({ X: 1, Y: 2, Width: 50, Height: 25 });
    t = setBox(t, "1", { x: 0, y: 0, width: 80, height: 30 });
    expect(itemAt(t, "1")).toMatchObject({ Width: 80, Height: 0 });
    t = setBox(t, "2", { x: 0, y: 0, width: 80, height: 30 });
    expect(itemAt(t, "2")).toMatchObject({ Width: 80, Height: 30 });
  });

  it("sets one field and keeps the rest", () => {
    const t = setField(tree, "1.1", "Name", "z");
    expect(names(t)).toEqual(["a", { g: ["b", "z"] }, "d"]);
    expect(t[0]).toBe(tree[0]);
  });

  it("keeps only topmost paths", () => {
    expect(topmost(["1", "1.0", "1.0.2", "2", "1"])).toEqual(["1", "2"]);
  });
});

describe("history", () => {
  it("undoes and redoes commits; a new commit drops the redo branch", () => {
    let h = commit(commit(start(1), 2), 3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(redo(h).present).toBe(3);
    h = commit(h, 4);
    expect([h.present, h.future]).toEqual([4, []]);
    expect(undo(undo(undo(h))).present).toBe(1);
  });
});

describe("inspector registry", () => {
  it("lists every schema field of a kind, grouped", () => {
    for (const kind of Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[]) {
      expect(fieldsOf(kind).map((f) => f.name).sort()).toEqual(Object.keys(SCHEMAS[kind]).sort());
    }
    const groups = [...new Set(fieldsOf("Sensor").map((f) => f.group))];
    expect(groups.slice(0, 3)).toEqual(["Item", "Position", "Sensor"]);
    expect(fieldsOf("Sensor").every((f) => f.group !== "Other")).toBe(true);
  });

  it("labels fields in sentence case", () => {
    expect([labelOf("MultiplicationModifier"), labelOf("X"), labelOf("FontSize")]).toEqual(["Multiplication modifier", "X", "Font size"]);
  });

  it("checks values as InfoPanel's setters do", () => {
    const f = (kind: keyof typeof SCHEMAS, name: string) => fieldsOf(kind).find((x) => x.name === name)!.spec;
    expect(checkValue(f("Text", "FontSize"), "0")).toEqual({ ok: false, reason: "InfoPanel ignores this value" });
    expect(checkValue(f("Text", "FontSize"), "12")).toEqual({ ok: true, value: 12 });
    expect(checkValue(f("Text", "X"), "1.5").ok).toBe(false);
    expect(checkValue(f("Text", "Color"), "ff00ff")).toEqual({ ok: true, value: "#FF00FF" });
    expect(checkValue(f("Text", "GlowRadius"), "50")).toEqual({ ok: true, value: 20 });
    expect(checkValue(f("Shape", "Type"), "Blob").ok).toBe(false);
    expect(checkValue(f("Clock", "Format"), "HH:mm").ok).toBe(true);
  });
});
