// PATCH /api/config/settings: the Settings window's instant writes (PLAN decision 22).
//
// A patch names only the dashboard-wide settings it changes, and the saved config keeps everything
// else, so a change made in Settings reaches the kiosks at once without a full config round trip:
//
//   { general?: { <key>: value | null },          the Settings › Dashboard keys of `general`
//     style?: { clock: "12" | "24" | null },      the All screens style's 12 / 24 h clock
//     profiles?: { <id>: { performance: { maxFps?, motion? } | null } } }   a screen's own performance
//
// null puts a key back to its default (a screen's performance back to All screens'). Every value is
// checked the way the studio's normalizers read it (src/lib/general.ts, src/lib/performance.ts); a
// patch with anything else is refused whole.
//
// Node built-ins only. Pure; exported for the tests.

const FPS = [5, 15, 30, 60, 0];
const MOTIONS = ["system", "reduce", "full"];

const isBool = (v) => typeof v === "boolean";
const isFps = (v) => FPS.includes(v);
const isMotion = (v) => MOTIONS.includes(v);
/** A BCP 47 locale the runtime formats dates in ("" is the system's). */
function isLocale(v) {
  if (typeof v !== "string") return false;
  if (v === "") return true;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([v]).length > 0;
  } catch {
    return false;
  }
}

/** The `general` keys Settings › Dashboard edits, with their checks. The page font is Theme's. */
const GENERAL = {
  showSeconds: isBool,
  locale: isLocale,
  motion: isMotion,
  maxFps: isFps,
  hideCursor: isBool,
  kioskPageNav: isBool,
};
const STYLE = { clock: (v) => v === "12" || v === "24" };
const PERFORMANCE = { maxFps: isFps, motion: isMotion };

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (message) => ({ status: 400, message });

/** `target` with each key of `patch` set, or removed when null; undefined when nothing is left. */
function mergeKeys(target, patch) {
  const out = { ...(isObject(target) ? target : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The first key of `patch` that is not in `checks`, or whose value (other than null) fails its check. */
function invalidKey(patch, checks) {
  return Object.entries(patch).find(([key, value]) => !Object.hasOwn(checks, key) || (value !== null && !checks[key](value)))?.[0];
}

/** `config` with `key` set to `value`, or without it when undefined. */
function withKey(config, key, value) {
  const { [key]: _old, ...rest } = config;
  return value === undefined ? rest : { ...rest, [key]: value };
}

/**
 * The stored config with the patch applied: `{ config }`, or `{ status, message }` when the patch is
 * not one (400) or names a screen the config does not have (404).
 */
export function applySettingsPatch(stored, patch) {
  if (!isObject(stored)) return { status: 409, message: "the saved config is not readable" };
  if (!isObject(patch)) return bad("expected a settings patch");
  const extra = Object.keys(patch).find((k) => !["general", "style", "profiles"].includes(k));
  if (extra) return bad(`not a setting: ${extra}`);
  let config = stored;

  if (patch.general !== undefined) {
    if (!isObject(patch.general)) return bad("general must be an object");
    const key = invalidKey(patch.general, GENERAL);
    if (key) return bad(`not a valid general.${key}`);
    config = withKey(config, "general", mergeKeys(config.general, patch.general));
  }

  if (patch.style !== undefined) {
    if (!isObject(patch.style)) return bad("style must be an object");
    const key = invalidKey(patch.style, STYLE);
    if (key) return bad(`not a valid style.${key}`);
    config = withKey(config, "style", mergeKeys(config.style, patch.style));
  }

  if (patch.profiles !== undefined) {
    if (!isObject(patch.profiles)) return bad("profiles must be an object");
    const profiles = Array.isArray(config.profiles) ? config.profiles : [];
    for (const [id, change] of Object.entries(patch.profiles)) {
      if (!isObject(change) || Object.keys(change).some((k) => k !== "performance")) return bad(`not a valid profiles.${id}`);
      const perf = change.performance;
      if (perf !== null && (!isObject(perf) || invalidKey(perf, PERFORMANCE) || Object.values(perf).includes(null))) {
        return bad(`not a valid profiles.${id}.performance`);
      }
      if (!profiles.some((p) => p?.id === id)) return { status: 404, message: `no screen ${id}` };
    }
    config = {
      ...config,
      profiles: profiles.map((p) => {
        const change = Object.hasOwn(patch.profiles, p?.id) ? patch.profiles[p.id] : undefined;
        if (!change) return p;
        const perf = change.performance === null ? undefined : mergeKeys(undefined, change.performance);
        return withKey(p, "performance", perf);
      }),
    };
  }

  return { config };
}

/**
 * A config saved by a Studio push that was built before some Settings patches landed (`log` entries newer than
 * `sinceRev`, oldest first): the config with those patches applied again, so the push can't put an old value back.
 * A patch the config no longer accepts (its screen was deleted) is skipped.
 */
export function reapplySettings(config, log, sinceRev) {
  return log
    .filter((entry) => entry.rev > sinceRev)
    .reduce((acc, entry) => applySettingsPatch(acc, entry.patch).config ?? acc, config);
}
