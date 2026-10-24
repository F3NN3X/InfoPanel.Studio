// Parity cases for server/assets.mjs, canvases.mjs, library.mjs and infopanel-local.mjs (tests/fixtures/parity/assets.json,
// canvases.json, library.json, infopanel-local.json): every pure function over the inputs their Vitest files use plus the
// oddities the contract lists. Bytes go in as hex, text as it is; `null` stands for `undefined`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assetPath, declaredType, isSvgText, parseRange, referencedHashes, sniffType, uploadQuotaRefusal, LIMITS, SVG_LIMIT, TYPES } from "../../server/assets.mjs";
import { canvasIdOf, canvasRefusal, canvasWriteRefusal, createCanvasStore, MAX_CANVAS_BYTES, referencedCanvasIds } from "../../server/canvases.mjs";
import { isGuid, isAssetName, profilesFromXml } from "../../server/infopanel-local.mjs";
import { libraryWriteRefusal, normalizeItem, summaryOf } from "../../server/library.mjs";

const undef = (v) => (v === null ? undefined : v);
const bytes = (...parts) => Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));
const ftyp = (major, ...compatible) => bytes([0, 0, 0, 16 + 4 * compatible.length], "ftyp", major, [0, 0, 0, 0], ...compatible, [0, 0, 0, 8], "free");
const typeOf = (t) => (t ? { ...t } : null);

const ASSET = `${"a".repeat(64)}.png`;

