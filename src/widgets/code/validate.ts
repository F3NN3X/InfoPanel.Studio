// What a code widget's bundle hands back (Phase 6b), checked before anything is registered: the bundle's default export must be a
// function, and what it returns for the SDK a definition of the SDK's shape (src/widgets/sdk.ts `CodeWidgetDefinition`) within its
// caps. Anything else refuses the widget with a plain reason; nothing of it is drawn.
import type { CodeWidgetDefinition, SdkSetting, WidgetSdk } from "../sdk";

const READS_MAX = 16;
const SETTINGS_MAX = 16;
const NAME_MAX = 48;
const BLURB_MAX = 120;
/** A setting key: what a placement stores it under; never one of the standard look's keys' shapes it could collide with by accident. */
const KEY = /^[a-z][a-zA-Z0-9]{0,31}$/;

export type Checked = { def: CodeWidgetDefinition } | { error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const cells = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 1 && n <= 12);

function settingError(s: unknown, i: number): string | undefined {
  if (!isObject(s) || !text(s.key, 32) || !KEY.test(s.key) || !text(s.label, 48)) return `settings[${i}] needs a key (letters and digits, starting lowercase) and a label`;
  switch (s.type) {
    case "boolean":
      return typeof s.default === "boolean" ? undefined : `settings[${i}] (${s.key}): a boolean's default is true or false`;
    case "number":
      return typeof s.default === "number" && Number.isFinite(s.default) ? undefined : `settings[${i}] (${s.key}): a number's default is a number`;
    case "text":
      return typeof s.default === "string" && s.default.length <= 200 ? undefined : `settings[${i}] (${s.key}): a text's default is a text of 200 at most`;
    case "select": {
      const options = Array.isArray(s.options) ? s.options : [];
      const ok = options.length > 0 && options.length <= 32 && options.every((o) => isObject(o) && text(o.value, 48) && text(o.label, 48));
      return ok && options.some((o) => o.value === s.default) ? undefined : `settings[${i}] (${s.key}): a select lists 1 to 32 options and its default is one of them`;
    }
    default:
      return `settings[${i}] (${String(s.key)}): the type is boolean, number, text or select`;
  }
}

/** Why a definition's rail offer is wrong: an object whose settings are values of declared settings, each of its type. */
function railError(rail: unknown, settings: readonly SdkSetting[]): string | undefined {
  if (rail === undefined) return undefined;
  if (!isObject(rail) || (rail.settings !== undefined && !isObject(rail.settings))) return "rail is an object with optional settings";
  for (const [key, value] of Object.entries(rail.settings ?? {})) {
    const s = settings.find((x) => x.key === key);
    if (!s) return `rail sets ${key}, which is not a setting`;
    const ok = s.type === "boolean" ? typeof value === "boolean" : s.type === "number" ? typeof value === "number" && Number.isFinite(value) : s.type === "select" ? s.options.some((o) => o.value === value) : typeof value === "string" && value.length <= 200;
    if (!ok) return `rail sets ${key} to a value its ${s.type} setting can't hold`;
  }
  return undefined;
}

/** A definition as the SDK types say, or why not. */
export function checkDefinition(d: unknown): Checked {
  if (!isObject(d)) return { error: "the bundle returned no widget definition" };
  if (!text(d.name, NAME_MAX)) return { error: `the name is 1 to ${NAME_MAX} characters` };
  if (d.description !== undefined && (typeof d.description !== "string" || d.description.length > BLURB_MAX)) return { error: `the description is ${BLURB_MAX} characters at most` };
  if (d.icon !== undefined && !text(d.icon, 48)) return { error: "the icon is a Material Symbols name" };
  if (!Array.isArray(d.reads) || d.reads.length > READS_MAX || !d.reads.every((r) => text(r, 64))) return { error: `reads lists at most ${READS_MAX} sensor key prefixes` };
  if (!cells(d.defaultSize) || (d.minSize !== undefined && !cells(d.minSize))) return { error: "defaultSize and minSize are [columns, rows] of 1 to 12" };
  if (typeof d.render !== "function") return { error: "render is not a function" };
  const settings = d.settings ?? [];
  if (!Array.isArray(settings) || settings.length > SETTINGS_MAX) return { error: `settings lists at most ${SETTINGS_MAX} options` };
  for (const [i, s] of settings.entries()) {
    const why = settingError(s, i);
    if (why) return { error: why };
  }
  const keys = settings.map((s: SdkSetting) => s.key);
  if (new Set(keys).size !== keys.length) return { error: "two settings share a key" };
  const rail = railError(d.rail, settings as SdkSetting[]);
  if (rail) return { error: rail };
  return { def: d as unknown as CodeWidgetDefinition };
}

/** Runs a bundle's default export with the SDK and checks what it returns. Never throws: a throwing bundle is refused. */
export function definitionOf(bundle: unknown, sdk: WidgetSdk): Checked {
  const make = isObject(bundle) || typeof bundle === "function" ? (bundle as { default?: unknown }).default : undefined;
  if (typeof make !== "function") return { error: "the bundle's default export is not a function of the SDK" };
  try {
    return checkDefinition(make(sdk));
  } catch (e) {
    return { error: `the bundle stopped with an error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) };
  }
}
