import { describe, expect, it } from "vitest";
import { configWriteRefusal, controlWriteRefusal, createRequestGuard, hostnameOf, parseAllowedHosts } from "../../server/request-guard.mjs";

const req = (method, headers) => ({ method, headers });

describe("hostnameOf", () => {
  it("strips the port and lowercases", () => {
    expect(hostnameOf("LocalHost:3922")).toBe("localhost");
    expect(hostnameOf("[::1]:3922")).toBe("[::1]");
    expect(hostnameOf("evil.example")).toBe("evil.example");
  });
  it("rejects junk", () => {
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf("a b")).toBeNull();
    expect(hostnameOf("a/b")).toBeNull();
  });
});

describe("host allowlist", () => {
  const guard = createRequestGuard({ host: "127.0.0.1" });
  it("allows loopback names with or without a port", () => {
    for (const h of ["localhost", "localhost:3922", "127.0.0.1:3922", "[::1]:3922", "localhost:5173"]) {
      expect(guard(req("GET", { host: h }))).toBeNull();
    }
  });
  it("refuses other names and a missing Host on every method", () => {
    expect(guard(req("GET", { host: "evil.example" }))?.status).toBe(421);
    expect(guard(req("GET", { host: "evil.example:3922" }))?.status).toBe(421);
    expect(guard(req("POST", { host: "evil.example" }))?.status).toBe(421);
    expect(guard(req("GET", {}))?.status).toBe(421);
    expect(guard(req("GET", { host: "192.168.1.5:3922" }))?.status).toBe(421);
  });
  it("allows the configured HOST and ALLOWED_HOSTS", () => {
    const g = createRequestGuard({ host: "panel.lan", allowedHosts: ["Kiosk.Local"] });
    expect(g(req("GET", { host: "panel.lan:3922" }))).toBeNull();
    expect(g(req("GET", { host: "kiosk.local" }))).toBeNull();
    expect(g(req("GET", { host: "192.168.1.5" }))?.status).toBe(421);
  });
  it("allows IP literals and the machine name when listening on all interfaces", () => {
    const g = createRequestGuard({ host: "0.0.0.0", machineName: "GAMING-PC" });
    expect(g(req("GET", { host: "192.168.1.5:3922" }))).toBeNull();
    expect(g(req("GET", { host: "[fe80::1]:3922" }))).toBeNull();
    expect(g(req("GET", { host: "gaming-pc:3922" }))).toBeNull();
    expect(g(req("GET", { host: "evil.example" }))?.status).toBe(421);
  });
});

describe("cross-site writes", () => {
  const guard = createRequestGuard({ host: "127.0.0.1" });
  const host = "127.0.0.1:3922";
  it("allows same-origin and header-less writes", () => {
    expect(guard(req("POST", { host, origin: "http://127.0.0.1:3922", "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(guard(req("POST", { host }))).toBeNull();
    expect(guard(req("DELETE", { host, "sec-fetch-site": "none" }))).toBeNull();
  });
  it("refuses a foreign Origin or cross/same-site fetches", () => {
    expect(guard(req("POST", { host, origin: "http://evil.example" }))?.status).toBe(403);
    expect(guard(req("POST", { host, origin: "null" }))?.status).toBe(403);
    expect(guard(req("POST", { host, "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(guard(req("POST", { host, "sec-fetch-site": "same-site" }))?.status).toBe(403);
  });
  it("does not check reads", () => {
    expect(guard(req("GET", { host, origin: "http://evil.example", "sec-fetch-site": "cross-site" }))).toBeNull();
  });
  it("accepts the Vite dev proxy case (loopback Origin on another port)", () => {
    expect(guard(req("POST", { host: "127.0.0.1:3922", origin: "http://localhost:5173" }))).toBeNull();
    expect(guard(req("POST", { host: "localhost:5173", origin: "http://localhost:5173" }))).toBeNull();
  });
  it("still refuses a foreign Origin when Host is a LAN name", () => {
    const g = createRequestGuard({ host: "0.0.0.0" });
    expect(g(req("POST", { host: "192.168.1.5:3922", origin: "http://localhost:5173" }))?.status).toBe(403);
    expect(g(req("POST", { host: "192.168.1.5:3922", origin: "http://192.168.1.5:3922" }))).toBeNull();
  });
});

describe("parseAllowedHosts / configWriteRefusal", () => {
  it("splits a comma list", () => {
    expect(parseAllowedHosts(" a.lan, b.lan ,,")).toEqual(["a.lan", "b.lan"]);
    expect(parseAllowedHosts(undefined)).toEqual([]);
  });
  it("requires JSON and the custom header", () => {
    expect(configWriteRefusal({ "content-type": "text/plain", "x-dashboard-config": "1" })?.status).toBe(415);
    expect(configWriteRefusal({ "x-dashboard-config": "1" })?.status).toBe(415);
    expect(configWriteRefusal({ "content-type": "application/json" })?.status).toBe(403);
    expect(configWriteRefusal({ "content-type": "application/json; charset=utf-8", "x-dashboard-config": "1" })).toBeNull();
  });
});

describe("controlWriteRefusal", () => {
  it("requires JSON and the control header", () => {
    expect(controlWriteRefusal({ "content-type": "application/json", "x-dashboard-control": "1" })).toBeNull();
    expect(controlWriteRefusal({ "content-type": "text/plain", "x-dashboard-control": "1" })?.status).toBe(415);
    expect(controlWriteRefusal({ "content-type": "application/json" })?.status).toBe(403);
    expect(controlWriteRefusal({ "content-type": "application/json", "x-dashboard-config": "1" })?.status).toBe(403);
  });
});
