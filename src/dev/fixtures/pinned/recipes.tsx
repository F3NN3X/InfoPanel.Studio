import { draftSample, newRecipe } from "@/components/widgets-page/builder-model";
import { START } from "@/components/widgets-page/start-points";
import type { Data, ShellProps } from "@/widgets/core/types";
import RecipeView from "@/widgets/recipe/RecipeView";
import type { Recipe } from "@/widgets/recipe/types";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { designWidget, useSpec, type Zone } from "./stage";

/*
 * The user's own widgets in the fixtures (decision 10, owner Q6): recipes drawn by the app's own `RecipeView`, the way the
 * Widgets page's preview draws one before it is stored, on their sample readings filled from the fixture sensors. Nothing is
 * stored: a recipe here is a value. The rail's CPU mini is a recipe with a `rail` preset (decision 8): one ring, no title.
 */

const DATA = fixtureSensors() as unknown as Data;
const NONE = new Set<string>();

/** A recipe of the Widgets page's start points (the built-in it duplicates), its sample filled from the fixture sensors. */
const fromStart = (id: keyof typeof START, name: string): Recipe => draftSample(START[id](name, NONE), DATA);

/** Sensor Value's start point on one reading: a ring with its value, titled. */
function ring(name: string, sensor: string): Recipe {
  const r = START.SensorValue(name, NONE);
  return draftSample({ ...r, options: r.options.map((o) => ({ ...o, default: sensor })), root: { ...r.root, title: name } } as Recipe, DATA);
}

/** The rail's CPU mini: the load as one ring with its value and a caption, in the rail's widget slot (72 px wide). */
const cpuMini = (): Recipe =>
  draftSample(
    {
      ...newRecipe("CPU mini", NONE),
      format: 2,
      icon: "memory",
      size: { min: [1, 1], max: [1, 1], default: [1, 1] },
      presets: [{ id: "rail", name: "Rail", settings: {}, size: [1, 1], default: true }],
      options: [{ key: "cpu", label: "CPU", type: "device", kind: "cpu", default: "auto" }],
      root: { type: "card", spacing: "tight", children: [{ type: "ring", name: "Load", bind: { sensor: "libre.{cpu}_cpu_total" }, min: 0, max: 100, color: "accent", grow: 1 }, { type: "label", name: "Caption", text: "CPU", scale: 0.85 }] },
    } as Recipe,
    DATA
  );

export const RECIPES = {
  cpu: () => fromStart("CpuMonitor", "CPU card"),
  gpu: () => fromStart("GpuMonitor", "GPU card"),
  weather: () => fromStart("Weather", "Weather by place"),
  ram: () => ring("RAM", "system.ram.load"),
  fps: () => ring("FPS", "plugins.fps-plugin.fps.fps"),
  gpuTemp: () => ring("GPU temp", "libre.nvidia_geforce_rtx_5090_gpu_core"),
  cpuTemp: () => ring("CPU temp", "libre.amd_ryzen_9_9950x3d_core__tctl_tdie"),
  cpuMini,
} as const;

function RecipeZone(p: ShellProps) {
  const recipe = useSpec<Recipe>();
  return <RecipeView {...p} recipe={recipe} sample />;
}

export const RECIPE = designWidget("dev.Recipe", "Recipe", RecipeZone);

/** A recipe as a zone of the page or a rail slot. */
export const recipeZone = (id: string, recipe: Recipe, cell: Zone["cell"], settings?: Zone["settings"]): Zone => ({ id, design: { mod: RECIPE, spec: recipe }, cell, settings });
