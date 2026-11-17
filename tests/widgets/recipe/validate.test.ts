import { describe, expect, it } from "vitest";
import { packageOf } from "@/widgets/recipe/package";
import type { Block, CardBlock, PackageFile, Recipe, RingBlock } from "@/widgets/recipe/types";
import { BLOCKS_MAX, checkPackage, DEPTH_MAX, FILE_COUNT_MAX, floorAt, hashIssues, OPTIONS_MAX, PACKAGE_MAX_BYTES, PRESETS_MAX, RECIPE_MAX_BYTES, validateRecipe } from "@/widgets/recipe/validate";
import { fixtureFiles, fixtureImages, fixtureRecipe, manifestOfFiles, variant, withFile } from "./fixture-files";

// The recipe validator: one case per rule, plus its boundaries. Each case starts from a fixture package that passes and changes
// one thing (its manifest written again where the change is the recipe's), so the rule it names is the one that fires.

/** The rules that refuse a package, each once. */
const errors = (files: readonly PackageFile[]): string[] => [...new Set(validateRecipe({ files }).filter((i) => i.severity === "error").map((i) => i.rule))];
const cpu = (edit: (r: Recipe) => void) => variant("cpu-card", edit);
const rootOf = (r: Recipe): CardBlock => r.root;
/** The CPU card's top row, its ring and its values column. */
const topRow = (r: Recipe) => rootOf(r).children[0] as Extract<Block, { type: "row" }>;
const ring = (r: Recipe) => topRow(r).children[0] as RingBlock;
const enc = new TextEncoder();

