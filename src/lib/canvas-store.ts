import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DashboardConfig, Placement } from "@/lib/layout";

/**
 * Canvas zones and the server's canvas store (server/canvases.mjs, #44). In
 * memory every canvas zone holds its `canvas`; the server's config holds only
 * `canvasRef`, so the config stays under its 5 MB cap. The swap happens at the
 * edge: `inlineCanvases` after a config is fetched, `liftCanvases` before one is
 * pushed. A config saved before the store existed still has its canvases
 * inline: the first push writes each one to the store, then the config with
 * refs, so a push that fails between the two leaves the inline copy in place.
 */
export const CANVASES_URL = "/api/canvases";

/** Loaded canvases by ref; a ref names fixed bytes, so an entry never goes stale. */
const loaded = new Map<string, Promise<StoredCanvas | null>>();
/** The ref each canvas object came from or was saved as, and when, so an unchanged canvas is not sent again. */
const refs = new WeakMap<StoredCanvas, { ref: string; at: number }>();

/**
 * How long a known ref is trusted without sending the canvas again. The server sweeps files no
 * config references after an hour (server/canvases.mjs); a canvas back from undo after that, or
 * one loaded from the store, is sent again, which renews its file.
 */
export const REUSE_MS = 10 * 60 * 1000;

/** The ref a canvas object came from or was saved as, if any. */
export const refOf = (canvas: StoredCanvas): string | undefined => refs.get(canvas)?.ref;

/** The server answered a canvas save with an error status other than the write refusal (too large, not a canvas). */
export class CanvasRejectedError extends Error {
  readonly status: number;

  constructor(status: number, reason: string) {
    super(`canvas save failed: ${status}${reason ? ` (${reason})` : ""}`);
    this.status = status;
  }
}

/**
 * The canvas a ref names, or null when it can't be had: no such file, a file that
 * does not parse, or the server not answering. One bad canvas never fails its config;
 * the zone keeps its ref (`unresolvedCanvases`), and a failed load is tried again next time.
 */
