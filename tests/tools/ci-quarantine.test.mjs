import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, gateWorkers, playwrightCommand, UNIT_RUNS, unproven, vitestCommand } from "../../tools/ci/flake-gate.mjs";
import { playwrightScope, problems, QUARANTINE_FILE, readQuarantine } from "../../tools/ci/quarantine.mjs";

const entry = { issue: 301, owner: "F3NN3X", until: "2026-12-01" };
const check = (entries, today = "2026-11-08") => problems(entries, { today, exists: () => true });

describe("quarantine list", () => {
  it("is valid today: every entry has an issue, an owner and a deadline still ahead, and a file that exists", () => {
    const issues = problems(readQuarantine(), { today: new Date().toISOString().slice(0, 10), exists: (file) => fs.existsSync(file) });
    expect(issues, `${QUARANTINE_FILE}: ${issues.join("; ")}`).toEqual([]);
  });

  it("accepts a full entry, today as the deadline included", () => {
    expect(check({ "tests/a.test.ts": entry })).toEqual([]);
    expect(check({ "tests/a.test.ts": { ...entry, until: "2026-11-08" } })).toEqual([]);
  });

  it("rejects a missing issue or owner, a malformed or past deadline, and a file that is gone", () => {
    expect(check({ a: { ...entry, issue: undefined } })).toEqual(["a: needs the tracking issue number as `issue`"]);
    expect(check({ a: { ...entry, owner: " " } })).toEqual(["a: needs an `owner`"]);
    expect(check({ a: { ...entry, until: "soon" } })).toEqual(["a: needs `until` as YYYY-MM-DD"]);
    expect(check({ a: { ...entry, until: "2026-11-07" } })[0]).toContain("past its deadline");
    expect(problems({ a: entry }, { today: "2026-11-08", exists: () => false })[0]).toContain("does not exist");
  });
});

describe("quarantine scope for Playwright", () => {
  const files = ["tests/e2e/pack-selectors.spec.ts", "tests/visual/one-editor/shell.spec.ts", "tests/lib/x.test.ts"];

  it("ignores the quarantined specs of a project, and with `only` matches just them", () => {
    expect(playwrightScope(files, "tests/e2e", false)).toEqual({ testIgnore: ["pack-selectors.spec.ts"] });
    expect(playwrightScope(files, "tests/e2e", true)).toEqual({ testMatch: ["pack-selectors.spec.ts"] });
    expect(playwrightScope(files, "tests/visual/look", false)).toEqual({});
    expect(playwrightScope(files, "tests/visual/look", true)).toEqual({ testMatch: [] });
  });
});

describe("new-test gate", () => {
  it("sorts changed files into Vitest files and each Playwright project's specs, leaving the server suite and others out", () => {
    const { unit, specs } = classify(["tests/lib/a.test.ts", "tests/components/b.dom.test.tsx", "tests/server/s.test.mjs", "tests/e2e/k.spec.ts", "tests/visual/one-editor/f.spec.ts", "tests/e2e/fixtures.ts", "src/x.ts"]);
    expect(unit).toEqual(["tests/lib/a.test.ts", "tests/components/b.dom.test.tsx"]);
    expect(specs).toEqual({ e2e: ["tests/e2e/k.spec.ts"], "one-editor": ["tests/visual/one-editor/f.spec.ts"] });
  });

  it("repeats a Vitest file 10 times shuffled, a spec 3 times on half the cores (1 to 4 workers)", () => {
    expect(UNIT_RUNS).toBe(10);
    expect(vitestCommand(["tests/a.test.ts"], 7)).toContain("--sequence.shuffle.tests --sequence.seed=7 --maxWorkers=4 tests/a.test.ts");
    expect(playwrightCommand("e2e", ["tests/e2e/k.spec.ts"], 2)).toBe("npx playwright test --project=e2e --repeat-each 3 --workers 2 tests/e2e/k.spec.ts");
    expect([1, 2, 4, 8, 16, 32].map(gateWorkers)).toEqual([1, 1, 2, 4, 4, 8]);
  });

  it("repeats a file again only when its content is not the one that last passed every repeat", () => {
    const hashes = { "tests/a.test.ts": "h1", "tests/b.test.ts": "h2", "tests/c.test.ts": "h3" };
    expect(unproven(Object.keys(hashes), { "tests/a.test.ts": "h1", "tests/b.test.ts": "old" }, hashes)).toEqual(["tests/b.test.ts", "tests/c.test.ts"]);
    expect(unproven(Object.keys(hashes), {}, hashes)).toEqual(Object.keys(hashes));
  });
});
