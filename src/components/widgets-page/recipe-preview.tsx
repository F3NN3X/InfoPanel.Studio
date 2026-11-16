// A recipe drawn as a placement of it would be, before it is stored: the browse cards, the detail pane and the builder's stage.
// It goes through one template module (the shell, the zone's look, the theme, a pack's T3 values) whose component reads the
// recipe from context, so a draft that changes on every edit needs no module of its own. A zone is drawn at its size on the
// validator's nominal grid (`metrics.ts`), so what the stage shows at 2×2 is what the floor was checked at, then scaled to its box.
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { tokenScope } from "@/components/widget-style";
import { useSensors } from "@/hooks/useSensors";
import { resolveWith, type Appearance } from "@/lib/style-resolve";
import { levelLook, withoutOwnCard } from "@/lib/theme-model";
import { SAMPLE_LOOK_IDS } from "@/looks/ids";
import { lookLayers } from "@/looks/sample-cards";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { NOMINAL_CELL } from "@/widgets/recipe/metrics";
import { recipeReads } from "@/widgets/recipe/reads";
import RecipeView, { type RecipeViewProps } from "@/widgets/recipe/RecipeView";
import type { Cells, PackageFile, Recipe } from "@/widgets/recipe/types";
import { templateModule } from "@/widgets/module";

const Draft = createContext<{ recipe: Recipe; sample: boolean; images?: Readonly<Record<string, string>> } | null>(null);

function DraftRecipe(p: Omit<RecipeViewProps, "recipe">) {
  const draft = useContext(Draft)!;
  return <RecipeView {...p} recipe={draft.recipe} sample={draft.sample} images={draft.images} />;
}

const MIME: Readonly<Record<string, string>> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/** A draft's pictures as object URLs by package path (B5: the server has none of them before a save), revoked when they change. */
function useImageUrls(images: readonly PackageFile[] | undefined): Readonly<Record<string, string>> | undefined {
  const urls = useMemo(() => (images?.length ? Object.fromEntries(images.map((f) => [f.path, URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: MIME[f.path.split(".").pop()!] }))])) : undefined), [images]);
  useEffect(() => () => Object.values(urls ?? {}).forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

const meta = { id: "recipe:draft", name: "Recipe", category: "Recipes", icon: "dashboard", prefixes: [], defaultSize: [3, 2] as Cells, minSize: [1, 1] as Cells, description: "" };
const draftModule = templateModule({ meta, Component: DraftRecipe, settings: [], toProps: (_look, saved) => ({ saved }) });
// a draft draws with or without data (its Sample has its own readings)
draftModule.readsFor = () => [];

/** The gap between grid cells on the nominal grid. */
const GAP = 8;
/** A zone of `cells` on the nominal grid, px. */
export const zonePx = (cells: Cells): { w: number; h: number } => ({ w: cells[0] * NOMINAL_CELL.w + (cells[0] - 1) * GAP, h: cells[1] * NOMINAL_CELL.h + (cells[1] - 1) * GAP });

/** Option values as a placement stores them (a place list as JSON text). */
export function storedValues(recipe: Recipe, values: Record<string, unknown>): ModuleSettings {
  return Object.fromEntries(recipe.options.flatMap((o) => (values[o.key] === undefined ? [] : [[o.key, o.type === "place-list" ? JSON.stringify(values[o.key]) : values[o.key]]]))) as ModuleSettings;
}

/**
 * The levels of the screen as if it wore `lookId` (B24): the Look is set where the screen's own Look is (its page's when the page has its
 * own Look section, else the screen's), and a card that level holds only because its old Look set it goes with that Look, so the new Look's
 * material, tone, colours and pack layer draw as on a screen that picked it. What else the level holds of its own stays, as a pick keeps it.
 */
export function wearing(levels: Appearance | undefined, lookId: string): Appearance {
  const at = levelLook(levels ?? {}).onPage ? "page" : "profile";
  const theme = levels?.[at];
  return { ...levels, [at]: { ...theme, values: { ...withoutOwnCard(theme?.values ?? {}), lookId } } };
}

/** Loads a sample Look's card and layer when the stage previews one the config does not use (`readConfig` registers only those it does), then draws again. */
function useSampleLayer(lookId: string | undefined): void {
  const missing = !!lookId && SAMPLE_LOOK_IDS.includes(lookId) && !lookLayers[lookId];
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (missing) void import("@/looks/sample-materials").then((m) => (m.registerSampleCards(), setLoaded((n) => n + 1)));
  }, [missing]);
}

export interface RecipePreviewProps {
  recipe: Recipe;
  /** The placement's option values (unset: the defaults). */
  values?: Record<string, unknown>;
  cells: Cells;
  /** The recipe's sample readings instead of the live ones. */
  sample: boolean;
  appearance?: Appearance;
  /** The page's theme variables and font. */
  pageStyle?: CSSProperties;
  /** A Look to draw it in ("Preview in"), as a screen wearing it draws it (`wearing`); unset: the screen's. */
  lookId?: string;
  /** The box it is scaled into, px; the scale never goes over `maxScale`. */
  fit: { w: number; h: number };
  maxScale?: number;
  /** Drawn over the zone, in its own px (the stage's selection). */
  overlay?: ReactNode;
  /** A draft's pictures (its package's `images/`), drawn before the server has them. */
  images?: readonly PackageFile[];
}

/**
 * Live readings, or none for a sample (its own readings come from the recipe). "Every sensor" is the Data API's; the weather of the
 * recipe's places is the dashboard server's own stream, kept open here by its prefixes (`weather.place.<id>.`).
 */
function useReadings(sample: boolean, recipe: Recipe, own: ModuleSettings) {
  const weather = sample ? [] : recipeReads(recipe)(own).filter((k) => k.startsWith("weather."));
  useSensors(weather);
  return useSensors(sample ? [] : null);
}

export function RecipePreview({ recipe, values, cells, sample, appearance, pageStyle, lookId, fit, maxScale = 1, overlay, images }: RecipePreviewProps) {
  const urls = useImageUrls(images);
  useSampleLayer(lookId);
  const own: ModuleSettings = { ...storedValues(recipe, values ?? {}), ...(lookId ? { lookId } : {}) };
  const sensors = useReadings(sample, recipe, own);
  const settings = resolveWith(lookId ? wearing(appearance, lookId) : appearance, own, undefined, undefined, draftModule.settings) ?? own;
  const scope = tokenScope(chromeOf(settings)) as CSSProperties;
  const { w, h } = zonePx(cells);
  const scale = Math.min(maxScale, fit.w / w, fit.h / h);
  return (
    <div className="relative shrink-0" style={{ width: w * scale, height: h * scale }}>
      <div data-recipe-zone="" className="absolute left-0 top-0 origin-top-left text-foreground" style={{ ...pageStyle, ...scope, width: w, height: h, transform: `scale(${scale})` }}>
        <Draft.Provider value={{ recipe, sample, images: urls }}>{draftModule.render(sensors, settings)}</Draft.Provider>
        {overlay}
      </div>
    </div>
  );
}
