import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { knownWidget, placementContent, placementPrefixes } from "@/components/studio/placement-content";
import { touches } from "@/lib/sensor-stream";
import type { Placement } from "@/lib/layout";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import RecipeWidget from "@/widgets/recipe/RecipeWidget";
import { recipeReads } from "@/widgets/recipe/reads";
import { isRecipeId, loadReads, recipeModule, subscribeReads } from "@/widgets/recipe/resolve";
import { forgetRecipe, listUserWidgets, loadRecipe, removeWidget, storePackage } from "@/widgets/recipe/store";
import type { PackageFile } from "@/widgets/recipe/types";
import { fixtureFiles, fixtureRecipe, variant, withFile } from "./fixture-files";

// How a placement's `recipe:<id>` becomes something drawn: the resolve hook in the kiosk entry, the store's load (validated every
// time, off when the server says so), a missing or refused recipe drawn as the standard empty card, never an error, and the
// data gate the loaded recipe gives its placements.

afterEach(() => {
  vi.unstubAllGlobals();
  for (const id of ["recipe:cpu-card", "recipe:gpu-card", "recipe:weather-places", "recipe:gone"]) forgetRecipe(id);
});

/** A fetch that serves `files` under `/api/widgets/<key>/` and takes every write, `off` saying the store is switched off. */
function serve(key: string, files: readonly PackageFile[], off = false) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const headers: Record<string, string> = off ? { "X-User-Widgets": "off" } : {};
    if (off) return new Response(null, { status: url === "/api/widgets" ? 200 : 404, headers });
    if (init?.method === "POST") return new Response("{}", { status: 200 });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    const path = url.startsWith(`/api/widgets/${key}/`) ? url.slice(`/api/widgets/${key}/`.length) : undefined;
    const file = files.find((f) => f.path === path);
    return file ? new Response(file.bytes, { status: 200 }) : new Response(null, { status: 404 });
  });
  return calls;
}

describe("the recipe resolve hook", () => {
  it("takes recipe ids only", () => {
    for (const ok of ["recipe:a", "recipe:cpu-card", `recipe:${"a".repeat(48)}`]) expect(isRecipeId(ok), ok).toBe(true);
    for (const bad of ["GpuMonitor", "recipe:", "recipe:A", "recipe:-a", "recipe:a.b", "recipe.a", "ext:me.a", `recipe:${"a".repeat(49)}`, undefined]) expect(isRecipeId(bad), String(bad)).toBe(false);
    expect(recipeModule("GpuMonitor")).toBeUndefined();
  });

  it("makes one module per id, with the standard look rows, drawn only with data as the built-ins are", () => {
    const mod = recipeModule("recipe:cpu-card")!;
    expect(recipeModule("recipe:cpu-card")).toBe(mod);
    expect(mod.id).toBe("recipe:cpu-card");
    expect(mod.settings?.some((s) => STANDARD_KEYS.has(s.key))).toBe(true);
    expect(typeof mod.preload).toBe("function");
    expect(mod.render({}, {})).toBeNull();
    expect(mod.render({ "libre.x": { value: 1, unit: "%" } }, {})).not.toBeNull();
  });

  it("is what a placement of a recipe draws, in the kiosk and on a Free page", () => {
    const p: Placement = { id: "z", module: "recipe:cpu-card", colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true };
    const drawn = placementContent(p, { "libre.x": { value: 1, unit: "%" } }, []);
    expect(drawn.content).not.toBeNull();
    expect(drawn.hasData).toBe(true);
    expect(knownWidget("recipe:cpu-card")).toBe(true);
    expect(knownWidget("recipe:Bad")).toBe(false);
  });
});