export function assetCases() {
  const cases = [];
  const samples = [
    bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR"),
    bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]),
    bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], "JFIF"),
    bytes([0xff, 0xd8]),
    bytes("GIF89a", [1, 0, 1, 0]),
    bytes("GIF87a"),
    bytes("GIF8"),
    bytes("RIFF", [36, 0, 0, 0], "WEBPVP8 "),
    bytes("RIFF", [36, 0, 0, 0], "WAVEfmt "),
    ftyp("avif", "mif1", "miaf"),
    ftyp("mif1", "avif", "miaf"),
    ftyp("mif1", "miaf", "avis"),
    ftyp("isom", "iso2", "avc1", "mp41"),
    ftyp("isom", "avif"),
    ftyp("mp42"),
    ftyp("M4V "),
    ftyp("heic", "mif1", "heic"),
    ftyp("qt  ", "qt  "),
    ftyp("M4A ", "M4A ", "mp42"),
    bytes([0, 0, 0, 200], "ftyp", "isom", [0, 0, 0, 0], "avif"),
    bytes([0, 0, 0, 12], "ftyp", "mif1", [0, 0, 0, 0], "avif"),
    bytes([0, 0, 0, 16], "ftyp", "mif1"),
    bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0x82, 0x84], "webm"),
    bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], "matroska"),
    bytes("BM", [0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 40, 0, 0, 0]),
    bytes("BM", [0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 12, 0, 0, 0]),
    bytes("BM", [0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 13, 0, 0, 0]),
    bytes("BM but not a bitmap"),
    bytes("BM", Buffer.alloc(14), [40, 0, 0]),
    bytes([0, 0, 1, 0, 1, 0, 16, 16]),
    bytes([0, 0, 1, 0, 0, 0, 16, 16]),
    bytes([0, 0, 1, 0, 1]),
    bytes([0, 1, 0, 0, 0, 12]),
    bytes("true", [0, 1]),
    bytes("OTTO", [0, 12]),
    bytes("ttcf", [0, 1, 0, 0]),
    bytes("wOFF", [0, 1, 0, 0]),
    bytes("wOF2", [0, 1, 0, 0]),
    bytes('<?xml version="1.0"?>\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    bytes('<!DOCTYPE svg [ <!ENTITY a "b"> ]><svg/>'),
    bytes("<svg/>"),
    bytes("<SVG/>"),
    bytes("<!doctype html><script>alert(1)</script>"),
    bytes("<html><svg></svg></html>"),
    bytes("<!-- x --><div><svg/></div>"),
    bytes("hello world, not an image at all"),
    bytes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    bytes(`<!--${"x".repeat(1100)}--><svg/>`),
    bytes(`<svg>${"x".repeat(1100)}`),
    Buffer.alloc(0),
  ];
  for (const buf of samples) cases.push({ input: { fn: "sniffType", hex: buf.toString("hex") }, output: typeOf(sniffType(buf)) });

  const texts = [
    String.fromCharCode(0xfeff) + '  <?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><!-- c --><svg viewBox="0 0 1 1"/>',
    "<svgx>", "text <svg>", "<!-- unfinished <svg>", "<html><svg/></html>", "<svg>", "<svg", "<svg/", "<svg\n", "<svg\u00a0x>", "<SVG>",
    "<?xml?><svg/>", "<?>", "<?x ?><svg/>", "<!---->< svg>", "<!-->-->\n<svg/>", "<!DOCTYPE svg><svg/>", "<!doctype\tsvg><svg/>", "<!DOCTYPEsvg><svg/>",
    "<!DOCTYPE svg [<!ENTITY x \"]\">]><svg/>", "<!DOCTYPE svg [ ]  >\n<svg/>", "<!DOCTYPE svg [ ] x><svg/>", "<!DOCTYPE svg [ <a> ]>  <svg/>",
    "<!DOCTYPE svg [ <a> ] > [ ] ><svg/>", "<!DOCTYPE svg ><!DOCTYPE svg ><svg/>", "<!DOCTYPE svg", "<!DOCTYPE ", "\ufeff\ufeff<svg/>", "", "  ",
    "\u2028<svg/>", "<?a?><?b?>\n\n<!--c--> <svg x/>", "<?a ?>?><svg/>",
  ];
  for (const text of texts) cases.push({ input: { fn: "isSvgText", text }, output: isSvgText(text) });

  const types = [null, "", "image/png", "Video/MP4; codecs=avc1", "  image/PNG  ;x", "video/x-matroska", "video/matroska", "image/svg+xml", "application/x-font-ttf", "font/woff2", "application/font-woff", "font/sfnt", "application/vnd.ms-opentype", "image/x-ms-bmp", "image/vnd.microsoft.icon", "image/x-icon", "text/html", "application/octet-stream", "image/jpg", "image/jpeg", "font/collection", ";image/png", "image/png;"];
  for (const header of types) cases.push({ input: { fn: "declaredType", header }, output: typeOf(declaredType(undef(header))) });
  for (const ext of ["png", "svg", "mp4", "webm", "ttf", "woff2"]) cases.push({ input: { fn: "limitOf", ext }, output: TYPES[ext].limit ?? LIMITS[TYPES[ext].kind] });
  cases.push({ input: { fn: "svgLimit" }, output: SVG_LIMIT });

  const ids = [ASSET, `${"0123456789abcdef".repeat(4)}.webm`, "../config.json", `../${ASSET}`, `..%2f${ASSET}`, "%2e%2e", `..\\${ASSET}`, `/${ASSET}`, `C:\\${ASSET}`, `${ASSET}/`, `${ASSET}\u0000`, `${"a".repeat(64)}.svgz`, `${"a".repeat(64)}.html`, `${"a".repeat(64)}.PNG`, `${"A".repeat(64)}.png`, `${"a".repeat(63)}.png`, `${"a".repeat(65)}.png`, `${"g".repeat(64)}.png`, `${"a".repeat(64)}.png.html`, `${"a".repeat(64)}.woff2`, `${"a".repeat(64)}.mp4`, `${"a".repeat(64)}.`, `${"a".repeat(64)}.png\n`, "", null];
  for (const id of ids) cases.push({ input: { fn: "assetPath", id }, output: assetPath(path.resolve("/d"), undef(id)) !== null });

  const [a, b, c] = ["a", "b", "c"].map((x) => x.repeat(64));
  const hashTexts = [
    JSON.stringify({ background: { src: `/api/assets/${a}.png`, poster: `http://x/api/assets/${b}.mp4` }, canvas: { assets: [{ hash: c }] }, s: "/api/assets/nope.png" }),
    "f".repeat(65), "f".repeat(64), "f".repeat(63), `${a}${a}`, `${a}\n${a} ${b}`, `${a.toUpperCase()}`, `g${a}`, `${a}g`, `_${a}_`, `${b}${"b".repeat(5)}`, `${c}.png ${b}.png ${c}.png`, "", `é${a}é`,
  ];
  for (const text of hashTexts) cases.push({ input: { fn: "referencedHashes", text }, output: [...referencedHashes(text)] });

  const ranges = [undefined, "", "bytes=0-99", "bytes=900-5000", "bytes=500-", "bytes=0-", "bytes=-100", "bytes=-5000", "bytes=", "bytes=-", "items=0-1", "bytes=a-b", "bytes=0-1,5-6", "bytes=10-5", "bytes=1000-", "bytes=2000-3000", "bytes=-0", " bytes=1-2 ", "bytes=0-0", "bytes=999-999", "bytes=999-", "bytes=00-05", "bytes=99999999999999999999-", "bytes=0-99999999999999999999", "bytes=-99999999999999999999", "Bytes=0-1", "bytes=1-2-3", "bytes= 1-2", "bytes=\u0661-\u0662"];
  for (const header of ranges) for (const size of [1000, 0]) cases.push({ input: { fn: "parseRange", header: header ?? null, size }, output: parseRange(header, size) });

  const quota = { inFlight: 0, maxInFlight: 2, used: 100, incoming: 50, maxBytes: 1000 };
  for (const patch of [{}, { used: 950 }, { inFlight: 2 }, { inFlight: 1 }, { used: 951 }, { inFlight: 5, used: 5000 }, { incoming: 0 }]) {
    const input = { ...quota, ...patch };
    cases.push({ input: { fn: "uploadQuotaRefusal", ...input }, output: uploadQuotaRefusal(input) });
  }
  return cases;
}

