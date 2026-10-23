import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./fixtures";

// /api/image-proxy at the HTTP level (server/proxy.mjs): raster goes through with nosniff; SVG, HTML and other
// non-images are refused with 406; a redirect off loopback to a link-local address is refused with 502.
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

let upstream: http.Server;
let origin: string;

test.beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    const routes: Record<string, () => void> = {
      "/jpg": () => res.writeHead(200, { "Content-Type": "image/jpeg" }).end(jpeg),
      "/png-octet": () => res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(png),
      "/svg": () => res.writeHead(200, { "Content-Type": "image/svg+xml" }).end("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      "/html": () => res.writeHead(200, { "Content-Type": "text/html" }).end("<html>"),
      "/octet-html": () => res.writeHead(200, { "Content-Type": "application/octet-stream" }).end("<html>"),
      "/json": () => res.writeHead(200, { "Content-Type": "application/json" }).end("{}"),
      "/missing": () => res.writeHead(404).end(),
      "/hop": () => res.writeHead(302, { Location: "/jpg" }).end(),
      "/escape": () => res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }).end(),
    };
    (routes[req.url ?? ""] ?? routes["/missing"])();
  });
  await new Promise<void>((ok) => upstream.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

test.afterAll(() => {
  upstream?.close();
});

test("relays raster images with nosniff and refuses everything else", async ({ scratch }) => {
  const proxy = (p: string) => fetch(`${scratch.base}/api/image-proxy?url=${encodeURIComponent(origin + p)}`);

  const jpg = await proxy("/jpg");
  expect(jpg.status).toBe(200);
  expect(jpg.headers.get("content-type")).toBe("image/jpeg");
  expect(jpg.headers.get("x-content-type-options")).toBe("nosniff");

  const sniffed = await proxy("/png-octet");
  expect(sniffed.status).toBe(200);
  expect(sniffed.headers.get("content-type")).toBe("image/png");
  expect(sniffed.headers.get("x-content-type-options")).toBe("nosniff");

  for (const p of ["/svg", "/html", "/octet-html", "/json"]) expect((await proxy(p)).status, p).toBe(406);
  expect((await proxy("/missing")).status).toBe(404);

  const hop = await proxy("/hop");
  expect(hop.status).toBe(200);
  expect(hop.headers.get("content-type")).toBe("image/jpeg");
  expect((await proxy("/escape")).status).toBe(502);
});

test("refuses bad targets and other methods", async ({ scratch }) => {
  const at = (url: string) => fetch(`${scratch.base}/api/image-proxy?url=${encodeURIComponent(url)}`);
  expect((await fetch(`${scratch.base}/api/image-proxy`)).status).toBe(400);
  expect((await at("not a url")).status).toBe(400);
  // Plain http only on loopback; file: never.
  expect((await at("http://example.com/a.png")).status).toBe(400);
  expect((await at("file:///etc/passwd")).status).toBe(400);
  expect((await fetch(`${scratch.base}/api/image-proxy?url=x`, { method: "POST" })).status).toBe(405);
});
