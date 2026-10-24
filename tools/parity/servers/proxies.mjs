// /api/image-proxy and /api/font-proxy (step 7). Every target is local: an upstream on loopback started here answers by
// path, https targets are this machine (refused before any connection, 504), and the font catalogue is served from a
// fresh copy seeded into both data folders. A Font Squirrel URL other than the catalogue would reach the internet, so
// only its refusals are compared.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { get, request } from "./lib.mjs";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const CATALOGUE = "https://www.fontsquirrel.com/api/fontlist/all";

const ROUTES = {
  "/jpg": (res) => res.writeHead(200, { "Content-Type": "image/jpeg" }).end(JPEG),
  "/jpg-junk": (res) => res.writeHead(200, { "Content-Type": "IMAGE/JPEG; q=1" }).end("junk"),
  "/png-octet": (res) => res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(PNG),
  "/png-untyped": (res) => res.writeHead(200).end(PNG),
  "/svg": (res) => res.writeHead(200, { "Content-Type": "image/svg+xml" }).end("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  "/html": (res) => res.writeHead(200, { "Content-Type": "text/html" }).end("<html>"),
  "/octet-html": (res) => res.writeHead(200, { "Content-Type": "application/octet-stream" }).end("<html>"),
  "/json": (res) => res.writeHead(200, { "Content-Type": "application/json" }).end("{}"),
  "/teapot": (res) => res.writeHead(418, { "Content-Type": "image/png" }).end(PNG),
  "/hop": (res) => res.writeHead(302, { Location: "/jpg" }).end(),
  "/hop-localhost": (res) => res.writeHead(301, { Location: `http://localhost:${port}/png-octet` }).end(),
  "/no-location": (res) => res.writeHead(302).end(),
  "/escape": (res) => res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }).end(),
  "/to-private": (res) => res.writeHead(302, { Location: "https://10.0.0.1/x" }).end(),
  "/to-file": (res) => res.writeHead(302, { Location: "file:///etc/passwd" }).end(),
  "/bad-location": (res) => res.writeHead(302, { Location: "http://[::1" }).end(),
  "/loop": (res) => res.writeHead(302, { Location: "/loop" }).end(),
  "/three": (res) => res.writeHead(302, { Location: "/two" }).end(),
  "/two": (res) => res.writeHead(302, { Location: "/one" }).end(),
  "/one": (res) => res.writeHead(302, { Location: "/jpg" }).end(),
  "/huge": (res) => res.writeHead(200, { "Content-Type": "image/png", "Content-Length": String(25 * 1024 * 1024 + 1) }).end(),
  "/cut": (res) => {
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": "100" });
    res.write(PNG);
    res.socket.destroy();
  },
};

const upstream = http.createServer((req, res) => (ROUTES[req.url] ?? ((r) => r.writeHead(404).end()))(res));
await new Promise((ok) => upstream.listen(0, "127.0.0.1", ok));
upstream.unref();
const port = upstream.address().port;
const origin = `http://127.0.0.1:${port}`;

/** Writes the fresh catalogue copy into a data folder (compare-servers.mjs calls it before a server starts). */
export function seedFontCache(dataDir) {
  fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "cache", "fontsquirrel-list.json"), '[{"family_name":"Roboto"}]');
}

const image = (url, extra) => ({ ...get(`/api/image-proxy?url=${encodeURIComponent(url)}`, extra), label: `image-proxy ${url}` });
const font = (url) => ({ ...get(`/api/font-proxy?url=${encodeURIComponent(url)}`), label: `font-proxy ${url}` });

export const cases = [
  ...Object.keys(ROUTES).map((p) => image(`${origin}${p}`)),
  image(`${origin}/missing`),
  image(`http://localhost:${port}/jpg`),
  // Refused targets.
  get("/api/image-proxy"),
  get("/api/image-proxy?url="),
  ...["not a url", "/relative", "http://example.com/a.png", "file:///etc/passwd", "ftp://example.com/a", "http://127.0.0.2/a", "http://[::ffff:127.0.0.1]/a", "data:image/png;base64,AA"].map((u) => image(u)),
  // This machine and the LAN over https: refused before any connection.
  ...["https://127.0.0.1:1/a.png", "https://[::1]:1/a.png", "https://[::ffff:127.0.0.1]:1/a.png", "https://localhost:1/a.png", "https://10.0.0.1/a.png", "https://169.254.169.254/latest"].map((u) => image(u)),
  image("http://127.0.0.1:1/a.png"),
  ...["POST", "PUT", "DELETE", "OPTIONS", "HEAD"].map((m) => request(`${m} /api/image-proxy?url=${encodeURIComponent(`${origin}/jpg`)} HTTP/1.1`)),
  image(`${origin}/jpg`, { where: "lan" }),
  // The font proxy.
  font(CATALOGUE),
  ...["", "not a url", "https://evil.example/x", "http://www.fontsquirrel.com/x", "https://fonts.google.com/x", "https://cdn.jsdelivr.net/x.ttf"].map(font),
  get("/api/font-proxy"),
  ...["POST", "PUT", "DELETE", "OPTIONS"].map((m) => request(`${m} /api/font-proxy?url=${encodeURIComponent(CATALOGUE)} HTTP/1.1`)),
];
