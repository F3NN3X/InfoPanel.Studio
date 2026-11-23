import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";
import RecipeView, { autoColumns, itemsOf, optionValues } from "@/widgets/recipe/RecipeView";
import { toFlat, toNames } from "@/widgets/shared/data-adapter";
import { BLOCK_TYPES, type Block, type Recipe } from "@/widgets/recipe/types";
import { FIXTURE_NAMES, fixtureRecipe } from "./fixture-files";

// The recipe renderer on the three fixtures and their sample data: every block type drawn at least once, every preset drawn
// without throwing, the theme's colours (a pack's T3 series) reaching the blocks, and a Repeat over places saying its weather is a sample.

const draw = (recipe: Recipe, saved?: ModuleSettings, extra: Record<string, unknown> = {}) => renderToStaticMarkup(<RecipeView data={{}} recipe={recipe} saved={saved} sample {...extra} />);
/** The block types a markup draws (the root card is the shell: `data-recipe`). */
const typesIn = (html: string): string[] => [...new Set([...html.matchAll(/data-recipe-block="([\w-]+)"/g)].map((m) => m[1]))];

describe("RecipeView", () => {
  it("draws every block type", () => {
    const seen = new Set<string>();
    for (const name of FIXTURE_NAMES) {
      const recipe = fixtureRecipe(name);
      const html = draw(recipe, { showCores: true });
      expect(html, name).toContain(`data-recipe="recipe:${name}"`);
      seen.add("card");
      for (const t of typesIn(html)) seen.add(t);
    }
    // a card inside the card, from the CPU card's values
    const nested = fixtureRecipe("cpu-card");
    const top = nested.root.children[0] as Extract<Block, { type: "row" }>;
    top.children[1] = { type: "card", title: "Readings", children: (top.children[1] as Extract<Block, { type: "row" }>).children };
    for (const t of typesIn(draw(nested))) seen.add(t);
    expect([...seen].sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("CPU card: the ring, the readings and the history from its sample, and the device's name in the header", () => {
    const html = draw(fixtureRecipe("cpu-card"), undefined, { names: { "libre.amd_ryzen_9_9950x3d_cpu_total": "AMD Ryzen 9 9950X3D CPU Total" } });
    expect(typesIn(html).sort()).toEqual(["ring", "row", "sparkline", "value"]);
    expect(html).toContain(">CPU<");
    expect(html).toContain("Ryzen 9 9950X3D");
    for (const text of ["64", "67.5", "5,120", "132", "Temp", "Clock", "Power"]) expect(html).toContain(text);
    expect(html).not.toContain('data-recipe-block="heatmap"');
  });

  it("CPU card presets turn parts off by their options", () => {
    const recipe = fixtureRecipe("cpu-card");
    const preset = (id: string) => recipe.presets.find((p) => p.id === id)!.settings as ModuleSettings;
    expect(typesIn(draw(recipe, preset("compact")))).not.toContain("sparkline");
    expect(draw(recipe, preset("compact"))).not.toContain("Clock");
    expect(typesIn(draw(recipe, preset("ring"))).sort()).toEqual(["ring", "row"]);
    expect(draw(recipe, preset("cores")).match(/min-h-1\.5 rounded-2/g)).toHaveLength(8);
  });

  it("GPU card: its gauge, values, caption, bar and the package's image", () => {
    const html = draw(fixtureRecipe("gpu-card"));
    expect(typesIn(html).sort()).toEqual(["bar", "gauge", "image", "label", "row", "value"]);
    expect(html).toContain('src="/api/widgets/recipe.gpu-card/images/logo.png"');
    expect(html).toContain("Board power");
  });

  it("follows the theme: a pack's series colour is the gauge's and the bar's", () => {
    const html = draw(fixtureRecipe("gpu-card"), undefined, { t3: { "series-2": "#ff00aa" } });
    expect(html).toContain("#ff00aa");
    // and without a pack, the theme's palette role, else the accent turned round the wheel
    expect(draw(fixtureRecipe("gpu-card"), { s2: "#00ffcc" })).toContain("#00ffcc");
    expect(draw(fixtureRecipe("gpu-card"))).toContain("oklch(from var(--w-accent)");
  });

  it("Weather · places: one row per place from the sample, and says the weather is a sample", () => {
    const recipe = fixtureRecipe("weather-places");
    const html = draw(recipe);
    expect(typesIn(html).sort()).toEqual(["label", "repeat", "row", "sparkline", "value", "weather-icon"]);
    expect(html.match(/data-recipe-item=""/g)).toHaveLength(3);
    for (const text of ["Oslo", "Brevik", "Tokyo", "Light rain", "14", "Sample weather"]) expect(html).toContain(text);
    expect(draw(recipe, { layout: "grid" }).match(/data-recipe-item=""/g)).toHaveLength(3);
    expect(draw(recipe, { layout: "one" }).match(/data-recipe-item=""/g)).toHaveLength(1);
  });

  it("reads a stored place list (JSON text), its own places' sample by name", () => {
    const recipe = fixtureRecipe("weather-places");
    const values = optionValues(recipe, { places: JSON.stringify([{ name: "Tokyo", lat: 35.68, lon: 139.69 }, { name: "Bergen", lat: 60.39, lon: 5.32 }]) });
    const items = itemsOf(recipe, "places", values);
    expect(items.map((i) => [i.name, i.temp])).toEqual([["Tokyo", 14], ["Bergen", 5]]);
    // a stored value that is not a list keeps the recipe's default
    expect((optionValues(recipe, { places: "not json" }).places as unknown[]).length).toBe(3);
  });

  it("Weather · places live: each place from the server's readings, with the provider's credit and no sample line", () => {
    const recipe = fixtureRecipe("weather-places");
    const data = {
      "weather.place.n5991e1075.temp": "-3.4 °C",
      "weather.place.n5991e1075.condition": "Snow",
      "weather.place.n5991e1075.status": "ok",
      "weather.place.n3568e13969.temp": "21 °C",
      "weather.place.n3568e13969.condition": "Clear",
      "weather.place.n3568e13969.status": "ok",
    };
    const html = draw(recipe, undefined, { sample: false, data });
    expect(html.match(/data-recipe-item=""/g)).toHaveLength(3);
    for (const text of ["Oslo", "Snow", "-3", "Tokyo", "21", "Weather data by Open-Meteo.com · CC BY 4.0"]) expect(html).toContain(text);
    expect(html).not.toContain("Sample weather");
    expect(html).not.toContain("Light rain");
    // the options take effect: °F, and the grid and one-place layouts through the one Repeat
    expect(draw(recipe, { units: "f" }, { sample: false, data })).toContain(">26<");
    expect(draw(recipe, { layout: "one" }, { sample: false, data }).match(/data-recipe-item=""/g)).toHaveLength(1);
    // late or missing data is said, never hidden
    const stale = { ...data, "weather.place.n5991e1075.status": "stale", "weather.place.n5991e1075.age": "47 min" };
    expect(draw(recipe, undefined, { sample: false, data: stale })).toContain("· 47 min old");
    expect(draw(recipe, undefined, { sample: false, data: {} })).toContain("Open-Meteo.com · CC BY 4.0 · no weather data yet");
  });

  it("Weather · places sample: the hours and units options take effect, and the sample line replaces the credit", () => {
    const recipe = fixtureRecipe("weather-places");
    const values = optionValues(recipe, { units: "f", hours: 4 });
    const shapeOf = (b: Block) => b as Extract<Block, { type: "repeat" }>;
    const repeat = shapeOf(recipe.root.children[0]);
    expect(itemsOf(recipe, "places", values, { hours: 4, units: "imperial" })[0]).toMatchObject({ name: "Oslo", temp: 39, hourly: [37, 37, 39, 39] });
    expect(repeat.hours).toEqual({ option: "hours" });
    const html = draw(recipe, { units: "f", hours: 4 });
    expect(html).toContain("Sample weather");
    expect(html).not.toContain("Open-Meteo");
    // a recipe without weather by place draws neither line
    const cpu = draw(fixtureRecipe("cpu-card"), undefined, { sample: false });
    expect(cpu).not.toContain("Open-Meteo");
    expect(cpu).not.toContain("Sample weather");
  });

  it("draws every preset of every fixture", () => {
    for (const name of FIXTURE_NAMES) {
      const recipe = fixtureRecipe(name);
      for (const p of recipe.presets) expect(() => draw(recipe, p.settings as ModuleSettings), `${name} ${p.id}`).not.toThrow();
    }
  });

  it("draws a reading that is not there as a dash, never throws", () => {
    const html = renderToStaticMarkup(<RecipeView data={{}} recipe={fixtureRecipe("cpu-card")} />);
    expect(html).toContain("–");
  });
});

describe("RecipeView, Phase A", () => {
  it("draws a label's parts as one line: each reading with its decimals and unit, the text between (G4)", () => {
    const html = draw(fixtureRecipe("weather-places"));
    for (const line of ["6° / 1°", "7° / 3°", "17° / 9°"]) expect(html).toContain(line);
    // a reading that is not there yet is a dash, without its unit
    const r = fixtureRecipe("weather-places");
    r.root.children.push({ type: "label", parts: [{ text: "Load " }, { bind: { sensor: "libre.cpu_total" }, decimals: 0 }] });
    expect(draw(r, undefined, { data: { "libre.cpu_total": "41.6 %" }, sample: false })).toContain("Load 42%");
    expect(draw(r, undefined, { data: {}, sample: false })).toContain("Load –<");
  });

  it("a nested card draws its sub-title after its title (B4)", () => {
    const r = fixtureRecipe("cpu-card");
    r.root.children = [{ type: "card", title: "Readings", subtitle: { option: "load" }, children: [{ type: "label", text: "x" }] }];
    const html = draw(r, undefined, { names: { "libre.amd_ryzen_9_9950x3d_cpu_total": "AMD Ryzen 9 9950X3D CPU Total" } });
    expect(html).toMatch(/Readings<\/span><span data-recipe-subtitle="" [^>]*>Ryzen 9 9950X3D</);
  });

  it("a bar in a series colour draws that colour, not the accent (B3)", () => {
    const r = fixtureRecipe("cpu-card");
    r.root.children = [{ type: "bar", bind: { option: "load" }, color: "series-3" }];
    expect(draw(r, undefined, { t3: { "series-3": "#12ab34" } })).toContain("background:#12ab34");
    r.root.children = [{ type: "bar", bind: { option: "load" }, color: "series-3", style: "segments" }];
    expect(draw(r, undefined, { t3: { "series-3": "#12ab34" } })).toContain("background:#12ab34");
  });

  it("a draft's picture draws from the page before the server has it (B5)", () => {
    const html = draw(fixtureRecipe("gpu-card"), undefined, { images: { "images/logo.png": "blob:http://x/1" } });
    expect(html).toContain('src="blob:http://x/1"');
    expect(draw(fixtureRecipe("gpu-card"))).toContain('src="/api/widgets/recipe.gpu-card/images/logo.png"');
  });
});

describe("RecipeView, Phase C", () => {
  /** The CPU card with its root's blocks replaced, drawn from `data` (live) or its sample. */
  const cpuWith = (blocks: Block[]) => {
    const r = fixtureRecipe("cpu-card");
    r.format = 2;
    r.root.children = blocks;
    return r;
  };
  const CLOCK = { sensor: "libre.amd_ryzen_9_9950x3d_cores__average" };

  it("Show in: the clock in GHz with its decimals, else the value's own rule; the ring's centre and range in that unit (G23)", () => {
    expect(draw(cpuWith([{ type: "value", label: "Clock", bind: CLOCK, convert: "GHz", decimals: 2 }]))).toMatch(/5\.12<span[^>]*>GHz</);
    // no decimals of its own: one under 10, as any value
    expect(draw(cpuWith([{ type: "value", bind: CLOCK, convert: "GHz" }]))).toMatch(/5\.1<span[^>]*>GHz</);
    const ring = draw(cpuWith([{ type: "ring", bind: CLOCK, convert: "GHz", min: 0, max: 6, decimals: 1 }]));
    expect(ring).toMatch(/5\.1<span[^>]*>GHz</);
    // a reading of another family is shown as it is read
    expect(draw(cpuWith([{ type: "value", bind: { sensor: "libre.amd_ryzen_9_9950x3d_cpu_total" }, convert: "GHz" }]))).toMatch(/>64<span[^>]*>%</);
  });

  it("a throughput key reads as bytes per second, so Show in gives MB/s right (B20)", () => {
    const data = { "libre.ethernet_download_speed": "920111.6875 KB/s" };
    const html = (b: Block) => draw(cpuWith([b]), undefined, { data, sample: false });
    expect(html({ type: "value", bind: { sensor: "libre.ethernet_download_speed" }, convert: "MB/s", decimals: 2 })).toMatch(/0\.92<span[^>]*>MB\/s</);
    expect(html({ type: "value", bind: { sensor: "libre.ethernet_download_speed" }, decimals: 0 })).toMatch(/920,112<span[^>]*>B\/s</);
  });

  it("a value's colour: unset is the text colour, Muted the theme's muted, an Accent picked the accent (G22, B19)", () => {
    const num = (b: Partial<Extract<Block, { type: "value" }>>) => /data-part="num"[^>]*style="([^"]*)"/.exec(draw(cpuWith([{ type: "value", bind: CLOCK, ...b }])))?.[1] ?? "";
    expect(num({})).not.toMatch(/(^|;)color:/);
    expect(num({ color: "fg" })).not.toMatch(/(^|;)color:/);
    expect(num({ color: "muted" })).toContain("color:var(--w-muted)");
    expect(num({ color: "accent" })).toContain("color:var(--w-accent)");
  });

  it("a ring's centre value in Muted; the text colour when unset (G22)", () => {
    const centre = (tone?: "fg" | "muted") => /data-part="num"[^>]*style="([^"]*)"/.exec(draw(cpuWith([{ type: "ring", bind: CLOCK, tone }])))?.[1] ?? "";
    expect(centre("muted")).toContain("color:var(--w-muted)");
    expect(centre()).not.toMatch(/(^|;)color:/);
  });

  it("align: a value's line together at the centre or the end, a label's text at its side; unset as before (G21)", () => {
    const value = (align?: "start" | "center" | "end") => draw(cpuWith([{ type: "value", label: "Clock", bind: CLOCK, align }]));
    /** The value block's line: its own style. */
    const line = (html: string) => /whitespace-nowrap leading-none" style="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(line(value("center"))).toContain("justify-content:center");
    expect(value("center")).not.toContain("tabular-nums ml-auto");
    expect(line(value("end"))).toContain("justify-content:flex-end");
    expect(value()).toContain("tabular-nums ml-auto");
    expect(line(value())).not.toContain("justify-content");
    expect(draw(cpuWith([{ type: "label", text: "x", align: "end" }]))).toContain("text-align:end");
    expect(draw(cpuWith([{ type: "label", text: "x" }]))).not.toContain("text-align");
  });

  it("low is bad: warning at the warning level and under, critical at the critical level and under (G27)", () => {
    const at = (v: string) => draw(cpuWith([{ type: "value", bind: { sensor: "system.ram.free" }, color: "thresholds", thresholds: { warn: 30, crit: 10, low: true } }]), undefined, { data: { "system.ram.free": v }, sample: false });
    expect(at("34.4 %")).not.toContain("--w-warn");
    expect(at("30 %")).toContain("--w-warn");
    expect(at("10.5 %")).toContain("--w-warn");
    expect(at("10 %")).toContain("--w-crit");
    // high is bad, unchanged: from the levels up
    const high = (v: string) => draw(cpuWith([{ type: "value", bind: { sensor: "system.ram.free" }, color: "thresholds", thresholds: { warn: 30, crit: 90 } }]), undefined, { data: { "system.ram.free": v }, sample: false });
    expect(high("20 %")).not.toContain("--w-warn");
    expect(high("30 %")).toContain("--w-warn");
  });

  it("a format 1 recipe with warning above critical draws as before: critical from the critical level up, wins over warning (no feature lost)", () => {
    const r = fixtureRecipe("cpu-card");
    r.root.children = [{ type: "value", bind: { sensor: "system.ram.free" }, color: "thresholds", thresholds: { warn: 95, crit: 10 } }];
    expect(r.format).toBe(1);
    const at = (v: string) => draw(r, undefined, { data: { "system.ram.free": v }, sample: false });
    expect(at("5 %")).not.toMatch(/--w-(warn|crit)/);
    expect(at("50 %")).toContain("--w-crit");
    expect(at("96 %")).toContain("--w-crit");
  });
});

