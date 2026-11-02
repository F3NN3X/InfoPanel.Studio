import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Settings and Help are their own bundles: their stylesheet is `src/settings/settings.css` (with `tokens.css`), not
 * `src/index.css`. A scale class that those entries use but `tokens.css` does not define compiles to a var() that falls back
 * (16px text, no radius, no height), so every name used there must be defined in the CSS they load.
 */
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? files(path) : /\.(tsx?|css)$/.test(e.name) ? [path] : [];
  });

const read = (f: string) => readFileSync(f, "utf8");
const defined = new Set(
  ["src/settings/tokens.css", "src/settings/settings.css", "src/help/help.css"].flatMap((f) => [...read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
);

const used = (): Map<string, string> => {
  const found = new Map<string, string>();
  for (const f of ["src/settings", "src/help", "src/app-window"].flatMap(files).filter((p) => /\.tsx?$/.test(p))) {
    const src = read(f);
    for (const m of src.matchAll(/(?<![\w-])text-(micro|caption|body|title)(?![\w-])/g)) found.set(`--text-${m[1]}`, f);
    for (const m of src.matchAll(/rounded-(?:[a-z]+-)?ui-(sm|md|lg|menu)(?![\w-])/g)) found.set(`--radius-ui-${m[1]}`, f);
    for (const m of src.matchAll(/--(ui-h-[a-z]+|z-[a-z]+)(?![\w-])/g)) found.set(`--${m[1]}`, f);
  }
  return found;
};

describe("Settings and Help theme tokens", () => {
  it("defines every scale token those entries use", () => {
    const missing = [...used()].filter(([name]) => !defined.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(missing).toEqual([]);
  });
});
