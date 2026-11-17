import { afterEach, describe, expect, it } from "vitest";
import { addBlock, addOption, blockAt, newRecipe, pickBinding, recipeIssues, updateBlock, withFormat } from "@/components/widgets-page/builder-model";
import { clipboard, copyOf, copyStyle, optionKeysIn, pasteBlocks, pasteStyle, renameOptionIn, setClipboard, setStyleClipboard, styleClipboard } from "@/components/widgets-page/clipboard";
import type { Block, Recipe } from "@/widgets/recipe/types";

// The builder's clipboard (Phase B1, G10): blocks copied with the options they name and the pictures they show, pasted where Add
// would put a block, refused where a move would be, and bringing the options along into another recipe. Each paste is checked by
// the validator, so what it makes is a recipe the page can store.

const CPU = "amd_ryzen_9_9950x3d";
const errorsOf = (r: Recipe) => recipeIssues(r).filter((i) => i.severity === "error").map((i) => i.message);
const kids = (r: Recipe, path: number[]) => (blockAt(r, path) as Extract<Block, { children: Block[] }>).children.map((b) => b.name ?? b.type);

/** A CPU card whose ring lets people pick the CPU (a device option `cpu`), shown only while a toggle `showRing` is on. */
function cpuCard(): Recipe {
  const ring = addBlock(newRecipe("CPU card", new Set()), [], "ring", `libre.${CPU}_cpu_total`);
  const picked = pickBinding(ring.recipe, ring.path, { cpu: [CPU] });
  const toggled = addOption(picked, { key: "showRing", label: "Show the ring", type: "boolean", default: true });
  return addBlock(updateBlock(toggled, ring.path, { when: { option: "showRing", is: true } }), [], "label", "x.y").recipe;
}

afterEach(() => setClipboard(null));

describe("copy", () => {
  it("takes copies of the blocks, the options they name, and nothing for the root", () => {
    const r = cpuCard();
    const clip = copyOf(r, [[0], []], [], "a")!;
    expect(clip.blocks).toHaveLength(1);
    expect(clip.blocks[0]).not.toBe(r.root.children[0]);
    expect(clip.options.map((o) => o.key)).toEqual(["cpu", "showRing"]);
    expect(copyOf(r, [[]], [], "a")).toBeUndefined();
    setClipboard(clip);
    expect(clipboard()).toBe(clip);
  });

  it("finds every option a block names: a binding, a key's device, a Repeat's list, a condition, a follow", () => {
    const rep = addBlock(newRecipe("W", new Set()), [], "repeat", "x.y");
    const r = updateBlock(rep.recipe, rep.path, { max: { option: "layout", map: { a: 1 } }, when: { option: "show", is: true } });
    expect([...optionKeysIn(blockAt(r, rep.path)!)].sort()).toEqual(["layout", "places", "show"]);
    const moved = renameOptionIn(blockAt(r, rep.path)!, "layout", "layout2");
    expect(moved).toMatchObject({ max: { option: "layout2", map: { a: 1 } }, over: "places" });
    expect(renameOptionIn({ type: "ring", bind: { sensor: "libre.{cpu}_x" } }, "cpu", "gpu")).toEqual({ type: "ring", bind: { sensor: "libre.{gpu}_x" } });
  });
});

describe("paste", () => {
  it("lands after the selection, or inside it when it holds blocks, and the recipe stays valid", () => {
    const r = cpuCard(); // card[ ring, label ]
    const clip = copyOf(r, [[0]], [], "a")!;
    const after = pasteBlocks(r, [0], clip, []);
    if ("why" in after) throw new Error(after.why);
    expect(kids(after.recipe, [])).toEqual(["ring", "ring", "label"]);
    expect(after.paths).toEqual([[1]]);
    expect(after.added).toEqual([]);
    expect(errorsOf(after.recipe)).toEqual([]);
    const row = addBlock(r, [], "row", "x.y");
    const inside = pasteBlocks(row.recipe, row.path, clip, []);
    if ("why" in inside) throw new Error(inside.why);
    expect(inside.paths).toEqual([[2, 0]]);
  });

  it("is refused with the reason a move would give", () => {
    const rep = addBlock(newRecipe("W", new Set()), [], "repeat", "x.y");
    const clip = copyOf(rep.recipe, [rep.path], [], "a")!;
    expect(pasteBlocks(rep.recipe, rep.path, clip, [])).toEqual({ why: "A Repeat can't go inside another Repeat" });
    const field = addBlock(rep.recipe, rep.path, "value", "x.y");
    expect(pasteBlocks(rep.recipe, [], copyOf(field.recipe, [field.path], [], "a")!, [])).toEqual({ why: "Value reads each place's weather: it goes inside a Repeat only" });
  });

  it("into another recipe brings the options the blocks name: the target's own when it serves, else added under a free key", () => {
    const clip = copyOf(cpuCard(), [[0]], [], "a")!;
    const empty = newRecipe("Other", new Set());
    const into = pasteBlocks(empty, [], clip, []);
    if ("why" in into) throw new Error(into.why);
    expect(into.recipe.options.map((o) => o.key)).toEqual(["cpu", "showRing"]);
    expect(into.added).toEqual(["CPU", "Show the ring"]);
    expect(errorsOf(into.recipe)).toEqual([]);
    // the target has a CPU device option of its own (another label) and a different option under showRing: the device is used,
    // the toggle comes along as showRing2 and the block names it
    let other = addOption(newRecipe("Other", new Set()), { key: "cpu", label: "Processor", type: "device", kind: "cpu", default: "auto" });
    other = addOption(other, { key: "showRing", label: "Ring size", type: "number", default: 2, min: 1, max: 4 });
    const both = pasteBlocks(other, [], clip, []);
    if ("why" in both) throw new Error(both.why);
    expect(both.recipe.options.map((o) => o.key)).toEqual(["cpu", "showRing", "showRing2"]);
    expect(both.added).toEqual(["Show the ring"]);
    expect(blockAt(both.recipe, both.paths[0])).toMatchObject({ bind: { sensor: "libre.{cpu}_cpu_total" }, when: { option: "showRing2", is: true } });
    expect(errorsOf(both.recipe)).toEqual([]);
  });

  it("brings a Repeat's place list and its sample, and a picture's file", () => {
    const rep = addBlock(newRecipe("W", new Set()), [], "repeat", "x.y");
    const into = pasteBlocks(newRecipe("Other", new Set()), [], copyOf(rep.recipe, [rep.path], [], "a")!, []);
    if ("why" in into) throw new Error(into.why);
    expect(into.recipe.options.map((o) => o.type)).toEqual(["place-list"]);
    expect(into.recipe.sample.items?.places).toHaveLength(3);
    const img = addBlock(newRecipe("P", new Set()), [], "image", "x.y");
    const file = { path: "images/image.png", bytes: new Uint8Array([1, 2]) };
    const pic = copyOf(img.recipe, [img.path], [file, { path: "images/other.png", bytes: new Uint8Array([3]) }], "a")!;
    expect(pic.images).toEqual([file]);
    const pasted = pasteBlocks(newRecipe("Q", new Set()), [], pic, []);
    if ("why" in pasted) throw new Error(pasted.why);
    expect(pasted.images).toEqual([file]);
  });
});

