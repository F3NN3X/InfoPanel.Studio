import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serverCommand } from "../../tools/perf/server-command.mjs";

// The data folder across restarts of ips-server: what one run writes the next reads, and what it writes back is the
// same bytes (the files keep the formats of the Node server it replaced, which InfoPanel Studio's older installs read).

async function start(dataDir) {
  const server = serverCommand();
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
  throw new Error(`the server did not start:\n${out}`);
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


describe("data folder across restarts", () => {
  let root;
  afterEach(() => root && fs.rmSync(root, { recursive: true, force: true }));

  it("reads what the other wrote and writes the same bytes", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ips-roundtrip-"));
    const shared = path.join(root, "shared");
    const config = '{ "version": 11, "z": 1.0, "2": [1e21, 0.1, -0],\n  "profiles": [ { "id": "desk", "performance": { "maxFps": 30 } } ] }';
    const controls = [["profile", { profile: "desk" }], ["rotate", { profile: "desk", state: "on" }], ["kiosk", { action: "dim", profile: "desk", level: 0.4 }], ["kiosk", { action: "island", profile: "desk", state: "off" }]];
    const nextControls = [["kiosk", { action: "dim", profile: "wall", level: 0.25 }], ["kiosk", { action: "island", profile: "wall", state: "on" }], ["rotate", { profile: "desk", state: "off" }]];
    const patch = { general: { maxFps: 15, locale: "nb-NO" }, style: { clock: "12" }, profiles: { desk: { performance: { motion: "reduce" } } } };

    const one = await start(shared);
    await write(one.base, config, patch, "frozen", controls);
    await one.stop();
    const byOne = { config: read(shared, "config.json"), prefs: read(shared, "studio-prefs.json"), control: read(shared, "control.json") };

    const two = await start(shared);
    expect(await (await fetch(`${two.base}/api/config`)).text()).toBe(byOne.config);
    expect(await (await fetch(`${two.base}/api/studio-prefs`)).text()).toBe(byOne.prefs);
    expect({ config: read(shared, "config.json"), prefs: read(shared, "studio-prefs.json"), control: read(shared, "control.json") }).toEqual(byOne);
    expect((await (await fetch(`${two.base}/api/control`)).json()).profile).toBe("desk");
    const next = '{"version":12,"1":{"b":2,"a":1e-7},"profiles":[{"id":"desk"},{"id":"wall","performance":{"maxFps":5}}]}';
    const nextPatch = { general: { showSeconds: true }, profiles: { wall: { performance: null }, desk: { performance: { maxFps: 60 } } } };
    await write(two.base, next, nextPatch, "frozenWhenUnfocused", nextControls);
    await two.stop();
    const byTwo = { config: read(shared, "config.json"), prefs: read(shared, "studio-prefs.json"), control: read(shared, "control.json") };

    const three = await start(shared);
    expect(await (await fetch(`${three.base}/api/config`)).text()).toBe(byTwo.config);
    expect(await (await fetch(`${three.base}/api/studio-prefs`)).text()).toBe(byTwo.prefs);
    const profiles = (await (await fetch(`${three.base}/api/control`)).json()).profiles;
    expect([profiles.wall.dim, profiles.wall.islandOverride, profiles.desk.dim, profiles.desk.override]).toEqual([0.25, "on", 0.4, "off"]);
    await three.stop();
  }, 30_000);
});

describe("media across restarts", () => {
  let root;
  afterEach(() => root && fs.rmSync(root, { recursive: true, force: true }));

  const post = (base, url, headers, body) => fetch(`${base}${url}`, { method: "POST", headers, body });
  const gif = (tail) => Buffer.from(`GIF89a\u0001\u0000\u0001\u0000 ${tail}`, "latin1");
  const canvas = (name) => JSON.stringify({ format: "infopanel-canvas", version: 1, source: { name }, items: [] });
  const asset = { "Content-Type": "image/gif", "X-Dashboard-Asset": "1" };
  const canvasHeaders = { "Content-Type": "application/json", "X-Dashboard-Canvas": "1" };
  const library = { "Content-Type": "application/json", "X-Dashboard-Library": "1" };

  /** Each side stores an asset, a canvas and a library item, then updates the item it finds. */
  async function save(base, tag) {
    const a = await (await post(base, "/api/assets", asset, gif(tag))).json();
    const c = await (await post(base, "/api/canvases", canvasHeaders, canvas(tag))).json();
    const item = await (await post(base, "/api/library", library, JSON.stringify({ kind: "image", name: tag, files: [a.id], meta: { "2": 1, b: [1e21, 0.5] } }))).json();
    return { asset: a.id, canvas: c.id, item: item.id };
  }

  it("reads what the other wrote and writes files the other reads back unchanged", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ips-media-"));
    const one = await start(root);
    const first = await save(one.base, "one");
    await one.stop();

    const two = await start(root);
    const list = await (await fetch(`${two.base}/api/assets`)).json();
    expect(list.map((x) => x.id)).toEqual([first.asset]);
    expect(Buffer.from(await (await fetch(`${two.base}/api/assets/${first.asset}`)).arrayBuffer())).toEqual(gif("one"));
    expect(await (await fetch(`${two.base}/api/canvases/${first.canvas}`)).text()).toBe(canvas("one"));
    expect((await (await fetch(`${two.base}/api/library/${first.item}`)).json()).name).toBe("one");
    // The library item the first run wrote names the asset, so it is in use.
    expect(await fetch(`${two.base}/api/assets?unused=1`).then((r) => r.json())).toEqual([]);
    const second = await save(two.base, "two");
    const put = await fetch(`${two.base}/api/library/${first.item}`, { method: "PUT", headers: library, body: JSON.stringify({ name: "renamed", copies: [{ profileId: "p" }] }) });
    expect(put.status).toBe(200);
    await two.stop();

    const three = await start(root);
    expect((await (await fetch(`${three.base}/api/assets`)).json()).map((x) => x.id).sort()).toEqual([first.asset, second.asset].sort());
    expect(await (await fetch(`${three.base}/api/canvases/${second.canvas}`)).text()).toBe(canvas("two"));
    for (const id of [first.item, second.item]) {
      // What the server reads and re-serialises is the file it wrote.
      const body = await (await fetch(`${three.base}/api/library/${id}`)).text();
      expect(fs.readFileSync(path.join(root, "library", `${id}.json`), "utf8")).toBe(body);
    }
    expect((await (await fetch(`${three.base}/api/library/${first.item}`)).json()).name).toBe("renamed");
    expect((await (await fetch(`${three.base}/api/library`)).json()).length).toBe(2);
    await three.stop();
  }, 30_000);
});