describe("validateRecipe", () => {
  // the root card is depth 1: nest(n) puts n rows and a label under it, the label at depth n + 2
  it("passes the three fixture packages, hashes included", async () => {
    for (const name of ["cpu-card", "gpu-card", "weather-places"]) {
      const checked = await checkPackage({ files: fixtureFiles(name) });
      expect(checked.issues, name).toEqual([]);
      expect(checked.recipe?.id).toBe(`recipe:${name}`);
    }
  });

  it("json-shape: a key that names the prototype chain", async () => {
    const files = await cpu(() => {});
    const text = new TextDecoder().decode(files.find((f) => f.path === "recipe.json")!.bytes).replace('"format": 1,', '"format": 1, "__proto__": {},');
    expect(errors(withFile(files, "recipe.json", text))).toContain("json-shape");
  });

  it("schema: a missing field, a field no recipe has, a manifest without its files", async () => {
    expect(errors(await cpu((r) => void delete (r as Partial<Recipe>).name))).toEqual(["schema"]);
    expect(errors(await cpu((r) => Object.assign(r, { script: "x" })))).toEqual(["schema"]);
    const files = await cpu(() => {});
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...manifestOfFiles(files), files: undefined })))).toContain("schema");
    expect(errors(withFile(files, "recipe.json", "not json"))).toEqual(["schema"]);
  });

  it("block-type: a block this build does not have, wherever it stands", async () => {
    const files = await cpu((r) => topRow(r).children.push({ type: "chart" } as unknown as Block));
    expect(errors(files)).toContain("block-type");
    expect(validateRecipe({ files }).find((i) => i.rule === "block-type")?.message).toMatch(/^\$\.root\.children\[0\]\.children\[2\]: chart/);
  });

  it("url: an address, a script or markup in any value", async () => {
    expect(errors(await cpu((r) => (rootOf(r).title = "https://example.com")))).toEqual(["url"]);
    expect(errors(await cpu((r) => (r.description = "//cdn.example/x")))).toEqual(["url"]);
    expect(errors(await cpu((r) => (r.author = "javascript:alert(1)")))).toEqual(["url"]);
    expect(errors(await cpu((r) => (r.sample.sensors["libre.x"] = "url(x)")))).toEqual(["url"]);
    // the id's `recipe:` is its namespace
    expect(errors(await cpu(() => {}))).toEqual([]);
  });

  it("size: the file count, a file's bytes, the package's, recipe.json's, and the block, option and preset counts", async () => {
    const files = fixtureFiles("cpu-card");
    const png = (n: number) => Uint8Array.from({ length: n }, (_, k) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][k] ?? 0);
    const many = Array.from({ length: FILE_COUNT_MAX - 1 }, (_, k) => ({ path: `images/f${k}.png`, bytes: png(8) }));
    expect(errors([...files, ...many])).toContain("size");
    expect(errors([...files, ...many.slice(1)]).filter((r) => r === "size")).toEqual([]);
    expect(errors([...files, { path: "images/big.png", bytes: png(256_001) }])).toContain("size");
    const half = (k: number) => ({ path: `images/h${k}.png`, bytes: png(PACKAGE_MAX_BYTES / 2) });
    expect(errors([...files, half(1), half(2)])).toContain("size");
    expect(errors(await cpu((r) => (r.description = "a".repeat(400)) && Object.assign(r.sample.sensors, Object.fromEntries(Array.from({ length: 2200 }, (_, k) => [`libre.sensor_${k}`, "1 %"])))))).toContain("size");
    expect(RECIPE_MAX_BYTES).toBe(64_000);
    expect(errors(await cpu((r) => (rootOf(r).children = Array.from({ length: BLOCKS_MAX }, () => ({ type: "label", text: "x" }) as Block))))).toContain("size");
    expect(errors(await cpu((r) => (rootOf(r).children = Array.from({ length: BLOCKS_MAX - 1 }, () => ({ type: "label", text: "x" }) as Block))))).toEqual([]);
    expect(errors(await cpu((r) => r.options.push(...Array.from({ length: OPTIONS_MAX - r.options.length + 1 }, (_, k) => ({ key: `extra${k}`, label: "X", type: "boolean" as const, default: true })))))).toContain("size");
    expect(errors(await cpu((r) => r.presets.push(...Array.from({ length: PRESETS_MAX - r.presets.length + 1 }, (_, k) => ({ id: `p${k}`, name: "P", settings: {}, size: [3, 2] as [number, number] })))))).toContain("size");
  });

  it("path: a file a package does not have, and one given twice", async () => {
    const files = fixtureFiles("cpu-card");
    expect(errors([...files, { path: "bundle.js", bytes: enc.encode("x") }])).toContain("path");
    expect(errors([...files, { path: "images/../x.png", bytes: enc.encode("x") }])).toContain("path");
    expect(errors([...files, files[1]])).toContain("path");
  });

  it("kind: a code widget's manifest", async () => {
    const files = await cpu(() => {});
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...manifestOfFiles(files), kind: "code" })))).toEqual(["kind"]);
  });

  it("signature: a recipe may carry one in minisign's form (the server verifies it); any other shape is refused", async () => {
    const files = await cpu(() => {});
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...manifestOfFiles(files), signature: { alg: "ed25519" } })))).toEqual(["schema"]);
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...manifestOfFiles(files), signature: { minisign: "untrusted comment: x" } })))).toEqual([]);
  });

  it("id and version: the manifest's are the recipe's", async () => {
    const files = await cpu(() => {});
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...manifestOfFiles(files), id: "recipe:other" })))).toEqual(["id"]);
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...manifestOfFiles(files), version: "1.0.1" })))).toEqual(["version"]);
    expect(errors(await cpu((r) => (r.version = "1.0")))).toEqual(["schema"]);
  });

  it("files: a file not listed, a listed file missing, a size that is not the file's", async () => {
    const files = await variant("gpu-card", () => {});
    expect(errors(files.filter((f) => f.path !== "images/logo.png"))).toContain("files");
    expect(errors([...files, { path: "images/more.png", bytes: fixtureImages("gpu-card")[0].bytes }])).toEqual(["files"]);
    const m = manifestOfFiles(files) as { files: { path: string; bytes: number }[] };
    expect(errors(withFile(files, "manifest.json", JSON.stringify({ ...m, files: m.files.map((f) => ({ ...f, bytes: f.bytes + 1 })) })))).toContain("files");
  });

  it("hash: a file changed after the export, its size kept", async () => {
    const files = await variant("gpu-card", () => {});
    const logo = files.find((f) => f.path === "images/logo.png")!.bytes.slice();
    logo[logo.length - 20] ^= 1;
    const changed = withFile(files, "images/logo.png", logo);
    expect(errors(changed)).toEqual([]);
    expect((await hashIssues({ files: changed })).map((i) => [i.rule, i.file])).toEqual([["hash", "images/logo.png"]]);
    expect((await checkPackage({ files: changed })).recipe).toBeUndefined();
  });

  it("size-range: min over max, a default outside them", async () => {
    expect(errors(await cpu((r) => (r.size.min = [5, 2])))).toContain("size-range");
    expect(errors(await cpu((r) => (r.size.default = [5, 2])))).toContain("size-range");
    expect(errors(await cpu((r) => (r.size.default = [4, 3])))).toEqual([]);
  });

  it("option: a key twice, a standard key, a default that is not of its type", async () => {
    expect(errors(await cpu((r) => r.options.push({ ...r.options[0] })))).toEqual(["option"]);
    expect(errors(await cpu((r) => r.options.push({ key: "accent", label: "A", type: "color", default: "" })))).toEqual(["option"]);
    expect(errors(await cpu((r) => r.options.push({ key: "mode", label: "M", type: "select", default: "x", options: [{ value: "a", label: "A" }] })))).toEqual(["option"]);
    expect(errors(await cpu((r) => r.options.push({ key: "n", label: "N", type: "number", default: 13, min: 1, max: 12 })))).toEqual(["option"]);
    expect(errors(await cpu((r) => r.options.push({ key: "n", label: "N", type: "number", default: 12, min: 1, max: 12 })))).toEqual([]);
    expect(errors(await cpu((r) => r.options.push({ key: "where", label: "W", type: "place-list", default: [{ name: "X", lat: 91, lon: 0 }] })))).toContain("schema");
    expect(errors(await cpu((r) => r.options.push({ key: "where", label: "W", type: "place-list", default: "Oslo" })))).toEqual(["option"]);
    expect(errors(await cpu((r) => r.options.push({ key: "flag", label: "F", type: "boolean", default: "yes" })))).toEqual(["option"]);
    expect(errors(await cpu((r) => (r.options[0].default = "not a key")))).toEqual(["option"]);
  });

  it("preset: one default, sizes inside the recipe's, settings that are option values", async () => {
    expect(errors(await cpu((r) => (r.presets[1].default = true)))).toEqual(["preset"]);
    expect(errors(await cpu((r) => delete r.presets[0].default))).toEqual(["preset"]);
    expect(errors(await cpu((r) => (r.presets[1].size = [1, 1])))).toEqual(["preset"]);
    expect(errors(await cpu((r) => (r.presets[1].size = [4, 3])))).toEqual([]);
    expect(errors(await cpu((r) => (r.presets[1].settings = { nope: true })))).toEqual(["preset"]);
    expect(errors(await cpu((r) => (r.presets[1].settings = { showClock: "off" })))).toEqual(["preset"]);
    expect(errors(await cpu((r) => (r.presets[1].id = r.presets[0].id)))).toEqual(["preset"]);
  });

  it("block: the root is a card, containers hold children and others none, directions, ranges and thresholds", async () => {
    expect(errors(await cpu((r) => (r.root = { type: "row", children: [] } as unknown as CardBlock)))).toContain("block");
    expect(errors(await cpu((r) => void delete (topRow(r) as { children?: unknown }).children))).toContain("block");
    expect(errors(await cpu((r) => Object.assign(ring(r), { children: [] })))).toContain("block");
    expect(errors(await cpu((r) => Object.assign(topRow(r), { direction: "grid" })))).toEqual(["block"]);
    expect(errors(await cpu((r) => Object.assign(ring(r), { min: 100, max: 100 })))).toEqual(["block"]);
    expect(errors(await cpu((r) => Object.assign(ring(r), { min: 99, max: 100 })))).toEqual([]);
    expect(errors(await cpu((r) => void delete ring(r).thresholds))).toEqual(["block"]);
    expect(errors(await cpu((r) => Object.assign(ring(r), { style: "bars" })))).toEqual(["block"]);
  });

  it("binding: every target exists", async () => {
    expect(errors(await cpu((r) => (ring(r).bind = { sensor: "no dots here" })))).toEqual(["binding"]);
    expect(errors(await cpu((r) => (ring(r).bind = { option: "nope" })))).toEqual(["binding"]);
    expect(errors(await cpu((r) => (ring(r).bind = { field: "temp" })))).toEqual(["binding"]);
    expect(errors(await cpu((r) => void delete (ring(r) as { bind?: unknown }).bind))).toEqual(["binding"]);
    expect(errors(await cpu((r) => (ring(r).when = { option: "nope", is: true })))).toEqual(["binding"]);
    expect(errors(await cpu((r) => topRow(r).children.push({ type: "label" })))).toEqual(["binding"]);
    const weather = (edit: (r: Recipe) => void) => variant("weather-places", edit);
    const first = (r: Recipe) => (rootOf(r).children[0] as Extract<Block, { type: "repeat" }>).children[0] as Extract<Block, { type: "weather-icon" }>;
    expect(errors(await weather((r) => (first(r).bind = { field: "humidity" })))).toEqual(["binding"]);
    expect(errors(await weather((r) => rootOf(r).children.push({ type: "value", bind: { option: "places" } })))).toEqual(["binding"]);
    expect(errors(await weather((r) => (first(r).bind = { field: "code" })))).toEqual([]);
  });

  it("depth: blocks nest at most six deep", async () => {
    const nest = (n: number): Block => (n === 0 ? { type: "label", text: "x" } : { type: "row", children: [nest(n - 1)] });
    expect(errors(await cpu((r) => (rootOf(r).children = [nest(DEPTH_MAX - 2)])))).toEqual([]);
    expect(errors(await cpu((r) => (rootOf(r).children = [nest(DEPTH_MAX - 1)])))).toEqual(["depth"]);
  });

  it("repeat: over a place list, never inside another, at most twelve shown", async () => {
    const weather = (edit: (r: Recipe) => void) => variant("weather-places", edit);
    const list = (r: Recipe) => rootOf(r).children[0] as Extract<Block, { type: "repeat" }>;
    expect(errors(await weather((r) => (list(r).over = "units")))).toEqual(["repeat"]);
    expect(errors(await weather((r) => list(r).children.push({ type: "repeat", over: "places", source: "weather-by-place", children: [] })))).toEqual(["repeat"]);
    expect(errors(await weather((r) => (list(r).max = 13)))).toEqual(["repeat"]);
    expect(errors(await weather((r) => (list(r).max = 12)))).toEqual([]);
  });

  it("follow: a Repeat's direction, most shown, hours and units and a sparkline's window follow an option that gives what they take", async () => {
    const weather = (edit: (r: Recipe) => void) => variant("weather-places", edit);
    const list = (r: Recipe) => rootOf(r).children[0] as Extract<Block, { type: "repeat" }>;
    // the fixture follows layout (mapped), hours (a number 4-12) and units (mapped)
    expect(errors(await weather(() => {}))).toEqual([]);
    expect(errors(await weather((r) => (list(r).direction = { option: "nope" })))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).direction = { option: "layout" })))).toEqual(["follow"]); // list, grid, one are not directions: it needs a map
    expect(errors(await weather((r) => (list(r).direction = { option: "layout", map: { list: "rows", diagonal: "rows" } })))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).direction = { option: "layout", map: { list: "sideways" as "rows" } })))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).direction = { option: "hours" })))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).max = { option: "layout", map: { one: 13 } })))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).max = { option: "hours" })))).toEqual([]);
    expect(errors(await weather((r) => (list(r).hours = { option: "units" })))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).hours = { option: "hours", map: { "8": 8 } })))).toEqual(["follow"]); // a map reads a select
    expect(errors(await weather((r) => (r.options.find((o) => o.key === "hours")!.max = 30)))).toEqual(["follow"]);
    expect(errors(await weather((r) => void delete r.options.find((o) => o.key === "hours")!.min))).toEqual(["follow"]);
    expect(errors(await weather((r) => (list(r).hours = 25)))).toEqual(["repeat"]);
    expect(errors(await weather((r) => (list(r).hours = 24)))).toEqual([]);
    expect(errors(await weather((r) => (list(r).units = { option: "units" })))).toEqual(["follow"]); // c and f are not units: it needs a map
    // a sparkline's window: fixed or following a number option
    expect(errors(await cpu((r) => r.options.push({ key: "secs", label: "History", type: "number", default: 60, min: 10, max: 300, step: 10 })))).toEqual([]);
    const spark = (r: Recipe) => (rootOf(r).children as Block[]).find((b) => b.type === "sparkline") as Extract<Block, { type: "sparkline" }>;
    expect(errors(await cpu((r) => (r.options.push({ key: "secs", label: "History", type: "number", default: 60, min: 10, max: 300, step: 10 }), (spark(r).window = { option: "secs" }))))).toEqual([]);
    expect(errors(await cpu((r) => (spark(r).window = 5)))).toEqual(["block"]);
    expect(errors(await cpu((r) => (spark(r).window = 600)))).toEqual([]);
    // nothing else follows, and hours, units and window stay on their own blocks
    expect(errors(await cpu((r) => Object.assign(ring(r), { max: { option: "showCores" } })))).toEqual(["follow"]);
    expect(errors(await cpu((r) => Object.assign(ring(r), { window: 60 })))).toEqual(["block"]);
    expect(errors(await weather((r) => Object.assign(list(r).children[2], { direction: { option: "layout", map: { list: "row" } } })))).toEqual(["follow"]);
  });

  it("attribution: a recipe does not write the weather provider's credit", async () => {
    expect(errors(await cpu((r) => (r.description = "Weather data by somebody")))).toEqual(["attribution"]);
    expect(errors(await cpu((r) => (r.root.title = "Open-Meteo")))).toEqual(["attribution"]);
    expect(errors(await cpu((r) => (r.root.title = "Openmeteo")))).toEqual(["attribution"]);
    expect(errors(await cpu((r) => (r.root.title = "Weather")))).toEqual([]);
  });

  it("place-list: a place may be the one this PC's location put first, once", async () => {
    const weather = (edit: (r: Recipe) => void) => variant("weather-places", edit);
    const places = (r: Recipe) => r.options.find((o) => o.key === "places")!;
    expect(errors(await weather((r) => (places(r).default = [{ name: "Here", lat: 59.9, lon: 10.7, here: true }, { name: "Tokyo", lat: 35.68, lon: 139.69 }])))).toEqual([]);
    expect(errors(await weather((r) => (places(r).default = [{ name: "Here", lat: 59.9, lon: 10.7, here: true }, { name: "There", lat: 1, lon: 1, here: true }])))).toEqual(["option"]);
  });

  it("image: a file of the package, whose bytes are the image its name says", async () => {
    expect(errors(await variant("gpu-card", () => {}, []))).toEqual(["image"]);
    expect(errors(await variant("gpu-card", () => {}, [{ path: "images/logo.png", bytes: enc.encode("not a png") }]))).toEqual(["image"]);
  });

  it("text-floor: 11 px at every size the recipe allows", async () => {
    // the CPU card's smallest size is 2x2: a base of 15 px, so a scale of 0.74 is 11.1 px and 0.73 is 10.95
    expect(errors(await cpu((r) => (topRow(r).children[1] as Extract<Block, { type: "row" }>).children.forEach((v) => Object.assign(v, { scale: 0.74 }))))).toEqual([]);
    expect(errors(await cpu((r) => Object.assign((topRow(r).children[1] as Extract<Block, { type: "row" }>).children[0], { scale: 0.73 })))).toEqual(["text-floor"]);
    // the same recipe allowed down to 1x1 (a base of 7.5 px) breaks it at that size alone
    const files = await cpu((r) => {
      r.size.min = [1, 1];
    });
    expect(validateRecipe({ files }).find((i) => i.rule === "text-floor")?.message).toMatch(/at 1x1/);
  });

  // builder plan Phase 3: "Check every size" lists the floor at each size; the rule over the range is its oracle
  it("floorAt: the texts under the floor at one size, by path, agreeing with the rule at every size", async () => {
    const r = fixtureRecipe("cpu-card");
    r.size.min = [1, 1];
    const values = topRow(r).children[1] as Extract<Block, { type: "row" }>;
    // a 1x1 base is 7.5 px: every text at scale 1 is under 11 px there; at 2x2 (15 px) a scale of 0.73 is alone under it
    expect(floorAt(r, [1, 1]).length).toBeGreaterThan(0);
    expect(floorAt(r, [2, 2])).toEqual([]);
    Object.assign(values.children[0], { scale: 0.73 });
    expect(floorAt(r, [2, 2]).map((f) => f.path)).toEqual([[0, 1, 0]]);
    expect(floorAt(r, [2, 2])[0].px).toBeCloseTo(10.95);
    // a text a size condition hides at a size is not under the floor there
    Object.assign(values.children[0], { when: { size: { min: [3, 3] } } });
    expect(floorAt(r, [2, 2])).toEqual([]);
    for (let c = 1; c <= 4; c++)
      for (let h = 1; h <= 4; h++) {
        // the recipe made for that one size, so the rule checks it alone
        const at = [c, h] as [number, number];
        const one: Recipe = { ...r, size: { min: at, max: at, default: at }, presets: r.presets.map((p) => ({ ...p, size: at })) };
        const rule = validateRecipe({ files: await packageOf(one, fixtureImages("cpu-card")) }).some((i) => i.rule === "text-floor");
        expect(floorAt(r, [c, h]).length > 0, `${c}x${h}`).toBe(rule);
      }
  });

  it("text-floor: a rail preset is checked in a rail slot's box, where a size condition can hide a text", async () => {
    // (a rail preset is format 2: QUESTIONS P2 11, P6) a rail slot is 72 x 64 px: a base of 4.5 px, so a value at scale 1 is under the floor there however big its grid sizes are
    const files = await cpu((r) => ((r.format = 2), (r.presets[1].size = "rail")));
    expect(errors(files)).toEqual(["text-floor"]);
    expect(validateRecipe({ files }).find((i) => i.rule === "text-floor")?.message).toMatch(/in a rail slot \(72 x 64 px\)/);
    // every text scaled to 2.5 (11.25 px in the slot) passes, and so does one only drawn from 2x2 up
    const texts = (b: Block): Block[] => [b, ...("children" in b && Array.isArray(b.children) ? (b.children as Block[]).flatMap(texts) : [])];
    const big = (r: Recipe) => texts(r.root).filter((b) => ["value", "label", "ring", "gauge"].includes(b.type)).forEach((b) => Object.assign(b, { scale: 2.5 }));
    expect(errors(await cpu((r) => (big(r), (r.format = 2), (r.presets[1].size = "rail"))))).toEqual([]);
    expect(
      errors(
        await cpu((r) => {
          big(r);
          r.format = 2;
          r.presets[1].size = "rail";
          Object.assign(topRow(r), { when: { size: { min: [2, 2] } } });
          for (const b of texts(topRow(r))) if (b !== topRow(r)) Object.assign(b, { scale: 1 });
        })
      )
    ).toEqual([]);
  });

  it("format and preset: a rail preset needs format 2 and is never the default", async () => {
    const one = validateRecipe({ files: await cpu((r) => (r.presets[1].size = "rail")) });
    expect(one.filter((i) => i.rule === "format").map((i) => i.message)).toEqual(["$.presets[1].size: a rail preset needs recipe format 2"]);
    const def = validateRecipe({ files: await cpu((r) => ((r.format = 2), (r.presets.find((p) => p.default)!.size = "rail"))) });
    expect(def.filter((i) => i.rule === "preset").map((i) => i.message)).toEqual([expect.stringMatching(/the default preset opens on the grid, so it can't be a rail preset$/)]);
  });

  it("sample: sensor keys, items for a place list with the source's fields", async () => {
    expect(errors(await cpu((r) => (r.sample.sensors["no-dot"] = 1)))).toEqual(["sample"]);
    expect(errors(await cpu((r) => (r.sample.items = { load: [] })))).toEqual(["sample"]);
    expect(errors(await variant("weather-places", (r) => (r.sample.items!.places[0] = { name: "Oslo", humidity: 80 })))).toEqual(["sample"]);
  });

  it("internal: a package it cannot read to the end is refused, never thrown", async () => {
    const files = await cpu(() => {});
    const broken = [...files, { path: "images/x.png", bytes: null as unknown as Uint8Array }];
    expect(validateRecipe({ files: broken }).map((i) => i.rule)).toEqual(["internal"]);
  });

  it("is what an export writes: a package made from a fixture's recipe is the fixture byte for byte", async () => {
    for (const name of ["cpu-card", "gpu-card", "weather-places"]) {
      const made = await packageOf(fixtureRecipe(name), fixtureImages(name));
      const disk = fixtureFiles(name);
      for (const f of made) expect(f.bytes, `${name} ${f.path}`).toEqual(disk.find((d) => d.path === f.path)?.bytes);
    }
  });
});

describe("label parts and format 2 (Phase A, G4)", () => {
  const weather = (edit: (r: Recipe) => void) => variant("weather-places", edit);
  /** Weather · places' "High / low" label, a line of three parts. */
  const highLow = (r: Recipe) => (rootOf(r).children[0] as Extract<Block, { type: "repeat" }>).children.find((b) => b.name === "High / low") as Extract<Block, { type: "label" }>;
  const caption = (r: Recipe) => rootOf(r).children.find((b) => b.type === "label") as Extract<Block, { type: "label" }>;

  it("the Weather · places fixture is format 2 for its parts, and passes", async () => {
    const r = fixtureRecipe("weather-places");
    expect(r.format).toBe(2);
    expect(highLow(r).parts).toEqual([{ bind: { field: "high" }, decimals: 0, unit: "°" }, { text: " / " }, { bind: { field: "low" }, decimals: 0, unit: "°" }]);
    expect(errors(await weather(() => {}))).toEqual([]);
  });

  it("format: parts need format 2; format 1 without them stays as it was; a newer format says so and nothing else", async () => {
    expect(errors(await weather((r) => (r.format = 1)))).toEqual(["format"]);
    expect(errors(await cpu((r) => (r.format = 2)))).toEqual([]);
    const newer = validateRecipe({ files: await weather((r) => Object.assign(r, { format: 3, sizes: "new key" })) });
    expect(newer).toEqual([{ rule: "format", severity: "error", file: "recipe.json", message: "made with a newer InfoPanel Studio (recipe format 3); update to show it" }]);
    expect(errors(await cpu((r) => Object.assign(r, { format: 0 })))).toEqual(["schema"]);
  });

  it("parts: each one text or data, the bounds of each, at most eight, nothing beside them", async () => {
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "" })))).toEqual(["schema"]);
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "x".repeat(41) })))).toEqual(["schema"]);
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "x".repeat(40) })))).toEqual([]);
    expect(errors(await weather((r) => Object.assign(highLow(r).parts![0], { decimals: 5 })))).toEqual(["schema"]);
    expect(errors(await weather((r) => Object.assign(highLow(r).parts![0], { unit: "123456789" })))).toEqual(["schema"]);
    expect(errors(await weather((r) => (highLow(r).parts = [])))).toEqual(["schema"]);
    expect(errors(await weather((r) => (highLow(r).parts = Array.from({ length: 9 }, () => ({ text: "x" })))))).toEqual(["size"]);
    expect(errors(await weather((r) => (highLow(r).parts = Array.from({ length: 8 }, () => ({ text: "x" })))))).toEqual([]);
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "/", bind: { field: "low" } } as never)))).toEqual(["block"]);
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "/", unit: "°" } as never)))).toEqual(["block"]);
    expect(errors(await weather((r) => (highLow(r).text = "x")))).toEqual(["block"]);
  });

  it("parts: each binding names something there, and the url and attribution rules read each text part", async () => {
    expect(errors(await weather((r) => (highLow(r).parts![0] = { bind: { field: "humidity" } })))).toEqual(["binding"]);
    expect(errors(await weather((r) => (highLow(r).parts![0] = { bind: { option: "nope" } })))).toEqual(["binding"]);
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "https://x.io" })))).toEqual(["url"]);
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "<b>" })))).toContain("schema");
    expect(errors(await weather((r) => (highLow(r).parts![1] = { text: "Weather data by me" })))).toEqual(["attribution"]);
    // outside a Repeat a field is no binding
    expect(errors(await weather((r) => rootOf(r).children.push({ type: "label", parts: [{ bind: { field: "temp" } }] })))).toEqual(["binding"]);
    expect(errors(await weather((r) => rootOf(r).children.push({ type: "label", parts: [{ text: "Now " }, { bind: { option: "hours" }, unit: " h" }] })))).toEqual([]);
    expect(caption(fixtureRecipe("weather-places"))).toBeUndefined();
  });

  it("depth: too deep a tree is the depth rule's, in blocks, before the JSON guard (B10)", async () => {
    const nest = (n: number): Block => (n === 0 ? { type: "label", text: "x" } : { type: "row", children: [nest(n - 1)] });
    const issues = validateRecipe({ files: await cpu((r) => (rootOf(r).children = [nest(8)])) });
    expect(issues.map((i) => [i.rule, i.message])).toEqual([["depth", "$.root.children[0].children[0].children[0].children[0].children[0].children[0]: blocks nest 7 deep, at most 6"]]);
  });
});

