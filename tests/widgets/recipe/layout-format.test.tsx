import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withFormat } from "@/components/widgets-page/builder-model";
import { packageOf } from "@/widgets/recipe/package";
import RecipeView, { readingHolds } from "@/widgets/recipe/RecipeView";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { checkPackage, floorAt, validateRecipe } from "@/widgets/recipe/validate";
import { fixtureFiles, fixtureRecipe } from "./fixture-files";

// The builder plan's Phase 5 and 6 keys (recipe format 2): a grid's tracks and its blocks' areas, background layers, a block's part of
// its column or row, a condition on a reading, and a motion. Each is checked for its round trip, its format, the validator's rules with
// their edges, and how the renderer draws it.

const SENSOR = "libre.amd_ryzen_9_9950x3d_cpu_total";
/** The CPU card with `blocks` as its root's blocks (its sample keeps the CPU's readings). */
const withBlocks = (blocks: Block[], edit?: (r: Recipe) => void): Recipe => {
  const r = fixtureRecipe("cpu-card");
  r.root.children = blocks;
  edit?.(r);
  return withFormat(r);
};
const value = (extra: Partial<Block> = {}): Block => ({ type: "value", bind: { sensor: SENSOR }, label: "Load", ...extra }) as Block;
const label = (text: string, extra: Partial<Block> = {}): Block => ({ type: "label", text, ...extra }) as Block;
const grid = (children: Block[], extra: Record<string, unknown> = {}): Block => ({ type: "grid", tracks: { cols: [1, 2], rows: [1, 1] }, children, ...extra }) as Block;
const issuesOf = async (r: Recipe) => validateRecipe({ files: await packageOf(r, []) });
const rules = async (r: Recipe) => [...new Set((await issuesOf(r)).filter((i) => i.severity === "error").map((i) => i.rule))];
const draw = (r: Recipe) => renderToStaticMarkup(<RecipeView data={{}} recipe={r} sample />);

describe("grid tracks and areas", () => {
  it("round-trips through a package and joins format 2", async () => {
    const r = withBlocks([grid([value({ area: [1, 1, 2, 1] } as Partial<Block>), label("Note", { area: [2, 2, 1, 1] } as Partial<Block>)])]);
    expect(r.format).toBe(2);
    const checked = await checkPackage({ files: await packageOf(r, []) });
    expect(checked.issues).toEqual([]);
    expect(checked.recipe).toEqual(r);
  });

  it("an older recipe without areas reads as before (the fixtures, a grid of equal cells)", async () => {
    for (const name of ["cpu-card", "devices"]) expect((await checkPackage({ files: fixtureFiles(name) })).issues, name).toEqual([]);
    const equal = withBlocks([{ type: "grid", columns: 2, children: [value(), label("A")] }]);
    expect(await rules(equal)).toEqual([]);
    expect(draw(equal)).toContain("grid-template-columns:repeat(2, minmax(0, 1fr))");
  });

  it("overlapping areas are allowed, the later block drawn over the earlier", async () => {
    const r = withBlocks([grid([value({ area: [1, 1, 2, 2] } as Partial<Block>), label("Over", { area: [2, 1, 1, 1] } as Partial<Block>)])]);
    expect(await issuesOf(r)).toEqual([]);
    const html = draw(r);
    expect(html.indexOf('data-recipe-area="1 1 2 2"')).toBeLessThan(html.indexOf('data-recipe-area="2 1 1 1"'));
    expect(html).toContain("grid-template-columns:minmax(0, 1fr) minmax(0, 2fr)");
    // each cell a stacking context of its own, so the later one is drawn over the earlier whole
    expect(html).toContain("position:relative;isolation:isolate;grid-column:1 / span 2;grid-row:1 / span 2");
  });

  it("refuses an area outside the tracks, on a grid without tracks, out of a grid, on a Repeat, or not four whole numbers", async () => {
    expect(await rules(withBlocks([grid([value({ area: [2, 1, 2, 1] } as Partial<Block>)])]))).toEqual(["area"]);
    expect(await rules(withBlocks([grid([value({ area: [1, 3, 1, 1] } as Partial<Block>)])]))).toEqual(["area"]);
    expect(await rules(withBlocks([{ type: "grid", children: [value({ area: [1, 1, 1, 1] } as Partial<Block>)] }]))).toEqual(["area"]);
    expect(await rules(withBlocks([{ type: "row", children: [value({ area: [1, 1, 1, 1] } as Partial<Block>)] }]))).toEqual(["area"]);
    expect(await rules(withBlocks([grid([value({ area: [1, 1, 1.5, 1] } as Partial<Block>)])]))).toEqual(["area"]);
    // too few numbers are the schema's (minItems); too many the area rule's
    expect(await rules(withBlocks([grid([value({ area: [1, 1, 1] } as unknown as Partial<Block>)])]))).toEqual(["schema"]);
    expect(await rules(withBlocks([grid([value({ area: [1, 1, 1, 1, 1] } as unknown as Partial<Block>)])]))).toEqual(["area"]);
    const cores = { type: "repeat", source: "cores", area: [1, 1, 1, 1], children: [{ type: "value", bind: { field: "load" } }] } as unknown as Block;
    expect(await rules(withBlocks([grid([cores])]))).toEqual(["area"]);
    const issues = await issuesOf(withBlocks([grid([value({ area: [2, 1, 2, 1] } as Partial<Block>)])]));
    expect(issues[0].message).toBe("$.root.children[0].children[0].area: columns 2 to 3, rows 1 to 1 are outside the grid's 2 x 2 tracks");
  });

  it("refuses tracks beside columns, more than 24, a share out of range, and tracks on a row", async () => {
    expect(await rules(withBlocks([grid([value()], { columns: 2 })]))).toEqual(["grid"]);
    expect(await rules(withBlocks([grid([value()], { tracks: { cols: Array(25).fill(1), rows: [1] } })]))).toEqual(["grid"]);
    expect(await rules(withBlocks([grid([value()], { tracks: { cols: [0], rows: [1] } })]))).toEqual(["schema"]);
    expect(await rules(withBlocks([{ type: "row", tracks: { cols: [1], rows: [1] }, children: [] } as unknown as Block]))).toEqual(["grid"]);
  });
});