describe("integrations across restarts", () => {
  let root;
  afterEach(() => root && fs.rmSync(root, { recursive: true, force: true }));

  const put = (base, body) => fetch(`${base}/api/integrations`, { method: "PUT", headers, body: JSON.stringify(body) });
  const publicOf = async (base) => (await fetch(`${base}/api/integrations`)).json();

  it("reads the pretty file the other wrote and writes the same bytes for the same patch", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ips-integrations-"));
    const first = { obs: { host: "obs-pc", port: 4456, password: "pässword" }, calendar: { links: [{ url: "webcal://a.example/private/x.ics", label: "A" }, { url: "HTTPS://B.example:8443/b c.ics" }] } };
    const one = await start(root);
    expect((await put(one.base, first)).status).toBe(200);
    const stored = await publicOf(one.base);
    await one.stop();
    const byOne = read(root, "integrations.json");
    expect(byOne.startsWith('{\n  "obs": {\n    "host": "obs-pc"')).toBe(true);
    expect(byOne.endsWith("}")).toBe(true);

    const patch = { obs: { port: 4457 }, calendar: { links: [{ id: stored.calendar.links[1].id, label: "B" }] } };
    const two = await start(root);
    expect(await publicOf(two.base)).toEqual(stored);
    expect((await put(two.base, patch)).status).toBe(200);
    const after = await publicOf(two.base);
    await two.stop();
    const byTwo = read(root, "integrations.json");

    // The same patch on a third run, from a copy of the file the first run wrote.
    const copy = path.join(root, "copy");
    fs.mkdirSync(copy);
    fs.writeFileSync(path.join(copy, "integrations.json"), byOne);
    const three = await start(copy);
    expect((await put(three.base, patch)).status).toBe(200);
    expect(await publicOf(three.base)).toEqual(after);
    await three.stop();
    expect(read(copy, "integrations.json")).toBe(byTwo);
    expect(after).toEqual({ obs: { host: "obs-pc", port: 4457, hasPassword: true }, calendar: { links: [{ id: stored.calendar.links[1].id, label: "B", host: "b.example:8443" }] } });
  }, 30_000);
});

describe("alerts across restarts", () => {
  let root;
  afterEach(() => root && fs.rmSync(root, { recursive: true, force: true }));

  const rule = { id: "r1", name: "GPU temp", enabled: true, severity: "critical", cooldownSeconds: 0, source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 0 }, outputs: {} };
  const testAlert = (base) => fetch(`${base}/api/control/alert`, { method: "POST", headers: controlHeaders, body: JSON.stringify({ action: "test", ruleId: "r1" }) });
  const historyOf = async (base) => (await fetch(`${base}/api/alerts/history`)).json();
  /** The history reaches alerts.json a second after it changes (the file is written compact). */
  async function saved(dir, count) {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const file = path.join(dir, "alerts.json");
      if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).history.length >= count) return read(dir, "alerts.json");
    }
    throw new Error("alerts.json was not written");
  }

  it("reads the history the other wrote, closes the entries left open, and writes a file the other reads back", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ips-alerts-"));
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify({ profiles: [{ id: "desk", pages: [{ id: "main" }] }], alerts: { enabled: true, rules: [rule] } }));
    const one = await start(root);
    expect((await testAlert(one.base)).status).toBe(200);
    const byOne = await saved(root, 1);
    await one.stop();
    expect(byOne.startsWith('{"history":[{"id":"')).toBe(true);
    expect(byOne).not.toContain("endedAt");

    const two = await start(root);
    const loaded = await historyOf(two.base);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ ruleId: "r1", test: true, text: "" });
    expect(typeof loaded[0].endedAt).toBe("number");
    expect((await testAlert(two.base)).status).toBe(200);
    const byTwo = await saved(root, 2);
    const live = await historyOf(two.base);
    await two.stop();
    // Compact, newest first, the first run's entry (now closed) after the second run's.
    expect(byTwo).toBe(JSON.stringify({ history: live }));
    expect(live.map((h) => h.id)).toEqual([live[0].id, loaded[0].id]);

    const three = await start(root);
    expect(await historyOf(three.base)).toEqual(live.map((h) => ({ ...h, endedAt: h.endedAt ?? expect.any(Number) })));
    await three.stop();
  }, 30_000);
});
