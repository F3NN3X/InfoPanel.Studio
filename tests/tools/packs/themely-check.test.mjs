// What themely.dev runs on a submitted pack (tools/packs/themely-check.mjs): the script's static analysis refuses what a sandboxed
// effect never needs, the licence and credit checks, and the report a reviewer reads. The render step needs a build and a browser
// and is not run here.
import crypto from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyseScript, checkPack, licenceIssues, perfRun, SCRIPT_MAX_BYTES } from "../../../tools/packs/themely-check.mjs";
import { manifestBytes, manifestOf } from "../../../tools/packs/sign.mjs";
import { readPackDir } from "../../../tools/validate-pack.mjs";

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const errors = (issues) => issues.filter((i) => i.severity === "error").map((i) => i.rule);

describe("the script's static analysis", () => {
  it("passes a plain effect and reports what each frame loops over and allocates", async () => {
    const { issues, perFrame } = await analyseScript(`
      const dots = [];
      for (let i = 0; i < 20; i++) dots.push({ x: fx.rand(), y: fx.rand() });
      fx.onFrame(({ t }) => {
        const out = [];
        for (const d of dots) out.push({ kind: "arc", x: d.x, y: (d.y + t / 1000) % 1, r: 0.01 });
        fx.draw(out);
      });
    `);
    expect(errors(issues)).toEqual([]);
    expect(perFrame).toEqual({ loops: 1, allocations: 2 });
    expect(issues.map((i) => i.rule)).toEqual(["script-frame-loops", "script-frame-allocations"]);
  });

  it("refuses eval, Function, import(), with, module syntax, a constructor's reach and any global outside fx", async () => {
    const cases = {
      "eval('1')": "script-eval",
      "new Function('return 1')": "script-eval",
      "import('./x.js')": "script-import",
      "with (fx) { draw([]) }": "script-with",
      "export const a = 1": "script-parse",
      "(() => {}).constructor('return this')()": "script-constructor",
      "[]['constructor']": "script-constructor",
      "fetch('https://x')": "script-global",
      "globalThis.x = 1": "script-global",
      "new WebSocket('ws://x')": "script-global",
      "setTimeout(() => {}, 1)": "script-global",
      "importScripts('x')": "script-global",
    };
    for (const [source, rule] of Object.entries(cases)) expect(errors((await analyseScript(source)).issues), source).toContain(rule);
  });

  it("knows a name the script declares from a global, and a property or key from a reference", async () => {
    const { issues } = await analyseScript("function draw(fetch) { const { a, b: [c] } = { a: 1, b: [2] }; return { fetch, window: a + c }.window; }\nlet location = 1; fx.onFrame(() => draw(location));");
    expect(errors(issues)).toEqual([]);
  });

  it("refuses a script over the cap, a minified one and one that does not parse", async () => {
    expect(errors((await analyseScript(`// ${"x".repeat(SCRIPT_MAX_BYTES)}`)).issues)).toContain("script-size");
    expect(errors((await analyseScript(`var a=${"1+".repeat(2000)}1;`)).issues)).toContain("script-minified");
    expect(errors((await analyseScript("fx.onFrame(() => {")).issues)).toEqual(["script-parse"]);
  });
});

describe("licences and credits", () => {
  it("need an SPDX licence, OFL fonts with their copyright, and a credit for every image", () => {
    const pack = { fonts: [{ file: "a.woff2", licence: "OFL-1.1", copyright: "© A", source: "https://a" }, { file: "b.woff2", licence: "MIT", copyright: "© B" }] };
    const paths = ["pack.json", "assets/sky.png", "thumb.png", "assets/a.woff2"];
    const issues = licenceIssues(pack, paths, { spdx: "CC-BY-4.0", credits: { "assets/sky.png": "Photo: me, CC0" } });
    expect(issues.map((i) => `${i.severity} ${i.rule} ${i.message.split(":")[0]}`)).toEqual(["error font-licence b.woff2", "warn font-source b.woff2", "error image-provenance thumb.png"]);
    expect(errors(licenceIssues({ fonts: [] }, [], {}))).toEqual(["spdx"]);
    expect(errors(licenceIssues({ fonts: [] }, [], { spdx: "not a licence!" }))).toEqual(["spdx"]);
    expect(errors(licenceIssues({ fonts: [] }, [], { spdx: "MIT OR Apache-2.0" }))).toEqual([]);
  });
});

