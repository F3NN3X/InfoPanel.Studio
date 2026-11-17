// User widgets on the server (`/api/widgets`, src-tauri/crates/ips-server/src/widgets.rs): DATA_DIR/widgets/<key>/, one folder
// per package, `<key>` the id with its namespace's colon as a dot (`recipe:cpu-card` is `recipe.cpu-card`, safe in a route and a
// folder name). Read here, checked by the validator every time (the bytes on disk are never trusted), and cached per id. The
// kiosk reaches this only through the recipe chunk; the studio through the Add panel's list and the import. A loaded recipe gives
// its module what its placements read (`reads.ts`), its options as Content tab rows and its sizes as Edit's floor (`settings.ts`).
import { recipeReads } from "./reads";
import { isCodeId, isRecipeId, learnReads, recipeModule } from "./resolve";
import { learnName, learnSettings, learnSize } from "./settings";
import type { Manifest, PackageFile, Recipe } from "./types";
import { checkPackage, jsonOf, type RecipeIssue } from "./validate";

const ROUTE = "/api/widgets";
/** The header a write needs (the packs' `X-Dashboard-Pack`). */
const WRITE = { "Content-Type": "application/json", "X-Dashboard-Widget": "1" };

/** A package's folder and route name: its id with the namespace's colon as a dot. */
export const keyOf = (id: string): string => id.replace(":", ".");

/** Where a package came from, as the server recorded it: saved from the studio's builder, or imported from a file. */
export type WidgetOrigin = "studio" | "import";

/** What `GET /api/widgets` says of a package. `trust` is the server's check of its signature, now: `unsigned` (a recipe without
 * one), `owner`, `themely`, `user:<name>`, or `refused:<reason>` (its files are not served). `off`: a code widget turned off on the
 * Widgets page (its files are not served either). */
export interface UserWidgetInfo {
  id: string;
  kind: string;
  name: string;
  version: string;
  size: number;
  origin: WidgetOrigin;
  trust: string;
  off?: boolean;
}

/** A loaded recipe: drawn when `recipe` is set; `off` when the server has user widgets switched off. */
export interface LoadedRecipe {
  recipe?: Recipe;
  issues: RecipeIssue[];
  off?: boolean;
}

/** The packages the server lists, recipes and code widgets, and whether it has them switched off (`USER_WIDGETS=off`: the list is
 * empty then). */
export async function listUserWidgets(): Promise<{ list: UserWidgetInfo[]; off: boolean }> {
  try {
    const res = await fetch(ROUTE, { cache: "no-store" });
    const off = res.headers.get("X-User-Widgets") === "off";
    const raw: unknown = res.ok ? await res.json() : [];
    const list = Array.isArray(raw)
      ? raw.flatMap((w): UserWidgetInfo[] => (w && (isRecipeId(w.id) || isCodeId(w.id)) ? [{ id: w.id, kind: isCodeId(w.id) ? "code" : "recipe", name: typeof w.name === "string" ? w.name : w.id, version: String(w.version ?? ""), size: Number(w.size) || 0, origin: w.origin === "studio" ? "studio" : "import", trust: typeof w.trust === "string" ? w.trust : "unsigned", ...(w.off === true ? { off: true } : {}) }] : []))
      : [];
    return { list, off };
  } catch {
    return { list: [], off: false };
  }
}

const fileOf = async (id: string, path: string): Promise<{ bytes?: Uint8Array; status: number; off?: boolean }> => {
  try {
    const res = await fetch(`${ROUTE}/${keyOf(id)}/${path}`, { cache: "no-cache" });
    return { status: res.status, bytes: res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined, off: res.headers.get("X-User-Widgets") === "off" };
  } catch {
    return { status: 0 };
  }
};

/** A package's files as the route serves them: the manifest, then each file it lists (the route has no folder listing). */
export async function readPackage(id: string): Promise<{ files: PackageFile[]; off: boolean }> {
  const manifest = await fileOf(id, "manifest.json");
  if (!manifest.bytes) return { files: [], off: !!manifest.off };
  const listed = ((jsonOf([{ path: "m", bytes: manifest.bytes }], "m") as Partial<Manifest> | undefined)?.files ?? []).flatMap((f) => (typeof f?.path === "string" ? [f.path] : []));
  const rest = await Promise.all(listed.slice(0, 32).map(async (path) => ({ path, bytes: (await fileOf(id, path)).bytes })));
  return { files: [{ path: "manifest.json", bytes: manifest.bytes }, ...rest.flatMap((f) => (f.bytes ? [{ path: f.path, bytes: f.bytes }] : []))], off: false };
}

const cache = new Map<string, Promise<LoadedRecipe>>();

/** A recipe read from the server and validated (once per id until `forgetRecipe`). Never throws. */
export function loadRecipe(id: string): Promise<LoadedRecipe> {
  let hit = cache.get(id);
  if (!hit) {
    hit = (async (): Promise<LoadedRecipe> => {
      if (!isRecipeId(id)) return { issues: [{ rule: "id", severity: "error", file: "", message: `${id} is not a recipe id` }] };
      const { files, off } = await readPackage(id);
      if (off) return { issues: [], off: true };
      if (!files.length) return { issues: [{ rule: "missing", severity: "error", file: "", message: `${id} is not on this server` }] };
      const checked = await checkPackage({ files });
      return checked.recipe?.id === id ? { recipe: checked.recipe, issues: checked.issues } : { issues: checked.issues.length ? checked.issues : [{ rule: "id", severity: "error", file: "recipe.json", message: `the package in ${keyOf(id)} is not ${id}` }] };
    })()
      .catch((e: Error): LoadedRecipe => ({ issues: [{ rule: "internal", severity: "error", file: "", message: e.message }] }))
      .then((loaded) => {
        if (!loaded.off) learnReads(id, loaded.recipe ? recipeReads(loaded.recipe) : () => []);
        const mod = recipeModule(id);
        if (mod) {
          learnSettings(mod, loaded.recipe);
          learnSize(mod, loaded.recipe);
          learnName(mod, loaded.recipe);
        }
        return loaded;
      });
    cache.set(id, hit);
  }
  return hit;
}

/** Drops a cached recipe and what its placements read (it was imported again or removed). */
export const forgetRecipe = (id: string): void => {
  cache.delete(id);
  learnReads(id);
  const mod = recipeModule(id);
  if (mod) {
    learnSettings(mod);
    learnSize(mod);
    learnName(mod);
  }
};

const base64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
};

/** Stores a package the validator passed, then reads it back through the route and validates it again. Undefined when it is stored and loads; else why not.
 * `origin` is what the server records beside it (the builder's save is "studio"). */
export async function storePackage(files: readonly PackageFile[], origin: WidgetOrigin = "import"): Promise<string | undefined> {
  const checked = await checkPackage({ files });
  if (!checked.recipe) return checked.issues.find((i) => i.severity === "error")?.message ?? "the package has errors";
  const id = checked.recipe.id;
  const res = await fetch(ROUTE, { method: "POST", headers: WRITE, body: JSON.stringify({ files: files.map((f) => ({ path: f.path, data: base64(f.bytes) })), origin }) });
  if (!res.ok) return (await res.text()) || `the server refused the package (${res.status})`;
  forgetRecipe(id);
  const back = await loadRecipe(id);
  if (back.recipe) return undefined;
  await removeWidget(id);
  return "the package was stored but did not pass the check when it was read back, so it was taken off again";
}

/** Takes a package off the server (a 404 is one already gone). */
export async function removeWidget(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${ROUTE}/${encodeURIComponent(keyOf(id))}`, { method: "DELETE", headers: WRITE });
    forgetRecipe(id);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
