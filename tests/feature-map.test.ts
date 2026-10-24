import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { trackedFiles } from "../tools/verify/git.mjs";
import { claims, loadMap, matchesAny, matchesGlob } from "../tools/verify/map.mjs";

// Keeps tests/feature-map.json honest (docs/TESTING.md, "Verify"): `npm run verify` is only as good as this map. Each
// failure says which file or glob is wrong and what to change, so the map can be fixed from the message alone.
const ROOT = path.resolve(__dirname, "..");
const map = loadMap(ROOT);
const tracked = trackedFiles(ROOT);
const FIX = "Fix it in tests/feature-map.json";

const underTests = (file: string) => file.startsWith("tests/");
/** Test files and snapshots must be listed in a feature's `tests`; harness files there may be in `paths` instead. */
const isTestOrSnapshot = (file: string) => /\.(?:test|spec)\.[^/]+$/.test(file) || file.includes("__snapshots__/") || file.endsWith(".snap");
const listed = (file: string) => map.features.some((feature) => matchesAny(file, feature.tests));
const claimed = (file: string) => map.features.some((feature) => claims(feature, file));

describe("the feature map covers the tree", () => {
  it("claims every tracked file outside tests/ in some feature's paths", () => {
    const unmapped = tracked.filter((file) => !underTests(file) && !claimed(file));
    expect(unmapped, `${unmapped.length} tracked file(s) match no feature's "paths". ${FIX}: add a glob for each to the feature that owns it (node tools/verify.mjs --where <path> shows the nearest).`).toEqual([]);
  });

  it("lists every test file and snapshot under tests/ in some feature's tests", () => {
    const missing = tracked.filter((file) => underTests(file) && isTestOrSnapshot(file) && !listed(file));
    expect(missing, `${missing.length} test file(s) are in no feature's "tests". ${FIX}: add each to the "tests" of the feature it covers.`).toEqual([]);
  });

  it("maps every other file under tests/ (fixtures, setup, harness) in a feature's tests or paths", () => {
    const missing = tracked.filter((file) => underTests(file) && !isTestOrSnapshot(file) && !listed(file) && !claimed(file));
    expect(missing, `${missing.length} file(s) under tests/ are in no feature's "tests" or "paths". ${FIX}: add each to the feature that uses it.`).toEqual([]);
  });

  it("has a unique id on every feature, and at most one fallback", () => {
    const ids = map.features.map((feature) => feature.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), "duplicate feature ids").toEqual([]);
    expect(map.features.filter((feature) => feature.fallback).map((feature) => feature.id)).toEqual(["docs"]);
  });
});

describe("every glob in the map matches something", () => {
  const dead = (globs: string[] | undefined, within: (file: string) => boolean = () => true) =>
    (globs ?? []).filter((glob) => !tracked.some((file) => matchesGlob(file, glob) && within(file)));

  for (const feature of map.features) {
    it(`${feature.id}: paths, exclude and tests all match a tracked file`, () => {
      const hint = `Remove it from "${feature.id}" in tests/feature-map.json, or correct the glob (** skips dotfiles: name those).`;
      expect(dead(feature.paths), `"paths" globs of ${feature.id} match no tracked file. ${hint}`).toEqual([]);
      expect(dead(feature.tests), `"tests" globs of ${feature.id} match no tracked file. ${hint}`).toEqual([]);
      expect(dead(feature.exclude, (file) => matchesAny(file, feature.paths)), `"exclude" globs of ${feature.id} remove nothing its "paths" match. ${hint}`).toEqual([]);
    });
  }
});

describe("the checks", () => {
  it("only names checks that exist at the top of the map", () => {
    const bad = map.features.flatMap((feature) => feature.checks.filter((name) => !map.checks[name]).map((name) => `${feature.id}: ${name}`));
    expect(bad, `Unknown check names. ${FIX}: define them under "checks" or fix the spelling.`).toEqual([]);
    const needs = Object.entries(map.checks).flatMap(([name, check]) => (check.needs ?? []).filter((n) => !map.checks[n]).map((n) => `${name} needs ${n}`));
    expect(needs, `Unknown "needs". ${FIX}.`).toEqual([]);
  });

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const BIN_PACKAGE: Record<string, string> = { biome: "@biomejs/biome", tsc: "typescript", vitest: "vitest", playwright: "@playwright/test" };

  /** Why a command can't run, or null: an npm script that doesn't exist, a file that isn't there, a tool nobody installs. */
  function problem(command: string, cwd: string): string | null {
    for (const part of command.split("&&").map((p) => p.trim())) {
      const npm = /^npm run ([\w:-]+)/.exec(part);
      if (npm && !pkg.scripts?.[npm[1]]) return `"${part}": no npm script "${npm[1]}" in package.json`;
      const node = /^node (\S+)/.exec(part);
      if (node && !fs.existsSync(path.join(ROOT, node[1]))) return `"${part}": ${node[1]} does not exist`;
      const npx = /^npx (?:--[\w-]+ )*(\S+)/.exec(part);
      if (npx && !(pkg.devDependencies ?? {})[BIN_PACKAGE[npx[1]]]) return `"${part}": ${npx[1]} is not a devDependency`;
      if (/^cargo /.test(part) && !fs.existsSync(path.join(ROOT, cwd, "Cargo.toml"))) return `"${part}": no Cargo.toml in ${cwd}`;
    }
    return null;
  }

  it("runs npm scripts, files and tools that exist", () => {
    const bad = Object.entries(map.checks).flatMap(([name, check]) =>
      [check.cmd, check.fullCmd, check.fastCmd].filter((c): c is string => !!c).map((c) => problem(c, check.cwd ?? ".")).filter((p) => p).map((p) => `${name}: ${p}`),
    );
    expect(bad, `A check's command can't run. ${FIX} or add the script to package.json.`).toEqual([]);
  });

  it("gives every check a command or marks it as escalating", () => {
    const bad = Object.entries(map.checks).filter(([, check]) => !check.cmd && !check.escalate).map(([name]) => name);
    expect(bad, `Checks with neither "cmd" nor "escalate". ${FIX}.`).toEqual([]);
  });
});
