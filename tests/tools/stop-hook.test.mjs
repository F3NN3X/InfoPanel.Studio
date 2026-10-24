import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BLOCKED_FILE, decideStop, FAILED_MESSAGE, runStopHook, STALE_MESSAGE } from "../../tools/verify/stop-hook.mjs";

const base = { active: false, changes: 3, state: "stale", tree: "t1", blockedTree: null };

describe("decideStop", () => {
  it("lets a session with no changes, a fresh pass, or an already-continuing agent stop", () => {
    expect(decideStop({ ...base, changes: 0 }).code).toBe(0);
    expect(decideStop({ ...base, state: "fresh-pass" }).code).toBe(0);
    expect(decideStop({ ...base, active: true }).code).toBe(0);
  });

  it("blocks a stale tree with the run-verify message", () => {
    expect(decideStop(base)).toEqual({ code: 2, message: STALE_MESSAGE });
  });

  it("blocks a failing tree once, then lets the same tree through", () => {
    expect(decideStop({ ...base, state: "fresh-fail" })).toEqual({ code: 2, message: FAILED_MESSAGE, recordBlocked: "t1" });
    expect(decideStop({ ...base, state: "fresh-fail", blockedTree: "t1" }).code).toBe(0);
    expect(decideStop({ ...base, state: "fresh-fail", tree: "t2", blockedTree: "t1" }).code).toBe(2);
  });
});

describe("runStopHook", () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "stop-hook-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const hook = (status, input = "{}") => runStopHook({ root, input, check: () => status });

  it("records the blocked tree so the second stop on it goes through", () => {
    const failing = { state: "fresh-fail", changes: 2, tree: "abc" };
    expect(hook(failing).code).toBe(2);
    expect(JSON.parse(fs.readFileSync(path.join(root, BLOCKED_FILE), "utf8"))).toEqual({ tree: "abc" });
    expect(hook(failing).code).toBe(0);
  });

  it("honours stop_hook_active and survives a broken verify or unreadable input", () => {
    const stale = { state: "stale", changes: 1, tree: "x" };
    expect(hook(stale, '{"stop_hook_active":true}').code).toBe(0);
    expect(hook(stale, "not json").code).toBe(2);
    const broken = () => {
      throw new Error("git missing");
    };
    expect(runStopHook({ root, input: "{}", check: broken }).code).toBe(0);
  });
});
