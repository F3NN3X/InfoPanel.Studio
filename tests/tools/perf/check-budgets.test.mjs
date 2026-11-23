import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { breaches, budgets, check, idleWarnings, measurePacks, packBreaches, packCheck } from "../../../tools/perf/check-budgets.mjs";

// Bands as budgets.json sets them from a measured base of 1000 (kiosk +15 % / +40 %) and 2000 (studio +20 % / +50 %).
const b = { kioskEntryGzipBytes: { warn: 1150, fail: 1400 }, studioEntryGzipBytes: { warn: 2400, fail: 3000 }, kioskServerRendererAllowed: false };
const result = (kiosk, studio, extra = {}) => ({ entries: { kiosk: { jsGzip: kiosk, serverRenderer: false, ...extra }, studio: { jsGzip: studio } } });

describe("check-budgets", () => {
  it("passes an entry at or under its warn line with no warning", () => {
    expect(check(result(1150, 2400), b)).toEqual({ warnings: [], breaches: [] });
  });

  it("warns, and still passes, a +20 % kiosk change", () => {
    expect(check(result(1200, 2000), b)).toEqual({ warnings: ["kiosk entry 1200 B gzip > warn 1150 (fail at 1400)"], breaches: [] });
  });

  it("fails a +45 % kiosk change and a studio entry over its fail line", () => {
    expect(check(result(1450, 3001), b)).toEqual({ warnings: [], breaches: ["kiosk entry 1450 B gzip > fail 1400", "studio entry 3001 B gzip > fail 3000"] });
  });

  it("fails closed on a missing or malformed band", () => {
    const bad = { kioskEntryGzipBytes: 1000, studioEntryGzipBytes: { warn: 3000, fail: 2000 } };
    expect(breaches(result(1, 1), bad)).toEqual([
      "kiosk entry has no { warn, fail } band in budgets.json (kioskEntryGzipBytes)",
      "studio entry has no { warn, fail } band in budgets.json (studioEntryGzipBytes)",
    ]);
  });

  it("keeps the shipped bands well formed", () => {
    expect(breaches(result(1, 1), budgets)).toEqual([]);
  });

  it("still refuses the server renderer in the kiosk whatever the size", () => {
    expect(breaches(result(10, 10, { serverRenderer: true }), b)).toEqual(["react-dom/server code is in the kiosk closure"]);
  });
});

