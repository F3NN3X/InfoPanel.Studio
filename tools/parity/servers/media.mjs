// An oversize canvas or library body is not compared: Node destroys the socket (the client sees nothing), native answers
// 413 / 400 with Connection: close, as for config.
// /api/assets, /api/canvases, /api/library, /api/infopanel/installed (step 3). Bodies are ASCII, so the raw requests are
// the bytes (a GIF, an SVG and a WOFF header are all 7-bit). The twin data folders end with the same assets/ and canvases/.
import fs from "node:fs";
import path from "node:path";
import { get, request, write } from "./lib.mjs";

const ASSET_GIF = { "Content-Type": "image/gif", "X-Dashboard-Asset": "1" };
const hdr = (h) => `${Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join("")}`;
const GIF = "GIF89a\x01\x00\x01\x00 an asset's bytes";
const GIF2 = "GIF87a\x01\x00\x01\x00 another one's";
const SVG = '<?xml version="1.0"?>\n<!-- c --><svg xmlns="http://www.w3.org/2000/svg"/>';
const WOFF = "wOFF\x00\x01\x00\x00 font";
const sha = async (text) => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text, "latin1").digest("hex");
};

/** Reduces what differs between two servers by design: the file times, the library's random ids and its clock. */
const mapTimes = (t) => t.replace(/"mtime":\d+/g, '"mtime":T').replace(/lib_[a-z0-9]{12}/g, "LIB").replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "TS");

const upload = (headers, body, extra) => write("POST", "/api/assets", hdr(headers), body, extra);
const raw = (label, head, extra) => ({ label, run: (api) => api.raw(`${head}${api.host}Connection: close\r\n\r\n`), ...extra });

const assetCases = [
  get("/api/assets"),
  upload(ASSET_GIF, GIF, { map: mapTimes }),
  upload(ASSET_GIF, GIF, { map: mapTimes }),
  upload(ASSET_GIF, GIF2, { map: mapTimes }),
  upload({ "Content-Type": "image/svg+xml", "X-Dashboard-Asset": "1" }, SVG, { map: mapTimes }),
  upload({ "Content-Type": "font/woff", "X-Dashboard-Asset": "1" }, WOFF, { map: mapTimes }),
  upload({ "Content-Type": "application/font-woff; x=1", "X-Dashboard-Asset": "1" }, WOFF, { map: mapTimes }),
  get("/api/assets", { map: mapTimes }),
  get("/api/assets?unused=1", { map: mapTimes }),
  get("/api/assets?unused=0", { map: mapTimes }),
  upload({ "X-Dashboard-Asset": "1" }, GIF),
  upload({ "Content-Type": "image/gif" }, GIF),
  upload({ "Content-Type": "image/gif", "X-Dashboard-Asset": "0" }, GIF),
  upload({ "Content-Type": "text/html", "X-Dashboard-Asset": "1" }, "<html></html>"),
  upload({ "Content-Type": "image/gif", "X-Dashboard-Asset": "1" }, "<html></html>"),
  upload({ "Content-Type": "image/png", "X-Dashboard-Asset": "1" }, GIF),
  upload({ "Content-Type": "image/gif", "X-Dashboard-Asset": "1" }, ""),
  upload({ "Content-Type": "image/svg+xml", "X-Dashboard-Asset": "1" }, "<html><svg/></html>"),
  upload({ "Content-Type": "video/x-matroska", "X-Dashboard-Asset": "1" }, "no ebml"),
  upload(ASSET_GIF, GIF, { where: "lan" }),
  raw("POST /api/assets (announced 300 KB svg)", `POST /api/assets HTTP/1.1\r\nContent-Type: image/svg+xml\r\nX-Dashboard-Asset: 1\r\nContent-Length: 300000\r\n`),
  raw("POST /api/assets (announced 26 MB image)", `POST /api/assets HTTP/1.1\r\nContent-Type: image/gif\r\nX-Dashboard-Asset: 1\r\nContent-Length: 27000000\r\n`),
  raw("POST /api/assets (announced 31 MB font)", `POST /api/assets HTTP/1.1\r\nContent-Type: font/woff\r\nX-Dashboard-Asset: 1\r\nContent-Length: 31457281\r\n`),
  raw("POST /api/assets (no length)", `POST /api/assets HTTP/1.1\r\nContent-Type: image/gif\r\nX-Dashboard-Asset: 1\r\n`),
  request("PUT /api/assets HTTP/1.1"),
  request("DELETE /api/assets HTTP/1.1"),
  request("OPTIONS /api/assets HTTP/1.1"),
  get("/api/assets/"),
  get("/api/assets/nope"),
  get("/api/assets/..%2Fconfig.json"),
  get(`/api/assets/${"a".repeat(64)}.png`),
  get(`/api/assets/${"a".repeat(64)}.PNG`),
  request(`HEAD /api/assets/${"a".repeat(64)}.png HTTP/1.1`),
  request(`PUT /api/assets/${"a".repeat(64)}.png HTTP/1.1`),
  request(`POST /api/assets/${"a".repeat(64)}.png HTTP/1.1`),
  request("DELETE /api/assets/nope HTTP/1.1\r\nX-Dashboard-Asset: 1"),
  request(`DELETE /api/assets/${"a".repeat(64)}.png HTTP/1.1`),
  request(`DELETE /api/assets/${"a".repeat(64)}.png HTTP/1.1\r\nX-Dashboard-Asset: 1`),
  request(`DELETE /api/assets/${"a".repeat(64)}.png HTTP/1.1\r\nX-Dashboard-Asset: 1`, null, { where: "lan" }),
];

