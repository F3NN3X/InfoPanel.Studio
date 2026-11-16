// What the validator says, in the builder's words (Phase A, G6): each issue names its block by its Layers name, an option and a
// preset by the name people see, and a value's limits in plain words, never a JSON path or a key. Each knows where it points (a
// block, or the Options or Presets tab), so a click on it in the validation list selects that. Pure.
import recipeSchema from "@/widgets/recipe/recipe.schema.json";
import type { Recipe } from "@/widgets/recipe/types";
import type { RecipeIssue } from "@/widgets/recipe/validate";
import { blockAt, layerName } from "./builder-model";

/** One problem as the validation list shows it, and what a click on it opens. */
export interface PlainIssue {
  text: string;
  tab: "block" | "options" | "presets";
  /** The block it is about (`[]` the root card); unset for an option or a preset. */
  path?: number[];
  /** A warning (crowding on the stage, G19): it does not stop a save. */
  warn?: boolean;
}

/** A block setting's name, as the Block tab labels it. */
const FIELDS: Readonly<Record<string, string>> = {
  name: "Name in Layers",
  title: "Title",
  subtitle: "Sub-title",
  bind: "Data",
  cells: "Cell",
  parts: "Part",
  when: "Shows when",
  grow: "Share of its row",
  decimals: "Decimals",
  unit: "Unit",
  scale: "Text size",
  thickness: "Thickness",
  gap: "Gap",
  label: "Label",
  text: "Text",
  columns: "Columns",
  min: "Range from",
  max: "Range to",
  hours: "Forecast hours",
  window: "History",
  direction: "Direction",
  units: "Units",
  style: "Style",
  color: "Colour",
  thresholds: "Warning, critical",
  file: "Picture",
  alt: "Alt text",
  fit: "Fit",
  icon: "Icon",
  over: "List",
  dividers: "Divider lines",
  center: "Value in the centre",
  align: "Align",
  tone: "Tone",
  default: "Default",
  options: "Choice",
};

type Schema = { minimum?: number; maximum?: number; pattern?: string; $ref?: string; properties?: Record<string, Schema> };
const defs = (recipeSchema as unknown as { $defs: Record<string, Schema> }).$defs;
const deref = (s: Schema | undefined): Schema | undefined => (s?.$ref ? defs[s.$ref.split("/").pop()!] : s);

/** The schema of a field (`decimals`, or a part's `unit`), for its limits. */
const fieldSchema = (segments: readonly string[]): Schema | undefined => {
  const last = segments[segments.length - 1];
  const owner = segments.includes("parts") ? defs.part : segments[0] === "options" ? defs.option : segments[0] === "presets" ? defs.preset : defs.block;
  return deref(owner.properties?.[last]);
};

/** A schema message in plain words: "from 0 to 4", "1 to 40 characters, with no < or >". */
function plainSchema(message: string, segments: readonly string[]): string {
  const s = fieldSchema(segments);
  if (message === "out of range" && s?.minimum !== undefined) return s.maximum !== undefined ? `from ${s.minimum} to ${s.maximum}` : `${s.minimum} or more`;
  const chars = /^\^\[\^<>\]\{(\d+),(\d+)\}\$$/.exec(s?.pattern ?? "");
  if (message.startsWith("does not match")) return chars ? `${chars[1]} to ${chars[2]} characters, with no < or >` : "not in the form it takes";
  if (message === "too short") return "can't be empty";
  const notIn = /^(.*) not in (.*)$/.exec(message);
  if (notIn) return `${notIn[1]} is not one of ${notIn[2]}`;
  const notAllowed = /^(\w+) is not allowed$/.exec(message);
  if (notAllowed) return `${FIELDS[notAllowed[1]] ?? notAllowed[1]} is not a setting it has`;
  return message;
}

/** "cells[1]" as "Cell 2", "decimals" as "Decimals". */
const fieldName = (segment: string): string => {
  const [, word = segment, k] = /^(\w+)(?:\[(\d+)\])?$/.exec(segment) ?? [];
  const name = FIELDS[word] ?? word;
  return k === undefined ? name : `${name} ${Number(k) + 1}`;
};

