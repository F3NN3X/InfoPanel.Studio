import { describe, expect, it } from "vitest";
import { gateFor, parseArgs, statusDescription } from "../../tools/ship.mjs";

const current = { head: "abc123", tree: "t1" };
const record = (over = {}) => ({
  ...current,
  mode: "default",
  base: "origin/main",
  browser: true,
  exit: 0,
  checks: [
    { id: "lint", status: "passed", ms: 1000 },
    { id: "unit", status: "passed", ms: 24400 },
    { id: "lab", status: "skipped", ms: 0 },
  ],
  ...over,
});

describe("ship gate", () => {
  it("ships a passing run of exactly this commit and tree over the whole branch, or one of every check", () => {
    expect(gateFor(record(), current)).toEqual({ ok: true });
    expect(gateFor(record({ base: "main" }), current)).toEqual({ ok: true });
    expect(gateFor(record({ mode: "full", base: "the last passing verify" }), current)).toEqual({ ok: true });
    expect(gateFor(record({ mode: "full", base: null }), current)).toEqual({ ok: true });
  });

  it("refuses a run of another commit or tree, a failed run, a run of part of the branch, and one with a check not run here", () => {
    expect(gateFor(record({ head: "old" }), current).reason).toContain("stale");
    expect(gateFor(record({ tree: "dirty" }), current).reason).toContain("stale");
    expect(gateFor(record({ exit: 1 }), current).reason).toContain("fresh-fail");
    expect(gateFor(record({ base: "the last passing verify" }), current).reason).toContain("not the whole branch");
    expect(gateFor(record({ base: "HEAD~1" }), current).reason).toContain("not the whole branch");
    expect(gateFor(record({ base: undefined }), current).ok).toBe(false);
    expect(gateFor(record({ browser: false }), current).reason).toContain("skipped the browser checks");
    expect(gateFor(record({ browser: undefined }), current).ok).toBe(false);
    const notRun = record({ checks: [{ id: "cargo-app", status: "not-run", ms: 0 }] });
    expect(gateFor(notRun, current).reason).toBe("not run here: cargo-app");
    expect(gateFor(null, current).ok).toBe(false);
  });
});

describe("ship status and arguments", () => {
  it("describes the run in GitHub's 140 characters", () => {
    expect(statusDescription(record())).toBe("verify passed here on the whole branch: 2 checks in 25 s");
  });

  it("reads --title, --body-file and --no-merge, and refuses anything else", () => {
    expect(parseArgs(["--title", "feat: x", "--body-file", "b.md", "--no-merge"])).toEqual({ title: "feat: x", bodyFile: "b.md", merge: false });
    expect(parseArgs([])).toEqual({ title: null, bodyFile: null, merge: true });
    expect(() => parseArgs(["--title"])).toThrow("incomplete");
    expect(() => parseArgs(["--force"])).toThrow("unknown");
  });
});
