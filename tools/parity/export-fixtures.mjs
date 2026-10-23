// Parity fixtures for the native server (ips-server): runs the Node server's pure functions over the inputs their
// Vitest files use, plus edge cases, and writes tests/fixtures/parity/<module>.json as [{ input, output }]. The Rust
// tests in src-tauri/crates/ips-server/tests/parity.rs load these files and must give the same outputs.
//   node tools/parity/export-fixtures.mjs           writes the files (npm run parity:fixtures)
//   node tools/parity/export-fixtures.mjs --check   exits 1 when a committed file is stale (npm run parity:check)
// JSON that must round-trip as text (number formats, key order) goes in and out as strings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionRefusal } from "../../server/config-guard.mjs";
import { applySettingsPatch, reapplySettings } from "../../server/config-settings.mjs";
import { agentWriteRefusal, configWriteRefusal, controlWriteRefusal, createRequestGuard, hostnameOf, isLoopback, parseAllowedHosts, remoteEditRefusal } from "../../server/request-guard.mjs";
import { securityHeaders } from "../../server/security-headers.mjs";
import { applyPrefs, normalizePrefs } from "../../server/studio-prefs.mjs";
import { controlCases } from "./control-fixtures.mjs";
import { calendarModule, icalCases, icalRulesCases, integrationsCases, obsCases } from "./extras-fixtures.mjs";
import { alertsCases, alertsLiveCases, alertsOutputCases, alertsRuleCases, alertsThresholdCases } from "./alerts-fixtures.mjs";
import { agentUsageCases, agentsCases, claudeSessionsCases } from "./agents-fixtures.mjs";
import { assetCases, canvasCases, infopanelLocalCases, libraryCases } from "./media-fixtures.mjs";
import { fontProxyCases, proxyCases } from "./proxy-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "tests/fixtures/parity");

/** `undefined` (no result) is written as null. */
const out = (v) => (v === undefined ? null : v);

