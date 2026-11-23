// The adversarial pack script (tests/e2e/pack-script.spec.ts): every reach for the outside world, each in its own try, then a
// frame that never returns. LISTENER is replaced by the spec with a local server's address; nothing may arrive there.
const url = "LISTENER";
const reached = [];
const attempt = (name, fn) => {
  try {
    fn();
    reached.push(name);
  } catch {}
};
attempt("fetch", () => fetch(`${url}/fetch`));
attempt("WebSocket", () => new WebSocket(`${url.replace("http", "ws")}/ws`));
attempt("importScripts", () => importScripts(`${url}/import.js`));
attempt("indexedDB", () => indexedDB.open("x"));
attempt("BroadcastChannel", () => new BroadcastChannel("infopanel-studio").postMessage({ type: "replaced" }));
attempt("__TAURI__", () => __TAURI__.core.invoke("save_text_file", {}));
attempt("location", () => {
  location.href = `${url}/navigate`;
});
attempt("location=", () => {
  // biome-ignore lint/suspicious/noGlobalAssign: the navigation a page script would try
  location = `${url}/assign`;
});
attempt("postMessage", () => postMessage({ type: "end", reason: "forged" }));
attempt("constructor", () => fx.onFrame.constructor("return fetch")()(`${url}/ctor`));
fx.onFrame(() => {
  // anything it reached would show as a rect; then the frame never returns, until the interrupt ends it
  fx.draw([{ op: "rect", x: 0, y: 0, w: reached.length * 10, h: 10, fill: 0 }]);
  for (;;) {}
});
