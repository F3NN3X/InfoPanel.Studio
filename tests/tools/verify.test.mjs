import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashTree, mergeChangeSets, parseNameStatus } from "../../tools/verify/git.mjs";
import { featuresOf, isRoutingOnly, matchesGlob, resolveChanges, splitRoutingOnly } from "../../tools/verify/map.mjs";
import { buildPlan, EXIT, exitCodeFor } from "../../tools/verify/plan.mjs";
import { freshness, freshnessExit, incrementalBase, nextOkHead, SINCE_LAST_PASS } from "../../tools/verify/record.mjs";

// A small map in the real map's shape: lint always, a Vitest check, a Windows-only check, an escalating one.
const map = {
  checks: {
    lint: { cmd: "lint {files}", fullCmd: "lint-all", files: ["src/**/*.ts"], always: true },
    typecheck: { cmd: "tsc" },
    unit: { cmd: "vt related {tests}", fastCmd: "vt run {tests}", fullCmd: "vt all", tests: ["tests/**/*.test.ts"], testsExclude: ["tests/server/**"], related: true },
    build: { cmd: "build" },
    e2e: { cmd: "pw {tests}", fullCmd: "pw all", tests: ["tests/e2e/*.spec.ts"], emptyMeansAll: true, needs: ["build"] },
    cargo: { cmd: "cargo test", platform: "win32" },
    full: { escalate: true },
  },
  features: [
    { id: "a", paths: ["src/a/**", "src/shared.ts"], exclude: ["src/a/skip/**"], tests: ["tests/a/**", "tests/e2e/a.spec.ts"], checks: ["typecheck", "unit", "e2e"] },
    { id: "b", paths: ["src/b/**", "src/shared.ts"], tests: ["tests/b.test.ts"], checks: ["unit", "cargo"] },
    { id: "tooling", paths: ["package.json"], tests: [], checks: ["full"] },
    { id: "docs", fallback: true, paths: ["docs/**", "src/a/skip/**"], tests: [], checks: [] },
  ],
};
const tracked = ["tests/a/x.test.ts", "tests/b.test.ts", "tests/e2e/a.spec.ts", "tests/server/s.test.mjs"];
const plan = (changed, extra = {}) => {
  const { byFeature } = resolveChanges(changed, map);
  const features = [...byFeature.keys()].map((id) => map.features.find((f) => f.id === id));
  return buildPlan({ map, features, changed, mode: "default", tracked, exists: () => true, platform: "linux", ...extra });
};
const unitCmd = (p) => p.steps.find((s) => s.id === "unit").cmd;

describe("change set", () => {
  it("counts a rename by its old and its new path, and merges and sorts the sets", () => {
    const out = ["M", "src/a/m.ts", "R100", "src/a/old.ts", "src/b/new.ts", "D", "src/b/gone.ts", ""].join("\0");
    expect(parseNameStatus(out)).toEqual(["src/a/m.ts", "src/a/old.ts", "src/b/new.ts", "src/b/gone.ts"]);
    expect(mergeChangeSets(["b", "a"], ["a", "c"], [])).toEqual(["a", "b", "c"]);
  });
});

describe("glob matching", () => {
  it("agrees with Node's path.matchesGlob, dotfiles and braces included", () => {
    const files = ["a/b.ts", "a/b/c.ts", "a/.x/c.ts", "a/.f.json", ".github/ci.yml", "x.test.tsx", "t/x.test.ts", "t/x.test", "a"];
    const globs = ["a/**", "a/*", "a/**/*.ts", "**/*.ts", "*.{mjs,ts}", ".github/**", "a/.f.json", "t/x.test.*", "t/?.test.ts", "{a,t}/**", "a/b?ts"];
    for (const glob of globs) for (const file of files) expect(matchesGlob(file, glob), `${glob} vs ${file}`).toBe(path.posix.matchesGlob(file, glob));
  });
});

