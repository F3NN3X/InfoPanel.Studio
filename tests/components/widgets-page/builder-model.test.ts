import { describe, expect, it } from "vitest";
import { addBlock, addBlockAt, addOption, addRefusal, blockAt, blockCount, clampCells, devicesIn, draftSample, duplicateBlock, duplicateBlocks, flatten, followable, followOf, isBound, keyMove, labelParts, layerName, moveBlock, moveBlocks, moveItem, moveOption, moveRefusal, newRecipe, optionUses, pickBinding, pickWhat, pathsOf, presetLine, presetValues, rangeOf, recipeIssues, removeBlock, removeBlocks, removeOption, removePreset, replaceSensor, savePreset, setDefaultPreset, setLabelParts, setLabelSource, setPresetValue, setRecipeSize, stepBlock, topLevel, unpickBinding, updateBlock, validationLine, withFormat, withSample, wrapInRow } from "@/components/widgets-page/builder-model";
import { amend, commit, historyOf, HISTORY_LIMIT, redo, undo } from "@/components/widgets-page/history";
import { NO_START, START, whyNoStart } from "@/components/widgets-page/start-points";
import { WIDGET_ORDER } from "@/widgets/order";
import { oneOf, wholeIn } from "@/widgets/recipe/follow";
import type { Block, Recipe, RepeatDirection } from "@/widgets/recipe/types";

// The builder's model: the block tree edits, a binding turned into an option (a device or a sensor), options and presets, undo,
// and the start points. Each edit is checked by the validator the builder's line reads, so a recipe built here is one the
// Widgets page can store.

const CPU = "amd_ryzen_9_9950x3d";
const DATA = { [`libre.${CPU}_cpu_total`]: "64.2 %", [`libre.${CPU}_core__tctl_tdie`]: "67.5 °C", "libre.nvidia_geforce_rtx_5090_gpu_core_load": "87 %" };
const DEVICES = devicesIn(DATA);
const errorsOf = (r: Recipe) => recipeIssues(r).filter((i) => i.severity === "error").map((i) => i.message);

/** The mockup's CPU card as the builder makes it: a top row of a ring and a column of values, then a sparkline. */
function cpuCard(): Recipe {
  const row = addBlock(newRecipe("CPU card", new Set()), [], "row", `libre.${CPU}_cpu_total`);
  const ring = addBlock(updateBlock(row.recipe, row.path, { name: "Top row" }), row.path, "ring", `libre.${CPU}_cpu_total`);
  const values = addBlock(ring.recipe, row.path, "row", `libre.${CPU}_cpu_total`);
  const temp = addBlock(updateBlock(values.recipe, values.path, { name: "Values", direction: "column" }), values.path, "value", `libre.${CPU}_core__tctl_tdie`);
  return addBlock(temp.recipe, [], "sparkline", `libre.${CPU}_cpu_total`).recipe;
}

describe("the block tree", () => {
  it("adds into a container, after a leaf, and to the root card when nothing is selected", () => {
    const r = cpuCard();
    expect(flatten(r).map(({ block, depth }) => `${depth}:${block.type}`)).toEqual(["0:card", "1:row", "2:ring", "2:row", "3:value", "1:sparkline"]);
    expect(blockCount(r)).toBe(6);
    const { recipe, path } = addBlock(r, [0, 0], "value", `libre.${CPU}_package`);
    expect(path).toEqual([0, 1]);
    expect(blockAt(recipe, [0, 1])?.type).toBe("value");
    expect(addBlock(r, [], "label", "x.y").path).toEqual([2]);
  });

  it("a Repeat runs over the first place list, made as Locations when there is none, and its blocks read the item's fields", () => {
    const { recipe, path } = addBlock(newRecipe("Weather", new Set()), [], "repeat", "x.y");
    expect(recipe.options).toMatchObject([{ key: "places", label: "Locations", type: "place-list" }]);
    expect(recipe.sample.items?.places.map((i) => i.name)).toEqual(["Oslo", "Brevik", "Tokyo"]);
    expect(layerName(recipe, blockAt(recipe, path)!)).toBe("Repeat · Locations");
    const inside = addBlock(recipe, path, "value", "x.y");
    expect((blockAt(inside.recipe, inside.path) as Extract<Block, { type: "value" }>).bind).toEqual({ field: "temp" });
    expect(addBlock(inside.recipe, inside.path, "weather-icon", "x.y").recipe.root.children[0]).toMatchObject({ children: [{ type: "value" }, { type: "weather-icon", bind: { field: "condition" } }] });
  });

  it("removes a block and selects its previous sibling, else its parent; the root stays", () => {
    const r = cpuCard();
    expect(removeBlock(r, [1])).toMatchObject({ path: [0] });
    expect(removeBlock(r, [0, 1, 0])).toMatchObject({ path: [0, 1] });
    expect(blockCount(removeBlock(r, [0]).recipe)).toBe(2);
    expect(removeBlock(r, []).recipe).toBe(r);
  });

  it("moves a block among its siblings, and not past either end", () => {
    const r = cpuCard();
    const down = stepBlock(r, [0, 0], 1);
    expect(down.path).toEqual([0, 1]);
    expect((blockAt(down.recipe, [0]) as Extract<Block, { type: "row" }>).children.map((b) => b.type)).toEqual(["row", "ring"]);
    expect(stepBlock(r, [0, 1], 1)).toMatchObject({ recipe: r, path: [0, 1] });
  });

  it("sets and removes a block's fields", () => {
    const r = updateBlock(cpuCard(), [0, 0], { color: "thresholds", thresholds: { warn: 70, crit: 90 } });
    expect(blockAt(r, [0, 0])).toMatchObject({ color: "thresholds" });
    expect(blockAt(updateBlock(r, [0, 0], { thresholds: undefined }), [0, 0])).not.toHaveProperty("thresholds");
  });
});

