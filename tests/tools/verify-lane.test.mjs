import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { laneIds, laneWaitsFor, runLane } from "../../tools/verify/lane.mjs";

const checks = { "cargo-server": { lane: "cargo" }, "cargo-app": { lane: "cargo" }, e2e: {} };
const step = (id, extra = {}) => ({ id, cmd: `run ${id}`, ...extra });

describe("verify lane selection", () => {
  it("takes the cargo checks off the main line when something else runs beside them", () => {
    const ids = laneIds([step("e2e"), step("cargo-server"), step("cargo-app")], checks, { ci: false });
    expect([...ids]).toEqual(["cargo-server", "cargo-app"]);
  });

  it("keeps everything on the main line in CI, when only lane checks run, and for a check that can't run here", () => {
    expect(laneIds([step("e2e"), step("cargo-server")], checks, { ci: true }).size).toBe(0);
    expect(laneIds([step("cargo-server"), step("cargo-app")], checks, { ci: false }).size).toBe(0);
    const notRun = [step("e2e"), step("cargo-server"), step("cargo-app", { status: "not-run" })];
    expect([...laneIds(notRun, checks, { ci: false })]).toEqual(["cargo-server"]);
    expect(laneIds([step("e2e"), { id: "cargo-server", cmd: null }], checks, { ci: false }).size).toBe(0);
  });
});

describe("verify lane start", () => {
  const after = { ...checks, "cargo-app": { lane: "cargo", after: ["settings-build"] }, "settings-build": {} };
  const lane = new Set(["cargo-server", "cargo-app"]);

  it("waits for the planned checks its own name in `after`", () => {
    const steps = [step("settings-build"), step("e2e"), step("cargo-server"), step("cargo-app")];
    expect([...laneWaitsFor(steps, lane, after)]).toEqual(["settings-build"]);
  });

  it("waits for nothing when those checks are not planned, have nothing to run or can't run here", () => {
    const rest = [step("e2e"), step("cargo-server"), step("cargo-app")];
    expect(laneWaitsFor(rest, lane, after).size).toBe(0);
    expect(laneWaitsFor([{ id: "settings-build", cmd: null }, ...rest], lane, after).size).toBe(0);
    expect(laneWaitsFor([step("settings-build", { status: "not-run" }), ...rest], lane, after).size).toBe(0);
    expect(laneWaitsFor([step("settings-build"), ...rest], new Set(), after).size).toBe(0);
  });
});

describe("verify lane run", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-lane-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const spec = (steps, keepGoing = false) => ({ steps, log: path.join(dir, "lane.log"), out: path.join(dir, "lane.json"), keepGoing });
  const exits = (codes) => (cmd) => ({ status: codes[cmd] ?? 0 });

  it("runs the steps in order and writes the results it returns", () => {
    const results = runLane(spec([step("a"), step("b", { notRunExit: 3 })]), exits({ "run b": 3 }));
    expect(results.map((r) => [r.id, r.status])).toEqual([["a", "passed"], ["b", "not-run"]]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "lane.json"), "utf8"))).toEqual(results);
    expect(fs.readFileSync(path.join(dir, "lane.log"), "utf8")).toContain("== b: run b");
  });

  it("skips what follows a failure, unless told to keep going", () => {
    const failing = exits({ "run a": 1 });
    expect(runLane(spec([step("a"), step("b")]), failing).map((r) => r.status)).toEqual(["failed", "skipped"]);
    expect(runLane(spec([step("a"), step("b")], true), failing).map((r) => r.status)).toEqual(["failed", "passed"]);
  });
});
