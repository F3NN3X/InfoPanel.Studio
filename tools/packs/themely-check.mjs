// What themely.dev runs on a pack submitted for review (_docs/look-system/pack-scripts-and-signing.md §4), as a JSON report:
//   node tools/packs/themely-check.mjs <pack-folder> --spdx <licence> [--credits <credits.json>] [--render [--out <dir>]] [--json <report.json>]
// 1. the validator (src/looks/pack-validate.ts, user mode, as the app runs it);
// 2. with --render (needs `npm run build` and the debug ips-server, like tools/qa/overflow.mjs): the pack stored in a scratch server
//    through its own routes, worn on the Widget QA page at 1x1, 2x2, 4x2 and 4x4, and a kiosk shot at every FX level (Full, Calm,
//    Off) into --out; the studio's measured render check still runs when a user imports the pack;
// 3. the script's static analysis: its source required (minified-only refused), 64 KB at most, no eval, Function, import(),
//    `with`, module syntax or constructor reach, no global but `fx` and plain JavaScript built-ins, and what each frame loops
//    over and allocates. Parsed with rolldown's ESTree parser (`rolldown/parseAst`, oxc), already installed with Vite;
// 4. the throttled perf run, once the pack-script sandbox is in the build (skipped with a note until then);
// 5. licences and credits: an SPDX licence for the submission, each font's OFL licence, copyright and source, and a credit for
//    every image (`credits.json`: `{ "assets/sky.png": "Photo: …, CC0" }`); and a person's review, always (G5: names, logos and
//    look-alike art, the more so for a pack with a script).
// The report passes when no step has an error. A pass is what a reviewer countersigns (tools/packs/sign.mjs --countersign); this
// tool signs nothing.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadValidator, readPackDir } from "../validate-pack.mjs";
import { manifestBytes, manifestOf } from "./sign.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Raised when what a check means changes: it goes into the countersigned statement. */
export const CHECKS_VERSION = 1;
export const SCRIPT_MAX_BYTES = 64 * 1024;
export const SPANS = ["1x1", "2x2", "4x2", "4x4"];
export const FX_LEVELS = ["full", "calm", "off"];

/** The globals a script may use: the sandbox's `fx` and JavaScript's own built-ins that reach nothing outside the script. */
export const GLOBALS = new Set([
  "fx", "Math", "Number", "String", "Boolean", "Array", "Object", "JSON", "Infinity", "NaN", "undefined", "isFinite", "isNaN", "parseFloat", "parseInt",
  "Map", "Set", "WeakMap", "WeakSet", "Symbol", "Error", "TypeError", "RangeError", "Float32Array", "Float64Array", "Int8Array", "Int16Array",
  "Int32Array", "Uint8Array", "Uint8ClampedArray", "Uint16Array", "Uint32Array", "arguments",
]);
const REFUSED_NAMES = new Set(["eval", "Function"]);
const LOOPS = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const ALLOCATIONS = new Set(["NewExpression", "ArrayExpression", "ObjectExpression", "ArrowFunctionExpression", "FunctionExpression"]);

const issue = (severity, rule, message) => ({ severity, rule, message });

/** Each child node of an ESTree node, with the key it sits under. */
function* children(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) for (const v of value) if (v && typeof v.type === "string") yield [key, v];
    if (value && typeof value.type === "string") yield [key, value];
  }
}

/** Every name a pattern binds (`a`, `{ a, b: [c] }`, `...d`, `e = 1`). */
function bound(pattern, out) {
  if (!pattern) return out;
  if (pattern.type === "Identifier") out.add(pattern.name);
  else if (pattern.type === "ObjectPattern") for (const p of pattern.properties) bound(p.type === "RestElement" ? p.argument : p.value, out);
  else if (pattern.type === "ArrayPattern") for (const p of pattern.elements) bound(p, out);
  else if (pattern.type === "RestElement") bound(pattern.argument, out);
  else if (pattern.type === "AssignmentPattern") bound(pattern.left, out);
  return out;
}

/** Whether `fx.onFrame(…)` is this call. */
const isOnFrame = (node) => node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "fx" && !node.callee.computed && node.callee.property.name === "onFrame";