const canvasText = (name, extra = {}) => JSON.stringify({ format: "infopanel-canvas", version: 1, source: { name }, items: [], ...extra });
const configOf = (...refs) => JSON.stringify({ profiles: [{ pages: [{ placements: refs.map((canvasRef) => ({ canvasRef })) }] }] });
const bigCanvas = (pad) => JSON.stringify({ format: "infopanel-canvas", pad: "x".repeat(pad) });

/** The canvases left in a store after a sweep: files with an age, the config text, who was deleted. */
function sweepCase(files, configText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parity-canvases-"));
  try {
    const store = createCanvasStore(path.join(dir, "canvases"));
    fs.mkdirSync(path.join(dir, "canvases"));
    const now = Date.now();
    const real = files.map((f) => ({ ...f, name: f.name ?? `${canvasIdOf(f.text)}.json` }));
    for (const f of real) {
      const file = path.join(dir, "canvases", f.name);
      fs.writeFileSync(file, f.text);
      const t = new Date(now - f.ageHours * 3_600_000);
      fs.utimesSync(file, t, t);
    }
    const deleted = store.sweep(configText, now);
    const names = new Map(real.map((f) => [f.name, f.text]));
    return {
      input: { fn: "sweep", files: files.map((f) => ({ name: f.name ?? null, text: f.text, ageHours: f.ageHours })), configText },
      output: { deleted: deleted.map((d) => (d.startsWith("cnv_") && d.length === 36 ? `${d}.json` : d)).sort(), left: fs.readdirSync(path.join(dir, "canvases")).filter((n) => names.has(n)).sort() },
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function canvasCases() {
  const cases = [];
  const refTexts = [canvasText("ARCv2"), canvasText("é ü — ✓"), "{broken", "[]", "{}", "null", JSON.stringify({ format: "other" }), JSON.stringify({ format: "infopanel-canvas" }), '{"format":"infopanel-canvas"} ', '{"format":["infopanel-canvas"]}', ""];
  for (const text of refTexts) {
    cases.push({ input: { fn: "canvasIdOf", text }, output: canvasIdOf(text) });
    cases.push({ input: { fn: "canvasRefusal", text }, output: canvasRefusal(text) });
  }
  for (const pad of [MAX_CANVAS_BYTES - 38, MAX_CANVAS_BYTES - 37]) {
    const text = bigCanvas(pad);
    cases.push({ input: { fn: "canvasRefusalBig", pad }, output: canvasRefusal(text) });
  }
  const cnv = (c) => `cnv_${c.repeat(32)}`;
  const configs = [
    JSON.stringify({ profiles: [{ pages: [{ placements: [{ canvasRef: "cnv_a" }, { module: "Clock" }] }] }, { placements: [{ canvasRef: "cnv_b" }] }] }),
    configOf(cnv("a"), cnv("a"), cnv("b")),
    JSON.stringify({ profiles: [], canvasRef: "top", nested: { canvasRef: 5, deeper: [{ canvasRef: "x" }, { canvasRef: { canvasRef: "inner" } }] } }),
    JSON.stringify({ profiles: [{ "2": { canvasRef: "two" }, "1": { canvasRef: "one" }, b: { canvasRef: "bee" } }] }),
    '{"profiles":[],"canvasRef":"a","canvasRef":"b"}',
    "{broken", "{}", "[]", '{"profiles":{}}', '{"profiles":"x"}', "null", "",
  ];
  for (const configText of configs) {
    const ids = referencedCanvasIds(configText);
    cases.push({ input: { fn: "referencedCanvasIds", configText }, output: ids === null ? null : [...ids] });
  }
  const ok = { "x-dashboard-canvas": "1", "content-type": "application/json" };
  const writes = [
    [ok, "127.0.0.1", false], [{ ...ok, "x-dashboard-canvas": undefined }, "127.0.0.1", false], [{ ...ok, "x-dashboard-canvas": "true" }, "127.0.0.1", false],
    [{ ...ok, "content-type": "text/plain" }, "::1", false], [{ ...ok, "content-type": "Application/JSON; charset=utf-8" }, "::ffff:127.0.0.1", false], [{ ...ok, "content-type": undefined }, "127.0.0.1", false],
    [ok, "192.168.1.5", false], [ok, "192.168.1.5", true], [{ ...ok, "content-type": "text/plain" }, "192.168.1.5", false], [{ ...ok, "x-dashboard-canvas": undefined }, "192.168.1.5", false],
    [ok, undefined, false], [ok, "::ffff:10.0.0.2", true],
  ];
  for (const [headers, remote, allowRemote] of writes) {
    const wire = JSON.parse(JSON.stringify(headers));
    cases.push({ input: { fn: "canvasWriteRefusal", headers: wire, remote: remote ?? null, allowRemote }, output: canvasWriteRefusal(headers, remote, allowRemote) });
  }
  const A = canvasText("keep");
  const B = canvasText("young");
  const C = canvasText("old");
  cases.push(sweepCase([{ text: A, ageHours: 48 }, { text: B, ageHours: 0.5 }, { text: C, ageHours: 2 }], configOf(canvasIdOf(A))));
  cases.push(sweepCase([{ text: A, ageHours: 48 }], "{broken"));
  cases.push(sweepCase([{ text: A, ageHours: 48 }], "{}"));
  cases.push(
    sweepCase(
      [
        { text: A, ageHours: 48 },
        { name: "notes.json", text: "{}", ageHours: 48 },
        { name: "cnv_short.json", text: "{}", ageHours: 48 },
        { name: `cnv_${"a".repeat(32)}.json.1234.tmp`, text: "{}", ageHours: 48 },
        { name: `cnv_${"b".repeat(32)}.json.0f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b.tmp`, text: "{", ageHours: 2 },
        { name: `cnv_${"b".repeat(32)}.json.1f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b.tmp`, text: "{", ageHours: 0.5 },
        { name: `cnv_${"c".repeat(32)}.json.0F8E2A1C-3b4d-4e5f-8a9b-0c1d2e3f4a5b.tmp`, text: "{", ageHours: 48 },
      ],
      configOf(),
    ),
  );
  return cases;
}

/** Large values are written as `{ "$repeat": "x", "n": 5 }` (a string) or `{ "$fill": item, "n": 5 }` (a list) and expanded here and in the Rust test. */
const expand = (v) => {
  if (Array.isArray(v)) return v.map(expand);
  if (!v || typeof v !== "object") return v;
  if ("$repeat" in v) return v.$repeat.repeat(v.n);
  if ("$fill" in v) return Array(v.n).fill(expand(v.$fill));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)]));
};
const repeat = (s, n) => ({ $repeat: s, n });
const fill = (item, n) => ({ $fill: item, n });

