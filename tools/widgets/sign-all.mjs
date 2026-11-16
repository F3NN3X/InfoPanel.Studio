// Signs every widget package under the folders given, with one key and one password (FORMAT.md §17; docs/code-widgets.md):
//   node tools/widgets/sign-all.mjs <folder>... [--key <secret.key>] [--pub <public.pub>] [--publisher <name>]... [--force] [--check]
// A package is a folder holding manifest.json; folders inside a package, `node_modules` and dot folders are not searched.
//   - A package whose signature already verifies with this key and whose files are still the ones it lists is left alone
//     ("up to date"); `--force` signs it again anyway.
//   - `--publisher` (repeatable) names the publishers this key signs for: a code widget of another publisher is refused instead
//     of signed, since the app would refuse it anyway. Without it every publisher is signed.
//   - `--check` signs nothing: it reports what needs signing and exits 1 when anything does. It needs only the public key.
// The key is `--key`, else $INFOPANEL_WIDGET_KEY, else ~/infopanel-widgets.key; the public key is `--pub`, else the key's path
// with `.pub`. An encrypted key's password is $MINISIGN_PASSWORD, else asked once in the terminal (never an argument).
// Exit: 0 all signed or up to date, 1 something refused or (with --check) needs signing, 2 usage or key error.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalBytes, publicKeyFile, readSecretKey, verifyBytes } from "./minisign.mjs";
import { packageFiles, signFolder } from "./sign.mjs";

/** Every package folder under `root` (a folder with manifest.json), sorted; a package's own subfolders are not searched. */
export function findPackages(root) {
  if (existsSync(join(root, "manifest.json"))) return [root];
  const out = [];
  for (const name of readdirSync(root).sort()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const path = join(root, name);
    if (statSync(path).isDirectory()) out.push(...findPackages(path));
  }
  return out;
}

const fileKey = (f) => `${f.path}\n${f.bytes}\n${f.sha256}`;

/** Why the package in `dir` needs signing with the key `publicText`, or null when it is up to date. */
export function staleReason(dir, manifest, publicText) {
  const sig = manifest.signature?.minisign;
  if (typeof sig !== "string") return "not signed";
  const listed = (Array.isArray(manifest.files) ? manifest.files : []).map(fileKey).sort();
  const actual = packageFiles(dir)
    .map((path) => {
      const bytes = readFileSync(join(dir, path));
      return fileKey({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    })
    .sort();
  if (listed.join("\0") !== actual.join("\0")) return "its files changed";
  try {
    if (!verifyBytes(canonicalBytes(manifest), sig, publicText)) return "signed with another key, or the manifest changed";
  } catch {
    return "its signature is unreadable";
  }
  return null;
}

/** The publisher a package signs for: a code widget's `ext:<publisher>.<id>`, or null for a recipe. */
function publisherOf(manifest) {
  if (manifest.kind !== "code") return null;
  const m = /^ext:([a-z0-9][a-z0-9-]*)\./.exec(String(manifest.id ?? ""));
  return m ? m[1] : "";
}

/**
 * Signs (or, with `check`, inspects) each package under `roots`. `key` is `readSecretKey`'s (unused with `check`); `publicText`
 * the key's public key file. Returns one row per package: `{ dir, id, state: "signed" | "up-to-date" | "needs-signing" |
 * "refused", reason? }`.
 */
export function signAll({ roots, key, publicText, publishers = [], force = false, check = false }) {
  const rows = [];
  for (const dir of roots.flatMap(findPackages)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    } catch (e) {
      rows.push({ dir, id: "?", state: "refused", reason: `manifest.json does not read: ${e instanceof Error ? e.message : e}` });
      continue;
    }
    const id = String(manifest.id ?? "?");
    const publisher = publisherOf(manifest);
    if (publisher === "" || (publisher && manifest.publisher !== publisher)) {
      rows.push({ dir, id, state: "refused", reason: "a code widget's id is ext:<publisher>.<id> and its `publisher` field the same name" });
      continue;
    }
    if (publisher && publishers.length && !publishers.includes(publisher)) {
      rows.push({ dir, id, state: "refused", reason: `this key does not sign for the publisher ${publisher} (--publisher ${publishers.join(", ")})` });
      continue;
    }
    const reason = force ? "signed again (--force)" : staleReason(dir, manifest, publicText);
    if (!reason) {
      rows.push({ dir, id, state: "up-to-date" });
      continue;
    }
    if (check) {
      rows.push({ dir, id, state: "needs-signing", reason });
      continue;
    }
    const signed = signFolder(dir, key);
    // what was written must verify with the public key the app will hold
    if (staleReason(dir, signed, publicText)) throw new Error(`${id}: the new signature does not verify with ${publicText.split("\n")[0]}`);
    rows.push({ dir, id, state: "signed", reason });
  }
  return rows;
}

/** Reads a password from the terminal without echoing it. */
async function askPassword(prompt) {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) throw new Error("the secret key is encrypted: set MINISIGN_PASSWORD, or run this in a terminal to be asked");
  stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let text = "";
    const done = (fn) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stderr.write("\n");
      fn();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(text));
        if (ch === "\u0003") return done(() => reject(new Error("cancelled")));
        if (ch === "\u007f" || ch === "\b") text = text.slice(0, -1);
        else text += ch;
      }
    };
    stdin.on("data", onData);
  });
}

