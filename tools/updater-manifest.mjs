#!/usr/bin/env node
// Writes latest.json, the update manifest the desktop app's updater reads from the latest release:
//
//   node tools/updater-manifest.mjs --version=1.2.0 --sig=<installer>.sig --notes=notes.md --out=latest.json
//
// The installer's signature (made by `tauri build` with the updater key) is read from the .sig
// file. The installer is published as InfoPanel-Studio_<version>_x64-setup.exe: GitHub turns the
// spaces of the built name into dots, so the release workflow copies it to this name first.
// Node built-ins only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASES = "https://github.com/F3NN3X/InfoPanel.Studio/releases/download";

/** The installer's release asset name and download URL for a version. */
export function installerAsset(version) {
  const name = `InfoPanel-Studio_${version}_x64-setup.exe`;
  return { name, url: `${RELEASES}/v${version}/${name}` };
}

/** Tauri's static update JSON for one Windows build. */
export function manifest({ version, notes, pubDate, signature, url }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: { "windows-x86_64": { signature, url } },
  };
}

function optionOf(argv, name) {
  return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function main() {
  const argv = process.argv.slice(2);
  const version = optionOf(argv, "version");
  const sig = optionOf(argv, "sig");
  const notes = optionOf(argv, "notes");
  const out = optionOf(argv, "out");
  if (!version || !sig || !out) {
    console.error("Usage: updater-manifest.mjs --version=<x.y.z> --sig=<file.sig> [--notes=<file.md>] --out=<latest.json>");
    process.exit(1);
  }
  const json = manifest({
    version,
    notes: notes ? fs.readFileSync(notes, "utf8").trim() : "",
    pubDate: new Date().toISOString(),
    signature: fs.readFileSync(sig, "utf8").trim(),
    url: installerAsset(version).url,
  });
  fs.writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Wrote ${out} for ${version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