const NOW = "2026-10-17T12:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();
const LATER = "2026-10-18T00:00:00.000Z";
const LATER_MS = new Date(LATER).getTime();

export function libraryCases() {
  const cases = [];
  // A new item's id is random; an item over 4000 characters is reduced to its length and copies.
  const mask = (r, existing) => {
    if (r.item && JSON.stringify(r.item).length > 4000) return { big: JSON.stringify(r.item).length, copies: r.item.copies.length };
    return r.item && !existing ? { item: { ...r.item, id: "NEW" } } : r;
  };
  const first = normalizeItem({ kind: "gauge", name: "Arc", data: { shape: "arc" } }, null, new Date(NOW)).item;
  const stored = { ...first, id: "lib_stored000000" };
  const bare = { id: "lib_bare00000000", kind: "image", name: "Bare" };
  const raws = [
    { kind: "image", name: "  Nebula  ", files: [ASSET, ASSET], meta: { w: 1920, tags: ["Dark"] }, copies: [{ profileId: "p", zoneId: "z", evil: 1 }, "x"] },
    { kind: "script", name: "x" }, { kind: "gauge", name: " " }, { kind: "image", name: "x", files: ["../config.json"] }, { kind: "image", name: "x", meta: [] },
    { kind: "image", name: "x", meta: { s: repeat("x", 70_000) } }, { kind: "image", name: "x", meta: { s: repeat("x", 65_000) } }, { kind: "image", name: "x", meta: null },
    { kind: "image", name: "x", files: "no" }, { kind: "image", name: "x", files: fill(ASSET, 4097) }, { kind: "image", name: "x", files: [ASSET, 5] },
    { kind: "image", name: "x", copies: {} }, { kind: "image", name: "x", copies: fill({ profileId: "p" }, 1001) }, { kind: "image", name: "x", copies: fill({ profileId: "p" }, 1000) },
    { kind: "image", name: 5 }, { kind: "image", name: repeat("é", 250) }, { kind: "image", name: "\u00a0 x \u3000" }, { kind: "image" }, { name: "x" }, { kind: null, name: "x" },
    { kind: "font", name: "f", copies: [{ profileId: repeat("p", 150), pageId: "g", zoneId: 5, itemPath: repeat("i", 120), label: repeat("l", 250), at: repeat("a", 50) }, { profileId: "" }, { profileId: 5 }, null, [], { pageId: "x" }] },
    { kind: "canvas", name: "c", data: null }, { kind: "canvas", name: "c", data: [1, { "2": 1, "1": 2, b: 1e21 }] },     { kind: "svg", name: "s", extra: 1, id: "lib_other000000", createdAt: "x", updatedAt: "y" },
    null, [], "x", 5, true,
  ];
  for (const raw of raws) cases.push({ input: { fn: "normalizeItem", raw, existing: null, now: NOW_MS }, output: mask(normalizeItem(expand(raw), null, new Date(NOW)), null) });
  for (const chars of [8 * 1024 * 1024 - 300, 8 * 1024 * 1024 - 100, 8 * 1024 * 1024]) {
    const raw = { kind: "canvas", name: "c", data: { s: "x".repeat(chars) } };
    const r = normalizeItem(raw, null, new Date(NOW));
    cases.push({ input: { fn: "normalizeBigData", chars, now: NOW_MS }, output: r.error ? { error: r.error } : { length: JSON.stringify(r.item).length } });
  }
  const updates = [
    { name: "Arc copy", copies: [{ profileId: "p" }] }, { kind: "image" }, { kind: "gauge" }, { kind: null }, { id: "lib_other000000" }, {}, { data: { shape: "ring" } }, { name: "" }, { files: [ASSET], meta: { a: 1 } }, null, { meta: 5 },
  ];
  for (const existing of [stored, bare, { ...stored, createdAt: undefined }, { ...stored, files: undefined }, { ...stored, data: undefined }]) {
    const wire = JSON.parse(JSON.stringify(existing));
    for (const raw of updates) cases.push({ input: { fn: "normalizeItem", raw, existing: wire, now: LATER_MS }, output: normalizeItem(raw, wire, new Date(LATER)) });
  }

  const summaryBase = { id: "lib_summary00000", kind: "canvas", name: "c", createdAt: NOW, updatedAt: NOW, files: [], meta: {}, copies: [] };
  for (const chars of [0, 100, 262_136, 262_137, 400_000]) {
    const item = { ...summaryBase, data: { s: "x".repeat(chars) } };
    const s = summaryOf(item);
    cases.push({ input: { fn: "summaryOf", chars }, output: { keys: Object.keys(s), dataSize: s.dataSize ?? null } });
  }
  const noData = summaryOf(summaryBase);
  cases.push({ input: { fn: "summaryOf", chars: null }, output: { keys: Object.keys(noData), dataSize: null } });
  const nulled = summaryOf({ ...summaryBase, data: null });
  cases.push({ input: { fn: "summaryOfNull" }, output: { keys: Object.keys(nulled), dataSize: nulled.dataSize ?? null } });

  const ok = { "x-dashboard-library": "1", "content-type": "application/json" };
  const writes = [
    [ok, "127.0.0.1", false, true], [{ ...ok, "x-dashboard-library": undefined }, "127.0.0.1", false, true], [{ ...ok, "content-type": "text/plain" }, "::1", false, true], [{ ...ok, "content-type": "text/plain" }, "::1", false, false],
    [{ ...ok, "content-type": undefined }, "::1", false, false], [ok, "192.168.1.5", false, true], [ok, "192.168.1.5", true, true], [ok, "192.168.1.5", false, false], [{ ...ok, "x-dashboard-library": "2" }, "192.168.1.5", true, false],
    [{ ...ok, "content-type": "application/json; charset=utf-8" }, "127.0.0.1", false, true], [ok, undefined, false, true],
  ];
  for (const [headers, remote, allowRemote, body] of writes) {
    cases.push({ input: { fn: "libraryWriteRefusal", headers: JSON.parse(JSON.stringify(headers)), remote: remote ?? null, allowRemote, body }, output: libraryWriteRefusal(headers, remote, allowRemote, body) });
  }
  return cases;
}