describe("Let people pick", () => {
  it("turns a device's key into a device option, and every key of that device in the recipe names it", () => {
    const r = pickBinding(cpuCard(), [0, 0], DEVICES);
    expect(r.options).toEqual([{ key: "cpu", label: "CPU", type: "device", kind: "cpu", default: "auto" }]);
    expect(blockAt(r, [0, 0])).toMatchObject({ bind: { sensor: "libre.{cpu}_cpu_total" } });
    expect(blockAt(r, [0, 1, 0])).toMatchObject({ bind: { sensor: "libre.{cpu}_core__tctl_tdie" } });
    expect(blockAt(r, [1])).toMatchObject({ bind: { sensor: "libre.{cpu}_cpu_total" } });
    expect(pickWhat(r, [0, 0], DEVICES)).toBe("the CPU");
    expect(optionUses(r, "cpu")).toBe(3);
    expect(errorsOf(r)).toEqual([]);
  });

  it("turns any other key into a sensor option holding it", () => {
    const r0 = updateBlock(cpuCard(), [1], { bind: { sensor: "plugins.fps.value" } });
    expect(pickWhat(r0, [1], DEVICES)).toBe("the sensor");
    const r = pickBinding(r0, [1], DEVICES);
    expect(r.options).toEqual([{ key: "sparkline", label: "Sparkline", type: "sensor", default: "plugins.fps.value" }]);
    expect(blockAt(r, [1])).toMatchObject({ bind: { option: "sparkline" } });
    expect(unpickBinding(r, [1], DATA)).toEqual(r0);
  });

  it("turned off, a device option's keys take its device (Auto: the one in the data) and the option goes", () => {
    const r = unpickBinding(pickBinding(cpuCard(), [0, 0], DEVICES), [0, 0], DATA);
    expect(r).toEqual(cpuCard());
  });

  it("is not offered for a Repeat item's field", () => {
    const { recipe, path } = addBlock(addBlock(newRecipe("W", new Set()), [], "repeat", "x.y").recipe, [0], "value", "x.y");
    expect(pickWhat(recipe, path, DEVICES)).toBeUndefined();
  });
});

