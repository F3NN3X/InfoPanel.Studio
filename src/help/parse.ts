import { stripInline } from "./inline";
import { slugify } from "./slug";
import type { Article, ArticleStatus, Block, CalloutKind } from "./types";

/** A malformed article; the message names the file and the line. */
export class ArticleError extends Error {}

const SEPARATOR = " — ";
const CALLOUTS: readonly string[] = ["tip", "note", "warn", "soon"];
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

type Meta = Record<string, string | string[]>;

/** The YAML subset of the front-matter: `key: value` lines, lists as `[a, b]`. */
function parseMeta(block: string, file: string): Meta {
  const meta: Meta = {};
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) throw new ArticleError(`${file}: front-matter line is not "key: value": ${line}`);
    const value = m[2].trim();
    meta[m[1]] = value.startsWith("[") && value.endsWith("]")
      ? value.slice(1, -1).split(",").map((v) => v.trim()).filter(Boolean)
      : value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return meta;
}

function scalar(meta: Meta, key: string, file: string): string {
  const v = meta[key];
  if (typeof v !== "string" || !v) throw new ArticleError(`${file}: front-matter needs "${key}"`);
  return v;
}

/** The cells of one table row; `\|` is a literal bar. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function pair(line: string, kind: string, file: string): [string, string] {
  const at = line.indexOf(SEPARATOR);
  if (at < 0) throw new ArticleError(`${file}: a ${kind} line needs " — " between its parts: ${line}`);
  return [line.slice(0, at).trim(), line.slice(at + SEPARATOR.length).trim()];
}

/** Whether a line starts a block of its own (it ends a paragraph). */
function startsBlock(line: string): boolean {
  return line.startsWith("## ") || line.startsWith(":::") || line.startsWith("|") || BULLET.test(line) || NUMBERED.test(line);
}

function parseBlocks(body: string, file: string): Block[] {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      const base = slugify(stripInline(text)) || "section";
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      blocks.push({ type: "h", text, id: n === 1 ? base : `${base}-${n}` });
      i++;
      continue;
    }
    if (line.trim() === ":::") throw new ArticleError(`${file}:${i + 1}: a ":::" with no block to close`);
    const fence = /^:::(\w+)\s*(.*)$/.exec(line.trim());
    if (fence) {
      const [, name, rest] = fence;
      if (name === "open") {
        const m = /^(\S+)\s+(.+)$/.exec(rest);
        if (!m) throw new ArticleError(`${file}:${i + 1}: ":::open" needs a target and a label`);
        blocks.push({ type: "open", target: m[1], label: m[2].trim() });
        i++;
        continue;
      }
      if (name === "generated") {
        if (!rest.trim()) throw new ArticleError(`${file}:${i + 1}: ":::generated" needs a key`);
        blocks.push({ type: "generated", key: rest.trim() });
        i++;
        continue;
      }
      if (!CALLOUTS.includes(name) && name !== "keys" && name !== "flow") {
        throw new ArticleError(`${file}:${i + 1}: unknown block ":::${name}"`);
      }
      const start = i + 1;
      let end = start;
      while (end < lines.length && lines[end].trim() !== ":::") end++;
      if (end >= lines.length) throw new ArticleError(`${file}:${i + 1}: ":::${name}" is never closed`);
      const inner = lines.slice(start, end).map((l) => l.trim()).filter(Boolean);
      if (name === "keys") blocks.push({ type: "keys", rows: inner.map((l) => pair(l, "keys", file)) });
      else if (name === "flow") blocks.push({ type: "flow", steps: inner.map((l) => pair(l, "flow", file)) });
      else blocks.push({ type: "callout", kind: name as CalloutKind, text: inner.join(" ") });
      i = end + 1;
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = marker.exec(lines[i]);
        if (m) items.push(m[1].trim());
        else if (/^\s+\S/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(splitRow(lines[i++]));
      const [head, rule, ...rest] = rows;
      if (!rule?.every((c) => /^:?-+:?$/.test(c))) throw new ArticleError(`${file}: a table needs a "|---|" row under its header`);
      blocks.push({ type: "table", head, rows: rest.map((r) => head.map((_, c) => r[c] ?? "")) });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() && (text.length === 0 || !startsBlock(lines[i]))) text.push(lines[i++].trim());
    blocks.push({ type: "p", text: text.join(" ") });
  }
  return blocks;
}

/** One article file (front-matter, then the body) to its blocks; the first paragraph is the lede. */
export function parseArticle(source: string, file = "article.md"): Article {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) throw new ArticleError(`${file}: missing the front-matter (--- ... ---)`);
  const meta = parseMeta(m[1], file);
  const status = (meta.status ?? "shipped") as ArticleStatus;
  if (status !== "shipped" && status !== "coming-soon") throw new ArticleError(`${file}: unknown status "${String(meta.status)}"`);
  const blocks = parseBlocks(text.slice(m[0].length), file);
  const lede = blocks[0]?.type === "p" ? blocks.shift() : undefined;
  return {
    id: scalar(meta, "id", file),
    title: scalar(meta, "title", file),
    icon: scalar(meta, "icon", file),
    related: Array.isArray(meta.related) ? meta.related : [],
    verified: typeof meta.verified === "string" ? meta.verified : "",
    status,
    lede: lede?.type === "p" ? lede.text : "",
    blocks,
  };
}
