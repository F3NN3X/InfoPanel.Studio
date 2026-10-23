#!/usr/bin/env node
// Fills src-tauri/resources/ for the desktop app (InfoPanel Studio):
//
//   node/node.exe   the official Node.js LTS for win-x64, pinned by version and SHA-256
//   app/            server.mjs, server/ (no tests), dist/, tools/agent-*.mjs, package.json
//
// The Node zip is downloaded once into .cache/desktop/ and checked against NODE_SHA256 every
// time. The studio comes from .cache/desktop/dist (`npm run desktop:web`), never the repo's dist/,
// which a running dashboard server may be serving. Node built-ins only.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** From https://nodejs.org/dist/v24.22.0/SHASUMS256.txt */
export const NODE_VERSION = "24.22.0";
export const NODE_SHA256 = "f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "desktop");
const OUT = path.join(ROOT, "src-tauri", "resources");
const ZIP_NAME = `node-v${NODE_VERSION}-win-x64`;
const ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${ZIP_NAME}.zip`;

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function download(url, file) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, file);
}

/** The pinned zip, downloaded if missing, verified either way. */
async function nodeZip() {
  fs.mkdirSync(CACHE, { recursive: true });
  const zip = path.join(CACHE, `${ZIP_NAME}.zip`);
  if (!fs.existsSync(zip) || sha256(zip) !== NODE_SHA256) await download(ZIP_URL, zip);
  const actual = sha256(zip);
  if (actual !== NODE_SHA256) {
    fs.rmSync(zip, { force: true });
    throw new Error(`${ZIP_NAME}.zip has SHA-256 ${actual}, expected ${NODE_SHA256}`);
  }
  return zip;
}

/** node.exe from the zip, extracted into its own folder (cached by version). */
function extractNode(zip) {
  const dir = path.join(CACHE, ZIP_NAME);
  const exe = path.join(dir, ZIP_NAME, "node.exe");
  if (!fs.existsSync(exe)) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    // Windows 10+ ships bsdtar, which reads zip files (Git's GNU tar on PATH does not).
    const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
    execFileSync(tar, ["-xf", zip, "-C", dir, `${ZIP_NAME}/node.exe`], { stdio: "inherit" });
  }
  return exe;
}

/** Whether a server/ file ships: tests stay behind. */
export const shipsServerFile = (name) => !name.endsWith(".test.mjs");

/** Copy a tree, files through `filter`; Vite's build manifest (`.vite/`, for tools/perf/bundle-report.mjs) stays behind. */
function copy(from, to, filter = () => true) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => (fs.statSync(src).isDirectory() ? path.basename(src) !== ".vite" : filter(path.basename(src))) });
}

async function main() {
  const web = path.join(ROOT, ".cache", "desktop", "dist");
  if (!fs.existsSync(path.join(web, "index.html"))) throw new Error(".cache/desktop/dist is missing: run `npm run desktop:web` first");

  const exe = extractNode(await nodeZip());
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "node"), { recursive: true });
  fs.copyFileSync(exe, path.join(OUT, "node", "node.exe"));

  const app = path.join(OUT, "app");
  fs.mkdirSync(path.join(app, "tools"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "server.mjs"), path.join(app, "server.mjs"));
  fs.copyFileSync(path.join(ROOT, "package.json"), path.join(app, "package.json"));
  copy(path.join(ROOT, "server"), path.join(app, "server"), shipsServerFile);
  copy(web, path.join(app, "dist"));
  for (const tool of ["agent-status.mjs", "agent-install.mjs"]) {
    fs.copyFileSync(path.join(ROOT, "tools", tool), path.join(app, "tools", tool));
  }
  console.log(`Prepared ${path.relative(ROOT, OUT)} with Node ${NODE_VERSION}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