describe("options and presets", () => {
  const withToggles = () =>
    addOption(addOption(pickBinding(cpuCard(), [0, 0], DEVICES), { key: "showClock", label: "Show clock", type: "boolean", default: true }), {
      key: "history",
      label: "History",
      type: "select",
      default: "60",
      options: [{ value: "60", label: "60 s" }, { value: "300", label: "5 min" }],
    });

  it("orders options by drag and removes one with its preset values", () => {
    const r = withToggles();
    expect(moveOption(r, 2, 0).options.map((o) => o.key)).toEqual(["history", "cpu", "showClock"]);
    expect(moveOption(r, 0, 9)).toBe(r);
    const saved = savePreset(r, "Compact", { showClock: false, history: "60" }, [2, 2]);
    expect(removeOption(saved, "showClock").presets.at(-1)?.settings).toEqual({});
    expect(addOption(r, { key: "showClock", label: "Again", type: "boolean", default: false }).options.at(-1)?.key).toBe("showClock2");
  });

  it("saves the current values that differ from the defaults and the size, under a unique id; one default stays", () => {
    let r = withToggles();
    r = savePreset(r, "Compact", { cpu: "auto", showClock: false, history: "60" }, [2, 2]);
    expect(r.presets.at(-1)).toEqual({ id: "compact", name: "Compact", settings: { showClock: false }, size: [2, 2] });
    expect(savePreset(r, "Compact", {}, [2, 2]).presets.at(-1)?.id).toBe("compact-2");
    expect(presetValues(r, r.presets.at(-1))).toMatchObject({ showClock: false, history: "60", cpu: "auto" });
    expect(presetLine(r, r.presets.at(-1)!)).toBe("Show clock Off · 2×2");
    r = setDefaultPreset(r, "compact");
    expect(r.presets.filter((p) => p.default).map((p) => p.id)).toEqual(["compact"]);
    r = removePreset(r, "compact");
    expect(r.presets.filter((p) => p.default).map((p) => p.id)).toEqual(["default"]);
    expect(removePreset(r, "default")).toBe(r);
    expect(errorsOf(r)).toEqual([]);
  });

  it("a 1x1 Ring only preset passes the floor once the values leave one column", () => {
    let r = withToggles();
    r = { ...r, size: { ...r.size, min: [1, 1] } };
    r = savePreset(r, "Ring only", {}, [1, 1]);
    expect(validationLine(r, recipeIssues(r)).floor).toMatch(/under 11 px/);
    r = updateBlock(r, [0, 1], { when: { size: { min: [2, 1] } } });
    const line = validationLine(r, recipeIssues(r));
    expect(line).toMatchObject({ ok: true, floor: "Text stays above 11 px at every size" });
    expect(line.summary).toBe("No code · 6 blocks · 3 options · sizes 1×1 to 4×3");
  });
});

describe("a setting that follows an option", () => {
  const recipe: Recipe = {
    ...newRecipe("W", new Set()),
    options: [
      { key: "layout", label: "Layout", type: "select", default: "list", options: [{ value: "list", label: "List" }, { value: "grid", label: "Grid" }] },
      { key: "dir", label: "Direction", type: "select", default: "rows", options: [{ value: "rows", label: "Rows" }, { value: "columns", label: "Columns" }] },
      { key: "count", label: "Count", type: "number", default: 4, min: 1, max: 12 },
      { key: "show", label: "Show", type: "boolean", default: true },
    ],
  };
  const dirs = oneOf<RepeatDirection>(["rows", "columns", "grid"]);

  it("offers selects for a word, and numbers too for a number", () => {
    expect(followable(recipe, false).map((o) => o.key)).toEqual(["layout", "dir"]);
    expect(followable(recipe, true).map((o) => o.key)).toEqual(["layout", "dir", "count"]);
  });

  it("follows a select whose choices it takes as they are, maps any other select's choices, and a number as it is", () => {
    const o = (k: string) => recipe.options.find((x) => x.key === k)!;
    expect(followOf(o("dir"), dirs, "rows")).toEqual({ option: "dir" });
    expect(followOf(o("layout"), dirs, "rows")).toEqual({ option: "layout", map: { list: "rows", grid: "grid" } });
    expect(followOf(o("count"), wholeIn(1, 12), 12)).toEqual({ option: "count" });
    expect(followOf(o("layout"), wholeIn(1, 12), 12)).toEqual({ option: "layout", map: { list: 12, grid: 12 } });
  });
});

describe("the sample a save writes", () => {
  it("holds the readings of every key the recipe reads, with its devices filled in", () => {
    const r = withSample(pickBinding(cpuCard(), [0, 0], DEVICES), DATA);
    expect(r.sample.sensors).toEqual({ [`libre.${CPU}_cpu_total`]: "64.2 %", [`libre.${CPU}_core__tctl_tdie`]: "67.5 °C" });
  });
});

