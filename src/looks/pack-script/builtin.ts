// A built-in pack's effect script ships in the app bundle: the `.js` its pack.json names, in its folder's `assets/`, as text in a chunk
// of its own that loads only when a page wears that pack (this module is in the overlay's lazy chunk). The server has no trust for a
// built-in (its store holds user packs), so it is never asked for one: the script runs in the same sandbox, by the same plan, with the
// same caps as any pack's, and only while the server's switch is on (`scriptsOn`, trust.ts).
import { SCRIPT_MAX_BYTES } from "./limits";

const SOURCES = import.meta.glob<string>("../packs/*/assets/*.js", { query: "?raw", import: "default" });

/** The built-in pack `id`'s script `file` as text, or undefined (no such script, or one over `SCRIPT_MAX_BYTES`). */
export async function builtinScript(id: string, file: string): Promise<string | undefined> {
  const load = SOURCES[`../packs/${id}/assets/${file}`];
  if (!load) return undefined;
  try {
    const text = await load();
    return new TextEncoder().encode(text).length <= SCRIPT_MAX_BYTES ? text : undefined;
  } catch {
    return undefined;
  }
}
