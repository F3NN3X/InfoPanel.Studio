import { describe, expect, it } from "vitest";
import { assetFor, downloadFirst, fetchRetried, sourcesFor } from "../../tools/ci/actionlint.mjs";
import { planOutputs } from "../../tools/ci/plan-outputs.mjs";
import { decideRelease, reachableFromMain, retried } from "../../tools/ci/release-gate.mjs";
import { DEFAULT_COMMANDS, parseCommands, shardCommands } from "../../tools/ci/run-commands.mjs";

const plan = (mode, ...ids) => ({ mode, steps: ids.map((id) => (id.startsWith("-") ? { id: id.slice(1), cmd: null } : { id, cmd: `run ${id}` })) });

describe("plan outputs", () => {
  it("is docs-only when no planned check has a command (a skipped lint is not one)", () => {
    expect(planOutputs(plan("default", "-lint"))).toMatchObject({ docs_only: true, lint: false, unit: false, full: false });
  });

  it("switches on the jobs a widget change needs, and leaves the browser checks it plans to the label (ship ran them locally)", () => {
    const widget = plan("default", "lint", "typecheck", "unit", "build", "ui-usage", "server-bin", "e2e", "overflow");
    const out = planOutputs(widget);
    expect(out).toMatchObject({ lint: true, typecheck: true, unit: true, build: true, ui_usage: true, pack_budgets: false, e2e: false, server: false, rust: false, windows: false, docs_only: false });
    expect(JSON.parse(out.e2e_cmds)).toEqual([]);
  });

  it("runs no browser check without a label, and the whole checks with the ci:e2e label", () => {
    const logic = plan("default", "lint", "typecheck", "unit");
    expect(planOutputs(logic)).toMatchObject({ e2e: false, e2e_cmds: "[]" });
    const commands = { e2e: "npm run test:e2e", "one-editor": "npm run test:one-editor", overflow: "node overflow" };
    const forced = planOutputs(logic, { e2e: true, commands });
    expect(forced).toMatchObject({ e2e: true, build: true });
    expect(JSON.parse(forced.e2e_cmds)).toEqual(Object.values(commands));
  });

  it("builds the pages for a forced browser run even when the change needs no build", () => {
    expect(planOutputs(plan("default", "-lint"), { e2e: true })).toMatchObject({ e2e: true, build: true, docs_only: false });
  });

  it("runs only the cache-saving jobs on a push to main (--warm)", () => {
    const warm = planOutputs(plan("full", "lint", "unit", "e2e"), { warm: true });
    expect(Object.entries(warm).filter(([, value]) => value).map(([name]) => name).sort()).toEqual(["rust", "server", "windows"]);
  });

  it("sends server work to the server job and to windows, and the app crate to the rust job", () => {
    expect(planOutputs(plan("default", "server-suite", "cargo-server"))).toMatchObject({ server: true, windows: true, rust: false });
    expect(planOutputs(plan("default", "typecheck", "cargo-app"))).toMatchObject({ rust: true, windows: true, server: false });
  });

  it("sends a Rust format check to the windows job, which runs cargo fmt", () => {
    expect(planOutputs(plan("default", "rust-fmt"))).toMatchObject({ windows: true, rust: false, server: false, docs_only: false });
  });

  it("is everything on --all (the ci:full label), and `full` follows an escalated plan", () => {
    const all = planOutputs(plan("default", "-lint"), { all: true });
    const gates = ["docs_only", "flake_unit", "flake_e2e", "quarantine"]; // the gate needs the changed files; quarantine follows its list
    expect(Object.entries(all).filter(([name, value]) => !gates.includes(name) && !value)).toEqual([]);
    expect(all.docs_only).toBe(false);
    expect(planOutputs(plan("full", "lint", "unit")).full).toBe(true);
  });
});