describe("loading a recipe", () => {
  it("reads the manifest, then each file it lists, and validates them", async () => {
    const calls = serve("recipe.gpu-card", fixtureFiles("gpu-card"));
    const loaded = await loadRecipe("recipe:gpu-card");
    expect(loaded.issues).toEqual([]);
    expect(loaded.recipe?.name).toBe("GPU card");
    expect(calls.sort()).toEqual(["GET /api/widgets/recipe.gpu-card/images/logo.png", "GET /api/widgets/recipe.gpu-card/manifest.json", "GET /api/widgets/recipe.gpu-card/recipe.json"]);
  });

  it("refuses a package whose files are not its manifest's, on every load", async () => {
    const files = fixtureFiles("cpu-card");
    const recipe = files.find((f) => f.path === "recipe.json")!.bytes.slice();
    recipe[recipe.length - 2] = 0x20;
    serve("recipe.cpu-card", withFile(files, "recipe.json", recipe));
    const loaded = await loadRecipe("recipe:cpu-card");
    expect(loaded.recipe).toBeUndefined();
    expect(loaded.issues.map((i) => i.rule)).toContain("hash");
  });

  it("says a recipe that is not on the server is missing, and one the server has switched off is off", async () => {
    serve("recipe.gone", []);
    expect((await loadRecipe("recipe:gone")).issues.map((i) => i.rule)).toEqual(["missing"]);
    forgetRecipe("recipe:gone");
    serve("recipe.gone", [], true);
    expect(await loadRecipe("recipe:gone")).toEqual({ issues: [], off: true });
  });

  it("draws nothing yet while the recipe loads, and never throws", () => {
    expect(() => renderToStaticMarkup(<RecipeWidget data={{}} recipe="recipe:gone" />)).not.toThrow();
  });
});

