// InfoPanel's installed profiles, read-only, for the import lab (the app's own server has the same in Rust,
// src-tauri/crates/ips-server/src/infopanel_local.rs).
//
// InfoPanel keeps its data in %LOCALAPPDATA%\InfoPanel (INFOPANEL_DATA_DIR
// overrides it): `profiles.xml` lists the profiles, `profiles/<guid>.xml`
// holds each one's display items and `assets/<guid>/` its files
// (ConfigModel.cs, SharedModel.cs). Only those are read; nothing is written.
//
// Routes (this machine only: the files are the user's own):
//   GET /api/infopanel/installed                       the profiles, with sizes and asset names
//   GET /api/infopanel/installed/<guid>/Profile.xml     the profile's own <Profile> element
//   GET /api/infopanel/installed/<guid>/DisplayItems.xml
//   GET /api/infopanel/installed/<guid>/assets/<name>
// A path is only built from a guid matching GUID and a plain file name.
//
// Node built-ins only. The pure helpers are exported for the tests.

import fs from "node:fs/promises";
import path from "node:path";

/** True for a loopback peer address (IPv4, IPv6 or IPv4-mapped). */
export function isLoopback(address) {
  const a = String(address ?? "");
  return a === "::1" || /^(::ffff:)?127\./.test(a);
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------------- pure helpers ---------------- */

export const isGuid = (s) => GUID.test(String(s));

/** An asset file name as InfoPanel stores it: one plain name, no folders, no dot-only names. */
export const isAssetName = (s) => /^[^\\/:*?"<>|\0]+$/.test(String(s)) && !/^\.+$/.test(String(s));

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) => ENTITIES[e]);

/**
 * The profiles in `profiles.xml` as `{ guid, name, xml }`, each with its own
 * `<Profile>` element. Entries without a valid Guid are skipped.
 */
export function profilesFromXml(text) {
  const out = [];
  for (const m of String(text).matchAll(/<Profile>[\s\S]*?<\/Profile>/g)) {
    const field = (n) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(m[0])?.[1];
    const guid = field("Guid") ?? "";
    if (!isGuid(guid)) continue;
    out.push({ guid, name: unescape(field("Name") ?? ""), xml: m[0] });
  }
  return out;
}

/* ---------------- reading ---------------- */

/** Reads InfoPanel's data folder `dir`. Every method resolves null for what is not there. */
export function createInstalledProfiles(dir) {
  const profiles = async () => profilesFromXml(await fs.readFile(path.join(dir, "profiles.xml"), "utf8"));
  const missing = (e) => {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return null;
    throw e;
  };

  return {
    /** Every profile: guid, name, the size of its items file and its asset names. */
    async list() {
      const all = await profiles().catch(missing);
      if (!all) return [];
      return Promise.all(
        all.map(async (p) => {
          const items = await fs.stat(path.join(dir, "profiles", `${p.guid}.xml`)).catch(() => null);
          const assets = await fs.readdir(path.join(dir, "assets", p.guid)).catch(() => []);
          return { guid: p.guid, name: p.name, bytes: items?.size ?? 0, assets: assets.filter(isAssetName).sort() };
        }),
      );
    },
    /** One file of a profile: "Profile.xml", "DisplayItems.xml" or "assets/<name>". */
    async read(guid, parts) {
      if (!isGuid(guid)) return null;
      const [name, asset] = parts;
      if (parts.length === 1 && name === "Profile.xml") {
        return (await profiles().catch(missing))?.find((p) => p.guid === guid)?.xml ?? null;
      }
      if (parts.length === 1 && name === "DisplayItems.xml") {
        return fs.readFile(path.join(dir, "profiles", `${guid}.xml`)).catch(missing);
      }
      if (parts.length === 2 && name === "assets" && isAssetName(asset)) {
        return fs.readFile(path.join(dir, "assets", guid, asset)).catch(missing);
      }
      return null;
    },
  };
}

/* ---------------- request handling ---------------- */

const PREFIX = "/api/infopanel/installed";

/** The default data folder: INFOPANEL_DATA_DIR, else %LOCALAPPDATA%\InfoPanel. */
export const infopanelDataDir = (env) => env.INFOPANEL_DATA_DIR || path.join(env.LOCALAPPDATA || "", "InfoPanel");

/** The /api/infopanel/installed routes over `installed`. */
export function createInstalledRoutes({ installed, send }) {
  return async function handleInstalled(req, res, pathname) {
    if (req.method !== "GET") return send(res, 405);
    if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, "installed profiles are served to this computer only");
    if (pathname === PREFIX) return send(res, 200, JSON.stringify(await installed.list()), "application/json; charset=utf-8");
    let parts;
    try {
      parts = pathname.slice(PREFIX.length + 1).split("/").map(decodeURIComponent);
    } catch {
      return send(res, 404);
    }
    const [guid, ...rest] = parts;
    const body = await installed.read(guid, rest);
    if (body === null) return send(res, 404);
    // Assets are the profile's own files, served as bytes: never rendered here.
    const type = rest[0] === "assets" ? "application/octet-stream" : "application/xml; charset=utf-8";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(body);
  };
}
