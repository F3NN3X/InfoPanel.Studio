import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withFormat } from "@/components/widgets-page/builder-model";
import { packageOf } from "@/widgets/recipe/package";
import RecipeView from "@/widgets/recipe/RecipeView";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { checkPackage, validateRecipe } from "@/widgets/recipe/validate";
import { fixtureRecipe } from "./fixture-files";

// The free layout (recipe format 2): a card, a row or a grid with `layout: "free"`, each of its blocks at its own `box`, fractions of
// the container's content box. Its round trip, its format, the validator's rules with their edges, and how the renderer draws it.

const SENSOR = "libre.amd_ryzen_9_9950x3d_cpu_total";
/** The CPU card with `blocks` as its root's blocks, the root laid out free unless `edit` says otherwise. */
const free = (blocks: Block[], edit?: (r: Recipe) => void): Recipe => {
  const r = fixtureRecipe("cpu-card");
  r.root.children = blocks;
  r.root.layout = "free";
  edit?.(r);
  return withFormat(r);
};
const value = (box?: number[], extra: Record<string, unknown> = {}): Block => ({ type: "value", bind: { sensor: SENSOR }, label: "Load", ...(box ? { box } : {}), ...extra }) as Block;
const issuesOf = async (r: Recipe) => validateRecipe({ files: await packageOf(r, []) });
const rules = async (r: Recipe) => [...new Set((await issuesOf(r)).filter((i) => i.severity === "error").map((i) => i.rule))];
const draw = (r: Recipe) => renderToStaticMarkup(<RecipeView data={{}} recipe={r} sample />);

describe("the free layout", () => {
  it("round-trips through a package and joins format 2", async () => {
    const r = free([value([0.1, 0.2, 0.4, 0.25]), value([0.5, 0.2, 0.4, 0.25])]);
    expect(r.format).toBe(2);
    const checked = await checkPackage({ files: await packageOf(r, []) });
    expect(checked.issues).toEqual([]);
    expect(checked.recipe).toEqual(r);
  });

  it("draws each block at its box in per cent, in order, each its own stacking context", () => {
    const html = draw(free([value([0.1, 0.2, 0.4, 0.25]), value([0.05, 0.1, 0.9, 0.5])]));
    const first = html.indexOf('data-recipe-box="0.1 0.2 0.4 0.25"');
    const second = html.indexOf('data-recipe-box="0.05 0.1 0.9 0.5"');
    expect(first).toBeGreaterThan(-1);
    // the later block is drawn after (over) the earlier
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('class="absolute isolate flex min-h-0 min-w-0 items-center" style="left:10%;top:20%;width:40%;height:25%"');
    expect(html).toContain('data-recipe-free=""');
  });

  it("a free container with no blocks is a valid recipe", async () => {
    expect(await issuesOf(free([]))).toEqual([]);
    expect(await issuesOf(free([{ type: "card", layout: "free", children: [] } as unknown as Block], (r) => (r.root.layout = undefined)))).toEqual([]);
  });

  it("free in a nested card, a row and a grid; a background in a free container needs no box", async () => {
    const nested = (type: string) => free([{ type, layout: "free", box: [0, 0, 1, 1], children: [value([0, 0, 0.5, 0.5])] } as unknown as Block]);
    for (const type of ["card", "row", "grid"]) expect(await issuesOf(nested(type)), type).toEqual([]);
    expect(draw(nested("grid"))).toContain('data-recipe-free="0"');
    const layered = free([{ type: "label", text: "Behind", background: { opacity: 60 } } as Block, value([0, 0, 0.5, 0.5])]);
    expect(await issuesOf(layered)).toEqual([]);
  });

  it("refuses a box past the container, a box too small, and numbers outside 0 to 1", async () => {
    expect(await rules(free([value([0.7, 0, 0.4, 0.5])]))).toEqual(["free"]);
    expect(await rules(free([value([0, 0.6, 0.5, 0.5])]))).toEqual(["free"]);
    expect(await rules(free([value([0, 0, 0.02, 0.5])]))).toEqual(["free"]);
    // its edges are fine: a box that fills the container, and one at the least size
    expect(await rules(free([value([0, 0, 1, 1]), value([0.97, 0.97, 0.03, 0.03])]))).toEqual([]);
    expect(await rules(free([value([-0.1, 0, 0.5, 0.5])]))).toEqual(["schema"]);
    expect(await rules(free([value([0, 0, 1.2, 0.5])]))).toEqual(["schema"]);
    expect(await rules(free([value([0, 0, 0.5] as unknown as number[])]))).toEqual(["schema"]);
    const [small] = await issuesOf(free([value([0, 0, 0.02, 0.5])]));
    expect(small.message).toBe("$.root.children[0].box: 2 % by 50 % is too small; a box is at least 3 % of its container each way");
  });

  it("refuses a block without a box in a free container, a box outside one, and a box beside an area or a part of its row", async () => {
    expect(await rules(free([value()]))).toEqual(["free"]);
    expect(await rules(free([value([0, 0, 0.5, 0.5])], (r) => (r.root.layout = undefined)))).toEqual(["free"]);
    expect(await rules(free([value([0, 0, 0.5, 0.5], { fill: 0.5 })]))).toEqual(["free"]);
    expect(await rules(free([value([0, 0, 0.5, 0.5], { background: {} })]))).toEqual(["free"]);
  });

  it("refuses free on a Repeat, a block that holds none, inside a Repeat, and a free grid with columns or tracks", async () => {
    const cores = { type: "repeat", source: "cores", layout: "free", children: [{ type: "value", bind: { field: "load" } }] } as unknown as Block;
    expect(await rules(free([{ ...cores, box: [0, 0, 1, 1] } as Block], (r) => (r.root.layout = undefined)))).toContain("free");
    expect(await rules(free([value(undefined, { layout: "free" })], (r) => (r.root.layout = undefined)))).toEqual(["free"]);
    const inRepeat = { type: "repeat", source: "cores", children: [{ type: "card", layout: "free", children: [] }] } as unknown as Block;
    expect(await rules(free([inRepeat], (r) => (r.root.layout = undefined)))).toEqual(["free"]);
    const grid = (extra: Record<string, unknown>) => ({ type: "grid", layout: "free", children: [], box: [0, 0, 1, 1], ...extra }) as unknown as Block;
    expect(await rules(free([grid({ columns: 2 })]))).toEqual(["free"]);
    expect(await rules(free([grid({ tracks: { cols: [1], rows: [1] } })]))).toEqual(["free"]);
  });

  it("is format 2: a format 1 recipe using layout or box is refused in words", async () => {
    const r = { ...free([value([0, 0, 0.5, 0.5])]), format: 1 } as Recipe;
    const said = (await issuesOf(r)).filter((i) => i.rule === "format").map((i) => i.message);
    expect(said).toEqual(["$.root.layout: a free layout needs recipe format 2", "$.root.children[0].box: a box in a free layout needs recipe format 2"]);
  });
});