describe("Phase C keys, format 2 (G21, G22, G23, G27)", () => {
  /** The CPU card's values column and its Clock value. */
  const values = (r: Recipe) => topRow(r).children[1] as Extract<Block, { type: "row" }>;
  const clock = (r: Recipe) => values(r).children[1] as Extract<Block, { type: "value" }>;
  /** The CPU card as format 2, so a Phase C key is allowed and the rule under test is the one that fires. */
  const two = (edit: (r: Recipe) => void) => cpu((r) => ((r.format = 2), edit(r)));

  it("align: start, center or end on a value and a label; stretch is a row's", async () => {
    for (const align of ["start", "center", "end"] as const) expect(errors(await two((r) => (clock(r).align = align))), align).toEqual([]);
    expect(errors(await two((r) => rootOf(r).children.push({ type: "label", text: "x", align: "end" })))).toEqual([]);
    expect(errors(await two((r) => Object.assign(clock(r), { align: "stretch" })))).toEqual(["block"]);
    expect(errors(await two((r) => Object.assign(clock(r), { align: "left" })))).toEqual(["schema"]);
  });

  it("text colours: fg and muted on a value's number, never a ring's stroke; a ring's centre takes tone fg or muted", async () => {
    expect(errors(await two((r) => (clock(r).color = "muted")))).toEqual([]);
    expect(errors(await two((r) => (clock(r).color = "fg")))).toEqual([]);
    expect(errors(await two((r) => Object.assign(ring(r), { color: "muted", thresholds: undefined })))).toEqual(["block"]);
    expect(errors(await two((r) => (ring(r).tone = "muted")))).toEqual([]);
    expect(errors(await two((r) => Object.assign(ring(r), { tone: "accent" })))).toEqual(["block"]);
    expect(errors(await two((r) => Object.assign(clock(r), { color: "#ff0000" })))).toEqual(["schema"]);
  });

  it("convert: a unit of the table, on a value or a ring, never beside a typed unit", async () => {
    expect(errors(await two((r) => (clock(r).convert = "GHz")))).toEqual([]);
    expect(errors(await two((r) => Object.assign(ring(r), { convert: "GHz", unit: undefined })))).toEqual([]);
    expect(errors(await two((r) => Object.assign(clock(r), { convert: "furlongs" })))).toEqual(["schema"]);
    expect(errors(await two((r) => Object.assign(clock(r), { convert: "GHz", unit: "G" })))).toEqual(["block"]);
    expect(errors(await two((r) => Object.assign(r.root.children[1], { convert: "GHz" })))).toEqual(["block"]);
  });

  it("thresholds: low is bad refuses a warning past critical; high is bad only warns, so a recipe that loads today keeps loading; equal levels pass", async () => {
    const past = validateRecipe({ files: await cpu((r) => (ring(r).thresholds = { warn: 95, crit: 10 })) });
    expect(past.map((i) => [i.rule, i.severity])).toEqual([["thresholds", "warn"]]);
    expect(errors(await cpu((r) => (ring(r).thresholds = { warn: 90, crit: 90 })))).toEqual([]);
    expect(errors(await two((r) => (ring(r).thresholds = { warn: 30, crit: 10, low: true })))).toEqual([]);
    expect(errors(await two((r) => (ring(r).thresholds = { warn: 10, crit: 10, low: true })))).toEqual([]);
    expect(errors(await two((r) => (ring(r).thresholds = { warn: 9, crit: 10, low: true })))).toEqual(["thresholds"]);
    expect(errors(await two((r) => Object.assign(ring(r), { thresholds: { warn: 30, crit: 10, low: false } })))).toEqual(["schema"]);
    expect(past[0].message).toBe("$.root.children[0].children[0].thresholds: warning at 95 comes after critical at 10; when high is bad, warning is the lower level");
    const low = validateRecipe({ files: await two((r) => (ring(r).thresholds = { warn: 9, crit: 10, low: true })) }).find((i) => i.rule === "thresholds");
    expect(low?.severity).toBe("error");
  });

  it("format: each Phase C key in a recipe that says format 1 is refused, in words; format 1 without them stays as it was", async () => {
    const cases: [string, (r: Recipe) => void, string][] = [
      ["align", (r) => (clock(r).align = "center"), "$.root.children[0].children[1].children[1].align: text alignment needs recipe format 2"],
      ["color", (r) => (clock(r).color = "muted"), "$.root.children[0].children[1].children[1].color: a text colour needs recipe format 2"],
      ["tone", (r) => (ring(r).tone = "muted"), "$.root.children[0].children[0].tone: a centre value's colour needs recipe format 2"],
      ["convert", (r) => (clock(r).convert = "GHz"), "$.root.children[0].children[1].children[1].convert: Show in needs recipe format 2"],
      ["low", (r) => (ring(r).thresholds = { warn: 30, crit: 10, low: true }), "$.root.children[0].children[0].thresholds.low: low is bad needs recipe format 2"],
    ];
    for (const [name, edit, message] of cases) {
      const issues = validateRecipe({ files: await cpu(edit) });
      expect(issues.map((i) => [i.rule, i.message]), name).toEqual([["format", message]]);
    }
    expect(errors(await cpu(() => {}))).toEqual([]);
  });

  it("a format 1 recipe saved with warning above critical still loads (no feature lost): the package checks and the recipe comes back", async () => {
    const files = await cpu((r) => (ring(r).thresholds = { warn: 95, crit: 10 }));
    const checked = await checkPackage({ files });
    expect(checked.recipe?.format).toBe(1);
    expect(checked.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("Phase E keys, format 2 (G21 weight and case, G22 opacity, G26, G36)", () => {
  const two = (edit: (r: Recipe) => void) => cpu((r) => ((r.format = 2), edit(r)));
  /** The CPU card as format 2 with `block` added at the end of its root. */
  const withBlock = (block: Block) => two((r) => rootOf(r).children.push(block));
  const bar = (extra: object = {}): Block => ({ type: "bar", bind: { sensor: "libre.amd_ryzen_9_9950x3d_cpu_total" }, ...extra }) as Block;
  const gauge = (extra: object = {}): Block => ({ type: "gauge", bind: { sensor: "libre.amd_ryzen_9_9950x3d_cpu_total" }, ...extra }) as Block;
  const nested = (extra: object = {}): Block => ({ type: "card", title: "Inner", children: [], ...extra }) as Block;

  it("weight and case: medium or semibold, upper, on a value and a label; nowhere else, no other value", async () => {
    for (const weight of ["medium", "semibold"]) expect(errors(await withBlock({ type: "label", text: "x", weight } as Block)), weight).toEqual([]);
    expect(errors(await withBlock({ type: "value", bind: { sensor: "libre.amd_ryzen_9_9950x3d_cpu_total" }, weight: "semibold", case: "upper", label: "Load" } as Block))).toEqual([]);
    expect(errors(await withBlock({ type: "label", text: "x", case: "upper" } as Block))).toEqual([]);
    expect(errors(await withBlock({ type: "label", text: "x", weight: "bold" } as unknown as Block))).toEqual(["schema"]);
    expect(errors(await withBlock({ type: "label", text: "x", case: "lower" } as unknown as Block))).toEqual(["schema"]);
    expect(errors(await two((r) => Object.assign(ring(r), { weight: "medium" })))).toEqual(["block"]);
  });

  it("opacity: 80, 60 or 40 on a text or a mark; not on a container, no other step", async () => {
    for (const opacity of [80, 60, 40]) expect(errors(await two((r) => Object.assign(ring(r), { opacity }))), String(opacity)).toEqual([]);
    expect(errors(await withBlock({ type: "label", text: "x", opacity: 40 } as Block))).toEqual([]);
    expect(errors(await withBlock(bar({ opacity: 60 })))).toEqual([]);
    expect(errors(await two((r) => Object.assign(ring(r), { opacity: 50 })))).toEqual(["schema"]);
    expect(errors(await two((r) => Object.assign(ring(r), { opacity: 100 })))).toEqual(["schema"]);
    expect(errors(await two((r) => Object.assign(topRow(r), { opacity: 40 })))).toEqual(["block"]);
  });

  it("surface and padding on a card inside the root; spacing on the root card; never the other way round", async () => {
    expect(errors(await withBlock(nested({ surface: "raised", padding: "l" })))).toEqual([]);
    expect(errors(await withBlock(nested({ surface: "none", padding: "none" })))).toEqual([]);
    expect(errors(await two((r) => Object.assign(rootOf(r), { spacing: "roomy" })))).toEqual([]);
    expect(errors(await two((r) => Object.assign(rootOf(r), { spacing: "tight" })))).toEqual([]);
    expect(errors(await withBlock(nested({ surface: "glass" })))).toEqual(["schema"]);
    expect(errors(await withBlock(nested({ padding: "xl" })))).toEqual(["schema"]);
    expect(errors(await two((r) => Object.assign(rootOf(r), { surface: "raised" })))).toEqual(["block"]);
    expect(errors(await withBlock(nested({ spacing: "roomy" })))).toEqual(["block"]);
    expect(errors(await two((r) => Object.assign(topRow(r), { padding: "s" })))).toEqual(["block"]);
  });

  it("sweep on a gauge, 180 or 240 (270 is unset); height on a bar, s or l (m is unset)", async () => {
    for (const sweep of [180, 240]) expect(errors(await withBlock(gauge({ sweep }))), String(sweep)).toEqual([]);
    for (const height of ["s", "l"]) expect(errors(await withBlock(bar({ height }))), height).toEqual([]);
    expect(errors(await withBlock(gauge({ sweep: 360 })))).toEqual(["schema"]);
    expect(errors(await withBlock(bar({ height: "xl" })))).toEqual(["schema"]);
    expect(errors(await two((r) => Object.assign(ring(r), { sweep: 180 })))).toEqual(["block"]);
    expect(errors(await withBlock(gauge({ height: "s" })))).toEqual(["block"]);
  });

  it("format: each Phase E key in a recipe that says format 1 is refused, in words", async () => {
    const at = "$.root.children[0].children[0]";
    const cases: [string, (r: Recipe) => void, string][] = [
      ["weight", (r) => rootOf(r).children.push({ type: "label", text: "x", weight: "medium" }), "$.root.children[3].weight: text weight needs recipe format 2"],
      ["case", (r) => rootOf(r).children.push({ type: "label", text: "x", case: "upper" }), "$.root.children[3].case: upper case needs recipe format 2"],
      ["opacity", (r) => Object.assign(ring(r), { opacity: 60 }), `${at}.opacity: opacity needs recipe format 2`],
      ["surface", (r) => rootOf(r).children.push(nested({ surface: "raised" })), "$.root.children[3].surface: a card's surface needs recipe format 2"],
      ["padding", (r) => rootOf(r).children.push(nested({ padding: "s" })), "$.root.children[3].padding: a card's padding needs recipe format 2"],
      ["spacing", (r) => Object.assign(rootOf(r), { spacing: "roomy" }), "$.root.spacing: the card's spacing needs recipe format 2"],
      ["sweep", (r) => rootOf(r).children.push(gauge({ sweep: 180 })), "$.root.children[3].sweep: a gauge's sweep needs recipe format 2"],
      ["height", (r) => rootOf(r).children.push(bar({ height: "l" })), "$.root.children[3].height: a bar's height needs recipe format 2"],
    ];
    for (const [name, edit, message] of cases) {
      const issues = validateRecipe({ files: await cpu(edit) });
      expect(issues.map((i) => [i.rule, i.message]), name).toEqual([["format", message]]);
    }
  });
});

describe("Phase F: Repeat sources and the grid, format 2 (G38)", () => {
  const two = (edit: (r: Recipe) => void) => cpu((r) => ((r.format = 2), edit(r)));
  const withBlock = (block: Block) => two((r) => rootOf(r).children.push(block));
  const over = (source: string, children: Block[], extra: object = {}): Block => ({ type: "repeat", source, children, ...extra }) as Block;
  const field = (f: string): Block => ({ type: "value", bind: { field: f } }) as Block;
  const grid = (children: Block[], extra: object = {}): Block => ({ type: "grid", children, ...extra }) as Block;
  const message = async (files: Promise<PackageFile[]>, rule: string) => validateRecipe({ files: await files }).find((i) => i.rule === rule)?.message;

  it("passes the devices fixture: a Repeat over drives, a grid of a Repeat over cores, a Repeat over fans", async () => {
    const checked = await checkPackage({ files: fixtureFiles("devices") });
    expect(checked.issues).toEqual([]);
  });

  it("source: each device source with its own fields; a field another source has is refused, naming the source's", async () => {
    const own = { drives: "used", cores: "load", fans: "rpm", adapters: "down", gpus: "vram" };
    for (const [source, f] of Object.entries(own)) expect(errors(await withBlock(over(source, [field("name"), field(f)]))), source).toEqual([]);
    expect(errors(await withBlock(over("cores", [field("temp")])))).toEqual(["binding"]);
    expect(await message(withBlock(over("fans", [field("used")])), "binding")).toBe("$.root.children[3].children[0].bind: field used is not a field of a Repeat over fans (name, rpm)");
    // a place's field is not a drive's, nor the other way round
    expect(await message(withBlock(over("drives", [field("hourly")])), "binding")).toMatch(/field hourly is not a field of a Repeat over drives/);
    expect(errors(await withBlock(over("disks", [])))).toEqual(["schema"]);
  });

  it("source: a device Repeat names no list, hours or units; most shown 1 to 32 (places stay 1 to 12)", async () => {
    expect(errors(await two((r) => r.options.push({ key: "places", label: "Places", type: "place-list", default: [] }) && rootOf(r).children.push(over("drives", [], { over: "places" }))))).toEqual(["repeat"]);
    expect(errors(await withBlock(over("fans", [], { hours: 4 })))).toEqual(["repeat"]);
    expect(errors(await withBlock(over("fans", [], { units: "imperial" })))).toEqual(["repeat"]);
    for (const max of [1, 32]) expect(errors(await withBlock(over("cores", [], { max }))), String(max)).toEqual([]);
    for (const max of [0, 33, 2.5]) expect(errors(await withBlock(over("cores", [], { max }))), String(max)).toEqual(["repeat"]);
    // a number option from 1 to 32 may set a device Repeat's most shown
    const cores = await two((r) => r.options.push({ key: "most", label: "Most", type: "number", default: 16, min: 1, max: 32 }) && rootOf(r).children.push(over("cores", [], { max: { option: "most" } })));
    expect(errors(cores)).toEqual([]);
  });

  it("grid: columns a whole 1 to 12 or none, spacing tight or roomy, anything inside, a Repeat filling it", async () => {
    expect(errors(await withBlock(grid([over("cores", [field("load")])])))).toEqual([]);
    for (const columns of [1, 12]) expect(errors(await withBlock(grid([], { columns }))), String(columns)).toEqual([]);
    for (const columns of [0, 13, 2.5]) expect(errors(await withBlock(grid([], { columns }))), String(columns)).not.toEqual([]);
    expect(errors(await withBlock(grid([], { columns: 13 })))).toEqual(["grid"]);
    for (const spacing of ["tight", "roomy"]) expect(errors(await withBlock(grid([], { spacing }))), spacing).toEqual([]);
    expect(errors(await withBlock({ type: "row", children: [], spacing: "tight" } as unknown as Block))).toEqual(["block"]);
    expect(errors(await withBlock(grid([{ type: "label", text: "x" } as Block, { type: "card", title: "In a cell", children: [] } as Block])))).toEqual([]);
  });

  it("grid: never inside a Repeat; a Repeat in a grid in a Repeat is still a Repeat in a Repeat; the depth limit counts it", async () => {
    expect(await message(withBlock(over("drives", [grid([])])), "grid")).toBe("$.root.children[3].children[0]: a Grid inside a Repeat; a Repeat lays its items out as a grid itself");
    expect(errors(await withBlock(grid([over("cores", [over("fans", [])])])))).toContain("repeat");
    // root (1) > grid (2) > row (3) > row (4) > row (5) > row (6) > label (7)
    const deep = grid([{ type: "row", children: [{ type: "row", children: [{ type: "row", children: [{ type: "row", children: [{ type: "label", text: "x" }] }] }] }] } as Block]);
    expect(errors(await withBlock(deep))).toEqual(["depth"]);
  });

  it("format: a grid and a Repeat over devices in a recipe that says format 1 are refused, in words; their keys are not listed again", async () => {
    const cases: [string, Block, string][] = [
      ["grid", grid([], { columns: 4, spacing: "tight" }), "$.root.children[3].type: a grid needs recipe format 2"],
      ["source", over("drives", [field("used")], { max: 20 }), "$.root.children[3].source: a Repeat over drives, cores, fans, adapters or GPUs needs recipe format 2"],
    ];
    for (const [name, block, text] of cases) {
      const issues = validateRecipe({ files: await cpu((r) => rootOf(r).children.push(block)) });
      expect(issues.map((i) => [i.rule, i.message]), name).toEqual([["format", text]]);
    }
  });
});