// builder plan Phase 2: Copy style and Paste style. A block's look keys go onto blocks of any type, each taking the keys its type holds
// with values its type takes; the rest are named, and a paste that gives a block nothing is refused.
describe("copy and paste style", () => {
  afterEach(() => setStyleClipboard(null));
  /** A Ring, a Bar, a Value and a Label at the root. */
  function looks(): Recipe {
    let r = newRecipe("Looks", new Set());
    for (const type of ["ring", "bar", "value", "label"] as const) r = addBlock(r, [], type, "libre.cpu_total").recipe;
    return r;
  }

  it("copies a block's style keys, unset ones too, and none of its data", () => {
    const r = updateBlock(looks(), [0], { color: "series-2", thickness: 12, opacity: 60 });
    const clip = copyStyle(r, [0])!;
    expect(clip).toMatchObject({ type: "ring", name: "Ring" });
    expect(clip.style).toEqual({ color: "series-2", thresholds: undefined, opacity: 60, center: undefined, scale: undefined, thickness: 12, tone: undefined });
    expect(Object.keys(clip.style)).not.toContain("bind");
  });

  it("pastes the keys another type holds and names the ones it can't", () => {
    const r = updateBlock(looks(), [0], { color: "series-2", thickness: 12, center: false, thresholds: { warn: 60, crit: 80 } });
    const out = pasteStyle(r, [[1]], copyStyle(r, [0])!);
    if ("why" in out) throw new Error(out.why);
    expect(blockAt(out.recipe, [1])).toMatchObject({ type: "bar", color: "series-2", thresholds: { warn: 60, crit: 80 } });
    expect(out.skipped).toEqual(["centre value", "thickness"]);
    expect(errorsOf(out.recipe)).toEqual([]);
    // an unset key of the copy unsets it on the block it goes onto
    const plain = pasteStyle(out.recipe, [[1]], copyStyle(looks(), [0])!);
    if ("why" in plain) throw new Error(plain.why);
    expect(blockAt(plain.recipe, [1])).not.toHaveProperty("thresholds");
    expect(blockAt(plain.recipe, [1])).toMatchObject({ color: "accent" });
  });

  it("leaves a value a type can't take: a Value's text colour on a Ring, a Row's stretch on a Label", () => {
    let r = updateBlock(looks(), [2], { color: "muted", scale: 1.4 });
    const out = pasteStyle(r, [[0]], copyStyle(r, [2])!);
    if ("why" in out) throw new Error(out.why);
    expect(blockAt(out.recipe, [0])).toMatchObject({ color: "accent", scale: 1.4 });
    expect(out.skipped).toContain("colour");
    r = addBlock(r, [], "row", "x.y").recipe;
    r = updateBlock(r, [4], { align: "stretch", gap: 4 });
    const label = pasteStyle(r, [[3]], copyStyle(r, [4])!);
    expect(label).toEqual({ why: "Label can't take the style of Row" });
  });

  it("pastes onto every selected block, and a format 2 key makes the recipe format 2 through withFormat", () => {
    const r = updateBlock(looks(), [3], { align: "center", weight: "semibold" });
    expect(r.format).toBe(1);
    const out = pasteStyle(r, [[2], [3]], copyStyle(r, [3])!);
    if ("why" in out) throw new Error(out.why);
    expect(blockAt(out.recipe, [2])).toMatchObject({ align: "center", weight: "semibold" });
    expect(out.skipped).toEqual([]);
    const saved = withFormat(out.recipe);
    expect(saved.format).toBe(2);
    expect(errorsOf(saved)).toEqual([]);
  });

  it("keeps the session's style slot apart from the blocks' clipboard", () => {
    const r = looks();
    setStyleClipboard(copyStyle(r, [0])!);
    expect(styleClipboard()?.type).toBe("ring");
    expect(clipboard()).toBeNull();
  });
});