describe("RecipeView, Phase E", () => {
  const cpuWith = (blocks: Block[], root: object = {}) => {
    const r = fixtureRecipe("cpu-card");
    r.format = 2;
    r.root = { ...r.root, ...root, children: blocks };
    return r;
  };
  const LOAD = { sensor: "libre.amd_ryzen_9_9950x3d_cpu_total" };
  const html = (blocks: Block[], root?: object) => draw(cpuWith(blocks, root));

  it("weight: a label's and a value's text in the theme's font, heavier; the number's weight goes to Num, where a Look's own wins (G21)", () => {
    expect(html([{ type: "label", text: "x", weight: "semibold" }])).toContain("font-weight:600");
    const value = html([{ type: "value", label: "Load", bind: LOAD, weight: "medium" }]);
    expect(value).toMatch(/whitespace-nowrap leading-none" style="[^"]*font-weight:500/);
    expect(value).toMatch(/data-part="num"[^>]*style="[^"]*font-weight:500/);
    // unset: the label regular, the number the theme's 700
    const plain = html([{ type: "label", text: "x" }, { type: "value", label: "Load", bind: LOAD }]);
    expect(plain).not.toMatch(/font-weight:(500|600)/);
    expect(plain).toMatch(/data-part="num"[^>]*style="[^"]*font-weight:700/);
  });

  it("case: a label in capitals; a value's label only, so its unit keeps its case (G21)", () => {
    expect(html([{ type: "label", text: "x", case: "upper" }])).toContain("text-transform:uppercase");
    const value = html([{ type: "value", label: "Load", bind: LOAD, case: "upper" }]);
    expect(value).toMatch(/<span class="min-w-0 truncate[^"]*" style="text-transform:uppercase">Load</);
    const plain = html([{ type: "value", label: "Load", bind: LOAD }]);
    expect((value.match(/text-transform/g) ?? []).length).toBe((plain.match(/text-transform/g) ?? []).length + 1);
    expect(html([{ type: "label", text: "x" }])).toContain('<span class="block w-full truncate leading-tight" style="font-size:11px;color:var(--w-fg)">x</span>');
  });

  it("opacity on a mark, as it is: a ring's arc only, a bar's fill, a sparkline, heatmap cells; nothing unset (G22)", () => {
    expect(html([{ type: "ring", bind: LOAD, opacity: 40 }])).toContain("[&amp;_[data-wp-ring]]:opacity-40");
    expect(html([{ type: "bar", bind: LOAD, opacity: 60 }])).toContain("[&amp;&gt;*]:opacity-60");
    expect(html([{ type: "sparkline", bind: LOAD, opacity: 80 }])).toMatch(/class="[^"]*\bopacity-80\b/);
    expect(html([{ type: "heatmap", cells: [LOAD], opacity: 40 }])).toMatch(/class="grid h-full w-full gap-0\.5 opacity-40"/);
    expect(html([{ type: "ring", bind: LOAD }, { type: "bar", bind: LOAD }, { type: "sparkline", bind: LOAD }])).not.toMatch(/opacity-\d/);
  });

  it("a card inside: the track and 8 px when unset, as before; none, raised from the theme's text colour, and its padding (G26)", () => {
    const card = (extra: object) => /data-recipe-block="card"[^>]*><div class="([^"]*)"(?: style="([^"]*)")?/.exec(html([{ type: "card", title: "In", children: [], ...extra } as Block]))?.slice(1).map((x) => x ?? "") ?? [];
    expect(card({})).toEqual(["flex h-full w-full min-h-0 flex-col gap-1 rounded-lg p-2", "background:var(--w-track)"]);
    expect(card({ surface: "none" })[1]).toBe("");
    expect(card({ surface: "raised" })[1]).toContain("background:color-mix(in srgb, var(--w-fg) 11%, transparent)");
    expect(card({ surface: "raised" })[0]).toContain("shadow-md ring-1 ring-inset ring-[color:var(--w-fg)]/15");
    expect(card({ surface: "raised" })[1]).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(card({ padding: "s" })).toEqual(["flex h-full w-full min-h-0 flex-col gap-1 rounded-lg", "background:var(--w-track);padding:4px"]);
    expect(card({ padding: "none" })[1]).toContain("padding:0");
    expect(card({ padding: "l" })[1]).toContain("padding:12px");
  });

  it("the root's spacing between its blocks: 6 px unset, as before; tight 2, roomy 12 (G26)", () => {
    const gap = (root?: object) => /<div class="flex h-full w-full min-h-0 min-w-0" style="flex-direction:column;gap:(\d+)px/.exec(html([{ type: "label", text: "x" }], root))?.[1];
    expect(gap()).toBe("6");
    expect(gap({ spacing: "tight" })).toBe("2");
    expect(gap({ spacing: "roomy" })).toBe("12");
  });

  it("a gauge's sweep, 270 unset as before; a bar's height, h-2 unset as before (G36)", () => {
    const turn = (extra: object) => /<g transform="rotate\((-?\d+) 50 50\)"/.exec(html([{ type: "gauge", bind: LOAD, ...extra } as Block]))?.[1];
    expect(turn({})).toBe("-135");
    expect(turn({ sweep: 240 })).toBe("-120");
    expect(turn({ sweep: 180 })).toBe("-90");
    const bar = (extra: object) => /data-part="bar" class="([^"]*)"/.exec(html([{ type: "bar", bind: LOAD, ...extra } as Block]))?.[1] ?? "";
    expect(bar({})).toMatch(/\bh-2$/);
    expect(bar({ height: "s" })).toMatch(/\bh-1$/);
    expect(bar({ height: "l" })).toMatch(/\bh-3\.5$/);
  });
});

