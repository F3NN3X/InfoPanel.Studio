#!/usr/bin/env node
// Lints .github/workflows with actionlint. The binary is a pinned release, downloaded once into .cache/actionlint and
// checked against the SHA-256 below before it runs; CI and a developer machine use the same pin.
// Pin: https://github.com/rhysd/actionlint/releases/tag/v1.7.12 (checksums file of that release). Node built-ins only.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "1.7.12";
const ASSETS = {
  "linux-x64": { name: `actionlint_${VERSION}_linux_amd64.tar.gz`, sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8" },
  "win32-x64": { name: `actionlint_${VERSION}_windows_amd64.zip`, sha256: "6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9" },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The pinned asset for this platform, or null. */
export function assetFor(platform = process.platform, arch = process.arch) {
  return ASSETS[`${platform}-${arch}`] ?? null;
}

async function ensureBinary() {
  const asset = assetFor();
  if (!asset) throw new Error(`no pinned actionlint for ${process.platform}-${process.arch}`);
  const dir = path.join(ROOT, ".cache", "actionlint", VERSION);
  const bin = path.join(dir, process.platform === "win32" ? "actionlint.exe" : "actionlint");
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(dir, { recursive: true });
  const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v${VERSION}/${asset.name}`);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== asset.sha256) throw new Error(`actionlint ${asset.name} has SHA-256 ${sha256}, expected ${asset.sha256}`);
  const archive = path.join(dir, asset.name);
  fs.writeFileSync(archive, bytes);
  // Windows: its own bsdtar reads zip (a GNU tar on PATH, as in Git Bash, takes "E:" for a host).
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe") : "tar";
  execFileSync(tar, ["-xf", archive, "-C", dir, path.basename(bin)]);
  fs.rmSync(archive);
  return bin;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const bin = await ensureBinary();
    process.exitCode = spawnSync(bin, ["-color"], { cwd: ROOT, stdio: "inherit" }).status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
