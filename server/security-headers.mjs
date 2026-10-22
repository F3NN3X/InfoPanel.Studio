// Response headers of server.mjs's static files (the studio, Settings and kiosk pages, which run with
// the desktop app's IPC on this origin). Pure; exported for the tests.
//
// The scripts are all same-origin files (the build has no inline <script>). The rest is as wide as the
// features need: the Data API (user-set http(s) URL, often a LAN host), cover art and backgrounds from
// user-entered URLs, Google Fonts, the Web Page widget's frames, and the shell's IPC (`ipc:` and
// `http://ipc.localhost`, which `http:` covers).

// Framing: the Studio and Settings pages (`?studio`, `?settings`) may be framed by their own origin only.
// Kiosk pages stay embeddable (a Home Assistant iframe, a Web Page widget pointing at another Studio).
const FRAME_SELF = "frame-ancestors 'self'";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: blob: https:",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' blob: http: https:",
  "connect-src 'self' http: https: ws: wss: ipc:",
  "frame-src 'self' blob: http: https:",
];

/** Whether the page asked for is the Studio or Settings (`?studio`, `?settings`), which no other site may frame. */
export function isEditorPage(search) {
  const params = new URLSearchParams(search);
  return params.has("studio") || params.has("settings");
}

/**
 * The security headers for a static response; the policy goes on HTML only. A page keeps its origin as the
 * referrer: YouTube refuses to play in a Web Page widget's frame without one.
 */
export function securityHeaders(isHtml, search = "") {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": isHtml ? "strict-origin-when-cross-origin" : "no-referrer",
    ...(isHtml && { "Content-Security-Policy": (isEditorPage(search) ? [...CSP, FRAME_SELF] : CSP).join("; ") }),
  };
}