function requestGuard() {
  const cases = [];
  const hostnames = [null, "", "LocalHost:3922", "[::1]:3922", "[::1]", "evil.example", "evil.example:3922", "a b", "a/b", "  Host.Lan  ", "[::1]x", "[]", "[::g]", "host:", "host:abc", "host:99999999", "user@host", "a..b", "HOST_NAME-1.lan:80", "[FE80::1]:1", "1.2.3.4", "::1", "[::1]:", "é.lan", "\u00a0localhost\u00a0", "localhost\u0085", "[::ffff:127.0.0.1]:80", "x:1:2"];
  for (const value of hostnames) cases.push({ input: { fn: "hostnameOf", value }, output: hostnameOf(value ?? undefined) });

  const guards = [
    { host: "127.0.0.1" },
    { host: "panel.lan", allowedHosts: ["Kiosk.Local", "bad host", "[::1]:80", "::1", "lan.example:3922"] },
    { host: "0.0.0.0", machineName: "GAMING-PC" },
    { host: "::", machineName: "" },
    { host: "::1" },
    { host: "localhost" },
  ];
  const requests = [
    ["GET", { host: "localhost" }],
    ["GET", { host: "localhost:3922" }],
    ["GET", { host: "127.0.0.1:3922" }],
    ["GET", { host: "[::1]:3922" }],
    ["GET", { host: "localhost:5173" }],
    ["GET", { host: "evil.example" }],
    ["GET", { host: "evil.example:3922" }],
    ["POST", { host: "evil.example" }],
    ["GET", {}],
    ["GET", { host: "" }],
    ["GET", { host: "192.168.1.5:3922" }],
    ["GET", { host: "192.168.001.5" }],
    ["GET", { host: "[fe80::1]:3922" }],
    ["GET", { host: "[1.2.3.4]" }],
    ["GET", { host: "[::ffff:1.2.3.4]" }],
    ["GET", { host: "[1::2::3]" }],
    ["GET", { host: "gaming-pc:3922" }],
    ["GET", { host: "panel.lan:3922" }],
    ["GET", { host: "kiosk.local" }],
    ["GET", { host: "lan.example" }],
    ["GET", { host: "192.168.1.5" }],
    ["POST", { host: "127.0.0.1:3922", origin: "http://127.0.0.1:3922", "sec-fetch-site": "same-origin" }],
    ["POST", { host: "127.0.0.1:3922" }],
    ["DELETE", { host: "127.0.0.1:3922", "sec-fetch-site": "none" }],
    ["POST", { host: "127.0.0.1:3922", origin: "http://evil.example" }],
    ["POST", { host: "127.0.0.1:3922", origin: "null" }],
    ["POST", { host: "127.0.0.1:3922", origin: "" }],
    ["POST", { host: "127.0.0.1:3922", origin: "file:///C:/x" }],
    ["POST", { host: "127.0.0.1:3922", "sec-fetch-site": "cross-site" }],
    ["PUT", { host: "127.0.0.1:3922", "sec-fetch-site": "same-site" }],
    ["PATCH", { host: "127.0.0.1:3922", "sec-fetch-site": "" }],
    ["GET", { host: "127.0.0.1:3922", origin: "http://evil.example", "sec-fetch-site": "cross-site" }],
    ["OPTIONS", { host: "127.0.0.1:3922", origin: "http://evil.example" }],
    ["post", { host: "127.0.0.1:3922", origin: "http://evil.example" }],
    ["POST", { host: "127.0.0.1:3922", origin: "http://localhost:5173" }],
    ["POST", { host: "localhost:5173", origin: "http://localhost:5173" }],
    ["POST", { host: "localhost:5173", origin: "http://LOCALHOST:5173" }],
    ["POST", { host: "localhost:80", origin: "http://localhost:80" }],
    ["POST", { host: "localhost", origin: "http://localhost:80" }],
    ["POST", { host: "localhost", origin: "https://localhost:443" }],
    ["POST", { host: "[::1]:3922", origin: "http://[::1]:3922" }],
    ["POST", { host: "[::1]:3922", origin: "http://127.0.0.1:3922" }],
    ["POST", { host: "192.168.1.5:3922", origin: "http://localhost:5173" }],
    ["POST", { host: "192.168.1.5:3922", origin: "http://192.168.1.5:3922" }],
    ["POST", { host: "192.168.1.5:3922", origin: "http://0xc0.0xa8.1.5:3922" }],
    ["POST", { host: "panel.lan:3922", origin: "http://Panel.Lan:3922/path?q" }],
    ["POST", { host: "panel.lan:3922", origin: "foo://panel.lan:3922" }],
    ["POST", { host: "panel.lan:3922", origin: " http://panel.lan:3922 " }],
    ["POST", { host: "panel.lan:3922", origin: "http://user:pw@panel.lan:3922" }],
  ];
  for (const options of guards) {
    const guard = createRequestGuard(options);
    for (const [method, headers] of requests) cases.push({ input: { fn: "guard", options, method, headers }, output: guard({ method, headers }) });
  }

  for (const value of [null, "", " a.lan, b.lan ,,", "a", ",", " , x ,"]) cases.push({ input: { fn: "parseAllowedHosts", value }, output: parseAllowedHosts(value ?? undefined) });

  const typed = [
    {},
    { "content-type": "application/json" },
    { "content-type": "text/plain" },
    { "content-type": "Application/JSON; charset=utf-8" },
    { "content-type": " application/json ;x" },
    { "content-type": "application/json\u00a0" },
    { "content-type": "application/jsonx" },
  ];
  const markers = [undefined, "1", "0", " 1", "1, 1", "true"];
  for (const base of typed) {
    for (const marker of markers) {
      for (const [fn, header, refusal] of [
        ["configWriteRefusal", "x-dashboard-config", configWriteRefusal],
        ["controlWriteRefusal", "x-dashboard-control", controlWriteRefusal],
      ]) {
        const headers = marker === undefined ? base : { ...base, [header]: marker };
        cases.push({ input: { fn, headers }, output: refusal(headers) });
      }
      const headers = marker === undefined ? base : { ...base, "x-agent-event": marker };
      for (const address of ["127.0.0.1", "192.168.1.20"]) cases.push({ input: { fn: "agentWriteRefusal", headers, address }, output: agentWriteRefusal(headers, address) });
    }
  }

  const addresses = [null, "", "127.0.0.1", "127.255.0.9", "::1", "::1:2", "::ffff:127.0.0.1", "::FFFF:127.0.0.1", "192.168.1.20", "1270.0.0.1", "::ffff:192.168.1.2", "0:0:0:0:0:0:0:1"];
  for (const address of addresses) {
    cases.push({ input: { fn: "isLoopback", address }, output: isLoopback(address ?? undefined) });
    for (const allow of [undefined, "1", "0", "true"]) {
      const env = allow === undefined ? {} : { ALLOW_REMOTE_EDIT: allow };
      cases.push({ input: { fn: "remoteEditRefusal", address, env }, output: remoteEditRefusal(address ?? undefined, env) });
    }
  }
  return cases;
}

