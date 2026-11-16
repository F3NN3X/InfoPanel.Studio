import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModuleSettings } from "@/modules/types";
import RecipeView, { itemsOf, optionValues } from "@/widgets/recipe/RecipeView";
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
    expect(draw(recipe, preset("cores")).match(/min-h-\[6px\] rounded-\[2px\]/g)).toHaveLength(8);
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
