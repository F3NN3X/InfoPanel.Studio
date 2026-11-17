import http from "node:http";
import os from "node:os";
import { expect, test } from "./fixtures";

// ips-server's request_guard.rs at the HTTP level.
// fetch can't set Host, so these requests go through node:http.

interface Answer {
  status: number;
}

function request(base: string, { method = "GET", path = "/", headers = {}, body, address }: { method?: string; path?: string; headers?: Record<string, string>; body?: string; address?: string }): Promise<Answer> {
  const url = new URL(base);
  return new Promise((ok, fail) => {
    const req = http.request({ host: address ?? url.hostname, port: url.port, method, path, headers }, (res) => {
      res.resume();
      res.on("end", () => ok({ status: res.statusCode ?? 0 }));
    });
    req.on("error", fail);
    req.end(body);
  });
}

const ROUTES = [
  "/",
  "/?kiosk=1",
  "/api/health",
  "/api/config",
  "/api/control",
  "/api/assets",
  "/api/assets/app-icon",
  "/api/media/act",
  "/api/actions",
  "/api/actions/run",
  "/api/actions/log",
  "/api/agents/permission",
  "/api/agents/requests",
  "/api/agents/answer",
  "/api/canvases",
  "/api/library",
  "/api/integrations",
  "/api/extras",
  "/api/alerts/history",
  "/api/infopanel/installed",
  "/api/server/stats",
  "/api/image-proxy?url=x",
  "/api/font-proxy?url=x",
  "/events/config",
  "/events/control",
  "/events/extras",
];

test("refuses a disallowed Host on every route and method", async ({ scratch }) => {
  for (const path of ROUTES) {
    for (const method of ["GET", "POST"]) {
      expect((await request(scratch.base, { method, path, headers: { host: "evil.example" } })).status, `${method} ${path}`).toBe(421);
    }
  }
  expect((await request(scratch.base, { path: "/api/health", headers: { host: "evil.example:3922" } })).status).toBe(421);
  expect((await request(scratch.base, { path: "/api/health", headers: { host: "localhost:5173" } })).status).toBe(200);
});

const json = { "content-type": "application/json", "x-dashboard-config": "1", "x-dashboard-control": "1" };