function parseArgs(args) {
  const opts = { roots: [], publishers: [], force: false, check: false, key: undefined, pub: undefined };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--force") opts.force = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--key" || a === "--pub" || a === "--publisher") {
      const v = args[++i];
      if (!v) throw new Error(`${a} needs a value`);
      if (a === "--publisher") opts.publishers.push(v);
      else opts[a.slice(2)] = v;
    } else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else opts.roots.push(a);
  }
  return opts;
}

async function main(args) {
  let opts;
  try {
    opts = parseArgs(args);
  } catch (e) {
    console.error(e.message);
    opts = null;
  }
  if (!opts?.roots.length) {
    console.error("usage: node tools/widgets/sign-all.mjs <folder>... [--key <secret.key>] [--pub <public.pub>] [--publisher <name>]... [--force] [--check]");
    return 2;
  }
  const keyFile = opts.key ?? process.env.INFOPANEL_WIDGET_KEY ?? join(homedir(), "infopanel-widgets.key");
  const pubFile = opts.pub ?? keyFile.replace(/\.key$/, "") + ".pub";
  let key;
  let publicText;
  try {
    if (opts.check) {
      publicText = readFileSync(pubFile, "utf8");
    } else {
      const secretText = readFileSync(keyFile, "utf8");
      let password = process.env.MINISIGN_PASSWORD;
      try {
        key = readSecretKey(secretText, password);
      } catch (e) {
        if (password !== undefined || !/encrypted/.test(e.message)) throw e;
        password = await askPassword(`Password for ${keyFile}: `);
        key = readSecretKey(secretText, password);
      }
      publicText = publicKeyFile(key);
      if (existsSync(pubFile) && readFileSync(pubFile, "utf8").split("\n")[1]?.trim() !== publicText.split("\n")[1]) {
        throw new Error(`${pubFile} is not this secret key's public key`);
      }
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 2;
  }
  const rows = signAll({ ...opts, key, publicText });
  for (const r of rows) console.log(`${r.state.padEnd(13)} ${r.id}  ${relative(process.cwd(), r.dir) || "."}${r.reason ? `  (${r.reason})` : ""}`);
  const count = (s) => rows.filter((r) => r.state === s).length;
  console.log(`${rows.length} packages: ${count("signed")} signed, ${count("up-to-date")} up to date, ${count("needs-signing")} need signing, ${count("refused")} refused`);
  return count("refused") || count("needs-signing") ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  );
}