describe("release gate", () => {
  const sha = "abcdef0123456789";
  const ok = [{ name: "ci-ok", conclusion: "success" }];
  const base = { sha, check: "ci-ok", onMain: true, commitChecks: [], pulls: [], nightlyShas: [] };

  it("passes on a successful ci-ok on the commit", () => {
    expect(decideRelease({ ...base, commitChecks: ok }).ok).toBe(true);
  });

  it("passes for a squash-merged PR whose head was green and whose merge commit is this one", () => {
    const pulls = [{ number: 7, merge_commit_sha: sha, headChecks: ok }];
    expect(decideRelease({ ...base, pulls }).ok).toBe(true);
    expect(decideRelease({ ...base, pulls: [{ ...pulls[0], merge_commit_sha: "other" }] }).ok).toBe(false);
  });

  it("passes on the last green nightly's commit, and fails on a red or missing ci-ok", () => {
    expect(decideRelease({ ...base, nightlyShas: [sha] }).ok).toBe(true);
    expect(decideRelease({ ...base, commitChecks: [{ name: "ci-ok", conclusion: "failure" }] }).ok).toBe(false);
    expect(decideRelease(base).reason).toContain("no successful ci-ok");
  });

  it("fails for a commit main doesn't hold, however green it is", () => {
    for (const onMain of [false, undefined]) {
      const r = decideRelease({ ...base, onMain, commitChecks: ok, nightlyShas: [sha] });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("not on main");
    }
  });

  it("reads main as holding the commit only when main is ahead of it or is it", () => {
    expect(reachableFromMain("ahead")).toBe(true);
    expect(reachableFromMain("identical")).toBe(true);
    expect(reachableFromMain("behind")).toBe(false);
    expect(reachableFromMain("diverged")).toBe(false);
    expect(reachableFromMain(undefined)).toBe(false);
  });
});

describe("plan outputs for the new-test gate and quarantine", () => {
  const gated = (mode, ...ids) => ({ mode, changed: ["tests/lib/a.test.ts", "src/x.ts", "tests/e2e/k.spec.ts"], steps: ids.map((id) => ({ id, cmd: `run ${id}` })) });

  it("gives the Vitest gate its own job, and the spec gate a job of its own with the ci:e2e label", () => {
    const commands = { e2e: "npm run test:e2e" };
    const out = planOutputs(gated("default", "unit", "e2e", "flake-unit", "flake-e2e"), { e2e: true, commands });
    expect(out).toMatchObject({ flake_unit: true, e2e: true });
    expect(JSON.parse(out.flake_unit_cmds)).toEqual(["run flake-unit"]);
    expect(JSON.parse(out.e2e_cmds)).toEqual(["npm run test:e2e"]);
    expect(out).toMatchObject({ flake_e2e: true, build: true });
    expect(JSON.parse(out.flake_e2e_cmds)).toEqual(["run flake-e2e"]);
    expect(planOutputs(gated("default", "flake-e2e"))).toMatchObject({ e2e: false, flake_e2e: false, flake_e2e_cmds: "[]" });
    expect(planOutputs(gated("default", "unit"))).toMatchObject({ flake_unit: false, flake_unit_cmds: "[]" });
  });

  it("puts the changed test files on the gate's command when the plan escalated (CI has no merge base to read)", () => {
    const out = planOutputs(gated("full", "flake-unit", "flake-e2e"), { e2e: true });
    expect(JSON.parse(out.flake_unit_cmds)).toEqual(["run flake-unit tests/lib/a.test.ts tests/e2e/k.spec.ts"]);
    expect(JSON.parse(out.flake_e2e_cmds)).toEqual(["run flake-e2e tests/lib/a.test.ts tests/e2e/k.spec.ts"]);
  });

  it("starts the advisory quarantine job only while something is quarantined", () => {
    expect(planOutputs(gated("default", "unit"), { quarantined: true }).quarantine).toBe(true);
    expect(planOutputs(gated("default", "unit")).quarantine).toBe(false);
  });
});

describe("run-commands", () => {
  it("runs the plan's JSON array, the whole e2e and one-editor suites without one, and refuses anything else", () => {
    expect(parseCommands('["a b","c"]')).toEqual(["a b", "c"]);
    expect(parseCommands("[]")).toEqual([]);
    expect(parseCommands("  ")).toEqual(DEFAULT_COMMANDS);
    expect(() => parseCommands('{"a":1}')).toThrow("JSON array");
  });

  it("splits the e2e specs across a matrix's parts and runs the other commands in part 1 only", () => {
    const plan = ["npx playwright test --project=e2e tests/e2e/a.spec.ts", "npx playwright test --project=one-editor", "node tools/qa/overflow.mjs"];
    expect(shardCommands(plan, "1/3")).toEqual(["npx playwright test --project=e2e tests/e2e/a.spec.ts --shard=1/3", "npx playwright test --project=one-editor", "node tools/qa/overflow.mjs"]);
    expect(shardCommands(plan, "3/3")).toEqual(["npx playwright test --project=e2e tests/e2e/a.spec.ts --shard=3/3"]);
    expect(shardCommands(DEFAULT_COMMANDS, "2/3")).toEqual(["npm run test:e2e -- --shard=2/3"]);
    expect(shardCommands(plan, "")).toEqual(plan);
    // a project whose name starts like e2e's is not split
    expect(shardCommands(["npx playwright test --project=e2e-perf"], "2/2")).toEqual([]);
    expect(() => shardCommands(plan, "4/3")).toThrow("i/n");
  });
});