describe("background layers", () => {
  const picture = { path: "images/bg.png", bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
  const image = (bg: Record<string, unknown>): Block => ({ type: "image", file: "images/bg.png", background: bg }) as Block;

  it("draws a layer under its container's blocks, filled to its inset, faded and blurred, and round-trips", async () => {
    const r = withBlocks([image({ fit: "contain", position: "top", opacity: 40, blur: 4, inset: 6 }), value()]);
    const checked = await checkPackage({ files: await packageOf(r, [picture]) });
    expect(checked.issues).toEqual([]);
    expect(checked.recipe).toEqual(r);
    const html = draw(r);
    expect(html.indexOf('data-recipe-layer="background"')).toBeLessThan(html.indexOf('data-recipe-block="value"'));
    expect(html).toContain("inset:6px;opacity:0.4;filter:blur(4px)");
    expect(html).toContain("object-fit:contain;object-position:top");
  });

  it("refuses the root as one, a Repeat, more than four, a picture's keys on a mark, and one with an area", async () => {
    expect(await rules(withBlocks([value()], (r) => Object.assign(r.root, { background: {} })))).toEqual(["background"]);
    const ring = (bg: Record<string, unknown>) => ({ type: "ring", bind: { sensor: SENSOR }, background: bg }) as Block;
    expect(await rules(withBlocks([ring({}), ring({}), ring({}), ring({}), ring({})]))).toEqual(["background"]);
    expect(await rules(withBlocks([ring({}), ring({}), ring({}), ring({})]))).toEqual([]);
    expect(await rules(withBlocks([ring({ fit: "cover" })]))).toEqual(["background"]);
    expect(await rules(withBlocks([grid([{ ...ring({}), area: [1, 1, 1, 1] } as Block])]))).toEqual(["background"]);
  });

  it("warns, without refusing, of a background at over 60 % under text, and leaves it out of the text floor", async () => {
    const r = withBlocks([{ type: "ring", bind: { sensor: SENSOR }, background: {} } as Block, value()]);
    const issues = await issuesOf(r);
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([["background", "warn"]]);
    expect(issues[0].message).toMatch(/set its opacity to 60 % or lower \(a scrim\)/);
    expect(await issuesOf(withBlocks([{ type: "ring", bind: { sensor: SENSOR }, background: { opacity: 60 } } as Block, value()]))).toEqual([]);
    // a tiny text in a background is not content: under the floor it is no issue
    const tiny = withBlocks([{ type: "label", text: "x", scale: 0.5, background: {} } as Block], (x) => (x.size.min = [1, 1]));
    expect(floorAt(tiny, [1, 1])).toEqual([]);
  });
});

describe("a block's part of its column or row", () => {
  it("draws its width in a column and its height in a row, at its place", () => {
    const html = draw(withBlocks([value({ fill: 0.5, place: "center" } as Partial<Block>), { type: "row", children: [value({ fill: 0.25 } as Partial<Block>)] }]));
    expect(html).toContain("width:50%;align-self:center");
    expect(html).toContain("height:25%;align-self:flex-start");
  });

  it("refuses it in a grid, place without fill, and a fill out of range", async () => {
    expect(await rules(withBlocks([value({ fill: 0.5 } as Partial<Block>)]))).toEqual([]);
    expect(await rules(withBlocks([grid([value({ fill: 0.5 } as Partial<Block>)])]))).toEqual(["fill"]);
    expect(await rules(withBlocks([value({ place: "end" } as Partial<Block>)]))).toEqual(["fill"]);
    expect(await rules(withBlocks([value({ fill: 0 } as Partial<Block>)]))).toEqual(["schema"]);
  });
});

describe("a condition on a reading", () => {
  it("holds over, under, between and at its levels, and never without a number", () => {
    const bind = { sensor: SENSOR };
    expect(readingHolds({ bind, above: 90 }, 91)).toBe(true);
    expect(readingHolds({ bind, above: 90 }, 90)).toBe(false);
    expect(readingHolds({ bind, below: 10 }, 9)).toBe(true);
    expect(readingHolds({ bind, above: 10, below: 20 }, 15)).toBe(true);
    expect(readingHolds({ bind, above: 10, below: 20 }, 25)).toBe(false);
    expect(readingHolds({ bind, equals: 0 }, 0)).toBe(true);
    expect(readingHolds({ bind, equals: 0 }, Number.NaN)).toBe(false);
  });

  it("shows the block only while the sample reading holds", () => {
    // the CPU card's sample reads 64 % on its total
    const shown = (when: Record<string, unknown>) => draw(withBlocks([label("Hot", { when: { reading: { bind: { sensor: SENSOR }, ...when } } } as Partial<Block>)])).includes(">Hot<");
    expect(shown({ above: 50 })).toBe(true);
    expect(shown({ above: 90 })).toBe(false);
    expect(shown({ equals: 0 })).toBe(false);
  });

  it("is format 2, and refuses no level, equals beside a range, a range that never holds and a bad binding", async () => {
    const at = (reading: Record<string, unknown>) => withBlocks([label("Hot", { when: { reading } } as unknown as Partial<Block>)]);
    expect(at({ bind: { sensor: SENSOR }, above: 1 }).format).toBe(2);
    expect(await rules(at({ bind: { sensor: SENSOR }, above: 1 }))).toEqual([]);
    expect(await rules(at({ bind: { sensor: SENSOR } }))).toEqual(["block"]);
    expect(await rules(at({ bind: { sensor: SENSOR }, equals: 1, above: 0 }))).toEqual(["block"]);
    expect(await rules(at({ bind: { sensor: SENSOR }, above: 5, below: 5 }))).toEqual(["block"]);
    expect(await rules(at({ bind: { field: "temp" }, above: 1 }))).toEqual(["binding"]);
  });
});

describe("motion", () => {
  it("fades in, and pulses only while its reading is critical", () => {
    expect(draw(withBlocks([value({ motion: "fade-in" } as Partial<Block>)]))).toContain("recipe-fade-in");
    const pulse = (crit: number) => draw(withBlocks([value({ motion: "pulse", color: "thresholds", thresholds: { warn: crit - 10, crit } } as Partial<Block>)]));
    expect(pulse(60)).toContain("recipe-pulse");
    expect(pulse(90)).not.toContain("recipe-pulse");
  });

  it("refuses a pulse on a block with no warning levels", async () => {
    expect(await rules(withBlocks([value({ motion: "pulse" } as Partial<Block>)]))).toEqual(["motion"]);
    expect(await rules(withBlocks([value({ motion: "fade-in" } as Partial<Block>)]))).toEqual([]);
  });
});

describe("format", () => {
  it("each key needs format 2: a format 1 recipe using one is refused in words", async () => {
    const cases: [Block, string][] = [
      [grid([value({ area: [1, 1, 1, 1] } as Partial<Block>)]), "an area in a grid's tracks needs recipe format 2"],
      [value({ fill: 0.5 } as Partial<Block>), "a part of its column or row needs recipe format 2"],
      [value({ motion: "fade-in" } as Partial<Block>), "a motion needs recipe format 2"],
      [label("x", { when: { reading: { bind: { sensor: SENSOR }, above: 1 } } } as Partial<Block>), "a condition on a reading needs recipe format 2"],
      [{ type: "ring", bind: { sensor: SENSOR }, background: { opacity: 40 } } as Block, "a background layer needs recipe format 2"],
    ];
    for (const [block, text] of cases) {
      const r = { ...withBlocks([block]), format: 1 as const };
      const messages = (await issuesOf(r)).filter((i) => i.rule === "format").map((i) => i.message);
      expect(messages.some((m) => m.endsWith(text)), text).toBe(true);
    }
  });

  it("a recipe of a newer format is still said to be newer, before its keys", async () => {
    const r = { ...withBlocks([grid([value({ area: [1, 1, 1, 1] } as Partial<Block>)])]), format: 3 } as unknown as Recipe;
    expect((await issuesOf(r)).map((i) => i.rule)).toEqual(["format"]);
  });
});