describe("undo", () => {
  it("steps back and forward, an edit drops what was undone, the same value is no step", () => {
    let h = historyOf(1);
    h = commit(commit(h, 2), 3);
    expect(commit(h, 3)).toBe(h);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(redo(h).present).toBe(3);
    h = commit(undo(h), 9);
    expect([h.past, h.present, h.future]).toEqual([[], 9, []].map((x, k) => (k === 0 ? [1] : x)));
    expect(undo(historyOf(1))).toEqual(historyOf(1));
    let long = historyOf(0);
    for (let n = 1; n <= HISTORY_LIMIT + 5; n++) long = commit(long, n);
    expect(long.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("start points", () => {
  it("every built-in has a start point or a reason, never both", () => {
    for (const id of WIDGET_ORDER) {
      expect(!!START[id] !== !!NO_START[id], id).toBe(true);
      expect(!!whyNoStart(id), id).toBe(!START[id]);
    }
    expect(Object.keys(START).sort()).toEqual(["CpuMonitor", "GpuMonitor", "SensorValue", "Weather"]);
  });

  it("each start point is a recipe the validator passes", () => {
    for (const [id, make] of Object.entries(START)) expect(errorsOf(make(`${id} recipe`, new Set())), id).toEqual([]);
  });
});

describe("duplicate and preset values", () => {
  it("copies a block (and what it holds) right after it", () => {
    const { recipe, path } = duplicateBlock(cpuCard(), [0]);
    expect(path).toEqual([1]);
    expect(blockAt(recipe, [1])).toEqual(blockAt(recipe, [0]));
    expect(blockCount(recipe)).toBe(blockCount(cpuCard()) + 4);
    expect(duplicateBlock(cpuCard(), []).path).toEqual([]);
  });

  it("a preset's value: the default preset's is the option's default, another's only what differs from it", () => {
    let r = addOption(cpuCard(), { key: "showClock", label: "Show clock", type: "boolean", default: true });
    r = savePreset(r, "Compact", {}, [2, 2]);
    r = setPresetValue(r, "compact", "showClock", false);
    expect(r.presets.at(-1)?.settings).toEqual({ showClock: false });
    expect(setPresetValue(r, "compact", "showClock", true).presets.at(-1)?.settings).toEqual({});
    r = setPresetValue(r, "default", "showClock", false);
    expect(r.options.at(-1)?.default).toBe(false);
    expect(r.presets[0].settings).toEqual({});
  });
});

/** A Weather card as the builder makes it: a Repeat over Locations with a weather icon and a column of the place's name. */
function weatherCard(): Recipe {
  const rep = addBlock(newRecipe("Weather", new Set()), [], "repeat", "x.y");
  const icon = addBlock(rep.recipe, rep.path, "weather-icon", "x.y");
  const col = addBlock(icon.recipe, rep.path, "row", "x.y");
  return addBlock(updateBlock(col.recipe, col.path, { name: "City" }), col.path, "label", "x.y").recipe;
}
const namesAt = (r: Recipe, path: number[]) => (blockAt(r, path) as Extract<Block, { children: Block[] }>).children.map((b) => b.name ?? b.type);

describe("moving a block between containers (G1)", () => {
  it("moves into a Row, out of it, and between Rows and Cards, keeping what it holds", () => {
    const r = cpuCard(); // card[ Top row[ ring, Values[ value ] ], sparkline ]
    const into = moveBlock(r, [1], [0, 1], 0);
    expect(into.path).toEqual([0, 1, 0]);
    expect(namesAt(into.recipe, [0, 1])).toEqual(["sparkline", "value"]);
    expect(errorsOf(into.recipe)).toEqual([]);
    const out = moveBlock(into.recipe, [0, 1, 0], [], 1);
    expect(out.path).toEqual([1]);
    expect(namesAt(out.recipe, [])).toEqual(["Top row", "sparkline"]);
    // a whole row with its blocks into a new card, then that card into the top row
    const card = addBlock(r, [], "card", "x.y");
    const moved = moveBlock(card.recipe, [0, 1], card.path, 0);
    expect(moved.path).toEqual([2, 0]);
    expect(namesAt(moved.recipe, moved.path)).toEqual(["value"]);
    expect(namesAt(moveBlock(moved.recipe, [2], [0], 0).recipe, [0])).toEqual(["Card", "ring"]);
  });

  it("moves within its own container to the index as the tree is now", () => {
    const r = cpuCard();
    expect(moveBlock(r, [0, 0], [0], 2).path).toEqual([0, 1]);
    expect(namesAt(moveBlock(r, [0, 0], [0], 2).recipe, [0])).toEqual(["Values", "ring"]);
    // onto its own place: nothing
    expect(moveBlock(r, [0, 0], [0], 1)).toMatchObject({ recipe: r, path: [0, 0] });
  });

  it("moves into and out of a Repeat, the target's path following the block that left", () => {
    const w = addBlock(weatherCard(), [], "label", "x.y"); // a typed label beside the Repeat
    const into = moveBlock(w.recipe, w.path, [0], 0);
    expect(into.path).toEqual([0, 0]);
    expect(namesAt(into.recipe, [0])).toEqual(["label", "weather-icon", "City"]);
    expect(errorsOf(into.recipe)).toEqual([]);
    // the label first, then into the Repeat (now the second block): the target's index moves up one as the label leaves
    const first = moveBlock(w.recipe, [1], [], 0).recipe;
    const back = moveBlock(first, [0], [1], 0);
    expect(back.path).toEqual([0, 0]);
    expect(namesAt(back.recipe, [0])[0]).toBe("label");
  });

  it("refuses what the validator would refuse, saying why", () => {
    const w = weatherCard();
    const second = addBlock(w, [], "repeat", "x.y");
    expect(moveRefusal(second.recipe, second.path, [0])).toBe("A Repeat can't go inside another Repeat");
    expect(moveBlock(second.recipe, second.path, [0], 0).recipe).toBe(second.recipe);
    // a block reading a place's field stays inside a Repeat
    expect(moveRefusal(w, [0, 1], [])).toBe("City reads each place's weather: it goes inside a Repeat only");
    expect(moveRefusal(w, [0], [0, 1])).toBe("A block can't go inside itself");
    expect(moveRefusal(w, [0, 0], [0, 0])).toBe("Only a Row, a Card or a Repeat holds blocks");
    expect(moveRefusal(w, [], [0])).toBe("The widget's card stays where it is");
    // deeper than six: rows nested four deep under the card, then a row holding a label moved into the deepest
    let deep = newRecipe("Deep", new Set());
    let at: number[] = [];
    for (let n = 0; n < 4; n++) {
      const row = addBlock(deep, at, "row", "x.y");
      deep = row.recipe;
      at = row.path;
    }
    const holder = addBlock(deep, [], "row", "x.y");
    const filled = addBlock(holder.recipe, holder.path, "label", "x.y").recipe;
    expect(moveRefusal(filled, holder.path, at)).toBe("Blocks nest at most 6 deep");
    expect(moveRefusal(filled, [...holder.path, 0], at)).toBeUndefined();
  });

  it("Alt+← takes a block out after its container, Alt+→ into the container just above it", () => {
    const r = cpuCard();
    expect(keyMove(r, [0, 1, 0], "out")).toEqual({ toParent: [0], index: 2 });
    expect(keyMove(r, [1], "in")).toEqual({ toParent: [0], index: 2 });
    expect(keyMove(r, [0, 0], "in")).toEqual({ why: "There is no Row, Card or Repeat just above it" });
    expect(keyMove(r, [1], "out")).toEqual({ why: "It is in the widget's card already" });
    expect(keyMove(weatherCard(), [0, 0], "out")).toEqual({ why: "Weather icon reads each place's weather: it goes inside a Repeat only" });
  });
});

describe("labels: typed, from data, and parts (G3, G4, B9)", () => {
  it("a label inside a Repeat goes back to typed text, and to data again (B9)", () => {
    const w = weatherCard();
    const typed = setLabelSource(w, [0, 1, 0], "typed", "x.y");
    expect(blockAt(typed, [0, 1, 0])).toEqual({ type: "label", text: "Label" });
    expect(blockAt(setLabelSource(typed, [0, 1, 0], "data", "x.y"), [0, 1, 0])).toEqual({ type: "label", bind: { field: "name" } });
    // outside a Repeat, from data reads a sensor, or an option people set (a Text option is of use now)
    const card = addBlock(addOption(newRecipe("Note", new Set()), { key: "note", label: "Note", type: "text", default: "Hi" }), [], "label", "x.y");
    expect(blockAt(setLabelSource(card.recipe, card.path, "data", "libre.cpu_total"), card.path)).toEqual({ type: "label", bind: { sensor: "libre.cpu_total" } });
    expect(errorsOf(updateBlock(card.recipe, card.path, { text: undefined, bind: { option: "note" } }))).toEqual([]);
  });

  it("writes one reading as bind and one text as text (format 1), more as parts (format 2), and back", () => {
    const w = weatherCard();
    const at = [0, 1, 0];
    const hl = setLabelParts(w, at, [{ bind: { field: "high" }, decimals: 0, unit: "°" }, { text: " / " }, { bind: { field: "low" }, decimals: 0, unit: "°" }]);
    expect(blockAt(hl, at)).toEqual({ type: "label", parts: [{ bind: { field: "high" }, decimals: 0, unit: "°" }, { text: " / " }, { bind: { field: "low" }, decimals: 0, unit: "°" }] });
    expect(labelParts(blockAt(hl, at) as Extract<Block, { type: "label" }>)).toHaveLength(3);
    expect(withFormat(hl).format).toBe(2);
    expect(errorsOf(withFormat(hl))).toEqual([]);
    expect(errorsOf(hl)).toEqual(["$.root.children[0].children[1].children[0].parts: parts need recipe format 2"]);
    const two = withFormat(hl);
    expect(withFormat(two)).toBe(two);
    const one = setLabelParts(withFormat(hl), at, [{ bind: { field: "name" } }]);
    expect(blockAt(one, at)).toEqual({ type: "label", bind: { field: "name" } });
    expect(withFormat(one).format).toBe(1);
    // no new key: format 1, the very same recipe
    expect(withFormat(w)).toBe(w);
    expect(blockAt(setLabelParts(hl, at, [{ text: "Now" }]), at)).toEqual({ type: "label", text: "Now" });
  });

  it("a part's reading counts as a read: an option it names is used, a device's key follows the pick", () => {
    const card = addBlock(addOption(newRecipe("C", new Set()), { key: "note", label: "Note", type: "text", default: "" }), [], "label", "x.y");
    const r = setLabelParts(card.recipe, card.path, [{ bind: { option: "note" } }, { text: " · " }, { bind: { sensor: `libre.${CPU}_cpu_total` }, unit: "%" }]);
    expect(optionUses(r, "note")).toBe(1);
    expect(flatten(r).filter(({ block }) => block.type === "label").map(({ block }) => isBound(block))).toEqual([true]);
    // a ring of the same CPU let people pick it: the part's key names the device option too
    const ring = addBlock(r, [], "ring", `libre.${CPU}_cpu_total`);
    const picked = pickBinding(ring.recipe, ring.path, DEVICES);
    expect((blockAt(picked, card.path) as Extract<Block, { type: "label" }>).parts?.[2]).toEqual({ bind: { sensor: "libre.{cpu}_cpu_total" }, unit: "%" });
  });
});

describe("sizes (B6)", () => {
  it("Opens at is the default preset's size too, so Add places the widget there", () => {
    const r = setRecipeSize(newRecipe("W", new Set()), "default", [4, 3]);
    expect(r.size.default).toEqual([4, 3]);
    expect(r.presets.find((p) => p.default)?.size).toEqual([4, 3]);
    expect(setRecipeSize(r, "min", [1, 1]).presets[0].size).toEqual([4, 3]);
    expect(errorsOf(r)).toEqual([]);
  });
});

describe("lists inside a block", () => {
  it("moves an item from one place to another, and leaves the list as it was for a place out of range", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("found in Phase A", () => {
  it("B14: the validation line counts in words that agree with the number (1 option, not 1 options)", () => {
    const r = addOption(newRecipe("W", new Set()), { key: "show", label: "Show", type: "boolean", default: true });
    expect(validationLine(r, recipeIssues(r)).summary).toBe("No code · 1 block · 1 option · sizes 2×2 to 4×3");
  });

  it("B15: a heatmap cell bound to a sensor option counts as a use, so the option can't be removed from under it", () => {
    const h = addBlock(addOption(newRecipe("W", new Set()), { key: "core", label: "Core", type: "sensor", default: "libre.cpu_total" }), [], "heatmap", "libre.cpu_total");
    const r = updateBlock(h.recipe, h.path, { cells: [{ option: "core" }] });
    expect(optionUses(r, "core")).toBe(1);
  });
});

describe("a selection of blocks (Phase B1, G11)", () => {
  it("acts on the blocks themselves: the root and blocks inside another selected one left out, in tree order", () => {
    expect(topLevel([[1], [], [0, 1, 0], [0], [0, 1], [1]])).toEqual([[0], [1]]);
    expect(topLevel([[2, 1], [0, 3], [2]])).toEqual([[0, 3], [2]]);
    // Shift+click: the rows between the last pick and this one, either way
    const keys = ["", "0", "0.0", "0.1", "1"];
    expect(rangeOf(keys, "1", "0.0")).toEqual([[0, 0], [0, 1], [1]]);
    expect(rangeOf(keys, "missing", "0")).toEqual([[0]]);
  });

  it("deletes several blocks in one edit and selects the block before the first", () => {
    const r = cpuCard(); // card[ Top row[ ring, Values[ value ] ], sparkline ]
    const out = removeBlocks(r, [[1], [0, 1], [0, 1, 0]]);
    expect(flatten(out.recipe).map(({ block }) => block.name ?? block.type)).toEqual(["card", "Top row", "ring"]);
    expect(out.path).toEqual([0, 0]);
    // the first of the root's blocks: nothing before it, so its parent
    expect(removeBlocks(r, [[0], [1]]).path).toEqual([]);
    expect(errorsOf(out.recipe)).toEqual([]);
  });

  it("moves a selection into a container in tree order, as one edit, and refuses it with the first reason", () => {
    const r = addBlock(cpuCard(), [], "card", "x.y").recipe; // card[ Top row, sparkline, Card ]
    const into = moveBlocks(r, [[1], [0, 0]], [2], 0);
    if ("why" in into) throw new Error(into.why);
    expect(namesAt(into.recipe, [1])).toEqual(["ring", "sparkline"]);
    expect(into.paths).toEqual([[1, 0], [1, 1]]);
    expect(pathsOf(into.recipe, into.paths.map((x) => blockAt(into.recipe, x)!))).toEqual(into.paths);
    // within one container: before the first block left in place at the index
    const within = moveBlocks(r, [[0], [1]], [], 3);
    if ("why" in within) throw new Error(within.why);
    expect(namesAt(within.recipe, [])).toEqual(["Card", "Top row", "sparkline"]);
    // onto where they are: the recipe as it was
    expect(moveBlocks(r, [[0], [1]], [], 0)).toMatchObject({ recipe: r });
    const w = addBlock(weatherCard(), [], "repeat", "x.y").recipe;
    expect(moveBlocks(w, [[0, 0], [1]], [0], 0)).toEqual({ why: "A Repeat can't go inside another Repeat" });
    expect(moveBlocks(w, [[]], [0], 0)).toEqual({ why: "The widget's card stays where it is" });
  });

  it("wraps blocks side by side in a new Row where the first was, as one edit; blocks in different containers or too deep are refused", () => {
    const r = cpuCard();
    const wrapped = wrapInRow(r, [[1], [0]]);
    if ("why" in wrapped) throw new Error(wrapped.why);
    expect(wrapped.path).toEqual([0]);
    expect(namesAt(wrapped.recipe, [])).toEqual(["Row"]);
    expect(namesAt(wrapped.recipe, [0])).toEqual(["Top row", "sparkline"]);
    expect(errorsOf(wrapped.recipe)).toEqual([]);
    // one block wraps alone, in its place among its siblings
    const one = wrapInRow(r, [[0, 1]]);
    if ("why" in one) throw new Error(one.why);
    expect(namesAt(one.recipe, [0])).toEqual(["ring", "Row"]);
    expect(wrapInRow(r, [[1], [0, 0]])).toEqual({ why: "Only blocks in the same container wrap together" });
    expect(wrapInRow(r, [[]])).toEqual({ why: "The widget's card can't go into a Row" });
    // a label sixth (the card, four rows, the label): a Row around it, or around any row above it, would put it seventh
    let deep = newRecipe("Deep", new Set());
    let at: number[] = [];
    for (let n = 0; n < 4; n++) {
      const row = addBlock(deep, at, "row", "x.y");
      deep = row.recipe;
      at = row.path;
    }
    const label = addBlock(deep, at, "label", "x.y");
    expect(wrapInRow(label.recipe, [label.path])).toEqual({ why: "Blocks nest at most 6 deep" });
    expect(wrapInRow(label.recipe, [at])).toEqual({ why: "Blocks nest at most 6 deep" });
    expect("why" in wrapInRow(addBlock(label.recipe, [], "label", "x.y").recipe, [[1]])).toBe(false);
  });

  it("duplicates each selected block right after it, and selects the copies", () => {
    const r = cpuCard();
    const d = duplicateBlocks(r, [[1], [0, 0]]);
    expect(namesAt(d.recipe, [])).toEqual(["Top row", "sparkline", "sparkline"]);
    expect(namesAt(d.recipe, [0])).toEqual(["ring", "ring", "Values"]);
    expect(d.paths).toEqual([[0, 1], [2]]);
  });
});

describe("a tile dropped at a place (Phase B1, G12)", () => {
  it("adds the block there, or says why it can't go there", () => {
    const r = cpuCard();
    const at = addBlockAt(r, [0], 1, "value", "libre.x");
    expect(at.path).toEqual([0, 1]);
    expect(namesAt(at.recipe, [0])).toEqual(["ring", "value", "Values"]);
    // past the end: at the end
    expect(addBlockAt(r, [], 9, "label", "x.y").path).toEqual([2]);
    const w = weatherCard();
    expect(addRefusal(w, "repeat", [0])).toBe("A Repeat can't go inside another Repeat");
    expect(addRefusal(w, "value", [0])).toBeUndefined();
    expect(addRefusal(w, "label", [0, 0])).toBe("Only a Row, a Card or a Repeat holds blocks");
  });
});

describe("undo of a cut and its paste (Phase B1, G10)", () => {
  it("folds an edit into the last step: one undo goes back past both", () => {
    const h = amend(commit(historyOf(1), 2), 3);
    expect(h).toEqual({ past: [1], present: 3, future: [] });
    expect(undo(h).present).toBe(1);
    expect(amend(h, 3)).toBe(h);
  });
});

describe("Phase B2", () => {
  it("Replace sensor swaps one key everywhere it is read, a sensor option's default too, and lists what changed (G16)", () => {
    const key = `libre.${CPU}_cpu_total`;
    const card = cpuCard();
    const withOption = addOption(card, { key: "watch", label: "Watched", type: "sensor", default: key });
    const r = replaceSensor(withOption, key, "libre.gpu_load");
    expect(r.changed).toEqual(["Ring", "Sparkline", "Option “Watched”"]);
    expect(blockAt(r.recipe, [0, 0])).toMatchObject({ bind: { sensor: "libre.gpu_load" } });
    expect(blockAt(r.recipe, [1])).toMatchObject({ bind: { sensor: "libre.gpu_load" } });
    // a key no block reads, and the same key, change nothing
    expect(blockAt(r.recipe, [0, 1, 0])).toMatchObject({ bind: { sensor: `libre.${CPU}_core__tctl_tdie` } });
    expect(r.recipe.options[0].default).toBe("libre.gpu_load");
    expect(replaceSensor(card, "libre.none", "libre.gpu_load")).toEqual({ recipe: card, changed: [] });
    expect(replaceSensor(card, key, key).recipe).toBe(card);
    // a templated key swaps as it is written
    const picked = pickBinding(card, [0, 0], DEVICES);
    const t = replaceSensor(picked, "libre.{cpu}_cpu_total", "libre.{cpu}_package");
    expect(t.changed).toEqual(["Ring", "Sparkline"]);
    expect(errorsOf(t.recipe)).toEqual([]);
  });

  it("the stage's size is clamped to the recipe's range, whole cells (G17)", () => {
    const r = newRecipe("Any size", new Set());
    expect(r.size).toMatchObject({ min: [2, 2], max: [4, 3] });
    expect(clampCells(r, [3, 3])).toEqual([3, 3]);
    expect(clampCells(r, [9, 1])).toEqual([4, 2]);
    expect(clampCells(r, [2.6, Number.NaN])).toEqual([3, 2]);
  });

  it("the Sample before a save fills the keys the sample lacks from the live readings, and keeps its own (G18)", () => {
    const key = `libre.${CPU}_cpu_total`;
    const temp = `libre.${CPU}_core__tctl_tdie`;
    const fresh = cpuCard();
    expect(fresh.sample.sensors).toEqual({});
    expect(draftSample(fresh, DATA).sample.sensors).toEqual({ [key]: "64.2 %", [temp]: "67.5 °C" });
    // a saved sample stays as it was saved; a key bound since comes from the live readings
    const saved = { ...fresh, sample: { sensors: { [key]: "12 %" } } };
    expect(draftSample(saved, DATA).sample.sensors).toEqual({ [key]: "12 %", [temp]: "67.5 °C" });
    // nothing live: nothing made up
    expect(draftSample(fresh, {}).sample.sensors).toEqual({});
  });
});
