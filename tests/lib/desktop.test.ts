import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));
const win = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(async () => true),
  onResized: vi.fn(async () => () => {}),
};
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));

import {
  closeWindow,
  minimizeWindow,
  onMaximizedChange,
  toggleMaximizeWindow,
  collectMetrics,
  createRateLimiter,
  flushDone,
  getDebug,
  isTauri,
  onStudioFlush,
  openSettings,
  openTextFile,
  saveBinaryFile,
  saveTextFile,
} from "@/lib/desktop";

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
  listen.mockReset();
});

describe("isTauri", () => {
  it("is false without a window and in a plain browser", () => {
    expect(isTauri()).toBe(false);
    vi.stubGlobal("window", {});
    expect(isTauri()).toBe(false);
  });

  it("is true when the Tauri internals are present", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(isTauri()).toBe(true);
  });
});

describe("wrappers in a browser", () => {
  it("do nothing and load no Tauri code", async () => {
    vi.stubGlobal("window", {});
    await openSettings();
    await flushDone();
    expect(await saveTextFile("a.json", "{}")).toBe(false);
    expect(await openTextFile()).toBeNull();
    expect(await saveBinaryFile("a.zip", "zip", new Uint8Array())).toBe(false);
    expect(await getDebug()).toBe(false);
    const off = await onStudioFlush(() => {});
    off();
    expect(invoke).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });
});

describe("wrappers in the desktop app", () => {
  it("invoke the named commands with their arguments", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    invoke.mockResolvedValueOnce(true).mockResolvedValueOnce("text").mockResolvedValueOnce(true);
    expect(await saveTextFile("a.json", "{}")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("save_text_file", { defaultName: "a.json", contents: "{}" });
    expect(await openTextFile()).toBe("text");
    expect(invoke).toHaveBeenLastCalledWith("open_text_file", undefined);
    expect(await getDebug()).toBe(true);
    await flushDone();
    expect(invoke).toHaveBeenLastCalledWith("flush_done", undefined);
  });

  it("sends binary saves as the raw body with the name and kind in headers", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const bytes = new Uint8Array([1, 2]);
    invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await saveBinaryFile("a.canvas.zip", "zip", bytes)).toBe(true);
    expect(invoke).toHaveBeenCalledWith("save_binary_file", bytes, {
      headers: { "x-file-name": "a.canvas.zip", "x-file-ext": "zip" },
    });
    expect(await saveBinaryFile("a.infopanel", "infopanel", bytes)).toBe(false);
  });

  it("listens for the flush event and returns the unsubscribe", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const handler = vi.fn();
    const off = await onStudioFlush(handler);
    expect(listen).toHaveBeenCalledWith("studio://flush", handler);
    expect(off).toBe(unlisten);
  });
});

describe("createRateLimiter", () => {
  it("allows the limit per window, drops the rest, then reports what it suppressed", () => {
    let t = 0;
    const next = createRateLimiter(3, 1000, () => t);
    const sent = Array.from({ length: 5 }, () => next().send);
    expect(sent).toEqual([true, true, true, false, false]);
    t = 1000;
    expect(next()).toEqual({ send: true, suppressed: 2 });
    expect(next().suppressed).toBe(0);
  });

  it("reports nothing when the window stayed under the limit", () => {
    let t = 0;
    const next = createRateLimiter(3, 1000, () => t);
    next();
    t = 5000;
    expect(next()).toEqual({ send: true, suppressed: 0 });
  });
});

describe("collectMetrics", () => {
  it("has the report_metrics sample shape", () => {
    vi.stubGlobal("window", { location: { href: "http://127.0.0.1:3921/?studio=1" } });
    vi.stubGlobal("document", { getElementsByTagName: () => ({ length: 42 }) });
    vi.stubGlobal("performance", { memory: { usedJSHeapSize: 10, totalJSHeapSize: 20 } });
    const sample = collectMetrics(3);
    expect(Object.keys(sample).sort()).toEqual(["domNodes", "eventSources", "jsHeapTotal", "jsHeapUsed", "ts", "url"]);
    expect(sample).toMatchObject({
      jsHeapUsed: 10,
      jsHeapTotal: 20,
      domNodes: 42,
      eventSources: 3,
      url: "http://127.0.0.1:3921/?studio=1",
    });
    expect(typeof sample.ts).toBe("number");
  });

  it("leaves the heap null without performance.memory", () => {
    vi.stubGlobal("window", { location: { href: "x" } });
    vi.stubGlobal("document", { getElementsByTagName: () => ({ length: 1 }) });
    vi.stubGlobal("performance", {});
    expect(collectMetrics(0)).toMatchObject({ jsHeapUsed: null, jsHeapTotal: null });
  });
});

describe("window controls", () => {
  it("do nothing in a browser", async () => {
    await minimizeWindow();
    await toggleMaximizeWindow();
    await closeWindow();
    const handler = vi.fn();
    (await onMaximizedChange(handler))();
    expect(win.minimize).not.toHaveBeenCalled();
    expect(win.close).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("drive the current window in the app and report the maximized state", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    await minimizeWindow();
    await toggleMaximizeWindow();
    await closeWindow();
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    expect(win.close).toHaveBeenCalledOnce();
    const handler = vi.fn();
    await onMaximizedChange(handler);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(true));
    expect(win.onResized).toHaveBeenCalledOnce();
  });
});
