// The before/after page for `npm run qa:shots -- --compare <before> <after>`: every shot path of either run, side by
// side, those whose bytes differ (or that only one run has) first. PNGs of the same page encode the same, so equal
// bytes mean an unchanged frame.
import fs from "node:fs";
import path from "node:path";

/** Every PNG under `dir`, as paths relative to it with forward slashes. */
function shots(dir) {
  return fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".png")).map((f) => f.split(path.sep).join("/"));
}

/** Each shot of either run and how it compares: `changed`, `same`, `added` (only in after) or `removed`. */
export function diffRuns(beforeDir, afterDir) {
  const a = new Set(shots(beforeDir));
  const b = new Set(shots(afterDir));
  return [...new Set([...a, ...b])].sort().map((name) => {
    if (!a.has(name)) return { name, status: "added" };
    if (!b.has(name)) return { name, status: "removed" };
    return { name, status: fs.readFileSync(path.join(beforeDir, name)).equals(fs.readFileSync(path.join(afterDir, name))) ? "same" : "changed" };
  });
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Writes the compare page into `root` and returns its path with the counts. */
export function compareRuns(root, before, after) {
  const rows = diffRuns(path.join(root, before), path.join(root, after));
  const img = (label, name, has) => (has ? `<img src="${esc(`${label}/${name}`)}" alt="">` : `<div class="none">not in ${esc(label)}</div>`);
  const row = (r) => `<figure class="${r.status}"><figcaption>${esc(r.name)} <b>${r.status}</b></figcaption><div class="pair">${img(before, r.name, r.status !== "added")}${img(after, r.name, r.status !== "removed")}</div></figure>`;
  const different = rows.filter((r) => r.status !== "same");
  const same = rows.filter((r) => r.status === "same");
  const html = `<!doctype html><meta charset="utf-8"><title>QA shots: ${esc(before)} vs ${esc(after)}</title>
<style>body{background:#0c0c0e;color:#e4e4e7;font:13px system-ui;margin:24px}h1{font-size:15px}figure{margin:0 0 20px}figcaption{font:11px ui-monospace,monospace;margin-bottom:6px;opacity:.8}
b{color:#fbbf24}.same b{color:#71717a}.pair{display:flex;gap:16px;align-items:flex-start}img{max-width:48vw;outline:1px solid #27272a}.none{padding:16px;opacity:.5;border:1px dashed #52525b}summary{cursor:pointer;margin:16px 0}</style>
<h1>${esc(before)} (left) vs ${esc(after)} (right): ${different.length} of ${rows.length} differ</h1>
${different.map(row).join("\n")}
<details><summary>${same.length} unchanged</summary>${same.map(row).join("\n")}</details>`;
  const file = path.join(root, `compare-${before}-${after}.html`.replace(/[^\w.-]+/g, "-"));
  fs.writeFileSync(file, html);
  return { file, changed: different.length, total: rows.length };
}