export function infopanelLocalCases() {
  const cases = [];
  const G1 = "70538526-f13f-4074-bb42-f6892d6e42d4";
  const G2 = "0A0B0C0D-1111-2222-3333-444455556666";
  const xmls = [
    `<?xml version="1.0"?><ArrayOfProfile xmlns:xsi="x"><Profile><Guid>${G1}</Guid><Name>A &amp; B</Name><Width>600</Width></Profile><Profile><Guid>../../etc</Guid><Name>bad</Name></Profile></ArrayOfProfile>`,
    `<Profile><Guid>${G1}</Guid><Name>&lt;x&gt; &quot;q&quot; &apos;a&apos; &amp;lt; &bogus; &amp</Name></Profile><Profile><Guid>${G2}</Guid></Profile>`,
    `<Profile><Name>no guid</Name></Profile>`,
    `<Profile><Guid>a<b</Guid><Guid>${G1}</Guid><Name>x<y</Name><Name>second</Name></Profile>`,
    `<Profile><Guid>${G1}</Guid><Name></Name></Profile>\n<Profile>\n<Guid>${G2}</Guid><Name>spaced</Name>\n</Profile>`,
    `<Profile><Guid>${G1}</Guid><Name>unfinished</Name>`, `<Profile><Profile><Guid>${G1}</Guid></Profile>`, `<Profile><Guid> ${G1}</Guid></Profile>`, `<Profile><Guid>${G1}</Guid><Name>é ✓ 😀</Name></Profile>`,
    `<profile><Guid>${G1}</Guid></profile>`, `<Profile><GUID>${G1}</GUID></Profile>`, `<Profile><Guid>${G1}</Guid><Name>a</Name></Profile></Profile><Profile><Guid>${G2}</Guid></Profile>`, "", "<ArrayOfProfile/>",
  ];
  for (const text of xmls) cases.push({ input: { fn: "profilesFromXml", text }, output: profilesFromXml(text) });
  for (const value of [G1, G2, G1.toUpperCase(), "..", `${G1}0`, ` ${G1}`, `${G1}\n`, "70538526-f13f-4074-bb42-f6892d6e42dg", "7053852-6f13f-4074-bb42-f6892d6e42d4", ""]) {
    cases.push({ input: { fn: "isGuid", value }, output: isGuid(value) });
  }
  for (const value of ["a.png", "Donut_00001.png", "with space.gif", "..a", "a..", "...x", "..", ".", "...", "a/b.png", "a\\b.png", "C:x", "", "a*", "a?", 'a"', "a<", "a>", "a|", "a\u0000", "a\nb", "é.png"]) {
    cases.push({ input: { fn: "isAssetName", value }, output: isAssetName(value) });
  }
  return cases;
}