/** Asset reads that need the hash of what was uploaded: ranges, HEAD, the svg sandbox, unused, delete. */
const stored = (label, ext, build) => ({
  label,
  run: async (api) => {
    const hash = await sha(ext.text);
    return api.raw(build(api, `/api/assets/${hash}.${ext.ext}`, hash));
  },
});
const reads = [
  ["GET", {}],
  ["HEAD", {}],
  ["GET", { Range: "bytes=2-5" }],
  ["GET", { Range: "bytes=-4" }],
  ["GET", { Range: "bytes=4-" }],
  ["GET", { Range: "bytes=0-0" }],
  ["GET", { Range: "bytes=500-" }],
  ["GET", { Range: "bytes=-0" }],
  ["GET", { Range: "bytes=9-2" }],
  ["GET", { Range: "bytes=0-1,3-4" }],
  ["GET", { Range: "bytes=x-y" }],
  ["GET", { Range: "items=0-1" }],
  ["GET", { Range: "bytes=99999999999999999999-" }],
  ["HEAD", { Range: "bytes=1-2" }],
  ["HEAD", { Range: "bytes=900-" }],
];
const servedCases = [
  ...reads.map(([method, h]) => stored(`${method} gif ${JSON.stringify(h)}`, { text: GIF, ext: "gif" }, (api, url) => `${method} ${url} HTTP/1.1\r\n${hdr(h)}${api.host}Connection: close\r\n\r\n`)),
  stored("GET svg", { text: SVG, ext: "svg" }, (api, url) => `GET ${url} HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`),
  stored("HEAD woff", { text: WOFF, ext: "woff" }, (api, url) => `HEAD ${url} HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`),
  stored("GET woff (remote header)", { text: WOFF, ext: "woff" }, (api, url) => `GET ${url} HTTP/1.1\r\nX-Dashboard-Asset: 1\r\n${api.host}Connection: close\r\n\r\n`),
];