function securityHeaderCases() {
  const searches = ["", "?", "?studio", "?studio=1", "?settings", "?kiosk=1", "?a=1&settings=", "?%73tudio", "?studio+x", "studio", "??studio", "?x=studio", "?STUDIO", "?a&studio&b"];
  return [true, false].flatMap((isHtml) => searches.map((search) => ({ input: { fn: "securityHeaders", isHtml, search }, output: securityHeaders(isHtml, search) })));
}

function configGuard() {
  const text = (version) => JSON.stringify({ version, profiles: [] });
  const pairs = [
    [text(3), { version: 2 }],
    [text(3), {}],
    [text(1), { profiles: [] }],
    [text(4), { version: 3 }],
    [text(4), { version: 4 }],
    [text(3), { version: 4 }],
    [text(5), { version: 4 }],
    [text(6), { version: 5 }],
    [text(5), { version: 6 }],
    [text(3), { version: 3 }],
    [text(2), { version: 3 }],
    ["{}", { version: 1 }],
    ["{}", {}],
    ["not json", { version: 1 }],
    ["", { version: 1 }],
    [JSON.stringify({ version: "9" }), { version: 1 }],
    [JSON.stringify({ version: 2 }), { version: "3" }],
    [JSON.stringify({ version: 2.5 }), { version: 2 }],
    [JSON.stringify({ version: -1 }), {}],
    ["[3]", { version: 0 }],
    ["null", { version: 0 }],
    ['{"version":1e2}', { version: 99 }],
    [JSON.stringify({ version: null }), { version: -1 }],
  ];
  return pairs.map(([storedText, incoming]) => ({ input: { fn: "versionRefusal", storedText, incoming }, output: versionRefusal(storedText, incoming) }));
}

/** Every two- and three-letter language `Intl.DateTimeFormat` formats dates in: the native locale table. */
function supportedLanguages() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const found = [];
  for (const a of letters) {
    for (const b of letters) {
      for (const code of [a + b, ...[...letters].map((c) => a + b + c)]) {
        if (Intl.DateTimeFormat.supportedLocalesOf([code]).length > 0) found.push(code);
      }
    }
  }
  return found.sort();
}

