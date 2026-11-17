// Which `--ui-*` tokens each page bundle reads, taken from the built pages (the manifests of `vite build` and
// `npm run desktop:settings`). generate.mjs declares in a page's own stylesheet only the tokens it reads (L13).
// A reference does not depend on a declaration, so a build made before or after a generate gives the same set.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The pages whose tokens are chosen: the built manifest and entry (html) of each. The studio declares all of them. */
export const PAGES = {
  settings: [["src-tauri/pages/app", "settings.html"]],
  help: [["src-tauri/pages/app", "help.html"], ["dist", "help.html"]],
  touch: [["src-tauri/pages/app", "touch.html"]],
  "agent-prompt": [["src-tauri/pages/app", "agent-prompt.html"]],
};

const REF = /--ui-[\w-]*/g;

/** Every file (js and css) an entry loads, now or later: its imports, dynamic imports and their stylesheets. */
function closure(manifest, entry) {
  const seen = new Set();
  const files = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const k of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visit(k);
  };
  visit(entry);
  return [...files].filter((f) => /\.(js|css)$/.test(f));
}

/** The `--ui-*` names (and a name ending in `-`: a prefix a script builds the rest of) one page's files read. */
export function readsOf(page) {
  const names = new Set();
  for (const [dir, entry] of PAGES[page]) {
    const manifestPath = join(root, dir, ".vite", "manifest.json");
    if (!existsSync(manifestPath)) throw new Error(`no build in ${dir}: run \`npm run build\` and \`npm run desktop:settings\``);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const file of closure(manifest, entry)) {
      const text = readFileSync(join(root, dir, file), "utf8");
      // A declaration (`--ui-x:` in a stylesheet) is not a read; in a script a name is a read or a style key we keep.
      for (const m of text.matchAll(REF)) if (!(file.endsWith(".css") && /^\s*:/.test(text.slice(m.index + m[0].length)))) names.add(m[0]);
    }
  }
  return [...names].sort();
}

/** The names of `all` a page needs: each read name, and every name under a read prefix. */
export const neededOf = (reads, all) => all.filter((n) => reads.some((r) => (r.endsWith("-") ? `--ui-${n}`.startsWith(r) : r === `--ui-${n}`)));

/** { page: reads } for every page. */
export const scanUsage = () => Object.fromEntries(Object.keys(PAGES).map((p) => [p, readsOf(p)]));