/** A library or config text that names the uploaded GIF, so `?unused=1` leaves it out; then the delete. */
const usedCases = [
  {
    label: "unused with a config naming an asset",
    run: async (api) => {
      const hash = await sha(GIF);
      const body = JSON.stringify({ version: 1, bg: `/api/assets/${hash}.gif` });
      const saved = await api.raw(`POST /api/config HTTP/1.1\r\nContent-Type: application/json\r\nX-Dashboard-Config: 1\r\n${api.host}Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
      const unused = await api.raw(`GET /api/assets?unused=1 HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`);
      return [saved, unused].join("\n=====\n");
    },
    map: mapTimes,
  },
  {
    label: "unused with a library item and a canvas naming assets",
    run: async (api) => {
      const hash = await sha(GIF2);
      const canvas = JSON.stringify({ format: "infopanel-canvas", version: 1, assets: [{ hash }] });
      const saved = await api.raw(`POST /api/canvases HTTP/1.1\r\nContent-Type: application/json\r\nX-Dashboard-Canvas: 1\r\n${api.host}Content-Length: ${canvas.length}\r\nConnection: close\r\n\r\n${canvas}`);
      const unused = await api.raw(`GET /api/assets?unused=1 HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`);
      const hash2 = await sha(WOFF);
      const item = JSON.stringify({ kind: "font", name: "f", files: [`${hash2}.woff`] });
      const made = await api.raw(`POST /api/library HTTP/1.1\r\nContent-Type: application/json\r\nX-Dashboard-Library: 1\r\n${api.host}Content-Length: ${item.length}\r\nConnection: close\r\n\r\n${item}`);
      const after = await api.raw(`GET /api/assets?unused=1 HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`);
      return [saved, unused, made, after].join("\n=====\n");
    },
    map: mapTimes,
  },
  {
    label: "delete an uploaded asset",
    run: async (api) => {
      const hash = await sha(GIF2);
      const url = `/api/assets/${hash}.gif`;
      const del = (h) => api.raw(`DELETE ${url} HTTP/1.1\r\n${h}${api.host}Connection: close\r\n\r\n`);
      const out = [await del(""), await del("X-Dashboard-Asset: 1\r\n"), await del("X-Dashboard-Asset: 1\r\n"), await api.raw(`GET ${url} HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`)];
      return out.join("\n=====\n");
    },
  },
];

const CANVAS = { "Content-Type": "application/json", "X-Dashboard-Canvas": "1" };
const canvas = (name) => JSON.stringify({ format: "infopanel-canvas", version: 1, source: { name }, items: [] });
const canvasCases = [
  write("POST", "/api/canvases", hdr(CANVAS), canvas("one")),
  write("POST", "/api/canvases", hdr(CANVAS), canvas("one")),
  write("POST", "/api/canvases", hdr(CANVAS), canvas("é ü — ✓")),
  write("POST", "/api/canvases", hdr(CANVAS), canvas("two")),
  write("POST", "/api/canvases", hdr({ "Content-Type": "application/json" }), canvas("one")),
  write("POST", "/api/canvases", hdr({ "X-Dashboard-Canvas": "1" }), canvas("one")),
  write("POST", "/api/canvases", hdr({ "Content-Type": "text/plain", "X-Dashboard-Canvas": "1" }), canvas("one")),
  write("POST", "/api/canvases", hdr({ "Content-Type": "Application/JSON; charset=utf-8", "X-Dashboard-Canvas": "1" }), canvas("three")),
  write("POST", "/api/canvases", hdr(CANVAS), "{}"),
  write("POST", "/api/canvases", hdr(CANVAS), "[]"),
  write("POST", "/api/canvases", hdr(CANVAS), "null"),
  write("POST", "/api/canvases", hdr(CANVAS), "{nope"),
  write("POST", "/api/canvases", hdr(CANVAS), ""),
  write("POST", "/api/canvases", hdr(CANVAS), canvas("lan"), { where: "lan" }),
  get("/api/canvases"),
  request("PUT /api/canvases HTTP/1.1"),
  request("DELETE /api/canvases HTTP/1.1"),
  get("/api/canvases/"),
  get("/api/canvases/nope"),
  get("/api/canvases/..%2Fconfig"),
  get(`/api/canvases/cnv_${"0".repeat(32)}`),
  request(`PUT /api/canvases/cnv_${"0".repeat(32)} HTTP/1.1`),
  request(`DELETE /api/canvases/cnv_${"0".repeat(32)} HTTP/1.1`),
  request("DELETE /api/canvases/nope HTTP/1.1"),
  {
    label: "canvas round trip and the config ref check",
    run: async (api) => {
      const text = canvas("one");
      const { createHash } = await import("node:crypto");
      const id = `cnv_${createHash("sha256").update(text).digest("hex").slice(0, 32)}`;
      const config = (...ids) => JSON.stringify({ version: 1, profiles: [{ pages: [{ placements: ids.map((canvasRef) => ({ canvasRef })) }] }] });
      const post = (body) => api.raw(`POST /api/config HTTP/1.1\r\nContent-Type: application/json\r\nX-Dashboard-Config: 1\r\n${api.host}Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
      const out = [await api.raw(`GET /api/canvases/${id} HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`)];
      out.push(await post(config(id)), await post(config("cnv_" + "1".repeat(32))), await post(config(id, "cnv_" + "1".repeat(32), "cnv_" + "2".repeat(32), "bad", id)));
      for (let i = 3; i < 9; i += 1) out.push(await post(config(...Array.from({ length: i }, (_, k) => `cnv_${String(k).repeat(32)}`))));
      return out.join("\n=====\n");
    },
  },
];

const LIBRARY = { "Content-Type": "application/json", "X-Dashboard-Library": "1" };
const ASSET_ID = `${"a".repeat(64)}.png`;
const libraryWrites = [
  ["{}"], ["null"], ["[]"], ["nope"], [""], ['{"kind":"image"}'], ['{"kind":"nope","name":"x"}'], ['{"kind":"image","name":"  "}'],
  [`{"kind":"image","name":"x","files":["../x"]}`], ['{"kind":"image","name":"x","meta":[]}'], ['{"kind":"image","name":"x","copies":{}}'],
  [`{"kind":"image","name":" Nebula ","files":["${ASSET_ID}","${ASSET_ID}"],"meta":{"w":1920,"2":1,"1":2},"copies":[{"profileId":"p","zoneId":"z","evil":1},"x"],"junk":true}`],
  ['{"kind":"gauge","name":"Arc","data":{"shape":"arc","n":1.0,"big":1e21}}'],
  ['{"kind":"canvas","name":"é ✓ 😀","data":null}'],
];
const libraryCases = [
  get("/api/library", { map: mapTimes }),
  ...libraryWrites.map(([body]) => write("POST", "/api/library", hdr(LIBRARY), body, { map: mapTimes })),
  write("POST", "/api/library", hdr({ "Content-Type": "application/json" }), "{}"),
  write("POST", "/api/library", hdr({ "X-Dashboard-Library": "1" }), "{}"),
  write("POST", "/api/library", hdr({ "Content-Type": "text/plain", "X-Dashboard-Library": "1" }), "{}"),
  write("POST", "/api/library", hdr(LIBRARY), '{"kind":"image","name":"remote"}', { where: "lan" }),
  request("PATCH /api/library HTTP/1.1"),
  request("DELETE /api/library HTTP/1.1"),
  get("/api/library/"),
  get("/api/library/nope"),
  get("/api/library/lib_missing0000"),
  request("PUT /api/library/nope HTTP/1.1"),
  write("PUT", "/api/library/lib_missing0000", hdr(LIBRARY), '{"name":""}'),
  write("PUT", "/api/library/lib_missing0000", hdr(LIBRARY), "nope"),
  request("PATCH /api/library/lib_missing0000 HTTP/1.1"),
  request("DELETE /api/library/lib_missing0000 HTTP/1.1"),
  request("DELETE /api/library/lib_missing0000 HTTP/1.1\r\nX-Dashboard-Library: 1"),
  {
    label: "library create, read, update, list and delete",
    map: mapTimes,
    run: async (api) => {
      const send = (method, url, headers, body) =>
        api.raw(`${method} ${url} HTTP/1.1\r\n${hdr(headers)}${api.host}${body === null ? "" : `Content-Length: ${Buffer.byteLength(body)}\r\n`}Connection: close\r\n\r\n${body ?? ""}`);
      const made = await send("POST", "/api/library", LIBRARY, '{"kind":"gauge","name":"Arc","data":{"shape":"arc"}}');
      const id = /"id":"(lib_[a-z0-9]{12})"/.exec(made)[1];
      const out = [made, await send("GET", `/api/library/${id}`, {}, null)];
      out.push(await send("PUT", `/api/library/${id}`, LIBRARY, '{"name":"Arc 2","copies":[{"profileId":"p","at":"now"}]}'));
      out.push(await send("PUT", `/api/library/${id}`, LIBRARY, '{"kind":"image"}'));
      out.push(await send("PUT", `/api/library/${id}`, LIBRARY, '{"name":"   "}'));
      out.push(await send("PUT", `/api/library/${id}`, { "Content-Type": "application/json" }, "{}"));
      out.push(await send("GET", "/api/library", {}, null));
      out.push(await send("DELETE", `/api/library/${id}`, {}, null));
      out.push(await send("DELETE", `/api/library/${id}`, { "X-Dashboard-Library": "1" }, null));
      out.push(await send("DELETE", `/api/library/${id}`, { "X-Dashboard-Library": "1" }, null));
      out.push(await send("GET", `/api/library/${id}`, {}, null));
      return out.join("\n=====\n");
    },
  },
  {
    label: "library list leaves out data over 256 KiB",
    map: mapTimes,
    run: async (api) => {
      const body = JSON.stringify({ kind: "canvas", name: "big", data: { s: "x".repeat(262_137) } });
      const made = await api.raw(`POST /api/library HTTP/1.1\r\n${hdr(LIBRARY)}${api.host}Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
      const list = await api.raw(`GET /api/library HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`);
      const strip = (t) => t.replace(/x{100,}/g, "X");
      return [strip(made), strip(list)].join("\n=====\n");
    },
  },
];

const G1 = "70538526-f13f-4074-bb42-f6892d6e42d4";
const G2 = "0a0b0c0d-1111-2222-3333-444455556666";
const installedPaths = [
  "/api/infopanel/installed", `/api/infopanel/installed/${G1}/Profile.xml`, `/api/infopanel/installed/${G1}/DisplayItems.xml`, `/api/infopanel/installed/${G1}/assets/logo.png`,
  `/api/infopanel/installed/${G1}/assets/a%20b.png`, `/api/infopanel/installed/${G1}/assets/%C3%A9.png`, `/api/infopanel/installed/${G1}/assets/sub`, `/api/infopanel/installed/${G1.toUpperCase()}/DisplayItems.xml`,
  `/api/infopanel/installed/${G1.toUpperCase()}/Profile.xml`, `/api/infopanel/installed/${G2}/Profile.xml`, `/api/infopanel/installed/${G2}/DisplayItems.xml`, `/api/infopanel/installed/${G2}/assets/x.png`,
  "/api/infopanel/installed/", "/api/infopanel/installed//", `/api/infopanel/installed/${G1}`, `/api/infopanel/installed/${G1}/`, `/api/infopanel/installed/${G1}/assets`, `/api/infopanel/installed/${G1}/assets/`,
  `/api/infopanel/installed/${G1}/assets/gone.png`, `/api/infopanel/installed/${G1}/assets/..`, `/api/infopanel/installed/${G1}/assets/..%2Fx`, `/api/infopanel/installed/${G1}/assets/%5Cx`, `/api/infopanel/installed/${G1}/assets/a%3Ab`,
  `/api/infopanel/installed/${G1}/assets/%ff`, `/api/infopanel/installed/${G1}/assets/%`, `/api/infopanel/installed/${G1}/assets/%00`, `/api/infopanel/installed/${G1}/profile.xml`, `/api/infopanel/installed/${G1}/Other.xml`,
  `/api/infopanel/installed/${G1}/Profile.xml/x`, "/api/infopanel/installed/nope/Profile.xml", "/api/infopanel/installed/..%2f..%2fx/Profile.xml", "/api/infopanel/installedx", "/api/infopanel/installed?x=1",
];
const installedCases = [
  ...installedPaths.map((p) => get(p)),
  get("/api/infopanel/installed", { where: "lan" }),
  get(`/api/infopanel/installed/${G1}/Profile.xml`, { where: "lan" }),
  ...["POST", "PUT", "DELETE", "HEAD", "OPTIONS"].map((m) => request(`${m} /api/infopanel/installed HTTP/1.1`)),
  request(`HEAD /api/infopanel/installed/${G1}/Profile.xml HTTP/1.1`),
  request(`POST /api/infopanel/installed/${G1}/Profile.xml HTTP/1.1`, null, { where: "lan" }),
];

/** InfoPanel's data folder for the twins: two profiles (one with a bad guid), items, assets and an odd asset name. */
export function seedInfopanel(dir) {
  fs.mkdirSync(path.join(dir, "profiles"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", G1, "sub"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "profiles.xml"),
    `<?xml version="1.0"?>\n<ArrayOfProfile xmlns:xsi="x">\n<Profile><Guid>${G1}</Guid><Name>A &amp; B &lt;x&gt; &bogus;</Name><Width>600</Width></Profile>\n<Profile><Guid>../../etc</Guid><Name>bad</Name></Profile>\n<Profile><Guid>${G2.toUpperCase()}</Guid><Name>Second é</Name></Profile>\n</ArrayOfProfile>`,
  );
  fs.writeFileSync(path.join(dir, "profiles", `${G1}.xml`), "<ArrayOfDisplayItem/>");
  for (const name of ["logo.png", "a b.png", "é.png", "Z.png", "b.png"]) fs.writeFileSync(path.join(dir, "assets", G1, name), `bytes of ${name}`);
}

export const cases = [...assetCases, ...servedCases, ...usedCases, ...canvasCases, ...libraryCases, ...installedCases];