/** The static analysis of a pack's script (§4.3): its issues, and what the frame callbacks loop over and allocate. */
export async function analyseScript(source) {
  const issues = [];
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > SCRIPT_MAX_BYTES) issues.push(issue("error", "script-size", `the script is ${bytes} bytes, over ${SCRIPT_MAX_BYTES}`));
  const lines = source.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  if (source.length > 2000 && (longest > 500 || source.length / lines.length > 200)) issues.push(issue("error", "script-minified", "the script reads as minified: submit its readable source"));
  const { parseAst } = await import("rolldown/parseAst");
  let program;
  try {
    program = parseAst(source, { sourceType: "script" });
  } catch (e) {
    issues.push(issue("error", "script-parse", `the script does not parse: ${String(e?.message ?? e).split("\n")[0]}`));
    return { issues, perFrame: { loops: 0, allocations: 0 } };
  }
  const declared = new Set();
  const refs = [];
  const perFrame = { loops: 0, allocations: 0 };
  const walk = (node, parent, key, inFrame) => {
    switch (node.type) {
      case "VariableDeclarator":
        bound(node.id, declared);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.id) declared.add(node.id.name);
        for (const p of node.params) bound(p, declared);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) declared.add(node.id.name);
        break;
      case "CatchClause":
        bound(node.param, declared);
        break;
      case "WithStatement":
        issues.push(issue("error", "script-with", "the script uses `with`"));
        break;
      case "ImportExpression":
        issues.push(issue("error", "script-import", "the script uses import()"));
        break;
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportAllDeclaration":
        issues.push(issue("error", "script-module", "the script uses module syntax: it is one plain script"));
        break;
      case "MetaProperty":
        issues.push(issue("error", "script-meta", `the script uses ${node.meta.name}.${node.property.name}`));
        return;
      case "MemberExpression":
        if (!node.computed && node.property.name === "constructor") issues.push(issue("error", "script-constructor", "the script reaches a constructor (`.constructor`), a way to Function"));
        if (node.computed && node.property.type === "Literal" && node.property.value === "constructor") issues.push(issue("error", "script-constructor", "the script reaches a constructor (`[\"constructor\"]`), a way to Function"));
        break;
      case "Identifier": {
        const label = parent && (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement");
        const property = parent && key === "property" && parent.type === "MemberExpression" && !parent.computed;
        const name = parent && key === "key" && !parent.computed && ["Property", "MethodDefinition", "PropertyDefinition"].includes(parent.type) && !(parent.shorthand && parent.value === node);
        if (!label && !property && !name) refs.push(node.name);
        return;
      }
    }
    // the callback handed to fx.onFrame is made once, not each frame
    const callback = parent && isOnFrame(parent) && key === "arguments";
    if (inFrame && LOOPS.has(node.type)) perFrame.loops += 1;
    if (inFrame && !callback && ALLOCATIONS.has(node.type)) perFrame.allocations += 1;
    const frame = inFrame || isOnFrame(node);
    for (const [k, child] of children(node)) walk(child, node, k, frame && !(isOnFrame(node) && k === "callee"));
  };
  walk(program, undefined, undefined, false);
  for (const name of new Set(refs)) {
    if (REFUSED_NAMES.has(name)) issues.push(issue("error", "script-eval", `the script uses ${name}`));
    else if (!declared.has(name) && !GLOBALS.has(name)) issues.push(issue("error", "script-global", `the script uses the global ${name}: only fx and plain JavaScript built-ins are there`));
  }
  if (perFrame.loops) issues.push(issue("info", "script-frame-loops", `each frame runs ${perFrame.loops} loop${perFrame.loops === 1 ? "" : "s"}`));
  if (perFrame.allocations) issues.push(issue("info", "script-frame-allocations", `each frame allocates in ${perFrame.allocations} place${perFrame.allocations === 1 ? "" : "s"}: reuse what you can`));
  return { issues, perFrame };
}

/** An SPDX licence expression's shape: ids joined by AND, OR or WITH. */
const SPDX = /^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/;
const IMAGE = /^(assets\/.+\.(png|jpg|webp|gif|svg)|thumb\.(png|jpg|webp))$/;