export function loadCanvas(ref: string): Promise<StoredCanvas | null> {
  let pending = loaded.get(ref);
  if (!pending) {
    pending = fetch(`${CANVASES_URL}/${encodeURIComponent(ref)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const canvas = (await res.json()) as StoredCanvas;
        // Known, but not as sent from here: its file may be old, so the first push sends it once.
        refs.set(canvas, { ref, at: 0 });
        return canvas;
      })
      .catch((err: unknown) => {
        console.warn(`Canvas ${ref} could not be loaded`, err);
        loaded.delete(ref);
        return null;
      });
    loaded.set(ref, pending);
  }
  return pending;
}

/** The server refused a canvas write from this machine (403): asked once per session, not on every push. */
let writesRefused = false;

/**
 * Save a canvas in the store: its ref, or null when the server refuses canvas
 * writes from here (another machine without ALLOW_REMOTE_UPLOAD=1) and the canvas
 * has no ref yet; the zone then keeps it inline, as before the store. A canvas
 * with a ref keeps it. Throws CanvasRejectedError on another refusal.
 */
export async function saveCanvas(canvas: StoredCanvas, now = Date.now()): Promise<string | null> {
  const known = refs.get(canvas);
  if (known && (writesRefused || now - known.at < REUSE_MS)) return known.ref;
  if (writesRefused) return null;
  const res = await fetch(CANVASES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dashboard-Canvas": "1" },
    body: JSON.stringify(canvas),
  });
  if (res.status === 403) {
    writesRefused = true;
    return known?.ref ?? null;
  }
  if (!res.ok) throw new CanvasRejectedError(res.status, (await res.text().catch(() => "")).slice(0, 200));
  const { id } = (await res.json()) as { id: string };
  refs.set(canvas, { ref: id, at: now });
  return id;
}

/** For the tests: forget a write refusal. */
export function resetWriteRefusal(): void {
  writesRefused = false;
}

/** Any config-shaped value: profiles with pages (v3+) or with their own placements (legacy). */
type WithProfiles = { profiles?: unknown };
type Zones = { placements?: Placement[] };

/** `config` with each placement passed through `change`; the same object where nothing changed. */
function mapPlacements<T extends WithProfiles>(config: T, change: (p: Placement) => Placement): T {
  if (!Array.isArray(config.profiles)) return config;
  const mapList = <Z extends Zones>(z: Z): Z => {
    if (!Array.isArray(z.placements)) return z;
    const placements = z.placements.map(change);
    return placements.every((p, i) => p === z.placements![i]) ? z : { ...z, placements };
  };
  const profiles = (config.profiles as (Zones & { pages?: Zones[] })[]).map((profile) => {
    const own = mapList(profile);
    if (!Array.isArray(own.pages)) return own;
    const pages = own.pages.map(mapList);
    return pages.every((pg, i) => pg === own.pages![i]) ? own : { ...own, pages };
  });
  return profiles.every((p, i) => p === (config.profiles as unknown[])[i]) ? config : { ...config, profiles };
}

/** As `mapPlacements`, with `change` async: every placement's change runs at once. */
async function mapPlacementsAsync<T extends WithProfiles>(config: T, change: (p: Placement) => Promise<Placement>): Promise<T> {
  const all: Placement[] = [];
  mapPlacements(config, (p) => (all.push(p), p));
  const changed = new Map(await Promise.all(all.map(async (p) => [p, await change(p)] as const)));
  return mapPlacements(config, (p) => changed.get(p) ?? p);
}

/**
 * `config` with every `canvasRef` replaced by its canvas: what the studio edits, the kiosk
 * draws and an exported file carries. A ref the store has no file for stays as it is.
 */
export async function inlineCanvases<T extends WithProfiles>(config: T): Promise<T> {
  const used = new Set<string>();
  const inlined = await mapPlacementsAsync(config, async (p) => {
    if (p.canvas || typeof p.canvasRef !== "string") return p;
    used.add(p.canvasRef);
    const canvas = await loadCanvas(p.canvasRef);
    if (!canvas) return p;
    const { canvasRef: _ref, ...rest } = p;
    return { ...rest, canvas };
  });
  // A kiosk pulls each edit's new ref: keep only the canvases this config draws.
  for (const ref of loaded.keys()) if (!used.has(ref)) loaded.delete(ref);
  return inlined;
}

/** `config` with every inline canvas saved in the store and replaced by its `canvasRef`: what the server keeps. */
export function liftCanvases<T extends WithProfiles>(config: T): Promise<T> {
  return mapPlacementsAsync(config, async (p) => {
    if (!p.canvas) return p;
    const ref = await saveCanvas(p.canvas);
    if (!ref) return p;
    const { canvas: _canvas, ...rest } = p;
    return { ...rest, canvasRef: ref };
  });
}

/** The canvas zones whose canvas is not loaded (only a `canvasRef`), as "Profile › Page › zone id". */
export function unresolvedCanvases(config: DashboardConfig): string[] {
  return config.profiles.flatMap((profile) =>
    profile.pages.flatMap((page) =>
      page.placements.filter((p) => !p.canvas && typeof p.canvasRef === "string").map((p) => `${profile.name} › ${page.name} › ${p.id}`)
    )
  );
}

/**
 * `config` as the browser's own copy keeps it (lib/layout `saveConfig`): a canvas the store
 * holds as its ref, so a few canvases don't fill the storage quota; one the store does not
 * have yet (unsaved, or refused from this machine) stays inline.
 */
export function storageCopy<T extends WithProfiles>(config: T): T {
  return mapPlacements(config, (p) => {
    const ref = p.canvas && refOf(p.canvas);
    if (!ref) return p;
    const { canvas: _canvas, ...rest } = p;
    return { ...rest, canvasRef: ref };
  });
}
