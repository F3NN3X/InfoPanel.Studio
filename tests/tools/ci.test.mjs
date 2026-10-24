import { describe, expect, it } from "vitest";
import { assetFor } from "../../tools/ci/actionlint.mjs";
import { planOutputs } from "../../tools/ci/plan-outputs.mjs";
import { decideRelease } from "../../tools/ci/release-gate.mjs";

const plan = (mode, ...ids) => ({ mode, steps: ids.map((id) => (id.startsWith("-") ? { id: id.slice(1), cmd: null } : { id, cmd: `run ${id}` })) });

describe("plan outputs", () => {
  it("is docs-only when no planned check has a command (a skipped lint is not one)", () => {
    expect(planOutputs(plan("default", "-lint"))).toMatchObject({ docs_only: true, lint: false, unit: false, full: false });
  });

  it("switches on the jobs a widget change needs, e2e pulling in the build", () => {
    const out = planOutputs(plan("default", "lint", "typecheck", "unit", "build", "server-bin", "e2e"));
    expect(out).toMatchObject({ lint: true, typecheck: true, unit: true, build: true, e2e: true, server: false, rust: false, windows: false, docs_only: false });
  });

  it("sends server work to the server job and to windows, and the app crate to the rust job", () => {
    expect(planOutputs(plan("default", "server-suite", "cargo-server"))).toMatchObject({ server: true, windows: true, rust: false });
    expect(planOutputs(plan("default", "typecheck", "cargo-app"))).toMatchObject({ rust: true, windows: true, server: false });
  });

  it("is everything on --all (a push to main, the ci:full label), and `full` follows an escalated plan", () => {
    const all = planOutputs(plan("default", "-lint"), { all: true });
    expect(Object.entries(all).filter(([name, value]) => name !== "docs_only" && !value)).toEqual([]);
    expect(all.docs_only).toBe(false);
    expect(planOutputs(plan("full", "lint", "unit")).full).toBe(true);
  });
});

describe("release gate", () => {
  const sha = "abcdef0123456789";
  const ok = [{ name: "ci-ok", conclusion: "success" }];
  const base = { sha, check: "ci-ok", commitChecks: [], pulls: [], nightlyShas: [] };

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
});

describe("actionlint pin", () => {
  it("pins linux and windows x64 with a SHA-256 each", () => {
    for (const platform of ["linux", "win32"]) expect(assetFor(platform, "x64").sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(assetFor("darwin", "arm64")).toBeNull();
  });
});