/** Option keys as their labels, preset ids as their names. */
function named(recipe: Recipe, text: string): string {
  return text
    .replace(/\boption ([a-z][A-Za-z0-9]*)/g, (all, key: string) => {
      const o = recipe.options.find((x) => x.key === key);
      return o ? `option “${o.label}”` : all;
    })
    .replace(/\{([a-z][A-Za-z0-9]*)\}/g, (all, key: string) => {
      const o = recipe.options.find((x) => x.key === key);
      return o ? `{${o.label}}` : all;
    })
    .replace(/\bpreset ([a-z][a-z0-9_-]*)/g, (all, id: string) => {
      const p = recipe.presets.find((x) => x.id === id);
      return p ? `preset “${p.name}”` : all;
    })
    .replace(/\bsets ([a-z][A-Za-z0-9]*), which/g, "sets a value that");
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One issue in the builder's words. */
export function plainIssue(recipe: Recipe, issue: RecipeIssue): PlainIssue {
  const m = issue.message;
  // a block's: `$.root.children[0].children[1].decimals: out of range`
  const block = /^\$\.root((?:\.children\[\d+\])*)((?:\.\w+(?:\[\d+\])?)*): (.*)$/.exec(m);
  if (block) {
    const path = [...block[1].matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1]));
    const b = blockAt(recipe, path);
    const segments = block[2].split(".").filter(Boolean);
    const words = segments.map((s) => s.replace(/\[\d+\]$/, ""));
    const what = issue.rule === "schema" ? plainSchema(block[3], words) : named(recipe, block[3]);
    const field = segments.length ? segments.slice(0, 2).map(fieldName).join(" · ") : "";
    return { text: `${b ? layerName(recipe, b) : "A block"}${field ? ` · ${field}` : ""}: ${what}`, tab: "block", path: b ? path : undefined };
  }
  // an option's or a preset's, as the schema says it (`$.options[2].label: ...`)
  const listed = /^\$\.(options|presets)\[(\d+)\]((?:\.\w+(?:\[\d+\])?)*): (.*)$/.exec(m);
  if (listed) {
    const k = Number(listed[2]);
    const owner = listed[1] === "options" ? `Option “${recipe.options[k]?.label ?? k + 1}”` : `Preset “${recipe.presets[k]?.name ?? k + 1}”`;
    const segments = listed[3].split(".").filter(Boolean);
    const field = segments.length ? ` · ${fieldName(segments[0])}` : "";
    return { text: `${owner}${field}: ${plainSchema(listed[4], [listed[1], ...segments.map((s) => s.replace(/\[\d+\]$/, ""))])}`, tab: listed[1] === "options" ? "options" : "presets" };
  }
  // the recipe's own fields (`$.name: ...`, `size.min 5x2 is ...`)
  const own = /^\$\.(\w+)(?:\.\w+)*: (.*)$/.exec(m);
  if (own) return { text: `${capital(own[1] === "name" ? "the widget's name" : own[1])}: ${plainSchema(own[2], [own[1]])}`, tab: "block", path: [] };
  if (issue.rule === "size-range") return { text: capital(m.replace(/size\.(min|max|default)/g, (_, k: string) => ({ min: "the smallest size", max: "the largest size", default: "Opens at" })[k]!)), tab: "block", path: [] };
  if (issue.rule === "preset") return { text: capital(named(recipe, m)), tab: "presets" };
  if (issue.rule === "option") return { text: capital(named(recipe, m)), tab: "options" };
  return { text: capital(named(recipe, m)), tab: "block" };
}

/** Every error in the builder's words, in the validator's order (the same text once). */
export function plainIssues(recipe: Recipe, issues: readonly RecipeIssue[]): PlainIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => i.severity === "error").map((i) => plainIssue(recipe, i)).filter((p) => !seen.has(p.text) && seen.add(p.text));
}
