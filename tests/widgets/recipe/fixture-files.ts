// The recipe fixture packages (tests/fixtures/recipes/<name>/) as package files, and a way to make a variant of one with a
// fresh manifest: what the recipe tests start from.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { packageOf } from "@/widgets/recipe/package";
import type { PackageFile, Recipe } from "@/widgets/recipe/types";

export const FIXTURES = "tests/fixtures/recipes";
export const FIXTURE_NAMES = ["cpu-card", "gpu-card", "weather-places", "devices"] as const;

/** A fixture package's files as they are on disk. */
export function fixtureFiles(name: string): PackageFile[] {
  const root = join(FIXTURES, name);
  const images = existsSync(join(root, "images")) ? readdirSync(join(root, "images")).map((f) => `images/${f}`) : [];
  return ["manifest.json", "recipe.json", ...images].map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(root, path))) }));
}

/** A fixture's recipe, parsed (a fresh copy each call). */
export const fixtureRecipe = (name: string): Recipe => JSON.parse(readFileSync(join(FIXTURES, name, "recipe.json"), "utf8"));

/** A fixture's images. */
export const fixtureImages = (name: string): PackageFile[] => fixtureFiles(name).filter((f) => f.path.startsWith("images/"));

/** A package of the fixture's recipe changed by `edit`, its manifest written for it (so only the edit can be wrong). */
export async function variant(name: string, edit: (r: Recipe) => void, images = fixtureImages(name)): Promise<PackageFile[]> {
  const recipe = fixtureRecipe(name);
  edit(recipe);
  return packageOf(recipe, images);
}

const enc = new TextEncoder();
/** `files` with one file's bytes replaced (a manifest edited by hand, a file changed after the export). */
export const withFile = (files: readonly PackageFile[], path: string, bytes: Uint8Array | string): PackageFile[] => [
  ...files.filter((f) => f.path !== path),
  { path, bytes: typeof bytes === "string" ? enc.encode(bytes) : bytes },
];

/** The manifest of `files`, parsed. */
export const manifestOfFiles = (files: readonly PackageFile[]): Record<string, unknown> => JSON.parse(new TextDecoder().decode(files.find((f) => f.path === "manifest.json")!.bytes));
