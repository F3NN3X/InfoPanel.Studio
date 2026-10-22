// Request gate for server.mjs, applied before any routing.
//
// - Host allowlist (DNS rebinding defence): a rebound page still sends its
//   own name in `Host`, so a Host whose hostname is not allowed is refused
//   for every route. Allowed: localhost, 127.0.0.1, [::1] (any port, so the
//   Vite dev proxy on :5173 works), the configured HOST, and the names in
//   ALLOWED_HOSTS. When HOST listens on all interfaces (0.0.0.0 / ::), any
//   IP literal and this machine's hostname are allowed too (LAN clients).
// - Cross-site writes: for POST/PUT/PATCH/DELETE an `Origin` that is not the
//   request's own host, or a `Sec-Fetch-Site` other than same-origin / none,
//   is refused.
//
// Node built-ins only. Pure; exported for the tests.

import net from "node:net";

const LOOPBACK_NAMES = ["localhost", "127.0.0.1", "[::1]"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The lowercase hostname (IPv6 keeps its brackets) of a Host header or origin host, or null. */
export function hostnameOf(value) {
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d+)?$/i.exec(String(value ?? "").trim());
  return m ? m[1].toLowerCase() : null;
}

const isIpLiteral = (hostname) => net.isIP(hostname.replace(/^\[|\]$/g, "")) !== 0;

function normalizeName(name) {
  const h = hostnameOf(name);
  if (!h) return null;
  return net.isIPv6(h) ? `[${h}]` : h;
}

/**
 * A guard `(req) => null | { status, message }` for the given listen
 * address, extra allowed names (array) and this machine's name.
 */
export function createRequestGuard({ host, allowedHosts = [], machineName = "" }) {
  const allExposed = host === "0.0.0.0" || host === "::";
  const names = new Set(LOOPBACK_NAMES);
  for (const n of [host, ...allowedHosts]) {
    const normalized = normalizeName(n);
    if (normalized) names.add(normalized);
  }
  if (allExposed && machineName) names.add(machineName.toLowerCase());

  const hostAllowed = (hostname) => names.has(hostname) || (allExposed && isIpLiteral(hostname));

  return function check(req) {
    const hostHeader = req.headers.host;
    const hostname = hostnameOf(hostHeader);
    if (!hostname || !hostAllowed(hostname)) return { status: 421, message: "host not allowed" };

    if (!WRITE_METHODS.has(req.method)) return null;

    const site = req.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin" && site !== "none") {
      return { status: 403, message: "cross-site request refused" };
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let originHost = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // "null" and other opaque origins fall through to the refusal.
      }
      if (!originHost) return { status: 403, message: "origin not allowed" };
      const sameHost = originHost.toLowerCase() === String(hostHeader).trim().toLowerCase();
      // A dev proxy may rewrite Host but not Origin: two loopback names are the same machine.
      const bothLoopback = LOOPBACK_NAMES.includes(hostnameOf(originHost)) && LOOPBACK_NAMES.includes(hostname);
      if (!sameHost && !bothLoopback) return { status: 403, message: "origin not allowed" };
    }
    return null;
  };
}

/** The names of a comma-separated ALLOWED_HOSTS value. */
export function parseAllowedHosts(value) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The reason POST /api/config is refused (status and message), or null. */
export function configWriteRefusal(headers) {
  const type = String(headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { status: 415, message: "expected application/json" };
  if (headers["x-dashboard-config"] !== "1") return { status: 403, message: "missing X-Dashboard-Config header" };
  return null;
}

/**
 * The reason a POST /api/control/* is refused, or null. The custom header keeps a cross-site form from
 * switching pages (a simple request can't set it); the Stream Deck plugin sends it.
 */
export function controlWriteRefusal(headers) {
  const type = String(headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { status: 415, message: "expected application/json" };
  if (headers["x-dashboard-control"] !== "1") return { status: 403, message: "missing X-Dashboard-Control header" };
  return null;
}

/**
 * The reason a config or integrations write is refused, or null: only this machine edits unless
 * ALLOW_REMOTE_EDIT=1. Kiosk reads and /api/control stay open to the network.
 */
export function remoteEditRefusal(remoteAddress, env = process.env) {
  if (env.ALLOW_REMOTE_EDIT === "1" || isLoopback(remoteAddress)) return null;
  return { status: 403, message: "Editing from other devices is off. Turn it on in Settings > Server on the PC running InfoPanel Studio." };
}

/** Whether a socket address is this machine (IPv4, IPv6, or IPv4 inside IPv6). */
export const isLoopback = (address) => /^(127\.|::1$|::ffff:127\.)/.test(String(address ?? ""));

/**
 * The reason a POST /api/agents/* is refused, or null. Only this machine's agents post (their hooks
 * run here), and the custom header keeps a web page from faking a session (a simple request can't set it).
 */
export function agentWriteRefusal(headers, remoteAddress) {
  if (!isLoopback(remoteAddress)) return { status: 403, message: "agent status is accepted from this machine only" };
  const type = String(headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { status: 415, message: "expected application/json" };
  if (headers["x-agent-event"] !== "1") return { status: 403, message: "missing X-Agent-Event header" };
  return null;
}