describe("release gate retries", () => {
  const flaky = (failures) => {
    let calls = 0;
    return { fn: () => { if (++calls <= failures) throw new Error("HTTP 502"); return "ok"; }, calls: () => calls };
  };

  it("passes after two transient errors, sleeping the backoff between tries", () => {
    const slept = [];
    const call = flaky(2);
    expect(retried(call.fn, [2000, 5000], (ms) => slept.push(ms))).toBe("ok");
    expect(slept).toEqual([2000, 5000]);
  });

  it("throws the last error once the tries are used up (the gate then exits 1)", () => {
    const call = flaky(9);
    expect(() => retried(call.fn, [1, 1], () => {})).toThrow("HTTP 502");
    expect(call.calls()).toBe(3);
  });
});

describe("actionlint pin", () => {
  it("pins linux and windows x64 with an asset id and a SHA-256 each", () => {
    for (const platform of ["linux", "win32"]) {
      expect(assetFor(platform, "x64").sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(assetFor(platform, "x64").id).toBeGreaterThan(0);
    }
    expect(assetFor("darwin", "arm64")).toBeNull();
  });
});

describe("actionlint download retries", () => {
  const replies = (...steps) => {
    let calls = 0;
    const fn = async () => {
      const step = steps[Math.min(calls++, steps.length - 1)];
      if (step instanceof Error) throw step;
      return { ok: step === 200, status: step };
    };
    return { fn, calls: () => calls };
  };

  it("retries a 504 and a network error with the backoff, then returns the download", async () => {
    const slept = [];
    const net = replies(504, new Error("fetch failed"), 200);
    const response = await fetchRetried("u", {}, [5, 15, 30], net.fn, async (ms) => slept.push(ms));
    expect(response.status).toBe(200);
    expect(slept).toEqual([5, 15]);
  });

  it("throws a 404 at once, and the last 5xx once the tries are used up", async () => {
    const missing = replies(404);
    await expect(fetchRetried("u", {}, [1, 1], missing.fn, async () => {})).rejects.toThrow("download failed: 404");
    expect(missing.calls()).toBe(1);
    const down = replies(504);
    await expect(fetchRetried("u", {}, [1, 1], down.fn, async () => {})).rejects.toThrow("download failed: 504");
    expect(down.calls()).toBe(3);
  });
});

describe("actionlint download sources", () => {
  const asset = assetFor("linux", "x64");

  it("tries the API asset route first, with the token when there is one, then the github.com link", () => {
    const [api, web] = sourcesFor(asset, "t0k");
    expect(api.url).toBe(`https://api.github.com/repos/rhysd/actionlint/releases/assets/${asset.id}`);
    expect(api.init.headers).toEqual({ Accept: "application/octet-stream", Authorization: "Bearer t0k" });
    expect(web.url).toContain(`/releases/download/`);
    expect(sourcesFor(asset, "")[0].init.headers.Authorization).toBeUndefined();
  });

  it("falls back to the next source when one fails, and throws the last error when all do", async () => {
    const tried = [];
    const firstDown = async (url) => { tried.push(url); if (tried.length === 1) throw new Error("download failed: 504"); return { url }; };
    expect(await downloadFirst([{ url: "a" }, { url: "b" }], firstDown)).toEqual({ url: "b" });
    expect(tried).toEqual(["a", "b"]);
    const allDown = async (url) => { throw new Error(`down ${url}`); };
    await expect(downloadFirst([{ url: "a" }, { url: "b" }], allDown)).rejects.toThrow("down b");
  });
});
