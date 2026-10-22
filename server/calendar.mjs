// The calendar links: fetched on the server every few minutes and expanded to the upcoming
// occurrences (server/ical.mjs) for the island's countdown (server/extras.mjs). The links are often
// secret (Google's "secret address"), so kiosks get only the events, never the URLs.
//
// Node built-ins only. `upcoming` is pure.

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { occurrences, parseIcs } from "./ical.mjs";

export const REFRESH_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
/** How far ahead the kiosks get events, ms. */
export const AHEAD_MS = 36 * 3_600_000;
/** Events that began this long ago are still sent (a running meeting), ms. */
const BEHIND_MS = 3_600_000;
const MAX_EVENTS = 50;
const MAX_REDIRECTS = 3;

/**
 * An address a calendar link may not reach: this machine (loopback, unspecified), link-local (which
 * holds cloud metadata services) and multicast. LAN addresses stay allowed: a calendar on a NAS or a
 * Nextcloud server is a real use, and only the studio (which already writes the config) adds links.
 * `blockLan` also refuses the private ranges (the image proxy takes any URL a page names).
 */
export function blockedAddress(ip, blockLan = false) {
  if (net.isIPv4(ip)) return blockedV4(ip, blockLan);
  const w = ipv6Words(ip);
  if (!w) return true;
  // IPv4 inside IPv6, in any spelling ("::ffff:7f00:1" is 127.0.0.1): mapped, compatible and NAT64.
  const zero = (from, to) => w.slice(from, to).every((x) => x === 0);
  const mapped = zero(0, 5) && w[5] === 0xffff;
  const compatible = zero(0, 6) && w[6] !== 0;
  const nat64 = w[0] === 0x64 && w[1] === 0xff9b && zero(2, 6);
  if (mapped || compatible || nat64) return blockedV4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`, blockLan);
  const unspecifiedOrLoopback = zero(0, 7) && w[7] <= 1;
  return unspecifiedOrLoopback || (w[0] & 0xffc0) === 0xfe80 || w[0] >> 8 === 0xff || (blockLan && (w[0] & 0xfe00) === 0xfc00);
}

function blockedV4(ip, blockLan) {
  const [a, b] = ip.split(".").map(Number);
  const lan = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224 || (blockLan && lan);
}

/** An IPv6 address as its eight 16-bit words (a trailing dotted IPv4 counts as two), or null. */
function ipv6Words(ip) {
  let h = ip.toLowerCase().replace(/%.*$/, "");
  if (!net.isIPv6(h)) return null;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    h = h.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, tail] = h.includes("::") ? h.split("::") : [h, null];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === null ? [] : Array(8 - left.length - right.length).fill("0");
  const words = [...left, ...fill, ...right].map((x) => parseInt(x, 16));
  return words.length === 8 && words.every((x) => x >= 0 && x <= 0xffff) ? words : null;
}

/**
 * The resolver the default fetch connects through: it checks every address at connect time, so a
 * name cannot pass `checkTarget` and then resolve to a blocked address for the request itself.
 */
export function guardedLookup(lookup, blocked = blockedAddress) {
  return (host, options, cb) => {
    lookup(host, { all: true }).then(
      (list) => {
        if (list.length === 0 || list.some((a) => blocked(a.address))) return cb(new Error("address not allowed"));
        if (options?.all) return cb(null, list);
        cb(null, list[0].address, list[0].family);
      },
      (err) => cb(err)
    );
  };
}

/**
 * A minimal fetch over node:http(s) that connects only through `guardedLookup` and stops reading past
 * `MAX_BYTES`. Redirects are not followed (`fetchFeed` checks each hop).
 */
export function guardedFetch(lookup = dns.lookup) {
  const resolve = guardedLookup(lookup);
  return (url, { signal, headers } = {}) =>
    new Promise((ok, fail) => {
      const u = new URL(url);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.get(u, { headers, signal, lookup: resolve }, (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > MAX_BYTES) return req.destroy(new Error("too large"));
          chunks.push(c);
        });
        res.on("error", fail);
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          ok({ ok: status >= 200 && status < 300, status, headers: { get: (k) => res.headers[k.toLowerCase()] ?? null }, text: async () => body });
        });
      });
      req.on("error", fail);
    });
}

/** Refuses a URL whose host resolves to a blocked address (every address the name has). */
async function checkTarget(url, lookup) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("not an http(s) link");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => blockedAddress(a.address))) throw new Error("address not allowed");
}

export const emptyCalendar = (configured = false) => ({ configured, events: [] });

/** The occurrences of the feeds (ICS texts) between an hour ago and 36 hours on, soonest first. */
export function upcoming(feeds, now) {
  const all = feeds.flatMap((text) => {
    try {
      return occurrences(parseIcs(text), now - BEHIND_MS, now + AHEAD_MS);
    } catch {
      return [];
    }
  });
  return all.sort((a, b) => a.start - b.start).slice(0, MAX_EVENTS);
}

/** The feed's text. Each hop (redirects are followed by hand, at most three) is checked first. */
export async function fetchFeed(url, fetchImpl, lookup = dns.lookup) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let target = url;
    let res;
    for (let hop = 0; ; hop++) {
      await checkTarget(target, lookup);
      res = await fetchImpl(target, { signal: controller.signal, redirect: "manual", headers: { Accept: "text/calendar, text/plain;q=0.8" } });
      const next = res.status >= 300 && res.status < 400 ? res.headers?.get?.("location") : null;
      if (!next) break;
      if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
      target = new URL(next, target).toString();
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("too large");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not a calendar");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The live calendar. `links()` returns [{ label, url }]; `onChange(state)` runs on each refresh.
 * A link that fails keeps its last good feed and reports the error.
 */
export function createCalendar({ links, onChange, lookup = dns.lookup, fetchImpl = guardedFetch(lookup), now = () => Date.now(), log = () => {} }) {
  let state = emptyCalendar();
  let timer = null;
  let generation = 0;
  const lastGood = new Map();

  const refresh = async () => {
    const mine = ++generation;
    const list = links();
    if (list.length === 0) {
      lastGood.clear();
      state = emptyCalendar(false);
      onChange(state);
      return;
    }
    for (const url of lastGood.keys()) if (!list.some((l) => l.url === url)) lastGood.delete(url);
    const errors = [];
    const feeds = await Promise.all(
      list.map(async (l) => {
        try {
          const text = await fetchFeed(l.url, fetchImpl, lookup);
          lastGood.set(l.url, text);
          return text;
        } catch (err) {
          errors.push(`${l.label || new URL(l.url).host}: ${err.message}`);
          log(`Calendar ${new URL(l.url).host}: ${err.message}`);
          return lastGood.get(l.url) ?? "";
        }
      })
    );
    if (mine !== generation) return;
    state = { configured: true, events: upcoming(feeds, now()), ...(errors.length ? { error: errors.join("; ") } : {}) };
    onChange(state);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await refresh();
      schedule();
    }, REFRESH_MS);
  };

  return {
    state: () => state,
    /** Fetch now (after the links change) and every REFRESH_MS. */
    async reconfigure() {
      await refresh();
      schedule();
    },
    stop() {
      generation++;
      clearTimeout(timer);
    },
  };
}
