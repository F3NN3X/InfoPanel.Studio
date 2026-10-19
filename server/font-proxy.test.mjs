import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE, createFontProxy, fetchBytes, hopAllowed, proxyAllowed } from "./font-proxy.mjs";

const response = (status, body = "", headers = {}) => new Response(status === 302 || status === 202 ? null : body, { status, headers });

describe("host checks", () => {
  it("proxies Font Squirrel over HTTPS only", () => {
    expect(proxyAllowed("https://www.fontsquirrel.com/fonts/download/roboto")).toBe(true);
    for (const bad of ["http://www.fontsquirrel.com/x", "https://evil.example/x", "https://fonts.google.com/x", "not a url"]) {
      expect(proxyAllowed(bad)).toBe(false);
    }
  });

  it("follows redirects to font hosts only", () => {
    expect(hopAllowed("https://cdn.jsdelivr.net/x.ttf")).toBe(true);
    expect(hopAllowed("https://127.0.0.1/x")).toBe(false);
    expect(hopAllowed("file:///C:/x")).toBe(false);
  });
});

describe("fetchBytes", () => {
  it("follows a checked redirect", async () => {
    const calls = [];
    const fake = async (url) => {
      calls.push(url);
      return url.endsWith("/a") ? new Response(null, { status: 302, headers: { location: "https://cdn.jsdelivr.net/b" } }) : response(200, "font");
    };
    expect(new TextDecoder().decode(await fetchBytes("https://www.fontsquirrel.com/a", fake))).toBe("font");
    expect(calls).toEqual(["https://www.fontsquirrel.com/a", "https://cdn.jsdelivr.net/b"]);
  });

  it("refuses a redirect off the font hosts", async () => {
    const fake = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    await expect(fetchBytes("https://www.fontsquirrel.com/a", fake)).rejects.toThrow("refusing to fetch");
  });
});

describe("the route", () => {
  const run = async (url, fake, cacheDir) => {
    const out = {};
    const res = {
      writeHead: (status, headers) => Object.assign(out, { status, headers }),
      end: (body = "") => Object.assign(out, { body: Buffer.from(body).toString() }),
    };
    const send = (r, status, body = "") => {
      r.writeHead(status, {});
      r.end(body);
    };
    await createFontProxy({ cacheDir, send, fetchImpl: fake })({ method: "GET" }, res, new URLSearchParams({ url }));
    return out;
  };

  it("refuses other URLs", async () => {
    expect((await run("https://evil.example/x", async () => response(200, "x"), os.tmpdir())).status).toBe(400);
  });

  it("serves the body sandboxed", async () => {
    const out = await run("https://www.fontsquirrel.com/fonts/download/x", async () => response(200, "zip"), os.tmpdir());
    expect(out).toMatchObject({ status: 200, body: "zip" });
    expect(out.headers["Content-Security-Policy"]).toContain("sandbox");
  });

  it("keeps the catalogue and serves the copy while Font Squirrel throttles", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "font-proxy-"));
    try {
      expect((await run(CATALOGUE, async () => response(200, "[1]"), dir)).body).toBe("[1]");
      fs.utimesSync(path.join(dir, "fontsquirrel-list.json"), new Date(0), new Date(0));
      expect((await run(CATALOGUE, async () => response(202), dir)).body).toBe("[1]");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
