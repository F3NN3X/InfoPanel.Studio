// Helpers for the request lists in this folder. A case is `{ label, run(api), where?, map? }`: `run` talks to one server
// through `api` and returns a transcript, which compare-servers.mjs normalises and compares between Node and native.
//   api.port, api.host            the server's port and a Host header for it
//   api.raw(text)                 sends the raw request, reads to the end of the answer (or 1.5 s)
//   api.open(text)                opens a stream; `read(ms)` waits then returns everything received so far, `close()`
//   where: "normal" (default), "debug" (DASHBOARD_DEBUG=1) or "lan" (bound to 0.0.0.0, asked on this machine's LAN
//          address, so the peer is not loopback)
//   map(transcript)               a reduction applied to both transcripts before they are compared

/** A case that sends one request. `head` is the request line plus any headers (no Host, no blank line). */
export const request = (head, body = null, extra = {}) => ({
  label: head.split("\r\n")[0],
  run: (api) => api.raw(`${head}\r\n${api.host}${body === null ? "" : `Content-Length: ${Buffer.byteLength(body)}\r\n`}Connection: close\r\n\r\n${body ?? ""}`),
  ...extra,
});

/** A request with no body. */
export const get = (path, extra) => request(`GET ${path} HTTP/1.1`, null, extra);

export const CONFIG_WRITE = "Content-Type: application/json\r\nX-Dashboard-Config: 1\r\n";
export const CONTROL_WRITE = "Content-Type: application/json\r\nX-Dashboard-Control: 1\r\n";

/** A write: `method path` with the given header lines and body. */
export const write = (method, path, headers, body, extra) => ({ ...request(`${method} ${path} HTTP/1.1\r\n${headers}`.replace(/\r\n$/, ""), body, extra), label: `${method} ${path} ${body.slice(0, 40)}` });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