describe("packBreaches", () => {
  const packs = { packCeilingBytes: 1000, tiny: { codeGzipBytes: 100, assetBytes: 200, layersPerPage: 3 } };
  const bp = { ...b, packs };

  it("passes a pack inside its code and asset lines", () => {
    expect(packCheck({ tiny: { codeGzip: 100, assetBytes: 200 } }, bp)).toEqual({ warnings: [], breaches: [] });
    expect(packCheck({}, bp)).toEqual({ warnings: [], breaches: [] });
  });

  it("warns, and still passes, a pack over its code or asset line (Phase 4: those are warn lines)", () => {
    expect(packCheck({ tiny: { codeGzip: 101, assetBytes: 201 } }, bp)).toEqual({ warnings: ["pack tiny code 101 B gzip > warn 100", "pack tiny assets 201 B > warn 200"], breaches: [] });
  });

  it("fails a pack over the ceiling, which is the fail line, however its own lines read", () => {
    const big = { packCeilingBytes: 250, tiny: { codeGzipBytes: 100, assetBytes: 200, layersPerPage: 3 } };
    expect(packCheck({ tiny: { codeGzip: 100, assetBytes: 200 } }, { packs: big })).toEqual({ warnings: [], breaches: ["pack tiny is 300 B, over the 250 B ceiling"] });
    expect(packBreaches({ tiny: { codeGzip: 900, assetBytes: 900 } }, bp)).toEqual(["pack tiny is 1800 B, over the 1000 B ceiling"]);
  });

  it("warns for a pack without an entry or an inherited name, with its measured bytes, but still fails it over the ceiling", () => {
    expect(packCheck({ other: { codeGzip: 1, assetBytes: 0 }, constructor: { codeGzip: 1, assetBytes: 0 } }, bp)).toEqual({
      warnings: ["pack other has no entry in budgets.json packs (measured 1 B gzip code, 0 B assets)", "pack constructor has no entry in budgets.json packs (measured 1 B gzip code, 0 B assets)"],
      breaches: [],
    });
    expect(packBreaches({ other: { codeGzip: 600, assetBytes: 600 } }, bp)).toEqual(["pack other is 1200 B, over the 1000 B ceiling"]);
  });

  it("fails closed with no ceiling in budgets.json", () => {
    expect(packBreaches({}, { packs: {} })).toEqual(["budgets.json packs has no packCeilingBytes"]);
  });

  it("keeps the shipped pack lines under the ceiling, which is the user-pack import cap", () => {
    expect(budgets.packs.packCeilingBytes).toBe(1_024_000);
    for (const [id, p] of Object.entries(budgets.packs)) if (typeof p === "object") expect(p.codeGzipBytes + p.assetBytes, id).toBeLessThan(budgets.packs.packCeilingBytes);
  });

  it("measures only the built-in packs (an unbuilt tree measures none)", () => {
    expect(Object.keys(measurePacks()).filter((id) => !["field-kit", "tape-86", "term", "neon-stripe", "overdrive", "swiss-mono", "holo", "night-glow", "paper", "classy-black", "liquid-glass", "black-and-gold", "cyberspec"].includes(id))).toEqual([]);
  });

  it("fails a pack with no chunk of its own, no layersPerPage, or too many layers", () => {
    expect(packBreaches({ tiny: { chunks: 0, codeGzip: 0, assetBytes: 0 } }, bp)).toEqual(["pack tiny has no chunk of its own in the build"]);
    expect(packBreaches({ tiny: { chunks: 2, codeGzip: 1, assetBytes: 0, layers: 4 } }, bp)).toEqual(["pack tiny has 4 compositing layers per page > 3"]);
    const bare = { packs: { packCeilingBytes: 1000, tiny: { codeGzipBytes: 100, assetBytes: 200 } } };
    expect(packBreaches({ tiny: { chunks: 1, codeGzip: 1, assetBytes: 0 } }, bare)).toEqual(["pack tiny has no layersPerPage in budgets.json packs"]);
  });

  it("finds a pack's chunks through the manifest, not the file name, and leaves out what an entry carries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "packs-"));
    try {
      const dist = path.join(root, "dist");
      fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
      fs.mkdirSync(path.join(dist, ".vite"));
      fs.mkdirSync(path.join(root, "src/looks/packs/alpha"), { recursive: true });
      fs.mkdirSync(path.join(root, "src/looks/packs/ghost"), { recursive: true });
      for (const f of ["src/looks/packs/alpha.ts", "src/looks/packs/ghost.ts"]) fs.writeFileSync(path.join(root, f), "");
      fs.mkdirSync(path.join(root, "src/looks/packs/alpha/assets"));
      fs.writeFileSync(path.join(root, "src/looks/packs/alpha/assets/a.png"), "12345");
      for (const f of ["entry.js", "shared.js", "x1.js", "x2.js", "x.css"]) fs.writeFileSync(path.join(dist, "assets", f), f.repeat(50));
      fs.writeFileSync(
        path.join(dist, ".vite/manifest.json"),
        JSON.stringify({
          "index.html": { file: "assets/entry.js", isEntry: true, imports: ["shared", "src/looks/packs/ghost.ts"] },
          shared: { file: "assets/shared.js" },
          "src/looks/packs/alpha.ts": { file: "assets/x1.js", imports: ["shared", "dep"], css: ["assets/x.css"] },
          dep: { file: "assets/x2.js" },
          "src/looks/packs/ghost.ts": { file: "assets/shared.js" },
        })
      );
      const m = measurePacks(dist, root);
      expect(m.alpha.chunks).toBe(3);
      expect(m.alpha.assetBytes).toBe(5);
      expect(m.alpha.codeGzip).toBeGreaterThan(0);
      // "ghost" is statically imported by the page entry: it has no chunk of its own, and the check fails it
      expect(m.ghost.chunks).toBe(0);
      expect(packBreaches(m, { packs: { packCeilingBytes: 1e6, alpha: { codeGzipBytes: 1e6, assetBytes: 10, layersPerPage: 3 }, ghost: { codeGzipBytes: 1, assetBytes: 0, layersPerPage: 3 } } })).toEqual(["pack ghost has no chunk of its own in the build"]);
      expect(measurePacks(path.join(root, "nowhere"), root).alpha.chunks).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("idleWarnings", () => {
  const run = (task, heap) => ({ cases: { heavy: { TaskDurationMsPerS: { median: task }, jsHeapUsedMB: { median: heap } } } });
  const lines = { kioskIdleWarn: { taskMsPerS: 100, jsHeapMB: 24 } };

  it("is quiet under both lines, and only ever warns", () => {
    expect(idleWarnings(run(65, 17.7), lines)).toEqual([]);
    expect(idleWarnings(run(101, 25), lines)).toEqual(["heavy kiosk idles at 101 ms/s of task time > warn 100", "heavy kiosk holds 25 MB of JS heap > warn 24"]);
  });

  it("says so when the result has no heavy case", () => {
    expect(idleWarnings({ cases: {} }, lines)).toEqual(["the perf result has no heavy kiosk case to compare"]);
  });

  it("ships the Gate 0 lines", () => {
    expect(budgets.kioskIdleWarn).toMatchObject({ taskMsPerS: 100, jsHeapMB: 24 });
  });
});