function configSettings() {
  const stored = {
    version: 11,
    general: { font: "inter", maxFps: 30, showSeconds: false },
    style: { clock: "24", surface: "glass" },
    profiles: [
      { id: "desk", name: "Desk", pages: [{ id: "one", placements: [] }], performance: { maxFps: 30 } },
      { id: "wall", name: "Wall", pages: [{ id: "one", placements: [] }] },
    ],
  };
  const storedText = JSON.stringify(stored);
  // Text that only round-trips as JavaScript prints it: number forms, integer-like keys, escapes.
  const oddText =
    '{"z":1.0,"version":11,"2":"two","general":{"b":1e21,"1":1e-7,"maxFps":30.0},"n":[-0,0.1,12345678901234567890,1E2,5e-324],"s":"a\\u0001\\u2028/\\"","profiles":[{"id":"desk","x":1,"performance":{"maxFps":5}},{"id":"1"},null,{"name":"no id"}],"tail":true}';
  const patches = [
    { general: { maxFps: 60, hideCursor: true, showSeconds: null } },
    { general: { maxFps: null } },
    { style: { clock: "12" } },
    { style: { clock: null } },
    { profiles: { wall: { performance: { maxFps: 15, motion: "reduce" } } } },
    { profiles: { desk: { performance: null } } },
    { profiles: { desk: { performance: {} } } },
    { profiles: { desk: { performance: { motion: "full" } } } },
    { profiles: {} },
    { general: {} },
    { style: {} },
    ...[5, 15, 30, 60, 0].map((maxFps) => ({ general: { maxFps } })),
    ...["ringGlide", "blurLimit", "innerBlur", "liveGlow", "showSeconds", "hideCursor", "kioskPageNav"].flatMap((key) => [true, false].map((on) => ({ general: { [key]: on } }))),
    ...["daily", "off"].map((kioskRefresh) => ({ general: { kioskRefresh } })),
    ...["system", "reduce", "full"].map((motion) => ({ general: { motion } })),
    { theme: {} },
    { general: { font: "inter" } },
    { general: { maxFps: 24 } },
    { general: { maxFps: "15" } },
    { general: { motion: "slow" } },
    { general: { kioskRefresh: "hourly" } },
    { general: { blurLimit: "yes" } },
    { general: { showSeconds: "yes" } },
    { general: { locale: "not a locale!" } },
    { general: [] },
    { general: null },
    { general: "x" },
    { style: { clock: "auto" } },
    { style: { clock: 12 } },
    { style: { surface: "glass" } },
    { style: [] },
    { profiles: { desk: { performance: { maxFps: 7 } } } },
    { profiles: { desk: { performance: { maxFps: null } } } },
    { profiles: { desk: { performance: { fps: 5 } } } },
    { profiles: { desk: { name: "x" } } },
    { profiles: { desk: {} } },
    { profiles: { desk: null } },
    { profiles: { desk: { performance: "fast" } } },
    { profiles: { desk: { performance: [] } } },
    { profiles: { nope: { performance: null } } },
    { profiles: { nope: { performance: { maxFps: 7 } } } },
    { profiles: { desk: { performance: null }, nope: { performance: null } } },
    { profiles: { nope: { performance: null }, desk: { performance: 1 } } },
    { profiles: [] },
    { profiles: null },
    { general: { maxFps: 5 }, theme: 1 },
    { general: { maxFps: 24 }, style: { clock: "bad" } },
    { style: { clock: "12" }, general: { maxFps: 15 }, profiles: { desk: { performance: null } } },
    null,
    [],
    "general",
    1,
  ];
  const locales = ["", "de-CH", "en", "en-US", "nb-NO", "de", "xx", "zz-ZZ", "en-XX", "qaa", "i-klingon", "en_US", "123", "EN-us", "x-private", "en-u-ca-gregory", "en-Latn-US", "abcdefghi", "a", "en--US", "zh-Hant-TW", "und", "root", "en-US-POSIX", "art-lojban", "sgn-BE-FR", "en-a-bbb-x-a-ccc", "de-DE-1996", " en", "en ", "tlh", "yue", "pt-BR", "en-Cyrl", "en-001", "de-999", "und-US", "mo", "iw", "sh", "cnr", "en-US-US", "en-1996-1996", "en-u-ca", "en-u-ca-x", "en-t-de", "en-t-a1-abc", "en-a-b", "en-a-bb-a-cc", "en-x-abcdefghi", "en-x-a", "en-Latn-Latn", "en-u-attr-ca-gregory", "en-u-c1-abc", "en-u-cc-ab", "hans", "abcde", "en-12345", "en-1abc", "en-abcd5", "en-x", "en-u", "zh-min-nan", "en-GB-oed", "en-t", "en-t-en-us", "en-t-x0", "en-t-12", "ab-abc", "en-1ab", "en-u-x", "en-u-ca-gregory-t-de-u-nu-thai", "x-abc-en", "en-0-abc", "é", "en-é", 5, null];

  const configs = [
    storedText,
    oddText,
    JSON.stringify({ version: 11, general: { maxFps: 30 } }),
    JSON.stringify({ ...stored, style: { clock: "24" } }),
    JSON.stringify({ version: 1, general: "x", style: [1], profiles: "none" }),
    JSON.stringify({ profiles: [{ id: 1 }, { id: "1" }] }),
    "null",
    "[]",
    "5",
  ];
  const cases = [];
  const result = (r) => (r.config === undefined ? r : { text: JSON.stringify(r.config) });
  const apply = (storedText, patchText) =>
    cases.push({ input: { fn: "applySettingsPatch", storedText, patchText }, output: result(applySettingsPatch(JSON.parse(storedText), JSON.parse(patchText))) });
  for (const configText of configs) for (const patch of patches) apply(configText, JSON.stringify(patch));
  for (const locale of locales) apply(storedText, JSON.stringify({ general: { locale } }));
  const numbered = JSON.stringify({ profiles: [{ id: 1 }, { id: "1" }, { id: "desk" }] });
  for (const storedText of [oddText, numbered]) {
    for (const patchText of ['{"profiles":{"1":{"performance":null},"desk":{"performance":null}}}', '{"profiles":{"desk":{"performance":{"maxFps":5}},"1":{"performance":{"motion":"full"}}}}', '{"general":{"maxFps":15.0,"showSeconds":true}}', '{"general":{"maxFps":-0}}', '{"profiles":{"desk":{"performance":{"maxFps":5,"motion":"full","maxFps":15}}}}']) {
      apply(storedText, patchText);
    }
  }

  const log = [
    { rev: 5, patch: { general: { maxFps: 60 } } },
    { rev: 6, patch: { general: { maxFps: 15 }, style: { clock: "12" } } },
    { rev: 7, patch: { profiles: { gone: { performance: null } } } },
    { rev: 8, patch: { profiles: { desk: { performance: { motion: "reduce" } } } } },
  ];
  const pushed = JSON.stringify({ ...stored, general: { font: "inter", maxFps: 30 } });
  for (const configText of [pushed, storedText, oddText]) {
    for (const sinceRev of [-Infinity, 0, 4, 5, 6, 7, 8, 5.5]) {
      const config = reapplySettings(JSON.parse(configText), log, sinceRev);
      cases.push({ input: { fn: "reapplySettings", configText, log, sinceRev: String(sinceRev) }, output: { text: JSON.stringify(config) } });
    }
  }

  cases.push({ input: { fn: "supportedLanguages" }, output: supportedLanguages() });
  return cases;
}