/** The licence and credit issues (§4.7): the submission's SPDX licence, the fonts' OFL, copyright and source, a credit per image. */
export function licenceIssues(pack, paths, { spdx, credits = {} } = {}) {
  const issues = [];
  if (!spdx) issues.push(issue("error", "spdx", "give the pack's licence as an SPDX expression (--spdx)"));
  else if (!SPDX.test(spdx)) issues.push(issue("error", "spdx", `${spdx} is not an SPDX licence expression`));
  for (const f of pack?.fonts ?? []) {
    if (!/\bOFL\b|OFL-1\.1/i.test(f.licence ?? "")) issues.push(issue("error", "font-licence", `${f.file}: the licence is not the SIL Open Font License 1.1`));
    if (!f.copyright?.trim()) issues.push(issue("error", "font-copyright", `${f.file}: no copyright line`));
    if (!f.source?.trim()) issues.push(issue("warn", "font-source", `${f.file}: say where the font comes from (source)`));
  }
  for (const path of paths.filter((p) => IMAGE.test(p))) {
    if (typeof credits[path] !== "string" || !credits[path].trim()) issues.push(issue("error", "image-provenance", `${path}: give its source and licence in credits.json`));
  }
  return issues;
}

/** The pack's script path (`script.file` in pack.json, an asset), when it names one. */
const scriptPath = (pack) => (typeof pack?.script?.file === "string" ? `assets/${pack.script.file}` : undefined);

/** The perf run's place in the report: run by the sandbox's own harness once it is in the build. */
function perfStep(hasScript) {
  if (!hasScript) return { status: "not-needed", note: "the pack has no script" };
  if (!existsSync(join(root, "src/looks/pack-script"))) return { status: "skipped", note: "the pack-script sandbox is not in this build: the throttled perf run (4x and 6x CPU, 60 s, fixture signals) waits for it" };
  return { status: "skipped", note: "the sandbox is in this build, but its throttled perf harness is not wired into this tool yet" };
}

/** The hash the server's signing route checks (`content_hash`, pack_sign.rs): each file in path order, `<path>\0<length>\0<bytes>`. */
function packContentHash(files) {
  const hash = createHash("sha256");
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) hash.update(`${f.path}\0${f.bytes.length}\0`).update(f.bytes);
  return hash.digest("hex");
}

/** Stores the pack in a scratch server, wears it on Widget QA at each span and on a kiosk at each FX level, and writes the shots. */
async function renderStep(src, out) {
  const { chromium } = await import("@playwright/test");
  const { startScratch } = await import("../perf/scratch.mjs");
  const id = src.pack.id;
  const write = { "Content-Type": "application/json", "X-Dashboard-Pack": "1" };
  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  const scratch = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
  const browser = await chromium.launch({ headless: true });
  const issues = [];
  const shots = [];
  try {
    const css = src.files.find((f) => f.path === "pack.css")?.bytes;
    const files = src.files.filter((f) => f.path !== "pack.css").map((f) => ({ path: f.path, data: b64(f.bytes) }));
    const sha256 = (b) => createHash("sha256").update(b).digest("hex");
    const stored = await fetch(`${scratch.base}/api/packs`, { method: "POST", headers: write, body: JSON.stringify({ id, files, ...(css ? { css: { size: css.length, sha256: sha256(css) } } : null) }) });
    if (!stored.ok) return { status: "failed", issues: [issue("error", "render-store", `the server refused the pack: ${await stored.text()}`)], shots };
    if (css) {
      const signed = await fetch(`${scratch.base}/api/packs/${id}/sign`, { method: "POST", headers: write, body: JSON.stringify({ css: b64(css), hash: packContentHash(src.files) }) });
      if (!signed.ok) return { status: "failed", issues: [issue("error", "render-store", `the server would not take the CSS: ${await signed.text()}`)], shots };
    }
    mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, timezoneId: "UTC", locale: "en-US" });
    await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
    await page.goto(`${scratch.base}/?widget-qa&spans=${SPANS.join(",")}&eager=1&settings=${encodeURIComponent(JSON.stringify({ lookId: id }))}`);
    await page.waitForFunction(() => window.__qaMountAll && window.__qaOverflow, null, { timeout: 30_000 });
    if (!(await page.evaluate(() => window.__qaMountAll()))) issues.push(issue("error", "render-settle", "the Widget QA page did not settle"));
    if (!(await page.evaluate((look) => !!document.querySelector(`[data-wp-tier][data-look="${look}"]`), id))) issues.push(issue("error", "render-worn", "no card wore the pack: it did not load"));
    const overflow = await page.evaluate(() => window.__qaOverflow());
    for (const frame of overflow) for (const x of frame.issues) issues.push(issue("warn", "render-overflow", `${frame.module} at ${frame.span}: ${x.kind} ${x.selector}`));
    const qa = join(out, "widget-qa.png");
    await page.screenshot({ path: qa, fullPage: true });
    shots.push(qa);
    const config = await (await fetch(`${scratch.base}/api/config`)).json();
    for (const fx of FX_LEVELS) {
      const profile = config.profiles[0];
      const next = { ...config, profiles: config.profiles.map((p) => (p.id === profile.id ? { ...p, performance: { ...p.performance, fx }, widgetTheme: { ...p.widgetTheme, values: { ...p.widgetTheme?.values, lookId: id } } } : p)) };
      const saved = await fetch(`${scratch.base}/api/config`, { method: "POST", headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" }, body: JSON.stringify(next) });
      if (!saved.ok) {
        issues.push(issue("error", "render-config", `the scratch config was refused at ${fx}`));
        continue;
      }
      const kiosk = await browser.newPage({ viewport: { width: 1024, height: 600 } });
      await kiosk.goto(`${scratch.base}/?kiosk=1&profile=${profile.id}`);
      await kiosk.waitForSelector(`[data-wp-tier][data-look="${id}"]`, { timeout: 15_000 }).catch(() => issues.push(issue("error", "render-worn", `the kiosk at ${fx} did not wear the pack`)));
      await kiosk.waitForTimeout(1500);
      const shot = join(out, `kiosk-${fx}.png`);
      await kiosk.screenshot({ path: shot });
      shots.push(shot);
      await kiosk.close();
    }
  } finally {
    await browser.close();
    scratch.stop();
  }
  return { status: issues.some((i) => i.severity === "error") ? "failed" : "passed", spans: SPANS, fx: FX_LEVELS, issues, shots };
}

