import { describe, expect, it } from "vitest";
import { KEPT, stale } from "../../tools/linux/prune.mjs";
import { innerScript, sh } from "../../tools/remote-linux.mjs";

describe("remote-linux prune", () => {
  it("removes files the checkout no longer sends", () => {
    expect(stale(["src/a.ts", "src/gone.ts", "package.json"], ["src/a.ts", "package.json"])).toEqual(["src/gone.ts"]);
  });

  it("never removes what the runs build or keep", () => {
    const kept = KEPT.map((k) => `${k}/x`);
    expect(stale([...kept, "node_modules"], [])).toEqual([]);
  });

  it("does not treat a lookalike folder as kept", () => {
    expect(stale(["distribution/a.txt", "src-tauri/targets/b"], [])).toEqual(["distribution/a.txt", "src-tauri/targets/b"]);
  });
});

describe("remote-linux container script", () => {
  it("quotes any word for the shell", () => {
    expect(sh("it's; rm -rf /")).toBe(`'it'\\''s; rm -rf /'`);
  });

  it("runs both CI suites by default and fails on either", () => {
    const s = innerScript([]);
    expect(s).toContain("--project=e2e");
    expect(s).toContain("--project=one-editor");
    expect(s).toMatch(/exit \$\(\( a > b \? a : b \)\)/);
  });

  it("passes given args through quoted, and builds before testing", () => {
    const s = innerScript(["tests/e2e/x.spec.ts", "--grep", "a b"]);
    expect(s).toContain("npx playwright test 'tests/e2e/x.spec.ts' '--grep' 'a b'");
    expect(s.indexOf("npm run --silent build")).toBeLessThan(s.indexOf("playwright test"));
    expect(s.indexOf("cargo build")).toBeLessThan(s.indexOf("playwright test"));
  });
});