test("refuses cross-site writes", async ({ scratch }) => {
  const host = new URL(scratch.base).host;
  const foreign: Record<string, string>[] = [{ origin: "http://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }];
  for (const extra of foreign) {
    for (const path of ["/api/config", "/api/control/page", "/api/integrations", "/api/assets/app-icon", "/api/media/act", "/api/actions/run", "/api/actions", "/api/agents/answer"]) {
      const method = path === "/api/integrations" || path === "/api/actions" ? "PUT" : "POST";
      expect((await request(scratch.base, { method, path, headers: { host, ...json, ...extra }, body: "{}" })).status, `${path} ${JSON.stringify(extra)}`).toBe(403);
    }
  }
  // Reads are not checked for origin.
  expect((await request(scratch.base, { path: "/api/control", headers: { host, origin: "http://evil.example", "sec-fetch-site": "cross-site" } })).status).toBe(200);
});

test("requires the write headers", async ({ scratch }) => {
  const host = new URL(scratch.base).host;
  const config = (headers: Record<string, string>) => request(scratch.base, { method: "POST", path: "/api/config", headers: { host, ...headers }, body: "{}" });
  expect((await config({ "content-type": "text/plain", "x-dashboard-config": "1" })).status).toBe(415);
  expect((await config({ "content-type": "application/json" })).status).toBe(403);
  const control = (headers: Record<string, string>) => request(scratch.base, { method: "POST", path: "/api/control/page", headers: { host, ...headers }, body: "{}" });
  expect((await control({ "content-type": "application/json" })).status).toBe(403);
  expect((await control({ "content-type": "text/plain", "x-dashboard-control": "1" })).status).toBe(415);
  // an app's icon (P5): the asset header, then JSON
  const icon = (headers: Record<string, string>) => request(scratch.base, { method: "POST", path: "/api/assets/app-icon", headers: { host, ...headers }, body: '{"exe":"notepad.exe"}' });
  expect((await icon({ "content-type": "application/json" })).status).toBe(403);
  expect((await icon({ "content-type": "text/plain", "x-dashboard-asset": "1" })).status).toBe(415);
  // the media keys (P6): the control header, then JSON; a key it doesn't know is refused, so no key is pressed here
  const media = (headers: Record<string, string>) => request(scratch.base, { method: "POST", path: "/api/media/act", headers: { host, ...headers }, body: '{"key":"volume-up"}' });
  expect((await media({ "content-type": "application/json" })).status).toBe(403);
  expect((await media({ "content-type": "text/plain", "x-dashboard-control": "1" })).status).toBe(415);
  expect((await media({ "content-type": "application/json", "x-dashboard-control": "1" })).status).toBe(400);
  // the action runner (P7): the control header, then JSON; off by default, so even a good body runs nothing (403)
  const run = (headers: Record<string, string>) => request(scratch.base, { method: "POST", path: "/api/actions/run", headers: { host, ...headers }, body: '{"command":"notepad.exe"}' });
  expect((await run({ "content-type": "application/json" })).status).toBe(403);
  expect((await run({ "content-type": "text/plain", "x-dashboard-control": "1" })).status).toBe(415);
  expect((await run({ "content-type": "application/json", "x-dashboard-control": "1" })).status).toBe(403);
  const approve = (headers: Record<string, string>) => request(scratch.base, { method: "PUT", path: "/api/actions", headers: { host, ...headers }, body: '{"approve":["notepad.exe"]}' });
  expect((await approve({ "content-type": "application/json" })).status).toBe(403);
  expect((await approve({ "content-type": "text/plain", "x-dashboard-control": "1" })).status).toBe(415);
  // agent approvals (P8, security review): nothing reads or answers a request over HTTP, from this machine either, whatever
  // the headers; the app's prompt window does both by IPC
  for (const headers of [{}, { "x-agent-answer": "1" }] as Record<string, string>[]) {
    expect((await request(scratch.base, { path: "/api/agents/requests", headers: { host, ...headers } })).status).toBe(403);
    expect((await request(scratch.base, { path: "/api/agents/requests/log", headers: { host, ...headers } })).status).toBe(403);
    const answer = await request(scratch.base, { method: "POST", path: "/api/agents/answer", headers: { host, "content-type": "application/json", ...headers }, body: '{"id":"x","behavior":"allow"}' });
    expect(answer.status).toBe(403);
  }
  const ask = (headers: Record<string, string>) => request(scratch.base, { method: "POST", path: "/api/agents/permission?agent=claude", headers: { host, ...headers }, body: "{}" });
  expect((await ask({ "content-type": "application/json" })).status).toBe(403);
});

/** This machine's first non-internal IPv4 address, to reach the server as "another machine". */
const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

// Listening beyond loopback makes Windows Firewall prompt for every new ips-server path (each worktree builds its own),
// so on a dev machine this runs only when asked (VERIFY_LAN=1). CI always runs it.
const lanRun = !!process.env.CI || process.env.VERIFY_LAN === "1";

test.describe("writes from another machine", () => {
  test.skip(!lanRun, "listens on the network: CI only, or VERIFY_LAN=1 (avoids the Windows Firewall prompt)");
  test.skip(!lanAddress, "needs a non-loopback IPv4 address");
  for (const remoteEdit of ["0", "1"]) {
    test(`ALLOW_REMOTE_EDIT=${remoteEdit}`, async () => {
      const { startScratch } = await import("../../tools/perf/scratch.mjs");
      // uploads follow the same switch here, to show an app's icon is read for this machine whatever ALLOW_REMOTE_UPLOAD says
      // the action runner is on, to show a command still needs this machine's approval (P7)
      const scratch = await startScratch({ env: { HOST: "0.0.0.0", ALLOW_REMOTE_EDIT: remoteEdit, ALLOW_REMOTE_UPLOAD: remoteEdit, ACTION_RUNNER: "on", AGENT_APPROVALS: "claude" } });
      try {
        const host = `${lanAddress}:${new URL(scratch.base).port}`;
        const at = (method: string, path: string, body?: string) => request(scratch.base, { method, path, address: lanAddress, headers: { host, ...json }, body });
        const current = await (await fetch(`${scratch.base}/api/config`)).text();
        const configWrite = (await at("POST", "/api/config", current)).status;
        const integrationsWrite = (await at("PUT", "/api/integrations", "{}")).status;
        // a media key (P6) follows the same switch; an unknown key, so passing the guard presses nothing (400)
        const mediaWrite = (await at("POST", "/api/media/act", '{"key":"volume-up"}')).status;
        if (remoteEdit === "1") {
          expect(configWrite).toBe(200);
          expect(integrationsWrite).toBe(200);
          expect(mediaWrite).toBe(400);
        } else {
          expect(configWrite).toBe(403);
          expect(integrationsWrite).toBe(403);
          expect(mediaWrite).toBe(403);
        }
        // Reads and control stay open to the network either way.
        expect((await at("GET", "/api/config")).status).toBe(200);
        expect((await at("GET", "/api/control")).status).toBe(200);
        // Agent posts are this machine's only, whatever the switch.
        const agent = await request(scratch.base, { method: "POST", path: "/api/agents/event?agent=claude", address: lanAddress, headers: { host, "content-type": "application/json", "x-agent-event": "1" }, body: "{}" });
        expect(agent.status).toBe(403);
        // An app's icon reads this machine's programs: this machine's only, whatever the switches.
        const icon = await request(scratch.base, { method: "POST", path: "/api/assets/app-icon", address: lanAddress, headers: { host, "content-type": "application/json", "x-dashboard-asset": "1" }, body: '{"exe":"notepad.exe"}' });
        expect(icon.status).toBe(403);
        // Commands (P7): approving is this machine's only, whatever the switch, so a command written into the config from
        // another machine never runs; a run from another machine needs remote editing, and then still the approval.
        expect((await at("PUT", "/api/actions", '{"approve":["notepad.exe"]}')).status).toBe(403);
        expect((await at("PUT", "/api/actions", '{"testMode":true}')).status).toBe(403);
        const run = await at("POST", "/api/actions/run", '{"command":"notepad.exe"}');
        expect(run.status).toBe(403);
        expect((await at("GET", "/api/actions")).status).toBe(remoteEdit === "1" ? 200 : 403);
        expect((await at("GET", "/api/actions/log")).status).toBe(remoteEdit === "1" ? 200 : 403);
        const log = (await (await fetch(`${scratch.base}/api/actions/log`)).json()) as { entries: { reason?: string; from: string }[] };
        expect(log.entries.map((e) => e.reason)).toEqual([remoteEdit === "1" ? "unapproved" : "remote"]);
        // Agent approvals (P8): another device never reads a request's command, never answers one, and never asks one.
        const agentAnswer = { host, "content-type": "application/json", "x-agent-answer": "1" };
        expect((await request(scratch.base, { path: "/api/agents/requests", address: lanAddress, headers: agentAnswer })).status).toBe(403);
        expect((await request(scratch.base, { path: "/api/agents/requests/log", address: lanAddress, headers: agentAnswer })).status).toBe(403);
        expect((await request(scratch.base, { method: "POST", path: "/api/agents/answer", address: lanAddress, headers: agentAnswer, body: '{"id":"x","behavior":"allow"}' })).status).toBe(403);
        const ask = await request(scratch.base, { method: "POST", path: "/api/agents/permission?agent=claude", address: lanAddress, headers: { host, "content-type": "application/json", "x-agent-event": "1" }, body: "{}" });
        expect(ask.status).toBe(403);
      } finally {
        scratch.stop();
      }
    });
  }
});
