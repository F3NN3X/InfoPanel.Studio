import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serverCommand } from "../../tools/perf/server-command.mjs";
import { SERVER_IMPL } from "./native-pending.mjs";

// The data folder between the two servers: what Node writes the native server reads, what the native server writes
// Node reads, and a Settings patch re-serialises the config to the same bytes on either. Runs with SERVER_IMPL=native.

async function start(impl, dataDir) {
  const server = serverCommand({ ...process.env, SERVER_IMPL: impl });
  const child = spawn(server.cmd, server.args, { env: { ...process.env, DASHBOARD_DATA_DIR: dataDir, DASHBOARD_DIST: path.join(dataDir, "no-dist"), PORT: "0", HOST: "127.0.0.1" } });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 25));
    const port = Number(/InfoPanel Studio on http:\/\/[^:]+:(\d+)/.exec(out)?.[1]);
    if (port) {
      const stop = () => new Promise((done) => (child.exitCode !== null ? done() : (child.once("exit", done), child.kill())));
      return { base: `http://127.0.0.1:${port}`, stop };
    }
  }
  child.kill();
  throw new Error(`the ${impl} server did not start:\n${out}`);
}

const headers = { "Content-Type": "application/json", "X-Dashboard-Config": "1" };
const controlHeaders = { "Content-Type": "application/json", "X-Dashboard-Control": "1" };
const read = (dir, name) => fs.readFileSync(path.join(dir, name), "utf8");

/** The writes each side makes: a config as sent (odd spacing, number forms, integer-like keys), a patch, a preference, control actions. */
async function write(base, config, patch, previewData, controls) {
  expect((await fetch(`${base}/api/config`, { method: "POST", headers, body: config })).status).toBe(200);
  expect((await fetch(`${base}/api/config/settings`, { method: "PATCH", headers, body: JSON.stringify(patch) })).status).toBe(200);
  const prefs = await fetch(`${base}/api/studio-prefs`, { method: "PUT", headers, body: JSON.stringify({ "studio.previewData": previewData }) });
  expect(prefs.status).toBe(200);
  for (const [type, body] of controls) {
    expect((await fetch(`${base}/api/control/${type}`, { method: "POST", headers: controlHeaders, body: JSON.stringify(body) })).status).toBe(200);
  }
}


describe.skipIf(SERVER_IMPL !== "native")("data folder between node and native", () => {
  let root;
  afterEach(() => root && fs.rmSync(root, { recursive: true, force: true }));

  it("reads what the other wrote and writes the same bytes", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ips-roundtrip-"));
    const shared = path.join(root, "shared");
    const config = '{ "version": 11, "z": 1.0, "2": [1e21, 0.1, -0],\n  "profiles": [ { "id": "desk", "performance": { "maxFps": 30 } } ] }';
    const controls = [["profile", { profile: "desk" }], ["rotate", { profile: "desk", state: "on" }], ["kiosk", { action: "dim", profile: "desk", level: 0.4 }], ["kiosk", { action: "island", profile: "desk", state: "off" }]];
    const nextControls = [["kiosk", { action: "dim", profile: "wall", level: 0.25 }], ["kiosk", { action: "island", profile: "wall", state: "on" }], ["rotate", { profile: "desk", state: "off" }]];
    const patch = { general: { maxFps: 15, locale: "nb-NO" }, style: { clock: "12" }, profiles: { desk: { performance: { motion: "reduce" } } } };

    const node = await start("node", shared);
    await write(node.base, config, patch, "frozen", controls);
    await node.stop();
    const byNode = { config: read(shared, "config.json"), prefs: read(shared, "studio-prefs.json"), control: read(shared, "control.json") };

    const native = await start("native", shared);
    expect(await (await fetch(`${native.base}/api/config`)).text()).toBe(byNode.config);
    expect(await (await fetch(`${native.base}/api/studio-prefs`)).text()).toBe(byNode.prefs);
    expect({ config: read(shared, "config.json"), prefs: read(shared, "studio-prefs.json"), control: read(shared, "control.json") }).toEqual(byNode);
    expect((await (await fetch(`${native.base}/api/control`)).json()).profile).toBe("desk");
    const next = '{"version":12,"1":{"b":2,"a":1e-7},"profiles":[{"id":"desk"},{"id":"wall","performance":{"maxFps":5}}]}';
    const nextPatch = { general: { showSeconds: true }, profiles: { wall: { performance: null }, desk: { performance: { maxFps: 60 } } } };
    await write(native.base, next, nextPatch, "frozenWhenUnfocused", nextControls);
    await native.stop();
    const byNative = { config: read(shared, "config.json"), prefs: read(shared, "studio-prefs.json"), control: read(shared, "control.json") };

    const again = await start("node", shared);
    expect(await (await fetch(`${again.base}/api/config`)).text()).toBe(byNative.config);
    expect(await (await fetch(`${again.base}/api/studio-prefs`)).text()).toBe(byNative.prefs);
    const profiles = (await (await fetch(`${again.base}/api/control`)).json()).profiles;
    expect([profiles.wall.dim, profiles.wall.islandOverride, profiles.desk.dim, profiles.desk.override]).toEqual([0.25, "on", 0.4, "off"]);
    await again.stop();

    // The same writes on a fresh folder each: byte-identical files.
    for (const [config_, patch_, prefs_, controls_] of [
      [config, patch, "frozen", controls],
      [next, nextPatch, "frozenWhenUnfocused", nextControls],
    ]) {
      const files = {};
      for (const impl of ["node", "native"]) {
        const dir = path.join(root, `${impl}-${prefs_}`);
        const s = await start(impl, dir);
        await write(s.base, config_, patch_, prefs_, controls_);
        await s.stop();
        files[impl] = { config: read(dir, "config.json"), prefs: read(dir, "studio-prefs.json"), control: read(dir, "control.json") };
      }
      expect(files.native).toEqual(files.node);
    }
  }, 30_000);
});