describe("storing a recipe", () => {
  it("validates first and sends nothing the validator refuses", async () => {
    const calls = serve("recipe.cpu-card", []);
    const broken = withFile(fixtureFiles("cpu-card"), "manifest.json", "{}");
    expect(await storePackage(broken)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("posts the files, then reads them back through the route before saying yes", async () => {
    const files = fixtureFiles("cpu-card");
    const calls = serve("recipe.cpu-card", files);
    expect(await storePackage(files)).toBeUndefined();
    expect(calls[0]).toBe("POST /api/widgets");
    expect(calls.slice(1).sort()).toEqual(["GET /api/widgets/recipe.cpu-card/manifest.json", "GET /api/widgets/recipe.cpu-card/recipe.json"]);
    expect(await removeWidget("recipe:cpu-card")).toBe(true);
  });

  it("sends where the package came from (an import unless said), and reads the server's word back in the list", async () => {
    const files = fixtureFiles("cpu-card");
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return bodies.push(JSON.parse(String(init.body))), new Response("{}", { status: 200 });
      if (url === "/api/widgets") return Response.json([{ id: "recipe:cpu-card", kind: "recipe", name: "CPU card", version: "1.0.0", size: 1, origin: "studio" }, { id: "recipe:old", kind: "recipe", name: "Old", version: "1.0.0", size: 1 }]);
      const file = files.find((f) => url === `/api/widgets/recipe.cpu-card/${f.path}`);
      return file ? new Response(file.bytes, { status: 200 }) : new Response(null, { status: 404 });
    });
    await storePackage(files, "studio");
    forgetRecipe("recipe:cpu-card");
    await storePackage(files);
    expect(bodies.map((b) => (b as { origin: unknown }).origin)).toEqual(["studio", "import"]);
    expect((await listUserWidgets()).list.map((w) => w.origin)).toEqual(["studio", "import"]);
  });
});

describe("the data gate of a recipe placement", () => {
  const CPU = "libre.amd_ryzen_9_9950x3d_cpu_total";
  const GPU = "libre.nvidia_geforce_rtx_5090_gpu_core_load";
  const at = (module: string, settings?: Placement["settings"]): Placement => ({ id: "z", module, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true, settings });

  it("reads its bound sensors and its sensor options' values, the stored one over the default", () => {
    const reads = recipeReads(fixtureRecipe("gpu-card"));
    expect(reads(undefined)).toEqual(["libre.nvidia_geforce_rtx_5090_gpu_core", GPU, "libre.nvidia_geforce_rtx_5090_gpu_core_clock", "libre.nvidia_geforce_rtx_5090_gpu_package", "libre.nvidia_geforce_rtx_5090_gpu_power"].sort());
    expect(reads({ load: "libre.amd_radeon_gpu_load" })).toContain("libre.amd_radeon_gpu_load");
    expect(reads({ load: "libre.amd_radeon_gpu_load" })).not.toContain(GPU);
    // a Repeat over places reads its places' weather (Weather by place, 5c): the default places, or the stored list
    const weather = recipeReads(fixtureRecipe("weather-places"));
    expect(weather(undefined)).toEqual(["weather.place.n3568e13969.", "weather.place.n5905e970.", "weather.place.n5991e1075."]);
    expect(weather({ places: JSON.stringify([{ name: "Bergen", lat: 60.39, lon: 5.32 }]) })).toEqual(["weather.place.n6039e532."]);
    expect(weather({ places: "[]" })).toEqual([]);
    // a Repeat over devices reads its source's prefixes, as a hardware widget does (Phase F): drives and cores `libre.`, fans `hwinfo.` too
    expect(recipeReads(fixtureRecipe("devices"))(undefined)).toEqual(["hwinfo.", "libre."]);
  });

  it("reads every key until the recipe has loaded, then only its own: an unrelated tick does not redraw the zone, a bound one does", async () => {
    const p = at("recipe:cpu-card");
    expect(placementPrefixes(p)).toBeNull();
    serve("recipe.cpu-card", fixtureFiles("cpu-card"));
    await loadRecipe("recipe:cpu-card");
    const prefixes = placementPrefixes(p);
    expect(prefixes).toContain(CPU);
    expect(touches([GPU], prefixes)).toBe(false);
    expect(touches([CPU], prefixes)).toBe(true);
    // and the gate: only its own keys count as data
    const mod = recipeModule("recipe:cpu-card")!;
    expect(mod.render({ [GPU]: { value: 1, unit: "%" } }, {})).toBeNull();
    expect(mod.render({ [CPU]: { value: 1, unit: "%" } }, {})).not.toBeNull();
    // a placement that stores another sensor reads that one instead
    expect(touches([GPU], placementPrefixes(at("recipe:cpu-card", { load: GPU })))).toBe(true);
  });

  it("loads a weather-only recipe without any key, and its placement hears its reads and draws on its places' weather", async () => {
    const p = at("recipe:weather-places");
    const mod = recipeModule("recipe:weather-places")!;
    // no Data API keys at all: the gate holds, but the recipe loads anyway
    expect(mod.render({}, {})).toBeNull();
    serve("recipe.weather-places", fixtureFiles("weather-places"));
    let heard = 0;
    const stop = subscribeReads(() => heard++);
    await loadReads("recipe:weather-places");
    stop();
    expect(heard).toBe(1);
    expect(placementPrefixes(p)).toEqual(["weather.place.n3568e13969.", "weather.place.n5905e970.", "weather.place.n5991e1075."]);
    expect(placementContent(p, {}, []).content).toBeNull();
    expect(placementContent(p, { "weather.place.n5991e1075.temp": { value: 4, unit: "°C" } }, []).content).not.toBeNull();
  });

  it("draws a recipe that reads no sensor, and a missing one's empty card, without data", async () => {
    // Weather · places without its Repeat reads nothing (the Repeat reads its places' weather since 5c)
    serve("recipe.weather-places", await variant("weather-places", (r) => (r.root.children = [{ type: "label", text: "Hello" }])));
    await loadRecipe("recipe:weather-places");
    expect(placementPrefixes(at("recipe:weather-places"))).toEqual([]);
    expect(recipeModule("recipe:weather-places")!.render({}, {})).not.toBeNull();
    serve("recipe.gone", []);
    await loadRecipe("recipe:gone");
    expect(recipeModule("recipe:gone")!.render({}, {})).not.toBeNull();
  });
});
