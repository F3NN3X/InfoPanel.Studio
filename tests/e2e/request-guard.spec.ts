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
    for (const path of ["/api/config", "/api/control/page", "/api/integrations"]) {
      const method = path === "/api/integrations" ? "PUT" : "POST";
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
});

/** This machine's first non-internal IPv4 address, to reach the server as "another machine". */
const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

test.describe("writes from another machine", () => {
  test.skip(!lanAddress, "needs a non-loopback IPv4 address");
  for (const remoteEdit of ["0", "1"]) {
    test(`ALLOW_REMOTE_EDIT=${remoteEdit}`, async () => {
      const { startScratch } = await import("../../tools/perf/scratch.mjs");
      const scratch = await startScratch({ env: { HOST: "0.0.0.0", ALLOW_REMOTE_EDIT: remoteEdit } });
      try {
        const host = `${lanAddress}:${new URL(scratch.base).port}`;
        const at = (method: string, path: string, body?: string) => request(scratch.base, { method, path, address: lanAddress, headers: { host, ...json }, body });
        const current = await (await fetch(`${scratch.base}/api/config`)).text();
        const configWrite = (await at("POST", "/api/config", current)).status;
        const integrationsWrite = (await at("PUT", "/api/integrations", "{}")).status;
        if (remoteEdit === "1") {
          expect(configWrite).toBe(200);
          expect(integrationsWrite).toBe(200);
        } else {
          expect(configWrite).toBe(403);
          expect(integrationsWrite).toBe(403);
        }
        // Reads and control stay open to the network either way.
        expect((await at("GET", "/api/config")).status).toBe(200);
        expect((await at("GET", "/api/control")).status).toBe(200);
        // Agent posts are this machine's only, whatever the switch.
        const agent = await request(scratch.base, { method: "POST", path: "/api/agents/event?agent=claude", address: lanAddress, headers: { host, "content-type": "application/json", "x-agent-event": "1" }, body: "{}" });
        expect(agent.status).toBe(403);
      } finally {
        scratch.stop();
      }
    });
  }
});
