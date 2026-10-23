// npm run parity:servers: the differential check between the Node server and ips-server. Each pair of servers starts on
// twin data folders; the same raw requests (tools/parity/servers/<module>.mjs) go to both, and the answers are compared
// byte for byte: status line, headers, framing and body. Only what cannot match is normalised: header case and order,
// `date`, keep-alive hints, and clock-valued numbers (versions and revisions, uptime, reload counters, `since`).
// After the requests the twin data folders' files are compared too. Exit 1 on any difference.
//   node tools/parity/compare-servers.mjs [--only core,config,control,debug] [--no-build] [--verbose]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverCommand } from "../perf/server-command.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODULES = ["core", "config", "control", "debug"];
const FILES = ["config.json", "studio-prefs.json", "control.json"];
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : MODULES;

if (!args.includes("--no-build")) {
  const built = spawnSync("cargo", ["build", "-p", "ips-server"], { cwd: path.join(ROOT, "src-tauri"), stdio: "inherit", shell: process.platform === "win32" });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

/** This machine's first non-loopback IPv4 address, or null. */
const lanAddress = () =>
  Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;

const PAIRS = {
  normal: { env: {}, address: "127.0.0.1" },
  debug: { env: { DASHBOARD_DEBUG: "1" }, address: "127.0.0.1" },
  lan: { env: { HOST: "0.0.0.0", DASHBOARD_DEBUG: "1" }, address: lanAddress() },
};

async function start(impl, pair, dir) {
  const dist = path.join(dir, "dist");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  for (const [name, text] of [["index.html", "<p>i</p>"], ["a.txt", "plain"], ["x.HTML", "H"], ["noext", "n"], ["dot.", "d"], [".secret", "s"], ["assets/s p.css", "c"]]) {
    fs.writeFileSync(path.join(dist, name), text);
  }
  const server = serverCommand({ ...process.env, SERVER_IMPL: impl });
  const env = { ...process.env, PORT: "0", HOST: "127.0.0.1", DASHBOARD_DIST: dist, DASHBOARD_DATA_DIR: path.join(dir, "data"), ...pair.env };
  const child = spawn(server.cmd, server.args, { env });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const m = /on http:\/\/[^:]+:(\d+)/.exec(out);
    if (m) return { child, port: Number(m[1]), dir };
  }
  child.kill();
  throw new Error(`${impl} did not start:\n${out}`);
}

/** What a case's `run` talks to: one server. */
function apiFor(server, address) {
  const connect = (text, onData, onEnd) => {
    const socket = net.connect(server.port, address, () => socket.write(text));
    socket.on("data", onData);
    socket.on("end", onEnd);
    socket.on("error", onEnd);
    return socket;
  };
  return {
    port: server.port,
    host: `Host: ${address}:${server.port}\r\n`,
    raw: (text) =>
      new Promise((resolve) => {
        let buf = Buffer.alloc(0);
        const socket = connect(text, (d) => (buf = Buffer.concat([buf, d])), () => resolve(buf.toString("latin1")));
        socket.setTimeout(1500, () => {
          socket.destroy();
          resolve(buf.toString("latin1"));
        });
      }),
    open: (text) => {
      let buf = Buffer.alloc(0);
      const socket = connect(text, (d) => (buf = Buffer.concat([buf, d])), () => {});
      return {
        read: (ms) => new Promise((resolve) => setTimeout(() => resolve(buf.toString("latin1")), ms)),
        close: () => socket.destroy(),
      };
    },
  };
}

function dechunk(body) {
  let out = "";
  let rest = body;
  for (;;) {
    const i = rest.indexOf("\r\n");
    if (i < 0) return out + rest;
    const n = Number.parseInt(rest.slice(0, i), 16);
    if (!n) return out;
    out += rest.slice(i + 2, i + 2 + n);
    rest = rest.slice(i + 4 + n);
  }
}