describe("feature resolution", () => {
  it("applies exclude, and lets the docs fallback take only what nothing else claims", () => {
    expect(featuresOf("src/a/x.ts", map).map((f) => f.id)).toEqual(["a"]);
    expect(featuresOf("src/a/skip/x.ts", map).map((f) => f.id)).toEqual(["docs"]);
    expect(featuresOf("docs/readme.md", map).map((f) => f.id)).toEqual(["docs"]);
    expect(featuresOf("src/shared.ts", map).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("selects the features that list a changed test file, and reports a file nobody claims", () => {
    expect(featuresOf("tests/b.test.ts", map).map((f) => f.id)).toEqual(["b"]);
    const { unmapped, byFeature } = resolveChanges(["src/a/x.ts", "src/new/y.ts"], map);
    expect(unmapped).toEqual(["src/new/y.ts"]);
    expect([...byFeature.keys()]).toEqual(["a"]);
  });
});

describe("the plan", () => {
  it("orders checks as the map does, adds what a check needs, and dedupes across features", () => {
    expect(plan(["src/shared.ts"]).steps.map((s) => s.id)).toEqual(["lint", "typecheck", "unit", "build", "e2e", "cargo"]);
  });

  it("lints only the changed files it covers, and skips lint when there are none", () => {
    expect(plan(["src/a/x.ts", "docs/x.md"]).steps[0].cmd).toBe("lint src/a/x.ts");
    expect(plan(["docs/x.md"]).steps[0]).toMatchObject({ id: "lint", cmd: null, status: "skipped" });
  });

  it("runs the features' tests plus the changed sources in one unit call, and only the tests with --fast", () => {
    expect(unitCmd(plan(["src/a/x.ts"]))).toBe("vt related tests/a/x.test.ts src/a/x.ts");
    expect(unitCmd(plan(["src/a/x.ts"], { mode: "fast" }))).toBe("vt run tests/a/x.test.ts");
  });

  it("keeps tests/server out of the unit call and passes only listed specs to e2e", () => {
    const p = plan(["tests/server/s.test.mjs", "src/a/x.ts"]);
    expect(unitCmd(p)).not.toContain("tests/server");
    expect(p.steps.find((s) => s.id === "e2e").cmd).toBe("pw tests/e2e/a.spec.ts");
  });

  it("runs the whole check when a feature lists no spec for it", () => {
    const only = { ...map, features: [{ ...map.features[0], tests: [] }] };
    const p = buildPlan({ map: only, features: only.features, changed: [], mode: "default", tracked, exists: () => true, platform: "linux" });
    expect(p.steps.find((s) => s.id === "e2e").cmd).toBe("pw all");
  });

  it("escalates to every check when a feature carries `full`, and in --full", () => {
    for (const p of [plan(["package.json"]), plan(["src/a/x.ts"], { mode: "full" })]) {
      expect(p).toMatchObject({ mode: "full", escalated: true });
      expect(p.steps.map((s) => s.cmd)).toEqual(["lint-all", "tsc", "vt all", "build", "pw all", "cargo test"]);
    }
  });

  it("marks a Windows-only check as not run elsewhere", () => {
    expect(plan(["src/b/x.ts"]).steps.find((s) => s.id === "cargo")).toMatchObject({ status: "not-run", reason: "needs Windows" });
    expect(plan(["src/b/x.ts"], { platform: "win32" }).steps.find((s) => s.id === "cargo").status).toBeUndefined();
  });

  it("marks a localOnly check as not run where CI is set, on any platform", () => {
    const local = { ...map, checks: { ...map.checks, cargo: { ...map.checks.cargo, localOnly: true } } };
    const run = (ci) => plan(["src/b/x.ts"], { map: local, platform: "win32", ci }).steps.find((s) => s.id === "cargo");
    expect(run(true)).toMatchObject({ status: "not-run", reason: "local only (CI is set)" });
    expect(run(false).status).toBeUndefined();
  });

  it("skips a browser check locally, in --full too, unless asked for; CI always runs it", () => {
    const pw = { ...map, checks: { ...map.checks, e2e: { ...map.checks.e2e, browser: true } } };
    const run = (extra) => plan(["src/a/x.ts"], { map: pw, ...extra }).steps.find((s) => s.id === "e2e");
    for (const mode of ["default", "full"]) expect(run({ mode })).toMatchObject({ cmd: null, status: "skipped" });
    expect(run({ browser: true }).cmd).toBe("pw tests/e2e/a.spec.ts");
    expect(run({ ci: true }).cmd).toBe("pw tests/e2e/a.spec.ts");
  });

  it("falls back to the whole suite when the file list outgrows a command line", () => {
    const many = Array.from({ length: 400 }, (_, i) => `tests/a/long-name-number-${i}.test.ts`);
    expect(unitCmd(plan(["src/a/x.ts"], { tracked: many }))).toBe("vt all");
  });

  it("runs a check's smoke list in place of the features' specs, with the changed specs, and every spec in --full", () => {
    const smoke = { ...map, checks: { ...map.checks, e2e: { ...map.checks.e2e, smoke: ["tests/e2e/s.spec.ts"] } } };
    const all = [...tracked, "tests/e2e/s.spec.ts", "tests/e2e/b.spec.ts"];
    const e2e = (changed, extra = {}) => plan(changed, { map: smoke, tracked: all, ...extra }).steps.find((s) => s.id === "e2e").cmd;
    expect(e2e(["src/a/x.ts"])).toBe("pw tests/e2e/s.spec.ts");
    expect(e2e(["src/a/x.ts", "tests/e2e/a.spec.ts"])).toBe("pw tests/e2e/s.spec.ts tests/e2e/a.spec.ts");
    expect(e2e(["src/a/x.ts"], { mode: "full" })).toBe("pw all");
  });
});

describe("a map change", () => {
  const text = (over = {}) => JSON.stringify({ version: 1, checks: { unit: { cmd: "vt" } }, features: [{ id: "a", paths: ["src/a/**"], checks: ["unit"] }], ...over });

  it("is routing only when nothing but its features changed, however they are laid out", () => {
    const moved = text({ features: [{ id: "a", paths: ["src/a/**", "src/new.ts"], checks: [] }, { id: "b", paths: [], checks: ["unit"] }] });
    expect(isRoutingOnly(text(), moved)).toBe(true);
    expect(isRoutingOnly(text(), JSON.stringify(JSON.parse(text()), null, 2))).toBe(true);
  });

  it("is not when a check's definition or anything else changed, or when either text does not parse", () => {
    expect(isRoutingOnly(text(), text({ checks: { unit: { cmd: "vt --bail" } } }))).toBe(false);
    expect(isRoutingOnly(text(), text({ checks: { unit: { cmd: "vt" }, extra: { cmd: "x" } } }))).toBe(false);
    expect(isRoutingOnly(text(), text({ version: 2 }))).toBe(false);
    expect(isRoutingOnly(text(), "{")).toBe(false);
  });

  it("leaves the changed files when it is routing only, and stays in them otherwise or when it is new", () => {
    const files = ["src/a/x.ts", "tests/feature-map.json"];
    const routed = { old: text(), new: text({ features: [] }) };
    expect(splitRoutingOnly(files, () => routed)).toEqual({ routingOnly: true, rest: ["src/a/x.ts"] });
    expect(splitRoutingOnly(files, () => ({ old: text(), new: text({ version: 2 }) }))).toEqual({ routingOnly: false, rest: files });
    expect(splitRoutingOnly(files, () => null)).toEqual({ routingOnly: false, rest: files });
    expect(splitRoutingOnly(["src/a/x.ts"], () => routed)).toEqual({ routingOnly: false, rest: ["src/a/x.ts"] });
  });
});

describe("the base of a run", () => {
  const known = { isAncestor: (sha) => sha === "ok1" };

  it("is the last passing run's commit while HEAD descends from it, and main's for --full, CI, a rebase or no record", () => {
    expect(incrementalBase({ okHead: "ok1" }, { full: false, ci: false, ...known })).toBe("ok1");
    expect(incrementalBase({ okHead: "ok1" }, { full: true, ci: false, ...known })).toBeNull();
    expect(incrementalBase({ okHead: "ok1" }, { full: false, ci: true, ...known })).toBeNull();
    expect(incrementalBase({ okHead: "rebased-away" }, { full: false, ci: false, ...known })).toBeNull();
    expect(incrementalBase({}, { full: false, ci: false, ...known })).toBeNull();
    expect(incrementalBase(null, { full: false, ci: false, ...known })).toBeNull();
  });

  const run = (over = {}) => ({ head: "h2", mode: "default", base: SINCE_LAST_PASS, exit: EXIT.ok, checks: [{ status: "passed" }, { status: "skipped" }], ...over });
  const previous = { okHead: "h1" };

  it("moves to a run's commit when it passed on everything since the last passing run, the whole branch, or every check", () => {
    expect(nextOkHead(previous, run())).toBe("h2");
    expect(nextOkHead(previous, run({ base: "origin/main" }))).toBe("h2");
    expect(nextOkHead(null, run({ base: "main" }))).toBe("h2");
    expect(nextOkHead(previous, run({ mode: "full", base: null }))).toBe("h2");
  });

  it("stays where it was after a failure, --fast, a narrower --base, or a check left unrun", () => {
    expect(nextOkHead(previous, run({ exit: EXIT.failed }))).toBe("h1");
    expect(nextOkHead(previous, run({ mode: "fast" }))).toBe("h1");
    expect(nextOkHead(previous, run({ base: "HEAD~1" }))).toBe("h1");
    expect(nextOkHead(previous, run({ checks: [{ status: "not-run" }] }))).toBe("h1");
    expect(nextOkHead(null, run({ exit: EXIT.failed }))).toBeNull();
  });
});

describe("exit codes", () => {
  it("ranks failed over incomplete over ok, and --allow-incomplete turns 3 into 0", () => {
    const r = (...statuses) => statuses.map((status) => ({ status }));
    expect(exitCodeFor(r("passed", "skipped"))).toBe(EXIT.ok);
    expect(exitCodeFor(r("passed", "not-run"))).toBe(EXIT.incomplete);
    expect(exitCodeFor(r("not-run", "failed"))).toBe(EXIT.failed);
    expect(exitCodeFor(r("not-run"), { allowIncomplete: true })).toBe(EXIT.ok);
  });
});

describe("tree hash and freshness", () => {
  const diff = Buffer.from("diff");
  const one = { file: "n.ts", bytes: Buffer.from("one") };

  it("changes when an untracked file's content or name, or the diff, changes, and not otherwise", () => {
    const a = hashTree(diff, [one]);
    expect(hashTree(diff, [{ ...one }])).toBe(a);
    expect(hashTree(diff, [{ ...one, bytes: Buffer.from("two") }])).not.toBe(a);
    expect(hashTree(diff, [{ ...one, file: "m.ts" }])).not.toBe(a);
    expect(hashTree(Buffer.from("other"), [one])).not.toBe(a);
  });

  it("is fresh only for the same head and tree, and pass-vs-fail follows the recorded exit", () => {
    const now = { head: "h", tree: "t" };
    expect(freshness({ ...now, exit: 0 }, now)).toBe("fresh-pass");
    expect(freshness({ ...now, exit: 3 }, now)).toBe("fresh-fail");
    expect(freshness({ head: "h", tree: "x", exit: 0 }, now)).toBe("stale");
    expect(freshness({ head: "g", tree: "t", exit: 0 }, now)).toBe("stale");
    expect(freshness(null, now)).toBe("stale");
    expect(["fresh-pass", "fresh-fail", "stale"].map(freshnessExit)).toEqual([0, 1, 4]);
  });
});