/** Runs the checks on the pack in `dir`; `options`: `{ spdx, credits, render, out }`. */
export async function checkPack(dir, options = {}) {
  const src = readPackDir(dir);
  const { validatePack } = await loadValidator();
  const validator = validatePack(src, { source: "user" }).map((i) => ({ severity: i.severity, rule: i.rule, file: i.file, message: i.message }));
  const id = src.pack?.id ?? "";
  const version = src.pack?.version ?? "";
  const manifest = manifestBytes(manifestOf(id, version, src.files));
  const path = scriptPath(src.pack);
  const file = path && src.files.find((f) => f.path === path);
  let script = null;
  if (path && !file) script = { path, issues: [issue("error", "script-source", `${path} is not in the pack`)], perFrame: { loops: 0, allocations: 0 } };
  else if (file) script = { path, ...(await analyseScript(Buffer.from(file.bytes).toString("utf8"))) };
  const licences = licenceIssues(src.pack, src.files.map((f) => f.path), options);
  const render = options.render ? await renderStep(src, options.out ?? join(dir, ".themely-check")) : { status: "skipped", note: "pass --render (needs npm run build and the debug ips-server)" };
  const review = { required: true, reasons: ["a person reviews these exact files before Themely countersigns them", ...(script ? ["the pack has a script: names, logos and look-alike art get the G5 review"] : [])] };
  const errors = [...validator, ...(script?.issues ?? []), ...licences, ...(render.issues ?? [])].filter((i) => i.severity === "error");
  return {
    tool: "themely-check",
    checksVersion: CHECKS_VERSION,
    pack: { id, version, manifestSha256: createHash("sha256").update(manifest).digest("hex") },
    validator,
    script,
    licences,
    render,
    perf: perfStep(!!script),
    review,
    passed: errors.length === 0,
  };
}

async function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const valued = new Set(["--spdx", "--credits", "--out", "--json"]);
  const dir = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
  if (!dir) {
    console.error("usage: node tools/packs/themely-check.mjs <pack-folder> --spdx <licence> [--credits <credits.json>] [--render [--out <dir>]] [--json <report.json>]");
    return 2;
  }
  const credits = flag("--credits") ? JSON.parse(readFileSync(flag("--credits"), "utf8")) : {};
  const report = await checkPack(dir, { spdx: flag("--spdx"), credits, render: args.includes("--render"), out: flag("--out") });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (flag("--json")) writeFileSync(flag("--json"), text);
  else process.stdout.write(text);
  return report.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    },
  );
}