/** One raw answer without what may differ: header case and order, `date`, keep-alive hints, clock-valued numbers. */
function normalise(response) {
  const [head, ...rest] = response.split("\r\n\r\n");
  const lines = head.split("\r\n");
  const chunked = /transfer-encoding: chunked/i.test(head);
  const keep = lines
    .slice(1)
    .filter((l) => !/^(date|keep-alive|connection|transfer-encoding|content-length):/i.test(l))
    .map((l) => l.replace(/^([^:]+):/, (_m, k) => `${k.toLowerCase()}:`))
    .map((l) => (l.startsWith("x-settings-rev") ? "x-settings-rev: N" : l))
    .sort();
  let body = rest.join("\r\n\r\n");
  if (chunked) body = dechunk(body);
  body = body
    .replace(/"(version|configVersion)":\d{6,}/g, '"$1":V')
    .replace(/"(settingsRev|rev)":\d+/g, '"$1":R')
    .replace(/"uptimeSeconds":\d+/g, '"uptimeSeconds":U')
    .replace(/"(reload|since|mutedUntil)":\d{10,}/g, '"$1":N');
  const cl = /content-length: (\d+)/i.exec(head)?.[1] ?? "-";
  // `Connection: keep-alive` on an HTTP/1.1 answer is the default and is not always written.
  const conn = (/connection: (\S+)/i.exec(head)?.[1] ?? "-").replace(/^keep-alive$/i, "-");
  // hyper answers an HTTP/1.0 request with an HTTP/1.0 status line (Node always writes 1.1).
  return `${lines[0].replace(/^HTTP\/1\.0/, "HTTP/1.1")}\n${keep.join("\n")}\n[len ${cl} ${chunked ? "chunked" : "-"} conn ${conn}]\n\n${body}`;
}

const normaliseAll = (transcript) => transcript.split("\n=====\n").map(normalise).join("\n=====\n");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-servers-"));
const cases = [];
for (const name of only) {
  const mod = await import(`./servers/${name}.mjs`);
  for (const c of mod.cases) cases.push({ ...c, module: name });
}

const running = {};
const stop = () => {
  for (const pair of Object.values(running)) for (const s of Object.values(pair)) s.child.kill();
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 300);
};
let diffs = 0;
let skipped = 0;
let compared = 0;
try {
  for (const c of cases) {
    const where = c.where ?? "normal";
    if (!PAIRS[where].address) {
      skipped += 1;
      continue;
    }
    if (!running[where]) {
      const [node, native] = await Promise.all(["node", "native"].map((impl) => start(impl, PAIRS[where], path.join(tmp, where, impl))));
      running[where] = { node, native };
    }
    const { address } = PAIRS[where];
    const [a, b] = (await Promise.all([running[where].node, running[where].native].map((s) => c.run(apiFor(s, address))))).map((t) => (c.map ?? ((x) => x))(normaliseAll(t)));
    compared += 1;
    if (a !== b) {
      diffs += 1;
      console.log(`--- DIFF [${c.module}] ${c.label}\nNODE:\n${a}\nNATIVE:\n${b}\n`);
    } else if (verbose) {
      console.log(`ok [${c.module}] ${c.label}`);
    }
  }
  for (const [where, pair] of Object.entries(running)) {
    for (const f of FILES) {
      const read = (s) => (fs.existsSync(path.join(s.dir, "data", f)) ? fs.readFileSync(path.join(s.dir, "data", f), "utf8") : null);
      const [x, y] = [read(pair.node), read(pair.native)];
      if (x !== y) {
        diffs += 1;
        console.log(`--- DIFF [${where}] data/${f}\nNODE:   ${x}\nNATIVE: ${y}\n`);
      } else if (verbose) {
        console.log(`ok [${where}] data/${f} ${x === null ? "absent" : "equal"}`);
      }
    }
  }
} finally {
  stop();
}
console.log(`compared ${compared} cases${skipped ? `, skipped ${skipped} (no LAN address)` : ""}; diffs ${diffs}`);
process.exitCode = diffs === 0 ? 0 : 1;