describe("RecipeView, Phase F (G38)", () => {
  const live = { data: toFlat(fixtureSensors()), names: toNames(fixtureSensors()), sample: false };
  /** The items each Repeat of a markup draws, in order. */
  const itemCount = (html: string) => (html.match(/data-recipe-item=""/g) ?? []).length;
  const devices = (edit: (r: Recipe) => void = () => {}) => {
    const r = fixtureRecipe("devices");
    edit(r);
    return r;
  };
  const gridOf = (r: Recipe) => r.root.children[1] as Extract<Block, { type: "grid" }>;

  it("the devices fixture's Sample: its drives, its 8 cores in the grid and its fans, from the sample readings", () => {
    const html = draw(devices());
    expect(itemCount(html)).toBe(2 + 8 + 3);
    for (const text of ["Kingston", "WDC", "Case Fan", "860", "64"]) expect(html, text).toContain(text);
    expect(typesIn(html)).toEqual(expect.arrayContaining(["grid", "repeat", "ring", "bar", "label", "value"]));
  });

  it("live: a Repeat over cores in a grid draws a cell per core the readings have, up to most shown; each cell is its own tile", () => {
    const html = draw(devices((r) => delete (gridOf(r).children[0] as Extract<Block, { type: "repeat" }>).max), undefined, live);
    expect(itemCount(html)).toBe(2 + 32 + 5);
    // the Repeat's own box is no box in a grid: its items are the grid's cells
    expect(html).toMatch(/data-recipe-block="repeat" data-recipe-path="1\.0" class="contents"/);
    expect(itemCount(draw(devices((r) => Object.assign(gridOf(r).children[0], { max: 4 })), undefined, live))).toBe(2 + 4 + 5);
  });

  it("columns: fixed, or the count that makes the cells closest to square in the grid's box", () => {
    expect(draw(devices((r) => Object.assign(gridOf(r), { columns: 4 })))).toContain("grid-template-columns:repeat(4, minmax(0, 1fr))");
    expect(autoColumns(32, 800, 400)).toBe(8);
    expect(autoColumns(32, 400, 800)).toBe(4);
    expect(autoColumns(3, 100, 1000)).toBe(1);
    expect(autoColumns(3, 1000, 10)).toBe(3);
    expect(autoColumns(0, 100, 100)).toBe(1);
  });

  it("spacing: the grid's gap is 6 px unset, tight 2, roomy 12", () => {
    const gap = (spacing?: string) => draw(devices((r) => Object.assign(gridOf(r), { spacing })));
    expect(gap(undefined)).toContain("grid-auto-rows:minmax(0, 1fr);gap:6px");
    expect(gap("tight")).toContain("grid-auto-rows:minmax(0, 1fr);gap:2px");
    expect(gap("roomy")).toContain("grid-auto-rows:minmax(0, 1fr);gap:12px");
  });

  it("a Repeat over devices with no readings draws no items and no weather credit", () => {
    const html = renderToStaticMarkup(<RecipeView data={{}} recipe={devices()} />);
    expect(itemCount(html)).toBe(0);
    expect(html).not.toContain("data-recipe-attribution");
  });

  it("B25: a heatmap in a Repeat bound to a field of one number draws one cell instead of throwing", () => {
    const r = fixtureRecipe("weather-places");
    const repeat = r.root.children.find((b) => b.type === "repeat") as Extract<Block, { type: "repeat" }>;
    repeat.children = [{ type: "heatmap", bind: { field: "temp" } }];
    const html = draw(r);
    expect(html).toContain('data-recipe-block="heatmap"');
    expect((html.match(/min-h-1\.5/g) ?? []).length).toBe(itemCount(html));
  });
});