function studioPrefs() {
  const cases = [];
  const raws = [{ "studio.previewData": "frozen", "studio.other": 1, x: "y" }, { "studio.previewData": "paused" }, null, ["live"], "live", {}, { "studio.previewData": "frozenWhenUnfocused" }, { "studio.previewData": 1 }];
  for (const raw of raws) cases.push({ input: { fn: "normalizePrefs", raw }, output: normalizePrefs(raw) });
  const prefsList = [{}, { "studio.previewData": "frozen" }, { "studio.previewData": "bogus", other: 1 }, null];
  const patches = [{ "studio.previewData": "live" }, { "studio.previewData": "paused" }, { "studio.previewData": "live", nope: 1 }, { nope: 1, "studio.previewData": "paused" }, "live", {}, [], null, 5, { "studio.previewData": null }, { "studio.previewData": "frozenWhenUnfocused" }];
  for (const prefs of prefsList) for (const patch of patches) cases.push({ input: { fn: "applyPrefs", prefs, patch }, output: out(applyPrefs(prefs, patch)) });
  return cases;
}

const MODULES = {
  "request-guard": requestGuard,
  "security-headers": securityHeaderCases,
  "config-guard": configGuard,
  "config-settings": configSettings,
  "studio-prefs": studioPrefs,
  control: controlCases,
  ical: icalCases,
  "ical-rules": icalRulesCases,
  integrations: integrationsCases,
  obs: obsCases,
  calendar: calendarModule,
  assets: assetCases,
  canvases: canvasCases,
  library: libraryCases,
  "infopanel-local": infopanelLocalCases,
  agents: agentsCases,
  "agent-usage": agentUsageCases,
  "claude-sessions": claudeSessionsCases,
  alerts: alertsCases,
  "alerts-thresholds": alertsThresholdCases,
  "alerts-rules": alertsRuleCases,
  "alerts-output": alertsOutputCases,
  "alerts-live": alertsLiveCases,
  proxy: proxyCases,
  "font-proxy": fontProxyCases,
};

const check = process.argv.includes("--check");
let stale = 0;
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, build] of Object.entries(MODULES)) {
  const file = path.join(OUT_DIR, `${name}.json`);
  // One case per line: small, and a diff shows the cases that changed.
  const text = `[\n${(await build())
    .map((c) => JSON.stringify(c))
    .join(",\n")}\n]\n`;
  if (!check) {
    fs.writeFileSync(file, text);
    continue;
  }
  // A checkout may have turned the line ends into CRLF.
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (current !== text) {
    stale += 1;
    console.error(`${path.relative(ROOT, file)} is stale; run npm run parity:fixtures`);
  }
}
if (check && stale > 0) process.exit(1);
