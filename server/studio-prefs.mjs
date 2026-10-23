// The studio's own preferences that must follow the user between the app window and a browser studio (each has its
// own localStorage): kept in studio-prefs.json beside the config, never in config.json, so kiosks never see them.
// GET and PUT /api/studio-prefs, from this machine only. Only known keys with known values are kept.
//
// Node built-ins only. `normalizePrefs` and `applyPrefs` are pure.

import fs from "node:fs";

/** Each preference and the values it takes. */
export const STUDIO_PREFS = {
  "studio.previewData": ["live", "frozen", "frozenWhenUnfocused"],
};

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** The known keys of `raw` with a known value; anything else is dropped. */
export function normalizePrefs(raw) {
  if (!isObject(raw)) return {};
  return Object.fromEntries(Object.entries(STUDIO_PREFS).filter(([key, values]) => values.includes(raw[key])).map(([key]) => [key, raw[key]]));
}

/** `prefs` with `patch` merged in, or an error naming the first key or value that isn't known. */
export function applyPrefs(prefs, patch) {
  if (!isObject(patch)) return { error: "expected a JSON object" };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(STUDIO_PREFS, key)) return { error: `unknown preference ${key}` };
    if (!STUDIO_PREFS[key].includes(value)) return { error: `${key} takes ${STUDIO_PREFS[key].join(", ")}` };
  }
  return { prefs: { ...normalizePrefs(prefs), ...patch } };
}

/** The preferences in `file` (none when it is missing or unreadable), and a writer that replaces it whole. */
export function createStudioPrefs(file) {
  let prefs = {};
  try {
    prefs = normalizePrefs(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    // Missing or broken: the defaults stand, and the next write replaces it.
  }
  return {
    get: () => prefs,
    apply(patch) {
      const result = applyPrefs(prefs, patch);
      if (result.error) return result;
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(result.prefs));
      fs.renameSync(tmp, file);
      prefs = result.prefs;
      return result;
    },
  };
}
