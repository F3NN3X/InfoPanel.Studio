// Shared helpers for the local pages (window.__TAURI__ comes from withGlobalTauri).
"use strict";

const tauri = window.__TAURI__;

/** Calls a Rust command; rejects with its error text. */
function call(command, args) {
  return tauri.core.invoke(command, args);
}

/** Runs `handler(status)` on every server status change; resolves to the unsubscribe. */
function onStatus(handler) {
  return tauri.event.listen("server-status", (e) => handler(e.payload));
}

// No native webview menu (Back, Reload, Inspect…) except in text fields, which keep cut / copy / paste.
document.addEventListener("contextmenu", (e) => {
  const t = e.target;
  const types = ["", "text", "search", "url", "email", "password", "tel", "number"];
  const text =
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && types.includes((t.getAttribute("type") ?? "").toLowerCase())) ||
    (t instanceof HTMLElement && t.isContentEditable);
  if (!text) e.preventDefault();
});

const $ = (id) => document.getElementById(id);

function show(el, visible) {
  el.classList.toggle("hidden", !visible);
}

/** An element with text, for building lists without innerHTML. */
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** An SVG element with attributes (no innerHTML: the CSP and the rest of the pages build DOM). */
function svg(tag, attrs, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

/** The studio mark (public/favicon.svg): an accent tile holding a small dashboard grid. */
function logo() {
  return svg("svg", { viewBox: "0 0 26 26", class: "titlebar-logo", "aria-hidden": "true" }, [
    svg("rect", { width: 26, height: 26, rx: 7, fill: "var(--accent)" }),
    svg("rect", { x: 6, y: 6, width: 14, height: 6, rx: 1.5, fill: "#fff" }),
    svg("rect", { x: 6, y: 14, width: 6, height: 6, rx: 1.5, fill: "#fff" }),
    svg("rect", { x: 14, y: 14, width: 6, height: 6, rx: 1.5, fill: "#fff", "fill-opacity": ".55" }),
  ]);
}

/** A 10 px Windows-style caption glyph. */
function glyph(kind) {
  const line = { fill: "none", stroke: "currentColor", "stroke-width": 1 };
  const shapes = {
    minimize: [svg("path", { d: "M0 5.5h10", ...line })],
    maximize: [svg("rect", { x: 0.5, y: 0.5, width: 9, height: 9, ...line })],
    restore: [
      svg("rect", { x: 0.5, y: 2.5, width: 7, height: 7, ...line }),
      svg("path", { d: "M2.5 2.5V0.5h7v7h-2", ...line }),
    ],
    close: [svg("path", { d: "M0.5 0.5l9 9M9.5 0.5l-9 9", ...line })],
  };
  return svg("svg", { viewBox: "0 0 10 10", width: 10, height: 10, "aria-hidden": "true" }, shapes[kind]);
}

/** The window's own title bar (the window has no native frame): logo, title, caption buttons. */
function titlebar() {
  const win = tauri.window.getCurrentWindow();
  const bar = el("div", undefined, "titlebar");
  bar.setAttribute("data-tauri-drag-region", "");
  const title = el("span", document.title, "titlebar-title");
  title.setAttribute("data-tauri-drag-region", "");
  const button = (label, kind, onClick, extra = "") => {
    const b = el("button", undefined, `caption ${extra}`.trim());
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(glyph(kind));
    b.addEventListener("click", onClick);
    return b;
  };
  const max = button("Maximize", "maximize", () => win.toggleMaximize());
  const sync = async () => {
    const maximized = await win.isMaximized();
    max.title = maximized ? "Restore" : "Maximize";
    max.setAttribute("aria-label", max.title);
    max.replaceChildren(glyph(maximized ? "restore" : "maximize"));
  };
  void sync();
  void win.onResized(() => void sync());
  const controls = el("div", undefined, "captions");
  controls.append(
    button("Minimize", "minimize", () => win.minimize()),
    max,
    button("Close", "close", () => win.close(), "close")
  );
  bar.append(logo(), title, controls);
  document.body.prepend(bar);
}

titlebar();