/** Field Kit as a user's own pack `mine` in a temp folder (no pack.css), as the importer tests make it; `edit` changes pack.json or adds files. */
function userPack(edit = () => {}) {
  const src = readPackDir("src/looks/packs/field-kit", /\.tsx?$/);
  const dir = mkdtempSync(join(tmpdir(), "themely-check-"));
  dirs.push(dir);
  const pack = structuredClone(src.pack);
  const look = structuredClone(src.look);
  pack.id = look.id = "mine";
  pack.fonts = pack.fonts.map((f) => ({ ...f, family: f.family.replace("pack-", "pack-mine-") }));
  for (const k of Object.keys(look.fonts)) look.fonts[k] = look.fonts[k].replace("pack-", "pack-mine-");
  const files = new Map(src.files.filter((f) => f.path !== "pack.css" && f.path !== "pack.json" && f.path !== "look.json").map((f) => [f.path, f.bytes]));
  edit(pack, files);
  pack.assets = [...files].filter(([p]) => p.startsWith("assets/")).map(([p, b]) => ({ file: p.slice(7), bytes: b.length }));
  files.set("pack.json", Buffer.from(JSON.stringify(pack)));
  files.set("look.json", Buffer.from(JSON.stringify(look)));
  for (const [path, bytes] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  return dir;
}

describe("the report", () => {
  it("passes a clean pack with its licence and credits, names the manifest Themely would countersign, and always asks for a person's review", async () => {
    const dir = userPack();
    const src = readPackDir(dir);
    const credits = Object.fromEntries(src.files.filter((f) => /\.(png|jpg|webp|gif|svg)$/.test(f.path)).map((f) => [f.path, "Field Kit, by the app's authors"]));
    const report = await checkPack(dir, { spdx: "CC-BY-4.0", credits });
    expect(errors(report.validator)).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.pack.manifestSha256).toBe(crypto.createHash("sha256").update(manifestBytes(manifestOf("mine", src.pack.version, src.files))).digest("hex"));
    expect(report.script).toBeNull();
    expect(report.perf.status).toBe("not-needed");
    expect(report.render.status).toBe("skipped");
    expect(report.review.required).toBe(true);
    expect((await checkPack(dir, {})).passed).toBe(false);
  });

  it("analyses a pack's script and skips the perf run of a script that failed it", async () => {
    const dir = userPack((pack, files) => {
      pack.script = { file: "fx.js" };
      files.set("assets/fx.js", Buffer.from("fx.onFrame(() => fetch('https://x'));"));
    });
    const report = await checkPack(dir, { spdx: "MIT" });
    expect(report.script.path).toBe("assets/fx.js");
    expect(errors(report.script.issues)).toEqual(["script-global"]);
    expect(report.perf.status).toBe("skipped");
    expect(report.review.reasons.some((r) => r.includes("G5"))).toBe(true);
    expect(report.passed).toBe(false);
  });
});

describe("the perf run", () => {
  const demo = readFileSync(new URL("../../fixtures/packs/script/demo.js", import.meta.url), "utf8");

  it("runs the script in the sandbox's guest at Full and Calm and reports time, commands and heap", async () => {
    // a frozen guest clock: the verdict on what the script does, not on how busy the runner is (the cut path runs on the real clock below)
    const report = await perfRun(demo, { seconds: 4, clock: "frozen" });
    expect(report.status).toBe("passed");
    expect(Object.keys(report.levels)).toEqual(["full", "calm"]);
    expect(report.levels.full.frames).toBe(120);
    expect(report.levels.calm.frames).toBe(60);
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    for (const l of Object.values(report.levels)) {
      expect(l).toMatchObject({ faults: 0 });
      expect(typeof l.cutOff).toBe("number");
      expect(l.commandsMax).toBeGreaterThan(0);
      expect(l.heapBytes).toBeGreaterThan(0);
      expect(l.p95Ms6x).toBeCloseTo(l.p95Ms * 6, 2);
    }
  });

  it("also runs each frame's commands through the host's check: the v2 demo (gradients, glow, clip, text boxes, 500 points) is accepted whole, with its cost reported", async () => {
    const v2 = readFileSync(new URL("../../fixtures/packs/script/v2-demo.js", import.meta.url), "utf8");
    const report = await perfRun(v2, { seconds: 4, clock: "frozen" });
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.issues.filter((i) => i.rule === "perf-refused" || i.rule === "perf-cost")).toEqual([]);
    expect(report.levels.full).toMatchObject({ refused: 0, cappedFrames: 0 });
    expect(report.levels.full.costMax).toBeGreaterThan(report.levels.full.commandsMax);
    expect(report.levels.full.checkP95Ms).toBeGreaterThanOrEqual(0);
  });

  // the built-in showcase (src/looks/packs/cyberspec/assets/fx.js) passes the checks a submitted script gets: the analysis and the run
  it("passes Cyberspec's own script, at Full and Calm, under the commands cap, Calm drawing less", async () => {
    const cyberspec = readFileSync(new URL("../../../src/looks/packs/cyberspec/assets/fx.js", import.meta.url), "utf8");
    expect(errors((await analyseScript(cyberspec)).issues)).toEqual([]);
    const report = await perfRun(cyberspec, { seconds: 4, clock: "frozen" });
    expect(report.status).toBe("passed");
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.levels.full).toMatchObject({ faults: 0 });
    expect(report.levels.calm).toMatchObject({ faults: 0 });
    expect(report.levels.full.commandsMax).toBeLessThan(2000);
    expect(report.levels.calm.commandsP95).toBeLessThan(report.levels.full.commandsP95);
  });

  it("fails a script that spends more than a frame's time, and one that does not start", async () => {
    const slow = await perfRun("fx.onFrame(function () { var t = 0; for (var i = 0; i < 1e9; i++) t += i; });", { seconds: 1 });
    expect(slow.status).toBe("failed");
    expect(slow.issues.map((i) => i.rule)).toContain("perf-cut");
    const broken = await perfRun("throw new Error('x');", { seconds: 1 });
    expect(broken.status).toBe("failed");
    expect(broken.issues.map((i) => i.rule)).toEqual(["perf-start"]);
  });
});
